-- Add a group-integrity guard to the existing acceptance RPC. No payment calculations,
-- quote data, published snapshots, RLS policies or existing acceptance records change.
create or replace function app_private.validate_material_group_selection(p_snapshot jsonb, p_selections jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_material text; v_piece jsonb; v_option jsonb; v_target text; v_variant text;
  v_first boolean; v_quantity numeric;
begin
  if jsonb_typeof(p_selections) is distinct from 'object' or octet_length(p_selections::text) > 131072 then
    raise exception 'Seleção inválida.';
  end if;
  for v_material in
    select distinct p ->> 'materialId' from jsonb_array_elements(p_snapshot -> 'pieces') p
    where p_selections ? (p ->> 'id')
  loop
    if coalesce(v_material, '') = '' then raise exception 'Grupo original inválido.'; end if;
    v_first := true;
    for v_piece in select p from jsonb_array_elements(p_snapshot -> 'pieces') p where p ->> 'materialId' = v_material loop
      select o into v_option from jsonb_array_elements(p_snapshot #> '{materialAlternatives,options}') o
        where o ->> 'id' = p_selections ->> (v_piece ->> 'id');
      if v_option is null or v_option ->> 'principalMaterialId' is distinct from v_material
        or coalesce(v_option ->> 'reviewReason', '') <> ''
        or not (v_option -> 'pieceIds' ? (v_piece ->> 'id'))
        or jsonb_typeof(v_option #> array['pieceDeltas', v_piece ->> 'id']) is distinct from 'number'
        or coalesce(v_option ->> 'materialId', '') in ('', v_material) then
        raise exception 'Troca parcial não permitida. Peça ao vendedor para ajustar as alternativas do grupo inteiro.';
      end if;
      v_quantity := coalesce((v_piece ->> 'quantity')::numeric, 1);
      if v_quantity < 1 or v_quantity > 1000 or v_quantity <> trunc(v_quantity) then raise exception 'Quantidade inválida.'; end if;
      if not v_first and (v_target is distinct from v_option ->> 'materialId'
        or v_variant is distinct from coalesce(v_option ->> 'materialVariantKey', '')) then
        raise exception 'Todos os registros do grupo devem usar o mesmo material alternativo e acabamento.';
      end if;
      v_target := v_option ->> 'materialId';
      v_variant := coalesce(v_option ->> 'materialVariantKey', '');
      v_first := false;
    end loop;
  end loop;
end;
$$;
revoke all on function app_private.validate_material_group_selection(jsonb,jsonb) from public, anon, authenticated;

-- Preserve the installed RPC body and lock order; insert only this validation after
-- its per-piece authorization and before the existing total/acceptance logic.
do $$
declare v_definition text; v_anchor text := '  v_total := (v_version.snapshot';
begin
  v_definition := pg_get_functiondef('public.accept_quote_presentation_materials(text,text,uuid,jsonb,numeric)'::regprocedure);
  if position('app_private.validate_material_group_selection' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then raise exception 'Acceptance dependency differs; review before applying.'; end if;
    v_definition := replace(v_definition, v_anchor,
      E'  -- Keep identical retries of previously accepted legacy partial choices valid.\n'
      || E'  if not exists (select 1 from public.quote_presentation_acceptances where version_id = v_version.id\n'
      || E'    and accepted_snapshot #> ''{materialSelection,selections}'' = p_selections) then\n'
      || E'    perform app_private.validate_material_group_selection(v_version.snapshot, p_selections);\n'
      || E'  end if;\n' || v_anchor);
    execute v_definition;
  end if;
end;
$$;
