alter table public.quotes
  add column if not exists payment_mode text,
  add column if not exists total_payment_method text,
  add column if not exists remaining_payment_method text,
  add column if not exists entry_amount numeric(14,2) not null default 0,
  add column if not exists negotiation_discount_percent numeric(8,2) not null default 0,
  add column if not exists rt_percent numeric(8,2) not null default 0;
