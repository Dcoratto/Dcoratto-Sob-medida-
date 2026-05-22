create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create index if not exists idx_clients_condominium_id on public.clients(condominium_id);
create index if not exists idx_quotes_material_id on public.quotes(material_id);
create index if not exists idx_calendar_events_client_id on public.calendar_events(client_id);
create index if not exists idx_inventory_loss_quote_id on public.inventory(loss_quote_id);
create index if not exists idx_inventory_loss_client_id on public.inventory(loss_client_id);
create index if not exists idx_inventory_purchases_inventory_item_id on public.inventory_purchases(inventory_item_id);
create index if not exists idx_inventory_purchases_material_id on public.inventory_purchases(material_id);
create index if not exists idx_inventory_reservations_material_id on public.inventory_reservations(material_id);
create index if not exists idx_system_events_client_id on public.system_events(client_id);
create index if not exists idx_system_events_quote_id on public.system_events(quote_id);
create index if not exists idx_system_events_material_id on public.system_events(material_id);
create index if not exists idx_system_events_employee_id on public.system_events(employee_id);
create index if not exists idx_user_material_prices_material_id on public.user_material_prices(material_id);

drop policy if exists "authenticated_full_access_profiles" on public.profiles;
create policy "authenticated_full_access_profiles" on public.profiles for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_users" on public.users;
create policy "authenticated_full_access_users" on public.users for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_settings" on public.settings;
create policy "authenticated_full_access_settings" on public.settings for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_condominiums" on public.condominiums;
create policy "authenticated_full_access_condominiums" on public.condominiums for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_clients" on public.clients;
create policy "authenticated_full_access_clients" on public.clients for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_employees" on public.employees;
create policy "authenticated_full_access_employees" on public.employees for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_materials" on public.materials;
create policy "authenticated_full_access_materials" on public.materials for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_user_material_prices" on public.user_material_prices;
create policy "authenticated_full_access_user_material_prices" on public.user_material_prices for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_quotes" on public.quotes;
create policy "authenticated_full_access_quotes" on public.quotes for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_yard_racks" on public.yard_racks;
create policy "authenticated_full_access_yard_racks" on public.yard_racks for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_inventory" on public.inventory;
create policy "authenticated_full_access_inventory" on public.inventory for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_inventory_reservations" on public.inventory_reservations;
create policy "authenticated_full_access_inventory_reservations" on public.inventory_reservations for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_inventory_purchases" on public.inventory_purchases;
create policy "authenticated_full_access_inventory_purchases" on public.inventory_purchases for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_fixture_catalog" on public.fixture_catalog;
create policy "authenticated_full_access_fixture_catalog" on public.fixture_catalog for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_calendar_events" on public.calendar_events;
create policy "authenticated_full_access_calendar_events" on public.calendar_events for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_dashboard_notes" on public.dashboard_notes;
create policy "authenticated_full_access_dashboard_notes" on public.dashboard_notes for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_system_events" on public.system_events;
create policy "authenticated_full_access_system_events" on public.system_events for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "authenticated_full_access_audit_logs" on public.audit_logs;
create policy "authenticated_full_access_audit_logs" on public.audit_logs for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.handle_new_auth_user() from anon;
revoke execute on function public.handle_new_auth_user() from authenticated;

drop policy if exists "public_read_materials_images" on storage.objects;
drop policy if exists "public_read_inventory_images" on storage.objects;
drop policy if exists "public_read_fixture_files" on storage.objects;
drop policy if exists "public_read_company_files" on storage.objects;
drop policy if exists "authenticated_write_materials_images" on storage.objects;
drop policy if exists "authenticated_write_inventory_images" on storage.objects;
drop policy if exists "authenticated_write_fixture_files" on storage.objects;
drop policy if exists "authenticated_write_company_files" on storage.objects;

create policy "authenticated_insert_materials_images" on storage.objects
for insert to authenticated
with check (bucket_id = 'materials-images');
create policy "authenticated_update_materials_images" on storage.objects
for update to authenticated
using (bucket_id = 'materials-images')
with check (bucket_id = 'materials-images');
create policy "authenticated_delete_materials_images" on storage.objects
for delete to authenticated
using (bucket_id = 'materials-images');

create policy "authenticated_insert_inventory_images" on storage.objects
for insert to authenticated
with check (bucket_id = 'inventory-images');
create policy "authenticated_update_inventory_images" on storage.objects
for update to authenticated
using (bucket_id = 'inventory-images')
with check (bucket_id = 'inventory-images');
create policy "authenticated_delete_inventory_images" on storage.objects
for delete to authenticated
using (bucket_id = 'inventory-images');

create policy "authenticated_insert_fixture_files" on storage.objects
for insert to authenticated
with check (bucket_id = 'fixture-files');
create policy "authenticated_update_fixture_files" on storage.objects
for update to authenticated
using (bucket_id = 'fixture-files')
with check (bucket_id = 'fixture-files');
create policy "authenticated_delete_fixture_files" on storage.objects
for delete to authenticated
using (bucket_id = 'fixture-files');

create policy "authenticated_insert_company_files" on storage.objects
for insert to authenticated
with check (bucket_id = 'company-files');
create policy "authenticated_update_company_files" on storage.objects
for update to authenticated
using (bucket_id = 'company-files')
with check (bucket_id = 'company-files');
create policy "authenticated_delete_company_files" on storage.objects
for delete to authenticated
using (bucket_id = 'company-files');
