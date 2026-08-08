alter table public.quotes
  add column if not exists include_material_loss boolean,
  add column if not exists include_cutouts boolean not null default true,
  add column if not exists include_sculpted_sink boolean not null default true,
  add column if not exists include_labor boolean not null default true,
  add column if not exists include_delivery boolean not null default true,
  add column if not exists include_complexity boolean not null default true;

update public.quotes
set include_material_loss = case
  when pricing_mode = 'cost' then false
  else true
end
where include_material_loss is null;

alter table public.quotes
  alter column include_material_loss set default true,
  alter column include_material_loss set not null;
