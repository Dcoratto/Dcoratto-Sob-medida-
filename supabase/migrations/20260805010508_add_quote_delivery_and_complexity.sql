alter table public.settings
  add column if not exists delivery_config jsonb not null default jsonb_build_object(
    'enabled', false,
    'originAddress', '',
    'ratePerKm', 0,
    'minimumFee', 0,
    'maximumFee', null
  );

alter table public.quotes
  add column if not exists delivery_details jsonb not null default '{}'::jsonb;

create or replace function app_private.valid_delivery_config(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  minimum_fee numeric;
  maximum_fee numeric;
begin
  if value is null or jsonb_typeof(value) <> 'object' then
    return false;
  end if;

  if not value ?& array['enabled', 'originAddress', 'ratePerKm', 'minimumFee', 'maximumFee'] then
    return false;
  end if;

  if jsonb_typeof(value -> 'enabled') <> 'boolean'
    or jsonb_typeof(value -> 'originAddress') <> 'string'
    or jsonb_typeof(value -> 'ratePerKm') <> 'number'
    or jsonb_typeof(value -> 'minimumFee') <> 'number'
    or not (
      value -> 'maximumFee' = 'null'::jsonb
      or jsonb_typeof(value -> 'maximumFee') = 'number'
    ) then
    return false;
  end if;

  minimum_fee := (value ->> 'minimumFee')::numeric;
  maximum_fee := case
    when value -> 'maximumFee' = 'null'::jsonb then null
    else (value ->> 'maximumFee')::numeric
  end;
  return char_length(value ->> 'originAddress') <= 256
    and ((value ->> 'enabled')::boolean is false or char_length(trim(value ->> 'originAddress')) between 5 and 256)
    and (value ->> 'ratePerKm')::numeric between 0 and 10000
    and minimum_fee between 0 and 10000000
    and (maximum_fee is null or maximum_fee between minimum_fee and 10000000);
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.valid_quote_delivery_details(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  minimum_fee numeric;
  maximum_fee numeric;
  expected_fee numeric;
begin
  if value = '{}'::jsonb then
    return true;
  end if;

  if value is null or jsonb_typeof(value) <> 'object'
    or not value ?& array[
      'mode', 'distanceKm', 'durationMinutes', 'ratePerKm', 'minimumFee',
      'maximumFee', 'fee', 'originAddress', 'destinationAddress'
    ]
    or value ->> 'mode' not in ('automatic', 'manual', 'disabled')
    or jsonb_typeof(value -> 'distanceKm') <> 'number'
    or jsonb_typeof(value -> 'ratePerKm') <> 'number'
    or jsonb_typeof(value -> 'minimumFee') <> 'number'
    or jsonb_typeof(value -> 'fee') <> 'number'
    or jsonb_typeof(value -> 'originAddress') <> 'string'
    or jsonb_typeof(value -> 'destinationAddress') <> 'string'
    or not (
      value -> 'durationMinutes' = 'null'::jsonb
      or jsonb_typeof(value -> 'durationMinutes') = 'number'
    )
    or not (
      value -> 'maximumFee' = 'null'::jsonb
      or jsonb_typeof(value -> 'maximumFee') = 'number'
    ) then
    return false;
  end if;

  minimum_fee := (value ->> 'minimumFee')::numeric;
  maximum_fee := case
    when value -> 'maximumFee' = 'null'::jsonb then null
    else (value ->> 'maximumFee')::numeric
  end;
  if value ->> 'mode' = 'disabled' then
    expected_fee := 0;
  else
    expected_fee := greatest(
      minimum_fee,
      (value ->> 'distanceKm')::numeric * (value ->> 'ratePerKm')::numeric
    );
    if maximum_fee is not null then
      expected_fee := least(expected_fee, maximum_fee);
    end if;
  end if;

  return (value ->> 'distanceKm')::numeric between 0 and 10000
    and (
      value -> 'durationMinutes' = 'null'::jsonb
      or (value ->> 'durationMinutes')::numeric between 0 and 100000
    )
    and (value ->> 'ratePerKm')::numeric between 0 and 10000
    and minimum_fee between 0 and 10000000
    and (maximum_fee is null or maximum_fee between minimum_fee and 10000000)
    and (value ->> 'fee')::numeric between 0 and 10000000
    and abs((value ->> 'fee')::numeric - round(expected_fee, 2)) <= 0.01
    and (
      value ->> 'mode' <> 'disabled'
      or ((value ->> 'distanceKm')::numeric = 0 and (value ->> 'fee')::numeric = 0)
    )
    and char_length(value ->> 'originAddress') <= 256
    and char_length(value ->> 'destinationAddress') <= 256
    and (
      not value ? 'provider'
      or value ->> 'provider' in ('mapbox', 'manual')
    )
    and (
      not value ? 'calculatedAt'
      or (jsonb_typeof(value -> 'calculatedAt') = 'string' and char_length(value ->> 'calculatedAt') <= 64)
    );
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.valid_quote_piece_complexities(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  piece jsonb;
  percentage numeric;
begin
  if value is null or jsonb_typeof(value) <> 'array' then
    return false;
  end if;

  for piece in select item from jsonb_array_elements(value) as item loop
    if piece ? 'complexityPercentage' then
      if jsonb_typeof(piece -> 'complexityPercentage') <> 'number' then
        return false;
      end if;
      percentage := (piece ->> 'complexityPercentage')::numeric;
      if percentage not in (0, 1, 5, 10) then
        return false;
      end if;
    end if;
    if piece ? 'complexityReason' and (
      jsonb_typeof(piece -> 'complexityReason') <> 'string'
      or char_length(piece ->> 'complexityReason') > 120
    ) then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_delivery_config_valid'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_delivery_config_valid
      check (app_private.valid_delivery_config(delivery_config)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'quotes_delivery_details_valid'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_delivery_details_valid
      check (app_private.valid_quote_delivery_details(delivery_details)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'quotes_piece_complexities_valid'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_piece_complexities_valid
      check (app_private.valid_quote_piece_complexities(pieces)) not valid;
  end if;
end $$;

alter table public.settings validate constraint settings_delivery_config_valid;
alter table public.quotes validate constraint quotes_delivery_details_valid;
alter table public.quotes validate constraint quotes_piece_complexities_valid;

create or replace function app_private.audit_actor(target_empresa_id text)
returns table(user_id text, user_email text, user_name text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(current_user_row.id, (select auth.uid())::text, ''),
    coalesce(current_user_row.email, ''),
    coalesce(current_user_row.name, current_user_row.nome, current_user_row.email, 'Usuario')
  from (select 1) seed
  left join lateral (
    select id, email, name, nome
    from public.users
    where empresa_id = target_empresa_id
      and (auth_user_id = (select auth.uid()) or id = (select auth.uid())::text)
    order by updated_at desc nulls last
    limit 1
  ) current_user_row on true;
$$;

create or replace function app_private.protect_and_audit_delivery_config()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor record;
begin
  if new.delivery_config is not distinct from old.delivery_config then
    return new;
  end if;

  if not app_private.current_user_is_admin() then
    raise exception 'Apenas administradores podem alterar as configuracoes de entrega.'
      using errcode = '42501';
  end if;

  select * into actor from app_private.audit_actor(new.empresa_id);
  insert into public.audit_logs (
    id, empresa_id, user_id, user_email, user_name, action, module, target_id, old_value, new_value
  ) values (
    replace(gen_random_uuid()::text, '-', ''),
    new.empresa_id,
    actor.user_id,
    actor.user_email,
    actor.user_name,
    'delivery_settings_changed',
    'settings',
    new.id,
    old.delivery_config,
    new.delivery_config
  );

  return new;
end;
$$;

drop trigger if exists protect_and_audit_delivery_config on public.settings;
create trigger protect_and_audit_delivery_config
before update of delivery_config on public.settings
for each row execute function app_private.protect_and_audit_delivery_config();

create or replace function app_private.quote_complexity_map(value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      coalesce(piece ->> 'id', ordinal::text),
      jsonb_build_object(
        'name', coalesce(piece ->> 'name', ''),
        'percentage', coalesce((piece ->> 'complexityPercentage')::numeric, 0),
        'reason', coalesce(piece ->> 'complexityReason', '')
      )
    ),
    '{}'::jsonb
  )
  from jsonb_array_elements(coalesce(value, '[]'::jsonb)) with ordinality as items(piece, ordinal);
$$;

create or replace function app_private.audit_quote_delivery_and_complexity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor record;
  old_complexity jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else app_private.quote_complexity_map(old.pieces) end;
  new_complexity jsonb := app_private.quote_complexity_map(new.pieces);
  old_delivery jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else old.delivery_details end;
begin
  if old_complexity is not distinct from new_complexity
    and old_delivery is not distinct from new.delivery_details then
    return new;
  end if;

  select * into actor from app_private.audit_actor(new.empresa_id);

  if old_complexity is distinct from new_complexity then
    insert into public.audit_logs (
      id, empresa_id, user_id, user_email, user_name, action, module, target_id, old_value, new_value
    ) values (
      replace(gen_random_uuid()::text, '-', ''),
      new.empresa_id,
      actor.user_id,
      actor.user_email,
      actor.user_name,
      'quote_complexity_changed',
      'quotes',
      new.id,
      old_complexity,
      new_complexity
    );
  end if;

  if old_delivery is distinct from new.delivery_details then
    insert into public.audit_logs (
      id, empresa_id, user_id, user_email, user_name, action, module, target_id, old_value, new_value
    ) values (
      replace(gen_random_uuid()::text, '-', ''),
      new.empresa_id,
      actor.user_id,
      actor.user_email,
      actor.user_name,
      case
        when new.delivery_details ->> 'mode' = 'manual' then 'quote_delivery_distance_manual'
        else 'quote_delivery_recalculated'
      end,
      'quotes',
      new.id,
      old_delivery,
      new.delivery_details
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_quote_delivery_and_complexity on public.quotes;
create trigger audit_quote_delivery_and_complexity
after insert or update of pieces, delivery_details on public.quotes
for each row execute function app_private.audit_quote_delivery_and_complexity();

revoke all on function app_private.valid_delivery_config(jsonb) from public, anon;
revoke all on function app_private.valid_quote_delivery_details(jsonb) from public, anon;
revoke all on function app_private.valid_quote_piece_complexities(jsonb) from public, anon;
revoke all on function app_private.audit_actor(text) from public, anon;
revoke all on function app_private.protect_and_audit_delivery_config() from public, anon, authenticated;
revoke all on function app_private.quote_complexity_map(jsonb) from public, anon;
revoke all on function app_private.audit_quote_delivery_and_complexity() from public, anon, authenticated;
grant execute on function app_private.valid_delivery_config(jsonb) to authenticated;
grant execute on function app_private.valid_quote_delivery_details(jsonb) to authenticated;
grant execute on function app_private.valid_quote_piece_complexities(jsonb) to authenticated;
grant execute on function app_private.audit_actor(text) to authenticated;
grant execute on function app_private.quote_complexity_map(jsonb) to authenticated;
grant execute on function app_private.valid_delivery_config(jsonb) to service_role;
grant execute on function app_private.valid_quote_delivery_details(jsonb) to service_role;
grant execute on function app_private.valid_quote_piece_complexities(jsonb) to service_role;
grant execute on function app_private.audit_actor(text) to service_role;
grant execute on function app_private.quote_complexity_map(jsonb) to service_role;
