create or replace function app_private.operational_cards() returns table(
  contract_id text,client_id text,client_name text,contract_number text,stage text,priority text,version integer,
  piece_count bigint,installed_count bigint,dependent_count bigint,blocked boolean,due_date date,remaining_days integer,paused boolean,
  measurement_date text,measurement_time text,installation_date text,installation_time text
) language sql stable security definer set search_path='' as $$
  select c.id,c.client_id,cl.name,c.contract_number,coalesce(o.stage,'sold'),coalesce(o.priority,'normal'),coalesce(o.version,0),
    pc.n,pc.installed,dc.n,bl.id is not null,sl.due_date,
    case when sl.id is not null then app_private.operational_days_between((now() at time zone 'America/Sao_Paulo')::date,sl.due_date,cl.city) end,
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

create or replace function app_private.operational_board(p_filter jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; settings jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date; week_start date; off int:=coalesce((p_filter->>'offset')::int,0);
begin
  if not app_private.operational_permission('visualizar') then raise exception 'Sem permissao'; end if;
  if octet_length(p_filter::text)>2000 or off<0 or off>100000 then raise exception 'Filtro invalido'; end if;
  week_start:=today-(extract(isodow from today)::int-1);
  insert into public.operational_settings(empresa_id) values(app_private.current_empresa_id()) on conflict do nothing;
  select to_jsonb(s)-'empresa_id'-'updated_at' into settings from public.operational_settings s where empresa_id=app_private.current_empresa_id();
  with cards as materialized(select * from app_private.operational_cards()), filtered as (
    select * from cards where (coalesce(p_filter->>'search','')='' or client_name ilike '%'||(p_filter->>'search')||'%' or contract_number ilike '%'||(p_filter->>'search')||'%')
      and (coalesce(p_filter->>'stage','')='' or stage=p_filter->>'stage')
      and (coalesce(p_filter->>'priority','')='' or priority=p_filter->>'priority')
      and (coalesce((p_filter->>'completed')::boolean,false) or stage<>'completed' or p_filter->>'stage'='completed')
      and case coalesce(p_filter->>'situation','') when 'late' then remaining_days<0 when 'blocked' then blocked or dependent_count>0
        when 'measurement' then measurement_date::date between week_start and week_start+6
        when 'installation' then installation_date::date between week_start and week_start+6
        when 'ongoing' then stage<>'completed' else true end
  ), page as (select * from filtered order by case priority when 'urgent' then 0 when 'high' then 1 else 2 end,contract_number,contract_id limit 100 offset off)
  select jsonb_build_object('cards',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from filtered),'settings',settings,
    'indicators',jsonb_build_object('ongoing',count(*) filter(where stage<>'completed'),'late',count(*) filter(where remaining_days<0 and stage<>'completed'),'blocked',count(*) filter(where (blocked or dependent_count>0) and stage<>'completed'),'measurement',count(*) filter(where measurement_date::date between week_start and week_start+6),'installation',count(*) filter(where installation_date::date between week_start and week_start+6))) into result from cards;
  return result;
end $$;


-- Cover every new composite foreign key, without touching unrelated schemas.
do $$ declare r record; begin
  for r in select con.conrelid::regclass relation,con.conname,string_agg(quote_ident(a.attname),',' order by k.n) columns
    from pg_constraint con cross join lateral unnest(con.conkey) with ordinality k(attnum,n)
    join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum
    where con.contype='f' and (con.conrelid::regclass::text like 'operational_%' or con.conname='operational_schedule_context')
    group by con.conrelid,con.conname loop
    execute format('create index %I on %s(%s)',left(r.conname,48)||'_cover',r.relation,r.columns);
  end loop;
end $$;

create or replace function app_private.operational_settings_get() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.operational_permission('visualizar') then raise exception 'Sem permissao'; end if;
  insert into public.operational_settings(empresa_id) values(app_private.current_empresa_id()) on conflict do nothing;
  return (select to_jsonb(s)-'empresa_id'-'updated_at' from public.operational_settings s where empresa_id=app_private.current_empresa_id());
end $$;

create function app_private.operational_events_page(p_contract_id text,p_before timestamptz,p_before_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.operational_permission('visualizar') or not exists(select 1 from public.client_contracts where id=p_contract_id and empresa_id=app_private.current_empresa_id() and deleted_at is null and status='active') then raise exception 'Contrato indisponivel'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc,id desc),'[]'::jsonb) from (
    select id,kind,payload,actor_name,created_at from public.operational_events where contract_id=p_contract_id and empresa_id=app_private.current_empresa_id() and (created_at,id)<(p_before,p_before_id) order by created_at desc,id desc limit 100
  ) e);
end $$;
create function public.operational_events_page(p_contract_id text,p_before timestamptz,p_before_id text) returns jsonb language sql security invoker set search_path='' as $$ select app_private.operational_events_page(p_contract_id,p_before,p_before_id) $$;
revoke all on function app_private.operational_events_page(text,timestamptz,text),public.operational_events_page(text,timestamptz,text) from public,anon;
grant execute on function app_private.operational_events_page(text,timestamptz,text),public.operational_events_page(text,timestamptz,text) to authenticated;
