alter table public.quotes
  add column if not exists material_price_overrides jsonb not null default '[]'::jsonb;
