-- Additive: configurations inherit quotes RLS; public callers can submit only option IDs.
alter table public.quotes add column if not exists material_alternatives jsonb;

-- Mirror the cents arithmetic of calculateQuotePaymentTotals without changing any payment rule.
-- This private evaluator is used only to verify frozen material simulations.
create or replace function app_private.material_simulation_total(p_config jsonb, p_delta numeric)
returns numeric language plpgsql immutable security invoker set search_path = '' as $$
declare
  v_input jsonb := p_config -> 'totalsInput';
  -- Preserve JavaScript's IEEE-754 operation order before converting to integer cents.
  v_subtotal double precision := greatest(0::double precision, floor(((p_config ->> 'subtotalBeforeAdjustment')::double precision
    + p_delta::double precision * (1::double precision + (p_config ->> 'legacyComplexityPercent')::double precision / 100::double precision)) * 100::double precision + 0.5::double precision));
  v_entry double precision; v_base double precision; v_adjusted double precision;
begin
  v_entry := least(v_subtotal, greatest(0::double precision, floor((v_input ->> 'entryAmount')::double precision * 100::double precision + 0.5::double precision)));
  v_base := case when v_input ->> 'paymentMode' = 'entry' then v_subtotal - v_entry else v_subtotal end;
  v_adjusted := v_subtotal + floor(v_base * ((v_input ->> 'selectedAdjustment')::double precision / 100::double precision) + 0.5::double precision);
  return (v_adjusted
    + floor(v_adjusted * (greatest(0::double precision, (v_input ->> 'commissionPercent')::double precision) / 100::double precision) + 0.5::double precision)
    - floor(v_adjusted * (greatest(0::double precision, (v_input ->> 'negotiationDiscountPercent')::double precision) / 100::double precision) + 0.5::double precision)
    + floor(v_adjusted * (greatest(0::double precision, (v_input ->> 'rtPercent')::double precision) / 100::double precision) + 0.5::double precision))::numeric / 100;
end;
$$;

create or replace function app_private.material_variant_part(p_value text)
returns text language sql immutable security invoker set search_path = '' as $$
  select regexp_replace(lower(normalize(btrim(coalesce(p_value, '')), NFD)), U&'[\0300-\036f]', '', 'g');
$$;

create or replace function app_private.validate_quote_material_alternatives(p_quote public.quotes)
returns void language plpgsql stable security invoker set search_path = '' as $$
declare
  v_config jsonb := p_quote.material_alternatives;
  v_option jsonb; v_piece jsonb; v_id text; v_key text; v_ids text[] := '{}'; v_keys text[] := '{}';
  v_catalog jsonb; v_stock jsonb; v_material jsonb; v_principal jsonb; v_min numeric; v_value numeric; v_field text;
begin
  if v_config is null then return; end if;
  if jsonb_typeof(v_config) is distinct from 'object' or octet_length(v_config::text) > 1048576
    or (v_config ->> 'ruleVersion') is distinct from '1' or jsonb_typeof(v_config -> 'options') is distinct from 'array'
    or jsonb_array_length(v_config -> 'options') > 100 then
    raise exception 'Configuração de alternativas inválida ou acima do limite.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_config -> 'options') = 0 then return; end if;
  if jsonb_array_length(p_quote.pieces) > 1000 then raise exception 'Limite de 1000 registros para alternativas.'; end if;
  if (select count(distinct p ->> 'id') from jsonb_array_elements(p_quote.pieces) p) <> jsonb_array_length(p_quote.pieces) then raise exception 'As peças precisam de IDs únicos.'; end if;
  foreach v_field in array array['subtotalBeforeAdjustment', 'legacyComplexityPercent'] loop
    if jsonb_typeof(v_config -> v_field) is distinct from 'number' or abs((v_config ->> v_field)::numeric) > 100000000 then raise exception 'Contexto de cálculo inválido.'; end if;
  end loop;
  foreach v_field in array array['entryAmount', 'selectedAdjustment', 'commissionPercent', 'negotiationDiscountPercent', 'rtPercent'] loop
    if jsonb_typeof(v_config #> array['totalsInput', v_field]) is distinct from 'number' or abs((v_config #>> array['totalsInput', v_field])::numeric) > 100000000 then raise exception 'Contexto comercial inválido.'; end if;
  end loop;
  if coalesce(v_config #>> '{totalsInput,paymentMode}', '') not in ('entry','total') then raise exception 'Contexto comercial inválido.'; end if;
  -- Two bounded reads, never a catalog/inventory query for each option or piece.
  select coalesce(jsonb_object_agg(m.id, jsonb_build_object('id', m.id, 'active', m.active,
    'base_minimum_sale_per_m2', m.base_minimum_sale_per_m2, 'base_cost_per_m2', m.base_cost_per_m2,
    'thickness_label', m.thickness_label, 'texture', m.texture, 'material_type', m.material_type,
    'material_line', m.material_line, 'provider', m.provider)), '{}') into v_catalog
  from public.materials m where m.empresa_id = p_quote.empresa_id
    and m.id in (select o ->> 'materialId' from jsonb_array_elements(v_config -> 'options') o
      union select o ->> 'principalMaterialId' from jsonb_array_elements(v_config -> 'options') o);
  select coalesce(jsonb_agg(jsonb_build_object('materialId', i.material_id, 'status', i.status,
    'minimum', coalesce(i.minimum_sale_price, i.cost, 0), 'variantKey', concat_ws('|', i.material_id,
      app_private.material_variant_part(i.material_line), app_private.material_variant_part(i.material_type),
      app_private.material_variant_part(i.thickness_label), app_private.material_variant_part(i.texture),
      app_private.material_variant_part(i.provider)))), '[]') into v_stock
  from public.inventory i where i.empresa_id = p_quote.empresa_id
    and i.material_id in (select o ->> 'materialId' from jsonb_array_elements(v_config -> 'options') o);
  for v_option in select value from jsonb_array_elements(v_config -> 'options') loop
    v_id := v_option ->> 'id';
    v_key := concat_ws('::', v_option ->> 'principalMaterialId', coalesce(v_option ->> 'principalVariantKey', ''),
      v_option ->> 'materialId', coalesce(v_option ->> 'materialVariantKey', ''));
    if coalesce(char_length(v_id), 0) not between 1 and 120 or v_id = any(v_ids) or v_key = any(v_keys)
      or coalesce(v_option ->> 'materialId', '') = coalesce(v_option ->> 'principalMaterialId', '') then raise exception 'Alternativa redundante ou duplicada.'; end if;
    v_ids := array_append(v_ids, v_id); v_keys := array_append(v_keys, v_key);
    v_material := v_catalog -> (v_option ->> 'materialId');
    v_principal := v_catalog -> (v_option ->> 'principalMaterialId');
    if v_principal is null then raise exception 'Material principal não autorizado.'; end if;
    if v_material is null or coalesce((v_material ->> 'active')::boolean, true) = false then raise exception 'Material não autorizado ou inativo.'; end if;
    if coalesce(v_option ->> 'materialVariantKey', '') <> ''
      and v_option ->> 'materialVariantKey' <> concat_ws('|', v_option ->> 'materialId',
        app_private.material_variant_part(v_material ->> 'material_line'), app_private.material_variant_part(v_material ->> 'material_type'),
        app_private.material_variant_part(v_material ->> 'thickness_label'), app_private.material_variant_part(v_material ->> 'texture'),
        app_private.material_variant_part(v_material ->> 'provider'))
      and not exists (select 1 from jsonb_array_elements(v_stock) i where i ->> 'materialId' = v_option ->> 'materialId'
        and i ->> 'variantKey' = v_option ->> 'materialVariantKey' and app_private.material_variant_part(i ->> 'status') not in ('usada','descarte'))
      then raise exception 'Variante alternativa não autorizada.'; end if;
    select min((i ->> 'minimum')::numeric) into v_min from jsonb_array_elements(v_stock) i
    where i ->> 'materialId' = v_option ->> 'materialId' and (i ->> 'minimum')::numeric > 0
      and app_private.material_variant_part(i ->> 'status') not in ('usada', 'descarte')
      and (coalesce(v_option ->> 'materialVariantKey', '') = '' or i ->> 'variantKey' = v_option ->> 'materialVariantKey');
    v_min := coalesce(v_min, nullif((v_material ->> 'base_minimum_sale_per_m2')::numeric, 0), (v_material ->> 'base_cost_per_m2')::numeric, 0);
    if jsonb_typeof(v_option -> 'pricePerM2') is distinct from 'number' or jsonb_typeof(v_option -> 'minimumPrice') is distinct from 'number'
      or (v_option ->> 'pricePerM2')::numeric not between greatest(0, v_min) and 100000000
      or (v_option ->> 'minimumPrice')::numeric < v_min then raise exception 'Preço alternativo abaixo do mínimo ou inválido.'; end if;
    if jsonb_typeof(v_option -> 'pieceIds') is distinct from 'array' or jsonb_array_length(v_option -> 'pieceIds') not between 1 and 1000
      or (select count(distinct value) from jsonb_array_elements(v_option -> 'pieceIds')) <> jsonb_array_length(v_option -> 'pieceIds') then raise exception 'Peças elegíveis inválidas.'; end if;
    for v_id in select jsonb_array_elements_text(v_option -> 'pieceIds') loop
      select p into v_piece from jsonb_array_elements(p_quote.pieces) p where p ->> 'id' = v_id;
      if v_piece is null or (v_piece ->> 'materialId') is distinct from (v_option ->> 'principalMaterialId')
        or coalesce(v_piece ->> 'materialVariantKey', '') <> coalesce(v_option ->> 'principalVariantKey', '') then raise exception 'Peça não pertence ao grupo principal deste orçamento.'; end if;
      if jsonb_typeof(v_option #> array['pieceDeltas', v_id]) is distinct from 'number' then raise exception 'Cálculo alternativo ausente.'; end if;
      v_value := (v_option #>> array['pieceDeltas', v_id])::numeric;
      if abs(v_value) > 100000000 or v_value <> floor(v_value * 100 + 0.5) / 100 then raise exception 'Diferença financeira inválida.'; end if;
      if coalesce(v_piece ->> 'pricingMode', 'automatic') = 'manual' and coalesce(v_option ->> 'reviewReason', '') = '' then raise exception 'Preço manual exige revisão comercial.'; end if;
      foreach v_field in array array['thicknessLabel','texture','materialType'] loop
        -- Frozen display metadata comes from the same variant that the seller selected.
        if app_private.material_variant_part(coalesce(nullif(v_piece ->> v_field, ''),
            v_principal ->> case v_field when 'thicknessLabel' then 'thickness_label' when 'materialType' then 'material_type' else v_field end))
          <> app_private.material_variant_part(v_option #>> array['material',v_field])
          and coalesce(v_option ->> 'reviewReason', '') = '' then raise exception 'Especificações diferentes exigem revisão comercial.'; end if;
      end loop;
    end loop;
  end loop;
  if abs(app_private.material_simulation_total(v_config, 0) - p_quote.total_price) > 0.01
    or app_private.material_simulation_total(v_config, 0) is null then raise exception 'Precificação alternativa desatualizada.'; end if;
end;
$$;

create or replace function app_private.check_quote_material_alternatives()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform app_private.validate_quote_material_alternatives(new);
  return new;
end;
$$;
create trigger quotes_validate_material_alternatives before insert or update of material_alternatives, pieces on public.quotes
for each row execute function app_private.check_quote_material_alternatives();

-- Wrap, never replace the installed builder's allocation, quantities or payment logic.
do $$ begin
  if to_regprocedure('app_private.build_quote_presentation_snapshot_alternatives_base(public.quotes,public.clients,public.materials,public.settings,integer)') is null then
    execute replace(pg_get_functiondef('app_private.build_quote_presentation_snapshot(public.quotes,public.clients,public.materials,public.settings,integer)'::regprocedure),
      'FUNCTION app_private.build_quote_presentation_snapshot(', 'FUNCTION app_private.build_quote_presentation_snapshot_alternatives_base(');
  end if;
end; $$;
create or replace function app_private.build_quote_presentation_snapshot(
  p_quote public.quotes, p_client public.clients, p_material public.materials, p_settings public.settings, p_version_number integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_snapshot jsonb;
begin
  v_snapshot := app_private.build_quote_presentation_snapshot_alternatives_base(p_quote, p_client, p_material, p_settings, p_version_number);
  if coalesce(jsonb_array_length(p_quote.material_alternatives -> 'options'), 0) = 0 then return v_snapshot; end if;
  perform app_private.validate_quote_material_alternatives(p_quote);
  return v_snapshot || jsonb_build_object('materialAlternatives', p_quote.material_alternatives,
    'materialSourceFingerprint', md5((to_jsonb(p_quote) - 'updated_at')::text));
end;
$$;

-- Anonymous confirmation delegates the actual approval to the installed acceptance function.
-- Quote lock serializes publication; then follow the existing public read/accept order (version, presentation).
-- No quote/contract/production update.
do $$ begin
  if to_regprocedure('app_private.accept_quote_presentation_alternatives_base(text,text)') is null then
    execute replace(pg_get_functiondef('public.accept_quote_presentation(text,text)'::regprocedure),
      'FUNCTION public.accept_quote_presentation(', 'FUNCTION app_private.accept_quote_presentation_alternatives_base(');
  end if;
end; $$;
create or replace function public.accept_quote_presentation_materials(
  p_token text, p_accepted_name text, p_version_id uuid, p_selections jsonb, p_expected_total numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_version public.quote_presentation_versions; v_quote public.quotes; v_current uuid;
  v_config jsonb; v_option jsonb; v_selection record; v_affected jsonb := '[]';
  v_delta numeric := 0; v_total numeric; v_result jsonb; v_previous jsonb;
begin
  if char_length(coalesce(p_token, '')) not between 24 and 120 or jsonb_typeof(p_selections) is distinct from 'object'
    or p_selections is null or octet_length(p_selections::text) > 131072
    or char_length(btrim(coalesce(p_accepted_name, ''))) not between 2 and 120
    or (select count(*) from jsonb_object_keys(p_selections)) > 1000 then raise exception 'Seleção inválida.'; end if;
  select * into v_version from public.quote_presentation_versions where public_token = lower(btrim(p_token)) and id = p_version_id;
  if not found then raise exception 'Proposta inválida.'; end if;
  select * into v_quote from public.quotes where id = v_version.quote_id and empresa_id = v_version.empresa_id for update;
  if not found then raise exception 'Orçamento indisponível.'; end if;
  select * into v_version from public.quote_presentation_versions where id = p_version_id for update;
  select current_version_id into v_current from public.quote_presentations where id = v_version.presentation_id for update;
  v_config := v_version.snapshot -> 'materialAlternatives';
  if v_config is null or (v_config ->> 'ruleVersion') is distinct from '1' then raise exception 'Esta proposta não oferece alternativas.'; end if;
  if v_current is distinct from v_version.id or (v_version.snapshot ->> 'materialSourceFingerprint') is distinct from md5((to_jsonb(v_quote) - 'updated_at')::text) then raise exception 'Proposta desatualizada. Solicite uma nova versão antes de confirmar.'; end if;
  if v_version.revoked_at is not null or v_version.status = 'REVOGADO' or v_version.valid_until < now() then raise exception 'Proposta indisponível para confirmação.'; end if;
  for v_selection in select key, value from jsonb_each(p_selections) order by key loop
    if jsonb_typeof(v_selection.value) is distinct from 'string' then raise exception 'Envie somente IDs de alternativas.'; end if;
    select o into v_option from jsonb_array_elements(v_config -> 'options') o where o ->> 'id' = v_selection.value #>> '{}';
    if v_option is null or coalesce(v_option ->> 'reviewReason', '') <> ''
      or not (v_option -> 'pieceIds' ? v_selection.key)
      or not exists (select 1 from jsonb_array_elements(v_version.snapshot -> 'pieces') p where p ->> 'id' = v_selection.key)
      or jsonb_typeof(v_option #> array['pieceDeltas', v_selection.key]) is distinct from 'number' then raise exception 'Material ou peça não autorizado.'; end if;
    v_delta := v_delta + (v_option #>> array['pieceDeltas', v_selection.key])::numeric;
    v_affected := v_affected || jsonb_build_array(jsonb_build_object('pieceId', v_selection.key, 'alternativeId', v_option ->> 'id',
      'materialId', v_option ->> 'materialId', 'productionDelta', (v_option #>> array['pieceDeltas', v_selection.key])::numeric,
      'piece', (select p from jsonb_array_elements(v_version.snapshot -> 'pieces') p where p ->> 'id' = v_selection.key)));
  end loop;
  v_total := (v_version.snapshot #>> '{investment,totalPrice}')::numeric
    + app_private.material_simulation_total(v_config, v_delta) - app_private.material_simulation_total(v_config, 0);
  if p_expected_total is null or p_expected_total <> v_total or v_total < 0 then raise exception 'Valor divergente. Atualize os valores antes de confirmar.'; end if;
  select accepted_snapshot -> 'materialSelection' into v_previous from public.quote_presentation_acceptances where version_id = v_version.id;
  if found then
    if v_previous -> 'selections' = p_selections and (v_previous ->> 'total')::numeric = v_total then
      return jsonb_build_object('accepted', true, 'acceptedAt', v_version.accepted_at, 'acceptedName',
        (select accepted_name from public.quote_presentation_acceptances where version_id = v_version.id), 'versionLabel', v_version.snapshot ->> 'versionLabel');
    end if;
    raise exception 'Esta versão já possui um aceite. Solicite uma nova versão para alterar materiais.';
  end if;
  v_result := app_private.accept_quote_presentation_alternatives_base(p_token, p_accepted_name);
  update public.quote_presentation_acceptances set accepted_snapshot =
    jsonb_set(v_version.snapshot, '{investment,totalPrice}', to_jsonb(v_total)) || jsonb_build_object(
      'originalSnapshot', v_version.snapshot,
      'materialSelection', jsonb_build_object('selections', p_selections, 'total', v_total,
        'originalTotal', v_version.snapshot #> '{investment,totalPrice}', 'confirmedAt', v_result ->> 'acceptedAt',
        'versionId', v_version.id, 'ruleVersion', 1, 'affectedPieces', v_affected))
  where version_id = v_version.id;
  return v_result;
end;
$$;

-- The legacy endpoint still accepts the principal, but cannot bypass new version validation.
create or replace function public.accept_quote_presentation(p_token text, p_accepted_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_snapshot jsonb;
begin
  select id, snapshot into v_id, v_snapshot from public.quote_presentation_versions
    where public_token = lower(btrim(p_token));
  if coalesce(jsonb_array_length(v_snapshot #> '{materialAlternatives,options}'), 0) > 0 then
    return public.accept_quote_presentation_materials(p_token, p_accepted_name, v_id, '{}'::jsonb, (v_snapshot #>> '{investment,totalPrice}')::numeric);
  end if;
  return app_private.accept_quote_presentation_alternatives_base(p_token, p_accepted_name);
end;
$$;

-- Expose only the confirmed choices alongside the original public snapshot on later visits.
do $$ begin
  if to_regprocedure('app_private.get_public_quote_presentation_alternatives_base(text)') is null then
    execute replace(pg_get_functiondef('public.get_public_quote_presentation(text)'::regprocedure),
      'FUNCTION public.get_public_quote_presentation(', 'FUNCTION app_private.get_public_quote_presentation_alternatives_base(');
  end if;
end; $$;
create or replace function public.get_public_quote_presentation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_selection jsonb;
begin
  v_payload := app_private.get_public_quote_presentation_alternatives_base(p_token);
  if v_payload ->> 'state' = 'available' and v_payload #>> '{meta,acceptedAt}' is not null then
    select accepted_snapshot -> 'materialSelection' into v_selection from public.quote_presentation_acceptances
    where version_id = (v_payload #>> '{meta,versionId}')::uuid;
    if v_selection is not null then v_payload := jsonb_set(v_payload, '{snapshot,materialSelection}', v_selection); end if;
  end if;
  -- Internal fingerprint is never needed by the browser.
  if v_payload ->> 'state' = 'available' then
    v_payload := jsonb_set(v_payload, '{snapshot}', (v_payload -> 'snapshot') - 'materialSourceFingerprint');
  end if;
  return v_payload;
end;
$$;

revoke all on function app_private.material_simulation_total(jsonb,numeric), app_private.material_variant_part(text),
  app_private.validate_quote_material_alternatives(public.quotes), app_private.check_quote_material_alternatives(),
  app_private.build_quote_presentation_snapshot_alternatives_base(public.quotes,public.clients,public.materials,public.settings,integer),
  app_private.get_public_quote_presentation_alternatives_base(text) from public, anon, authenticated;
revoke all on function app_private.accept_quote_presentation_alternatives_base(text,text) from public, anon, authenticated;
grant execute on function app_private.material_simulation_total(jsonb,numeric), app_private.material_variant_part(text),
  app_private.validate_quote_material_alternatives(public.quotes), app_private.check_quote_material_alternatives() to authenticated, service_role;
revoke all on function public.accept_quote_presentation_materials(text,text,uuid,jsonb,numeric) from public;
grant execute on function public.accept_quote_presentation_materials(text,text,uuid,jsonb,numeric) to anon, authenticated;
