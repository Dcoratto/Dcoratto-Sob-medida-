alter table public.operational_visit_pieces
  add column corrected_at timestamptz,
  add column correction_reason text,
  add column corrected_by_uid uuid,
  add constraint operational_visit_piece_correction_reason
    check (correction_reason is null or (length(btrim(correction_reason)) between 1 and 2000 and correction_reason !~ '[<>]')),
  add constraint operational_visit_piece_correction_pair
    check ((corrected_at is null) = (correction_reason is null));

create or replace function app_private.operational_validate_stage_transition() returns trigger
language plpgsql set search_path='' as $$
declare
  flow constant text[] := array['sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed','aftercare'];
  from_index integer;
  to_index integer;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  from_index := array_position(flow, old.stage);
  to_index := array_position(flow, new.stage);
  if from_index is null or to_index is null or to_index > from_index + 1 then
    raise exception 'Avance uma etapa por vez no fluxo operacional';
  end if;
  return new;
end $$;

drop trigger if exists operational_contract_stage_transition on public.operational_contracts;
create trigger operational_contract_stage_transition before update of stage on public.operational_contracts
for each row execute function app_private.operational_validate_stage_transition();

create or replace function app_private.operational_detail(p_contract_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare card jsonb; result jsonb;
begin
  select to_jsonb(c) into card from app_private.operational_cards() c where c.contract_id=p_contract_id;
  if card is null then raise exception 'Contrato indisponivel'; end if;
  select jsonb_build_object('card',card,'drive_url',cl.google_drive_url,
    'settings',(select to_jsonb(s)-'empresa_id'-'updated_at' from public.operational_settings s where s.empresa_id=c.empresa_id),
    'pieces',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'label',p.piece_label,'stage',coalesce(op.stage,'sold'),'installed',op.installed_at is not null,'installed_at',op.installed_at) order by p.sort_order,p.id) from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.deleted_at is null),'[]'::jsonb),
    'dependencies',coalesce((select jsonb_agg(to_jsonb(d)-'empresa_id'-'contract_id') from public.operational_dependencies d where d.contract_id=c.id),'[]'::jsonb),
    'blocks',coalesce((select jsonb_agg(to_jsonb(b)-'empresa_id'-'contract_id' order by started_at desc) from public.operational_blocks b where b.contract_id=c.id),'[]'::jsonb),
    'slas',coalesce((select jsonb_agg(to_jsonb(s)-'empresa_id'-'contract_id') from public.operational_slas s where s.contract_id=c.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)-'empresa_id'-'contract_id' order by created_at desc,id desc) from (select id,kind,payload,actor_name,created_at from public.operational_events where contract_id=c.id order by created_at desc,id desc limit 200) e),'[]'::jsonb),
    'schedules',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'operational_kind',e.operational_kind,'date_key',e.date_key,'event_time',e.event_time,'status',e.status) order by e.date_key) from public.calendar_events e where e.operational_contract_id=c.id),'[]'::jsonb),
    'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'calendar_event_id',v.calendar_event_id,'completed_at',v.completed_at,'piece_count',(select count(*) from public.operational_visit_pieces vp where vp.visit_id=v.id and vp.corrected_at is null),'corrected_count',(select count(*) from public.operational_visit_pieces vp where vp.visit_id=v.id and vp.corrected_at is not null)) order by v.completed_at desc) from public.operational_visits v where v.contract_id=c.id),'[]'::jsonb),
    'aftercare',coalesce((select jsonb_agg((to_jsonb(a)-'empresa_id'-'contract_id')||jsonb_build_object('piece_ids',coalesce((select jsonb_agg(ap.piece_id) from public.operational_aftercare_pieces ap where ap.aftercare_id=a.id),'[]'::jsonb)) order by a.opened_at desc) from public.operational_aftercare a where a.contract_id=c.id),'[]'::jsonb)) into result
  from public.client_contracts c join public.clients cl on cl.id=c.client_id where c.id=p_contract_id and c.empresa_id=app_private.current_empresa_id();
  return result;
end $$;

create function app_private.operational_installation_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  tenant text:=app_private.current_empresa_id();
  c public.client_contracts;
  o public.operational_contracts;
  client public.clients;
  ev public.calendar_events;
  ids text[];
  piece text:=p_payload->>'piece_id';
  reason text:=btrim(coalesce(p_payload->>'reason',''));
  note text:=btrim(coalesce(p_payload->>'note',''));
  day date;
  clock text;
  v_visit_id text;
  visit_piece public.operational_visit_pieces;
  now_local timestamptz:=clock_timestamp();
begin
  if auth.uid() is null or tenant is null or octet_length(p_payload::text)>20000 or not app_private.operational_permission('editar') then raise exception 'Sem permissao'; end if;
  if length(reason)>2000 or length(note)>2000 or reason~'[<>]' or note~'[<>]' then raise exception 'Texto invalido (maximo 2000 caracteres, sem HTML)'; end if;
  select * into c from public.client_contracts where id=p_contract_id and empresa_id=tenant and deleted_at is null and status='active' and review_status='confirmed' for update;
  if c.id is null then raise exception 'Contrato indisponivel'; end if;
  select * into o from public.operational_contracts where contract_id=c.id for update;
  if o.contract_id is null or o.version<>p_version then raise exception 'Contrato alterado por outra operacao. Atualize o painel.' using errcode='40001'; end if;
  if o.stage<>'installation' then raise exception 'Registre instalacoes somente na etapa Instalacao'; end if;

  if p_action='install_pieces' then
    if jsonb_typeof(coalesce(p_payload->'piece_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'piece_ids','[]'::jsonb)) not between 1 and 500 then raise exception 'Selecione as pecas instaladas'; end if;
    select coalesce(array_agg(distinct value),'{}'::text[]) into ids from jsonb_array_elements_text(p_payload->'piece_ids');
    if exists(select 1 from unnest(ids) id where not exists(select 1 from public.client_contract_pieces p where p.id=id and p.contract_id=c.id and p.empresa_id=tenant and p.deleted_at is null)) then raise exception 'Pecas invalidas'; end if;
    if exists(select 1 from public.operational_dependencies d where d.piece_id=any(ids) and d.contract_id=c.id and d.released_at is null) then raise exception 'Pecas selecionadas ainda possuem dependencias'; end if;
    if exists(select 1 from public.operational_pieces p where p.piece_id=any(ids) and p.installed_at is not null) then raise exception 'Peca ja instalada'; end if;
    select * into client from public.clients where id=c.client_id and empresa_id=tenant;
    if nullif(p_payload->>'event_id','') is not null then
      select * into ev from public.calendar_events where id=p_payload->>'event_id' and operational_contract_id=c.id and operational_kind='installation' and empresa_id=tenant for update;
      if ev.id is null or ev.status='completed' or ev.date_key::date>(now_local at time zone 'America/Sao_Paulo')::date then raise exception 'Visita indisponivel ou futura'; end if;
      day:=ev.date_key::date; clock:=ev.event_time;
    else
      day:=coalesce((p_payload->>'date')::date,(now_local at time zone 'America/Sao_Paulo')::date);
      clock:=nullif(p_payload->>'time','');
      if day<date '2000-01-01' or day>(now_local at time zone 'America/Sao_Paulo')::date or (clock is not null and clock!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Informe data/horario validos para a visita'; end if;
      ev.id:=app_private.make_entity_id();
      insert into public.calendar_events(id,empresa_id,operational_contract_id,operational_kind,title,date,date_key,event_time,client_id,client_name,city,source_type,status,created_by_uid,all_day)
      values(ev.id,tenant,c.id,'installation','Instalação · '||c.contract_number,(day+coalesce(clock::time,time '12:00')) at time zone 'America/Sao_Paulo',day::text,clock,c.client_id,client.name,client.city,'operacional','completed',auth.uid()::text,clock is null);
    end if;
    insert into public.operational_visits(contract_id,empresa_id,calendar_event_id,completed_at) values(c.id,tenant,ev.id,now_local) returning id into v_visit_id;
    insert into public.operational_visit_pieces(visit_id,piece_id,contract_id,empresa_id) select v_visit_id,id,c.id,tenant from unnest(ids) id;
    insert into public.operational_pieces(piece_id,contract_id,empresa_id,stage,installed_at) select id,c.id,tenant,'installation',now_local from unnest(ids) id on conflict(piece_id) do update set installed_at=excluded.installed_at,stage='installation',updated_at=now();
    update public.calendar_events set status='completed',updated_at=now() where id=ev.id;
    if not exists(select 1 from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.deleted_at is null and op.installed_at is null) then update public.operational_slas set closed_at=now() where contract_id=c.id and kind='installation'; end if;
    p_payload:=p_payload||jsonb_build_object('visit_id',v_visit_id,'piece_count',cardinality(ids),'date',day,'time',clock,'note',note);
  elsif p_action='correct_installation' then
    if length(reason)=0 then raise exception 'Informe o motivo da correcao'; end if;
    if not exists(select 1 from public.client_contract_pieces p where p.id=piece and p.contract_id=c.id and p.empresa_id=tenant and p.deleted_at is null) then raise exception 'Peca indisponivel'; end if;
    select vp.* into visit_piece from public.operational_visit_pieces vp join public.operational_visits v on v.id=vp.visit_id where vp.piece_id=piece and vp.contract_id=c.id and vp.corrected_at is null order by v.completed_at desc limit 1 for update of vp;
    if visit_piece.piece_id is null or not exists(select 1 from public.operational_pieces where piece_id=piece and installed_at is not null) then raise exception 'Instalacao nao encontrada'; end if;
    update public.operational_visit_pieces set corrected_at=now_local,correction_reason=reason,corrected_by_uid=auth.uid() where visit_id=visit_piece.visit_id and piece_id=piece;
    update public.operational_pieces set installed_at=null,stage='installation',updated_at=now() where piece_id=piece and contract_id=c.id;
    update public.operational_slas set closed_at=null where contract_id=c.id and kind='installation';
    p_payload:=jsonb_build_object('piece_id',piece,'visit_id',visit_piece.visit_id,'reason',reason);
  else
    raise exception 'Acao invalida';
  end if;
  update public.operational_contracts set version=version+1,updated_at=now() where contract_id=c.id;
  insert into public.operational_events(empresa_id,contract_id,kind,payload,actor_uid,actor_name)
  values(tenant,c.id,p_action,p_payload,auth.uid(),coalesce((select coalesce(u.nome,u.name,u.email) from public.users u where u.auth_user_id=auth.uid() or u.id=auth.uid()::text order by u.updated_at desc nulls last limit 1),'Usuario'));
  return app_private.operational_detail(c.id);
end $$;

create or replace function public.operational_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  flow constant text[] := array['sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed','aftercare'];
  current_stage text;
begin
  if p_action in ('install_pieces','correct_installation') then
    return app_private.operational_installation_mutate(p_contract_id,p_version,p_action,p_payload);
  end if;
  if p_action='move' then
    select stage into current_stage from public.operational_contracts where contract_id=p_contract_id and empresa_id=app_private.current_empresa_id();
    current_stage:=coalesce(current_stage,'sold');
    if array_position(flow,p_payload->>'stage') < array_position(flow,current_stage) and length(btrim(coalesce(p_payload->>'reason','')))=0 then
      raise exception 'Informe o motivo do retorno de etapa';
    end if;
  end if;
  return app_private.operational_mutate(p_contract_id,p_version,p_action,p_payload);
end $$;

revoke all on function app_private.operational_installation_mutate(text,integer,text,jsonb) from public,anon;
grant execute on function app_private.operational_installation_mutate(text,integer,text,jsonb) to authenticated;
revoke all on function app_private.operational_validate_stage_transition() from public,anon,authenticated;
