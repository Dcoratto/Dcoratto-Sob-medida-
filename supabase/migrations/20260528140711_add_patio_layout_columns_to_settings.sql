alter table public.settings
  add column if not exists patio_layout jsonb not null default '{}'::jsonb,
  add column if not exists patio_size jsonb not null default '{"width":100,"height":100}'::jsonb;
