create or replace function public.get_employee_production_report(
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
  v_empresa_id text;
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_from date := coalesce(p_date_from, (timezone('America/Sao_Paulo', now()))::date);
  v_to date := coalesce(p_date_to, coalesce(p_date_from, (timezone('America/Sao_Paulo', now()))::date));
  v_now timestamptz := timezone('utc', now());
  v_has_activity_filter boolean := nullif(btrim(coalesce(p_client_id, '')), '') is not null
    or nullif(btrim(coalesce(p_quote_id, '')), '') is not null
    or nullif(btrim(coalesce(p_piece_key, '')), '') is not null
    or nullif(btrim(coalesce(p_function_key, '')), '') is not null;
  v_result jsonb;
begin
  v_empresa_id := app_private.current_empresa_id();

  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not app_private.employee_has_permission('verRelatorios') then
    raise exception 'Sem permissão para ver relatórios de funcionários.';
  end if;

  if v_to < v_from then
    raise exception 'Período inválido para relatório de produção.';
  end if;

  if (v_to - v_from) > 370 then
    raise exception 'O relatório de produção permite no máximo 370 dias por consulta.';
  end if;

  with all_employees as (
    select e.id, e.name, e.display_name, e.role, e.status
    from public.employees e
    where e.empresa_id = v_empresa_id
  ),
  employee_base as (
    select *
    from all_employees e
    where nullif(btrim(coalesce(p_employee_id, '')), '') is null or e.id = p_employee_id
  ),
  sessions_period as (
    select
      s.id,
      s.employee_id,
      eb.name as employee_name,
      eb.display_name as employee_display_name,
      eb.role as employee_role,
      s.client_id,
      coalesce(nullif(c.name, ''), nullif(s.client_name_snapshot, ''), nullif(q.client_name, ''), 'Cliente não informado') as client_name,
      s.quote_id,
      coalesce(nullif(q.environment, ''), nullif(s.quote_label_snapshot, ''), 'Sem orçamento') as quote_label,
      s.function_key,
      s.function_label,
      coalesce(nullif(s.piece_id, ''), case when nullif(s.piece_label, '') is not null then 'label:' || s.piece_label else '__sem_peca__' end) as piece_key,
      coalesce(nullif(s.piece_label, ''), nullif(q.environment, ''), 'Sem peça específica') as piece_label,
      s.status,
      floor(app_private.employee_effective_productive_seconds(s.started_at, s.ended_at, s.active_pause_started_at, s.paused_total_seconds, v_now) / 60)::integer as productive_minutes,
      case when s.status = 'FINALIZADA' then 1 else 0 end as completed_flag,
      case when s.status = 'ATIVA' and v_today between v_from and v_to then 1 else 0 end as producing_now_flag
    from public.employee_activity_sessions s
    inner join employee_base eb on eb.id = s.employee_id
    left join public.clients c on c.id = s.client_id and c.empresa_id = s.empresa_id
    left join public.quotes q on q.id = s.quote_id and q.empresa_id = s.empresa_id
    where s.empresa_id = v_empresa_id
      and (timezone('America/Sao_Paulo', s.started_at))::date between v_from and v_to
  ),
  filtered_sessions as (
    select *
    from sessions_period s
    where (nullif(btrim(coalesce(p_client_id, '')), '') is null or s.client_id = p_client_id)
      and (nullif(btrim(coalesce(p_quote_id, '')), '') is null or s.quote_id = p_quote_id)
      and (nullif(btrim(coalesce(p_piece_key, '')), '') is null or s.piece_key = p_piece_key)
      and (nullif(btrim(coalesce(p_function_key, '')), '') is null or s.function_key = p_function_key)
  ),
  scope_employees as (
    select eb.*
    from employee_base eb
    where not v_has_activity_filter
      or exists (select 1 from filtered_sessions fs where fs.employee_id = eb.id)
  ),
  attendance_by_employee as (
    select
      a.employee_id,
      coalesce(sum(app_private.employee_effective_worked_minutes(a.check_in_at, a.break_start_at, a.break_end_at, a.check_out_at, v_now))::integer, 0) as worked_minutes
    from public.employee_attendance_records a
    where a.empresa_id = v_empresa_id
      and a.work_date between v_from and v_to
      and exists (select 1 from scope_employees se where se.id = a.employee_id)
    group by a.employee_id
  ),
  overtime_by_employee as (
    select
      o.employee_id,
      coalesce(sum(greatest(floor(extract(epoch from (coalesce(o.ended_at, v_now) - o.started_at)) / 60)::integer, 0)), 0) as overtime_minutes
    from public.employee_overtime_sessions o
    where o.empresa_id = v_empresa_id
      and o.work_date between v_from and v_to
      and exists (select 1 from scope_employees se where se.id = o.employee_id)
    group by o.employee_id
  ),
  session_employee_totals as (
    select
      employee_id,
      coalesce(sum(productive_minutes)::integer, 0) as productive_minutes,
      coalesce(sum(completed_flag)::integer, 0) as completed_activities,
      count(distinct piece_key) filter (where piece_key <> '__sem_peca__')::integer as distinct_pieces
    from filtered_sessions
    group by employee_id
  ),
  employee_rows as (
    select
      se.id,
      coalesce(nullif(se.display_name, ''), se.name) as name,
      se.role,
      coalesce(a.worked_minutes, 0) as worked_minutes,
      coalesce(st.productive_minutes, 0) as productive_minutes,
      coalesce(o.overtime_minutes, 0) as overtime_minutes,
      coalesce(st.completed_activities, 0) as completed_activities,
      coalesce(st.distinct_pieces, 0) as distinct_pieces,
      case when coalesce(st.completed_activities, 0) > 0 then round(coalesce(st.productive_minutes, 0)::numeric / st.completed_activities, 2) else 0 end as average_minutes_per_activity,
      case when coalesce(a.worked_minutes, 0) > 0 then round((coalesce(st.productive_minutes, 0)::numeric / a.worked_minutes) * 100, 2) else 0 end as productivity_percent
    from scope_employees se
    left join attendance_by_employee a on a.employee_id = se.id
    left join overtime_by_employee o on o.employee_id = se.id
    left join session_employee_totals st on st.employee_id = se.id
  ),
  work_function_rows as (
    select
      client_id,
      quote_id,
      function_key,
      max(function_label) as function_label,
      coalesce(sum(productive_minutes)::integer, 0) as productive_minutes
    from filtered_sessions
    group by client_id, quote_id, function_key
  ),
  work_rows as (
    select
      fs.client_id,
      max(fs.client_name) as client_name,
      fs.quote_id,
      max(fs.quote_label) as quote_label,
      coalesce(sum(fs.productive_minutes)::integer, 0) as productive_minutes,
      count(distinct fs.employee_id)::integer as employee_count,
      count(distinct fs.piece_key) filter (where fs.piece_key <> '__sem_peca__')::integer as piece_count,
      coalesce(sum(fs.completed_flag)::integer, 0) as completed_activities
    from filtered_sessions fs
    group by fs.client_id, fs.quote_id
  ),
  piece_detail_rows as (
    select
      piece_key,
      employee_id,
      max(coalesce(nullif(employee_display_name, ''), employee_name)) as employee_name,
      function_key,
      max(function_label) as function_label,
      coalesce(sum(productive_minutes)::integer, 0) as productive_minutes
    from filtered_sessions
    where piece_key <> '__sem_peca__'
    group by piece_key, employee_id, function_key
  ),
  piece_function_rows as (
    select
      piece_key,
      function_key,
      max(function_label) as function_label,
      coalesce(sum(productive_minutes)::integer, 0) as productive_minutes
    from filtered_sessions
    where piece_key <> '__sem_peca__'
    group by piece_key, function_key
  ),
  piece_rows as (
    select
      fs.piece_key,
      max(fs.piece_label) as piece_label,
      max(fs.client_id) as client_id,
      max(fs.client_name) as client_name,
      max(fs.quote_id) as quote_id,
      max(fs.quote_label) as quote_label,
      coalesce(sum(fs.productive_minutes)::integer, 0) as productive_minutes,
      count(distinct fs.employee_id)::integer as employee_count,
      coalesce(sum(fs.completed_flag)::integer, 0) as completed_activities
    from filtered_sessions fs
    where fs.piece_key <> '__sem_peca__'
    group by fs.piece_key
  ),
  function_rows as (
    select
      fs.function_key,
      max(fs.function_label) as function_label,
      coalesce(sum(fs.productive_minutes)::integer, 0) as productive_minutes,
      coalesce(sum(fs.completed_flag)::integer, 0) as completed_activities,
      count(distinct fs.employee_id)::integer as employee_count,
      count(distinct fs.piece_key) filter (where fs.piece_key <> '__sem_peca__')::integer as piece_count
    from filtered_sessions fs
    group by fs.function_key
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'summary', jsonb_build_object(
      'workedMinutes', coalesce((select sum(worked_minutes)::integer from employee_rows), 0),
      'productiveMinutes', coalesce((select sum(productive_minutes)::integer from employee_rows), 0),
      'overtimeMinutes', coalesce((select sum(overtime_minutes)::integer from employee_rows), 0),
      'completedActivities', coalesce((select sum(completed_activities)::integer from employee_rows), 0),
      'distinctPieces', coalesce((select count(distinct piece_key)::integer from filtered_sessions where piece_key <> '__sem_peca__'), 0),
      'producingNow', coalesce((select count(distinct employee_id)::integer from filtered_sessions where producing_now_flag = 1), 0),
      'productivityPercent', coalesce((select case when sum(worked_minutes) > 0 then round((sum(productive_minutes)::numeric / sum(worked_minutes)) * 100, 2) else 0 end from employee_rows), 0)
    ),
    'employees', coalesce((select jsonb_agg(jsonb_build_object(
      'employeeId', id,
      'employeeName', name,
      'role', role,
      'workedMinutes', worked_minutes,
      'productiveMinutes', productive_minutes,
      'overtimeMinutes', overtime_minutes,
      'completedActivities', completed_activities,
      'distinctPieces', distinct_pieces,
      'averageMinutesPerActivity', average_minutes_per_activity,
      'productivityPercent', productivity_percent
    ) order by productive_minutes desc, name asc) from employee_rows), '[]'::jsonb),
    'works', coalesce((select jsonb_agg(jsonb_build_object(
      'clientId', client_id,
      'clientName', client_name,
      'quoteId', quote_id,
      'quoteLabel', quote_label,
      'productiveMinutes', productive_minutes,
      'employeeCount', employee_count,
      'pieceCount', piece_count,
      'completedActivities', completed_activities,
      'functions', coalesce((select jsonb_agg(jsonb_build_object(
        'functionKey', wfr.function_key,
        'functionLabel', wfr.function_label,
        'productiveMinutes', wfr.productive_minutes
      ) order by wfr.productive_minutes desc) from work_function_rows wfr where coalesce(wfr.client_id, '') = coalesce(work_rows.client_id, '') and coalesce(wfr.quote_id, '') = coalesce(work_rows.quote_id, '')), '[]'::jsonb)
    ) order by productive_minutes desc, client_name asc) from work_rows), '[]'::jsonb),
    'pieces', coalesce((select jsonb_agg(jsonb_build_object(
      'pieceKey', piece_key,
      'pieceLabel', piece_label,
      'clientId', client_id,
      'clientName', client_name,
      'quoteId', quote_id,
      'quoteLabel', quote_label,
      'productiveMinutes', productive_minutes,
      'employeeCount', employee_count,
      'completedActivities', completed_activities,
      'functions', coalesce((select jsonb_agg(jsonb_build_object(
        'functionKey', pfr.function_key,
        'functionLabel', pfr.function_label,
        'productiveMinutes', pfr.productive_minutes
      ) order by pfr.productive_minutes desc) from piece_function_rows pfr where pfr.piece_key = piece_rows.piece_key), '[]'::jsonb),
      'details', coalesce((select jsonb_agg(jsonb_build_object(
        'employeeId', pdr.employee_id,
        'employeeName', pdr.employee_name,
        'functionKey', pdr.function_key,
        'functionLabel', pdr.function_label,
        'productiveMinutes', pdr.productive_minutes
      ) order by pdr.productive_minutes desc, pdr.employee_name asc) from piece_detail_rows pdr where pdr.piece_key = piece_rows.piece_key), '[]'::jsonb)
    ) order by productive_minutes desc, piece_label asc) from piece_rows), '[]'::jsonb),
    'functions', coalesce((select jsonb_agg(jsonb_build_object(
      'functionKey', function_key,
      'functionLabel', function_label,
      'productiveMinutes', productive_minutes,
      'completedActivities', completed_activities,
      'employeeCount', employee_count,
      'pieceCount', piece_count
    ) order by productive_minutes desc, function_label asc) from function_rows), '[]'::jsonb),
    'filterOptions', jsonb_build_object(
      'employees', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', coalesce(nullif(display_name, ''), name)) order by coalesce(nullif(display_name, ''), name)) from all_employees), '[]'::jsonb),
      'clients', coalesce((select jsonb_agg(jsonb_build_object('id', client_id, 'label', client_name) order by client_name) from (select distinct client_id, client_name from sessions_period where client_id is not null) c), '[]'::jsonb),
      'quotes', coalesce((select jsonb_agg(jsonb_build_object('id', quote_id, 'label', quote_label, 'clientId', client_id) order by quote_label) from (select distinct quote_id, quote_label, client_id from sessions_period where quote_id is not null) q), '[]'::jsonb),
      'pieces', coalesce((select jsonb_agg(jsonb_build_object('id', piece_key, 'label', piece_label) order by piece_label) from (select distinct piece_key, piece_label from sessions_period where piece_key <> '__sem_peca__') p), '[]'::jsonb),
      'functions', coalesce((select jsonb_agg(jsonb_build_object('id', key, 'label', label) order by sort_order, label) from public.employee_function_catalog where empresa_id = v_empresa_id and active = true), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_employee_production_report(date, date, text, text, text, text, text) from public;
revoke all on function public.get_employee_production_report(date, date, text, text, text, text, text) from anon;
grant execute on function public.get_employee_production_report(date, date, text, text, text, text, text) to authenticated;
