alter table public.quotes
  add column if not exists include_material_loss boolean;
