create table if not exists public.labor_region_rates (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  empresa_id text not null default coalesce(app_private.current_empresa_id(), 'dcoratto-main') references public.empresas(id) on update cascade,
  district text not null,
  district_normalized text not null,
  city text not null,
  city_normalized text not null,
  minimum_labor_value numeric(14, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_labor_region_rates_empresa_active_city_district
on public.labor_region_rates(empresa_id, active, city_normalized, district_normalized);

create unique index if not exists uq_labor_region_rates_empresa_city_district
on public.labor_region_rates(empresa_id, city_normalized, district_normalized);

grant select on table public.labor_region_rates to authenticated;
grant insert, update, delete on table public.labor_region_rates to authenticated;

alter table public.labor_region_rates enable row level security;

drop policy if exists "tenant_select_labor_region_rates" on public.labor_region_rates;
create policy "tenant_select_labor_region_rates"
on public.labor_region_rates
for select
to authenticated
using (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_insert_labor_region_rates" on public.labor_region_rates;
create policy "tenant_insert_labor_region_rates"
on public.labor_region_rates
for insert
to authenticated
with check (
  empresa_id = coalesce(app_private.current_empresa_id(), 'dcoratto-main')
  and app_private.current_user_is_admin()
);

drop policy if exists "tenant_update_labor_region_rates" on public.labor_region_rates;
create policy "tenant_update_labor_region_rates"
on public.labor_region_rates
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

drop policy if exists "tenant_delete_labor_region_rates" on public.labor_region_rates;
create policy "tenant_delete_labor_region_rates"
on public.labor_region_rates
for delete
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_is_admin()
);

create or replace function app_private.valid_labor_region_rate_row(
  district_value text,
  district_normalized_value text,
  city_value text,
  city_normalized_value text,
  minimum_labor_value_input numeric,
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
    and minimum_labor_value_input between 0 and 10000000;
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
    where conname = 'labor_region_rates_row_valid'
      and conrelid = 'public.labor_region_rates'::regclass
  ) then
    alter table public.labor_region_rates
      add constraint labor_region_rates_row_valid
      check (
        app_private.valid_labor_region_rate_row(
          district,
          district_normalized,
          city,
          city_normalized,
          minimum_labor_value,
          active
        )
      ) not valid;
  end if;
end $$;

alter table public.labor_region_rates validate constraint labor_region_rates_row_valid;

create or replace function app_private.set_labor_region_rate_defaults()
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
  new.minimum_labor_value := round(greatest(0, coalesce(new.minimum_labor_value, 0))::numeric, 2);
  new.updated_at := timezone('utc', now());
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_labor_region_rate_defaults on public.labor_region_rates;
create trigger set_labor_region_rate_defaults
before insert or update on public.labor_region_rates
for each row execute function app_private.set_labor_region_rate_defaults();

create or replace function app_private.audit_labor_region_rates()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor record;
  action_name text;
  target_row public.labor_region_rates%rowtype;
begin
  target_row := coalesce(new, old);
  select * into actor from app_private.audit_actor(target_row.empresa_id);

  action_name := case
    when tg_op = 'INSERT' then 'labor_region_rate_created'
    when tg_op = 'DELETE' then 'labor_region_rate_deleted'
    when new.active is distinct from old.active then 'labor_region_rate_status_changed'
    else 'labor_region_rate_updated'
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
    'labor_region_rates',
    target_row.id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_labor_region_rates on public.labor_region_rates;
create trigger audit_labor_region_rates
after insert or update or delete on public.labor_region_rates
for each row execute function app_private.audit_labor_region_rates();

revoke all on function app_private.valid_labor_region_rate_row(text, text, text, text, numeric, boolean) from public, anon;
revoke all on function app_private.set_labor_region_rate_defaults() from public, anon, authenticated;
revoke all on function app_private.audit_labor_region_rates() from public, anon, authenticated;

grant execute on function app_private.valid_labor_region_rate_row(text, text, text, text, numeric, boolean) to authenticated;
grant execute on function app_private.valid_labor_region_rate_row(text, text, text, text, numeric, boolean) to service_role;
