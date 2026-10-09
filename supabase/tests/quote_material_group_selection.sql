-- Read-only regression: fixtures remain in memory; no proposal/quote rows are written.
do $$
declare v_snapshot jsonb; v_bad jsonb;
begin
  if has_function_privilege('anon', 'app_private.validate_material_group_selection(jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'app_private.validate_material_group_selection(jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Group validator must remain private.';
  end if;
  v_snapshot := '{"pieces":[{"id":"a","materialId":"main","quantity":3},{"id":"b","materialId":"main","quantity":1},{"id":"c","materialId":"second","quantity":2}],
    "materialAlternatives":{"options":[
      {"id":"one","principalMaterialId":"main","materialId":"green","materialVariantKey":"green|polido","pieceIds":["a","b"],"pieceDeltas":{"a":-300,"b":-100}},
      {"id":"two","principalMaterialId":"second","materialId":"white","pieceIds":["c"],"pieceDeltas":{"c":50}},
      {"id":"other","principalMaterialId":"main","materialId":"white","pieceIds":["a","b"],"pieceDeltas":{"a":20,"b":10}}
    ]}}'::jsonb;
  perform app_private.validate_material_group_selection(v_snapshot, '{}');
  perform app_private.validate_material_group_selection(v_snapshot, '{"a":"one","b":"one","c":"two"}');
  begin
    perform app_private.validate_material_group_selection(v_snapshot, '{"a":"one"}');
    raise exception 'Test failed: partial selection accepted';
  exception when others then if sqlerrm not like 'Troca parcial%' then raise; end if; end;
  begin
    perform app_private.validate_material_group_selection(v_snapshot, '{"a":"one","b":"other"}');
    raise exception 'Test failed: mixed materials accepted';
  exception when others then if sqlerrm not like 'Todos os registros%' then raise; end if; end;
  v_bad := jsonb_set(v_snapshot, '{pieces,0,quantity}', '1.5');
  begin
    perform app_private.validate_material_group_selection(v_bad, '{"a":"one","b":"one"}');
    raise exception 'Test failed: invalid quantity accepted';
  exception when others then if sqlerrm not like 'Quantidade inválida%' then raise; end if; end;
  v_bad := jsonb_set(v_snapshot, '{materialAlternatives,options,0,pieceIds}', '["a"]');
  begin
    perform app_private.validate_material_group_selection(v_bad, '{"a":"one","b":"one"}');
    raise exception 'Test failed: unauthorized full-group application accepted';
  exception when others then if sqlerrm not like 'Troca parcial%' then raise; end if; end;
end;
$$;
select 'quote_material_group_selection: passed' as result;
