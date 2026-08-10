create or replace function public.mark_quote_presentation_shared(
  p_version_id uuid,
  p_actor_name text default null
)
returns table (
  version_id uuid,
  status text,
  shared_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := auth.uid()::text;
  v_actor_name text := nullif(btrim(coalesce(p_actor_name, '')), '');
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_next_status text;
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria para compartilhar a proposta.';
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

  v_next_status := app_private.quote_presentation_status_row(
    v_version.status,
    v_version.valid_until,
    v_version.revoked_at,
    v_version.accepted_at
  );

  if v_next_status = 'GERADO' then
    v_next_status := 'COMPARTILHADO';
  end if;

  update public.quote_presentation_versions
  set status = v_next_status,
      shared_at = coalesce(public.quote_presentation_versions.shared_at, timezone('utc', now()))
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
    set latest_status = v_version.status
    where id = v_presentation.id;
  end if;

  if v_next_status = 'COMPARTILHADO' then
    perform app_private.insert_quote_presentation_event(
      v_presentation.id,
      v_version.id,
      null,
      v_version.empresa_id,
      v_version.quote_id,
      v_version.version_number,
      'shared',
      concat('Link da versao V', v_version.version_number::text, ' compartilhado.'),
      v_actor_uid,
      v_actor_name,
      '{}'::jsonb
    );
  end if;

  return query
  select
    v_version.id as version_id,
    v_version.status as status,
    v_version.shared_at as shared_at;
end;
$$;
