alter table public.quotes
  add column if not exists premium_presentation jsonb,
  add column if not exists premium_presentation_token text,
  add column if not exists premium_presentation_shared_at timestamptz,
  add column if not exists premium_presentation_shared_by_uid text,
  add column if not exists premium_presentation_shared_by_name text;

