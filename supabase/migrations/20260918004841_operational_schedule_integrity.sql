-- Clock time preserves audit order even when a concurrent request waited on the contract lock.
alter table public.operational_events alter column created_at set default clock_timestamp();
create or replace function app_private.operational_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant text:=app_private.current_empresa_id(); c public.client_contracts; o public.operational_contracts; cfg public.operational_settings; client public.clients; ev public.calendar_events; bl public.operational_blocks;
  target text; note text:=btrim(coalesce(p_payload->>'note','')); reason text:=btrim(coalesce(p_payload->>'reason','')); v_entity_id text; piece text; ids text[]; day date; clock text; budget int; due date; today date:=(now() at time zone 'America/Sao_Paulo')::date; payload jsonb:=p_payload; action_permission text:='editar';
begin
  if auth.uid() is null or tenant is null or octet_length(p_payload::text)>20000 then raise exception 'Operacao invalida'; end if;
  if p_action='move' and p_payload->>'stage'='ready' then action_permission:='aprovar'; end if;
  if not app_private.operational_permission(action_permission) then raise exception 'Sem permissao'; end if;
  select * into c from public.client_contracts where id=p_contract_id and empresa_id=tenant and deleted_at is null and status='active' and review_status='confirmed' for update;
  if c.id is null or not exists(select 1 from public.client_contract_pieces where contract_id=c.id and empresa_id=tenant and deleted_at is null) then raise exception 'Contrato indisponivel'; end if;
  if length(note)>2000 or length(reason)>2000 or note~'[<>]' or reason~'[<>]' then raise exception 'Texto invalido (maximo 2000 caracteres, sem HTML)'; end if;
  select * into client from public.clients where id=c.client_id and empresa_id=tenant;
  insert into public.operational_settings(empresa_id) values(tenant) on conflict do nothing;
  select * into cfg from public.operational_settings where empresa_id=tenant;
  insert into public.operational_contracts(contract_id,empresa_id) values(c.id,tenant) on conflict do nothing;
  select * into o from public.operational_contracts where contract_id=c.id for update;
  if p_version is null or o.version<>p_version then raise exception 'Contrato alterado por outra operacao. Atualize o painel.' using errcode='40001'; end if;

  if p_action in ('piece','dependency') then
    piece:=p_payload->>'piece_id';
    if not exists(select 1 from public.client_contract_pieces where id=piece and contract_id=c.id and empresa_id=tenant and deleted_at is null) then raise exception 'Peca indisponivel'; end if;
  end if;
  if p_action in ('visit','aftercare_open') then
    if jsonb_typeof(coalesce(p_payload->'piece_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'piece_ids','[]'::jsonb))>500 then raise exception 'Pecas invalidas'; end if;
    select coalesce(array_agg(distinct value),'{}'::text[]) into ids from jsonb_array_elements_text(coalesce(p_payload->'piece_ids','[]'::jsonb));
    if exists(select 1 from unnest(ids) p where not exists(select 1 from public.client_contract_pieces cp where cp.id=p and cp.contract_id=c.id and cp.empresa_id=tenant and cp.deleted_at is null)) then raise exception 'Pecas invalidas'; end if;
  end if;

  if p_action in ('schedule','move') and (p_action='schedule' or p_payload->>'stage' in ('measurement','installation')) then
    target:=case when p_action='schedule' then p_payload->>'kind' else p_payload->>'stage' end;
    if target not in ('measurement','installation') or target is null then raise exception 'Agendamento invalido'; end if;
    day:=(p_payload->>'date')::date; clock:=nullif(p_payload->>'time','');
    if day is null or day<date '2000-01-01' or day>today+3650 or (clock is not null and clock!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Informe data/horario validos'; end if;
    if target='measurement' then select * into ev from public.calendar_events where operational_contract_id=c.id and operational_kind=target;
    elsif nullif(p_payload->>'event_id','') is not null then
      select * into ev from public.calendar_events where id=p_payload->>'event_id' and operational_contract_id=c.id and operational_kind=target;
      if ev.id is null then raise exception 'Compromisso indisponivel'; end if;
    end if;
    if target='installation' and p_action='move' and ev.id is null then
      select * into ev from public.calendar_events where operational_contract_id=c.id and operational_kind=target and status is distinct from 'completed' order by date_key,id limit 1;
    end if;
    if ev.status='completed' then raise exception 'Visita concluida nao pode ser reagendada'; end if;
    if ev.id is not null and (ev.date_key is distinct from day::text or ev.event_time is distinct from clock) and length(reason)=0 then raise exception 'Motivo obrigatorio para reagendamento'; end if;
    if target='installation' then
      if exists(select 1 from public.operational_dependencies d join public.client_contract_pieces p on p.id=d.piece_id and p.deleted_at is null where d.contract_id=c.id and d.released_at is null) and coalesce((p_payload->>'confirm_warning')::boolean,false) is not true then raise exception 'Confirme o agendamento com pecas dependentes'; end if;
      select due_date into due from public.operational_slas where contract_id=c.id and kind='installation';
      if day>due and coalesce((p_payload->>'confirm_warning')::boolean,false) is not true then raise exception 'Confirme a instalacao apos o prazo previsto'; end if;
    end if;
    payload:=payload||jsonb_build_object('kind',target,'previous_date',ev.date_key,'previous_time',ev.event_time,'date',day,'time',clock,'outside_deadline',coalesce(day>due,false));
    v_entity_id:=coalesce(ev.id,app_private.make_entity_id());
    insert into public.calendar_events(id,empresa_id,operational_contract_id,operational_kind,title,date,date_key,event_time,client_id,client_name,city,source_type,status,created_by_uid)
    values(v_entity_id,tenant,c.id,target,(case target when 'measurement' then 'Medição' else 'Instalação' end)||' · '||c.contract_number,(day+coalesce(clock::time,time '12:00')) at time zone 'America/Sao_Paulo',day::text,clock,c.client_id,client.name,client.city,'operacional','scheduled',auth.uid()::text)
    on conflict(id) do update set date=excluded.date,date_key=excluded.date_key,event_time=excluded.event_time,updated_at=now();
  end if;

  if p_action='schedule' and o.stage='completed' then raise exception 'Reabra pelo fluxo de pos-instalacao'; end if;
  case p_action
  when 'move' then
    target:=p_payload->>'stage';
    if target is null or target not in ('sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed') then raise exception 'Etapa invalida'; end if;
    if o.stage='aftercare' then raise exception 'Resolva as ocorrencias de pos-instalacao'; end if;
    if exists(select 1 from public.operational_blocks where contract_id=c.id and ended_at is null) then raise exception 'Desbloqueie o contrato antes de movimentar'; end if;
    if target='ready' and (coalesce((p_payload->>'approved')::boolean,false) is not true or coalesce((p_payload->>'measures_checked')::boolean,false) is not true) then raise exception 'Confirme aprovacao e conferencia das medidas'; end if;
    if target='cutting' and coalesce((p_payload->>'production_released')::boolean,false) is not true then raise exception 'Confirme liberacao para producao'; end if;
    if target='delivery' and coalesce((p_payload->>'inspection_done')::boolean,false) is not true then raise exception 'Confirme conferencia para entrega'; end if;
    if target in ('delivery','completed') and exists(select 1 from public.operational_dependencies d join public.client_contract_pieces p on p.id=d.piece_id and p.deleted_at is null where d.contract_id=c.id and d.released_at is null) then raise exception 'Resolva as dependencias impeditivas'; end if;
    if target='completed' and (o.stage<>'installation' or exists(select 1 from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.deleted_at is null and op.installed_at is null) or not exists(select 1 from public.operational_visits where contract_id=c.id)) then raise exception 'Registre todas as pecas instaladas antes de finalizar'; end if;
    if o.stage='completed' and target<>'completed' then raise exception 'Reabra pelo fluxo de pos-instalacao'; end if;
    if target in ('executive','ready') then
      budget:=case target when 'executive' then cfg.executive_days else cfg.installation_days end;
      due:=app_private.operational_add_days(today,budget,client.city);
      insert into public.operational_slas(contract_id,empresa_id,kind,started_on,budget_days,original_due,due_date) values(c.id,tenant,case target when 'executive' then 'executive' else 'installation' end,today,budget,due,due)
      on conflict(contract_id,kind) do update set closed_at=null;
    end if;
    if target='ready' then update public.operational_slas set closed_at=now() where contract_id=c.id and kind='executive'; end if;
    -- Installation SLA closes on actual full installation, never merely on scheduling.
    update public.operational_contracts set stage=target where contract_id=c.id;
    payload:=payload||jsonb_build_object('from',o.stage,'to',target);
  when 'priority' then
    target:=p_payload->>'priority';
    if target is null or target not in ('normal','high','urgent') then raise exception 'Prioridade invalida'; end if;
    update public.operational_contracts set priority=target where contract_id=c.id;
    payload:=jsonb_build_object('from',o.priority,'to',target);
  when 'note' then
    if length(note)=0 then raise exception 'Observacao obrigatoria'; end if;
    payload:=jsonb_build_object('note',note);
  when 'block' then
    if o.stage='completed' then raise exception 'Contrato finalizado'; end if;
    insert into public.operational_blocks(contract_id,empresa_id,reason,note,pause_sla) values(c.id,tenant,reason,note,coalesce((p_payload->>'pause_sla')::boolean,false));
  when 'unblock' then
    select * into bl from public.operational_blocks where contract_id=c.id and ended_at is null;
    if bl.id is null then raise exception 'Sem bloqueio ativo'; end if;
    if bl.pause_sla then
      update public.operational_slas set due_date=app_private.operational_add_days(due_date,app_private.operational_days_between(greatest(started_on,(bl.started_at at time zone 'America/Sao_Paulo')::date),today,client.city),client.city) where contract_id=c.id and closed_at is null;
    end if;
    update public.operational_blocks set ended_at=now() where id=bl.id;
    payload:=jsonb_build_object('block_id',bl.id,'pause_sla',bl.pause_sla,'duration_seconds',extract(epoch from now()-bl.started_at),'reason',bl.reason);
  when 'piece' then
    payload:=payload||jsonb_build_object('from',coalesce((select stage from public.operational_pieces where piece_id=piece),'sold'),'to',p_payload->>'stage');
    if o.stage='completed' then raise exception 'Contrato finalizado'; end if;
    insert into public.operational_pieces(piece_id,contract_id,empresa_id,stage) values(piece,c.id,tenant,p_payload->>'stage') on conflict(piece_id) do update set stage=excluded.stage,updated_at=now();
  when 'dependency' then
    if o.stage='completed' then raise exception 'Contrato finalizado'; end if;
    insert into public.operational_dependencies(piece_id,contract_id,empresa_id,kind,note) values(piece,c.id,tenant,p_payload->>'kind',note);
  when 'dependency_release' then
    update public.operational_dependencies set released_at=now() where id=p_payload->>'id' and contract_id=c.id and empresa_id=tenant and released_at is null;
    if not found then raise exception 'Dependencia indisponivel'; end if;
  when 'schedule' then null;
  when 'visit' then
    if o.stage not in ('installation','aftercare') or cardinality(ids)=0 then raise exception 'Selecione pecas em uma visita de instalacao'; end if;
    select * into ev from public.calendar_events where id=p_payload->>'event_id' and operational_contract_id=c.id and operational_kind='installation' and empresa_id=tenant;
    if ev.id is null or ev.status='completed' or ev.date_key::date>today then raise exception 'Visita indisponivel ou futura'; end if;
    if exists(select 1 from public.operational_dependencies where piece_id=any(ids) and released_at is null) then raise exception 'Pecas selecionadas ainda possuem dependencias'; end if;
    if o.stage<>'aftercare' and exists(select 1 from public.operational_pieces where piece_id=any(ids) and installed_at is not null) then raise exception 'Peca ja instalada'; end if;
    insert into public.operational_visits(contract_id,empresa_id,calendar_event_id) values(c.id,tenant,ev.id) returning operational_visits.id into v_entity_id;
    insert into public.operational_visit_pieces(visit_id,piece_id,contract_id,empresa_id) select v_entity_id,p,c.id,tenant from unnest(ids) p;
    insert into public.operational_pieces(piece_id,contract_id,empresa_id,stage,installed_at) select p,c.id,tenant,'installation',now() from unnest(ids) p on conflict(piece_id) do update set installed_at=coalesce(operational_pieces.installed_at,excluded.installed_at),stage='installation',updated_at=now();
    update public.calendar_events set status='completed',updated_at=now() where calendar_events.id=ev.id;
    if not exists(select 1 from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.deleted_at is null and op.installed_at is null) then update public.operational_slas set closed_at=now() where contract_id=c.id and kind='installation'; end if;
    payload:=payload||jsonb_build_object('visit_id',v_entity_id,'piece_count',cardinality(ids));
  when 'aftercare_open' then
    if o.stage not in ('completed','aftercare') or length(reason)=0 then raise exception 'Pos-instalacao exige contrato finalizado e descricao'; end if;
    insert into public.operational_aftercare(contract_id,empresa_id,description,note) values(c.id,tenant,reason,note) returning operational_aftercare.id into v_entity_id;
    insert into public.operational_aftercare_pieces(aftercare_id,piece_id,contract_id,empresa_id) select v_entity_id,p,c.id,tenant from unnest(ids) p;
    update public.operational_contracts set stage='aftercare' where contract_id=c.id;
    payload:=payload||jsonb_build_object('id',v_entity_id,'from',o.stage,'to','aftercare');
  when 'aftercare_resolve' then
    if length(reason)=0 then raise exception 'Resolucao obrigatoria'; end if;
    update public.operational_aftercare set resolved_at=now(),resolution=reason where operational_aftercare.id=p_payload->>'id' and contract_id=c.id and empresa_id=tenant and resolved_at is null;
    if not found then raise exception 'Ocorrencia indisponivel'; end if;
    if not exists(select 1 from public.operational_aftercare where contract_id=c.id and resolved_at is null) and not exists(select 1 from public.operational_blocks where contract_id=c.id and ended_at is null) and not exists(select 1 from public.operational_dependencies where contract_id=c.id and released_at is null) then
      update public.operational_contracts set stage='completed' where contract_id=c.id;
      payload:=payload||jsonb_build_object('from','aftercare','to','completed');
    end if;
  else raise exception 'Acao invalida';
  end case;
  if o.stage='aftercare' and p_action in ('unblock','dependency_release') and not exists(select 1 from public.operational_aftercare where contract_id=c.id and resolved_at is null) and not exists(select 1 from public.operational_blocks where contract_id=c.id and ended_at is null) and not exists(select 1 from public.operational_dependencies where contract_id=c.id and released_at is null) then
    update public.operational_contracts set stage='completed' where contract_id=c.id;
    payload:=payload||jsonb_build_object('from','aftercare','to','completed');
  end if;
  update public.operational_contracts set version=version+1,updated_at=now() where contract_id=c.id;
  insert into public.operational_events(empresa_id,contract_id,kind,payload,actor_uid,actor_name)
    values(tenant,c.id,p_action,payload,auth.uid(),coalesce((select coalesce(u.nome,u.name,u.email) from public.users u where u.auth_user_id=auth.uid() or u.id=auth.uid()::text order by u.updated_at desc nulls last limit 1),'Usuario'));
  return app_private.operational_detail(c.id);
end $$;
