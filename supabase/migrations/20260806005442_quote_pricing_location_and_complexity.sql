alter table public.settings
  add column if not exists labor_pricing jsonb not null default '{}'::jsonb,
  add column if not exists delivery_pricing jsonb not null default '{}'::jsonb,
  add column if not exists quote_complexity_options jsonb not null default '[]'::jsonb;

alter table public.quotes
  add column if not exists client_email text,
  add column if not exists client_cpf text,
  add column if not exists neighborhood text,
  add column if not exists installment_count integer not null default 1,
  add column if not exists installment_amount numeric(14,2) not null default 0,
  add column if not exists payment_notes text not null default '',
  add column if not exists commission_percent numeric(8,2) not null default 0,
  add column if not exists labor_charge numeric(14,2) not null default 0,
  add column if not exists delivery_fee numeric(14,2) not null default 0,
  add column if not exists complexity_key text,
  add column if not exists complexity_label text,
  add column if not exists complexity_percent numeric(8,2) not null default 0;
