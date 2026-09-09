create table if not exists public.employee_operational_hourly_costs (
  id text primary key,
  empresa_id text not null references public.empresas(id) on update cascade on delete restrict,
  employee_id text not null references public.employees(id) on update cascade on delete restrict,
  hourly_cost numeric(12,2) not null check (hourly_cost >= 0 and hourly_cost <= 100000),
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (valid_until is null or valid_until > valid_from)
);

create unique index if not exists employee_operational_hourly_costs_open_unique
on public.employee_operational_hourly_costs(empresa_id, employee_id)
where valid_until is null;

create index if not exists idx_employee_operational_hourly_costs_lookup
on public.employee_operational_hourly_costs(empresa_id, employee_id, valid_from desc, valid_until);

drop trigger if exists set_updated_at_employee_operational_hourly_costs on public.employee_operational_hourly_costs;
create trigger set_updated_at_employee_operational_hourly_costs
before update on public.employee_operational_hourly_costs
for each row execute function public.set_updated_at();

alter table public.employee_operational_hourly_costs enable row level security;

drop policy if exists employee_operational_hourly_costs_select_reports on public.employee_operational_hourly_costs;
create policy employee_operational_hourly_costs_select_reports
on public.employee_operational_hourly_costs
for select
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('verRelatorios'));

drop policy if exists employee_operational_hourly_costs_insert_edit on public.employee_operational_hourly_costs;
create policy employee_operational_hourly_costs_insert_edit
on public.employee_operational_hourly_costs
for insert
to authenticated
with check (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'));

drop policy if exists employee_operational_hourly_costs_update_edit on public.employee_operational_hourly_costs;
create policy employee_operational_hourly_costs_update_edit
on public.employee_operational_hourly_costs
for update
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'))
with check (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'));

create or replace function public.get_employee_operational_hourly_costs()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not app_private.employee_has_permission('verRelatorios') then
    raise exception 'Sem permissão para ver custos operacionais.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'employeeId', c.employee_id,
      'employeeName', coalesce(nullif(e.display_name, ''), e.name),
      'hourlyCost', c.hourly_cost,
      'validFrom', c.valid_from,
      'validUntil', c.valid_until
    ) order by coalesce(nullif(e.display_name, ''), e.name), c.valid_from desc)
    from public.employee_operational_hourly_costs c
    inner join public.employees e on e.id = c.employee_id and e.empresa_id = c.empresa_id
    where c.empresa_id = v_empresa_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_employee_operational_hourly_cost(
  p_employee_id text,
  p_hourly_cost numeric,
  p_valid_from date default null,
  p_actor_uid text default null,
  p_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_employee_id text := btrim(coalesce(p_employee_id, ''));
  v_valid_from timestamptz := coalesce(p_valid_from, (timezone('America/Sao_Paulo', now()))::date)::timestamp at time zone 'America/Sao_Paulo';
  v_next_valid_until timestamptz;
  v_result public.employee_operational_hourly_costs%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not app_private.employee_has_permission('editar') then
    raise exception 'Sem permissão para editar custo operacional.';
  end if;

  if p_hourly_cost is null or p_hourly_cost < 0 or p_hourly_cost > 100000 then
    raise exception 'Custo operacional por hora inválido.';
  end if;

  if not exists (
    select 1
    from public.employees
    where empresa_id = v_empresa_id
      and id = v_employee_id
  ) then
    raise exception 'Funcionário não encontrado.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ':' || v_employee_id || ':operational-hourly-cost'));

  select min(valid_from)
    into v_next_valid_until
  from public.employee_operational_hourly_costs
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id
    and valid_from > v_valid_from;

  update public.employee_operational_hourly_costs
  set valid_until = v_valid_from,
      updated_at = timezone('utc', now())
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id
    and valid_until is null
    and valid_from < v_valid_from;

  update public.employee_operational_hourly_costs
  set hourly_cost = round(p_hourly_cost::numeric, 2),
      created_by_uid = nullif(trim(coalesce(p_actor_uid, auth.uid()::text)), ''),
      created_by_name = left(trim(coalesce(p_actor_name, '')), 120),
      updated_at = timezone('utc', now())
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id
    and valid_from = v_valid_from
  returning * into v_result;

  if v_result.id is null then
    insert into public.employee_operational_hourly_costs (
      id, empresa_id, employee_id, hourly_cost, valid_from, valid_until, created_by_uid, created_by_name
    )
    values (
      app_private.make_entity_id(),
      v_empresa_id,
      v_employee_id,
      round(p_hourly_cost::numeric, 2),
      v_valid_from,
      v_next_valid_until,
      nullif(trim(coalesce(p_actor_uid, auth.uid()::text)), ''),
      left(trim(coalesce(p_actor_name, '')), 120)
    )
    returning * into v_result;
  end if;

  update public.employee_operational_hourly_costs
  set valid_until = v_result.valid_from
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id
    and id <> v_result.id
    and valid_until is null
    and valid_from < v_result.valid_from;

  return jsonb_build_object('id', v_result.id, 'employeeId', v_result.employee_id, 'hourlyCost', v_result.hourly_cost, 'validFrom', v_result.valid_from);
end;
$$;

create or replace function public.get_employee_production_labor_cost_report(
  p_date_from date default null,
  p_date_to date default null,
  p_employee_id text default null,
  p_client_id text default null,
  p_quote_id text default null,
  p_piece_key text default null,
  p_function_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_from date := coalesce(p_date_from, (timezone('America/Sao_Paulo', now()))::date);
  v_to date := coalesce(p_date_to, coalesce(p_date_from, (timezone('America/Sao_Paulo', now()))::date));
  v_now timestamptz := timezone('utc', now());
  v_result jsonb;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not app_private.employee_has_permission('verRelatorios') then
    raise exception 'Sem permissão para ver custos de produção.';
  end if;

  if v_to < v_from then
    raise exception 'Período inválido para custos de produção.';
  end if;

  if (v_to - v_from) > 370 then
    raise exception 'O relatório de custos permite no máximo 370 dias por consulta.';
  end if;

  with sessions_period as (
    select
      s.id,
      s.employee_id,
      coalesce(nullif(e.display_name, ''), e.name) as employee_name,
      s.client_id,
      coalesce(nullif(c.name, ''), nullif(s.client_name_snapshot, ''), nullif(q.client_name, ''), 'Cliente não informado') as client_name,
      s.quote_id,
      coalesce(nullif(q.environment, ''), nullif(s.quote_label_snapshot, ''), 'Sem orçamento') as quote_label,
      q.total_price as quote_total_price,
      coalesce(nullif(s.piece_id, ''), case when nullif(s.piece_label, '') is not null then 'label:' || s.piece_label else '__sem_peca__' end) as piece_key,
      coalesce(nullif(s.piece_label, ''), nullif(piece.item ->> 'name', ''), nullif(q.environment, ''), 'Sem peça específica') as piece_label,
      coalesce(nullif(piece.item ->> 'kind', ''), app_private.employee_production_piece_type_key(s.piece_label)) as piece_type_key,
      coalesce(
        pt.label,
        case piece.item ->> 'kind'
          when 'bancada' then 'Bancada'
          when 'escada' then 'Escada'
          when 'soleira_baguete' then 'Soleira / Baguete'
          else initcap(replace(coalesce(nullif(piece.item ->> 'kind', ''), app_private.employee_production_piece_type_key(s.piece_label)), '_', ' '))
        end
      ) as piece_type_label,
      s.function_key,
      s.function_label,
      app_private.employee_effective_productive_seconds(s.started_at, s.ended_at, s.active_pause_started_at, s.paused_total_seconds, v_now)::integer as productive_seconds,
      case when s.status = 'FINALIZADA' then 1 else 0 end as completed_flag,
      cost.hourly_cost
    from public.employee_activity_sessions s
    inner join public.employees e on e.id = s.employee_id and e.empresa_id = s.empresa_id
    left join public.clients c on c.id = s.client_id and c.empresa_id = s.empresa_id
    left join public.quotes q on q.id = s.quote_id and q.empresa_id = s.empresa_id
    left join lateral (
      select item
      from jsonb_array_elements(coalesce(q.pieces, '[]'::jsonb)) as items(item)
      where item ->> 'id' = s.piece_id
      limit 1
    ) piece on true
    left join public.employee_production_piece_types pt
      on pt.empresa_id = s.empresa_id
     and pt.key = coalesce(nullif(piece.item ->> 'kind', ''), app_private.employee_production_piece_type_key(s.piece_label))
    left join lateral (
      select cst.hourly_cost
      from public.employee_operational_hourly_costs cst
      where cst.empresa_id = s.empresa_id
        and cst.employee_id = s.employee_id
        and cst.valid_from <= s.started_at
        and (cst.valid_until is null or cst.valid_until > s.started_at)
      order by cst.valid_from desc
      limit 1
    ) cost on true
    where s.empresa_id = v_empresa_id
      and (timezone('America/Sao_Paulo', s.started_at))::date between v_from and v_to
  ),
  filtered_sessions as (
    select *
    from sessions_period s
    where (nullif(btrim(coalesce(p_employee_id, '')), '') is null or s.employee_id = p_employee_id)
      and (nullif(btrim(coalesce(p_client_id, '')), '') is null or s.client_id = p_client_id)
      and (nullif(btrim(coalesce(p_quote_id, '')), '') is null or s.quote_id = p_quote_id)
      and (nullif(btrim(coalesce(p_piece_key, '')), '') is null or s.piece_key = p_piece_key)
      and (nullif(btrim(coalesce(p_function_key, '')), '') is null or s.function_key = p_function_key)
  ),
  costed_sessions as (
    select
      *,
      floor(productive_seconds / 60)::integer as productive_minutes,
      case when hourly_cost is null then null else round((productive_seconds::numeric * hourly_cost) / 3600, 2) end as labor_cost,
      case when hourly_cost is null and productive_seconds > 0 then 1 else 0 end as missing_cost_flag
    from filtered_sessions
  ),
  current_costs as (
    select distinct on (c.employee_id)
      c.employee_id,
      c.hourly_cost
    from public.employee_operational_hourly_costs c
    where c.empresa_id = v_empresa_id
      and c.valid_from <= v_now
      and (c.valid_until is null or c.valid_until > v_now)
    order by c.employee_id, c.valid_from desc
  ),
  employee_rows as (
    select
      employee_id,
      max(employee_name) as employee_name,
      max(current_costs.hourly_cost) as current_hourly_cost,
      sum(productive_seconds)::integer as productive_seconds,
      floor(sum(productive_seconds) / 60)::integer as productive_minutes,
      coalesce(sum(labor_cost), 0)::numeric(14,2) as labor_cost,
      sum(missing_cost_flag)::integer as missing_cost_activities,
      sum(case when hourly_cost is null then productive_seconds else 0 end)::integer as missing_cost_seconds
    from costed_sessions
    left join current_costs using (employee_id)
    group by employee_id
  ),
  function_rows as (
    select
      function_key,
      max(function_label) as function_label,
      sum(productive_seconds)::integer as productive_seconds,
      floor(sum(productive_seconds) / 60)::integer as productive_minutes,
      coalesce(sum(labor_cost), 0)::numeric(14,2) as labor_cost,
      sum(missing_cost_flag)::integer as missing_cost_activities,
      sum(case when hourly_cost is null then productive_seconds else 0 end)::integer as missing_cost_seconds
    from costed_sessions
    group by function_key
  ),
  piece_target_costs as (
    select
      p.piece_key,
      round(sum((t.target_seconds::numeric * coalesce(avg_cost.average_hourly_cost, 0)) / 3600), 2)::numeric(14,2) as estimated_target_labor_cost,
      sum(case when avg_cost.average_hourly_cost is null then 1 else 0 end)::integer as missing_target_cost_functions
    from (select distinct piece_key, piece_type_key from costed_sessions where piece_key <> '__sem_peca__' and piece_type_key is not null) p
    inner join public.employee_production_piece_types pt on pt.empresa_id = v_empresa_id and pt.key = p.piece_type_key and pt.active = true
    inner join public.employee_production_time_targets t on t.empresa_id = v_empresa_id and t.piece_type_id = pt.id and t.active = true
    left join lateral (
      select avg(c.hourly_cost)::numeric(12,2) as average_hourly_cost
      from public.employee_function_assignments fa
      inner join public.employees e on e.id = fa.employee_id and e.empresa_id = fa.empresa_id and e.active is true and e.status = 'ATIVO'
      left join lateral (
        select hc.hourly_cost
        from public.employee_operational_hourly_costs hc
        where hc.empresa_id = fa.empresa_id
          and hc.employee_id = fa.employee_id
          and hc.valid_from <= v_now
          and (hc.valid_until is null or hc.valid_until > v_now)
        order by hc.valid_from desc
        limit 1
      ) c on true
      where fa.empresa_id = v_empresa_id
        and fa.function_key = t.function_key
    ) avg_cost on true
    group by p.piece_key
  ),
  piece_rows as (
    select
      piece_key,
      max(piece_label) as piece_label,
      max(piece_type_key) as piece_type_key,
      max(piece_type_label) as piece_type_label,
      max(client_id) as client_id,
      max(client_name) as client_name,
      max(quote_id) as quote_id,
      max(quote_label) as quote_label,
      sum(productive_seconds)::integer as productive_seconds,
      floor(sum(productive_seconds) / 60)::integer as productive_minutes,
      coalesce(sum(labor_cost), 0)::numeric(14,2) as labor_cost,
      coalesce(max(piece_target_costs.estimated_target_labor_cost), 0)::numeric(14,2) as estimated_target_labor_cost,
      coalesce(sum(labor_cost), 0)::numeric(14,2) - coalesce(max(piece_target_costs.estimated_target_labor_cost), 0)::numeric(14,2) as labor_cost_deviation,
      sum(missing_cost_flag)::integer as missing_cost_activities,
      sum(case when hourly_cost is null then productive_seconds else 0 end)::integer as missing_cost_seconds,
      coalesce(max(piece_target_costs.missing_target_cost_functions), 0)::integer as missing_target_cost_functions
    from costed_sessions
    left join piece_target_costs using (piece_key)
    where piece_key <> '__sem_peca__'
    group by piece_key
  ),
  work_function_rows as (
    select
      client_id,
      quote_id,
      function_key,
      max(function_label) as function_label,
      sum(productive_seconds)::integer as productive_seconds,
      floor(sum(productive_seconds) / 60)::integer as productive_minutes,
      coalesce(sum(labor_cost), 0)::numeric(14,2) as labor_cost
    from costed_sessions
    group by client_id, quote_id, function_key
  ),
  work_employee_rows as (
    select
      client_id,
      quote_id,
      employee_id,
      max(employee_name) as employee_name,
      sum(productive_seconds)::integer as productive_seconds,
      floor(sum(productive_seconds) / 60)::integer as productive_minutes,
      coalesce(sum(labor_cost), 0)::numeric(14,2) as labor_cost
    from costed_sessions
    group by client_id, quote_id, employee_id
  ),
  work_rows as (
    select
      client_id,
      max(client_name) as client_name,
      quote_id,
      max(quote_label) as quote_label,
      max(quote_total_price) as sale_value,
      sum(productive_seconds)::integer as productive_seconds,
      floor(sum(productive_seconds) / 60)::integer as productive_minutes,
      count(distinct employee_id)::integer as employee_count,
      count(distinct piece_key) filter (where piece_key <> '__sem_peca__')::integer as piece_count,
      coalesce(sum(labor_cost), 0)::numeric(14,2) as labor_cost,
      sum(missing_cost_flag)::integer as missing_cost_activities,
      sum(case when hourly_cost is null then productive_seconds else 0 end)::integer as missing_cost_seconds
    from costed_sessions
    group by client_id, quote_id
  ),
  sale_totals as (
    select coalesce(sum(sale_value), 0)::numeric(14,2) as sale_value
    from (
      select distinct quote_id, quote_total_price as sale_value
      from costed_sessions
      where quote_id is not null and quote_total_price is not null and quote_total_price > 0
    ) quotes
  ),
  summary as (
    select
      floor(coalesce(sum(productive_seconds), 0) / 60)::integer as productive_minutes,
      coalesce(sum(labor_cost), 0)::numeric(14,2) as labor_cost,
      coalesce((select sale_value from sale_totals), 0)::numeric(14,2) as sale_value,
      sum(missing_cost_flag)::integer as missing_cost_activities,
      sum(case when hourly_cost is null then productive_seconds else 0 end)::integer as missing_cost_seconds
    from costed_sessions
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'summary', jsonb_build_object(
      'productiveMinutes', coalesce((select productive_minutes from summary), 0),
      'laborCost', coalesce((select labor_cost from summary), 0),
      'saleValue', coalesce((select sale_value from summary), 0),
      'laborSalePercent', case when coalesce((select sale_value from summary), 0) > 0 then round((coalesce((select labor_cost from summary), 0) / (select sale_value from summary)) * 100, 2) else null end,
      'missingCostActivities', coalesce((select missing_cost_activities from summary), 0),
      'missingCostMinutes', floor(coalesce((select missing_cost_seconds from summary), 0) / 60)::integer,
      'isPartialCost', coalesce((select missing_cost_activities from summary), 0) > 0
    ),
    'employees', coalesce((select jsonb_agg(jsonb_build_object(
      'employeeId', employee_id,
      'employeeName', employee_name,
      'currentHourlyCost', current_hourly_cost,
      'productiveMinutes', productive_minutes,
      'laborCost', labor_cost,
      'missingCostActivities', missing_cost_activities,
      'missingCostMinutes', floor(missing_cost_seconds / 60)::integer,
      'isPartialCost', missing_cost_activities > 0
    ) order by labor_cost desc, employee_name) from employee_rows), '[]'::jsonb),
    'functions', coalesce((select jsonb_agg(jsonb_build_object(
      'functionKey', function_key,
      'functionLabel', function_label,
      'productiveMinutes', productive_minutes,
      'laborCost', labor_cost,
      'missingCostActivities', missing_cost_activities,
      'missingCostMinutes', floor(missing_cost_seconds / 60)::integer,
      'isPartialCost', missing_cost_activities > 0
    ) order by labor_cost desc, function_label) from function_rows), '[]'::jsonb),
    'pieces', coalesce((select jsonb_agg(jsonb_build_object(
      'pieceKey', piece_key,
      'pieceLabel', piece_label,
      'pieceTypeKey', piece_type_key,
      'pieceTypeLabel', piece_type_label,
      'clientId', client_id,
      'clientName', client_name,
      'quoteId', quote_id,
      'quoteLabel', quote_label,
      'productiveMinutes', productive_minutes,
      'laborCost', labor_cost,
      'estimatedTargetLaborCost', nullif(estimated_target_labor_cost, 0),
      'laborCostDeviation', case when estimated_target_labor_cost > 0 then labor_cost_deviation else null end,
      'missingCostActivities', missing_cost_activities,
      'missingCostMinutes', floor(missing_cost_seconds / 60)::integer,
      'missingTargetCostFunctions', missing_target_cost_functions,
      'isPartialCost', missing_cost_activities > 0 or missing_target_cost_functions > 0
    ) order by labor_cost desc, piece_label) from piece_rows), '[]'::jsonb),
    'works', coalesce((select jsonb_agg(jsonb_build_object(
      'clientId', client_id,
      'clientName', client_name,
      'quoteId', quote_id,
      'quoteLabel', quote_label,
      'saleValue', sale_value,
      'productiveMinutes', productive_minutes,
      'employeeCount', employee_count,
      'pieceCount', piece_count,
      'laborCost', labor_cost,
      'laborSalePercent', case when coalesce(sale_value, 0) > 0 then round((labor_cost / sale_value) * 100, 2) else null end,
      'missingCostActivities', missing_cost_activities,
      'missingCostMinutes', floor(missing_cost_seconds / 60)::integer,
      'isPartialCost', missing_cost_activities > 0,
      'functions', coalesce((select jsonb_agg(jsonb_build_object(
        'functionKey', wfr.function_key,
        'functionLabel', wfr.function_label,
        'productiveMinutes', wfr.productive_minutes,
        'laborCost', wfr.labor_cost
      ) order by wfr.labor_cost desc, wfr.function_label) from work_function_rows wfr where coalesce(wfr.client_id, '') = coalesce(work_rows.client_id, '') and coalesce(wfr.quote_id, '') = coalesce(work_rows.quote_id, '')), '[]'::jsonb),
      'employees', coalesce((select jsonb_agg(jsonb_build_object(
        'employeeId', wer.employee_id,
        'employeeName', wer.employee_name,
        'productiveMinutes', wer.productive_minutes,
        'laborCost', wer.labor_cost
      ) order by wer.labor_cost desc, wer.employee_name) from work_employee_rows wer where coalesce(wer.client_id, '') = coalesce(work_rows.client_id, '') and coalesce(wer.quote_id, '') = coalesce(work_rows.quote_id, '')), '[]'::jsonb)
    ) order by labor_cost desc, client_name) from work_rows), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_employee_operational_hourly_costs() from public;
revoke all on function public.get_employee_operational_hourly_costs() from anon;
grant execute on function public.get_employee_operational_hourly_costs() to authenticated;

revoke all on function public.save_employee_operational_hourly_cost(text, numeric, date, text, text) from public;
revoke all on function public.save_employee_operational_hourly_cost(text, numeric, date, text, text) from anon;
grant execute on function public.save_employee_operational_hourly_cost(text, numeric, date, text, text) to authenticated;

revoke all on function public.get_employee_production_labor_cost_report(date, date, text, text, text, text, text) from public;
revoke all on function public.get_employee_production_labor_cost_report(date, date, text, text, text, text, text) from anon;
grant execute on function public.get_employee_production_labor_cost_report(date, date, text, text, text, text, text) to authenticated;
