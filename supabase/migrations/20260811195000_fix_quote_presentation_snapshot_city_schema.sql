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
          'name', coalesce(nullif(btrim(piece ->> 'name'), ''), 'PeÃ§a'),
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
        case when v_piece_count > 1 then 'Projeto sob medida para o seu ambiente' else 'Projeto sob medida para o seu espaÃ§o' end
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
      'includedFeatures', jsonb_strip_nulls(jsonb_build_object(
        'materialSelected', case when v_material_name is not null then true else null end,
        'fabricationIncluded', case when v_piece_count > 0 then true else null end,
        'finishingIncluded', case when nullif(btrim(coalesce(p_material.texture, '')), '') is not null then true else null end,
        'cutoutsIncluded', case when coalesce(p_quote.include_cutouts, false) then true else null end,
        'sculptedSinkIncluded', case when coalesce(p_quote.include_sculpted_sink, false) then true else null end,
        'deliveryIncluded', case when coalesce(p_quote.include_delivery, false) then true else null end,
        'installationIncluded', case when coalesce(p_quote.include_labor, false) then true else null end,
        'measurementIncluded', case when p_quote.measurement_date is not null then true else null end
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
          case when v_piece_count > 0 then concat(v_piece_count::text, ' peÃ§a(s) selecionada(s)') else 'ComposiÃ§Ã£o personalizada' end
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

create or replace function public.get_public_quote_presentation(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_status text;
  v_first_view boolean := false;
  v_accepted_name text;
begin
  if char_length(v_token) not between 24 and 120 then
    return jsonb_build_object('state', 'missing');
  end if;

  select *
  into v_version
  from public.quote_presentation_versions
  where public_token = v_token
  for update;

  if not found then
    return jsonb_build_object('state', 'missing');
  end if;

  select * into v_presentation from public.quote_presentations where id = v_version.presentation_id for update;

  v_status := app_private.quote_presentation_status_row(v_version.status, v_version.valid_until, v_version.revoked_at, v_version.accepted_at);

  if v_status = 'EXPIRADO' and v_version.status <> 'EXPIRADO' then
    update public.quote_presentation_versions
    set status = 'EXPIRADO'
    where id = v_version.id
    returning * into v_version;

    if v_presentation.current_version_id = v_version.id then
      update public.quote_presentations
      set latest_status = 'EXPIRADO'
      where id = v_presentation.id;
    end if;

    perform app_private.insert_quote_presentation_event(
      v_presentation.id,
      v_version.id,
      null,
      v_version.empresa_id,
      v_version.quote_id,
      v_version.version_number,
      'expired',
      concat('VersÃ£o V', v_version.version_number::text, ' expirada.'),
      null,
      null,
      '{}'::jsonb
    );
  end if;

  if v_status = 'REVOGADO' then
    return jsonb_build_object(
      'state', 'revoked',
      'status', 'REVOGADO',
      'company', coalesce(v_version.snapshot -> 'company', '{}'::jsonb),
      'versionLabel', v_version.snapshot ->> 'versionLabel'
    );
  end if;

  if v_status = 'EXPIRADO' then
    return jsonb_build_object(
      'state', 'expired',
      'status', 'EXPIRADO',
      'company', coalesce(v_version.snapshot -> 'company', '{}'::jsonb),
      'versionLabel', v_version.snapshot ->> 'versionLabel'
    );
  end if;

  if v_version.first_viewed_at is null then
    v_first_view := true;
  end if;

  update public.quote_presentation_versions
  set first_viewed_at = coalesce(first_viewed_at, timezone('utc', now())),
      last_viewed_at = timezone('utc', now()),
      status = case
        when accepted_at is not null then 'ACEITO'
        when status in ('GERADO', 'COMPARTILHADO') then 'VISUALIZADO'
        else status
      end
  where id = v_version.id
  returning * into v_version;

  if v_presentation.current_version_id = v_version.id then
    update public.quote_presentations
    set latest_status = v_version.status
    where id = v_presentation.id;
  end if;

  if v_first_view then
    perform app_private.insert_quote_presentation_event(
      v_presentation.id,
      v_version.id,
      null,
      v_version.empresa_id,
      v_version.quote_id,
      v_version.version_number,
      'viewed',
      concat('VersÃ£o V', v_version.version_number::text, ' visualizada pela primeira vez.'),
      null,
      null,
      '{}'::jsonb
    );
  end if;

  if v_version.accepted_at is not null then
    select accepted_name
    into v_accepted_name
    from public.quote_presentation_acceptances
    where version_id = v_version.id
    order by created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'state', 'available',
    'status', v_version.status,
    'meta', jsonb_strip_nulls(jsonb_build_object(
      'versionId', v_version.id,
      'versionNumber', v_version.version_number,
      'versionLabel', coalesce(v_version.snapshot ->> 'versionLabel', concat('V', v_version.version_number::text)),
      'proposalCode', v_version.proposal_code,
      'validUntil', v_version.valid_until,
      'firstViewedAt', v_version.first_viewed_at,
      'lastViewedAt', v_version.last_viewed_at,
      'acceptedAt', v_version.accepted_at,
      'acceptedName', v_accepted_name
    )),
    'snapshot', v_version.snapshot
  );
end;
$$;
