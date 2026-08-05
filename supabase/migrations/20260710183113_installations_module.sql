create table if not exists public.installations (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  client_id text not null references public.clients(id) on update cascade on delete restrict,
  quote_id text not null references public.quotes(id) on update cascade on delete restrict,
  installer_employee_id text references public.employees(id) on update cascade on delete set null,
  installation_date timestamptz not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  total_items integer not null default 0,
  completed_items integer not null default 0,
  completion_percent integer not null default 0,
  finalized_at timestamptz,
  finalized_by_uid text,
  finalized_by_name text,
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by_uid text,
  deleted_by_name text
);

create table if not exists public.installation_checklist_items (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  installation_id text not null references public.installations(id) on update cascade on delete restrict,
  template_key text not null,
  group_key text not null,
  group_label text not null,
  title text not null,
  sort_order integer not null default 0,
  required boolean not null default true,
  checked boolean not null default false,
  observation text,
  photo_count integer not null default 0,
  checked_at timestamptz,
  checked_by_uid text,
  checked_by_name text,
  unchecked_at timestamptz,
  unchecked_by_uid text,
  unchecked_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.installation_checklist_photos (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  installation_id text not null references public.installations(id) on update cascade on delete restrict,
  checklist_item_id text not null references public.installation_checklist_items(id) on update cascade on delete restrict,
  bucket_id text not null default 'installation-files' check (bucket_id = 'installation-files'),
  file_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  width integer,
  height integer,
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by_uid text,
  deleted_by_name text
);

create table if not exists public.installation_history (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  installation_id text not null references public.installations(id) on update cascade on delete restrict,
  checklist_item_id text references public.installation_checklist_items(id) on update cascade on delete restrict,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  user_uid text,
  user_name text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_installations_active_quote
on public.installations(empresa_id, quote_id)
where deleted_at is null;

create index if not exists idx_installations_empresa_status
on public.installations(empresa_id, status, installation_date desc);

create index if not exists idx_installation_items_installation
on public.installation_checklist_items(empresa_id, installation_id, sort_order);

create index if not exists idx_installation_photos_item
on public.installation_checklist_photos(empresa_id, checklist_item_id, created_at desc);

create index if not exists idx_installation_history_installation
on public.installation_history(empresa_id, installation_id, created_at desc);

alter table public.installations enable row level security;
alter table public.installation_checklist_items enable row level security;
alter table public.installation_checklist_photos enable row level security;
alter table public.installation_history enable row level security;

drop trigger if exists set_updated_at_installations on public.installations;
create trigger set_updated_at_installations
before update on public.installations
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_installation_checklist_items on public.installation_checklist_items;
create trigger set_updated_at_installation_checklist_items
before update on public.installation_checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_installation_checklist_photos on public.installation_checklist_photos;
create trigger set_updated_at_installation_checklist_photos
before update on public.installation_checklist_photos
for each row execute function public.set_updated_at();

create or replace function public.installation_make_id()
returns text
language sql
volatile
set search_path = public
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public.installation_recalculate_summary(target_installation_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  required_total integer := 0;
  required_completed integer := 0;
begin
  if target_installation_id is null then
    return;
  end if;

  select
    count(*) filter (where required),
    count(*) filter (where required and checked)
  into required_total, required_completed
  from public.installation_checklist_items
  where installation_id = target_installation_id;

  update public.installations
  set
    total_items = required_total,
    completed_items = required_completed,
    completion_percent = case
      when required_total <= 0 then 0
      else floor((required_completed::numeric * 100) / required_total)::integer
    end,
    status = case
      when required_total <= 0 or required_completed <= 0 then 'pending'
      when required_completed < required_total then 'in_progress'
      else 'completed'
    end,
    updated_at = timezone('utc', now())
  where id = target_installation_id;
end;
$$;

create or replace function public.installation_sync_summary()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.installation_recalculate_summary(old.installation_id);
    return old;
  end if;

  perform public.installation_recalculate_summary(new.installation_id);

  if tg_op = 'UPDATE' and new.installation_id is distinct from old.installation_id then
    perform public.installation_recalculate_summary(old.installation_id);
  end if;

  return new;
end;
$$;

drop trigger if exists installation_sync_summary_trigger on public.installation_checklist_items;
create trigger installation_sync_summary_trigger
after insert or update or delete on public.installation_checklist_items
for each row execute function public.installation_sync_summary();

create or replace function public.installation_sync_photo_count()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_item_id text;
begin
  target_item_id := case when tg_op = 'DELETE' then old.checklist_item_id else new.checklist_item_id end;

  update public.installation_checklist_items
  set
    photo_count = (
      select count(*)
      from public.installation_checklist_photos
      where checklist_item_id = target_item_id
        and deleted_at is null
    ),
    updated_at = timezone('utc', now())
  where id = target_item_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists installation_sync_photo_count_trigger on public.installation_checklist_photos;
create trigger installation_sync_photo_count_trigger
after insert or update or delete on public.installation_checklist_photos
for each row execute function public.installation_sync_photo_count();

create or replace function public.create_installation_with_checklist(
  p_client_id text,
  p_quote_id text,
  p_installation_date timestamptz,
  p_installer_employee_id text,
  p_notes text,
  p_created_by_uid text,
  p_created_by_name text,
  p_checklist_items jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_installation_id text := public.installation_make_id();
  v_empresa_id text := app_private.current_empresa_id();
  v_quote_client_id text;
  item jsonb;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada para criar a instalacao.';
  end if;

  if jsonb_typeof(coalesce(p_checklist_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_checklist_items) = 0 then
    raise exception 'Checklist padrao obrigatorio nao informado.';
  end if;

  select client_id
  into v_quote_client_id
  from public.quotes
  where id = p_quote_id
    and empresa_id = v_empresa_id;

  if v_quote_client_id is null then
    raise exception 'Projeto relacionado nao encontrado.';
  end if;

  if v_quote_client_id <> p_client_id then
    raise exception 'Cliente e projeto relacionado nao correspondem.';
  end if;

  if p_installer_employee_id is not null and not exists (
    select 1
    from public.employees
    where id = p_installer_employee_id
      and empresa_id = v_empresa_id
  ) then
    raise exception 'Instalador responsavel nao encontrado.';
  end if;

  insert into public.installations (
    id,
    empresa_id,
    client_id,
    quote_id,
    installer_employee_id,
    installation_date,
    notes,
    created_by_uid,
    created_by_name
  )
  values (
    v_installation_id,
    v_empresa_id,
    p_client_id,
    p_quote_id,
    nullif(p_installer_employee_id, ''),
    p_installation_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_created_by_uid, '')), ''),
    nullif(trim(coalesce(p_created_by_name, '')), '')
  );

  for item in select * from jsonb_array_elements(p_checklist_items)
  loop
    insert into public.installation_checklist_items (
      id,
      empresa_id,
      installation_id,
      template_key,
      group_key,
      group_label,
      title,
      sort_order,
      required
    )
    values (
      public.installation_make_id(),
      v_empresa_id,
      v_installation_id,
      coalesce(item->>'templateKey', public.installation_make_id()),
      coalesce(item->>'groupKey', 'general'),
      coalesce(item->>'groupLabel', 'Checklist'),
      coalesce(item->>'title', 'Item'),
      coalesce((item->>'sortOrder')::integer, 0),
      coalesce((item->>'required')::boolean, true)
    );
  end loop;

  insert into public.installation_history (
    id,
    empresa_id,
    installation_id,
    event_type,
    message,
    metadata,
    user_uid,
    user_name
  )
  values (
    public.installation_make_id(),
    v_empresa_id,
    v_installation_id,
    'installation_created',
    coalesce(nullif(trim(p_created_by_name), ''), 'Usuario') || ' criou a instalacao',
    jsonb_build_object('clientId', p_client_id, 'quoteId', p_quote_id),
    nullif(trim(coalesce(p_created_by_uid, '')), ''),
    nullif(trim(coalesce(p_created_by_name, '')), '')
  );

  perform public.installation_recalculate_summary(v_installation_id);

  return v_installation_id;
end;
$$;

create or replace function public.update_installation_checklist_item(
  p_item_id text,
  p_checked boolean,
  p_observation text,
  p_actor_uid text,
  p_actor_name text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_installation_id text;
  v_old_checked boolean;
  v_old_observation text;
  v_title text;
begin
  select installation_id, checked, coalesce(observation, ''), title
  into v_installation_id, v_old_checked, v_old_observation, v_title
  from public.installation_checklist_items
  where id = p_item_id
    and empresa_id = app_private.current_empresa_id();

  if v_installation_id is null then
    raise exception 'Item do checklist nao encontrado.';
  end if;

  update public.installation_checklist_items
  set
    checked = p_checked,
    observation = nullif(trim(coalesce(p_observation, '')), ''),
    checked_at = case when p_checked then timezone('utc', now()) else checked_at end,
    checked_by_uid = case when p_checked then nullif(trim(coalesce(p_actor_uid, '')), '') else checked_by_uid end,
    checked_by_name = case when p_checked then nullif(trim(coalesce(p_actor_name, '')), '') else checked_by_name end,
    unchecked_at = case when not p_checked then timezone('utc', now()) else unchecked_at end,
    unchecked_by_uid = case when not p_checked then nullif(trim(coalesce(p_actor_uid, '')), '') else unchecked_by_uid end,
    unchecked_by_name = case when not p_checked then nullif(trim(coalesce(p_actor_name, '')), '') else unchecked_by_name end
  where id = p_item_id;

  if v_old_checked is distinct from p_checked then
    insert into public.installation_history (
      id, empresa_id, installation_id, checklist_item_id, event_type, message, metadata, user_uid, user_name
    )
    values (
      public.installation_make_id(),
      app_private.current_empresa_id(),
      v_installation_id,
      p_item_id,
      case when p_checked then 'item_checked' else 'item_unchecked' end,
      coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || case when p_checked then ' marcou "' else ' desmarcou "' end || v_title || '"',
      jsonb_build_object('checked', p_checked),
      nullif(trim(coalesce(p_actor_uid, '')), ''),
      nullif(trim(coalesce(p_actor_name, '')), '')
    );
  end if;

  if v_old_observation is distinct from coalesce(trim(p_observation), '') then
    insert into public.installation_history (
      id, empresa_id, installation_id, checklist_item_id, event_type, message, metadata, user_uid, user_name
    )
    values (
      public.installation_make_id(),
      app_private.current_empresa_id(),
      v_installation_id,
      p_item_id,
      'observation_updated',
      coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || ' atualizou a observacao de "' || v_title || '"',
      jsonb_build_object('observation', nullif(trim(coalesce(p_observation, '')), '')),
      nullif(trim(coalesce(p_actor_uid, '')), ''),
      nullif(trim(coalesce(p_actor_name, '')), '')
    );
  end if;

  return v_installation_id;
end;
$$;

create or replace function public.add_installation_checklist_photo_record(
  p_checklist_item_id text,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes integer,
  p_width integer,
  p_height integer,
  p_actor_uid text,
  p_actor_name text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_installation_id text;
  v_title text;
  v_photo_id text := public.installation_make_id();
begin
  select installation_id, title
  into v_installation_id, v_title
  from public.installation_checklist_items
  where id = p_checklist_item_id
    and empresa_id = app_private.current_empresa_id();

  if v_installation_id is null then
    raise exception 'Item do checklist nao encontrado para a foto.';
  end if;

  insert into public.installation_checklist_photos (
    id,
    empresa_id,
    installation_id,
    checklist_item_id,
    bucket_id,
    file_path,
    file_name,
    mime_type,
    size_bytes,
    width,
    height,
    created_by_uid,
    created_by_name
  )
  values (
    v_photo_id,
    app_private.current_empresa_id(),
    v_installation_id,
    p_checklist_item_id,
    'installation-files',
    p_file_path,
    p_file_name,
    p_mime_type,
    p_size_bytes,
    p_width,
    p_height,
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    nullif(trim(coalesce(p_actor_name, '')), '')
  );

  insert into public.installation_history (
    id, empresa_id, installation_id, checklist_item_id, event_type, message, metadata, user_uid, user_name
  )
  values (
    public.installation_make_id(),
    app_private.current_empresa_id(),
    v_installation_id,
    p_checklist_item_id,
    'photo_added',
    coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || ' adicionou foto em "' || v_title || '"',
    jsonb_build_object('fileName', p_file_name),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    nullif(trim(coalesce(p_actor_name, '')), '')
  );

  return v_photo_id;
end;
$$;

create or replace function public.remove_installation_checklist_photo_record(
  p_photo_id text,
  p_actor_uid text,
  p_actor_name text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_installation_id text;
  v_checklist_item_id text;
  v_file_name text;
  v_title text;
begin
  select photo.installation_id, photo.checklist_item_id, photo.file_name, item.title
  into v_installation_id, v_checklist_item_id, v_file_name, v_title
  from public.installation_checklist_photos photo
  join public.installation_checklist_items item on item.id = photo.checklist_item_id
  where photo.id = p_photo_id
    and photo.empresa_id = app_private.current_empresa_id()
    and photo.deleted_at is null;

  if v_installation_id is null then
    raise exception 'Foto nao encontrada.';
  end if;

  update public.installation_checklist_photos
  set
    deleted_at = timezone('utc', now()),
    deleted_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    deleted_by_name = nullif(trim(coalesce(p_actor_name, '')), '')
  where id = p_photo_id;

  insert into public.installation_history (
    id, empresa_id, installation_id, checklist_item_id, event_type, message, metadata, user_uid, user_name
  )
  values (
    public.installation_make_id(),
    app_private.current_empresa_id(),
    v_installation_id,
    v_checklist_item_id,
    'photo_removed',
    coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || ' removeu foto de "' || v_title || '"',
    jsonb_build_object('fileName', v_file_name),
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    nullif(trim(coalesce(p_actor_name, '')), '')
  );

  return v_installation_id;
end;
$$;

create or replace function public.finalize_installation(
  p_installation_id text,
  p_actor_uid text,
  p_actor_name text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_missing_count integer := 0;
begin
  select count(*)
  into v_missing_count
  from public.installation_checklist_items
  where installation_id = p_installation_id
    and empresa_id = app_private.current_empresa_id()
    and required
    and not checked;

  if v_missing_count > 0 then
    raise exception 'Marque todos os itens obrigatorios antes de concluir a instalacao.';
  end if;

  update public.installations
  set
    finalized_at = timezone('utc', now()),
    finalized_by_uid = nullif(trim(coalesce(p_actor_uid, '')), ''),
    finalized_by_name = nullif(trim(coalesce(p_actor_name, '')), '')
  where id = p_installation_id
    and empresa_id = app_private.current_empresa_id();

  insert into public.installation_history (
    id, empresa_id, installation_id, event_type, message, metadata, user_uid, user_name
  )
  values (
    public.installation_make_id(),
    app_private.current_empresa_id(),
    p_installation_id,
    'installation_finalized',
    coalesce(nullif(trim(p_actor_name), ''), 'Usuario') || ' concluiu a instalacao',
    '{}'::jsonb,
    nullif(trim(coalesce(p_actor_uid, '')), ''),
    nullif(trim(coalesce(p_actor_name, '')), '')
  );

  return p_installation_id;
end;
$$;

grant select, insert, update, delete on table public.installations to authenticated;
grant select, insert, update, delete on table public.installation_checklist_items to authenticated;
grant select, insert, update, delete on table public.installation_checklist_photos to authenticated;
grant select, insert, update, delete on table public.installation_history to authenticated;
grant execute on function public.create_installation_with_checklist(text, text, timestamptz, text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_installation_checklist_item(text, boolean, text, text, text) to authenticated;
grant execute on function public.add_installation_checklist_photo_record(text, text, text, text, integer, integer, integer, text, text) to authenticated;
grant execute on function public.remove_installation_checklist_photo_record(text, text, text) to authenticated;
grant execute on function public.finalize_installation(text, text, text) to authenticated;

drop policy if exists "tenant_all_installations" on public.installations;
create policy "tenant_all_installations"
on public.installations
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_all_installation_checklist_items" on public.installation_checklist_items;
create policy "tenant_all_installation_checklist_items"
on public.installation_checklist_items
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_all_installation_checklist_photos" on public.installation_checklist_photos;
create policy "tenant_all_installation_checklist_photos"
on public.installation_checklist_photos
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_all_installation_history" on public.installation_history;
create policy "tenant_all_installation_history"
on public.installation_history
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

insert into storage.buckets (id, name, public)
values ('installation-files', 'installation-files', false)
on conflict (id) do nothing;

drop policy if exists "authenticated_select_installation_files" on storage.objects;
create policy "authenticated_select_installation_files" on storage.objects
for select to authenticated
using (
  bucket_id = 'installation-files'
  and exists (
    select 1
    from public.installation_checklist_photos photo
    where photo.file_path = name
      and photo.bucket_id = bucket_id
      and photo.deleted_at is null
      and photo.empresa_id = app_private.current_empresa_id()
  )
);

drop policy if exists "authenticated_insert_installation_files" on storage.objects;
create policy "authenticated_insert_installation_files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'installation-files'
  and (storage.foldername(name))[1] = 'instalacoes'
  and (storage.foldername(name))[2] is not null
  and (storage.foldername(name))[3] is not null
  and exists (
    select 1
    from public.installation_checklist_items item
    join public.installations installation on installation.id = item.installation_id
    where item.id = (storage.foldername(name))[3]
      and installation.client_id = (storage.foldername(name))[2]
      and item.empresa_id = app_private.current_empresa_id()
      and installation.empresa_id = app_private.current_empresa_id()
      and installation.deleted_at is null
  )
);

drop policy if exists "authenticated_update_installation_files" on storage.objects;
create policy "authenticated_update_installation_files" on storage.objects
for update to authenticated
using (
  bucket_id = 'installation-files'
  and exists (
    select 1
    from public.installation_checklist_photos photo
    where photo.file_path = name
      and photo.bucket_id = bucket_id
      and photo.deleted_at is null
      and photo.empresa_id = app_private.current_empresa_id()
  )
)
with check (
  bucket_id = 'installation-files'
  and (storage.foldername(name))[1] = 'instalacoes'
  and (storage.foldername(name))[2] is not null
  and (storage.foldername(name))[3] is not null
  and exists (
    select 1
    from public.installation_checklist_items item
    join public.installations installation on installation.id = item.installation_id
    where item.id = (storage.foldername(name))[3]
      and installation.client_id = (storage.foldername(name))[2]
      and item.empresa_id = app_private.current_empresa_id()
      and installation.empresa_id = app_private.current_empresa_id()
      and installation.deleted_at is null
  )
);

drop policy if exists "authenticated_delete_installation_files" on storage.objects;
create policy "authenticated_delete_installation_files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'installation-files'
  and exists (
    select 1
    from public.installation_checklist_photos photo
    where photo.file_path = name
      and photo.bucket_id = bucket_id
      and photo.deleted_at is null
      and photo.empresa_id = app_private.current_empresa_id()
  )
);
