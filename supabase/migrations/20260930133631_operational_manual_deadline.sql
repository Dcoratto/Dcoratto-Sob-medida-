alter table public.operational_contracts
  add column if not exists manual_due_date date,
  add column if not exists manual_due_reason text,
  add column if not exists manual_due_set_at timestamptz,
  add column if not exists manual_due_set_by_uid uuid;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='operational_contracts_manual_due_reason' and conrelid='public.operational_contracts'::regclass) then
    alter table public.operational_contracts add constraint operational_contracts_manual_due_reason
      check (manual_due_reason is null or (length(btrim(manual_due_reason)) between 1 and 2000 and manual_due_reason !~ '[<>]'));
  end if;
  if not exists(select 1 from pg_constraint where conname='operational_contracts_manual_due_pair' and conrelid='public.operational_contracts'::regclass) then
    alter table public.operational_contracts add constraint operational_contracts_manual_due_pair
      check ((manual_due_date is null) = (manual_due_reason is null) and (manual_due_date is null) = (manual_due_set_at is null) and (manual_due_date is null) = (manual_due_set_by_uid is null));
  end if;
end $$;

create or replace function app_private.operational_cards() returns table(
  contract_id text,client_id text,client_name text,contract_number text,stage text,priority text,version integer,
  piece_count bigint,installed_count bigint,dependent_count bigint,blocked boolean,due_date date,remaining_days integer,paused boolean,
  measurement_date text,measurement_time text,installation_date text,installation_time text
) language sql stable security definer set search_path='' as $$
  select c.id,c.client_id,cl.name,c.contract_number,coalesce(o.stage,'sold'),coalesce(o.priority,'normal'),coalesce(o.version,0),
    pc.n,pc.installed,dc.n,bl.id is not null,coalesce(o.manual_due_date,sl.due_date),
    case when coalesce(o.manual_due_date,sl.due_date) is not null then app_private.operational_days_between((now() at time zone 'America/Sao_Paulo')::date,coalesce(o.manual_due_date,sl.due_date),cl.city) end,
    coalesce(bl.pause_sla,false),me.date_key,me.event_time,ie.date_key,ie.event_time
  from public.client_contracts c join public.clients cl on cl.id=c.client_id and cl.empresa_id=c.empresa_id
  left join public.operational_contracts o on o.contract_id=c.id
  join lateral(select count(*) n,count(*) filter(where op.installed_at is not null) installed from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.empresa_id=c.empresa_id and p.deleted_at is null) pc on pc.n>0
  left join lateral(select count(distinct dp.piece_id) n from public.operational_dependencies dp join public.client_contract_pieces p on p.id=dp.piece_id and p.deleted_at is null where dp.contract_id=c.id and dp.released_at is null) dc on true
  left join public.operational_blocks bl on bl.contract_id=c.id and bl.ended_at is null
  left join lateral(select s.id,case when bl.pause_sla then app_private.operational_add_days(s.due_date,app_private.operational_days_between(greatest(s.started_on,(bl.started_at at time zone 'America/Sao_Paulo')::date),(now() at time zone 'America/Sao_Paulo')::date,cl.city),cl.city) else s.due_date end due_date,s.started_on from public.operational_slas s where s.contract_id=c.id and s.closed_at is null order by s.started_on desc,s.kind limit 1) sl on true
  left join public.calendar_events me on me.operational_contract_id=c.id and me.operational_kind='measurement'
  left join lateral(select date_key,event_time from public.calendar_events where operational_contract_id=c.id and operational_kind='installation' and status is distinct from 'completed' order by date_key limit 1) ie on true
  where c.empresa_id=app_private.current_empresa_id() and c.deleted_at is null and c.status='active' and c.review_status='confirmed' and auth.uid() is not null and app_private.operational_permission('visualizar');
$$;

create or replace function app_private.operational_detail(p_contract_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare card jsonb; result jsonb;
begin
  select to_jsonb(c) into card from app_private.operational_cards() c where c.contract_id=p_contract_id;
  if card is null then raise exception 'Contrato indisponivel'; end if;
  select card || jsonb_build_object(
      'automatic_due_date',sl.due_date,
      'automatic_remaining_days',case when sl.id is not null then app_private.operational_days_between((now() at time zone 'America/Sao_Paulo')::date,sl.due_date,cl.city) end,
      'deadline_source',case when o.manual_due_date is not null then 'manual' when sl.id is not null then 'automatic' else 'none' end,
      'manual_due_date',o.manual_due_date,
      'manual_due_reason',o.manual_due_reason
    ) into card
  from public.client_contracts c join public.clients cl on cl.id=c.client_id and cl.empresa_id=c.empresa_id
  left join public.operational_contracts o on o.contract_id=c.id
  left join public.operational_blocks bl on bl.contract_id=c.id and bl.ended_at is null
  left join lateral(select s.id,case when bl.pause_sla then app_private.operational_add_days(s.due_date,app_private.operational_days_between(greatest(s.started_on,(bl.started_at at time zone 'America/Sao_Paulo')::date),(now() at time zone 'America/Sao_Paulo')::date,cl.city),cl.city) else s.due_date end due_date from public.operational_slas s where s.contract_id=c.id and s.closed_at is null order by s.started_on desc,s.kind limit 1) sl on true
  where c.id=p_contract_id and c.empresa_id=app_private.current_empresa_id();

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

create or replace function app_private.operational_deadline_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  tenant text:=app_private.current_empresa_id();
  c public.client_contracts;
  o public.operational_contracts;
  client public.clients;
  manual_day date;
  reason text:=btrim(coalesce(p_payload->>'reason',''));
  automatic_due date;
  actor text;
  payload jsonb;
begin
  if auth.uid() is null or tenant is null or octet_length(p_payload::text)>20000 or not app_private.operational_permission('editar') then
    raise exception 'Sem permissao';
  end if;
  if length(reason)>2000 or reason~'[<>]' then raise exception 'Texto invalido (maximo 2000 caracteres, sem HTML)'; end if;

  select * into c
  from public.client_contracts
  where id=p_contract_id and empresa_id=tenant and deleted_at is null and status='active' and review_status='confirmed'
  for update;
  if c.id is null or not exists(select 1 from public.client_contract_pieces where contract_id=c.id and empresa_id=tenant and deleted_at is null) then
    raise exception 'Contrato indisponivel';
  end if;

  select * into client from public.clients where id=c.client_id and empresa_id=tenant;
  insert into public.operational_contracts(contract_id,empresa_id) values(c.id,tenant) on conflict do nothing;
  select * into o from public.operational_contracts where contract_id=c.id for update;
  if p_version is null or o.version<>p_version then
    raise exception 'Contrato alterado por outra operacao. Atualize o painel.' using errcode='40001';
  end if;
  if o.stage='completed' then raise exception 'Prazo de contrato finalizado deve permanecer historico'; end if;

  select case
    when bl.pause_sla then app_private.operational_add_days(s.due_date,app_private.operational_days_between(greatest(s.started_on,(bl.started_at at time zone 'America/Sao_Paulo')::date),(now() at time zone 'America/Sao_Paulo')::date,client.city),client.city)
    else s.due_date end into automatic_due
  from public.operational_slas s
  left join public.operational_blocks bl on bl.contract_id=s.contract_id and bl.ended_at is null
  where s.contract_id=c.id and s.closed_at is null
  order by s.started_on desc,s.kind
  limit 1;

  if p_action='deadline_manual' then
    if p_payload->>'date' is null or p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe uma data valida'; end if;
    manual_day:=(p_payload->>'date')::date;
    if manual_day<date '2000-01-01' or manual_day>(now() at time zone 'America/Sao_Paulo')::date+3650 then raise exception 'Informe uma data valida'; end if;
    if length(reason)=0 then raise exception 'Motivo obrigatorio para prazo manual'; end if;
    update public.operational_contracts
      set manual_due_date=manual_day,manual_due_reason=reason,manual_due_set_at=clock_timestamp(),manual_due_set_by_uid=auth.uid(),version=version+1,updated_at=now()
    where contract_id=c.id;
    payload:=jsonb_build_object('previous_date',o.manual_due_date,'previous_source',case when o.manual_due_date is not null then 'manual' when automatic_due is not null then 'automatic' else 'none' end,'automatic_date',automatic_due,'date',manual_day,'reason',reason);
  elsif p_action='deadline_auto' then
    if o.manual_due_date is null then return app_private.operational_detail(c.id); end if;
    update public.operational_contracts
      set manual_due_date=null,manual_due_reason=null,manual_due_set_at=null,manual_due_set_by_uid=null,version=version+1,updated_at=now()
    where contract_id=c.id;
    payload:=jsonb_build_object('previous_date',o.manual_due_date,'automatic_date',automatic_due);
  else
    raise exception 'Acao invalida';
  end if;

  select coalesce(u.nome,u.name,u.email) into actor
  from public.users u
  where u.auth_user_id=auth.uid() or u.id=auth.uid()::text
  order by u.updated_at desc nulls last
  limit 1;

  insert into public.operational_events(empresa_id,contract_id,kind,payload,actor_uid,actor_name)
  values(tenant,c.id,p_action,payload,auth.uid(),coalesce(actor,'Usuario'));
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
  if p_action in ('deadline_manual','deadline_auto') then
    return app_private.operational_deadline_mutate(p_contract_id,p_version,p_action,p_payload);
  end if;
  if p_action='manual_stage_adjust' then
    return app_private.operational_manual_stage_adjust(p_contract_id,p_version,p_payload);
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

revoke all on function app_private.operational_deadline_mutate(text,integer,text,jsonb) from public,anon;
grant execute on function app_private.operational_deadline_mutate(text,integer,text,jsonb) to authenticated;
