create or replace function public.revoke_quote_presentation_version(
  p_version_id uuid,
  p_actor_name text default null,
  p_reason text default null
)
returns table (
  version_id uuid,
  status text,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := auth.uid()::text;
  v_actor_name text := nullif(btrim(coalesce(p_actor_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria para revogar a proposta.';
  end if;

  select *
  into v_version
  from public.quote_presentation_versions
  where id = p_version_id
    and empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Versao da proposta nao encontrada.';
  end if;

  update public.quote_presentation_versions
  set status = 'REVOGADO',
      revoked_at = coalesce(public.quote_presentation_versions.revoked_at, timezone('utc', now()))
  where id = v_version.id
  returning *
  into v_version;

  select *
  into v_presentation
  from public.quote_presentations
  where id = v_version.presentation_id
  for update;

  if v_presentation.current_version_id = v_version.id then
    update public.quote_presentations
    set latest_status = 'REVOGADO'
    where id = v_presentation.id;
  end if;

  perform app_private.insert_quote_presentation_event(
    v_presentation.id,
    v_version.id,
    null,
    v_version.empresa_id,
    v_version.quote_id,
    v_version.version_number,
    'revoked',
    coalesce(v_reason, concat('Versao V', v_version.version_number::text, ' revogada.')),
    v_actor_uid,
    v_actor_name,
    jsonb_build_object('reason', v_reason)
  );

  return query
  select
    v_version.id as version_id,
    v_version.status as status,
    v_version.revoked_at as revoked_at;
end;
$$;
