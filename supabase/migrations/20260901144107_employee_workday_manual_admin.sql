alter table public.employee_attendance_records
  add column if not exists break_start_request_key text,
  add column if not exists break_end_request_key text,
  add column if not exists recorded_source text not null default 'SELF',
  add column if not exists manual_reason text;

alter table public.employee_overtime_sessions
  add column if not exists recorded_source text not null default 'SELF',
  add column if not exists manual_reason text,
  add column if not exists manual_actor_uid text,
  add column if not exists manual_actor_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_attendance_records'::regclass
      and conname = 'employee_attendance_recorded_source_check'
  ) then
    alter table public.employee_attendance_records
      add constraint employee_attendance_recorded_source_check check (recorded_source in ('SELF', 'MANUAL'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_overtime_sessions'::regclass
      and conname = 'employee_overtime_recorded_source_check'
  ) then
    alter table public.employee_overtime_sessions
      add constraint employee_overtime_recorded_source_check check (recorded_source in ('SELF', 'MANUAL'));
  end if;
end $$;

create unique index if not exists employee_attendance_break_start_request
  on public.employee_attendance_records(empresa_id, break_start_request_key)
  where break_start_request_key is not null;

create unique index if not exists employee_attendance_break_end_request
  on public.employee_attendance_records(empresa_id, break_end_request_key)
  where break_end_request_key is not null;

create table if not exists public.employee_attendance_manual_audit (
  id text primary key default app_private.make_entity_id(),
  empresa_id text not null references public.empresas(id) on update cascade,
  employee_id text not null references public.employees(id) on update cascade on delete restrict,
  attendance_record_id text references public.employee_attendance_records(id) on update cascade on delete set null,
  work_date date not null,
  actor_uid text not null,
  actor_name text,
  action text not null,
  previous_values jsonb,
  next_values jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.employee_attendance_manual_audit enable row level security;

drop policy if exists employee_attendance_manual_audit_select on public.employee_attendance_manual_audit;
create policy employee_attendance_manual_audit_select
on public.employee_attendance_manual_audit
for select
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('verRelatorios'));

create index if not exists employee_attendance_manual_audit_employee_date
  on public.employee_attendance_manual_audit(empresa_id, employee_id, work_date desc, created_at desc);

create or replace function app_private.employee_manual_attendance_payload(
  p_status text,
  p_check_in_at timestamptz,
  p_break_start_at timestamptz,
  p_break_end_at timestamptz,
  p_check_out_at timestamptz,
  p_overtime_start_at timestamptz,
  p_overtime_end_at timestamptz,
  p_notes text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'status', p_status,
    'checkInAt', p_check_in_at,
    'breakStartAt', p_break_start_at,
    'breakEndAt', p_break_end_at,
    'checkOutAt', p_check_out_at,
    'overtimeStartAt', p_overtime_start_at,
    'overtimeEndAt', p_overtime_end_at,
    'notes', p_notes
  );
$$;

create or replace function public.start_my_break(p_request_key text default null)
returns public.employee_attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_employee_id text := app_private.current_employee_id();
  v_now timestamptz := timezone('utc', now());
  v_work_date date := (timezone('America/Sao_Paulo', now()))::date;
  v_result public.employee_attendance_records%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null or v_employee_id is null then
    raise exception 'Funcionario vinculado nao identificado.';
  end if;
  if not app_private.employee_has_permission('visualizar') then
    raise exception 'Sem permissao para iniciar intervalo.';
  end if;

  if nullif(btrim(coalesce(p_request_key, '')), '') is not null then
    select * into v_result
    from public.employee_attendance_records
    where empresa_id = v_empresa_id and break_start_request_key = btrim(p_request_key)
    limit 1;
    if v_result.id is not null then return v_result; end if;
  end if;

  update public.employee_attendance_records
  set break_start_at = v_now,
      break_start_request_key = nullif(btrim(coalesce(p_request_key, '')), ''),
      updated_by_uid = auth.uid()::text,
      updated_at = v_now
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id
    and work_date = v_work_date
    and check_in_at is not null
    and check_out_at is null
    and break_start_at is null
    and status = 'PRESENTE'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Intervalo indisponivel para o estado atual.';
  end if;
  return v_result;
end;
$$;

create or replace function public.resume_my_workday(p_request_key text default null)
returns public.employee_attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_employee_id text := app_private.current_employee_id();
  v_now timestamptz := timezone('utc', now());
  v_work_date date := (timezone('America/Sao_Paulo', now()))::date;
  v_result public.employee_attendance_records%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null or v_employee_id is null then
    raise exception 'Funcionario vinculado nao identificado.';
  end if;
  if not app_private.employee_has_permission('visualizar') then
    raise exception 'Sem permissao para retomar expediente.';
  end if;

  if nullif(btrim(coalesce(p_request_key, '')), '') is not null then
    select * into v_result
    from public.employee_attendance_records
    where empresa_id = v_empresa_id and break_end_request_key = btrim(p_request_key)
    limit 1;
    if v_result.id is not null then return v_result; end if;
  end if;

  update public.employee_attendance_records
  set break_end_at = v_now,
      break_end_request_key = nullif(btrim(coalesce(p_request_key, '')), ''),
      updated_by_uid = auth.uid()::text,
      updated_at = v_now
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id
    and work_date = v_work_date
    and check_in_at is not null
    and check_out_at is null
    and break_start_at is not null
    and break_end_at is null
    and status = 'PRESENTE'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Nao existe intervalo aberto para retomar.';
  end if;
  return v_result;
end;
$$;

create or replace function public.finish_my_workday(p_request_key text default null)
returns public.employee_attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_employee_id text := app_private.current_employee_id();
  v_now timestamptz := timezone('utc', now());
  v_work_date date := (timezone('America/Sao_Paulo', now()))::date;
  v_result public.employee_attendance_records%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null or v_employee_id is null then raise exception 'Funcionario vinculado nao identificado.'; end if;
  if not app_private.employee_has_permission('visualizar') then raise exception 'Sem permissao para finalizar expediente.'; end if;
  if nullif(btrim(coalesce(p_request_key, '')), '') is not null then
    select * into v_result from public.employee_attendance_records
    where empresa_id = v_empresa_id and check_out_request_key = btrim(p_request_key) limit 1;
    if v_result.id is not null then return v_result; end if;
  end if;
  update public.employee_attendance_records
  set check_out_at = v_now,
      worked_minutes = app_private.employee_effective_worked_minutes(check_in_at, break_start_at, break_end_at, v_now, v_now),
      overtime_minutes = greatest(app_private.employee_effective_worked_minutes(check_in_at, break_start_at, break_end_at, v_now, v_now) - expected_minutes, 0),
      check_out_request_key = nullif(btrim(coalesce(p_request_key, '')), ''),
      updated_by_uid = auth.uid()::text,
      updated_at = v_now
  where empresa_id = v_empresa_id and employee_id = v_employee_id and work_date = v_work_date
    and check_in_at is not null and check_out_at is null
    and (break_start_at is null or break_end_at is not null)
    and status = 'PRESENTE'
  returning * into v_result;
  if v_result.id is null then raise exception 'Nao existe expediente aberto pronto para finalizar.'; end if;
  return v_result;
end;
$$;

create or replace function public.save_employee_attendance_manual(
  p_employee_id text,
  p_work_date date,
  p_status text,
  p_check_in_at timestamptz,
  p_break_start_at timestamptz,
  p_break_end_at timestamptz,
  p_check_out_at timestamptz,
  p_overtime_start_at timestamptz,
  p_overtime_end_at timestamptz,
  p_notes text,
  p_actor_uid text,
  p_actor_name text
)
returns public.employee_attendance_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_status text := upper(trim(coalesce(p_status, 'PRESENTE')));
  v_expected_minutes integer := 0;
  v_worked_minutes integer := 0;
  v_overtime_minutes integer := 0;
  v_existing public.employee_attendance_records%rowtype;
  v_result public.employee_attendance_records%rowtype;
  v_overtime public.employee_overtime_sessions%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_empresa_id is null then raise exception 'Empresa nao identificada.'; end if;
  if not app_private.current_user_can_manage_employees() then raise exception 'Voce nao tem permissao para registrar expediente manual.'; end if;
  if v_status not in ('PRESENTE', 'AUSENTE', 'FOLGA', 'FERIAS', 'AFASTADO') then raise exception 'Status da jornada invalido.'; end if;
  if p_work_date is null then raise exception 'Informe a data do expediente.'; end if;

  if not exists (select 1 from public.employees where id = p_employee_id and empresa_id = v_empresa_id) then
    raise exception 'Funcionario nao encontrado.';
  end if;

  select * into v_existing
  from public.employee_attendance_records
  where empresa_id = v_empresa_id and employee_id = p_employee_id and work_date = p_work_date
  for update;

  if v_status in ('FOLGA', 'AFASTADO')
     and (
       p_check_in_at is not null or p_break_start_at is not null or p_break_end_at is not null or p_check_out_at is not null
       or exists (
         select 1 from public.employee_activity_sessions
         where empresa_id = v_empresa_id and employee_id = p_employee_id and started_at::date = p_work_date
       )
       or exists (
         select 1 from public.employee_overtime_sessions
         where empresa_id = v_empresa_id and employee_id = p_employee_id and work_date = p_work_date
       )
     ) then
    raise exception 'Este dia possui registros operacionais. Ajuste/remova os horarios antes de marcar como folga ou afastado.';
  end if;

  if p_check_in_at is not null and p_check_out_at is not null and p_check_out_at < p_check_in_at then raise exception 'Horario de saida nao pode ser anterior ao de entrada.'; end if;
  if p_break_start_at is not null and p_check_in_at is not null and p_break_start_at < p_check_in_at then raise exception 'Inicio do intervalo invalido.'; end if;
  if p_break_end_at is not null and p_break_start_at is not null and p_break_end_at < p_break_start_at then raise exception 'Retorno do intervalo invalido.'; end if;
  if p_check_out_at is not null and p_break_end_at is not null and p_check_out_at < p_break_end_at then raise exception 'Saida nao pode ser anterior ao retorno do intervalo.'; end if;
  if p_overtime_start_at is not null and p_overtime_end_at is not null and p_overtime_end_at < p_overtime_start_at then raise exception 'Fim da hora extra nao pode ser anterior ao inicio.'; end if;

  select coalesce(expected_minutes, 0)
  into v_expected_minutes
  from public.employee_work_schedules
  where empresa_id = v_empresa_id and employee_id = p_employee_id and weekday = extract(dow from p_work_date)::integer;

  if v_status in ('FOLGA', 'FERIAS', 'AFASTADO') then
    v_expected_minutes := 0;
  end if;

  v_worked_minutes := case
    when v_status = 'PRESENTE' then app_private.employee_effective_worked_minutes(p_check_in_at, p_break_start_at, p_break_end_at, p_check_out_at, v_now)
    else 0
  end;
  v_overtime_minutes := case
    when p_overtime_start_at is not null and p_overtime_end_at is not null
      then floor(extract(epoch from (p_overtime_end_at - p_overtime_start_at)) / 60)::integer
    else greatest(v_worked_minutes - v_expected_minutes, 0)
  end;

  insert into public.employee_attendance_records (
    id, empresa_id, employee_id, work_date, status, check_in_at, break_start_at, break_end_at, check_out_at,
    worked_minutes, expected_minutes, overtime_minutes, notes, recorded_source, manual_reason,
    created_by_uid, created_by_name, updated_by_uid, updated_by_name
  )
  values (
    app_private.make_entity_id(), v_empresa_id, p_employee_id, p_work_date, v_status,
    case when v_status = 'PRESENTE' then p_check_in_at else null end,
    case when v_status = 'PRESENTE' then p_break_start_at else null end,
    case when v_status = 'PRESENTE' then p_break_end_at else null end,
    case when v_status = 'PRESENTE' then p_check_out_at else null end,
    v_worked_minutes, v_expected_minutes, v_overtime_minutes, nullif(left(coalesce(p_notes, ''), 1000), ''),
    'MANUAL', nullif(left(coalesce(p_notes, ''), 1000), ''),
    nullif(trim(coalesce(p_actor_uid, '')), ''), left(trim(coalesce(p_actor_name, '')), 120),
    nullif(trim(coalesce(p_actor_uid, '')), ''), left(trim(coalesce(p_actor_name, '')), 120)
  )
  on conflict (empresa_id, employee_id, work_date) do update
  set status = excluded.status,
      check_in_at = excluded.check_in_at,
      break_start_at = excluded.break_start_at,
      break_end_at = excluded.break_end_at,
      check_out_at = excluded.check_out_at,
      worked_minutes = excluded.worked_minutes,
      expected_minutes = excluded.expected_minutes,
      overtime_minutes = excluded.overtime_minutes,
      notes = excluded.notes,
      recorded_source = 'MANUAL',
      manual_reason = excluded.manual_reason,
      updated_by_uid = excluded.updated_by_uid,
      updated_by_name = excluded.updated_by_name,
      updated_at = v_now
  returning * into v_result;

  if p_overtime_start_at is not null then
    select * into v_overtime
    from public.employee_overtime_sessions
    where empresa_id = v_empresa_id and employee_id = p_employee_id and work_date = p_work_date
    order by created_at desc
    limit 1
    for update;

    if v_overtime.id is null then
      insert into public.employee_overtime_sessions (
        id, empresa_id, employee_id, work_date, started_at, ended_at, status, started_by_uid, ended_by_uid,
        recorded_source, manual_reason, manual_actor_uid, manual_actor_name
      )
      values (
        app_private.make_entity_id(), v_empresa_id, p_employee_id, p_work_date, p_overtime_start_at, p_overtime_end_at,
        case when p_overtime_end_at is null then 'ATIVA' else 'CONCLUIDA' end,
        auth.uid()::text, case when p_overtime_end_at is null then null else auth.uid()::text end,
        'MANUAL', nullif(left(coalesce(p_notes, ''), 1000), ''), nullif(trim(coalesce(p_actor_uid, '')), ''), left(trim(coalesce(p_actor_name, '')), 120)
      );
    else
      update public.employee_overtime_sessions
      set started_at = p_overtime_start_at,
          ended_at = p_overtime_end_at,
          status = case when p_overtime_end_at is null then 'ATIVA' else 'CONCLUIDA' end,
          ended_by_uid = case when p_overtime_end_at is null then null else auth.uid()::text end,
          recorded_source = 'MANUAL',
          manual_reason = nullif(left(coalesce(p_notes, ''), 1000), ''),
          manual_actor_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
          manual_actor_name = left(trim(coalesce(p_actor_name, '')), 120),
          updated_at = v_now
      where id = v_overtime.id;
    end if;
  end if;

  insert into public.employee_attendance_manual_audit (
    empresa_id, employee_id, attendance_record_id, work_date, actor_uid, actor_name, action, previous_values, next_values
  )
  values (
    v_empresa_id, p_employee_id, v_result.id, p_work_date, auth.uid()::text, left(trim(coalesce(p_actor_name, '')), 120),
    case when v_existing.id is null then 'CREATE_MANUAL_ATTENDANCE' else 'UPDATE_MANUAL_ATTENDANCE' end,
    case when v_existing.id is null then null else to_jsonb(v_existing) end,
    app_private.employee_manual_attendance_payload(v_status, p_check_in_at, p_break_start_at, p_break_end_at, p_check_out_at, p_overtime_start_at, p_overtime_end_at, p_notes)
  );

  return v_result;
end;
$$;

create or replace function public.archive_employee(p_employee_id text, p_actor_uid text, p_actor_name text)
returns public.employees
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_result public.employees%rowtype;
begin
  if v_empresa_id is null then raise exception 'Empresa nao identificada.'; end if;
  if not app_private.current_user_can_manage_employees() then raise exception 'Voce nao tem permissao para excluir funcionarios.'; end if;

  update public.employees
  set active = false,
      status = 'INATIVO',
      updated_at = timezone('utc', now())
  where empresa_id = v_empresa_id
    and id = btrim(coalesce(p_employee_id, ''))
  returning * into v_result;

  if v_result.id is null then raise exception 'Funcionario nao encontrado.'; end if;

  insert into public.employee_attendance_manual_audit (
    empresa_id, employee_id, work_date, actor_uid, actor_name, action, previous_values, next_values
  )
  values (
    v_empresa_id, v_result.id, (timezone('America/Sao_Paulo', now()))::date, auth.uid()::text, left(trim(coalesce(p_actor_name, '')), 120),
    'ARCHIVE_EMPLOYEE', null, jsonb_build_object('active', false, 'status', 'INATIVO')
  );

  return v_result;
end;
$$;

create or replace function public.get_my_employee_operation()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with context as (
    select
      app_private.current_empresa_id() as empresa_id,
      app_private.current_employee_id() as employee_id,
      (timezone('America/Sao_Paulo', now()))::date as work_date,
      extract(dow from timezone('America/Sao_Paulo', now()))::integer as weekday
  )
  select jsonb_build_object(
    'employee', jsonb_build_object('id', e.id, 'name', e.name, 'displayName', e.display_name),
    'schedule', jsonb_build_object('isWorkingDay', coalesce(s.is_working_day, false), 'startTime', s.start_time, 'endTime', s.end_time, 'breakMinutes', coalesce(s.break_minutes, 0)),
    'attendance', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'workDate', a.work_date, 'status', a.status, 'checkInAt', a.check_in_at,
      'breakStartAt', a.break_start_at, 'breakEndAt', a.break_end_at, 'checkOutAt', a.check_out_at,
      'workedMinutes', a.worked_minutes, 'expectedMinutes', a.expected_minutes, 'recordedSource', a.recorded_source
    ) end,
    'overtime', case when o.id is null then null else jsonb_build_object('id', o.id, 'startedAt', o.started_at, 'endedAt', o.ended_at, 'status', o.status, 'recordedSource', o.recorded_source) end,
    'activity', case when activity.id is null then null else jsonb_build_object('id', activity.id, 'status', activity.status, 'functionLabel', activity.function_label, 'clientName', activity.client_name_snapshot, 'quoteLabel', activity.quote_label_snapshot, 'startedAt', activity.started_at, 'pausedTotalSeconds', activity.paused_total_seconds, 'activePauseStartedAt', activity.active_pause_started_at) end
  )
  from context c
  join public.employees e on e.empresa_id = c.empresa_id and e.id = c.employee_id and e.active is true
  left join public.employee_work_schedules s on s.empresa_id = c.empresa_id and s.employee_id = c.employee_id and s.weekday = c.weekday
  left join public.employee_attendance_records a on a.empresa_id = c.empresa_id and a.employee_id = c.employee_id and a.work_date = c.work_date
  left join public.employee_overtime_sessions o on o.empresa_id = c.empresa_id and o.employee_id = c.employee_id and o.status = 'ATIVA'
  left join lateral (select x.* from public.employee_activity_sessions x where x.empresa_id = c.empresa_id and x.employee_id = c.employee_id and x.status in ('ATIVA', 'PAUSADA') order by x.started_at desc limit 1) activity on true;
$$;

create or replace view public.employee_operational_overview
with (security_invoker = true)
as
with current_reference as (
  select timezone('utc', now()) as now_utc, (timezone('America/Sao_Paulo', now()))::date as today
)
select
  e.id as employee_id,
  e.empresa_id,
  e.name as employee_name,
  coalesce(nullif(e.display_name, ''), e.name) as employee_display_name,
  e.role as employee_role,
  e.status as employee_status,
  e.active as employee_active,
  e.phone as employee_phone,
  e.admission_date,
  e.notes as employee_notes,
  e.photo_url,
  e.thumbnail_url,
  e.medium_url,
  e.original_url,
  coalesce(functions.items, '[]'::jsonb) as function_assignments,
  attendance.id as attendance_id,
  attendance.work_date as attendance_work_date,
  attendance.status as attendance_status,
  attendance.check_in_at as attendance_check_in_at,
  attendance.break_start_at as attendance_break_start_at,
  attendance.break_end_at as attendance_break_end_at,
  attendance.check_out_at as attendance_check_out_at,
  app_private.employee_effective_worked_minutes(attendance.check_in_at, attendance.break_start_at, attendance.break_end_at, attendance.check_out_at, ref.now_utc) as attendance_worked_minutes,
  attendance.expected_minutes as attendance_expected_minutes,
  greatest(app_private.employee_effective_worked_minutes(attendance.check_in_at, attendance.break_start_at, attendance.break_end_at, attendance.check_out_at, ref.now_utc) - attendance.expected_minutes, 0) as attendance_overtime_minutes,
  session_current.id as current_session_id,
  session_current.status as current_session_status,
  session_current.function_key as current_function_key,
  session_current.function_label as current_function_label,
  session_current.linked_production_step as current_linked_production_step,
  session_current.client_id as current_client_id,
  coalesce(client_current.name, nullif(session_current.client_name_snapshot, '')) as current_client_name,
  session_current.quote_id as current_quote_id,
  coalesce(nullif(quote_current.environment, ''), nullif(session_current.quote_label_snapshot, '')) as current_quote_label,
  session_current.piece_id as current_piece_id,
  session_current.piece_label as current_piece_label,
  session_current.started_at as current_started_at,
  session_current.active_pause_started_at as current_active_pause_started_at,
  session_current.paused_total_seconds as current_paused_total_seconds,
  floor(app_private.employee_effective_productive_seconds(session_current.started_at, session_current.ended_at, session_current.active_pause_started_at, session_current.paused_total_seconds, ref.now_utc) / 60)::integer as current_productive_minutes,
  coalesce(today_summary.worked_minutes, 0) as today_worked_minutes,
  coalesce(today_summary.productive_minutes, 0) as today_productive_minutes,
  greatest(coalesce(today_summary.worked_minutes, 0) - coalesce(today_summary.productive_minutes, 0), 0) as today_idle_minutes,
  coalesce(today_summary.overtime_minutes, 0) as today_overtime_minutes,
  coalesce(today_summary.completed_activities, 0) as today_completed_activities,
  coalesce(month_summary.worked_minutes, 0) as month_worked_minutes,
  coalesce(month_summary.productive_minutes, 0) as month_productive_minutes,
  greatest(coalesce(month_summary.worked_minutes, 0) - coalesce(month_summary.productive_minutes, 0), 0) as month_idle_minutes,
  coalesce(month_summary.overtime_minutes, 0) as month_overtime_minutes,
  coalesce(month_summary.completed_activities, 0) as month_completed_activities
from public.employees e
cross join current_reference ref
left join lateral (
  select jsonb_agg(jsonb_build_object('id', assignment.id, 'employeeId', assignment.employee_id, 'functionKey', assignment.function_key, 'functionLabel', assignment.function_label, 'linkedProductionStep', assignment.linked_production_step, 'isPrimary', assignment.is_primary) order by assignment.is_primary desc, assignment.function_label asc) as items
  from public.employee_function_assignments assignment
  where assignment.empresa_id = e.empresa_id and assignment.employee_id = e.id
) functions on true
left join lateral (
  select record.*
  from public.employee_attendance_records record
  where record.empresa_id = e.empresa_id and record.employee_id = e.id and record.work_date = ref.today
  order by record.updated_at desc
  limit 1
) attendance on true
left join lateral (
  select session.*
  from public.employee_activity_sessions session
  where session.empresa_id = e.empresa_id and session.employee_id = e.id and session.status in ('ATIVA', 'PAUSADA')
  order by session.started_at desc
  limit 1
) session_current on true
left join public.clients client_current on client_current.id = session_current.client_id and client_current.empresa_id = e.empresa_id
left join public.quotes quote_current on quote_current.id = session_current.quote_id and quote_current.empresa_id = e.empresa_id
left join lateral (
  select
    coalesce((select sum(app_private.employee_effective_worked_minutes(record.check_in_at, record.break_start_at, record.break_end_at, record.check_out_at, ref.now_utc))::integer from public.employee_attendance_records record where record.empresa_id = e.empresa_id and record.employee_id = e.id and record.work_date = ref.today), 0) as worked_minutes,
    coalesce((select sum(record.overtime_minutes)::integer from public.employee_attendance_records record where record.empresa_id = e.empresa_id and record.employee_id = e.id and record.work_date = ref.today), 0) as overtime_minutes,
    coalesce((select sum(floor(app_private.employee_effective_productive_seconds(session.started_at, session.ended_at, session.active_pause_started_at, session.paused_total_seconds, ref.now_utc) / 60)::integer)::integer from public.employee_activity_sessions session where session.empresa_id = e.empresa_id and session.employee_id = e.id and session.started_at::date = ref.today), 0) as productive_minutes,
    coalesce((select count(*)::integer from public.employee_activity_sessions session where session.empresa_id = e.empresa_id and session.employee_id = e.id and session.status = 'FINALIZADA' and session.ended_at::date = ref.today), 0) as completed_activities
) today_summary on true
left join lateral (
  select
    coalesce((select sum(record.worked_minutes)::integer from public.employee_attendance_records record where record.empresa_id = e.empresa_id and record.employee_id = e.id and date_trunc('month', record.work_date::timestamp) = date_trunc('month', ref.today::timestamp)), 0) as worked_minutes,
    coalesce((select sum(record.overtime_minutes)::integer from public.employee_attendance_records record where record.empresa_id = e.empresa_id and record.employee_id = e.id and date_trunc('month', record.work_date::timestamp) = date_trunc('month', ref.today::timestamp)), 0) as overtime_minutes,
    coalesce((select sum(floor(app_private.employee_effective_productive_seconds(session.started_at, session.ended_at, session.active_pause_started_at, session.paused_total_seconds, ref.now_utc) / 60)::integer)::integer from public.employee_activity_sessions session where session.empresa_id = e.empresa_id and session.employee_id = e.id and date_trunc('month', session.started_at) = date_trunc('month', ref.today::timestamptz)), 0) as productive_minutes,
    coalesce((select count(*)::integer from public.employee_activity_sessions session where session.empresa_id = e.empresa_id and session.employee_id = e.id and session.status = 'FINALIZADA' and date_trunc('month', session.started_at) = date_trunc('month', ref.today::timestamptz)), 0) as completed_activities
) month_summary on true
where e.empresa_id = app_private.current_empresa_id();

revoke all on function public.start_my_break(text), public.resume_my_workday(text), public.save_employee_attendance_manual(text, date, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text), public.archive_employee(text, text, text) from public, anon;
grant execute on function public.start_my_break(text), public.resume_my_workday(text), public.save_employee_attendance_manual(text, date, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text), public.archive_employee(text, text, text) to authenticated;
grant select on public.employee_attendance_manual_audit to authenticated;
