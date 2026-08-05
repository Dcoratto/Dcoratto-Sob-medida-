-- Phase 1: compatible multi-company isolation.
-- Existing rows are assigned to the default company. RLS is then changed from
-- "any authenticated user" to "authenticated user inside the same empresa_id".

create table if not exists public.empresas (
  id text primary key,
  name text not null default '',
  slug text unique,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

insert into public.empresas (id, name, slug)
values ('dcoratto-main', 'Dcoratto', 'dcoratto')
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    updated_at = timezone('utc'::text, now());

alter table public.empresas enable row level security;

drop trigger if exists set_updated_at_empresas on public.empresas;
create trigger set_updated_at_empresas
before update on public.empresas
for each row execute function public.set_updated_at();

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

do $$
declare
  table_name text;
  tenant_tables text[] := array[
    'profiles',
    'users',
    'settings',
    'condominiums',
    'clients',
    'employees',
    'materials',
    'user_material_prices',
    'quotes',
    'yard_racks',
    'inventory',
    'inventory_reservations',
    'inventory_purchases',
    'fixture_catalog',
    'calendar_events',
    'dashboard_notes',
    'system_events',
    'audit_logs'
  ];
begin
  foreach table_name in array tenant_tables loop
    execute format('alter table public.%I add column if not exists empresa_id text', table_name);
    execute format('update public.%I set empresa_id = %L where empresa_id is null', table_name, 'dcoratto-main');
    execute format('alter table public.%I alter column empresa_id set default %L', table_name, 'dcoratto-main');
    execute format('alter table public.%I alter column empresa_id set not null', table_name);
    execute format('create index if not exists %I on public.%I(empresa_id)', 'idx_' || table_name || '_empresa_id', table_name);

    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', table_name)::regclass
        and conname = table_name || '_empresa_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (empresa_id) references public.empresas(id) on update cascade',
        table_name,
        table_name || '_empresa_id_fkey'
      );
    end if;
  end loop;
end $$;

create index if not exists idx_empresas_slug on public.empresas(slug);
create index if not exists idx_users_auth_empresa on public.users(auth_user_id, empresa_id);
create index if not exists idx_profiles_auth_empresa on public.profiles(auth_user_id, empresa_id);

create or replace function app_private.current_empresa_id()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select empresa_id
      from public.users
      where auth_user_id = auth.uid()
         or id = auth.uid()::text
      order by updated_at desc nulls last
      limit 1
    ),
    (
      select empresa_id
      from public.profiles
      where auth_user_id = auth.uid()
         or id = auth.uid()::text
      order by updated_at desc nulls last
      limit 1
    )
  );
$$;

create or replace function app_private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users
    where (auth_user_id = auth.uid() or id = auth.uid()::text)
      and role = 'administrativo'
      and blocked is not true
  );
$$;

revoke all on function app_private.current_empresa_id() from public;
revoke all on function app_private.current_user_is_admin() from public;
grant execute on function app_private.current_empresa_id() to authenticated;
grant execute on function app_private.current_user_is_admin() to authenticated;

drop policy if exists "tenant_select_empresas" on public.empresas;
drop policy if exists "tenant_update_empresas" on public.empresas;
create policy "tenant_select_empresas"
on public.empresas
for select
to authenticated
using (id = app_private.current_empresa_id());

create policy "tenant_update_empresas"
on public.empresas
for update
to authenticated
using (id = app_private.current_empresa_id() and app_private.current_user_is_admin())
with check (id = app_private.current_empresa_id() and app_private.current_user_is_admin());

drop policy if exists "authenticated_full_access_profiles" on public.profiles;
drop policy if exists "tenant_select_profiles" on public.profiles;
drop policy if exists "tenant_insert_profiles" on public.profiles;
drop policy if exists "tenant_update_profiles" on public.profiles;
drop policy if exists "tenant_delete_profiles" on public.profiles;
create policy "tenant_select_profiles"
on public.profiles
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  or id = auth.uid()::text
  or auth_user_id = auth.uid()
);
create policy "tenant_insert_profiles"
on public.profiles
for insert
to authenticated
with check (
  empresa_id = coalesce(app_private.current_empresa_id(), 'dcoratto-main')
  and (id = auth.uid()::text or auth_user_id = auth.uid() or app_private.current_user_is_admin())
);
create policy "tenant_update_profiles"
on public.profiles
for update
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and (id = auth.uid()::text or auth_user_id = auth.uid() or app_private.current_user_is_admin())
)
with check (
  empresa_id = app_private.current_empresa_id()
  and (id = auth.uid()::text or auth_user_id = auth.uid() or app_private.current_user_is_admin())
);
create policy "tenant_delete_profiles"
on public.profiles
for delete
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.current_user_is_admin());

drop policy if exists "authenticated_full_access_users" on public.users;
drop policy if exists "tenant_select_users" on public.users;
drop policy if exists "tenant_insert_users" on public.users;
drop policy if exists "tenant_update_users" on public.users;
drop policy if exists "tenant_delete_users" on public.users;
create policy "tenant_select_users"
on public.users
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  or id = auth.uid()::text
  or auth_user_id = auth.uid()
);
create policy "tenant_insert_users"
on public.users
for insert
to authenticated
with check (
  empresa_id = coalesce(app_private.current_empresa_id(), 'dcoratto-main')
  and (id = auth.uid()::text or auth_user_id = auth.uid() or app_private.current_user_is_admin())
);
create policy "tenant_update_users"
on public.users
for update
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and (id = auth.uid()::text or auth_user_id = auth.uid() or app_private.current_user_is_admin())
)
with check (
  empresa_id = app_private.current_empresa_id()
  and (id = auth.uid()::text or auth_user_id = auth.uid() or app_private.current_user_is_admin())
);
create policy "tenant_delete_users"
on public.users
for delete
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.current_user_is_admin());

do $$
declare
  table_name text;
  tenant_tables text[] := array[
    'settings',
    'condominiums',
    'clients',
    'employees',
    'materials',
    'user_material_prices',
    'quotes',
    'yard_racks',
    'inventory',
    'inventory_reservations',
    'inventory_purchases',
    'fixture_catalog',
    'calendar_events',
    'dashboard_notes',
    'system_events',
    'audit_logs'
  ];
begin
  foreach table_name in array tenant_tables loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_full_access_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'tenant_all_' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (empresa_id = app_private.current_empresa_id()) with check (empresa_id = app_private.current_empresa_id())',
      'tenant_all_' || table_name,
      table_name
    );
  end loop;
end $$;
