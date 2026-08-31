create or replace function app_private.quote_presentation_status_row(
  p_status text,
  p_valid_until timestamptz,
  p_revoked_at timestamptz,
  p_accepted_at timestamptz
)
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when p_revoked_at is not null then 'REVOGADO'
    when p_accepted_at is not null then 'ACEITO'
    when p_valid_until is not null
      and timezone('America/Sao_Paulo', p_valid_until)::date < timezone('America/Sao_Paulo', now())::date then 'EXPIRADO'
    else coalesce(nullif(btrim(p_status), ''), 'GERADO')
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
      concat('Versao V', v_version.version_number::text, ' expirada.'),
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
      concat('Versao V', v_version.version_number::text, ' visualizada pela primeira vez.'),
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
