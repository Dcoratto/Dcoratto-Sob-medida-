alter table public.employees
  add column if not exists display_name text,
  add column if not exists status text not null default 'ATIVO',
  add column if not exists admission_date date,
  add column if not exists notes text,
  add column if not exists photo_url text,
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text,
  add column if not exists created_by_uid text,
  add column if not exists created_by_name text;

update public.employees
set
  display_name = coalesce(nullif(display_name, ''), name),
  status = case
    when active is false then 'INATIVO'
    else coalesce(nullif(status, ''), 'ATIVO')
  end
where display_name is null
   or display_name = ''
   or status is null
   or status = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_status_check'
  ) then
    alter table public.employees
      add constraint employees_status_check
      check (status in ('ATIVO', 'INATIVO', 'FERIAS', 'AFASTADO'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_notes_length_check'
  ) then
    alter table public.employees
      add constraint employees_notes_length_check
      check (char_length(coalesce(notes, '')) <= 2000);
  end if;
end $$;

create table if not exists public.employee_function_catalog (
  key text not null,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  label text not null,
  linked_production_step text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (empresa_id, key)
);

create table if not exists public.employee_function_assignments (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  employee_id text not null references public.employees(id) on update cascade on delete restrict,
  function_key text not null,
  function_label text not null,
  linked_production_step text,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, employee_id, function_key)
);

create table if not exists public.employee_work_schedules (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  employee_id text not null references public.employees(id) on update cascade on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),
  is_working_day boolean not null default true,
  start_time time,
  end_time time,
  break_minutes integer not null default 60 check (break_minutes between 0 and 720),
  expected_minutes integer not null default 0 check (expected_minutes between 0 and 1440),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, employee_id, weekday)
);

create table if not exists public.employee_attendance_records (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  employee_id text not null references public.employees(id) on update cascade on delete restrict,
  work_date date not null,
  status text not null check (status in ('PRESENTE', 'AUSENTE', 'FOLGA', 'FERIAS', 'AFASTADO')),
  check_in_at timestamptz,
  break_start_at timestamptz,
  break_end_at timestamptz,
  check_out_at timestamptz,
  worked_minutes integer not null default 0 check (worked_minutes between 0 and 4320),
  expected_minutes integer not null default 0 check (expected_minutes between 0 and 1440),
  overtime_minutes integer not null default 0 check (overtime_minutes between 0 and 1440),
  notes text,
  created_by_uid text,
  created_by_name text,
  updated_by_uid text,
  updated_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, employee_id, work_date)
);

create table if not exists public.employee_activity_sessions (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  employee_id text not null references public.employees(id) on update cascade on delete restrict,
  client_id text references public.clients(id) on update cascade on delete set null,
  quote_id text references public.quotes(id) on update cascade on delete set null,
  client_name_snapshot text,
  quote_label_snapshot text,
  function_key text not null,
  function_label text not null,
  linked_production_step text,
  piece_id text,
  piece_label text,
  notes text,
  completion_notes text,
  status text not null check (status in ('ATIVA', 'PAUSADA', 'FINALIZADA')),
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  active_pause_started_at timestamptz,
  paused_total_seconds integer not null default 0 check (paused_total_seconds between 0 and 315360000),
  productive_seconds integer not null default 0 check (productive_seconds between 0 and 315360000),
  created_by_uid text,
  created_by_name text,
  updated_by_uid text,
  updated_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.employee_activity_pauses (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  session_id text not null references public.employee_activity_sessions(id) on update cascade on delete restrict,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  notes text,
  started_by_uid text,
  started_by_name text,
  ended_by_uid text,
  ended_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_employee_function_catalog_empresa_active
on public.employee_function_catalog(empresa_id, active, sort_order, label);

create index if not exists idx_employee_function_assignments_employee
on public.employee_function_assignments(empresa_id, employee_id, is_primary desc, function_label);

create index if not exists idx_employee_work_schedules_employee
on public.employee_work_schedules(empresa_id, employee_id, weekday);

create index if not exists idx_employee_attendance_employee_date
on public.employee_attendance_records(empresa_id, employee_id, work_date desc);

create index if not exists idx_employee_attendance_date_status
on public.employee_attendance_records(empresa_id, work_date desc, status);

create index if not exists idx_employee_activity_sessions_employee_started
on public.employee_activity_sessions(empresa_id, employee_id, started_at desc);

create index if not exists idx_employee_activity_sessions_quote
on public.employee_activity_sessions(empresa_id, quote_id, started_at desc);

create index if not exists idx_employee_activity_sessions_client
on public.employee_activity_sessions(empresa_id, client_id, started_at desc);

create index if not exists idx_employee_activity_sessions_status
on public.employee_activity_sessions(empresa_id, status, started_at desc);

create index if not exists idx_employee_activity_sessions_function
on public.employee_activity_sessions(empresa_id, function_key, started_at desc);

create index if not exists idx_employee_activity_pauses_session
on public.employee_activity_pauses(empresa_id, session_id, started_at desc);

create unique index if not exists idx_employee_activity_single_open_session
on public.employee_activity_sessions(empresa_id, employee_id)
where status in ('ATIVA', 'PAUSADA');

drop trigger if exists set_updated_at_employee_function_catalog on public.employee_function_catalog;
create trigger set_updated_at_employee_function_catalog
before update on public.employee_function_catalog
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_employee_function_assignments on public.employee_function_assignments;
create trigger set_updated_at_employee_function_assignments
before update on public.employee_function_assignments
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_employee_work_schedules on public.employee_work_schedules;
create trigger set_updated_at_employee_work_schedules
before update on public.employee_work_schedules
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_employee_attendance_records on public.employee_attendance_records;
create trigger set_updated_at_employee_attendance_records
before update on public.employee_attendance_records
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_employee_activity_sessions on public.employee_activity_sessions;
create trigger set_updated_at_employee_activity_sessions
before update on public.employee_activity_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_employee_activity_pauses on public.employee_activity_pauses;
create trigger set_updated_at_employee_activity_pauses
before update on public.employee_activity_pauses
for each row execute function public.set_updated_at();

insert into public.employee_function_catalog (empresa_id, key, label, linked_production_step, sort_order)
values
  ('dcoratto-main', 'medicao', 'Medição', 'medicao', 10),
  ('dcoratto-main', 'projeto', 'Projeto', null, 20),
  ('dcoratto-main', 'corte', 'Corte', 'corte', 30),
  ('dcoratto-main', 'acabamento', 'Acabamento', 'acabamento', 40),
  ('dcoratto-main', 'colagem', 'Colagem', null, 50),
  ('dcoratto-main', 'montagem', 'Montagem', null, 60),
  ('dcoratto-main', 'instalacao', 'Instalação', 'instalacao', 70),
  ('dcoratto-main', 'conferencia', 'Conferência', null, 80),
  ('dcoratto-main', 'motorista', 'Motorista', 'entrega', 90),
  ('dcoratto-main', 'ajudante', 'Ajudante', null, 100),
  ('dcoratto-main', 'administrativo', 'Administrativo', null, 110),
  ('dcoratto-main', 'comercial', 'Comercial', null, 120),
  ('dcoratto-main', 'outros', 'Outros', null, 999)
on conflict (empresa_id, key) do update
set
  label = excluded.label,
  linked_production_step = excluded.linked_production_step,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = timezone('utc', now());

create or replace function app_private.current_user_access_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.users
  where auth_user_id = auth.uid()
     or id = auth.uid()::text
  order by updated_at desc nulls last
  limit 1;
$$;

create or replace function app_private.current_user_can_manage_employees()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.current_user_access_role() in ('coordenador', 'administrativo'), false);
$$;

create or replace function app_private.current_user_can_track_employee_activity()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.current_user_access_role() in ('coordenador', 'liberacao', 'administrativo'), false);
$$;

create or replace function app_private.current_user_can_view_employee_operations()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.current_user_access_role() in ('coordenador', 'liberacao', 'administrativo'), false);
$$;

create or replace function app_private.make_entity_id()
returns text
language sql
volatile
set search_path = public
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function app_private.employee_schedule_expected_minutes(
  p_start_time time,
  p_end_time time,
  p_break_minutes integer
)
returns integer
language sql
immutable
as $$
  select greatest(
    0,
    coalesce(floor(extract(epoch from (coalesce(p_end_time, p_start_time) - coalesce(p_start_time, p_end_time))) / 60)::integer, 0)
    - greatest(coalesce(p_break_minutes, 0), 0)
  );
$$;

create or replace function app_private.employee_effective_worked_minutes(
  p_check_in_at timestamptz,
  p_break_start_at timestamptz,
  p_break_end_at timestamptz,
  p_check_out_at timestamptz,
  p_reference_ts timestamptz
)
returns integer
language sql
stable
as $$
  with bounds as (
    select
      p_check_in_at as check_in_at,
      coalesce(p_check_out_at, p_reference_ts) as check_out_at,
      p_break_start_at as break_start_at,
      case
        when p_break_start_at is null then null
        else coalesce(p_break_end_at, least(coalesce(p_check_out_at, p_reference_ts), p_reference_ts))
      end as break_end_at
  )
  select case
    when check_in_at is null or check_out_at is null or check_out_at <= check_in_at then 0
    else greatest(
      0,
      floor(extract(epoch from (check_out_at - check_in_at)) / 60)::integer
      - greatest(
          0,
          floor(
            extract(
              epoch from (
                coalesce(break_end_at, break_start_at)
                - coalesce(break_start_at, break_end_at)
              )
            ) / 60
          )::integer
        )
    )
  end
  from bounds;
$$;

create or replace function app_private.employee_effective_productive_seconds(
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_active_pause_started_at timestamptz,
  p_paused_total_seconds integer,
  p_reference_ts timestamptz
)
returns integer
language sql
stable
as $$
  select case
    when p_started_at is null then 0
    else greatest(
      0,
      floor(extract(epoch from (coalesce(p_ended_at, p_reference_ts) - p_started_at)))::integer
      - greatest(coalesce(p_paused_total_seconds, 0), 0)
      - case
          when p_active_pause_started_at is null or p_ended_at is not null then 0
          else greatest(0, floor(extract(epoch from (p_reference_ts - p_active_pause_started_at)))::integer)
        end
    )
  end;
$$;

create or replace function public.save_employee_profile(
  p_employee_id text,
  p_name text,
  p_display_name text,
  p_role text,
  p_status text,
  p_admission_date date,
  p_phone text,
  p_notes text,
  p_photo_url text,
  p_thumbnail_url text,
  p_medium_url text,
  p_original_url text,
  p_created_by_uid text,
  p_created_by_name text,
  p_functions jsonb,
  p_schedule jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_employee_id text := coalesce(nullif(trim(p_employee_id), ''), app_private.make_entity_id());
  v_name text := trim(coalesce(p_name, ''));
  v_display_name text := trim(coalesce(p_display_name, ''));
  v_role text := trim(coalesce(p_role, ''));
  v_status text := upper(trim(coalesce(p_status, 'ATIVO')));
  v_notes text := left(coalesce(p_notes, ''), 2000);
  v_phone text := left(trim(coalesce(p_phone, '')), 40);
  v_function jsonb;
  v_schedule_day jsonb;
  v_function_key text;
  v_function_label text;
  v_linked_step text;
  v_is_primary boolean;
  v_weekday integer;
  v_is_working_day boolean;
  v_start_time time;
  v_end_time time;
  v_break_minutes integer;
  v_expected_minutes integer;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;

  if not app_private.current_user_can_manage_employees() then
    raise exception 'Voce nao tem permissao para salvar funcionarios.';
  end if;

  if v_name = '' then
    raise exception 'Informe o nome completo do funcionario.';
  end if;

  if char_length(v_name) > 160 then
    raise exception 'Nome do funcionario excede o limite permitido.';
  end if;

  if v_role = '' then
    raise exception 'Informe a funcao principal do funcionario.';
  end if;

  if v_status not in ('ATIVO', 'INATIVO', 'FERIAS', 'AFASTADO') then
    raise exception 'Status do funcionario invalido.';
  end if;

  if jsonb_typeof(coalesce(p_functions, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de funcoes invalida.';
  end if;

  if jsonb_typeof(coalesce(p_schedule, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de jornada invalida.';
  end if;

  insert into public.employees (
    id,
    empresa_id,
    name,
    display_name,
    role,
    status,
    admission_date,
    phone,
    notes,
    photo_url,
    thumbnail_url,
    medium_url,
    original_url,
    active,
    created_by_uid,
    created_by_name
  )
  values (
    v_employee_id,
    v_empresa_id,
    v_name,
    coalesce(nullif(v_display_name, ''), v_name),
    v_role,
    v_status,
    p_admission_date,
    nullif(v_phone, ''),
    nullif(v_notes, ''),
    nullif(trim(coalesce(p_photo_url, '')), ''),
    nullif(trim(coalesce(p_thumbnail_url, '')), ''),
    nullif(trim(coalesce(p_medium_url, '')), ''),
    nullif(trim(coalesce(p_original_url, '')), ''),
    v_status <> 'INATIVO',
    nullif(trim(coalesce(p_created_by_uid, '')), ''),
    left(trim(coalesce(p_created_by_name, '')), 120)
  )
  on conflict (id) do update
  set
    empresa_id = excluded.empresa_id,
    name = excluded.name,
    display_name = excluded.display_name,
    role = excluded.role,
    status = excluded.status,
    admission_date = excluded.admission_date,
    phone = excluded.phone,
    notes = excluded.notes,
    photo_url = excluded.photo_url,
    thumbnail_url = excluded.thumbnail_url,
    medium_url = excluded.medium_url,
    original_url = excluded.original_url,
    active = excluded.active,
    created_by_uid = coalesce(public.employees.created_by_uid, excluded.created_by_uid),
    created_by_name = coalesce(public.employees.created_by_name, excluded.created_by_name),
    updated_at = timezone('utc', now())
  where public.employees.empresa_id = v_empresa_id;

  delete from public.employee_function_assignments
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id;

  for v_function in
    select value
    from jsonb_array_elements(coalesce(p_functions, '[]'::jsonb))
  loop
    v_function_key := lower(trim(coalesce(v_function ->> 'functionKey', '')));
    if v_function_key = '' then
      continue;
    end if;

    select
      coalesce(nullif(trim(v_function ->> 'functionLabel'), ''), catalog.label, initcap(replace(v_function_key, '_', ' '))),
      coalesce(v_function ->> 'linkedProductionStep', catalog.linked_production_step),
      coalesce((v_function ->> 'isPrimary')::boolean, false)
    into v_function_label, v_linked_step, v_is_primary
    from public.employee_function_catalog catalog
    where catalog.empresa_id = v_empresa_id
      and catalog.key = v_function_key;

    if v_function_label is null then
      raise exception 'Funcao informada nao existe no catalogo.';
    end if;

    insert into public.employee_function_assignments (
      id,
      empresa_id,
      employee_id,
      function_key,
      function_label,
      linked_production_step,
      is_primary
    )
    values (
      app_private.make_entity_id(),
      v_empresa_id,
      v_employee_id,
      v_function_key,
      left(v_function_label, 120),
      nullif(trim(coalesce(v_linked_step, '')), ''),
      v_is_primary
    );
  end loop;

  if not exists (
    select 1
    from public.employee_function_assignments
    where empresa_id = v_empresa_id
      and employee_id = v_employee_id
  ) then
    insert into public.employee_function_assignments (
      id,
      empresa_id,
      employee_id,
      function_key,
      function_label,
      linked_production_step,
      is_primary
    )
    values (
      app_private.make_entity_id(),
      v_empresa_id,
      v_employee_id,
      'outros',
      left(v_role, 120),
      null,
      true
    );
  end if;

  update public.employee_function_assignments
  set is_primary = false
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id;

  update public.employee_function_assignments
  set is_primary = true
  where id = (
    select id
    from public.employee_function_assignments
    where empresa_id = v_empresa_id
      and employee_id = v_employee_id
    order by
      case
        when function_label = v_role then 0
        when is_primary then 1
        else 2
      end,
      created_at
    limit 1
  );

  delete from public.employee_work_schedules
  where empresa_id = v_empresa_id
    and employee_id = v_employee_id;

  for v_schedule_day in
    select value
    from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb))
  loop
    v_weekday := greatest(0, least(6, coalesce((v_schedule_day ->> 'weekday')::integer, 0)));
    v_is_working_day := coalesce((v_schedule_day ->> 'isWorkingDay')::boolean, false);
    v_start_time := nullif(trim(coalesce(v_schedule_day ->> 'startTime', '')), '')::time;
    v_end_time := nullif(trim(coalesce(v_schedule_day ->> 'endTime', '')), '')::time;
    v_break_minutes := greatest(0, least(720, coalesce((v_schedule_day ->> 'breakMinutes')::integer, 0)));
    v_expected_minutes := case
      when v_is_working_day and v_start_time is not null and v_end_time is not null
        then app_private.employee_schedule_expected_minutes(v_start_time, v_end_time, v_break_minutes)
      else 0
    end;

    insert into public.employee_work_schedules (
      id,
      empresa_id,
      employee_id,
      weekday,
      is_working_day,
      start_time,
      end_time,
      break_minutes,
      expected_minutes,
      notes
    )
    values (
      app_private.make_entity_id(),
      v_empresa_id,
      v_employee_id,
      v_weekday,
      v_is_working_day,
      case when v_is_working_day then v_start_time else null end,
      case when v_is_working_day then v_end_time else null end,
      v_break_minutes,
      v_expected_minutes,
      nullif(left(trim(coalesce(v_schedule_day ->> 'notes', '')), 160), '')
    );
  end loop;

  return v_employee_id;
end;
$$;

create or replace function public.save_employee_attendance(
  p_employee_id text,
  p_work_date date,
  p_status text,
  p_check_in_at timestamptz,
  p_break_start_at timestamptz,
  p_break_end_at timestamptz,
  p_check_out_at timestamptz,
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
  v_result public.employee_attendance_records;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;

  if not app_private.current_user_can_manage_employees() then
    raise exception 'Voce nao tem permissao para registrar jornada.';
  end if;

  if v_status not in ('PRESENTE', 'AUSENTE', 'FOLGA', 'FERIAS', 'AFASTADO') then
    raise exception 'Status da jornada invalido.';
  end if;

  if p_work_date is null then
    raise exception 'Informe a data da jornada.';
  end if;

  if not exists (
    select 1
    from public.employees
    where id = p_employee_id
      and empresa_id = v_empresa_id
  ) then
    raise exception 'Funcionario nao encontrado.';
  end if;

  select coalesce(expected_minutes, 0)
  into v_expected_minutes
  from public.employee_work_schedules
  where empresa_id = v_empresa_id
    and employee_id = p_employee_id
    and weekday = extract(dow from p_work_date)::integer;

  if v_status in ('FOLGA', 'FERIAS', 'AFASTADO') then
    v_expected_minutes := 0;
  end if;

  if p_check_in_at is not null and p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'Horario de saida nao pode ser anterior ao de entrada.';
  end if;

  if p_break_start_at is not null and p_check_in_at is not null and p_break_start_at < p_check_in_at then
    raise exception 'Inicio do intervalo invalido.';
  end if;

  if p_break_end_at is not null and p_break_start_at is not null and p_break_end_at < p_break_start_at then
    raise exception 'Fim do intervalo invalido.';
  end if;

  v_worked_minutes := case
    when v_status = 'PRESENTE'
      then app_private.employee_effective_worked_minutes(
        p_check_in_at,
        p_break_start_at,
        p_break_end_at,
        p_check_out_at,
        timezone('utc', now())
      )
    else 0
  end;
  v_overtime_minutes := greatest(v_worked_minutes - v_expected_minutes, 0);

  insert into public.employee_attendance_records (
    id,
    empresa_id,
    employee_id,
    work_date,
    status,
    check_in_at,
    break_start_at,
    break_end_at,
    check_out_at,
    worked_minutes,
    expected_minutes,
    overtime_minutes,
    notes,
    created_by_uid,
    created_by_name,
    updated_by_uid,
    updated_by_name
  )
  values (
    app_private.make_entity_id(),
    v_empresa_id,
    p_employee_id,
    p_work_date,
    v_status,
    p_check_in_at,
    p_break_start_at,
    p_break_end_at,
    p_check_out_at,
    v_worked_minutes,
    v_expected_minutes,
    v_overtime_minutes,
    nullif(left(coalesce(p_notes, ''), 1000), ''),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    left(trim(coalesce(p_actor_name, '')), 120),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    left(trim(coalesce(p_actor_name, '')), 120)
  )
  on conflict (empresa_id, employee_id, work_date) do update
  set
    status = excluded.status,
    check_in_at = excluded.check_in_at,
    break_start_at = excluded.break_start_at,
    break_end_at = excluded.break_end_at,
    check_out_at = excluded.check_out_at,
    worked_minutes = excluded.worked_minutes,
    expected_minutes = excluded.expected_minutes,
    overtime_minutes = excluded.overtime_minutes,
    notes = excluded.notes,
    updated_by_uid = excluded.updated_by_uid,
    updated_by_name = excluded.updated_by_name,
    updated_at = timezone('utc', now())
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.start_employee_activity(
  p_employee_id text,
  p_client_id text,
  p_quote_id text,
  p_function_key text,
  p_piece_id text,
  p_piece_label text,
  p_notes text,
  p_actor_uid text,
  p_actor_name text
)
returns public.employee_activity_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_function_key text := lower(trim(coalesce(p_function_key, '')));
  v_function_label text;
  v_linked_step text;
  v_client_name text;
  v_quote_label text;
  v_quote_client_id text;
  v_result public.employee_activity_sessions;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;

  if not app_private.current_user_can_track_employee_activity() then
    raise exception 'Voce nao tem permissao para iniciar atividades.';
  end if;

  if v_function_key = '' then
    raise exception 'Selecione a etapa ou funcao da atividade.';
  end if;

  select label, linked_production_step
  into v_function_label, v_linked_step
  from public.employee_function_catalog
  where empresa_id = v_empresa_id
    and key = v_function_key
    and active = true;

  if v_function_label is null then
    raise exception 'Funcao selecionada nao existe.';
  end if;

  if not exists (
    select 1
    from public.employees
    where id = p_employee_id
      and empresa_id = v_empresa_id
      and active = true
      and status = 'ATIVO'
  ) then
    raise exception 'Funcionario indisponivel para atividade.';
  end if;

  if exists (
    select 1
    from public.employee_activity_sessions
    where empresa_id = v_empresa_id
      and employee_id = p_employee_id
      and status in ('ATIVA', 'PAUSADA')
  ) then
    raise exception 'Este funcionario ja possui uma atividade aberta.';
  end if;

  if p_quote_id is not null and p_quote_id <> '' then
    select client_id, trim(concat_ws(' - ', client_name, nullif(environment, '')))
    into v_quote_client_id, v_quote_label
    from public.quotes
    where id = p_quote_id
      and empresa_id = v_empresa_id;

    if v_quote_label is null then
      raise exception 'Obra/orcamento informado nao foi encontrado.';
    end if;
  end if;

  if p_client_id is not null and p_client_id <> '' then
    select name
    into v_client_name
    from public.clients
    where id = p_client_id
      and empresa_id = v_empresa_id;

    if v_client_name is null then
      raise exception 'Cliente informado nao foi encontrado.';
    end if;
  end if;

  if p_quote_id is not null and p_quote_id <> '' and p_client_id is not null and p_client_id <> '' and v_quote_client_id is distinct from p_client_id then
    raise exception 'A obra informada nao pertence ao cliente selecionado.';
  end if;

  insert into public.employee_activity_sessions (
    id,
    empresa_id,
    employee_id,
    client_id,
    quote_id,
    client_name_snapshot,
    quote_label_snapshot,
    function_key,
    function_label,
    linked_production_step,
    piece_id,
    piece_label,
    notes,
    status,
    started_at,
    created_by_uid,
    created_by_name,
    updated_by_uid,
    updated_by_name
  )
  values (
    app_private.make_entity_id(),
    v_empresa_id,
    p_employee_id,
    nullif(trim(coalesce(p_client_id, '')), ''),
    nullif(trim(coalesce(p_quote_id, '')), ''),
    left(coalesce(v_client_name, ''), 160),
    left(coalesce(v_quote_label, ''), 200),
    v_function_key,
    left(v_function_label, 120),
    nullif(trim(coalesce(v_linked_step, '')), ''),
    nullif(trim(coalesce(p_piece_id, '')), ''),
    nullif(left(trim(coalesce(p_piece_label, '')), 160), ''),
    nullif(left(coalesce(p_notes, ''), 1000), ''),
    'ATIVA',
    timezone('utc', now()),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    left(trim(coalesce(p_actor_name, '')), 120),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    left(trim(coalesce(p_actor_name, '')), 120)
  )
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.pause_employee_activity(
  p_session_id text,
  p_actor_uid text,
  p_actor_name text,
  p_notes text
)
returns public.employee_activity_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_result public.employee_activity_sessions;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;

  if not app_private.current_user_can_track_employee_activity() then
    raise exception 'Voce nao tem permissao para pausar atividades.';
  end if;

  update public.employee_activity_sessions
  set
    status = 'PAUSADA',
    active_pause_started_at = timezone('utc', now()),
    updated_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    updated_by_name = left(trim(coalesce(p_actor_name, '')), 120),
    updated_at = timezone('utc', now())
  where id = p_session_id
    and empresa_id = v_empresa_id
    and status = 'ATIVA'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Atividade nao esta ativa para ser pausada.';
  end if;

  insert into public.employee_activity_pauses (
    id,
    empresa_id,
    session_id,
    started_at,
    notes,
    started_by_uid,
    started_by_name
  )
  values (
    app_private.make_entity_id(),
    v_empresa_id,
    p_session_id,
    v_result.active_pause_started_at,
    nullif(left(coalesce(p_notes, ''), 1000), ''),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    left(trim(coalesce(p_actor_name, '')), 120)
  );

  return v_result;
end;
$$;

create or replace function public.resume_employee_activity(
  p_session_id text,
  p_actor_uid text,
  p_actor_name text
)
returns public.employee_activity_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_pause_started_at timestamptz;
  v_result public.employee_activity_sessions;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;

  if not app_private.current_user_can_track_employee_activity() then
    raise exception 'Voce nao tem permissao para retomar atividades.';
  end if;

  select active_pause_started_at
  into v_pause_started_at
  from public.employee_activity_sessions
  where id = p_session_id
    and empresa_id = v_empresa_id
    and status = 'PAUSADA';

  if v_pause_started_at is null then
    raise exception 'Atividade nao esta pausada.';
  end if;

  update public.employee_activity_pauses
  set
    ended_at = timezone('utc', now()),
    ended_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    ended_by_name = left(trim(coalesce(p_actor_name, '')), 120),
    updated_at = timezone('utc', now())
  where id = (
    select id
    from public.employee_activity_pauses
    where empresa_id = v_empresa_id
      and session_id = p_session_id
      and ended_at is null
    order by started_at desc
    limit 1
  );

  update public.employee_activity_sessions
  set
    status = 'ATIVA',
    paused_total_seconds = paused_total_seconds + greatest(0, floor(extract(epoch from (timezone('utc', now()) - v_pause_started_at)))::integer),
    active_pause_started_at = null,
    updated_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    updated_by_name = left(trim(coalesce(p_actor_name, '')), 120),
    updated_at = timezone('utc', now())
  where id = p_session_id
    and empresa_id = v_empresa_id
    and status = 'PAUSADA'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Nao foi possivel retomar a atividade.';
  end if;

  return v_result;
end;
$$;

create or replace function public.finish_employee_activity(
  p_session_id text,
  p_actor_uid text,
  p_actor_name text,
  p_completion_notes text
)
returns public.employee_activity_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_now timestamptz := timezone('utc', now());
  v_session public.employee_activity_sessions;
  v_pause_seconds integer := 0;
  v_result public.employee_activity_sessions;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;

  if not app_private.current_user_can_track_employee_activity() then
    raise exception 'Voce nao tem permissao para finalizar atividades.';
  end if;

  select *
  into v_session
  from public.employee_activity_sessions
  where id = p_session_id
    and empresa_id = v_empresa_id
    and status in ('ATIVA', 'PAUSADA')
  for update;

  if v_session.id is null then
    raise exception 'Atividade nao encontrada ou ja finalizada.';
  end if;

  if v_session.status = 'PAUSADA' and v_session.active_pause_started_at is not null then
    v_pause_seconds := greatest(0, floor(extract(epoch from (v_now - v_session.active_pause_started_at)))::integer);

    update public.employee_activity_pauses
    set
      ended_at = v_now,
      ended_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
      ended_by_name = left(trim(coalesce(p_actor_name, '')), 120),
      updated_at = v_now
    where id = (
      select id
      from public.employee_activity_pauses
      where empresa_id = v_empresa_id
        and session_id = p_session_id
        and ended_at is null
      order by started_at desc
      limit 1
    );
  end if;

  update public.employee_activity_sessions
  set
    status = 'FINALIZADA',
    ended_at = v_now,
    active_pause_started_at = null,
    paused_total_seconds = paused_total_seconds + v_pause_seconds,
    productive_seconds = app_private.employee_effective_productive_seconds(
      started_at,
      v_now,
      null,
      paused_total_seconds + v_pause_seconds,
      v_now
    ),
    completion_notes = nullif(left(coalesce(p_completion_notes, ''), 1000), ''),
    updated_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    updated_by_name = left(trim(coalesce(p_actor_name, '')), 120),
    updated_at = v_now
  where id = p_session_id
    and empresa_id = v_empresa_id
    and status in ('ATIVA', 'PAUSADA')
  returning * into v_result;

  return v_result;
end;
$$;

alter table public.employee_function_catalog enable row level security;
alter table public.employee_function_assignments enable row level security;
alter table public.employee_work_schedules enable row level security;
alter table public.employee_attendance_records enable row level security;
alter table public.employee_activity_sessions enable row level security;
alter table public.employee_activity_pauses enable row level security;

drop policy if exists tenant_all_employees on public.employees;
drop policy if exists tenant_select_employees on public.employees;
drop policy if exists tenant_insert_employees on public.employees;
drop policy if exists tenant_update_employees on public.employees;
drop policy if exists tenant_delete_employees on public.employees;
create policy tenant_select_employees
on public.employees
for select
to authenticated
using (empresa_id = app_private.current_empresa_id());
create policy tenant_insert_employees
on public.employees
for insert
to authenticated
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
);
create policy tenant_update_employees
on public.employees
for update
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
);
create policy tenant_delete_employees
on public.employees
for delete
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
);

drop policy if exists tenant_select_employee_function_catalog on public.employee_function_catalog;
drop policy if exists tenant_manage_employee_function_catalog on public.employee_function_catalog;
create policy tenant_select_employee_function_catalog
on public.employee_function_catalog
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_view_employee_operations()
);
create policy tenant_manage_employee_function_catalog
on public.employee_function_catalog
for all
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
);

drop policy if exists tenant_select_employee_function_assignments on public.employee_function_assignments;
drop policy if exists tenant_manage_employee_function_assignments on public.employee_function_assignments;
create policy tenant_select_employee_function_assignments
on public.employee_function_assignments
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_view_employee_operations()
);
create policy tenant_manage_employee_function_assignments
on public.employee_function_assignments
for all
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
);

drop policy if exists tenant_select_employee_work_schedules on public.employee_work_schedules;
drop policy if exists tenant_manage_employee_work_schedules on public.employee_work_schedules;
create policy tenant_select_employee_work_schedules
on public.employee_work_schedules
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_view_employee_operations()
);
create policy tenant_manage_employee_work_schedules
on public.employee_work_schedules
for all
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
);

drop policy if exists tenant_select_employee_attendance_records on public.employee_attendance_records;
drop policy if exists tenant_manage_employee_attendance_records on public.employee_attendance_records;
create policy tenant_select_employee_attendance_records
on public.employee_attendance_records
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_view_employee_operations()
);
create policy tenant_manage_employee_attendance_records
on public.employee_attendance_records
for all
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_manage_employees()
);

drop policy if exists tenant_select_employee_activity_sessions on public.employee_activity_sessions;
drop policy if exists tenant_manage_employee_activity_sessions on public.employee_activity_sessions;
create policy tenant_select_employee_activity_sessions
on public.employee_activity_sessions
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_view_employee_operations()
);
create policy tenant_manage_employee_activity_sessions
on public.employee_activity_sessions
for all
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_track_employee_activity()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_track_employee_activity()
);

drop policy if exists tenant_select_employee_activity_pauses on public.employee_activity_pauses;
drop policy if exists tenant_manage_employee_activity_pauses on public.employee_activity_pauses;
create policy tenant_select_employee_activity_pauses
on public.employee_activity_pauses
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_view_employee_operations()
);
create policy tenant_manage_employee_activity_pauses
on public.employee_activity_pauses
for all
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_track_employee_activity()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_can_track_employee_activity()
);

grant select, insert, update, delete on public.employee_function_catalog to authenticated;
grant select, insert, update, delete on public.employee_function_assignments to authenticated;
grant select, insert, update, delete on public.employee_work_schedules to authenticated;
grant select, insert, update, delete on public.employee_attendance_records to authenticated;
grant select, insert, update, delete on public.employee_activity_sessions to authenticated;
grant select, insert, update, delete on public.employee_activity_pauses to authenticated;
grant execute on function app_private.current_user_access_role() to authenticated;
grant execute on function app_private.current_user_can_manage_employees() to authenticated;
grant execute on function app_private.current_user_can_track_employee_activity() to authenticated;
grant execute on function app_private.current_user_can_view_employee_operations() to authenticated;
grant execute on function public.save_employee_profile(text, text, text, text, text, date, text, text, text, text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.save_employee_attendance(text, date, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.start_employee_activity(text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.pause_employee_activity(text, text, text, text) to authenticated;
grant execute on function public.resume_employee_activity(text, text, text) to authenticated;
grant execute on function public.finish_employee_activity(text, text, text, text) to authenticated;

create or replace view public.employee_operational_overview
with (security_invoker = true)
as
with current_reference as (
  select timezone('utc', now()) as now_utc, current_date as today
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
  app_private.employee_effective_worked_minutes(
    attendance.check_in_at,
    attendance.break_start_at,
    attendance.break_end_at,
    attendance.check_out_at,
    ref.now_utc
  ) as attendance_worked_minutes,
  attendance.expected_minutes as attendance_expected_minutes,
  greatest(
    app_private.employee_effective_worked_minutes(
      attendance.check_in_at,
      attendance.break_start_at,
      attendance.break_end_at,
      attendance.check_out_at,
      ref.now_utc
    ) - attendance.expected_minutes,
    0
  ) as attendance_overtime_minutes,
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
  floor(
    app_private.employee_effective_productive_seconds(
      session_current.started_at,
      session_current.ended_at,
      session_current.active_pause_started_at,
      session_current.paused_total_seconds,
      ref.now_utc
    ) / 60
  )::integer as current_productive_minutes,
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
  select jsonb_agg(
    jsonb_build_object(
      'id', assignment.id,
      'employeeId', assignment.employee_id,
      'functionKey', assignment.function_key,
      'functionLabel', assignment.function_label,
      'linkedProductionStep', assignment.linked_production_step,
      'isPrimary', assignment.is_primary
    )
    order by assignment.is_primary desc, assignment.function_label asc
  ) as items
  from public.employee_function_assignments assignment
  where assignment.empresa_id = e.empresa_id
    and assignment.employee_id = e.id
) functions on true
left join lateral (
  select record.*
  from public.employee_attendance_records record
  where record.empresa_id = e.empresa_id
    and record.employee_id = e.id
    and record.work_date = ref.today
  order by record.updated_at desc
  limit 1
) attendance on true
left join lateral (
  select session.*
  from public.employee_activity_sessions session
  where session.empresa_id = e.empresa_id
    and session.employee_id = e.id
    and session.status in ('ATIVA', 'PAUSADA')
  order by session.started_at desc
  limit 1
) session_current on true
left join public.clients client_current
  on client_current.id = session_current.client_id
 and client_current.empresa_id = e.empresa_id
left join public.quotes quote_current
  on quote_current.id = session_current.quote_id
 and quote_current.empresa_id = e.empresa_id
left join lateral (
  select
    coalesce((
      select sum(
        app_private.employee_effective_worked_minutes(
          record.check_in_at,
          record.break_start_at,
          record.break_end_at,
          record.check_out_at,
          ref.now_utc
        )
      )::integer
      from public.employee_attendance_records record
      where record.empresa_id = e.empresa_id
        and record.employee_id = e.id
        and record.work_date = ref.today
    ), 0) as worked_minutes,
    coalesce((
      select sum(record.overtime_minutes)::integer
      from public.employee_attendance_records record
      where record.empresa_id = e.empresa_id
        and record.employee_id = e.id
        and record.work_date = ref.today
    ), 0) as overtime_minutes,
    coalesce((
      select sum(
        floor(
          app_private.employee_effective_productive_seconds(
            session.started_at,
            session.ended_at,
            session.active_pause_started_at,
            session.paused_total_seconds,
            ref.now_utc
          ) / 60
        )::integer
      )::integer
      from public.employee_activity_sessions session
      where session.empresa_id = e.empresa_id
        and session.employee_id = e.id
        and session.started_at::date = ref.today
    ), 0) as productive_minutes,
    coalesce((
      select count(*)::integer
      from public.employee_activity_sessions session
      where session.empresa_id = e.empresa_id
        and session.employee_id = e.id
        and session.status = 'FINALIZADA'
        and session.ended_at::date = ref.today
    ), 0) as completed_activities
) today_summary on true
left join lateral (
  select
    coalesce((
      select sum(record.worked_minutes)::integer
      from public.employee_attendance_records record
      where record.empresa_id = e.empresa_id
        and record.employee_id = e.id
        and date_trunc('month', record.work_date::timestamp) = date_trunc('month', ref.today::timestamp)
    ), 0) as worked_minutes,
    coalesce((
      select sum(record.overtime_minutes)::integer
      from public.employee_attendance_records record
      where record.empresa_id = e.empresa_id
        and record.employee_id = e.id
        and date_trunc('month', record.work_date::timestamp) = date_trunc('month', ref.today::timestamp)
    ), 0) as overtime_minutes,
    coalesce((
      select sum(
        floor(
          app_private.employee_effective_productive_seconds(
            session.started_at,
            session.ended_at,
            session.active_pause_started_at,
            session.paused_total_seconds,
            ref.now_utc
          ) / 60
        )::integer
      )::integer
      from public.employee_activity_sessions session
      where session.empresa_id = e.empresa_id
        and session.employee_id = e.id
        and date_trunc('month', session.started_at) = date_trunc('month', ref.today::timestamptz)
    ), 0) as productive_minutes,
    coalesce((
      select count(*)::integer
      from public.employee_activity_sessions session
      where session.empresa_id = e.empresa_id
        and session.employee_id = e.id
        and session.status = 'FINALIZADA'
        and date_trunc('month', session.started_at) = date_trunc('month', ref.today::timestamptz)
    ), 0) as completed_activities
) month_summary on true
where e.empresa_id = app_private.current_empresa_id();

grant select on public.employee_operational_overview to authenticated;
