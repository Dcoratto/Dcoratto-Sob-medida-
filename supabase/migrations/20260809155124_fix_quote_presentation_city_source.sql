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
  v_material_name text := coalesce(nullif(btrim(p_quote.material_name), ''), nullif(btrim(p_material.name), ''));
  v_material_description text := app_private.strip_html(p_material.quote_description);
  v_piece_rows jsonb := '[]'::jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', coalesce(nullif(btrim(piece ->> 'id'), ''), concat('piece-', ordinality::text)),
          'name', coalesce(nullif(btrim(piece ->> 'name'), ''), 'Peça'),
          'environment', nullif(btrim(coalesce(p_quote.environment, '')), ''),
          'material', v_material_name,
          'dimensionsLabel',
            case
              when nullif(piece ->> 'width', '') is not null and nullif(piece ->> 'length', '') is not null then
                replace(trim(to_char(abs(coalesce((piece ->> 'width')::numeric, 0)), 'FM999999990D##')), '.', ',')
                || ' x ' ||
                replace(trim(to_char(abs(coalesce((piece ->> 'length')::numeric, 0)), 'FM999999990D##')), '.', ',')
                || ' ' || case when lower(coalesce(piece ->> 'unit', 'cm')) = 'm' then 'm' else 'cm' end
              else null
            end,
          'imageUrl', coalesce(nullif(piece ->> 'proposalImageUrl', ''), nullif(piece ->> 'previewUrl', '')),
          'notes', app_private.strip_html(piece ->> 'notes')
        )
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  into v_piece_rows
  from jsonb_array_elements(coalesce(p_quote.pieces, '[]'::jsonb)) with ordinality as pieces(piece, ordinality);

  return jsonb_strip_nulls(
    jsonb_build_object(
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
        'pieceCount', v_piece_count
      )),
      'material', case
        when v_material_name is null
          and nullif(btrim(coalesce(p_material.category, '')), '') is null
          and nullif(btrim(coalesce(p_material.image_url, '')), '') is null
          and v_material_description is null
        then null
        else jsonb_strip_nulls(jsonb_build_object(
          'name', v_material_name,
          'category', nullif(btrim(coalesce(p_material.category, '')), ''),
          'materialLine', nullif(btrim(coalesce(p_material.material_line, '')), ''),
          'materialType', nullif(btrim(coalesce(p_material.material_type, '')), ''),
          'thicknessLabel', nullif(btrim(coalesce(p_material.thickness_label, '')), ''),
          'texture', nullif(btrim(coalesce(p_material.texture, '')), ''),
          'description', v_material_description,
          'imageUrl', nullif(btrim(coalesce(p_material.original_url, p_material.medium_url, p_material.thumbnail_url, p_material.image_url, '')), '')
        ))
      end,
      'pieces', v_piece_rows,
      'investment', jsonb_build_object(
        'label', case when v_piece_count > 1 then 'Projeto completo' else 'Projeto sob medida' end,
        'description', coalesce(
          nullif(btrim(coalesce(p_quote.environment, '')), ''),
          case when v_piece_count > 0 then concat(v_piece_count::text, ' peça(s) selecionada(s)') else 'Composição personalizada' end
        ),
        'totalPrice', coalesce(p_quote.total_price, 0),
        'totalArea', coalesce(p_quote.total_area, 0)
      ),
      'payment', jsonb_strip_nulls(jsonb_build_object(
        'method', nullif(btrim(coalesce(p_quote.payment_method, '')), ''),
        'mode', nullif(btrim(coalesce(p_quote.payment_mode, '')), ''),
        'totalPaymentMethod', nullif(btrim(coalesce(p_quote.total_payment_method, '')), ''),
        'remainingPaymentMethod', nullif(btrim(coalesce(p_quote.remaining_payment_method, '')), ''),
        'entryAmount', nullif(p_quote.entry_amount::text, '0.00')::numeric,
        'installmentCount', case when coalesce(p_quote.installment_count, 0) > 0 then p_quote.installment_count else null end,
        'installmentAmount', case when coalesce(p_quote.installment_amount, 0) > 0 then p_quote.installment_amount else null end,
        'notes', app_private.strip_html(p_quote.payment_notes)
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
$$;
