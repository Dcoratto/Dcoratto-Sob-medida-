create or replace function app_private.build_quote_presentation_snapshot(
  p_quote public.quotes,
  p_client public.clients,
  p_material public.materials,
  p_settings public.settings,
  p_version_number integer
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_piece_count integer := coalesce(jsonb_array_length(coalesce(p_quote.pieces, '[]'::jsonb)), 0);
  v_piece_rows jsonb := '[]'::jsonb;
  v_material_rows jsonb := '[]'::jsonb;
  v_primary_material jsonb := null;
  v_piece_subtotal numeric := 0;
  v_global_adjustment numeric := 0;
begin
  with piece_source as (
    select
      piece,
      ordinality,
      coalesce(nullif(btrim(piece ->> 'id'), ''), concat('piece-', ordinality::text)) as piece_id,
      coalesce(nullif(btrim(piece ->> 'name'), ''), 'Peça') as piece_name,
      nullif(btrim(coalesce(piece ->> 'presentationEnvironment', p_quote.environment, '')), '') as piece_environment,
      nullif(btrim(coalesce(piece ->> 'materialId', '')), '') as material_id,
      coalesce(
        nullif(btrim(piece ->> 'presentationMaterialName'), ''),
        nullif(btrim(piece ->> 'materialName'), ''),
        nullif(btrim(piece ->> 'material'), '')
      ) as material_name,
      case
        when jsonb_typeof(piece -> 'presentationArea') = 'number' then (piece ->> 'presentationArea')::numeric
        when nullif(piece ->> 'presentationArea', '') is not null then (piece ->> 'presentationArea')::numeric
        else null
      end as piece_area,
      case
        when jsonb_typeof(piece -> 'presentationValue') = 'number' then (piece ->> 'presentationValue')::numeric
        when nullif(piece ->> 'presentationValue', '') is not null then (piece ->> 'presentationValue')::numeric
        else null
      end as piece_value,
      nullif(btrim(piece ->> 'presentationMaterialDescription'), '') as material_description,
      nullif(btrim(piece ->> 'presentationMaterialCategory'), '') as material_category,
      nullif(btrim(piece ->> 'presentationMaterialLine'), '') as material_line,
      nullif(btrim(piece ->> 'presentationMaterialType'), '') as material_type,
      nullif(btrim(piece ->> 'presentationThicknessLabel'), '') as thickness_label,
      nullif(btrim(piece ->> 'presentationTexture'), '') as texture,
      nullif(
        btrim(
          coalesce(
            piece ->> 'presentationMaterialImageUrl',
            piece ->> 'proposalImageUrl',
            piece ->> 'previewUrl',
            ''
          )
        ),
        ''
      ) as image_url,
      app_private.strip_html(piece ->> 'notes') as piece_notes,
      case
        when jsonb_typeof(piece -> 'presentationHighlights') = 'array' then piece -> 'presentationHighlights'
        else '[]'::jsonb
      end as highlights,
      case
        when nullif(piece ->> 'width', '') is not null and nullif(piece ->> 'length', '') is not null then
          replace(trim(to_char(abs(coalesce((piece ->> 'width')::numeric, 0)), 'FM999999990D##')), '.', ',')
          || ' x ' ||
          replace(trim(to_char(abs(coalesce((piece ->> 'length')::numeric, 0)), 'FM999999990D##')), '.', ',')
          || ' ' || case when lower(coalesce(piece ->> 'unit', 'cm')) = 'm' then 'm' else 'cm' end
        else null
      end as dimensions_label
    from jsonb_array_elements(coalesce(p_quote.pieces, '[]'::jsonb)) with ordinality as pieces(piece, ordinality)
  ),
  piece_enriched as (
    select
      piece_source.*,
      material_lookup.name as fallback_material_name,
      nullif(btrim(coalesce(material_lookup.category, '')), '') as fallback_material_category,
      nullif(btrim(coalesce(material_lookup.material_line, '')), '') as fallback_material_line,
      nullif(btrim(coalesce(material_lookup.material_type, '')), '') as fallback_material_type,
      nullif(btrim(coalesce(material_lookup.thickness_label, '')), '') as fallback_thickness_label,
      nullif(btrim(coalesce(material_lookup.texture, '')), '') as fallback_texture,
      app_private.strip_html(material_lookup.quote_description) as fallback_material_description,
      nullif(
        btrim(
          coalesce(
            material_lookup.original_url,
            material_lookup.medium_url,
            material_lookup.thumbnail_url,
            material_lookup.image_url,
            ''
          )
        ),
        ''
      ) as fallback_image_url
    from piece_source
    left join public.materials as material_lookup
      on material_lookup.id = piece_source.material_id
     and material_lookup.empresa_id = p_quote.empresa_id
  ),
  material_source as (
    select distinct on (
      coalesce(material_id, '__name__:' || coalesce(material_name, fallback_material_name, 'sem-material'))
    )
      material_id,
      coalesce(material_name, fallback_material_name) as material_name,
      coalesce(material_category, fallback_material_category) as material_category,
      coalesce(material_line, fallback_material_line) as material_line,
      coalesce(material_type, fallback_material_type) as material_type,
      coalesce(thickness_label, fallback_thickness_label) as thickness_label,
      coalesce(texture, fallback_texture) as texture,
      coalesce(material_description, fallback_material_description) as material_description,
      coalesce(image_url, fallback_image_url) as image_url,
      ordinality
    from piece_enriched
    where material_id is not null or material_name is not null or fallback_material_name is not null
    order by
      coalesce(material_id, '__name__:' || coalesce(material_name, fallback_material_name, 'sem-material')),
      ordinality
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', piece_id,
            'name', piece_name,
            'environment', piece_environment,
            'materialId', material_id,
            'materialName', coalesce(material_name, fallback_material_name),
            'material', coalesce(material_name, fallback_material_name),
            'area', piece_area,
            'value', piece_value,
            'dimensionsLabel', dimensions_label,
            'imageUrl', null,
            'notes', piece_notes,
            'highlights', case when jsonb_array_length(highlights) > 0 then highlights else null end
          )
        )
        order by ordinality
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        distinct jsonb_strip_nulls(
          jsonb_build_object(
            'id', material_id,
            'name', material_name,
            'category', material_category,
            'materialLine', material_line,
            'materialType', material_type,
            'thicknessLabel', thickness_label,
            'texture', texture,
            'description', material_description,
            'imageUrl', image_url
          )
        )
      ) filter (where material_name is not null or material_id is not null),
      '[]'::jsonb
    ),
    coalesce(sum(coalesce(piece_value, 0)), 0)
  into v_piece_rows, v_material_rows, v_piece_subtotal
  from piece_enriched;

  if jsonb_typeof(v_material_rows) = 'array' and jsonb_array_length(v_material_rows) > 0 then
    v_primary_material := v_material_rows -> 0;
  elsif coalesce(nullif(btrim(p_quote.material_name), ''), nullif(btrim(p_material.name), '')) is not null then
    v_primary_material := jsonb_strip_nulls(jsonb_build_object(
      'id', p_quote.material_id,
      'name', coalesce(nullif(btrim(p_quote.material_name), ''), nullif(btrim(p_material.name), '')),
      'category', nullif(btrim(coalesce(p_material.category, '')), ''),
      'materialLine', nullif(btrim(coalesce(p_material.material_line, '')), ''),
      'materialType', nullif(btrim(coalesce(p_material.material_type, '')), ''),
      'thicknessLabel', nullif(btrim(coalesce(p_material.thickness_label, '')), ''),
      'texture', nullif(btrim(coalesce(p_material.texture, '')), ''),
      'description', app_private.strip_html(p_material.quote_description),
      'imageUrl', nullif(btrim(coalesce(p_material.original_url, p_material.medium_url, p_material.thumbnail_url, p_material.image_url, '')), '')
    ));
  end if;

  v_global_adjustment := round(coalesce(p_quote.total_price, 0) - coalesce(v_piece_subtotal, 0), 2);

  return jsonb_strip_nulls(
    jsonb_build_object(
      'quoteId', p_quote.id,
      'proposalCode', concat('DC-', upper(right(coalesce(p_quote.id, ''), 6)), '-V', p_version_number::text),
      'versionLabel', concat('V', p_version_number::text),
      'generatedAt', timezone('utc', now()),
      'validUntil', p_quote.validity_date,
      'heroTitle', 'Proposta Personalizada',
      'heroSubtitle', coalesce(
        nullif(btrim(coalesce(p_quote.environment, '')), ''),
        case when v_piece_count > 1 then 'Projeto sob medida para o seu ambiente' else 'Projeto sob medida para o seu espaço' end
      ),
      'company', jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(nullif(btrim(p_settings.company_name), ''), 'D''Coratto'),
        'phone', nullif(btrim(coalesce(p_settings.phone, '')), ''),
        'email', nullif(btrim(coalesce(p_settings.email, '')), ''),
        'address', nullif(btrim(coalesce(p_settings.address, '')), ''),
        'logoUrl', nullif(btrim(coalesce(p_settings.logo_url, '')), '')
      )),
      'client', jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(nullif(btrim(p_quote.client_name), ''), nullif(btrim(p_client.name), ''), 'Cliente'),
        'city', nullif(btrim(coalesce(p_client.city, '')), ''),
        'neighborhood', nullif(btrim(coalesce(p_client.neighborhood, '')), '')
      )),
      'summary', jsonb_strip_nulls(jsonb_build_object(
        'environment', nullif(btrim(coalesce(p_quote.environment, '')), ''),
        'responsible', nullif(btrim(coalesce(p_quote.responsible, '')), ''),
        'pieceCount', v_piece_count,
        'materialCount', case when jsonb_typeof(v_material_rows) = 'array' then jsonb_array_length(v_material_rows) else null end
      )),
      'includedFeatures', jsonb_strip_nulls(jsonb_build_object(
        'materialSelected', case when jsonb_typeof(v_material_rows) = 'array' and jsonb_array_length(v_material_rows) > 0 then true else null end,
        'fabricationIncluded', case when v_piece_count > 0 then true else null end,
        'finishingIncluded', case when coalesce(v_primary_material ->> 'texture', '') <> '' then true else null end,
        'cutoutsIncluded', case when coalesce(p_quote.include_cutouts, false) then true else null end,
        'sculptedSinkIncluded', case when coalesce(p_quote.include_sculpted_sink, false) then true else null end,
        'deliveryIncluded', case when coalesce(p_quote.include_delivery, false) then true else null end,
        'installationIncluded', case when coalesce(p_quote.include_labor, false) then true else null end,
        'measurementIncluded', case when p_quote.measurement_date is not null then true else null end
      )),
      'material', v_primary_material,
      'materials', v_material_rows,
      'pieces', v_piece_rows,
      'investment', jsonb_strip_nulls(jsonb_build_object(
        'label', case when v_piece_count > 1 then 'Projeto completo' else 'Projeto sob medida' end,
        'description', coalesce(
          nullif(btrim(coalesce(p_quote.environment, '')), ''),
          case when v_piece_count > 0 then concat(v_piece_count::text, ' peça(s) selecionada(s)') else 'Composição personalizada' end
        ),
        'totalPrice', coalesce(p_quote.total_price, 0),
        'totalArea', coalesce(p_quote.total_area, 0),
        'piecesSubtotal', case when v_piece_subtotal > 0 then v_piece_subtotal else null end,
        'globalAdjustmentValue', case when abs(v_global_adjustment) > 0.009 then v_global_adjustment else null end
      )),
      'payment', jsonb_strip_nulls(jsonb_build_object(
        'method', nullif(btrim(coalesce(p_quote.payment_method, '')), ''),
        'mode', nullif(btrim(coalesce(p_quote.payment_mode, '')), ''),
        'totalPaymentMethod', nullif(btrim(coalesce(p_quote.total_payment_method, '')), ''),
        'remainingPaymentMethod', nullif(btrim(coalesce(p_quote.remaining_payment_method, '')), ''),
        'entryAmount', nullif(p_quote.entry_amount::text, '0.00')::numeric,
        'installmentCount', case when coalesce(p_quote.installment_count, 0) > 0 then p_quote.installment_count else null end,
        'installmentAmount', case when coalesce(p_quote.installment_amount, 0) > 0 then p_quote.installment_amount else null end,
        'notes', app_private.strip_html(p_quote.payment_notes),
        'simulation', jsonb_strip_nulls(jsonb_build_object(
          'availableMethods', (
            select coalesce(
              jsonb_agg(
                jsonb_strip_nulls(jsonb_build_object(
                  'name', nullif(btrim(method ->> 'name'), ''),
                  'adjustment', coalesce((method ->> 'adjustment')::numeric, 0)
                ))
                order by ordinality
              ),
              '[]'::jsonb
            )
            from jsonb_array_elements(coalesce(p_quote.pricing_snapshot -> 'paymentMethods', '[]'::jsonb)) with ordinality as payment_methods(method, ordinality)
            where nullif(btrim(method ->> 'name'), '') is not null
          ),
          'commissionPercent', case when coalesce(p_quote.commission_percent, 0) <> 0 then p_quote.commission_percent else null end,
          'negotiationDiscountPercent', case when coalesce(p_quote.negotiation_discount_percent, 0) <> 0 then p_quote.negotiation_discount_percent else null end,
          'rtPercent', case when coalesce(p_quote.rt_percent, 0) <> 0 then p_quote.rt_percent else null end
        ))
      )),
      'delivery', jsonb_strip_nulls(jsonb_build_object(
        'deliveryDays', case when coalesce(p_quote.delivery_days, 0) > 0 then p_quote.delivery_days else null end,
        'deliveryDate', p_quote.delivery_date,
        'measurementDate', p_quote.measurement_date,
        'deliveryIncluded', case when coalesce(p_quote.include_delivery, false) then true else null end,
        'installationIncluded', case when coalesce(p_quote.include_labor, false) then true else null end
      )),
      'notes', jsonb_strip_nulls(jsonb_build_object(
        'commercialNotes', app_private.strip_html(p_quote.commercial_notes),
        'defaultNotes', app_private.strip_html(p_settings.default_notes)
      ))
    )
  );
end;
$$;;
