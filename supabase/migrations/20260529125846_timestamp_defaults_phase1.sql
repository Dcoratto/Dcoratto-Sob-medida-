-- Phase 1: normalize timestamp defaults for existing operational tables.
-- This backfills null timestamps with the current UTC time and keeps future
-- inserts consistent without changing business data or deleting records.

update public.condominiums set created_at = timezone('utc'::text, now()) where created_at is null;
update public.employees set created_at = timezone('utc'::text, now()) where created_at is null;
update public.fixture_catalog set created_at = timezone('utc'::text, now()) where created_at is null;
update public.quotes set created_at = timezone('utc'::text, now()) where created_at is null;
update public.inventory_reservations set updated_at = timezone('utc'::text, now()) where updated_at is null;

alter table public.condominiums alter column created_at set default timezone('utc'::text, now());
alter table public.employees alter column created_at set default timezone('utc'::text, now());
alter table public.fixture_catalog alter column created_at set default timezone('utc'::text, now());
alter table public.quotes alter column created_at set default timezone('utc'::text, now());
alter table public.inventory_reservations alter column updated_at set default timezone('utc'::text, now());

alter table public.condominiums alter column created_at set not null;
alter table public.employees alter column created_at set not null;
alter table public.fixture_catalog alter column created_at set not null;
alter table public.quotes alter column created_at set not null;
alter table public.inventory_reservations alter column updated_at set not null;
