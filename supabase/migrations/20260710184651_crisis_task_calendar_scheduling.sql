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

grant execute on function public.upsert_crisis_task_schedule(text, date, text, text, text, text, text) to authenticated;
grant execute on function public.remove_crisis_task_schedule(text, text, text) to authenticated;
