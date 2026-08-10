drop policy if exists tenant_all_materials on public.materials;

drop policy if exists tenant_select_materials on public.materials;
create policy tenant_select_materials
on public.materials
for select
to authenticated
using (empresa_id = app_private.current_empresa_id());

drop policy if exists tenant_insert_materials_admin on public.materials;
create policy tenant_insert_materials_admin
on public.materials
for insert
to authenticated
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_is_admin()
);

drop policy if exists tenant_update_materials_admin on public.materials;
create policy tenant_update_materials_admin
on public.materials
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

drop policy if exists tenant_delete_materials_admin on public.materials;
create policy tenant_delete_materials_admin
on public.materials
for delete
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_is_admin()
);

drop policy if exists authenticated_select_materials_images_admin on storage.objects;
create policy authenticated_select_materials_images_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'materials-images'
  and (storage.foldername(name))[1] = 'materials'
  and app_private.current_user_is_admin()
);

drop policy if exists authenticated_insert_materials_images_admin on storage.objects;
create policy authenticated_insert_materials_images_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'materials-images'
  and (storage.foldername(name))[1] = 'materials'
  and app_private.current_user_is_admin()
);

drop policy if exists authenticated_update_materials_images_admin on storage.objects;
create policy authenticated_update_materials_images_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'materials-images'
  and (storage.foldername(name))[1] = 'materials'
  and app_private.current_user_is_admin()
)
with check (
  bucket_id = 'materials-images'
  and (storage.foldername(name))[1] = 'materials'
  and app_private.current_user_is_admin()
);

drop policy if exists authenticated_delete_materials_images_admin on storage.objects;
create policy authenticated_delete_materials_images_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'materials-images'
  and (storage.foldername(name))[1] = 'materials'
  and app_private.current_user_is_admin()
);

drop policy if exists authenticated_insert_materials_images on storage.objects;
drop policy if exists authenticated_update_materials_images on storage.objects;
drop policy if exists authenticated_delete_materials_images on storage.objects;
