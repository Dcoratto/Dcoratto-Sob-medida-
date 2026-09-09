create or replace function app_private.employee_production_piece_type_key(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(trim(coalesce(p_value, '')), 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
        '[^a-z0-9]+',
        '_',
        'g'
      ),
      '(^_+|_+$)',
      '',
      'g'
    ),
    ''
  );
$$;

create table if not exists public.employee_production_piece_types (
  id text primary key,
  empresa_id text not null references public.empresas(id) on update cascade on delete restrict,
  key text not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, key),
  check (length(trim(key)) between 2 and 80),
  check (length(trim(label)) between 2 and 120)
);

create table if not exists public.employee_production_time_targets (
  id text primary key,
  empresa_id text not null references public.empresas(id) on update cascade on delete restrict,
  piece_type_id text not null references public.employee_production_piece_types(id) on update cascade on delete restrict,
  function_key text not null,
  function_label text not null,
  target_seconds integer not null check (target_seconds between 60 and 604800),
  active boolean not null default true,
  created_by_uid text,
  created_by_name text,
  updated_by_uid text,
  updated_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (length(trim(function_key)) between 1 and 80),
  check (length(trim(function_label)) between 1 and 120)
);

create unique index if not exists employee_production_time_targets_active_unique
on public.employee_production_time_targets(empresa_id, piece_type_id, function_key)
where active = true;

create index if not exists idx_employee_production_piece_types_empresa_active
on public.employee_production_piece_types(empresa_id, active, label);

create index if not exists idx_employee_production_time_targets_empresa_active
on public.employee_production_time_targets(empresa_id, active, piece_type_id, function_key);

drop trigger if exists set_updated_at_employee_production_piece_types on public.employee_production_piece_types;
create trigger set_updated_at_employee_production_piece_types
before update on public.employee_production_piece_types
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_employee_production_time_targets on public.employee_production_time_targets;
create trigger set_updated_at_employee_production_time_targets
before update on public.employee_production_time_targets
for each row execute function public.set_updated_at();

alter table public.employee_production_piece_types enable row level security;
alter table public.employee_production_time_targets enable row level security;

drop policy if exists employee_production_piece_types_select_reports on public.employee_production_piece_types;
create policy employee_production_piece_types_select_reports
on public.employee_production_piece_types
for select
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('verRelatorios'));

drop policy if exists employee_production_piece_types_write_edit on public.employee_production_piece_types;
drop policy if exists employee_production_piece_types_insert_edit on public.employee_production_piece_types;
create policy employee_production_piece_types_insert_edit
on public.employee_production_piece_types
for insert
to authenticated
with check (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'));

drop policy if exists employee_production_piece_types_update_edit on public.employee_production_piece_types;
create policy employee_production_piece_types_update_edit
on public.employee_production_piece_types
for update
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'))
with check (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'));

drop policy if exists employee_production_time_targets_select_reports on public.employee_production_time_targets;
create policy employee_production_time_targets_select_reports
on public.employee_production_time_targets
for select
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('verRelatorios'));

drop policy if exists employee_production_time_targets_write_edit on public.employee_production_time_targets;
drop policy if exists employee_production_time_targets_insert_edit on public.employee_production_time_targets;
create policy employee_production_time_targets_insert_edit
on public.employee_production_time_targets
for insert
to authenticated
with check (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'));

drop policy if exists employee_production_time_targets_update_edit on public.employee_production_time_targets;
create policy employee_production_time_targets_update_edit
on public.employee_production_time_targets
for update
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'))
with check (empresa_id = app_private.current_empresa_id() and app_private.employee_has_permission('editar'));

insert into public.employee_production_piece_types (id, empresa_id, key, label)
select app_private.make_entity_id(), empresa_id, key, label
from (
  select distinct q.empresa_id, piece ->> 'kind' as key,
    case piece ->> 'kind'
      when 'bancada' then 'Bancada'
      when 'escada' then 'Escada'
      when 'soleira_baguete' then 'Soleira / Baguete'
      else initcap(replace(piece ->> 'kind', '_', ' '))
    end as label
  from public.quotes q
  cross join lateral jsonb_array_elements(coalesce(q.pieces, '[]'::jsonb)) as pieces(piece)
  where nullif(piece ->> 'kind', '') is not null
) source
where source.key is not null
on conflict (empresa_id, key) do update
set label = excluded.label,
    active = true,
    updated_at = timezone('utc', now());

create or replace function public.save_employee_production_time_target(
  p_target_id text default null,
  p_piece_type_key text default null,
  p_piece_type_label text default null,
  p_function_key text default null,
  p_target_seconds integer default null,
  p_active boolean default true,
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
  v_piece_type_id text;
  v_piece_type_key text := app_private.employee_production_piece_type_key(coalesce(p_piece_type_key, p_piece_type_label));
  v_piece_type_label text := left(trim(coalesce(p_piece_type_label, '')), 120);
  v_function_key text := lower(trim(coalesce(p_function_key, '')));
  v_function_label text;
  v_target public.employee_production_time_targets%rowtype;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not app_private.employee_has_permission('editar') then
    raise exception 'Sem permissão para editar tempos previstos.';
  end if;

  if coalesce(p_active, true) = false then
    if nullif(trim(coalesce(p_target_id, '')), '') is null then
      raise exception 'Informe o tempo previsto para inativar.';
    end if;

    update public.employee_production_time_targets
    set active = false,
        updated_by_uid = nullif(trim(coalesce(p_actor_uid, auth.uid()::text)), ''),
        updated_by_name = left(trim(coalesce(p_actor_name, '')), 120),
        updated_at = timezone('utc', now())
    where id = p_target_id
      and empresa_id = v_empresa_id
    returning * into v_target;

    if v_target.id is null then
      raise exception 'Tempo previsto não encontrado.';
    end if;

    return jsonb_build_object('id', v_target.id, 'active', v_target.active);
  end if;

  if v_piece_type_key is null or length(v_piece_type_key) < 2 then
    raise exception 'Tipo de peça inválido.';
  end if;

  if length(v_piece_type_label) < 2 then
    v_piece_type_label := initcap(replace(v_piece_type_key, '_', ' '));
  end if;

  if p_target_seconds is null or p_target_seconds < 60 or p_target_seconds > 604800 then
    raise exception 'Tempo previsto deve ficar entre 1 minuto e 168 horas.';
  end if;

  select label
  into v_function_label
  from public.employee_function_catalog
  where empresa_id = v_empresa_id
    and key = v_function_key
    and active = true;

  if v_function_label is null then
    raise exception 'Função selecionada não existe nesta empresa.';
  end if;

  insert into public.employee_production_piece_types (id, empresa_id, key, label, active)
  values (app_private.make_entity_id(), v_empresa_id, v_piece_type_key, v_piece_type_label, true)
  on conflict (empresa_id, key) do update
  set label = excluded.label,
      active = true,
      updated_at = timezone('utc', now())
  returning id into v_piece_type_id;

  if nullif(trim(coalesce(p_target_id, '')), '') is not null then
    update public.employee_production_time_targets
    set active = false,
        updated_by_uid = nullif(trim(coalesce(p_actor_uid, auth.uid()::text)), ''),
        updated_by_name = left(trim(coalesce(p_actor_name, '')), 120),
        updated_at = timezone('utc', now())
    where id = p_target_id
      and empresa_id = v_empresa_id
      and active = true;

    if not found then
      raise exception 'Tempo previsto não encontrado.';
    end if;
  end if;

  if v_target.id is null then
    insert into public.employee_production_time_targets (
      id, empresa_id, piece_type_id, function_key, function_label, target_seconds, active,
      created_by_uid, created_by_name, updated_by_uid, updated_by_name
    )
    values (
      app_private.make_entity_id(), v_empresa_id, v_piece_type_id, v_function_key, left(v_function_label, 120), p_target_seconds, true,
      nullif(trim(coalesce(p_actor_uid, auth.uid()::text)), ''), left(trim(coalesce(p_actor_name, '')), 120),
      nullif(trim(coalesce(p_actor_uid, auth.uid()::text)), ''), left(trim(coalesce(p_actor_name, '')), 120)
    )
    on conflict (empresa_id, piece_type_id, function_key) where active = true do update
    set target_seconds = excluded.target_seconds,
        function_label = excluded.function_label,
        updated_by_uid = excluded.updated_by_uid,
        updated_by_name = excluded.updated_by_name,
        updated_at = timezone('utc', now())
    returning * into v_target;
  end if;

  return jsonb_build_object('id', v_target.id, 'active', v_target.active);
end;
$$;

create or replace function public.get_employee_production_time_targets()
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
    raise exception 'Sem permissão para ver tempos previstos.';
  end if;

  return jsonb_build_object(
    'pieceTypes', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'key', key, 'label', label, 'active', active) order by label)
      from public.employee_production_piece_types
      where empresa_id = v_empresa_id and active = true
    ), '[]'::jsonb),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'pieceTypeId', pt.id,
        'pieceTypeKey', pt.key,
        'pieceTypeLabel', pt.label,
        'functionKey', t.function_key,
        'functionLabel', t.function_label,
        'targetSeconds', t.target_seconds,
        'active', t.active
      ) order by pt.label, t.function_label)
      from public.employee_production_time_targets t
      inner join public.employee_production_piece_types pt on pt.id = t.piece_type_id and pt.empresa_id = t.empresa_id
      where t.empresa_id = v_empresa_id and t.active = true
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_employee_production_historical_averages(
  p_date_from date default null,
  p_date_to date default null,
  p_piece_type_key text default null,
  p_function_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_from date := coalesce(p_date_from, ((timezone('America/Sao_Paulo', now()))::date - interval '12 months')::date);
  v_to date := coalesce(p_date_to, (timezone('America/Sao_Paulo', now()))::date);
  v_piece_type_key text := app_private.employee_production_piece_type_key(p_piece_type_key);
  v_function_key text := lower(trim(coalesce(p_function_key, '')));
  v_result jsonb;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not app_private.employee_has_permission('verRelatorios') then
    raise exception 'Sem permissão para ver médias históricas.';
  end if;

  if v_to < v_from then
    raise exception 'Período histórico inválido.';
  end if;

  if (v_to - v_from) > 1095 then
    raise exception 'As médias históricas permitem no máximo 3 anos por consulta.';
  end if;

  with valid_sessions as (
    select
      s.id,
      s.quote_id,
      coalesce(nullif(s.piece_id, ''), 'label:' || lower(trim(coalesce(s.piece_label, '')))) as piece_key,
      coalesce(
        nullif(piece.item ->> 'kind', ''),
        app_private.employee_production_piece_type_key(s.piece_label)
      ) as piece_type_key,
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
      s.productive_seconds
    from public.employee_activity_sessions s
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
    where s.empresa_id = v_empresa_id
      and s.status = 'FINALIZADA'
      and s.ended_at is not null
      and s.started_at <= s.ended_at
      and s.productive_seconds between 60 and 604800
      and nullif(coalesce(s.piece_id, s.piece_label), '') is not null
      and (timezone('America/Sao_Paulo', s.ended_at))::date between v_from and v_to
  ),
  filtered_sessions as (
    select *
    from valid_sessions
    where piece_type_key is not null
      and (v_piece_type_key is null or piece_type_key = v_piece_type_key)
      and (v_function_key = '' or function_key = v_function_key)
  ),
  piece_function_totals as (
    select
      coalesce(quote_id, 'sem-orcamento') || ':' || piece_key as sample_key,
      piece_type_key,
      max(piece_type_label) as piece_type_label,
      function_key,
      max(function_label) as function_label,
      sum(productive_seconds)::integer as productive_seconds
    from filtered_sessions
    group by coalesce(quote_id, 'sem-orcamento') || ':' || piece_key, piece_type_key, function_key
  ),
  piece_totals as (
    select
      sample_key,
      piece_type_key,
      max(piece_type_label) as piece_type_label,
      sum(productive_seconds)::integer as productive_seconds
    from piece_function_totals
    group by sample_key, piece_type_key
  ),
  type_averages as (
    select
      piece_type_key,
      max(piece_type_label) as piece_type_label,
      count(*)::integer as sample_count,
      round(avg(productive_seconds) / 60)::integer as average_minutes
    from piece_totals
    group by piece_type_key
  ),
  type_function_averages as (
    select
      piece_type_key,
      function_key,
      max(function_label) as function_label,
      count(*)::integer as sample_count,
      round(avg(productive_seconds) / 60)::integer as average_minutes
    from piece_function_totals
    group by piece_type_key, function_key
  ),
  function_averages as (
    select
      function_key,
      max(function_label) as function_label,
      count(*)::integer as sample_count,
      round(avg(productive_seconds) / 60)::integer as average_minutes
    from piece_function_totals
    group by function_key
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'pieceTypes', coalesce((select jsonb_agg(jsonb_build_object(
      'pieceTypeKey', piece_type_key,
      'pieceTypeLabel', piece_type_label,
      'sampleCount', sample_count,
      'averageMinutes', average_minutes,
      'functions', coalesce((select jsonb_agg(jsonb_build_object(
        'functionKey', tfa.function_key,
        'functionLabel', tfa.function_label,
        'sampleCount', tfa.sample_count,
        'averageMinutes', tfa.average_minutes
      ) order by tfa.average_minutes desc, tfa.function_label) from type_function_averages tfa where tfa.piece_type_key = type_averages.piece_type_key), '[]'::jsonb)
    ) order by average_minutes desc, piece_type_label) from type_averages), '[]'::jsonb),
    'functions', coalesce((select jsonb_agg(jsonb_build_object(
      'functionKey', function_key,
      'functionLabel', function_label,
      'sampleCount', sample_count,
      'averageMinutes', average_minutes,
      'pieceTypes', coalesce((select jsonb_agg(jsonb_build_object(
        'pieceTypeKey', tfa.piece_type_key,
        'pieceTypeLabel', ta.piece_type_label,
        'sampleCount', tfa.sample_count,
        'averageMinutes', tfa.average_minutes
      ) order by tfa.average_minutes desc, ta.piece_type_label) from type_function_averages tfa inner join type_averages ta on ta.piece_type_key = tfa.piece_type_key where tfa.function_key = function_averages.function_key), '[]'::jsonb)
    ) order by average_minutes desc, function_label) from function_averages), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_employee_production_piece_analysis(
  p_date_from date default null,
  p_date_to date default null,
  p_employee_id text default null,
  p_client_id text default null,
  p_quote_id text default null,
  p_piece_key text default null,
  p_function_key text default null,
  p_history_date_from date default null,
  p_history_date_to date default null
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
  v_history_from date := coalesce(p_history_date_from, ((timezone('America/Sao_Paulo', now()))::date - interval '12 months')::date);
  v_history_to date := coalesce(p_history_date_to, (timezone('America/Sao_Paulo', now()))::date);
  v_now timestamptz := timezone('utc', now());
  v_result jsonb;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not app_private.employee_has_permission('verRelatorios') then
    raise exception 'Sem permissão para analisar produção por peça.';
  end if;

  if v_to < v_from or v_history_to < v_history_from then
    raise exception 'Período inválido para análise de produção.';
  end if;

  if (v_to - v_from) > 370 or (v_history_to - v_history_from) > 1095 then
    raise exception 'Período muito amplo para análise de produção.';
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
      s.status,
      floor(app_private.employee_effective_productive_seconds(s.started_at, s.ended_at, s.active_pause_started_at, s.paused_total_seconds, v_now) / 60)::integer as productive_minutes,
      case when s.status = 'FINALIZADA' then 1 else 0 end as completed_flag
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
    where s.empresa_id = v_empresa_id
      and (timezone('America/Sao_Paulo', s.started_at))::date between v_from and v_to
      and nullif(coalesce(s.piece_id, s.piece_label), '') is not null
  ),
  filtered_sessions as (
    select *
    from sessions_period s
    where s.piece_key <> '__sem_peca__'
      and s.piece_type_key is not null
      and (nullif(btrim(coalesce(p_employee_id, '')), '') is null or s.employee_id = p_employee_id)
      and (nullif(btrim(coalesce(p_client_id, '')), '') is null or s.client_id = p_client_id)
      and (nullif(btrim(coalesce(p_quote_id, '')), '') is null or s.quote_id = p_quote_id)
      and (nullif(btrim(coalesce(p_piece_key, '')), '') is null or s.piece_key = p_piece_key)
      and (nullif(btrim(coalesce(p_function_key, '')), '') is null or s.function_key = p_function_key)
  ),
  function_realized as (
    select
      piece_key,
      function_key,
      max(function_label) as function_label,
      sum(productive_minutes)::integer as realized_minutes,
      sum(completed_flag)::integer as completed_activities
    from filtered_sessions
    group by piece_key, function_key
  ),
  target_rows as (
    select
      fs.piece_key,
      t.function_key,
      t.function_label,
      floor(t.target_seconds / 60)::integer as target_minutes
    from (select distinct piece_key, piece_type_key from filtered_sessions) fs
    inner join public.employee_production_piece_types pt on pt.empresa_id = v_empresa_id and pt.key = fs.piece_type_key and pt.active = true
    inner join public.employee_production_time_targets t on t.empresa_id = v_empresa_id and t.piece_type_id = pt.id and t.active = true
  ),
  function_comparison as (
    select
      coalesce(fr.piece_key, tr.piece_key) as piece_key,
      coalesce(fr.function_key, tr.function_key) as function_key,
      coalesce(fr.function_label, tr.function_label) as function_label,
      coalesce(tr.target_minutes, 0) as target_minutes,
      coalesce(fr.realized_minutes, 0) as realized_minutes,
      coalesce(fr.realized_minutes, 0) - coalesce(tr.target_minutes, 0) as deviation_minutes,
      case when coalesce(tr.target_minutes, 0) > 0 then round(((coalesce(fr.realized_minutes, 0) - tr.target_minutes)::numeric / tr.target_minutes) * 100, 2) else null end as deviation_percent,
      coalesce(fr.completed_activities, 0) as completed_activities,
      case when fr.function_key is null and tr.function_key is not null then false else true end as has_activity
    from function_realized fr
    full join target_rows tr on tr.piece_key = fr.piece_key and tr.function_key = fr.function_key
  ),
  valid_history as (
    select
      s.quote_id,
      coalesce(nullif(s.piece_id, ''), 'label:' || lower(trim(coalesce(s.piece_label, '')))) as piece_key,
      coalesce(
        nullif(piece.item ->> 'kind', ''),
        app_private.employee_production_piece_type_key(s.piece_label)
      ) as piece_type_key,
      s.function_key,
      s.productive_seconds
    from public.employee_activity_sessions s
    left join public.quotes q on q.id = s.quote_id and q.empresa_id = s.empresa_id
    left join lateral (
      select item
      from jsonb_array_elements(coalesce(q.pieces, '[]'::jsonb)) as items(item)
      where item ->> 'id' = s.piece_id
      limit 1
    ) piece on true
    where s.empresa_id = v_empresa_id
      and s.status = 'FINALIZADA'
      and s.ended_at is not null
      and s.started_at <= s.ended_at
      and s.productive_seconds between 60 and 604800
      and nullif(coalesce(s.piece_id, s.piece_label), '') is not null
      and (timezone('America/Sao_Paulo', s.ended_at))::date between v_history_from and v_history_to
  ),
  history_piece_totals as (
    select
      piece_type_key,
      coalesce(quote_id, 'sem-orcamento') || ':' || piece_key as sample_key,
      sum(productive_seconds)::integer as productive_seconds
    from valid_history h
    where piece_type_key is not null
    group by piece_type_key, coalesce(quote_id, 'sem-orcamento') || ':' || piece_key
  ),
  history_type_average as (
    select
      piece_type_key,
      count(*)::integer as sample_count,
      round(avg(productive_seconds) / 60)::integer as average_minutes
    from history_piece_totals
    group by piece_type_key
  ),
  pieces as (
    select
      fs.piece_key,
      max(fs.piece_label) as piece_label,
      max(fs.piece_type_key) as piece_type_key,
      max(fs.piece_type_label) as piece_type_label,
      max(fs.client_id) as client_id,
      max(fs.client_name) as client_name,
      max(fs.quote_id) as quote_id,
      max(fs.quote_label) as quote_label,
      sum(fs.productive_minutes)::integer as realized_minutes,
      count(distinct fs.employee_id)::integer as employee_count,
      sum(fs.completed_flag)::integer as completed_activities
    from filtered_sessions fs
    group by fs.piece_key
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'historyPeriod', jsonb_build_object('from', v_history_from, 'to', v_history_to),
    'pieces', coalesce((select jsonb_agg(jsonb_build_object(
      'pieceKey', p.piece_key,
      'pieceLabel', p.piece_label,
      'pieceTypeKey', p.piece_type_key,
      'pieceTypeLabel', p.piece_type_label,
      'clientId', p.client_id,
      'clientName', p.client_name,
      'quoteId', p.quote_id,
      'quoteLabel', p.quote_label,
      'targetMinutes', coalesce((select sum(target_minutes)::integer from target_rows tr where tr.piece_key = p.piece_key), 0),
      'realizedMinutes', p.realized_minutes,
      'deviationMinutes', p.realized_minutes - coalesce((select sum(target_minutes)::integer from target_rows tr where tr.piece_key = p.piece_key), 0),
      'deviationPercent', case when coalesce((select sum(target_minutes)::integer from target_rows tr where tr.piece_key = p.piece_key), 0) > 0 then round(((p.realized_minutes - (select sum(target_minutes)::integer from target_rows tr where tr.piece_key = p.piece_key))::numeric / (select sum(target_minutes)::integer from target_rows tr where tr.piece_key = p.piece_key)) * 100, 2) else null end,
      'employeeCount', p.employee_count,
      'completedActivities', p.completed_activities,
      'historicalAverageMinutes', h.average_minutes,
      'historicalSampleCount', coalesce(h.sample_count, 0),
      'historicalDeviationMinutes', case when h.average_minutes is not null then p.realized_minutes - h.average_minutes else null end,
      'historicalDeviationPercent', case when coalesce(h.average_minutes, 0) > 0 then round(((p.realized_minutes - h.average_minutes)::numeric / h.average_minutes) * 100, 2) else null end,
      'functions', coalesce((select jsonb_agg(jsonb_build_object(
        'functionKey', fc.function_key,
        'functionLabel', fc.function_label,
        'targetMinutes', fc.target_minutes,
        'realizedMinutes', fc.realized_minutes,
        'deviationMinutes', fc.deviation_minutes,
        'deviationPercent', fc.deviation_percent,
        'completedActivities', fc.completed_activities,
        'hasActivity', fc.has_activity
      ) order by fc.function_label) from function_comparison fc where fc.piece_key = p.piece_key), '[]'::jsonb)
    ) order by p.realized_minutes desc, p.piece_label) from pieces p left join history_type_average h on h.piece_type_key = p.piece_type_key), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.save_employee_production_time_target(text, text, text, text, integer, boolean, text, text) from public;
revoke all on function public.save_employee_production_time_target(text, text, text, text, integer, boolean, text, text) from anon;
grant execute on function public.save_employee_production_time_target(text, text, text, text, integer, boolean, text, text) to authenticated;

revoke all on function public.get_employee_production_time_targets() from public;
revoke all on function public.get_employee_production_time_targets() from anon;
grant execute on function public.get_employee_production_time_targets() to authenticated;

revoke all on function public.get_employee_production_historical_averages(date, date, text, text) from public;
revoke all on function public.get_employee_production_historical_averages(date, date, text, text) from anon;
grant execute on function public.get_employee_production_historical_averages(date, date, text, text) to authenticated;

revoke all on function public.get_employee_production_piece_analysis(date, date, text, text, text, text, text, date, date) from public;
revoke all on function public.get_employee_production_piece_analysis(date, date, text, text, text, text, text, date, date) from anon;
grant execute on function public.get_employee_production_piece_analysis(date, date, text, text, text, text, text, date, date) to authenticated;
