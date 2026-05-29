-- Phase 1: close anonymous table writes/reads and add indexes used by the app.
-- This migration keeps existing authenticated access policies to avoid changing
-- current business behavior before a user/company ownership model is defined.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

drop policy if exists "anon_full_access_profiles" on public.profiles;
drop policy if exists "anon_full_access_users" on public.users;
drop policy if exists "anon_full_access_settings" on public.settings;
drop policy if exists "anon_full_access_condominiums" on public.condominiums;
drop policy if exists "anon_full_access_clients" on public.clients;
drop policy if exists "anon_full_access_employees" on public.employees;
drop policy if exists "anon_full_access_materials" on public.materials;
drop policy if exists "anon_full_access_user_material_prices" on public.user_material_prices;
drop policy if exists "anon_full_access_quotes" on public.quotes;
drop policy if exists "anon_full_access_yard_racks" on public.yard_racks;
drop policy if exists "anon_full_access_inventory" on public.inventory;
drop policy if exists "anon_full_access_inventory_reservations" on public.inventory_reservations;
drop policy if exists "anon_full_access_inventory_purchases" on public.inventory_purchases;
drop policy if exists "anon_full_access_fixture_catalog" on public.fixture_catalog;
drop policy if exists "anon_full_access_calendar_events" on public.calendar_events;
drop policy if exists "anon_full_access_dashboard_notes" on public.dashboard_notes;
drop policy if exists "anon_full_access_system_events" on public.system_events;
drop policy if exists "anon_full_access_audit_logs" on public.audit_logs;

drop policy if exists "anon_write_materials_images" on storage.objects;
drop policy if exists "anon_write_inventory_images" on storage.objects;
drop policy if exists "anon_write_fixture_files" on storage.objects;
drop policy if exists "anon_write_company_files" on storage.objects;

create index if not exists idx_clients_phone on public.clients(phone);
create index if not exists idx_clients_created_at on public.clients(created_at desc);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_profiles_name on public.profiles(name);
create index if not exists idx_employees_name on public.employees(name);
create index if not exists idx_fixture_catalog_name on public.fixture_catalog(name);
create index if not exists idx_condominiums_name on public.condominiums(name);

create index if not exists idx_materials_category on public.materials(category);
create index if not exists idx_materials_active_name on public.materials(active, name);
create index if not exists idx_inventory_material_name on public.inventory(material_name);
create index if not exists idx_inventory_created_at on public.inventory(created_at desc);
create index if not exists idx_inventory_status_created_at on public.inventory(status, created_at desc);

create index if not exists idx_inventory_purchases_purchased_at on public.inventory_purchases(purchased_at desc);
create index if not exists idx_inventory_purchases_status_created_at on public.inventory_purchases(status, created_at desc);
create index if not exists idx_inventory_reservations_quote_material on public.inventory_reservations(quote_id, material_id);

create index if not exists idx_quotes_client_created_at on public.quotes(client_id, created_at desc);
create index if not exists idx_quotes_status_created_at on public.quotes(status, created_at desc);
create index if not exists idx_quotes_responsible_user_uid on public.quotes(responsible_user_uid);
create index if not exists idx_quotes_measurement_date on public.quotes(measurement_date);
create index if not exists idx_quotes_delivery_date on public.quotes(delivery_date);

create index if not exists idx_calendar_events_date_key on public.calendar_events(date_key);
create index if not exists idx_calendar_events_created_by_uid on public.calendar_events(created_by_uid);
create index if not exists idx_dashboard_notes_target_created_at on public.dashboard_notes(target_uid, created_at desc);
create index if not exists idx_system_events_entity_created_at on public.system_events(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_logs_user_created_at on public.audit_logs(user_id, created_at desc);
