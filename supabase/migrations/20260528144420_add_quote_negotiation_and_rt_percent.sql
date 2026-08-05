alter table public.quotes
  add column if not exists negotiation_discount_percent numeric(8,2) not null default 0,
  add column if not exists rt_percent numeric(8,2) not null default 0;
