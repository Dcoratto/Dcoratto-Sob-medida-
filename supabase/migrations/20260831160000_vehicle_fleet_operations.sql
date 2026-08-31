alter table public.employees
  add column if not exists access_user_id text,
  add column if not exists auth_user_id uuid;

update public.employees employee
set
  access_user_id = coalesce(employee.access_user_id, app_user.id),
  auth_user_id = coalesce(employee.auth_user_id, app_user.auth_user_id)
from public.users app_user
where employee.empresa_id = app_user.empresa_id
  and (
    lower(btrim(coalesce(employee.name, ''))) = lower(btrim(coalesce(app_user.nome, app_user.name, '')))
    or lower(btrim(coalesce(employee.display_name, ''))) = lower(btrim(coalesce(app_user.nome, app_user.name, '')))
  )
  and (employee.access_user_id is null or employee.auth_user_id is null);

create unique index if not exists employees_empresa_access_user_uidx
  on public.employees(empresa_id, access_user_id)
  where access_user_id is not null;

create unique index if not exists employees_empresa_auth_user_uidx
  on public.employees(empresa_id, auth_user_id)
  where auth_user_id is not null;

create table if not exists public.vehicles (
  id text primary key default app_private.make_entity_id(),
  empresa_id text not null references public.empresas(id) on update cascade,
  internal_name text not null check (char_length(btrim(internal_name)) between 2 and 80),
  brand text check (brand is null or char_length(btrim(brand)) between 2 and 60),
  model text check (model is null or char_length(btrim(model)) between 1 and 80),
  plate text check (plate is null or plate ~ '^[A-Z0-9-]{6,8}$'),
  year integer check (year is null or year between 1980 and 2100),
  vehicle_type text not null check (char_length(btrim(vehicle_type)) between 2 and 80),
  status text not null default 'DISPONIVEL' check (status in ('DISPONIVEL', 'EM_USO', 'MANUTENCAO', 'INDISPONIVEL', 'INATIVO')),
  current_odometer_km integer not null default 0 check (current_odometer_km >= 0 and current_odometer_km <= 9999999),
  notes text check (notes is null or char_length(notes) <= 2000),
  photo_url text,
  thumbnail_url text,
  medium_url text,
  original_url text,
  registration_due_date date,
  relevant_due_date date,
  documentation_notes text check (documentation_notes is null or char_length(documentation_notes) <= 1000),
  created_by_uid text,
  created_by_name text,
  updated_by_uid text,
  updated_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, id),
  unique (empresa_id, plate)
);

create table if not exists public.vehicle_purpose_catalog (
  id text primary key default app_private.make_entity_id(),
  empresa_id text not null references public.empresas(id) on update cascade,
  purpose_key text not null check (purpose_key ~ '^[a-z0-9_]{2,40}$'),
  label text not null check (char_length(btrim(label)) between 2 and 80),
  requires_client_link boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100 check (sort_order between 1 and 10000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, purpose_key)
);

create table if not exists public.vehicle_usage_sessions (
  id text primary key default app_private.make_entity_id(),
  empresa_id text not null references public.empresas(id) on update cascade,
  vehicle_id text not null,
  employee_id text not null,
  actor_uid text not null,
  actor_name text not null check (char_length(btrim(actor_name)) between 1 and 120),
  purpose_key text not null check (purpose_key ~ '^[a-z0-9_]{2,40}$'),
  purpose_label text not null check (char_length(btrim(purpose_label)) between 2 and 80),
  client_id text,
  quote_id text,
  client_name_snapshot text,
  quote_label_snapshot text,
  start_notes text check (start_notes is null or char_length(start_notes) <= 1000),
  end_notes text check (end_notes is null or char_length(end_notes) <= 1000),
  start_odometer_km integer not null check (start_odometer_km >= 0 and start_odometer_km <= 9999999),
  end_odometer_km integer check (end_odometer_km is null or end_odometer_km >= 0 and end_odometer_km <= 9999999),
  distance_km integer check (distance_km is null or distance_km >= 0 and distance_km <= 9999999),
  start_fuel_level text not null check (start_fuel_level in ('RESERVA', 'UM_QUARTO', 'METADE', 'TRES_QUARTOS', 'CHEIO')),
  end_fuel_level text check (end_fuel_level is null or end_fuel_level in ('RESERVA', 'UM_QUARTO', 'METADE', 'TRES_QUARTOS', 'CHEIO')),
  start_checklist jsonb not null default '{}'::jsonb,
  end_checklist jsonb,
  status text not null default 'ATIVA' check (status in ('ATIVA', 'CONCLUIDA')),
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  return_actor_uid text,
  return_actor_name text,
  final_vehicle_status text check (final_vehicle_status is null or final_vehicle_status in ('DISPONIVEL', 'MANUTENCAO', 'INDISPONIVEL', 'INATIVO')),
  start_request_key text,
  finish_request_key text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_usage_vehicle_fk foreign key (empresa_id, vehicle_id)
    references public.vehicles(empresa_id, id) on update cascade on delete restrict,
  constraint vehicle_usage_end_km_check check (
    end_odometer_km is null or end_odometer_km >= start_odometer_km
  )
);

create table if not exists public.vehicle_occurrences (
  id text primary key default app_private.make_entity_id(),
  empresa_id text not null references public.empresas(id) on update cascade,
  vehicle_id text not null,
  usage_session_id text,
  stage text not null check (stage in ('SAIDA', 'DEVOLUCAO', 'AVULSA')),
  severity text not null check (severity in ('LEVE', 'ATENCAO', 'IMPEDE_USO')),
  description text not null check (char_length(btrim(description)) between 4 and 1000),
  photo_url text,
  thumbnail_url text,
  medium_url text,
  original_url text,
  prevents_use boolean not null default false,
  reported_by_uid text,
  reported_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_occurrences_vehicle_fk foreign key (empresa_id, vehicle_id)
    references public.vehicles(empresa_id, id) on update cascade on delete restrict,
  constraint vehicle_occurrences_session_fk foreign key (usage_session_id)
    references public.vehicle_usage_sessions(id) on update cascade on delete set null
);

create index if not exists vehicles_empresa_status_name_idx
  on public.vehicles(empresa_id, status, internal_name);

create index if not exists vehicles_empresa_due_dates_idx
  on public.vehicles(empresa_id, registration_due_date, relevant_due_date);

create index if not exists vehicle_usage_history_idx
  on public.vehicle_usage_sessions(empresa_id, vehicle_id, started_at desc);

create index if not exists vehicle_usage_employee_history_idx
  on public.vehicle_usage_sessions(empresa_id, employee_id, started_at desc);

create index if not exists vehicle_usage_purpose_idx
  on public.vehicle_usage_sessions(empresa_id, purpose_key, started_at desc);

create index if not exists vehicle_usage_client_idx
  on public.vehicle_usage_sessions(empresa_id, client_id, started_at desc)
  where client_id is not null;

create index if not exists vehicle_usage_quote_idx
  on public.vehicle_usage_sessions(empresa_id, quote_id, started_at desc)
  where quote_id is not null;

create unique index if not exists vehicle_usage_single_open_vehicle_uidx
  on public.vehicle_usage_sessions(empresa_id, vehicle_id)
  where status = 'ATIVA';

create unique index if not exists vehicle_usage_single_open_employee_uidx
  on public.vehicle_usage_sessions(empresa_id, employee_id)
  where status = 'ATIVA';

create unique index if not exists vehicle_usage_start_request_uidx
  on public.vehicle_usage_sessions(empresa_id, start_request_key)
  where start_request_key is not null;

create unique index if not exists vehicle_usage_finish_request_uidx
  on public.vehicle_usage_sessions(empresa_id, finish_request_key)
  where finish_request_key is not null;

create index if not exists vehicle_occurrences_vehicle_idx
  on public.vehicle_occurrences(empresa_id, vehicle_id, created_at desc);

create index if not exists vehicle_occurrences_session_idx
  on public.vehicle_occurrences(empresa_id, usage_session_id, created_at desc)
  where usage_session_id is not null;

create index if not exists vehicle_occurrences_severity_idx
  on public.vehicle_occurrences(empresa_id, severity, created_at desc);

create trigger set_updated_at_vehicles
before update on public.vehicles
for each row execute function public.set_updated_at();

create trigger set_updated_at_vehicle_usage_sessions
before update on public.vehicle_usage_sessions
for each row execute function public.set_updated_at();

create trigger set_updated_at_vehicle_purpose_catalog
before update on public.vehicle_purpose_catalog
for each row execute function public.set_updated_at();

insert into public.vehicle_purpose_catalog (empresa_id, purpose_key, label, requires_client_link, sort_order)
values
  ('dcoratto-main', 'entrega', 'Entrega', true, 10),
  ('dcoratto-main', 'compra', 'Compra', false, 20),
  ('dcoratto-main', 'retirada_material', 'Retirada de material', true, 30),
  ('dcoratto-main', 'medicao', 'Medição', true, 40),
  ('dcoratto-main', 'instalacao', 'Instalação', true, 50),
  ('dcoratto-main', 'visita_obra', 'Visita à obra', true, 60),
  ('dcoratto-main', 'transporte_pecas', 'Transporte de peças', true, 70),
  ('dcoratto-main', 'transporte_funcionarios', 'Transporte de funcionários', false, 80),
  ('dcoratto-main', 'servico_externo', 'Serviço externo', false, 90),
  ('dcoratto-main', 'outro', 'Outro', false, 999)
on conflict (empresa_id, purpose_key) do update
set
  label = excluded.label,
  requires_client_link = excluded.requires_client_link,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = timezone('utc', now());

create or replace function app_private.vehicle_has_permission(p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where (u.auth_user_id = (select auth.uid()) or u.id = (select auth.uid())::text)
      and u.blocked is not true
      and u.empresa_id = app_private.current_empresa_id()
      and case
        when u.permissions #> array['veiculos', p_action] is not null
          then coalesce((u.permissions #>> array['veiculos', p_action])::boolean, false)
        when u.role in ('administrativo', 'coordenador') then true
        when u.role in ('vendedor', 'liberacao') then p_action in ('visualizar', 'usar')
        else false
      end
  );
$$;

create or replace function app_private.current_employee_id()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
  from public.employees e
  where e.empresa_id = app_private.current_empresa_id()
    and (
      e.auth_user_id = auth.uid()
      or e.access_user_id = (
        select u.id
        from public.users u
        where u.empresa_id = app_private.current_empresa_id()
          and (u.auth_user_id = auth.uid() or u.id = auth.uid()::text)
        order by u.updated_at desc nulls last
        limit 1
      )
    )
  order by e.updated_at desc nulls last, e.created_at desc nulls last
  limit 1;
$$;

create or replace function app_private.vehicle_checklist_complete(p_stage text, p_checklist jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_required text[];
  v_key text;
begin
  if jsonb_typeof(p_checklist) <> 'object' then
    return false;
  end if;

  v_required := case upper(coalesce(p_stage, ''))
    when 'SAIDA' then array[
      'pneus_ok',
      'farois_ok',
      'lanternas_ok',
      'vidros_ok',
      'retrovisores_ok',
      'combustivel_informado',
      'sem_avarias_novas_aparentes',
      'documentacao_presente',
      'condicao_de_uso'
    ]
    when 'DEVOLUCAO' then array[
      'quilometragem_conferida',
      'combustivel_informado',
      'sem_novas_avarias_visiveis',
      'itens_recolhidos',
      'encerramento_confirmado'
    ]
    else array[]::text[]
  end;

  if array_length(v_required, 1) is null then
    return false;
  end if;

  foreach v_key in array v_required loop
    if not (p_checklist ? v_key) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function app_private.vehicle_reference_snapshot(
  p_client_id text,
  p_quote_id text
)
returns table (
  client_name text,
  quote_label text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(
      (select c.name from public.clients c where c.empresa_id = app_private.current_empresa_id() and c.id = p_client_id limit 1),
      (select q.client_name from public.quotes q where q.empresa_id = app_private.current_empresa_id() and q.id = p_quote_id limit 1)
    ) as client_name,
    (select q.environment from public.quotes q where q.empresa_id = app_private.current_empresa_id() and q.id = p_quote_id limit 1) as quote_label;
$$;

create or replace function public.report_vehicle_occurrence(
  p_vehicle_id text,
  p_stage text,
  p_severity text,
  p_description text,
  p_photo_url text default null,
  p_thumbnail_url text default null,
  p_medium_url text default null,
  p_original_url text default null,
  p_usage_session_id text default null,
  p_actor_name text default null
)
returns public.vehicle_occurrences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := coalesce(auth.uid()::text, '');
  v_actor_name text := left(trim(coalesce(p_actor_name, 'Usuário')), 120);
  v_current_employee_id text := app_private.current_employee_id();
  v_vehicle public.vehicles%rowtype;
  v_usage_session public.vehicle_usage_sessions%rowtype;
  v_occurrence public.vehicle_occurrences%rowtype;
  v_stage text := upper(trim(coalesce(p_stage, 'AVULSA')));
  v_severity text := upper(trim(coalesce(p_severity, 'ATENCAO')));
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;
  if (select auth.uid()) is null or not app_private.vehicle_has_permission('usar') then
    raise exception 'Sem permissao para registrar ocorrencias de veiculos.';
  end if;
  if v_stage not in ('SAIDA', 'DEVOLUCAO', 'AVULSA') then
    raise exception 'Etapa da ocorrencia invalida.';
  end if;
  if v_severity not in ('LEVE', 'ATENCAO', 'IMPEDE_USO') then
    raise exception 'Severidade invalida.';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 4 and 1000 then
    raise exception 'Descreva a ocorrencia com no minimo 4 caracteres.';
  end if;

  select *
  into v_vehicle
  from public.vehicles
  where empresa_id = v_empresa_id
    and id = p_vehicle_id
  for update;

  if v_vehicle.id is null then
    raise exception 'Veiculo nao encontrado.';
  end if;

  if nullif(trim(coalesce(p_usage_session_id, '')), '') is not null then
    select *
    into v_usage_session
    from public.vehicle_usage_sessions
    where empresa_id = v_empresa_id
      and id = trim(p_usage_session_id);

    if v_usage_session.id is null or v_usage_session.vehicle_id <> v_vehicle.id then
      raise exception 'Uso do veiculo invalido para esta ocorrencia.';
    end if;
    if not app_private.vehicle_has_permission('editar')
       and (v_current_employee_id is null or v_usage_session.employee_id <> v_current_employee_id) then
      raise exception 'Voce nao pode registrar ocorrencia em uso de outro funcionario.';
    end if;
  end if;

  insert into public.vehicle_occurrences (
    id,
    empresa_id,
    vehicle_id,
    usage_session_id,
    stage,
    severity,
    description,
    photo_url,
    thumbnail_url,
    medium_url,
    original_url,
    prevents_use,
    reported_by_uid,
    reported_by_name
  ) values (
    app_private.make_entity_id(),
    v_empresa_id,
    v_vehicle.id,
    nullif(trim(coalesce(p_usage_session_id, '')), ''),
    v_stage,
    v_severity,
    left(trim(coalesce(p_description, '')), 1000),
    nullif(trim(coalesce(p_photo_url, '')), ''),
    nullif(trim(coalesce(p_thumbnail_url, '')), ''),
    nullif(trim(coalesce(p_medium_url, '')), ''),
    nullif(trim(coalesce(p_original_url, '')), ''),
    v_severity = 'IMPEDE_USO',
    nullif(v_actor_uid, ''),
    v_actor_name
  )
  returning * into v_occurrence;

  if v_severity = 'IMPEDE_USO' and v_vehicle.status not in ('INATIVO', 'MANUTENCAO') then
    update public.vehicles
    set
      status = 'INDISPONIVEL',
      updated_by_uid = nullif(v_actor_uid, ''),
      updated_by_name = v_actor_name
    where empresa_id = v_empresa_id
      and id = v_vehicle.id;
  end if;

  return v_occurrence;
end;
$$;

create or replace function public.start_vehicle_usage(
  p_vehicle_id text,
  p_employee_id text,
  p_purpose_key text,
  p_client_id text default null,
  p_quote_id text default null,
  p_start_notes text default null,
  p_start_odometer_km integer default null,
  p_start_fuel_level text default null,
  p_start_checklist jsonb default '{}'::jsonb,
  p_start_request_key text default null,
  p_actor_name text default null,
  p_occurrence_severity text default null,
  p_occurrence_description text default null,
  p_occurrence_photo_url text default null,
  p_occurrence_thumbnail_url text default null,
  p_occurrence_medium_url text default null,
  p_occurrence_original_url text default null
)
returns public.vehicle_usage_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := coalesce(auth.uid()::text, '');
  v_actor_name text := left(trim(coalesce(p_actor_name, 'Usuário')), 120);
  v_employee_id text := trim(coalesce(p_employee_id, ''));
  v_current_employee_id text := app_private.current_employee_id();
  v_vehicle public.vehicles%rowtype;
  v_session public.vehicle_usage_sessions%rowtype;
  v_employee public.employees%rowtype;
  v_purpose public.vehicle_purpose_catalog%rowtype;
  v_client_name text;
  v_quote_label text;
  v_occurrence public.vehicle_occurrences%rowtype;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;
  if (select auth.uid()) is null or not app_private.vehicle_has_permission('usar') then
    raise exception 'Sem permissao para usar veiculos.';
  end if;
  if char_length(v_actor_name) not between 1 and 120 then
    raise exception 'Responsavel invalido.';
  end if;
  if char_length(coalesce(p_start_notes, '')) > 1000 then
    raise exception 'Observacao excede 1000 caracteres.';
  end if;
  if p_start_odometer_km is null or p_start_odometer_km < 0 or p_start_odometer_km > 9999999 then
    raise exception 'Quilometragem inicial invalida.';
  end if;
  if upper(trim(coalesce(p_start_fuel_level, ''))) not in ('RESERVA', 'UM_QUARTO', 'METADE', 'TRES_QUARTOS', 'CHEIO') then
    raise exception 'Nivel de combustivel invalido.';
  end if;
  if not app_private.vehicle_checklist_complete('SAIDA', p_start_checklist) then
    raise exception 'Checklist de saida incompleto.';
  end if;

  if nullif(trim(coalesce(p_start_request_key, '')), '') is not null then
    select *
    into v_session
    from public.vehicle_usage_sessions
    where empresa_id = v_empresa_id
      and start_request_key = trim(p_start_request_key)
    limit 1;

    if v_session.id is not null then
      return v_session;
    end if;
  end if;

  if not app_private.vehicle_has_permission('editar') then
    if v_current_employee_id is null then
      raise exception 'Seu usuario nao esta vinculado a um funcionario ativo.';
    end if;
    if v_employee_id = '' then
      v_employee_id := v_current_employee_id;
    elsif v_employee_id <> v_current_employee_id then
      raise exception 'Voce nao pode iniciar uso para outro funcionario.';
    end if;
  elsif v_employee_id = '' then
    raise exception 'Funcionario obrigatorio para iniciar o uso.';
  end if;

  select *
  into v_employee
  from public.employees
  where empresa_id = v_empresa_id
    and id = v_employee_id;

  if v_employee.id is null then
    raise exception 'Funcionario nao encontrado.';
  end if;
  if v_employee.active is not true or coalesce(v_employee.status, 'ATIVO') <> 'ATIVO' then
    raise exception 'Funcionario nao esta apto para usar veiculos.';
  end if;

  select *
  into v_purpose
  from public.vehicle_purpose_catalog
  where empresa_id = v_empresa_id
    and purpose_key = lower(trim(coalesce(p_purpose_key, '')))
    and active;

  if v_purpose.id is null then
    raise exception 'Finalidade invalida.';
  end if;

  if not app_private.warehouse_reference_is_valid('public.clients', nullif(trim(coalesce(p_client_id, '')), ''), v_empresa_id)
    or not app_private.warehouse_reference_is_valid('public.quotes', nullif(trim(coalesce(p_quote_id, '')), ''), v_empresa_id) then
    raise exception 'Cliente ou obra invalido.';
  end if;

  if v_purpose.requires_client_link and nullif(trim(coalesce(p_client_id, '')), '') is null and nullif(trim(coalesce(p_quote_id, '')), '') is null then
    raise exception 'Esta finalidade exige cliente ou obra vinculada.';
  end if;

  if nullif(trim(coalesce(p_client_id, '')), '') is not null
     and nullif(trim(coalesce(p_quote_id, '')), '') is not null
     and exists (
       select 1
       from public.quotes q
       where q.empresa_id = v_empresa_id
         and q.id = trim(p_quote_id)
         and q.client_id <> trim(p_client_id)
     ) then
    raise exception 'Cliente e obra nao correspondem.';
  end if;

  select *
  into v_vehicle
  from public.vehicles
  where empresa_id = v_empresa_id
    and id = trim(coalesce(p_vehicle_id, ''))
  for update;

  if v_vehicle.id is null then
    raise exception 'Veiculo nao encontrado.';
  end if;
  if v_vehicle.status <> 'DISPONIVEL' then
    raise exception 'Veiculo indisponivel para retirada.';
  end if;
  if p_start_odometer_km < v_vehicle.current_odometer_km then
    raise exception 'A quilometragem inicial nao pode ser menor que a quilometragem atual do veiculo.';
  end if;

  select client_name, quote_label
  into v_client_name, v_quote_label
  from app_private.vehicle_reference_snapshot(
    nullif(trim(coalesce(p_client_id, '')), ''),
    nullif(trim(coalesce(p_quote_id, '')), '')
  );

  insert into public.vehicle_usage_sessions (
    id,
    empresa_id,
    vehicle_id,
    employee_id,
    actor_uid,
    actor_name,
    purpose_key,
    purpose_label,
    client_id,
    quote_id,
    client_name_snapshot,
    quote_label_snapshot,
    start_notes,
    start_odometer_km,
    start_fuel_level,
    start_checklist,
    status,
    started_at,
    start_request_key
  ) values (
    app_private.make_entity_id(),
    v_empresa_id,
    v_vehicle.id,
    v_employee.id,
    v_actor_uid,
    v_actor_name,
    v_purpose.purpose_key,
    v_purpose.label,
    nullif(trim(coalesce(p_client_id, '')), ''),
    nullif(trim(coalesce(p_quote_id, '')), ''),
    nullif(v_client_name, ''),
    nullif(v_quote_label, ''),
    nullif(trim(coalesce(p_start_notes, '')), ''),
    p_start_odometer_km,
    upper(trim(coalesce(p_start_fuel_level, ''))),
    p_start_checklist,
    'ATIVA',
    timezone('utc', now()),
    nullif(trim(coalesce(p_start_request_key, '')), '')
  )
  returning * into v_session;

  update public.vehicles
  set
    status = 'EM_USO',
    updated_by_uid = nullif(v_actor_uid, ''),
    updated_by_name = v_actor_name
  where empresa_id = v_empresa_id
    and id = v_vehicle.id;

  if upper(trim(coalesce(p_occurrence_severity, ''))) in ('LEVE', 'ATENCAO') then
    select *
    into v_occurrence
    from public.report_vehicle_occurrence(
      v_vehicle.id,
      'SAIDA',
      upper(trim(p_occurrence_severity)),
      coalesce(nullif(trim(coalesce(p_occurrence_description, '')), ''), 'Ocorrencia registrada na saida.'),
      nullif(trim(coalesce(p_occurrence_photo_url, '')), ''),
      nullif(trim(coalesce(p_occurrence_thumbnail_url, '')), ''),
      nullif(trim(coalesce(p_occurrence_medium_url, '')), ''),
      nullif(trim(coalesce(p_occurrence_original_url, '')), ''),
      v_session.id,
      v_actor_name
    );
  elsif upper(trim(coalesce(p_occurrence_severity, ''))) = 'IMPEDE_USO' then
    raise exception 'Ocorrencias que impedem uso devem ser registradas sem iniciar a retirada.';
  end if;

  return v_session;
end;
$$;

create or replace function public.finish_vehicle_usage(
  p_session_id text,
  p_end_odometer_km integer,
  p_end_fuel_level text,
  p_end_checklist jsonb,
  p_end_notes text default null,
  p_final_vehicle_status text default null,
  p_finish_request_key text default null,
  p_actor_name text default null,
  p_occurrence_severity text default null,
  p_occurrence_description text default null,
  p_occurrence_photo_url text default null,
  p_occurrence_thumbnail_url text default null,
  p_occurrence_medium_url text default null,
  p_occurrence_original_url text default null
)
returns public.vehicle_usage_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := coalesce(auth.uid()::text, '');
  v_actor_name text := left(trim(coalesce(p_actor_name, 'Usuário')), 120);
  v_current_employee_id text := app_private.current_employee_id();
  v_session public.vehicle_usage_sessions%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_result_status text := upper(trim(coalesce(p_final_vehicle_status, 'DISPONIVEL')));
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;
  if (select auth.uid()) is null or not app_private.vehicle_has_permission('usar') then
    raise exception 'Sem permissao para devolver veiculos.';
  end if;
  if p_end_odometer_km is null or p_end_odometer_km < 0 or p_end_odometer_km > 9999999 then
    raise exception 'Quilometragem final invalida.';
  end if;
  if upper(trim(coalesce(p_end_fuel_level, ''))) not in ('RESERVA', 'UM_QUARTO', 'METADE', 'TRES_QUARTOS', 'CHEIO') then
    raise exception 'Nivel de combustivel final invalido.';
  end if;
  if not app_private.vehicle_checklist_complete('DEVOLUCAO', p_end_checklist) then
    raise exception 'Checklist de devolucao incompleto.';
  end if;
  if char_length(coalesce(p_end_notes, '')) > 1000 then
    raise exception 'Observacao excede 1000 caracteres.';
  end if;
  if v_result_status not in ('DISPONIVEL', 'MANUTENCAO', 'INDISPONIVEL', 'INATIVO') then
    raise exception 'Status final do veiculo invalido.';
  end if;

  if nullif(trim(coalesce(p_finish_request_key, '')), '') is not null then
    select *
    into v_session
    from public.vehicle_usage_sessions
    where empresa_id = v_empresa_id
      and finish_request_key = trim(p_finish_request_key)
    limit 1;

    if v_session.id is not null then
      return v_session;
    end if;
  end if;

  select *
  into v_session
  from public.vehicle_usage_sessions
  where empresa_id = v_empresa_id
    and id = trim(coalesce(p_session_id, ''))
  for update;

  if v_session.id is null then
    raise exception 'Uso do veiculo nao encontrado.';
  end if;
  if v_session.status <> 'ATIVA' then
    if nullif(trim(coalesce(p_finish_request_key, '')), '') is not null and v_session.finish_request_key = trim(p_finish_request_key) then
      return v_session;
    end if;
    raise exception 'Este uso de veiculo ja foi encerrado.';
  end if;

  if not app_private.vehicle_has_permission('editar') then
    if v_current_employee_id is null or v_session.employee_id <> v_current_employee_id then
      raise exception 'Voce nao pode devolver o veiculo de outro funcionario.';
    end if;
  end if;

  if p_end_odometer_km < v_session.start_odometer_km then
    raise exception 'A quilometragem final nao pode ser menor que a inicial.';
  end if;

  select *
  into v_vehicle
  from public.vehicles
  where empresa_id = v_empresa_id
    and id = v_session.vehicle_id
  for update;

  if v_vehicle.id is null then
    raise exception 'Veiculo nao encontrado.';
  end if;
  if p_end_odometer_km < v_vehicle.current_odometer_km then
    raise exception 'A quilometragem final nao pode ser menor que a quilometragem atual do veiculo.';
  end if;

  if upper(trim(coalesce(p_occurrence_severity, ''))) = 'IMPEDE_USO' and v_result_status = 'DISPONIVEL' then
    v_result_status := 'INDISPONIVEL';
  end if;

  update public.vehicle_usage_sessions
  set
    end_notes = nullif(trim(coalesce(p_end_notes, '')), ''),
    end_odometer_km = p_end_odometer_km,
    distance_km = p_end_odometer_km - start_odometer_km,
    end_fuel_level = upper(trim(coalesce(p_end_fuel_level, ''))),
    end_checklist = p_end_checklist,
    status = 'CONCLUIDA',
    ended_at = timezone('utc', now()),
    return_actor_uid = nullif(v_actor_uid, ''),
    return_actor_name = v_actor_name,
    final_vehicle_status = v_result_status,
    finish_request_key = nullif(trim(coalesce(p_finish_request_key, '')), '')
  where empresa_id = v_empresa_id
    and id = v_session.id
  returning * into v_session;

  update public.vehicles
  set
    current_odometer_km = p_end_odometer_km,
    status = v_result_status,
    updated_by_uid = nullif(v_actor_uid, ''),
    updated_by_name = v_actor_name
  where empresa_id = v_empresa_id
    and id = v_vehicle.id;

  if upper(trim(coalesce(p_occurrence_severity, ''))) in ('LEVE', 'ATENCAO', 'IMPEDE_USO') then
    perform public.report_vehicle_occurrence(
      v_vehicle.id,
      'DEVOLUCAO',
      upper(trim(p_occurrence_severity)),
      coalesce(nullif(trim(coalesce(p_occurrence_description, '')), ''), 'Ocorrencia registrada na devolucao.'),
      nullif(trim(coalesce(p_occurrence_photo_url, '')), ''),
      nullif(trim(coalesce(p_occurrence_thumbnail_url, '')), ''),
      nullif(trim(coalesce(p_occurrence_medium_url, '')), ''),
      nullif(trim(coalesce(p_occurrence_original_url, '')), ''),
      v_session.id,
      v_actor_name
    );
  end if;

  return v_session;
end;
$$;

alter table public.vehicles enable row level security;
alter table public.vehicle_purpose_catalog enable row level security;
alter table public.vehicle_usage_sessions enable row level security;
alter table public.vehicle_occurrences enable row level security;

drop policy if exists vehicles_select_policy on public.vehicles;
drop policy if exists vehicles_insert_policy on public.vehicles;
drop policy if exists vehicles_update_policy on public.vehicles;
create policy vehicles_select_policy
on public.vehicles
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and (app_private.vehicle_has_permission('visualizar') or app_private.vehicle_has_permission('usar'))
);
create policy vehicles_insert_policy
on public.vehicles
for insert
to authenticated
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.vehicle_has_permission('cadastrar')
);
create policy vehicles_update_policy
on public.vehicles
for update
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.vehicle_has_permission('editar')
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.vehicle_has_permission('editar')
);

drop policy if exists vehicle_purpose_select_policy on public.vehicle_purpose_catalog;
drop policy if exists vehicle_purpose_manage_policy on public.vehicle_purpose_catalog;
create policy vehicle_purpose_select_policy
on public.vehicle_purpose_catalog
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and (app_private.vehicle_has_permission('visualizar') or app_private.vehicle_has_permission('usar'))
);
create policy vehicle_purpose_manage_policy
on public.vehicle_purpose_catalog
for all
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.vehicle_has_permission('editar')
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.vehicle_has_permission('editar')
);

drop policy if exists vehicle_usage_select_policy on public.vehicle_usage_sessions;
drop policy if exists vehicle_usage_insert_policy on public.vehicle_usage_sessions;
drop policy if exists vehicle_usage_update_policy on public.vehicle_usage_sessions;
create policy vehicle_usage_select_policy
on public.vehicle_usage_sessions
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and (
    app_private.vehicle_has_permission('editar')
    or employee_id = app_private.current_employee_id()
    or actor_uid = auth.uid()::text
  )
);
create policy vehicle_usage_insert_policy
on public.vehicle_usage_sessions
for insert
to authenticated
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.vehicle_has_permission('usar')
);
create policy vehicle_usage_update_policy
on public.vehicle_usage_sessions
for update
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and (
    app_private.vehicle_has_permission('editar')
    or employee_id = app_private.current_employee_id()
    or actor_uid = auth.uid()::text
  )
)
with check (
  empresa_id = app_private.current_empresa_id()
  and (
    app_private.vehicle_has_permission('editar')
    or employee_id = app_private.current_employee_id()
    or actor_uid = auth.uid()::text
  )
);

drop policy if exists vehicle_occurrence_select_policy on public.vehicle_occurrences;
drop policy if exists vehicle_occurrence_insert_policy on public.vehicle_occurrences;
create policy vehicle_occurrence_select_policy
on public.vehicle_occurrences
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and (
    app_private.vehicle_has_permission('editar')
    or reported_by_uid = auth.uid()::text
    or exists (
      select 1
      from public.vehicle_usage_sessions session
      where session.id = vehicle_occurrences.usage_session_id
        and session.empresa_id = vehicle_occurrences.empresa_id
        and session.employee_id = app_private.current_employee_id()
    )
  )
);
create policy vehicle_occurrence_insert_policy
on public.vehicle_occurrences
for insert
to authenticated
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.vehicle_has_permission('usar')
);

grant select, insert, update on public.vehicles to authenticated;
grant select, insert, update, delete on public.vehicle_purpose_catalog to authenticated;
grant select on public.vehicle_usage_sessions to authenticated;
grant select on public.vehicle_occurrences to authenticated;
revoke insert, update, delete on public.vehicle_usage_sessions from authenticated;
revoke insert, update, delete on public.vehicle_occurrences from authenticated;
grant execute on function app_private.vehicle_has_permission(text) to authenticated;
grant execute on function app_private.current_employee_id() to authenticated;
grant execute on function app_private.vehicle_checklist_complete(text, jsonb) to authenticated;
grant execute on function app_private.vehicle_reference_snapshot(text, text) to authenticated;
grant execute on function public.report_vehicle_occurrence(text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.start_vehicle_usage(text, text, text, text, text, text, integer, text, jsonb, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.finish_vehicle_usage(text, integer, text, jsonb, text, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace view public.vehicle_operational_overview
with (security_invoker = true)
as
with current_reference as (
  select timezone('utc', now()) as now_utc
)
select
  vehicle.id as vehicle_id,
  vehicle.empresa_id,
  vehicle.internal_name,
  vehicle.brand,
  vehicle.model,
  vehicle.plate,
  vehicle.year,
  vehicle.vehicle_type,
  vehicle.status as vehicle_status,
  vehicle.current_odometer_km,
  vehicle.notes as vehicle_notes,
  vehicle.photo_url,
  vehicle.thumbnail_url,
  vehicle.medium_url,
  vehicle.original_url,
  vehicle.registration_due_date,
  vehicle.relevant_due_date,
  vehicle.documentation_notes,
  current_session.id as current_session_id,
  current_session.employee_id as current_employee_id,
  current_employee.name as current_employee_name,
  current_employee.display_name as current_employee_display_name,
  current_employee.role as current_employee_role,
  current_session.actor_name as current_actor_name,
  current_session.purpose_key as current_purpose_key,
  current_session.purpose_label as current_purpose_label,
  current_session.client_id as current_client_id,
  coalesce(current_client.name, current_session.client_name_snapshot) as current_client_name,
  current_session.quote_id as current_quote_id,
  coalesce(current_quote.environment, current_session.quote_label_snapshot) as current_quote_label,
  current_session.start_odometer_km as current_start_odometer_km,
  current_session.start_fuel_level as current_start_fuel_level,
  current_session.started_at as current_started_at,
  last_session.id as last_session_id,
  last_session.employee_id as last_employee_id,
  last_employee.name as last_employee_name,
  last_employee.display_name as last_employee_display_name,
  last_session.actor_name as last_actor_name,
  last_session.purpose_key as last_purpose_key,
  last_session.purpose_label as last_purpose_label,
  last_session.client_id as last_client_id,
  coalesce(last_client.name, last_session.client_name_snapshot) as last_client_name,
  last_session.quote_id as last_quote_id,
  coalesce(last_quote.environment, last_session.quote_label_snapshot) as last_quote_label,
  last_session.start_odometer_km as last_start_odometer_km,
  last_session.end_odometer_km as last_end_odometer_km,
  last_session.distance_km as last_distance_km,
  last_session.started_at as last_started_at,
  last_session.ended_at as last_ended_at,
  coalesce(open_occurrences.open_occurrence_count, 0) as open_occurrence_count,
  coalesce(month_stats.month_usage_count, 0) as month_usage_count,
  coalesce(month_stats.month_distance_km, 0) as month_distance_km
from public.vehicles vehicle
cross join current_reference ref
left join lateral (
  select session.*
  from public.vehicle_usage_sessions session
  where session.empresa_id = vehicle.empresa_id
    and session.vehicle_id = vehicle.id
    and session.status = 'ATIVA'
  order by session.started_at desc
  limit 1
) current_session on true
left join public.employees current_employee
  on current_employee.empresa_id = vehicle.empresa_id
 and current_employee.id = current_session.employee_id
left join public.clients current_client
  on current_client.empresa_id = vehicle.empresa_id
 and current_client.id = current_session.client_id
left join public.quotes current_quote
  on current_quote.empresa_id = vehicle.empresa_id
 and current_quote.id = current_session.quote_id
left join lateral (
  select session.*
  from public.vehicle_usage_sessions session
  where session.empresa_id = vehicle.empresa_id
    and session.vehicle_id = vehicle.id
    and session.status = 'CONCLUIDA'
  order by session.ended_at desc nulls last, session.started_at desc
  limit 1
) last_session on true
left join public.employees last_employee
  on last_employee.empresa_id = vehicle.empresa_id
 and last_employee.id = last_session.employee_id
left join public.clients last_client
  on last_client.empresa_id = vehicle.empresa_id
 and last_client.id = last_session.client_id
left join public.quotes last_quote
  on last_quote.empresa_id = vehicle.empresa_id
 and last_quote.id = last_session.quote_id
left join lateral (
  select count(*)::integer as open_occurrence_count
  from public.vehicle_occurrences occurrence
  where occurrence.empresa_id = vehicle.empresa_id
    and occurrence.vehicle_id = vehicle.id
    and occurrence.created_at >= date_trunc('month', ref.now_utc)
    and occurrence.prevents_use
) open_occurrences on true
left join lateral (
  select
    count(*)::integer as month_usage_count,
    coalesce(sum(coalesce(session.distance_km, 0)), 0)::integer as month_distance_km
  from public.vehicle_usage_sessions session
  where session.empresa_id = vehicle.empresa_id
    and session.vehicle_id = vehicle.id
    and session.status = 'CONCLUIDA'
    and date_trunc('month', session.started_at) = date_trunc('month', ref.now_utc)
) month_stats on true
where vehicle.empresa_id = app_private.current_empresa_id();

grant select on public.vehicle_operational_overview to authenticated;
