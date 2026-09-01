-- Keep the operational point immutable in intent: server timestamps, one daily record,
-- and an explicit overtime history. Existing schedules remain the source of planned hours.
alter table public.employee_attendance_records
  add column if not exists scheduled_start_time time,
  add column if not exists scheduled_end_time time,
  add column if not exists scheduled_break_minutes integer,
  add column if not exists check_in_request_key text,
  add column if not exists check_out_request_key text;

create table if not exists public.employee_overtime_sessions (
  id text primary key default app_private.make_entity_id(),
  empresa_id text not null references public.empresas(id) on update cascade,
  employee_id text not null references public.employees(id) on update cascade on delete restrict,
  work_date date not null,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  status text not null default 'ATIVA' check (status in ('ATIVA', 'CONCLUIDA')),
  started_by_uid text not null,
  ended_by_uid text,
  start_request_key text,
  finish_request_key text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists employee_overtime_one_open_session
  on public.employee_overtime_sessions(empresa_id, employee_id)
  where status = 'ATIVA';
create unique index if not exists employee_overtime_start_request
  on public.employee_overtime_sessions(empresa_id, start_request_key)
  where start_request_key is not null;
create unique index if not exists employee_overtime_finish_request
  on public.employee_overtime_sessions(empresa_id, finish_request_key)
  where finish_request_key is not null;
create index if not exists employee_overtime_history
  on public.employee_overtime_sessions(empresa_id, employee_id, work_date desc, started_at desc);
create unique index if not exists employee_attendance_check_in_request
  on public.employee_attendance_records(empresa_id, check_in_request_key)
  where check_in_request_key is not null;
create unique index if not exists employee_attendance_check_out_request
  on public.employee_attendance_records(empresa_id, check_out_request_key)
  where check_out_request_key is not null;

drop trigger if exists set_updated_at_employee_overtime_sessions on public.employee_overtime_sessions;
create trigger set_updated_at_employee_overtime_sessions
before update on public.employee_overtime_sessions
for each row execute function public.set_updated_at();

create or replace function app_private.employee_has_permission(p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where u.empresa_id = app_private.current_empresa_id()
      and (u.auth_user_id = (select auth.uid()) or u.id = (select auth.uid())::text)
      and u.blocked is not true
      and case
        when u.permissions #> array['funcionarios', p_action] is not null
          then coalesce((u.permissions #>> array['funcionarios', p_action])::boolean, false)
        when u.role in ('administrativo', 'coordenador') then true
        when u.role = 'liberacao' then p_action in ('visualizar', 'apontar')
        else false
      end
  );
$$;

create or replace function app_private.vehicle_report_has_permission()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.empresa_id = app_private.current_empresa_id()
      and (u.auth_user_id = (select auth.uid()) or u.id = (select auth.uid())::text)
      and u.blocked is not true
      and case
        when u.permissions #> array['veiculos', 'verRelatorios'] is not null
          then coalesce((u.permissions #>> array['veiculos', 'verRelatorios'])::boolean, false)
        else u.role in ('administrativo', 'coordenador')
      end
  );
$$;

create or replace function app_private.employee_can_operate_activity(p_employee_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.employee_has_permission('apontar')
    and (
      btrim(coalesce(p_employee_id, '')) = app_private.current_employee_id()
      or app_private.employee_has_permission('verRelatorios')
    );
$$;

create or replace function public.start_my_workday(p_request_key text default null)
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
  v_schedule public.employee_work_schedules%rowtype;
  v_result public.employee_attendance_records%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null or v_employee_id is null then raise exception 'Funcionário vinculado não identificado.'; end if;
  if not app_private.employee_has_permission('visualizar') then raise exception 'Sem permissão para iniciar expediente.'; end if;
  if nullif(btrim(coalesce(p_request_key, '')), '') is not null then
    select * into v_result from public.employee_attendance_records
    where empresa_id = v_empresa_id and check_in_request_key = btrim(p_request_key) limit 1;
    if v_result.id is not null then return v_result; end if;
  end if;
  select * into v_schedule from public.employee_work_schedules
  where empresa_id = v_empresa_id and employee_id = v_employee_id
    and weekday = extract(dow from v_work_date)::integer;
  if coalesce(v_schedule.is_working_day, false) is not true then raise exception 'Não há jornada configurada para hoje.'; end if;
  insert into public.employee_attendance_records (
    id, empresa_id, employee_id, work_date, status, check_in_at, expected_minutes,
    scheduled_start_time, scheduled_end_time, scheduled_break_minutes,
    created_by_uid, updated_by_uid, check_in_request_key
  ) values (
    app_private.make_entity_id(), v_empresa_id, v_employee_id, v_work_date, 'PRESENTE', v_now,
    coalesce(v_schedule.expected_minutes, 0), v_schedule.start_time, v_schedule.end_time,
    coalesce(v_schedule.break_minutes, 0), auth.uid()::text, auth.uid()::text,
    nullif(btrim(coalesce(p_request_key, '')), '')
  ) on conflict (empresa_id, employee_id, work_date) do nothing
  returning * into v_result;
  if v_result.id is null then raise exception 'O expediente de hoje já foi iniciado.'; end if;
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
  if auth.uid() is null or v_empresa_id is null or v_employee_id is null then raise exception 'Funcionário vinculado não identificado.'; end if;
  if not app_private.employee_has_permission('visualizar') then raise exception 'Sem permissão para finalizar expediente.'; end if;
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
  returning * into v_result;
  if v_result.id is null then raise exception 'Não existe expediente aberto para finalizar.'; end if;
  return v_result;
end;
$$;

create or replace function public.start_my_overtime(p_request_key text default null)
returns public.employee_overtime_sessions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id(); v_employee_id text := app_private.current_employee_id();
  v_now timestamptz := timezone('utc', now()); v_result public.employee_overtime_sessions%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null or v_employee_id is null then raise exception 'Funcionário vinculado não identificado.'; end if;
  if not app_private.employee_has_permission('visualizar') then raise exception 'Sem permissão para registrar hora extra.'; end if;
  if nullif(btrim(coalesce(p_request_key, '')), '') is not null then
    select * into v_result from public.employee_overtime_sessions
    where empresa_id = v_empresa_id and start_request_key = btrim(p_request_key) limit 1;
    if v_result.id is not null then return v_result; end if;
  end if;
  if exists (select 1 from public.employee_attendance_records where empresa_id=v_empresa_id and employee_id=v_employee_id and work_date=(timezone('America/Sao_Paulo', now()))::date and check_out_at is null) then raise exception 'Finalize o expediente antes de iniciar hora extra.'; end if;
  insert into public.employee_overtime_sessions (id, empresa_id, employee_id, work_date, started_at, status, started_by_uid, start_request_key)
  values (app_private.make_entity_id(), v_empresa_id, v_employee_id, (timezone('America/Sao_Paulo', now()))::date, v_now, 'ATIVA', auth.uid()::text, nullif(btrim(coalesce(p_request_key,'')),''))
  returning * into v_result;
  return v_result;
exception when unique_violation then raise exception 'Já existe uma hora extra em andamento.'; end;
$$;

create or replace function public.finish_my_overtime(p_session_id text, p_request_key text default null)
returns public.employee_overtime_sessions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_empresa_id text := app_private.current_empresa_id(); v_employee_id text := app_private.current_employee_id(); v_result public.employee_overtime_sessions%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null or v_employee_id is null then raise exception 'Funcionário vinculado não identificado.'; end if;
  if nullif(btrim(coalesce(p_request_key, '')), '') is not null then
    select * into v_result from public.employee_overtime_sessions
    where empresa_id = v_empresa_id and finish_request_key = btrim(p_request_key) limit 1;
    if v_result.id is not null then return v_result; end if;
  end if;
  update public.employee_overtime_sessions set ended_at=timezone('utc', now()), status='CONCLUIDA', ended_by_uid=auth.uid()::text, finish_request_key=nullif(btrim(coalesce(p_request_key,'')),''), updated_at=timezone('utc', now())
  where empresa_id=v_empresa_id and employee_id=v_employee_id and id=btrim(coalesce(p_session_id,'')) and status='ATIVA'
  returning * into v_result;
  if v_result.id is null then raise exception 'Hora extra não encontrada ou já finalizada.'; end if;
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
    'attendance', case when a.id is null then null else jsonb_build_object('id', a.id, 'workDate', a.work_date, 'status', a.status, 'checkInAt', a.check_in_at, 'checkOutAt', a.check_out_at, 'workedMinutes', a.worked_minutes, 'expectedMinutes', a.expected_minutes) end,
    'overtime', case when o.id is null then null else jsonb_build_object('id', o.id, 'startedAt', o.started_at, 'endedAt', o.ended_at, 'status', o.status) end,
    'activity', case when activity.id is null then null else jsonb_build_object('id', activity.id, 'status', activity.status, 'functionLabel', activity.function_label, 'clientName', activity.client_name_snapshot, 'quoteLabel', activity.quote_label_snapshot, 'startedAt', activity.started_at, 'pausedTotalSeconds', activity.paused_total_seconds, 'activePauseStartedAt', activity.active_pause_started_at) end
  )
  from context c
  join public.employees e on e.empresa_id = c.empresa_id and e.id = c.employee_id
  left join public.employee_work_schedules s on s.empresa_id = c.empresa_id and s.employee_id = c.employee_id and s.weekday = c.weekday
  left join public.employee_attendance_records a on a.empresa_id = c.empresa_id and a.employee_id = c.employee_id and a.work_date = c.work_date
  left join public.employee_overtime_sessions o on o.empresa_id = c.empresa_id and o.employee_id = c.employee_id and o.status = 'ATIVA'
  left join lateral (select x.* from public.employee_activity_sessions x where x.empresa_id = c.empresa_id and x.employee_id = c.employee_id and x.status in ('ATIVA', 'PAUSADA') order by x.started_at desc limit 1) activity on true;
$$;

alter table public.employee_overtime_sessions enable row level security;
create policy employee_overtime_select_own_or_reports on public.employee_overtime_sessions for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (employee_id = app_private.current_employee_id() or app_private.employee_has_permission('verRelatorios')));

drop policy if exists vehicles_select_policy on public.vehicles;
create policy vehicles_select_policy on public.vehicles for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (app_private.vehicle_has_permission('visualizar') or app_private.vehicle_has_permission('usar') or app_private.vehicle_report_has_permission()));
drop policy if exists vehicle_usage_select_policy on public.vehicle_usage_sessions;
create policy vehicle_usage_select_policy on public.vehicle_usage_sessions for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (app_private.vehicle_has_permission('editar') or app_private.vehicle_report_has_permission() or employee_id = app_private.current_employee_id() or actor_uid = auth.uid()::text));
drop policy if exists vehicle_occurrence_select_policy on public.vehicle_occurrences;
create policy vehicle_occurrence_select_policy on public.vehicle_occurrences for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (app_private.vehicle_has_permission('editar') or app_private.vehicle_report_has_permission() or reported_by_uid = auth.uid()::text or exists (select 1 from public.vehicle_usage_sessions session where session.id = vehicle_occurrences.usage_session_id and session.empresa_id = vehicle_occurrences.empresa_id and session.employee_id = app_private.current_employee_id())));

-- Existing tables gain self-only visibility; the report permission retains the collective view.
drop policy if exists tenant_select_employee_attendance_records on public.employee_attendance_records;
create policy tenant_select_employee_attendance_records on public.employee_attendance_records for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (employee_id = app_private.current_employee_id() or app_private.employee_has_permission('verRelatorios')));
drop policy if exists tenant_select_employee_activity_sessions on public.employee_activity_sessions;
create policy tenant_select_employee_activity_sessions on public.employee_activity_sessions for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (employee_id = app_private.current_employee_id() or app_private.employee_has_permission('verRelatorios')));
drop policy if exists tenant_manage_employee_activity_sessions on public.employee_activity_sessions;
create policy tenant_manage_employee_activity_sessions on public.employee_activity_sessions for all to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_can_operate_activity(employee_id))
with check (empresa_id = app_private.current_empresa_id() and app_private.employee_can_operate_activity(employee_id));
drop policy if exists tenant_select_employee_activity_pauses on public.employee_activity_pauses;
create policy tenant_select_employee_activity_pauses on public.employee_activity_pauses for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (app_private.employee_has_permission('verRelatorios') or exists (select 1 from public.employee_activity_sessions s where s.id = employee_activity_pauses.session_id and s.employee_id = app_private.current_employee_id())));
drop policy if exists tenant_manage_employee_activity_pauses on public.employee_activity_pauses;
create policy tenant_manage_employee_activity_pauses on public.employee_activity_pauses for all to authenticated
using (empresa_id = app_private.current_empresa_id() and exists (select 1 from public.employee_activity_sessions s where s.id = employee_activity_pauses.session_id and app_private.employee_can_operate_activity(s.employee_id)))
with check (empresa_id = app_private.current_empresa_id() and exists (select 1 from public.employee_activity_sessions s where s.id = employee_activity_pauses.session_id and app_private.employee_can_operate_activity(s.employee_id)));
drop policy if exists tenant_select_employee_work_schedules on public.employee_work_schedules;
create policy tenant_select_employee_work_schedules on public.employee_work_schedules for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (employee_id = app_private.current_employee_id() or app_private.employee_has_permission('verRelatorios')));
drop policy if exists tenant_select_employee_function_assignments on public.employee_function_assignments;
create policy tenant_select_employee_function_assignments on public.employee_function_assignments for select to authenticated
using (empresa_id = app_private.current_empresa_id() and (employee_id = app_private.current_employee_id() or app_private.employee_has_permission('verRelatorios')));

revoke all on function public.start_my_workday(text), public.finish_my_workday(text), public.start_my_overtime(text), public.finish_my_overtime(text, text), public.get_my_employee_operation() from public, anon;
grant execute on function public.start_my_workday(text), public.finish_my_workday(text), public.start_my_overtime(text), public.finish_my_overtime(text, text), public.get_my_employee_operation() to authenticated;
grant execute on function app_private.employee_has_permission(text), app_private.vehicle_report_has_permission(), app_private.employee_can_operate_activity(text) to authenticated;
grant select on public.employee_overtime_sessions to authenticated;
