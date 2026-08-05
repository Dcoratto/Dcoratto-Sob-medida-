create table if not exists public.delivery_region_rates (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  empresa_id text not null default coalesce(app_private.current_empresa_id(), 'dcoratto-main') references public.empresas(id) on update cascade,
  district text not null,
  district_normalized text not null,
  city text not null,
  city_normalized text not null,
  delivery_fee numeric(14, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_delivery_region_rates_empresa_active_city_district
on public.delivery_region_rates(empresa_id, active, city_normalized, district_normalized);

create index if not exists idx_delivery_region_rates_empresa_city
on public.delivery_region_rates(empresa_id, city_normalized);

create unique index if not exists uq_delivery_region_rates_empresa_city_district
on public.delivery_region_rates(empresa_id, city_normalized, district_normalized);

grant select on table public.delivery_region_rates to authenticated;
grant insert, update, delete on table public.delivery_region_rates to authenticated;

alter table public.delivery_region_rates enable row level security;

drop policy if exists "tenant_select_delivery_region_rates" on public.delivery_region_rates;
create policy "tenant_select_delivery_region_rates"
on public.delivery_region_rates
for select
to authenticated
using (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_insert_delivery_region_rates" on public.delivery_region_rates;
create policy "tenant_insert_delivery_region_rates"
on public.delivery_region_rates
for insert
to authenticated
with check (
  empresa_id = coalesce(app_private.current_empresa_id(), 'dcoratto-main')
  and app_private.current_user_is_admin()
);

drop policy if exists "tenant_update_delivery_region_rates" on public.delivery_region_rates;
create policy "tenant_update_delivery_region_rates"
on public.delivery_region_rates
for update
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_is_admin()
)
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_is_admin()
);

drop policy if exists "tenant_delete_delivery_region_rates" on public.delivery_region_rates;
create policy "tenant_delete_delivery_region_rates"
on public.delivery_region_rates
for delete
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_is_admin()
);

create or replace function app_private.normalize_delivery_city(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      translate(lower(trim(coalesce(value, ''))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '\s+',
      ' ',
      'g'
    ),
    120
  );
$$;

create or replace function app_private.normalize_delivery_district(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      translate(lower(trim(coalesce(value, ''))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '\s+',
      ' ',
      'g'
    ),
    120
  );
$$;

create or replace function app_private.valid_delivery_region_rate_row(
  district_value text,
  district_normalized_value text,
  city_value text,
  city_normalized_value text,
  delivery_fee_value numeric,
  active_value boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return active_value in (true, false)
    and char_length(trim(coalesce(district_value, ''))) between 2 and 120
    and char_length(trim(coalesce(city_value, ''))) between 2 and 120
    and district_normalized_value = app_private.normalize_delivery_district(district_value)
    and city_normalized_value = app_private.normalize_delivery_city(city_value)
    and delivery_fee_value between 0 and 10000000;
exception
  when others then
    return false;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'delivery_region_rates_row_valid'
      and conrelid = 'public.delivery_region_rates'::regclass
  ) then
    alter table public.delivery_region_rates
      add constraint delivery_region_rates_row_valid
      check (
        app_private.valid_delivery_region_rate_row(
          district,
          district_normalized,
          city,
          city_normalized,
          delivery_fee,
          active
        )
      ) not valid;
  end if;
end $$;

alter table public.delivery_region_rates validate constraint delivery_region_rates_row_valid;

create or replace function app_private.set_delivery_region_rate_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.district := left(trim(coalesce(new.district, '')), 120);
  new.city := left(trim(coalesce(new.city, '')), 120);
  new.district_normalized := app_private.normalize_delivery_district(new.district);
  new.city_normalized := app_private.normalize_delivery_city(new.city);
  new.delivery_fee := round(greatest(0, coalesce(new.delivery_fee, 0))::numeric, 2);
  new.updated_at := timezone('utc', now());
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_delivery_region_rate_defaults on public.delivery_region_rates;
create trigger set_delivery_region_rate_defaults
before insert or update on public.delivery_region_rates
for each row execute function app_private.set_delivery_region_rate_defaults();

create or replace function app_private.valid_delivery_config(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value is not null and jsonb_typeof(value) = 'object';
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
  fee_value numeric;
  mode_value text;
begin
  if value = '{}'::jsonb then
    return true;
  end if;

  if value is null or jsonb_typeof(value) <> 'object' or not value ? 'mode' or not value ? 'fee' then
    return false;
  end if;

  if jsonb_typeof(value -> 'mode') <> 'string' or jsonb_typeof(value -> 'fee') <> 'number' then
    return false;
  end if;

  mode_value := value ->> 'mode';
  fee_value := (value ->> 'fee')::numeric;

  if mode_value not in ('automatic', 'manual', 'disabled', 'region_rate', 'city_rate') then
    return false;
  end if;

  if fee_value < 0 or fee_value > 10000000 then
    return false;
  end if;

  if mode_value in ('region_rate', 'manual') then
    return coalesce(char_length(trim(value ->> 'district')), 0) between 2 and 120
      and coalesce(char_length(trim(value ->> 'city')), 0) between 2 and 120
      and (
        not value ? 'districtNormalized'
        or value ->> 'districtNormalized' = app_private.normalize_delivery_district(value ->> 'district')
      )
      and (
        not value ? 'cityNormalized'
        or value ->> 'cityNormalized' = app_private.normalize_delivery_city(value ->> 'city')
      );
  end if;

  if mode_value = 'city_rate' then
    return coalesce(char_length(trim(value ->> 'city')), 0) between 2 and 120
      and (
        not value ? 'cityNormalized'
        or value ->> 'cityNormalized' = app_private.normalize_delivery_city(value ->> 'city')
      );
  end if;

  if mode_value = 'disabled' then
    return fee_value = 0;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.audit_delivery_region_rates()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor record;
  action_name text;
  target_row public.delivery_region_rates%rowtype;
begin
  target_row := coalesce(new, old);
  select * into actor from app_private.audit_actor(target_row.empresa_id);

  action_name := case
    when tg_op = 'INSERT' then 'delivery_region_rate_created'
    when tg_op = 'DELETE' then 'delivery_region_rate_deleted'
    when new.active is distinct from old.active then 'delivery_region_rate_status_changed'
    else 'delivery_region_rate_updated'
  end;

  insert into public.audit_logs (
    id, empresa_id, user_id, user_email, user_name, action, module, target_id, old_value, new_value
  ) values (
    replace(gen_random_uuid()::text, '-', ''),
    target_row.empresa_id,
    actor.user_id,
    actor.user_email,
    actor.user_name,
    action_name,
    'delivery_region_rates',
    target_row.id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_delivery_region_rates on public.delivery_region_rates;
create trigger audit_delivery_region_rates
after insert or update or delete on public.delivery_region_rates
for each row execute function app_private.audit_delivery_region_rates();

drop trigger if exists protect_and_audit_delivery_config on public.settings;

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
  delivery_action text;
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
    delivery_action := case
      when new.delivery_details ->> 'mode' = 'manual' then 'quote_delivery_manual_fee_set'
      when new.delivery_details ->> 'mode' = 'region_rate' then 'quote_delivery_region_rate_applied'
      when new.delivery_details ->> 'mode' = 'city_rate' then 'quote_delivery_region_rate_applied'
      when new.delivery_details ->> 'mode' = 'disabled' then 'quote_delivery_cleared'
      else 'quote_delivery_updated'
    end;

    insert into public.audit_logs (
      id, empresa_id, user_id, user_email, user_name, action, module, target_id, old_value, new_value
    ) values (
      replace(gen_random_uuid()::text, '-', ''),
      new.empresa_id,
      actor.user_id,
      actor.user_email,
      actor.user_name,
      delivery_action,
      'quotes',
      new.id,
      old_delivery,
      new.delivery_details
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.normalize_delivery_city(text) from public, anon;
revoke all on function app_private.normalize_delivery_district(text) from public, anon;
revoke all on function app_private.valid_delivery_region_rate_row(text, text, text, text, numeric, boolean) from public, anon;
revoke all on function app_private.set_delivery_region_rate_defaults() from public, anon, authenticated;
revoke all on function app_private.audit_delivery_region_rates() from public, anon, authenticated;

grant execute on function app_private.normalize_delivery_city(text) to authenticated;
grant execute on function app_private.normalize_delivery_district(text) to authenticated;
grant execute on function app_private.valid_delivery_region_rate_row(text, text, text, text, numeric, boolean) to authenticated;
grant execute on function app_private.normalize_delivery_city(text) to service_role;
grant execute on function app_private.normalize_delivery_district(text) to service_role;
grant execute on function app_private.valid_delivery_region_rate_row(text, text, text, text, numeric, boolean) to service_role;
