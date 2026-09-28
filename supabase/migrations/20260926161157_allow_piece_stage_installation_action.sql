create or replace function app_private.operational_installation_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb
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

  if p_action='install_pieces' then
    if jsonb_typeof(coalesce(p_payload->'piece_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'piece_ids','[]'::jsonb)) not between 1 and 500 then raise exception 'Selecione as pecas instaladas'; end if;
    select coalesce(array_agg(distinct value),'{}'::text[]) into ids from jsonb_array_elements_text(p_payload->'piece_ids');
    if exists(select 1 from unnest(ids) id where not exists(select 1 from public.client_contract_pieces p where p.id=id and p.contract_id=c.id and p.empresa_id=tenant and p.deleted_at is null)) then raise exception 'Pecas invalidas'; end if;
    if o.stage<>'installation' and exists(select 1 from unnest(ids) id left join public.operational_pieces op on op.piece_id=id and op.contract_id=c.id where coalesce(op.stage,'sold')<>'installation') then raise exception 'Registre instalacoes somente em pecas na etapa Instalacao'; end if;
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
    if o.stage<>'installation' and not exists(select 1 from public.operational_pieces op where op.piece_id=piece and op.contract_id=c.id and op.stage='installation') then raise exception 'Corrija instalacoes somente em pecas na etapa Instalacao'; end if;
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

revoke all on function app_private.operational_installation_mutate(text,integer,text,jsonb) from public,anon;
grant execute on function app_private.operational_installation_mutate(text,integer,text,jsonb) to authenticated;
