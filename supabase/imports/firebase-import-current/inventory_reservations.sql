insert into public.inventory_reservations (id, quote_id, material_id, material_variant_key, material_line, material_type, thickness_label, texture, provider, material_name, area, quote_status, client_name, created_at, updated_at)
values
  ('aF3kj7uXGGKgcODwF0Ry_preto-absoluto|lamina ultracompacta|chapa||polido|laminatto', 'aF3kj7uXGGKgcODwF0Ry', 'preto-absoluto', 'preto-absoluto|lamina ultracompacta|chapa||polido|laminatto', 'Lamina Ultracompacta', 'Chapa', null, 'Polido', 'Laminatto', 'preto-absoluto', 2.591999999999999, 'Orçamento', 'Aline Armond', timezone('utc', now()), '2026-05-19T12:27:32.114Z'::timestamptz)
on conflict (id) do update set
  quote_id = excluded.quote_id,
  material_id = excluded.material_id,
  material_variant_key = excluded.material_variant_key,
  material_line = excluded.material_line,
  material_type = excluded.material_type,
  thickness_label = excluded.thickness_label,
  texture = excluded.texture,
  provider = excluded.provider,
  material_name = excluded.material_name,
  area = excluded.area,
  quote_status = excluded.quote_status,
  client_name = excluded.client_name,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
