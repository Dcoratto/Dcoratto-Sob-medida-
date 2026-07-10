alter table public.crisis_tasks
  add column if not exists scheduled_for timestamptz,
  add column if not exists schedule_start_time text,
  add column if not exists schedule_end_time text,
  add column if not exists schedule_note text,
  add column if not exists scheduled_calendar_event_id text,
  add column if not exists schedule_updated_at timestamptz,
  add column if not exists schedule_updated_by_uid text,
  add column if not exists schedule_updated_by_name text;

alter table public.calendar_events
  add column if not exists end_time text,
  add column if not exists all_day boolean not null default false,
  add column if not exists crisis_task_id text references public.crisis_tasks(id) on update cascade on delete set null,
  add column if not exists crisis_client_id text references public.crisis_clients(id) on update cascade on delete set null,
  add column if not exists schedule_note text;

create unique index if not exists idx_calendar_events_unique_crisis_task
on public.calendar_events(crisis_task_id)
where crisis_task_id is not null;

create unique index if not exists idx_crisis_tasks_unique_calendar_event
on public.crisis_tasks(scheduled_calendar_event_id)
where scheduled_calendar_event_id is not null;

create index if not exists idx_crisis_tasks_schedule_date
on public.crisis_tasks(empresa_id, scheduled_for desc)
where deleted_at is null and scheduled_for is not null;

create index if not exists idx_calendar_events_crisis_client
on public.calendar_events(crisis_client_id, date desc)
where crisis_client_id is not null;

create or replace function public.crisis_schedule_make_id()
returns text
language sql
volatile
set search_path = public
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public.crisis_validate_time_label(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text := nullif(trim(coalesce(value, '')), '');
  hours integer;
  minutes integer;
begin
  if normalized is null then
    return null;
  end if;

  if normalized !~ '^\d{2}:\d{2}$' then
    raise exception 'Horario invalido. Use o formato HH:MM.';
  end if;

  hours := split_part(normalized, ':', 1)::integer;
  minutes := split_part(normalized, ':', 2)::integer;

  if hours not between 0 and 23 or minutes not between 0 and 59 then
    raise exception 'Horario invalido. Use um horario real.';
  end if;

  return lpad(hours::text, 2, '0') || ':' || lpad(minutes::text, 2, '0');
end;
$$;

create or replace function public.crisis_time_to_minutes(value text)
returns integer
language sql
immutable
set search_path = public
as $$
  select split_part(value, ':', 1)::integer * 60 + split_part(value, ':', 2)::integer;
$$;

create or replace function public.crisis_minutes_to_time(value integer)
returns text
language sql
immutable
set search_path = public
as $$
  select lpad(((value / 60) % 24)::text, 2, '0') || ':' || lpad((value % 60)::text, 2, '0');
$$;

create or replace function public.crisis_schedule_label(p_date date, p_start_time text, p_end_time text, p_all_day boolean)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_all_day or p_start_time is null then to_char(p_date, 'DD/MM/YYYY')
    when p_end_time is null or p_end_time = p_start_time then to_char(p_date, 'DD/MM/YYYY') || ' as ' || p_start_time
    else to_char(p_date, 'DD/MM/YYYY') || ' das ' || p_start_time || ' as ' || p_end_time
  end;
$$;

create or replace function public.upsert_crisis_task_schedule(
  p_task_id text,
  p_schedule_date date,
  p_start_time text,
  p_end_time text,
  p_schedule_note text,
  p_actor_uid text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_task record;
  v_event_id text;
  v_existing_event_id text;
  v_start_time text;
  v_input_end_time text;
  v_event_end_time text;
  v_all_day boolean := false;
  v_schedule_note text := nullif(trim(coalesce(p_schedule_note, '')), '');
  v_schedule_timestamp timestamptz;
  v_date_key text;
  v_event_title text;
  v_old_schedule jsonb;
  v_new_schedule jsonb;
  v_action_message text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada para agendar a pendencia.';
  end if;

  if p_schedule_date is null then
    raise exception 'Informe a data da pendencia.';
  end if;

  select
    task.id,
    task.title,
    task.status,
    task.deleted_at,
    task.crisis_client_id,
    task.scheduled_for,
    task.schedule_start_time,
    task.schedule_end_time,
    task.schedule_note,
    task.scheduled_calendar_event_id,
    crisis_client.client_id,
    crisis_client.deleted_at as crisis_client_deleted_at,
    client.name as client_name,
    client.city as client_city
  into v_task
  from public.crisis_tasks task
  join public.crisis_clients crisis_client on crisis_client.id = task.crisis_client_id
  join public.clients client on client.id = crisis_client.client_id
  where task.id = p_task_id
    and task.empresa_id = v_empresa_id;

  if v_task.id is null or v_task.deleted_at is not null or v_task.crisis_client_deleted_at is not null then
    raise exception 'Pendencia nao encontrada para agendamento.';
  end if;

  v_start_time := public.crisis_validate_time_label(p_start_time);
  v_input_end_time := public.crisis_validate_time_label(p_end_time);
  v_all_day := v_start_time is null;

  if v_all_day and v_input_end_time is not null then
    raise exception 'Nao informe horario final para um evento de dia inteiro.';
  end if;

  if v_start_time is not null and v_input_end_time is null then
    v_event_end_time := public.crisis_minutes_to_time(public.crisis_time_to_minutes(v_start_time) + 60);
  else
    v_event_end_time := v_input_end_time;
  end if;

  if v_start_time is not null and v_event_end_time is not null and public.crisis_time_to_minutes(v_event_end_time) <= public.crisis_time_to_minutes(v_start_time) then
    raise exception 'O horario final deve ser posterior ao horario inicial.';
  end if;

  v_schedule_timestamp := p_schedule_date::timestamptz + interval '12 hours';
  v_date_key := to_char(p_schedule_date, 'YYYY-MM-DD');
  v_event_title := 'Gestao de Crise — ' || coalesce(v_task.client_name, 'Cliente') || ' — ' || coalesce(v_task.title, 'Pendencia');

  v_old_schedule := jsonb_build_object(
    'scheduledFor', v_task.scheduled_for,
    'startTime', v_task.schedule_start_time,
    'endTime', v_task.schedule_end_time,
    'note', v_task.schedule_note,
    'calendarEventId', v_task.scheduled_calendar_event_id
  );

  select id
  into v_existing_event_id
  from public.calendar_events
  where crisis_task_id = p_task_id
  limit 1;

  v_event_id := coalesce(
    nullif(v_task.scheduled_calendar_event_id, ''),
    nullif(v_existing_event_id, ''),
    public.crisis_schedule_make_id()
  );

  if exists(select 1 from public.calendar_events where id = v_event_id) then
    update public.calendar_events
    set
      title = v_event_title,
      description = coalesce(v_schedule_note, ''),
      date = v_schedule_timestamp,
      date_key = v_date_key,
      client_id = v_task.client_id,
      client_name = v_task.client_name,
      city = v_task.client_city,
      event_time = v_start_time,
      end_time = case when v_all_day then null else v_event_end_time end,
      all_day = v_all_day,
      source_type = 'gestao-crise',
      status = 'Gestao de Crise',
      crisis_task_id = p_task_id,
      crisis_client_id = v_task.crisis_client_id,
      schedule_note = v_schedule_note,
      updated_at = timezone('utc', now())
    where id = v_event_id;
  else
    insert into public.calendar_events (
      id,
      title,
      description,
      date,
      date_key,
      client_id,
      client_name,
      city,
      event_time,
      end_time,
      all_day,
      created_by_uid,
      created_by_name,
      source_type,
      status,
      crisis_task_id,
      crisis_client_id,
      schedule_note
    )
    values (
      v_event_id,
      v_event_title,
      coalesce(v_schedule_note, ''),
      v_schedule_timestamp,
      v_date_key,
      v_task.client_id,
      v_task.client_name,
      v_task.client_city,
      v_start_time,
      case when v_all_day then null else v_event_end_time end,
      v_all_day,
      nullif(trim(coalesce(p_actor_uid, '')), ''),
      nullif(trim(coalesce(p_actor_name, '')), ''),
      'gestao-crise',
      'Gestao de Crise',
      p_task_id,
      v_task.crisis_client_id,
      v_schedule_note
    );
  end if;

  update public.crisis_tasks
  set
    scheduled_for = v_schedule_timestamp,
    schedule_start_time = v_start_time,
    schedule_end_time = case when v_all_day then null else v_input_end_time end,
    schedule_note = v_schedule_note,
    scheduled_calendar_event_id = v_event_id,
    schedule_updated_at = timezone('utc', now()),
    schedule_updated_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    schedule_updated_by_name = nullif(trim(coalesce(p_actor_name, '')), ''),
    updated_at = timezone('utc', now())
  where id = p_task_id
    and empresa_id = v_empresa_id;

  v_new_schedule := jsonb_build_object(
    'scheduledFor', v_schedule_timestamp,
    'startTime', v_start_time,
    'endTime', case when v_all_day then null else v_input_end_time end,
    'eventEndTime', case when v_all_day then null else v_event_end_time end,
    'note', v_schedule_note,
    'calendarEventId', v_event_id,
    'allDay', v_all_day
  );

  v_action_message := case
    when nullif(v_old_schedule->>'calendarEventId', '') is null
      then coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || ' agendou esta pendencia para ' || public.crisis_schedule_label(p_schedule_date, v_start_time, case when v_all_day then null else v_input_end_time end, v_all_day) || '.'
    else coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || ' alterou o agendamento desta pendencia para ' || public.crisis_schedule_label(p_schedule_date, v_start_time, case when v_all_day then null else v_input_end_time end, v_all_day) || '.'
  end;

  insert into public.crisis_history (
    id,
    empresa_id,
    crisis_client_id,
    crisis_task_id,
    event_type,
    message,
    metadata,
    user_uid,
    user_name
  )
  values (
    public.crisis_schedule_make_id(),
    v_empresa_id,
    v_task.crisis_client_id,
    p_task_id,
    case when nullif(v_old_schedule->>'calendarEventId', '') is null then 'task_schedule_created' else 'task_schedule_updated' end,
    v_action_message,
    jsonb_build_object('previous', v_old_schedule, 'next', v_new_schedule),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    nullif(trim(coalesce(p_actor_name, '')), '')
  );

  return jsonb_build_object(
    'calendarEventId', v_event_id,
    'scheduledFor', v_schedule_timestamp,
    'scheduleStartTime', v_start_time,
    'scheduleEndTime', case when v_all_day then null else v_input_end_time end,
    'eventEndTime', case when v_all_day then null else v_event_end_time end,
    'scheduleNote', v_schedule_note,
    'allDay', v_all_day
  );
end;
$$;

create or replace function public.remove_crisis_task_schedule(
  p_task_id text,
  p_actor_uid text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_task record;
  v_old_schedule jsonb;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada para remover o agendamento.';
  end if;

  select
    task.id,
    task.crisis_client_id,
    task.scheduled_for,
    task.schedule_start_time,
    task.schedule_end_time,
    task.schedule_note,
    task.scheduled_calendar_event_id,
    task.deleted_at
  into v_task
  from public.crisis_tasks task
  where task.id = p_task_id
    and task.empresa_id = v_empresa_id;

  if v_task.id is null or v_task.deleted_at is not null then
    raise exception 'Pendencia nao encontrada para remover o agendamento.';
  end if;

  if nullif(v_task.scheduled_calendar_event_id, '') is null and not exists (
    select 1 from public.calendar_events where crisis_task_id = p_task_id
  ) then
    raise exception 'Esta pendencia nao possui agendamento ativo.';
  end if;

  v_old_schedule := jsonb_build_object(
    'scheduledFor', v_task.scheduled_for,
    'startTime', v_task.schedule_start_time,
    'endTime', v_task.schedule_end_time,
    'note', v_task.schedule_note,
    'calendarEventId', v_task.scheduled_calendar_event_id
  );

  delete from public.calendar_events
  where id = coalesce(nullif(v_task.scheduled_calendar_event_id, ''), id)
    and (id = nullif(v_task.scheduled_calendar_event_id, '') or crisis_task_id = p_task_id);

  update public.crisis_tasks
  set
    scheduled_for = null,
    schedule_start_time = null,
    schedule_end_time = null,
    schedule_note = null,
    scheduled_calendar_event_id = null,
    schedule_updated_at = timezone('utc', now()),
    schedule_updated_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    schedule_updated_by_name = nullif(trim(coalesce(p_actor_name, '')), ''),
    updated_at = timezone('utc', now())
  where id = p_task_id
    and empresa_id = v_empresa_id;

  insert into public.crisis_history (
    id,
    empresa_id,
    crisis_client_id,
    crisis_task_id,
    event_type,
    message,
    metadata,
    user_uid,
    user_name
  )
  values (
    public.crisis_schedule_make_id(),
    v_empresa_id,
    v_task.crisis_client_id,
    p_task_id,
    'task_schedule_removed',
    coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || ' removeu o agendamento desta pendencia.',
    jsonb_build_object('previous', v_old_schedule, 'next', null),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    nullif(trim(coalesce(p_actor_name, '')), '')
  );

  return jsonb_build_object('removed', true);
end;
$$;

grant execute on function public.upsert_crisis_task_schedule(text, date, text, text, text, text, text) to authenticated;
grant execute on function public.remove_crisis_task_schedule(text, text, text) to authenticated;
