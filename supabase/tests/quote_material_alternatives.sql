-- Read-only smoke checks, safe to run after the additive migration.
do $$
declare v_quote public.quotes; v_old jsonb; v_wrapped jsonb;
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.quotes'::regclass
    and attname = 'material_alternatives' and atttypid = 'jsonb'::regtype and not attisdropped) then
    raise exception 'Alternative configuration column missing.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.quotes'::regclass) then
    raise exception 'Alternatives must inherit quotes RLS.';
  end if;
  if has_function_privilege('anon', 'app_private.material_simulation_total(jsonb,numeric)', 'EXECUTE')
    or has_function_privilege('anon', 'app_private.accept_quote_presentation_alternatives_base(text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'app_private.accept_quote_presentation_alternatives_base(text,text)', 'EXECUTE') then
    raise exception 'Private helpers must not be public RPCs.';
  end if;
  if not has_function_privilege('anon', 'public.accept_quote_presentation_materials(text,text,uuid,jsonb,numeric)', 'EXECUTE') then
    raise exception 'Validated public confirmation RPC missing.';
  end if;
  if app_private.material_variant_part('  ITAÚNAS Ç É Ö  ') <> 'itaunas c e o' then
    raise exception 'Variant normalization differs from the frontend.';
  end if;
  v_quote := jsonb_populate_record(null::public.quotes, '{"id":"legacy-alternative-smoke","total_price":1000,"pieces":[]}'::jsonb);
  v_old := app_private.build_quote_presentation_snapshot_alternatives_base(v_quote, null::public.clients, null::public.materials, null::public.settings, 1);
  v_wrapped := app_private.build_quote_presentation_snapshot(v_quote, null::public.clients, null::public.materials, null::public.settings, 1);
  if v_old is distinct from v_wrapped then raise exception 'Legacy snapshots must remain identical.'; end if;
end;
$$;
select 'quote_material_alternatives: passed' as result;
