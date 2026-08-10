create or replace function public.generate_quote_presentation_version(
  p_quote_id text,
  p_created_by_name text default null
)
returns table (
  presentation_id uuid,
  version_id uuid,
  version_number integer,
  status text,
  public_token text,
  proposal_code text,
  valid_until timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := auth.uid()::text;
  v_display_name text := nullif(btrim(coalesce(p_created_by_name, '')), '');
  v_quote public.quotes%rowtype;
  v_client public.clients%rowtype;
  v_material public.materials%rowtype;
  v_settings public.settings%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_version public.quote_presentation_versions%rowtype;
  v_version_number integer;
  v_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sessão obrigatória para gerar a proposta digital.';
  end if;

  if v_empresa_id is null then
    raise exception 'Empresa da sessão não identificada.';
  end if;

  if char_length(coalesce(p_quote_id, '')) > 120 then
    raise exception 'Orçamento inválido.';
  end if;

  if v_display_name is not null and char_length(v_display_name) > 120 then
    raise exception 'Nome do responsável excede 120 caracteres.';
  end if;

  select *
  into v_quote
  from public.quotes
  where id = p_quote_id
    and empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Orçamento não encontrado para esta empresa.';
  end if;

  select *
  into v_client
  from public.clients
  where id = v_quote.client_id
    and empresa_id = v_empresa_id;

  if v_quote.material_id is not null then
    select *
    into v_material
    from public.materials
    where id = v_quote.material_id
      and empresa_id = v_empresa_id;
  end if;

  select *
  into v_settings
  from public.settings
  where empresa_id = v_empresa_id
  order by updated_at desc nulls last
  limit 1;

  insert into public.quote_presentations (
    empresa_id,
    quote_id,
    latest_status,
    created_by_uid,
    created_by_name
  ) values (
    v_empresa_id,
    p_quote_id,
    'RASCUNHO',
    v_actor_uid,
    v_display_name
  )
  on conflict (empresa_id, quote_id) do nothing;

  select *
  into v_presentation
  from public.quote_presentations
  where empresa_id = v_empresa_id
    and quote_id = p_quote_id
  for update;

  v_version_number := coalesce(v_presentation.current_version_number, 0) + 1;
  v_snapshot := app_private.build_quote_presentation_snapshot(v_quote, v_client, v_material, v_settings, v_version_number);

  insert into public.quote_presentation_versions (
    presentation_id,
    empresa_id,
    quote_id,
    version_number,
    proposal_code,
    public_token,
    status,
    snapshot,
    valid_until,
    created_by_uid,
    created_by_name
  ) values (
    v_presentation.id,
    v_empresa_id,
    p_quote_id,
    v_version_number,
    concat('DC-', upper(right(coalesce(p_quote_id, ''), 6)), '-V', v_version_number::text),
    encode(extensions.gen_random_bytes(18), 'hex'),
    'GERADO',
    v_snapshot,
    coalesce(v_quote.validity_date, timezone('utc', now()) + interval '15 days'),
    v_actor_uid,
    v_display_name
  )
  returning *
  into v_version;

  update public.quote_presentations
  set current_version_id = v_version.id,
      current_version_number = v_version_number,
      latest_status = v_version.status,
      last_generated_at = timezone('utc', now()),
      created_by_uid = coalesce(created_by_uid, v_actor_uid),
      created_by_name = coalesce(created_by_name, v_display_name)
  where id = v_presentation.id;

  perform app_private.insert_quote_presentation_event(
    v_presentation.id,
    v_version.id,
    null,
    v_empresa_id,
    p_quote_id,
    v_version_number,
    case when v_version_number = 1 then 'created' else 'generated' end,
    case when v_version_number = 1 then 'Proposta digital criada.' else concat('Nova versão V', v_version_number::text, ' gerada.') end,
    v_actor_uid,
    v_display_name,
    jsonb_build_object('proposalCode', v_version.proposal_code)
  );

  return query
  select
    v_presentation.id,
    v_version.id,
    v_version.version_number,
    v_version.status,
    v_version.public_token,
    v_version.proposal_code,
    v_version.valid_until,
    v_version.created_at;
end;
$$;

create or replace function public.accept_quote_presentation(
  p_token text,
  p_accepted_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_name text := nullif(btrim(coalesce(p_accepted_name, '')), '');
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_acceptance public.quote_presentation_acceptances%rowtype;
  v_status text;
begin
  if char_length(v_token) not between 24 and 120 then
    raise exception 'Proposta inválida.';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe o nome completo para confirmar o aceite.';
  end if;

  select *
  into v_version
  from public.quote_presentation_versions
  where public_token = v_token
  for update;

  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  select * into v_presentation from public.quote_presentations where id = v_version.presentation_id for update;

  v_status := app_private.quote_presentation_status_row(v_version.status, v_version.valid_until, v_version.revoked_at, v_version.accepted_at);

  if v_status = 'REVOGADO' then
    raise exception 'Esta proposta foi revogada e não pode mais ser aceita.';
  end if;

  if v_status = 'EXPIRADO' then
    update public.quote_presentation_versions
    set status = 'EXPIRADO'
    where id = v_version.id
    returning * into v_version;
    if v_presentation.current_version_id = v_version.id then
      update public.quote_presentations set latest_status = 'EXPIRADO' where id = v_presentation.id;
    end if;
    raise exception 'Esta proposta está expirada. Solicite uma nova versão à D''Coratto.';
  end if;

  if exists (
    select 1
    from public.quote_presentation_acceptances
    where version_id = v_version.id
  ) then
    raise exception 'Esta proposta já foi aceita anteriormente.';
  end if;

  insert into public.quote_presentation_acceptances (
    presentation_id,
    version_id,
    empresa_id,
    quote_id,
    version_number,
    accepted_name,
    acceptance_token,
    accepted_snapshot
  ) values (
    v_presentation.id,
    v_version.id,
    v_version.empresa_id,
    v_version.quote_id,
    v_version.version_number,
    v_name,
    encode(extensions.gen_random_bytes(18), 'hex'),
    v_version.snapshot
  )
  returning *
  into v_acceptance;

  update public.quote_presentation_versions
  set status = 'ACEITO',
      accepted_at = coalesce(accepted_at, timezone('utc', now())),
      first_viewed_at = coalesce(first_viewed_at, timezone('utc', now())),
      last_viewed_at = timezone('utc', now())
  where id = v_version.id
  returning * into v_version;

  if v_presentation.current_version_id = v_version.id then
    update public.quote_presentations
    set latest_status = 'ACEITO'
    where id = v_presentation.id;
  end if;

  perform app_private.insert_quote_presentation_event(
    v_presentation.id,
    v_version.id,
    v_acceptance.id,
    v_version.empresa_id,
    v_version.quote_id,
    v_version.version_number,
    'accepted',
    concat('Versão V', v_version.version_number::text, ' aceita pelo cliente.'),
    null,
    v_name,
    jsonb_build_object('acceptedName', v_name)
  );

  return jsonb_build_object(
    'accepted', true,
    'acceptedAt', v_version.accepted_at,
    'acceptedName', v_name,
    'versionLabel', coalesce(v_version.snapshot ->> 'versionLabel', concat('V', v_version.version_number::text))
  );
end;
$$;
