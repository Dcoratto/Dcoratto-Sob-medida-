-- Phase 1: add non-breaking image variant fields.
-- Legacy columns stay in place for compatibility; new list views can use
-- thumbnails while detail screens can use medium/original assets.

alter table public.materials
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text;

alter table public.fixture_catalog
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text;

alter table public.inventory
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text;

alter table public.inventory_purchases
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text;

alter table public.profiles
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text;

alter table public.settings
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text;

update public.materials
set original_url = coalesce(original_url, image_url),
    medium_url = coalesce(medium_url, image_url),
    thumbnail_url = coalesce(thumbnail_url, image_url)
where image_url is not null and image_url <> '';

update public.fixture_catalog
set original_url = coalesce(original_url, image_url),
    medium_url = coalesce(medium_url, image_url),
    thumbnail_url = coalesce(thumbnail_url, image_url)
where image_url is not null and image_url <> '';

update public.inventory
set original_url = coalesce(original_url, photo_url),
    medium_url = coalesce(medium_url, photo_url),
    thumbnail_url = coalesce(thumbnail_url, photo_url)
where photo_url is not null and photo_url <> '';

update public.inventory_purchases
set original_url = coalesce(original_url, photo_url),
    medium_url = coalesce(medium_url, photo_url),
    thumbnail_url = coalesce(thumbnail_url, photo_url)
where photo_url is not null and photo_url <> '';

update public.profiles
set original_url = coalesce(original_url, photo_url),
    medium_url = coalesce(medium_url, photo_url),
    thumbnail_url = coalesce(thumbnail_url, photo_url)
where photo_url is not null and photo_url <> '';

update public.settings
set original_url = coalesce(original_url, logo_url),
    medium_url = coalesce(medium_url, logo_url),
    thumbnail_url = coalesce(thumbnail_url, logo_url)
where logo_url is not null and logo_url <> '';
