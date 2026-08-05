create table if not exists public.crisis_clients (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  client_id text not null references public.clients(id) on update cascade on delete restrict,
  task_count integer not null default 0,
  completed_task_count integer not null default 0,
  completion_percent integer not null default 0,
  visual_status text not null default 'pending' check (visual_status in ('pending', 'in_progress', 'completed', 'empty')),
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by_uid text,
  deleted_by_name text
);

create table if not exists public.crisis_tasks (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  crisis_client_id text not null references public.crisis_clients(id) on update cascade on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  sort_order integer not null default 0,
  created_by_uid text,
  created_by_name text,
  completed_at timestamptz,
  completed_by_uid text,
  completed_by_name text,
  reopened_at timestamptz,
  reopened_by_uid text,
  reopened_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by_uid text,
  deleted_by_name text
);

create table if not exists public.crisis_task_photos (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  crisis_task_id text not null references public.crisis_tasks(id) on update cascade on delete restrict,
  bucket_id text not null default 'crisis-files' check (bucket_id = 'crisis-files'),
  file_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  width integer,
  height integer,
  capture_kind text check (capture_kind in ('before', 'after', 'evidence')),
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by_uid text,
  deleted_by_name text
);

create table if not exists public.crisis_history (
  id text primary key,
  empresa_id text not null default 'dcoratto-main' references public.empresas(id) on update cascade,
  crisis_client_id text not null references public.crisis_clients(id) on update cascade on delete restrict,
  crisis_task_id text references public.crisis_tasks(id) on update cascade on delete restrict,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  user_uid text,
  user_name text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_crisis_clients_active_client
on public.crisis_clients(empresa_id, client_id)
where deleted_at is null;

create index if not exists idx_crisis_clients_empresa_status
on public.crisis_clients(empresa_id, visual_status, updated_at desc);

create index if not exists idx_crisis_tasks_client_status
on public.crisis_tasks(empresa_id, crisis_client_id, status, sort_order, created_at desc);

create index if not exists idx_crisis_task_photos_task_created
on public.crisis_task_photos(empresa_id, crisis_task_id, created_at desc);

create index if not exists idx_crisis_history_client_created
on public.crisis_history(empresa_id, crisis_client_id, created_at desc);

create index if not exists idx_crisis_history_task_created
on public.crisis_history(empresa_id, crisis_task_id, created_at desc);

alter table public.crisis_clients enable row level security;
alter table public.crisis_tasks enable row level security;
alter table public.crisis_task_photos enable row level security;
alter table public.crisis_history enable row level security;

drop trigger if exists set_updated_at_crisis_clients on public.crisis_clients;
create trigger set_updated_at_crisis_clients
before update on public.crisis_clients
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_crisis_tasks on public.crisis_tasks;
create trigger set_updated_at_crisis_tasks
before update on public.crisis_tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_crisis_task_photos on public.crisis_task_photos;
create trigger set_updated_at_crisis_task_photos
before update on public.crisis_task_photos
for each row execute function public.set_updated_at();

create or replace function public.crisis_recalculate_client_summary(target_case_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  total_tasks integer := 0;
  completed_tasks integer := 0;
begin
  if target_case_id is null then
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (where status = 'completed')::integer
  into total_tasks, completed_tasks
  from public.crisis_tasks
  where crisis_client_id = target_case_id
    and deleted_at is null;

  update public.crisis_clients
  set
    task_count = total_tasks,
    completed_task_count = completed_tasks,
    completion_percent = case
      when total_tasks <= 0 then 0
      else floor((completed_tasks::numeric * 100) / total_tasks)::integer
    end,
    visual_status = case
      when total_tasks <= 0 then 'empty'
      when completed_tasks = total_tasks then 'completed'
      when completed_tasks > 0 then 'in_progress'
      else 'pending'
    end,
    updated_at = timezone('utc', now())
  where id = target_case_id;
end;
$$;

create or replace function public.crisis_sync_case_summary()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.crisis_recalculate_client_summary(old.crisis_client_id);
    return old;
  end if;

  perform public.crisis_recalculate_client_summary(new.crisis_client_id);

  if tg_op = 'UPDATE' and new.crisis_client_id is distinct from old.crisis_client_id then
    perform public.crisis_recalculate_client_summary(old.crisis_client_id);
  end if;

  return new;
end;
$$;

drop trigger if exists crisis_sync_case_summary_trigger on public.crisis_tasks;
create trigger crisis_sync_case_summary_trigger
after insert or update or delete on public.crisis_tasks
for each row execute function public.crisis_sync_case_summary();

create or replace function public.crisis_require_photo_for_completion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_photo_count integer := 0;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    select count(*)::integer
    into active_photo_count
    from public.crisis_task_photos
    where crisis_task_id = new.id
      and deleted_at is null;

    if active_photo_count <= 0 then
      raise exception 'Nao e possivel concluir uma pendencia sem foto de evidencia.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists crisis_require_photo_for_completion_trigger on public.crisis_tasks;
create trigger crisis_require_photo_for_completion_trigger
before insert or update on public.crisis_tasks
for each row execute function public.crisis_require_photo_for_completion();

create or replace function public.crisis_prevent_removing_last_photo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  still_active_count integer := 0;
  task_status text := 'pending';
begin
  select status
  into task_status
  from public.crisis_tasks
  where id = case when tg_op = 'DELETE' then old.crisis_task_id else new.crisis_task_id end;

  if task_status <> 'completed' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' or new.deleted_at is not null then
    select count(*)::integer
    into still_active_count
    from public.crisis_task_photos
    where crisis_task_id = old.crisis_task_id
      and deleted_at is null
      and id <> old.id;

    if still_active_count <= 0 then
      raise exception 'Uma pendencia concluida precisa manter ao menos uma foto de evidencia.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists crisis_prevent_removing_last_photo_trigger on public.crisis_task_photos;
create trigger crisis_prevent_removing_last_photo_trigger
before update or delete on public.crisis_task_photos
for each row execute function public.crisis_prevent_removing_last_photo();

grant select, insert, update, delete on table public.crisis_clients to authenticated;
grant select, insert, update, delete on table public.crisis_tasks to authenticated;
grant select, insert, update, delete on table public.crisis_task_photos to authenticated;
grant select, insert, update, delete on table public.crisis_history to authenticated;

drop policy if exists "tenant_all_crisis_clients" on public.crisis_clients;
create policy "tenant_all_crisis_clients"
on public.crisis_clients
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_all_crisis_tasks" on public.crisis_tasks;
create policy "tenant_all_crisis_tasks"
on public.crisis_tasks
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_all_crisis_task_photos" on public.crisis_task_photos;
create policy "tenant_all_crisis_task_photos"
on public.crisis_task_photos
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists "tenant_all_crisis_history" on public.crisis_history;
create policy "tenant_all_crisis_history"
on public.crisis_history
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

insert into storage.buckets (id, name, public)
values ('crisis-files', 'crisis-files', false)
on conflict (id) do nothing;

drop policy if exists "authenticated_select_crisis_files" on storage.objects;
create policy "authenticated_select_crisis_files" on storage.objects
for select to authenticated
using (bucket_id = 'crisis-files');

drop policy if exists "authenticated_insert_crisis_files" on storage.objects;
create policy "authenticated_insert_crisis_files" on storage.objects
for insert to authenticated
with check (bucket_id = 'crisis-files');

drop policy if exists "authenticated_update_crisis_files" on storage.objects;
create policy "authenticated_update_crisis_files" on storage.objects
for update to authenticated
using (bucket_id = 'crisis-files')
with check (bucket_id = 'crisis-files');

drop policy if exists "authenticated_delete_crisis_files" on storage.objects;
create policy "authenticated_delete_crisis_files" on storage.objects
for delete to authenticated
using (bucket_id = 'crisis-files');
