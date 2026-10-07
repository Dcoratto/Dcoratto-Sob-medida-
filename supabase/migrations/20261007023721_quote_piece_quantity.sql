create or replace function app_private.valid_quote_piece_quantities(p_pieces jsonb)
returns boolean
language plpgsql immutable security invoker
set search_path = ''
as $$
declare v_piece jsonb; v_quantity numeric;
begin
  if p_pieces is null then return true; end if;
  if jsonb_typeof(p_pieces) <> 'array' then return false; end if;
  for v_piece in select value from jsonb_array_elements(p_pieces) loop
    if not (v_piece ? 'quantity') then continue; end if;
    if jsonb_typeof(v_piece -> 'quantity') <> 'number' then return false; end if;
    v_quantity := (v_piece ->> 'quantity')::numeric;
    if v_quantity < 1 or v_quantity > 1000 or v_quantity <> trunc(v_quantity) then return false; end if;
  end loop;
  return true;
end;
$$;

revoke all on function app_private.valid_quote_piece_quantities(jsonb) from public, anon;
grant execute on function app_private.valid_quote_piece_quantities(jsonb) to authenticated, service_role;

alter table public.quotes add constraint quotes_piece_quantity_check
  check (app_private.valid_quote_piece_quantities(pieces)) not valid;
alter table public.quotes validate constraint quotes_piece_quantity_check;

-- Keep the installed snapshot builder intact, including allocation and payment rules.
do $$
begin
  if to_regprocedure('app_private.build_quote_presentation_snapshot_quantity_base(public.quotes,public.clients,public.materials,public.settings,integer)') is null then
    execute replace(
      pg_get_functiondef('app_private.build_quote_presentation_snapshot(public.quotes,public.clients,public.materials,public.settings,integer)'::regprocedure),
      'FUNCTION app_private.build_quote_presentation_snapshot(',
      'FUNCTION app_private.build_quote_presentation_snapshot_quantity_base('
    );
  end if;
end;
$$;
revoke all on function app_private.build_quote_presentation_snapshot_quantity_base(public.quotes,public.clients,public.materials,public.settings,integer) from public, anon, authenticated;

create or replace function app_private.build_quote_presentation_snapshot(
  p_quote public.quotes, p_client public.clients, p_material public.materials,
  p_settings public.settings, p_version_number integer
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare v_snapshot jsonb; v_pieces jsonb; v_units integer;
begin
  if not app_private.valid_quote_piece_quantities(p_quote.pieces) then
    raise exception 'Quantidade das peças deve ser inteira entre 1 e 1000.' using errcode = '22023';
  end if;
  v_snapshot := app_private.build_quote_presentation_snapshot_quantity_base(p_quote, p_client, p_material, p_settings, p_version_number);
  -- The stored presentation area/value already represent the whole record. Never multiply them again.
  select coalesce(jsonb_agg(
    s.item || jsonb_strip_nulls(jsonb_build_object(
      'quantity', q.quantity,
      'unitArea', (s.item ->> 'area')::numeric / q.quantity,
      'unitValue', (s.item ->> 'value')::numeric / q.quantity
    )) order by s.ordinality
  ), '[]'::jsonb), coalesce(sum(q.quantity), 0)
  into v_pieces, v_units
  from jsonb_array_elements(coalesce(v_snapshot -> 'pieces', '[]'::jsonb)) with ordinality as s(item, ordinality)
  cross join lateral (select coalesce((p_quote.pieces -> (s.ordinality::integer - 1) ->> 'quantity')::numeric::integer, 1) as quantity) q;
  v_snapshot := jsonb_set(v_snapshot, '{pieces}', v_pieces);
  return jsonb_set(v_snapshot, '{summary,unitCount}', to_jsonb(v_units));
end;
$$;
