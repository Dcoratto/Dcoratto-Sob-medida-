alter table public.quotes
  add column if not exists pricing_mode text not null default 'sale',
  add column if not exists material_price_overrides jsonb not null default '[]'::jsonb,
  add column if not exists payment_mode text,
  add column if not exists total_payment_method text,
  add column if not exists remaining_payment_method text,
  add column if not exists entry_amount numeric(14,2) not null default 0,
  add column if not exists negotiation_discount_percent numeric(8,2) not null default 0,
  add column if not exists rt_percent numeric(8,2) not null default 0;

alter table public.inventory
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text,
  add column if not exists loss_piece_id text,
  add column if not exists loss_piece_name text;

alter table public.inventory_purchases
  add column if not exists thumbnail_url text,
  add column if not exists medium_url text,
  add column if not exists original_url text;

update public.inventory
set original_url = coalesce(original_url, photo_url),
    medium_url = coalesce(medium_url, photo_url),
    thumbnail_url = coalesce(thumbnail_url, photo_url)
where photo_url is not null;

update public.inventory_purchases
set original_url = coalesce(original_url, photo_url),
    medium_url = coalesce(medium_url, photo_url),
    thumbnail_url = coalesce(thumbnail_url, photo_url)
where photo_url is not null;
