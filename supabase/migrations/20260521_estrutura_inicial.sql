create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id text primary key,
  auth_user_id uuid unique,
  name text not null default '',
  email text not null default '',
  role text not null default 'user',
  blocked boolean not null default false,
  phone text,
  photo_url text,
  position text,
  calendar_feed_token text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.users (
  id text primary key,
  auth_user_id uuid unique,
  nome text not null default '',
  name text,
  email text not null default '',
  role text not null default 'vendedor',
  permissions jsonb not null default '{}'::jsonb,
  blocked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by_uid text,
  updated_by_email text,
  updated_by_name text
);

create table if not exists public.settings (
  id text primary key,
  company_name text not null default '',
  logo_url text,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  default_validity integer not null default 0,
  default_notes text not null default '',
  labor_rate_per_linear_meter numeric(12,2) not null default 0,
  default_fronton_height numeric(12,2) not null default 0,
  default_skirt_height numeric(12,2) not null default 0,
  default_turn_height numeric(12,2) not null default 0,
  cutout_prices jsonb not null default '{}'::jsonb,
  payment_methods jsonb not null default '[]'::jsonb,
  sculpted_sink_rates jsonb not null default '{}'::jsonb,
  material_catalog jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.condominiums (
  id text primary key,
  name text not null,
  city text not null default '',
  address_mode text,
  allowed_weekdays jsonb not null default '[]'::jsonb,
  work_start_hour text not null default '',
  work_end_hour text not null default '',
  block_national_holidays boolean not null default false,
  block_city_holidays boolean not null default false,
  notes text,
  created_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clients (
  id text primary key,
  name text not null,
  phone text not null default '',
  email text,
  google_drive_url text,
  manual_stage text,
  manual_quote_status text,
  legacy_project_mode text,
  legacy_manual_quote jsonb,
  cpf text,
  rg text,
  birth_date text,
  address text not null default '',
  street_address text,
  notes text not null default '',
  city text,
  zip_code text,
  neighborhood text,
  address_type text,
  condominium_id text references public.condominiums(id) on delete set null,
  condominium_name text,
  block text,
  lot text,
  tower text,
  apartment_number text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.employees (
  id text primary key,
  name text not null,
  role text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.materials (
  id text primary key,
  name text not null,
  price_per_m2 numeric(12,2) not null default 0,
  base_cost_per_m2 numeric(12,2),
  base_minimum_sale_per_m2 numeric(12,2),
  margin_percentage numeric(8,2),
  provider text not null default '',
  category text not null default '',
  material_line text,
  material_type text,
  thickness_label text,
  texture text,
  image_url text,
  active boolean not null default true,
  source_inventory_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_material_prices (
  id text primary key,
  user_id text not null,
  material_id text not null references public.materials(id) on delete cascade,
  material_variant_key text,
  base_cost_per_m2 numeric(12,2) not null default 0,
  base_minimum_sale_per_m2 numeric(12,2),
  margin_percentage numeric(8,2) not null default 0,
  price_per_m2 numeric(12,2) not null default 0,
  final_price_per_m2 numeric(12,2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.quotes (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  client_name text not null default '',
  phone text not null default '',
  address text not null default '',
  environment text not null default '',
  responsible text not null default '',
  responsible_user_uid text,
  responsible_user_name text,
  material_id text references public.materials(id) on delete set null,
  material_name text,
  payment_method text not null default '',
  delivery_days integer not null default 0,
  validity_date timestamptz,
  measurement_date timestamptz,
  delivery_date timestamptz,
  commercial_notes text not null default '',
  status text not null default 'Orçamento',
  total_area numeric(14,4) not null default 0,
  total_price numeric(14,2) not null default 0,
  pieces jsonb not null default '[]'::jsonb,
  cutouts jsonb not null default '{}'::jsonb,
  team_counts jsonb,
  employee_assignments jsonb,
  employee_evaluations jsonb,
  status_history jsonb,
  created_at timestamptz,
  created_by text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.yard_racks (
  id text primary key,
  name text not null unique,
  sort_order integer not null,
  position_x numeric(8,2),
  position_y numeric(8,2),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory (
  id text primary key,
  material_id text not null references public.materials(id) on delete restrict,
  material_name text not null default '',
  code text not null default '',
  provider text not null default '',
  rack_id text references public.yard_racks(id) on delete set null,
  category text,
  material_line text,
  material_type text,
  thickness_label text,
  texture text,
  length numeric(12,2) not null default 0,
  width numeric(12,2) not null default 0,
  thickness numeric(12,2) not null default 0,
  area numeric(14,4) not null default 0,
  cost numeric(14,2) not null default 0,
  minimum_sale_price numeric(14,2),
  status text not null default 'Disponível',
  notes text not null default '',
  photo_url text,
  loss_reason text,
  loss_notes text,
  loss_quote_id text references public.quotes(id) on delete set null,
  loss_client_id text references public.clients(id) on delete set null,
  loss_client_name text,
  loss_piece_id text,
  loss_piece_name text,
  lost_by_uid text,
  lost_by_name text,
  lost_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory_reservations (
  id text primary key,
  quote_id text not null references public.quotes(id) on delete cascade,
  material_id text not null references public.materials(id) on delete cascade,
  material_variant_key text,
  material_line text,
  material_type text,
  thickness_label text,
  texture text,
  provider text,
  material_name text not null default '',
  area numeric(14,4) not null default 0,
  quote_status text not null default '',
  client_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz
);

create table if not exists public.inventory_purchases (
  id text primary key,
  material_id text references public.materials(id) on delete set null,
  material_name text not null default '',
  provider text,
  code text not null default '',
  category text,
  material_line text,
  material_type text,
  thickness_label text,
  texture text,
  length numeric(12,2) not null default 0,
  width numeric(12,2) not null default 0,
  thickness numeric(12,2) not null default 0,
  area numeric(14,4) not null default 0,
  cost numeric(14,2) not null default 0,
  minimum_sale_price numeric(14,2),
  photo_url text,
  purchase_group_id text,
  purchase_index integer,
  purchase_quantity integer,
  status text not null default 'Pedido',
  notes text,
  expected_delivery_date timestamptz,
  expected_delivery_date_key text,
  purchased_by_uid text not null default '',
  purchased_by_name text not null default '',
  purchased_at timestamptz,
  received_by_uid text,
  received_by_name text,
  received_at timestamptz,
  inventory_item_id text references public.inventory(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fixture_catalog (
  id text primary key,
  name text not null,
  category text not null,
  brand text,
  model text,
  width numeric(12,2),
  depth numeric(12,2),
  height numeric(12,2),
  diameter numeric(12,2),
  image_url text,
  manual_url text,
  manual_file_name text,
  notes text,
  active boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.calendar_events (
  id text primary key,
  title text not null,
  description text,
  date timestamptz not null,
  date_key text,
  client_id text references public.clients(id) on delete set null,
  client_name text,
  city text,
  event_time text,
  created_by_uid text,
  created_by_name text,
  source_type text,
  status text,
  supplier text,
  material_name text,
  purchase_group_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dashboard_notes (
  id text primary key,
  text text not null,
  user_uid text,
  user_name text,
  target_uid text,
  target_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.system_events (
  id text primary key,
  type text not null,
  title text not null,
  description text,
  entity_type text not null,
  entity_id text,
  client_id text references public.clients(id) on delete set null,
  client_name text,
  quote_id text references public.quotes(id) on delete set null,
  quote_status text,
  material_id text references public.materials(id) on delete set null,
  material_name text,
  employee_id text references public.employees(id) on delete set null,
  employee_name text,
  user_uid text,
  user_name text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id text primary key,
  user_id text,
  user_email text not null default '',
  user_name text not null default '',
  action text not null,
  module text not null,
  target_id text not null default '',
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_auth_user_id on public.profiles(auth_user_id);
create index if not exists idx_users_auth_user_id on public.users(auth_user_id);
create index if not exists idx_clients_name on public.clients(name);
create index if not exists idx_materials_name on public.materials(name);
create index if not exists idx_materials_provider on public.materials(provider);
create index if not exists idx_quotes_client_id on public.quotes(client_id);
create index if not exists idx_quotes_status on public.quotes(status);
create index if not exists idx_quotes_created_at on public.quotes(created_at desc);
create index if not exists idx_inventory_material_id on public.inventory(material_id);
create index if not exists idx_inventory_rack_id on public.inventory(rack_id);
create index if not exists idx_inventory_code on public.inventory(code);
create index if not exists idx_inventory_status on public.inventory(status);
create index if not exists idx_inventory_purchases_group on public.inventory_purchases(purchase_group_id);
create index if not exists idx_inventory_reservations_quote_id on public.inventory_reservations(quote_id);
create index if not exists idx_calendar_events_date on public.calendar_events(date);
create index if not exists idx_dashboard_notes_created_at on public.dashboard_notes(created_at desc);
create index if not exists idx_system_events_created_at on public.system_events(created_at desc);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_users on public.users;
create trigger set_updated_at_users before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_settings on public.settings;
create trigger set_updated_at_settings before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_condominiums on public.condominiums;
create trigger set_updated_at_condominiums before update on public.condominiums
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_clients on public.clients;
create trigger set_updated_at_clients before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_employees on public.employees;
create trigger set_updated_at_employees before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_materials on public.materials;
create trigger set_updated_at_materials before update on public.materials
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_user_material_prices on public.user_material_prices;
create trigger set_updated_at_user_material_prices before update on public.user_material_prices
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_quotes on public.quotes;
create trigger set_updated_at_quotes before update on public.quotes
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_yard_racks on public.yard_racks;
create trigger set_updated_at_yard_racks before update on public.yard_racks
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_inventory on public.inventory;
create trigger set_updated_at_inventory before update on public.inventory
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_inventory_purchases on public.inventory_purchases;
create trigger set_updated_at_inventory_purchases before update on public.inventory_purchases
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_fixture_catalog on public.fixture_catalog;
create trigger set_updated_at_fixture_catalog before update on public.fixture_catalog
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_calendar_events on public.calendar_events;
create trigger set_updated_at_calendar_events before update on public.calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_dashboard_notes on public.dashboard_notes;
create trigger set_updated_at_dashboard_notes before update on public.dashboard_notes
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.settings enable row level security;
alter table public.condominiums enable row level security;
alter table public.clients enable row level security;
alter table public.employees enable row level security;
alter table public.materials enable row level security;
alter table public.user_material_prices enable row level security;
alter table public.quotes enable row level security;
alter table public.yard_racks enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.fixture_catalog enable row level security;
alter table public.calendar_events enable row level security;
alter table public.dashboard_notes enable row level security;
alter table public.system_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "authenticated_full_access_profiles" on public.profiles;
create policy "authenticated_full_access_profiles" on public.profiles for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_users" on public.users;
create policy "authenticated_full_access_users" on public.users for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_settings" on public.settings;
create policy "authenticated_full_access_settings" on public.settings for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_condominiums" on public.condominiums;
create policy "authenticated_full_access_condominiums" on public.condominiums for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_clients" on public.clients;
create policy "authenticated_full_access_clients" on public.clients for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_employees" on public.employees;
create policy "authenticated_full_access_employees" on public.employees for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_materials" on public.materials;
create policy "authenticated_full_access_materials" on public.materials for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_user_material_prices" on public.user_material_prices;
create policy "authenticated_full_access_user_material_prices" on public.user_material_prices for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_quotes" on public.quotes;
create policy "authenticated_full_access_quotes" on public.quotes for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_yard_racks" on public.yard_racks;
create policy "authenticated_full_access_yard_racks" on public.yard_racks for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_inventory" on public.inventory;
create policy "authenticated_full_access_inventory" on public.inventory for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_inventory_reservations" on public.inventory_reservations;
create policy "authenticated_full_access_inventory_reservations" on public.inventory_reservations for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_inventory_purchases" on public.inventory_purchases;
create policy "authenticated_full_access_inventory_purchases" on public.inventory_purchases for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_fixture_catalog" on public.fixture_catalog;
create policy "authenticated_full_access_fixture_catalog" on public.fixture_catalog for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_calendar_events" on public.calendar_events;
create policy "authenticated_full_access_calendar_events" on public.calendar_events for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_dashboard_notes" on public.dashboard_notes;
create policy "authenticated_full_access_dashboard_notes" on public.dashboard_notes for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_system_events" on public.system_events;
create policy "authenticated_full_access_system_events" on public.system_events for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_full_access_audit_logs" on public.audit_logs;
create policy "authenticated_full_access_audit_logs" on public.audit_logs for all to authenticated using (true) with check (true);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, auth_user_id, name, email, role, blocked)
  values (
    new.id::text,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), 'Usuário'),
    coalesce(new.email, ''),
    'user',
    false
  )
  on conflict (id) do update
  set auth_user_id = excluded.auth_user_id,
      email = excluded.email;

  insert into public.users (id, auth_user_id, nome, name, email, role, permissions, blocked)
  values (
    new.id::text,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), 'Usuário'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), 'Usuário'),
    coalesce(new.email, ''),
    'vendedor',
    '{}'::jsonb,
    false
  )
  on conflict (id) do update
  set auth_user_id = excluded.auth_user_id,
      email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.settings (
  id,
  company_name,
  phone,
  email,
  address,
  default_validity,
  default_notes,
  labor_rate_per_linear_meter,
  default_fronton_height,
  default_skirt_height,
  default_turn_height,
  cutout_prices,
  payment_methods,
  sculpted_sink_rates,
  material_catalog
)
values (
  'global',
  'D''Coratto Sob Medida',
  '(00) 00000-0000',
  'contato@dcoratto.com.br',
  'Endereço da marmoraria',
  15,
  'Orçamento sujeito à confirmação de medidas no local.',
  120,
  10,
  4,
  2,
  '{"cooktop":150,"sinkUnder":100,"sinkOver":80,"faucetHole":30,"trashBinCutout":60,"popUpTowerCutout":45,"wetAreaAmericanRecess":120,"wetAreaItalianRecess":160,"sinkSculpted":false,"sinkSculptedPrice":800}'::jsonb,
  '[{"name":"À vista (Dinheiro/Pix)","adjustment":-5},{"name":"Cartão de Débito","adjustment":0},{"name":"Cartão de Crédito 1x","adjustment":3},{"name":"Parcelado 10x","adjustment":15}]'::jsonb,
  '{"simple":800,"ramp":1200,"hiddenValve":1500,"extraSink":400,"riskPercentage":10}'::jsonb,
  '{"materialCategories":["Granito","Mármore","Quartzito","Quartzo","Lâmina Ultracompacta","Porcelanato","Superfície Sinterizada"],"materialLines":["Nacional","Importado","Premium","Super Premium"],"materialTypes":["Chapa","Lâmina"],"naturalThicknesses":["2cm"],"slabThicknesses":["6mm","12mm"],"textures":["Polido","Escovado","Acetinado","Flameado","Fosco","Levigado"],"suppliers":[]}'::jsonb
)
on conflict (id) do nothing;

insert into public.yard_racks (id, name, sort_order, position_x, position_y)
values
  ('rack_1', 'Cavalete 1', 1, 1, 1),
  ('rack_2', 'Cavalete 2', 2, 2, 1),
  ('rack_3', 'Cavalete 3', 3, 3, 1),
  ('rack_4', 'Cavalete 4', 4, 1, 2),
  ('rack_5', 'Cavalete 5', 5, 2, 2),
  ('rack_6', 'Cavalete 6', 6, 3, 2),
  ('rack_7', 'Cavalete 7', 7, 1, 3),
  ('rack_8', 'Cavalete 8', 8, 2, 3),
  ('rack_9', 'Cavalete 9', 9, 3, 3)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values
  ('materials-images', 'materials-images', true),
  ('inventory-images', 'inventory-images', true),
  ('fixture-files', 'fixture-files', true),
  ('company-files', 'company-files', true)
on conflict (id) do nothing;

drop policy if exists "public_read_materials_images" on storage.objects;
create policy "public_read_materials_images" on storage.objects
for select using (bucket_id = 'materials-images');
drop policy if exists "public_read_inventory_images" on storage.objects;
create policy "public_read_inventory_images" on storage.objects
for select using (bucket_id = 'inventory-images');
drop policy if exists "public_read_fixture_files" on storage.objects;
create policy "public_read_fixture_files" on storage.objects
for select using (bucket_id = 'fixture-files');
drop policy if exists "public_read_company_files" on storage.objects;
create policy "public_read_company_files" on storage.objects
for select using (bucket_id = 'company-files');

drop policy if exists "authenticated_write_materials_images" on storage.objects;
create policy "authenticated_write_materials_images" on storage.objects
for all to authenticated
using (bucket_id = 'materials-images')
with check (bucket_id = 'materials-images');
drop policy if exists "authenticated_write_inventory_images" on storage.objects;
create policy "authenticated_write_inventory_images" on storage.objects
for all to authenticated
using (bucket_id = 'inventory-images')
with check (bucket_id = 'inventory-images');
drop policy if exists "authenticated_write_fixture_files" on storage.objects;
create policy "authenticated_write_fixture_files" on storage.objects
for all to authenticated
using (bucket_id = 'fixture-files')
with check (bucket_id = 'fixture-files');
drop policy if exists "authenticated_write_company_files" on storage.objects;
create policy "authenticated_write_company_files" on storage.objects
for all to authenticated
using (bucket_id = 'company-files')
with check (bucket_id = 'company-files');
