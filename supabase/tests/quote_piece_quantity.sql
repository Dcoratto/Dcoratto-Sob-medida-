-- Read-only regression checks. Does not create or edit customer records.
do $$
declare
  v_case jsonb;
  v_quote public.quotes;
  v_snapshot jsonb;
begin
  if not app_private.valid_quote_piece_quantities('[{"id":"legacy"}]') then
    raise exception 'Legacy pieces must remain valid.';
  end if;
  for v_case in select value from jsonb_array_elements('[0,-1,1.5,1001,"3",null,"NaN","Infinity"]'::jsonb) loop
    if app_private.valid_quote_piece_quantities(jsonb_build_array(jsonb_build_object('quantity', v_case))) then
      raise exception 'Invalid quantity accepted: %', v_case;
    end if;
  end loop;
  if not app_private.valid_quote_piece_quantities('[{"quantity":1},{"quantity":3},{"quantity":1000}]') then
    raise exception 'Valid quantities rejected.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_piece_quantity_check' and convalidated) then
    raise exception 'Quantity constraint must be installed and validated.';
  end if;
  v_quote := jsonb_populate_record(null::public.quotes, '{"id":"quantity-regression","total_price":1260,"total_area":0.993,"pieces":[{"id":"a","name":"Soleira","quantity":3,"presentationArea":0.993,"presentationValue":1260}]}'::jsonb);
  v_snapshot := app_private.build_quote_presentation_snapshot(v_quote, null::public.clients, null::public.materials, null::public.settings, 1);
  if jsonb_array_length(v_snapshot -> 'pieces') <> 1
    or (v_snapshot #>> '{pieces,0,quantity}')::integer <> 3
    or (v_snapshot #>> '{pieces,0,unitArea}')::numeric <> 0.331
    or (v_snapshot #>> '{pieces,0,unitValue}')::numeric <> 420
    or (v_snapshot #>> '{pieces,0,value}')::numeric <> 1260
    or (v_snapshot #>> '{investment,totalPrice}')::numeric <> 1260
    or (v_snapshot #>> '{summary,unitCount}')::integer <> 3 then
    raise exception 'Snapshot quantities or totals are inconsistent.';
  end if;
  v_quote.pieces := '[{"id":"a","presentationArea":0.331,"presentationValue":420}]'::jsonb;
  v_quote.total_price := 420;
  v_quote.total_area := 0.331;
  v_snapshot := app_private.build_quote_presentation_snapshot(v_quote, null::public.clients, null::public.materials, null::public.settings, 1);
  if (v_snapshot #>> '{pieces,0,quantity}')::integer <> 1 or (v_snapshot #>> '{pieces,0,value}')::numeric <> 420 then
    raise exception 'Legacy snapshot compatibility failed.';
  end if;
end;
$$;
select 'quote_piece_quantity: passed' as result;
