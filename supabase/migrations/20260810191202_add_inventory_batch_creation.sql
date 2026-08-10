create or replace function public.create_inventory_slabs_batch(p_items jsonb)
returns table (
  id text,
  code text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_count integer := coalesce(jsonb_array_length(coalesce(p_items, '[]'::jsonb)), 0);
begin
  if auth.uid() is null then
    raise exception 'Usuário autenticado é obrigatório.';
  end if;

  if v_empresa_id is null then
    raise exception 'Empresa atual não identificada.';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Carga inválida para cadastro de chapas.';
  end if;

  if v_count < 1 or v_count > 50 then
    raise exception 'Quantidade de chapas inválida.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    where btrim(coalesce(item->>'id', '')) = ''
      or btrim(coalesce(item->>'material_id', '')) = ''
      or btrim(coalesce(item->>'material_name', '')) = ''
      or btrim(coalesce(item->>'code', '')) = ''
      or coalesce((item->>'length')::numeric, 0) <= 0
      or coalesce((item->>'width')::numeric, 0) <= 0
      or coalesce((item->>'thickness')::numeric, 0) <= 0
      or coalesce((item->>'area')::numeric, 0) <= 0
      or coalesce((item->>'cost')::numeric, 0) <= 0
      or coalesce((item->>'minimum_sale_price')::numeric, 0) <= 0
      or btrim(coalesce(item->>'status', '')) not in ('Disponível', 'Reservada', 'Usada', 'Retalho', 'Descarte')
  ) then
    raise exception 'Os dados informados para as chapas são inválidos.';
  end if;

  if exists (
    select 1
    from (
      select
        lower(btrim(item->>'material_id')) as material_id,
        lower(btrim(item->>'code')) as code,
        count(*) as total
      from jsonb_array_elements(p_items) as item
      group by 1, 2
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Há códigos ou lotes duplicados na mesma operação.';
  end if;

  if exists (
    with payload as (
      select
        lower(btrim(item->>'material_id')) as material_id,
        lower(btrim(item->>'code')) as code
      from jsonb_array_elements(p_items) as item
    )
    select 1
    from payload
    join public.inventory inventory_item
      on inventory_item.empresa_id = v_empresa_id
     and lower(btrim(inventory_item.material_id)) = payload.material_id
     and lower(btrim(inventory_item.code)) = payload.code
  ) then
    raise exception 'Já existe uma chapa desta pedra com o mesmo lote.';
  end if;

  return query
  with payload as (
    select
      btrim(item->>'id') as id,
      v_empresa_id as empresa_id,
      btrim(item->>'material_id') as material_id,
      btrim(item->>'material_name') as material_name,
      btrim(item->>'code') as code,
      coalesce(btrim(item->>'provider'), '') as provider,
      nullif(btrim(item->>'rack_id'), '') as rack_id,
      nullif(btrim(item->>'category'), '') as category,
      nullif(btrim(item->>'material_line'), '') as material_line,
      nullif(btrim(item->>'material_type'), '') as material_type,
      nullif(btrim(item->>'thickness_label'), '') as thickness_label,
      nullif(btrim(item->>'texture'), '') as texture,
      (item->>'length')::numeric(12,2) as length,
      (item->>'width')::numeric(12,2) as width,
      (item->>'thickness')::numeric(12,2) as thickness,
      (item->>'area')::numeric(14,4) as area,
      (item->>'cost')::numeric(14,2) as cost,
      (item->>'minimum_sale_price')::numeric(14,2) as minimum_sale_price,
      btrim(item->>'status') as status,
      coalesce(item->>'notes', '') as notes,
      nullif(btrim(item->>'photo_url'), '') as photo_url,
      nullif(btrim(item->>'original_url'), '') as original_url
    from jsonb_array_elements(p_items) as item
  ), inserted as (
    insert into public.inventory (
      id,
      empresa_id,
      material_id,
      material_name,
      code,
      provider,
      rack_id,
      category,
      material_line,
      material_type,
      thickness_label,
      texture,
      length,
      width,
      thickness,
      area,
      cost,
      minimum_sale_price,
      status,
      notes,
      photo_url,
      original_url
    )
    select
      payload.id,
      payload.empresa_id,
      payload.material_id,
      payload.material_name,
      payload.code,
      payload.provider,
      payload.rack_id,
      payload.category,
      payload.material_line,
      payload.material_type,
      payload.thickness_label,
      payload.texture,
      payload.length,
      payload.width,
      payload.thickness,
      payload.area,
      payload.cost,
      payload.minimum_sale_price,
      payload.status,
      payload.notes,
      payload.photo_url,
      payload.original_url
    from payload
    returning inventory.id, inventory.code
  )
  select inserted.id, inserted.code
  from inserted;
end;
$$;

grant execute on function public.create_inventory_slabs_batch(jsonb) to authenticated;
