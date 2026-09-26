-- Operational state references the existing, curated masonry contract/piece hierarchy.
create unique index operational_contract_tenant_key on public.client_contracts(id, empresa_id);
create unique index operational_piece_tenant_key on public.client_contract_pieces(id, contract_id, empresa_id);

create table public.operational_settings (
  empresa_id text primary key references public.empresas(id),
  executive_days integer not null default 15 check (executive_days between 1 and 365),
  installation_days integer not null default 25 check (installation_days between 1 and 365),
  attention_days integer not null default 5 check (attention_days between 0 and 365),
  urgent_days integer not null default 2 check (urgent_days between 0 and attention_days),
  updated_at timestamptz not null default now()
);
insert into public.operational_settings(empresa_id) select id from public.empresas on conflict do nothing;

create table public.operational_contracts (
  contract_id text primary key,
  empresa_id text not null,
  stage text not null default 'sold' check (stage in ('sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed','aftercare')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  foreign key(contract_id,empresa_id) references public.client_contracts(id,empresa_id)
);
create index operational_contracts_board on public.operational_contracts(empresa_id,stage,priority);

create table public.operational_pieces (
  piece_id text primary key,
  contract_id text not null,
  empresa_id text not null,
  stage text not null default 'sold' check (stage in ('sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed','aftercare')),
  installed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key(piece_id,contract_id,empresa_id) references public.client_contract_pieces(id,contract_id,empresa_id)
);
create index operational_pieces_contract on public.operational_pieces(empresa_id,contract_id);

create table public.operational_slas (
  id text primary key default app_private.make_entity_id(),
  contract_id text not null,
  empresa_id text not null,
  kind text not null check (kind in ('executive','installation')),
  started_on date not null,
  budget_days integer not null check (budget_days between 1 and 365),
  original_due date not null,
  due_date date not null,
  closed_at timestamptz,
  unique(contract_id,kind),
  foreign key(contract_id,empresa_id) references public.client_contracts(id,empresa_id)
);
create index operational_slas_open on public.operational_slas(empresa_id,contract_id) where closed_at is null;

create table public.operational_blocks (
  id text primary key default app_private.make_entity_id(),
  contract_id text not null,
  empresa_id text not null,
  reason text not null check(reason in ('client','furniture','material','civil','supplier','payment','other')),
  note text not null default '' check(length(note)<=2000 and note !~ '[<>]'),
  pause_sla boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key(contract_id,empresa_id) references public.client_contracts(id,empresa_id)
);
create unique index operational_blocks_one_open on public.operational_blocks(contract_id) where ended_at is null;
create index operational_blocks_tenant on public.operational_blocks(empresa_id,contract_id,started_at);

create table public.operational_dependencies (
  id text primary key default app_private.make_entity_id(),
  piece_id text not null,
  contract_id text not null,
  empresa_id text not null,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  note text not null default '' check(length(note)<=2000 and note !~ '[<>]'),
  started_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key(piece_id,contract_id,empresa_id) references public.client_contract_pieces(id,contract_id,empresa_id)
);
create index operational_dependencies_contract on public.operational_dependencies(empresa_id,contract_id);
create unique index operational_dependencies_one_open on public.operational_dependencies(piece_id,kind) where released_at is null;

create table public.operational_events (
  id text primary key default app_private.make_entity_id(),
  empresa_id text not null,
  contract_id text not null,
  kind text not null,
  payload jsonb not null check(octet_length(payload::text)<=20000),
  actor_uid uuid not null,
  actor_name text not null,
  created_at timestamptz not null default now(),
  foreign key(contract_id,empresa_id) references public.client_contracts(id,empresa_id)
);
create index operational_events_timeline on public.operational_events(empresa_id,contract_id,created_at desc,id);

alter table public.calendar_events add column operational_contract_id text;
alter table public.calendar_events add column operational_kind text check(operational_kind in ('measurement','installation'));
alter table public.calendar_events add constraint operational_schedule_context foreign key(operational_contract_id,empresa_id) references public.client_contracts(id,empresa_id);
alter table public.calendar_events add constraint operational_schedule_pair check ((operational_contract_id is null) = (operational_kind is null));
create unique index operational_measurement_unique on public.calendar_events(operational_contract_id) where operational_kind='measurement';
create index operational_schedules_contract on public.calendar_events(empresa_id,operational_contract_id,date_key) where operational_contract_id is not null;

create table public.operational_visits (
  id text primary key default app_private.make_entity_id(),
  contract_id text not null,
  empresa_id text not null,
  calendar_event_id text not null unique references public.calendar_events(id),
  completed_at timestamptz not null default now(),
  foreign key(contract_id,empresa_id) references public.client_contracts(id,empresa_id),
  unique(id,contract_id,empresa_id)
);
create index operational_visits_contract on public.operational_visits(empresa_id,contract_id);
create table public.operational_visit_pieces (
  visit_id text not null,
  piece_id text not null,
  contract_id text not null,
  empresa_id text not null,
  primary key(visit_id,piece_id),
  foreign key(visit_id,contract_id,empresa_id) references public.operational_visits(id,contract_id,empresa_id),
  foreign key(piece_id,contract_id,empresa_id) references public.client_contract_pieces(id,contract_id,empresa_id)
);
create index operational_visit_pieces_contract on public.operational_visit_pieces(empresa_id,contract_id,piece_id);

create table public.operational_aftercare (
  id text primary key default app_private.make_entity_id(),
  contract_id text not null,
  empresa_id text not null,
  description text not null check(length(btrim(description)) between 1 and 2000 and description !~ '[<>]'),
  note text not null default '' check(length(note)<=2000 and note !~ '[<>]'),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check(length(btrim(resolution)) between 1 and 2000 and resolution !~ '[<>]'),
  foreign key(contract_id,empresa_id) references public.client_contracts(id,empresa_id),
  unique(id,contract_id,empresa_id)
);
create index operational_aftercare_contract on public.operational_aftercare(empresa_id,contract_id,opened_at);
create table public.operational_aftercare_pieces (
  aftercare_id text not null,
  piece_id text not null,
  contract_id text not null,
  empresa_id text not null,
  primary key(aftercare_id,piece_id),
  foreign key(aftercare_id,contract_id,empresa_id) references public.operational_aftercare(id,contract_id,empresa_id),
  foreign key(piece_id,contract_id,empresa_id) references public.client_contract_pieces(id,contract_id,empresa_id)
);
create index operational_aftercare_pieces_contract on public.operational_aftercare_pieces(empresa_id,contract_id,piece_id);

-- Reuse the existing projeto permission model, including explicit overrides and blocked users.
create function app_private.operational_permission(p_action text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.users u where (u.auth_user_id=auth.uid() or u.id=auth.uid()::text)
    and u.empresa_id=app_private.current_empresa_id() and u.blocked is not true and
    case when lower(u.email)='brian_takiya77@outlook.com' then true
    when u.permissions #> array['projeto',p_action] is not null then u.permissions #> array['projeto',p_action]='true'::jsonb
    when u.role='coordenador' then true
    when u.role='vendedor' then p_action in ('visualizar','criar','editar')
    when u.role='liberacao' then p_action in ('visualizar','aprovar')
    when u.role='administrativo' then p_action='visualizar' else false end);
$$;

-- Same holiday rules as src/lib/holidays.ts (including its optional municipal holidays).
create function app_private.operational_business_day(p_date date,p_city text default '') returns boolean
language plpgsql immutable set search_path='' as $$
declare y int:=extract(year from p_date); a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; easter date; md text:=to_char(p_date,'MM-DD'); city text:=lower(translate(coalesce(p_city,''),'ãáàâéêíóôõúç','aaaaeeiooouc'));
begin
  if extract(isodow from p_date)>5 or md=any(array['01-01','04-21','05-01','09-07','10-12','11-02','11-15','12-25']) then return false; end if;
  a:=y%19; b:=y/100; c:=y%100; d:=b/4; e:=b%4; f:=(b+8)/25; g:=(b-f+1)/3;
  h:=(19*a+b-d-g+15)%30; i:=c/4; k:=c%4; l:=(32+2*e+2*i-h-k)%7; m:=(a+11*h+22*l)/451;
  easter:=make_date(y,(h+l-7*m+114)/31,(h+l-7*m+114)%31+1);
  if p_date=any(array[easter-48,easter-47,easter-2,easter+60]) then return false; end if;
  return md <> coalesce(case city when 'sao paulo' then '01-25' when 'aruja' then '06-08' when 'mogi das cruzes' then '09-01' when 'mogi' then '09-01' when 'suzano' then '04-02' when 'poa' then '03-26' when 'itaquaquecetuba' then '09-08' when 'itaqua' then '09-08' when 'ferraz de vasconcelos' then '10-14' when 'guarulhos' then '12-08' when 'biritiba mirim' then '05-05' when 'salesopolis' then '11-30' when 'santa isabel' then '07-10' end,'');
end $$;
create function app_private.operational_add_days(p_date date,p_days integer,p_city text default '') returns date
language plpgsql immutable set search_path='' as $$
declare result date:=p_date; n int:=0;
begin
  if p_days<0 or p_days>2000 then raise exception 'Prazo invalido'; end if;
  while n<p_days loop result:=result+1; if app_private.operational_business_day(result,p_city) then n:=n+1; end if; end loop;
  return result;
end $$;
create function app_private.operational_days_between(p_from date,p_to date,p_city text default '') returns integer
language sql immutable set search_path='' as $$
  select (case when p_from>p_to then -1 else 1 end)*count(*)::integer from generate_series(least(p_from,p_to)+1,greatest(p_from,p_to),interval '1 day') day where app_private.operational_business_day(day::date,p_city);
$$;

-- Only confirmed, active contracts with curated contract pieces enter the board. No copies/backfill.
create function app_private.operational_cards() returns table(
  contract_id text,client_id text,client_name text,contract_number text,stage text,priority text,version integer,
  piece_count bigint,installed_count bigint,dependent_count bigint,blocked boolean,due_date date,remaining_days integer,paused boolean,
  measurement_date text,measurement_time text,installation_date text,installation_time text
) language sql stable security definer set search_path='' as $$
  select c.id,c.client_id,cl.name,c.contract_number,coalesce(o.stage,'sold'),coalesce(o.priority,'normal'),coalesce(o.version,0),
    pc.n,pc.installed,dc.n,bl.id is not null,sl.due_date,
    case when sl.id is not null then app_private.operational_days_between(case when bl.pause_sla then greatest(sl.started_on,(bl.started_at at time zone 'America/Sao_Paulo')::date) else (now() at time zone 'America/Sao_Paulo')::date end,sl.due_date,cl.city) end,
    coalesce(bl.pause_sla,false),me.date_key,me.event_time,ie.date_key,ie.event_time
  from public.client_contracts c join public.clients cl on cl.id=c.client_id and cl.empresa_id=c.empresa_id
  left join public.operational_contracts o on o.contract_id=c.id
  join lateral(select count(*) n,count(*) filter(where op.installed_at is not null) installed from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.empresa_id=c.empresa_id and p.deleted_at is null) pc on pc.n>0
  left join lateral(select count(distinct dp.piece_id) n from public.operational_dependencies dp join public.client_contract_pieces p on p.id=dp.piece_id and p.deleted_at is null where dp.contract_id=c.id and dp.released_at is null) dc on true
  left join public.operational_blocks bl on bl.contract_id=c.id and bl.ended_at is null
  left join lateral(select s.id,s.due_date,s.started_on from public.operational_slas s where s.contract_id=c.id and s.closed_at is null order by s.started_on desc,s.kind limit 1) sl on true
  left join public.calendar_events me on me.operational_contract_id=c.id and me.operational_kind='measurement'
  left join lateral(select date_key,event_time from public.calendar_events where operational_contract_id=c.id and operational_kind='installation' and status is distinct from 'completed' order by date_key limit 1) ie on true
  where c.empresa_id=app_private.current_empresa_id() and c.deleted_at is null and c.status='active' and c.review_status='confirmed' and auth.uid() is not null and app_private.operational_permission('visualizar');
$$;

create function app_private.operational_board(p_filter jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; settings jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date; week_start date; off int:=coalesce((p_filter->>'offset')::int,0);
begin
  if not app_private.operational_permission('visualizar') then raise exception 'Sem permissao'; end if;
  if octet_length(p_filter::text)>2000 or off<0 or off>100000 then raise exception 'Filtro invalido'; end if;
  week_start:=today-(extract(isodow from today)::int-1);
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

create function app_private.operational_detail(p_contract_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare card jsonb; result jsonb;
begin
  select to_jsonb(c) into card from app_private.operational_cards() c where c.contract_id=p_contract_id;
  if card is null then raise exception 'Contrato indisponivel'; end if;
  select jsonb_build_object('card',card,'drive_url',cl.google_drive_url,
    'settings',(select to_jsonb(s)-'empresa_id'-'updated_at' from public.operational_settings s where s.empresa_id=c.empresa_id),
    'pieces',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'label',p.piece_label,'stage',coalesce(op.stage,'sold'),'installed',op.installed_at is not null) order by p.sort_order,p.id) from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.deleted_at is null),'[]'::jsonb),
    'dependencies',coalesce((select jsonb_agg(to_jsonb(d)-'empresa_id'-'contract_id') from public.operational_dependencies d where d.contract_id=c.id),'[]'::jsonb),
    'blocks',coalesce((select jsonb_agg(to_jsonb(b)-'empresa_id'-'contract_id' order by started_at desc) from public.operational_blocks b where b.contract_id=c.id),'[]'::jsonb),
    'slas',coalesce((select jsonb_agg(to_jsonb(s)-'empresa_id'-'contract_id') from public.operational_slas s where s.contract_id=c.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)-'empresa_id'-'contract_id' order by created_at desc,id desc) from (select id,kind,payload,actor_name,created_at from public.operational_events where contract_id=c.id order by created_at desc,id desc limit 200) e),'[]'::jsonb),
    'schedules',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'operational_kind',e.operational_kind,'date_key',e.date_key,'event_time',e.event_time,'status',e.status) order by e.date_key) from public.calendar_events e where e.operational_contract_id=c.id),'[]'::jsonb),
    'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'calendar_event_id',v.calendar_event_id,'completed_at',v.completed_at,'piece_count',(select count(*) from public.operational_visit_pieces vp where vp.visit_id=v.id))) from public.operational_visits v where v.contract_id=c.id),'[]'::jsonb),
    'aftercare',coalesce((select jsonb_agg((to_jsonb(a)-'empresa_id'-'contract_id')||jsonb_build_object('piece_ids',coalesce((select jsonb_agg(ap.piece_id) from public.operational_aftercare_pieces ap where ap.aftercare_id=a.id),'[]'::jsonb)) order by a.opened_at desc) from public.operational_aftercare a where a.contract_id=c.id),'[]'::jsonb)) into result
  from public.client_contracts c join public.clients cl on cl.id=c.client_id where c.id=p_contract_id and c.empresa_id=app_private.current_empresa_id();
  return result;
end $$;

-- A single row lock + expected version serializes every operation on a contract.
create function app_private.operational_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant text:=app_private.current_empresa_id(); c public.client_contracts; o public.operational_contracts; cfg public.operational_settings; client public.clients; ev public.calendar_events; bl public.operational_blocks;
  target text; note text:=btrim(coalesce(p_payload->>'note','')); reason text:=btrim(coalesce(p_payload->>'reason','')); id text; piece text; ids text[]; day date; clock text; budget int; due date; today date:=(now() at time zone 'America/Sao_Paulo')::date; payload jsonb:=p_payload; action_permission text:='editar';
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
    if ev.status='completed' then raise exception 'Visita concluida nao pode ser reagendada'; end if;
    if ev.id is not null and (ev.date_key is distinct from day::text or ev.event_time is distinct from clock) and length(reason)=0 then raise exception 'Motivo obrigatorio para reagendamento'; end if;
    if target='installation' then
      if exists(select 1 from public.operational_dependencies d join public.client_contract_pieces p on p.id=d.piece_id and p.deleted_at is null where d.contract_id=c.id and d.released_at is null) and coalesce((p_payload->>'confirm_warning')::boolean,false) is not true then raise exception 'Confirme o agendamento com pecas dependentes'; end if;
      select due_date into due from public.operational_slas where contract_id=c.id and kind='installation';
      if day>due and coalesce((p_payload->>'confirm_warning')::boolean,false) is not true then raise exception 'Confirme a instalacao apos o prazo previsto'; end if;
    end if;
    payload:=payload||jsonb_build_object('kind',target,'previous_date',ev.date_key,'previous_time',ev.event_time,'date',day,'time',clock,'outside_deadline',coalesce(day>due,false));
    id:=coalesce(ev.id,app_private.make_entity_id());
    insert into public.calendar_events(id,empresa_id,operational_contract_id,operational_kind,title,date,date_key,event_time,client_id,client_name,city,source_type,status,created_by_uid)
    values(id,tenant,c.id,target,(case target when 'measurement' then 'Medição' else 'Instalação' end)||' · '||c.contract_number,(day+coalesce(clock::time,time '12:00')) at time zone 'America/Sao_Paulo',day::text,clock,c.client_id,client.name,client.city,'operacional','scheduled',auth.uid()::text)
    on conflict(id) do update set date=excluded.date,date_key=excluded.date_key,event_time=excluded.event_time,updated_at=now();
  end if;

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
    insert into public.operational_visits(contract_id,empresa_id,calendar_event_id) values(c.id,tenant,ev.id) returning operational_visits.id into id;
    insert into public.operational_visit_pieces(visit_id,piece_id,contract_id,empresa_id) select id,p,c.id,tenant from unnest(ids) p;
    insert into public.operational_pieces(piece_id,contract_id,empresa_id,stage,installed_at) select p,c.id,tenant,'installation',now() from unnest(ids) p on conflict(piece_id) do update set installed_at=coalesce(operational_pieces.installed_at,excluded.installed_at),stage='installation',updated_at=now();
    update public.calendar_events set status='completed',updated_at=now() where calendar_events.id=ev.id;
    if not exists(select 1 from public.client_contract_pieces p left join public.operational_pieces op on op.piece_id=p.id where p.contract_id=c.id and p.deleted_at is null and op.installed_at is null) then update public.operational_slas set closed_at=now() where contract_id=c.id and kind='installation'; end if;
    payload:=payload||jsonb_build_object('visit_id',id,'piece_count',cardinality(ids));
  when 'aftercare_open' then
    if o.stage not in ('completed','aftercare') or length(reason)=0 then raise exception 'Pos-instalacao exige contrato finalizado e descricao'; end if;
    insert into public.operational_aftercare(contract_id,empresa_id,description,note) values(c.id,tenant,reason,note) returning operational_aftercare.id into id;
    insert into public.operational_aftercare_pieces(aftercare_id,piece_id,contract_id,empresa_id) select id,p,c.id,tenant from unnest(ids) p;
    update public.operational_contracts set stage='aftercare' where contract_id=c.id;
    payload:=payload||jsonb_build_object('id',id,'from',o.stage,'to','aftercare');
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
  update public.operational_contracts set version=version+1,updated_at=now() where contract_id=c.id;
  insert into public.operational_events(empresa_id,contract_id,kind,payload,actor_uid,actor_name)
    values(tenant,c.id,p_action,payload,auth.uid(),coalesce((select coalesce(u.nome,u.name,u.email) from public.users u where u.auth_user_id=auth.uid() or u.id=auth.uid()::text order by u.updated_at desc nulls last limit 1),'Usuario'));
  return app_private.operational_detail(c.id);
end $$;

create function app_private.operational_settings_get() returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(s)-'empresa_id'-'updated_at' from public.operational_settings s where empresa_id=app_private.current_empresa_id() and auth.uid() is not null and app_private.operational_permission('visualizar');
$$;
create function app_private.operational_settings_save(p_settings jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.users u where (u.auth_user_id=auth.uid() or u.id=auth.uid()::text) and u.empresa_id=app_private.current_empresa_id() and u.blocked is not true and (app_private.current_user_is_admin() or u.permissions #> '{admin,visualizarUsuarios}'='true'::jsonb or lower(u.email)='brian_takiya77@outlook.com')) or not app_private.operational_permission('visualizar') or octet_length(p_settings::text)>1000 then raise exception 'Sem permissao'; end if;
  insert into public.operational_settings(empresa_id,executive_days,installation_days,attention_days,urgent_days) values(app_private.current_empresa_id(),(p_settings->>'executive_days')::int,(p_settings->>'installation_days')::int,(p_settings->>'attention_days')::int,(p_settings->>'urgent_days')::int)
  on conflict(empresa_id) do update set executive_days=excluded.executive_days,installation_days=excluded.installation_days,attention_days=excluded.attention_days,urgent_days=excluded.urgent_days,updated_at=now();
  return app_private.operational_settings_get();
end $$;

-- Operational calendar records can only be changed by the transactional API, not direct REST edits.
create function app_private.operational_calendar_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and (case when tg_op='INSERT' then new.operational_contract_id is not null when tg_op='DELETE' then old.operational_contract_id is not null else old.operational_contract_id is not null or new.operational_contract_id is not null end) then raise exception 'Altere o compromisso pelo Operacional'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger operational_calendar_guard before insert or update or delete on public.calendar_events for each row execute function app_private.operational_calendar_guard();

create policy operational_calendar_active on public.calendar_events as restrictive for select to authenticated
using (operational_contract_id is null or exists(select 1 from public.client_contracts c where c.id=operational_contract_id and c.empresa_id=calendar_events.empresa_id and c.deleted_at is null and c.status='active'));

do $$ declare t text; begin
  foreach t in array array['operational_settings','operational_contracts','operational_pieces','operational_slas','operational_blocks','operational_dependencies','operational_events','operational_visits','operational_visit_pieces','operational_aftercare','operational_aftercare_pieces'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy operational_read on public.%I for select to authenticated using (empresa_id=(select app_private.current_empresa_id()) and (select app_private.operational_permission(''visualizar'')))',t);
  end loop;
end $$;

-- Public invoker wrappers expose only validated private functions, with no anonymous grants.
create function public.operational_board(p_filter jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select app_private.operational_board(p_filter) $$;
create function public.operational_detail(p_contract_id text) returns jsonb language sql security invoker set search_path='' as $$ select app_private.operational_detail(p_contract_id) $$;
create function public.operational_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select app_private.operational_mutate(p_contract_id,p_version,p_action,p_payload) $$;
create function public.operational_settings_get() returns jsonb language sql security invoker set search_path='' as $$ select app_private.operational_settings_get() $$;
create function public.operational_settings_save(p_settings jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app_private.operational_settings_save(p_settings) $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.proname like 'operational_%' loop
    execute format('revoke all on function %s from public,anon',f.signature);
    if f.signature::text not like '%operational_calendar_guard%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
  end loop;
end $$;
