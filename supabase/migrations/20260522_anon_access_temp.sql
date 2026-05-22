grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

drop policy if exists "anon_full_access_profiles" on public.profiles;
create policy "anon_full_access_profiles" on public.profiles for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_users" on public.users;
create policy "anon_full_access_users" on public.users for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_settings" on public.settings;
create policy "anon_full_access_settings" on public.settings for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_condominiums" on public.condominiums;
create policy "anon_full_access_condominiums" on public.condominiums for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_clients" on public.clients;
create policy "anon_full_access_clients" on public.clients for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_employees" on public.employees;
create policy "anon_full_access_employees" on public.employees for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_materials" on public.materials;
create policy "anon_full_access_materials" on public.materials for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_user_material_prices" on public.user_material_prices;
create policy "anon_full_access_user_material_prices" on public.user_material_prices for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_quotes" on public.quotes;
create policy "anon_full_access_quotes" on public.quotes for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_yard_racks" on public.yard_racks;
create policy "anon_full_access_yard_racks" on public.yard_racks for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_inventory" on public.inventory;
create policy "anon_full_access_inventory" on public.inventory for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_inventory_reservations" on public.inventory_reservations;
create policy "anon_full_access_inventory_reservations" on public.inventory_reservations for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_inventory_purchases" on public.inventory_purchases;
create policy "anon_full_access_inventory_purchases" on public.inventory_purchases for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_fixture_catalog" on public.fixture_catalog;
create policy "anon_full_access_fixture_catalog" on public.fixture_catalog for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_calendar_events" on public.calendar_events;
create policy "anon_full_access_calendar_events" on public.calendar_events for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_dashboard_notes" on public.dashboard_notes;
create policy "anon_full_access_dashboard_notes" on public.dashboard_notes for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_system_events" on public.system_events;
create policy "anon_full_access_system_events" on public.system_events for all to anon using (true) with check (true);
drop policy if exists "anon_full_access_audit_logs" on public.audit_logs;
create policy "anon_full_access_audit_logs" on public.audit_logs for all to anon using (true) with check (true);

drop policy if exists "anon_write_materials_images" on storage.objects;
create policy "anon_write_materials_images" on storage.objects
for all to anon
using (bucket_id = 'materials-images')
with check (bucket_id = 'materials-images');

drop policy if exists "anon_write_inventory_images" on storage.objects;
create policy "anon_write_inventory_images" on storage.objects
for all to anon
using (bucket_id = 'inventory-images')
with check (bucket_id = 'inventory-images');

drop policy if exists "anon_write_fixture_files" on storage.objects;
create policy "anon_write_fixture_files" on storage.objects
for all to anon
using (bucket_id = 'fixture-files')
with check (bucket_id = 'fixture-files');

drop policy if exists "anon_write_company_files" on storage.objects;
create policy "anon_write_company_files" on storage.objects
for all to anon
using (bucket_id = 'company-files')
with check (bucket_id = 'company-files');
