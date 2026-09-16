create or replace function public.delete_client_contract(
  p_client_id text,
  p_contract_id text,
  p_actor_uid text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_client_id text := nullif(btrim(coalesce(p_client_id, '')), '');
  v_contract_id text := nullif(btrim(coalesce(p_contract_id, '')), '');
  v_contract public.client_contracts%rowtype;
  v_deleted_at timestamptz := timezone('utc', now());
  v_deleted_pieces integer := 0;
  v_has_history boolean := false;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if app_private.current_user_access_role() not in ('coordenador', 'administrativo') then
    raise exception 'Sem permissao para excluir contratos.';
  end if;

  if v_client_id is null or v_contract_id is null then
    raise exception 'Contrato nao encontrado.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ':' || v_contract_id || ':delete-client-contract'));

  select *
  into v_contract
  from public.client_contracts
  where id = v_contract_id
    and client_id = v_client_id
    and empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;

  select exists (
    select 1
    from public.employee_activity_sessions
    where empresa_id = v_empresa_id
      and client_id = v_client_id
      and contract_id = v_contract_id
    limit 1
  ) or exists (
    select 1
    from public.installations
    where empresa_id = v_empresa_id
      and client_id = v_client_id
      and contract_id = v_contract_id
      and deleted_at is null
    limit 1
  ) or exists (
    select 1
    from public.crisis_clients
    where empresa_id = v_empresa_id
      and client_id = v_client_id
      and contract_id = v_contract_id
      and deleted_at is null
    limit 1
  )
  into v_has_history;

  if v_contract.deleted_at is not null then
    return jsonb_build_object(
      'deleted', false,
      'alreadyDeleted', true,
      'historyPreserved', v_has_history,
      'deletedPieces', 0
    );
  end if;

  update public.client_contract_pieces
  set deleted_at = v_deleted_at
  where empresa_id = v_empresa_id
    and contract_id = v_contract_id
    and deleted_at is null;

  get diagnostics v_deleted_pieces = row_count;

  update public.client_contracts
  set deleted_at = v_deleted_at,
      deleted_by_uid = nullif(btrim(coalesce(p_actor_uid, auth.uid()::text)), ''),
      deleted_by_name = left(btrim(coalesce(p_actor_name, '')), 120)
  where id = v_contract_id
    and client_id = v_client_id
    and empresa_id = v_empresa_id
    and deleted_at is null;

  return jsonb_build_object(
    'deleted', true,
    'alreadyDeleted', false,
    'historyPreserved', v_has_history,
    'deletedPieces', v_deleted_pieces
  );
end;
$$;

revoke all on function public.delete_client_contract(text, text, text, text) from public;
revoke all on function public.delete_client_contract(text, text, text, text) from anon;
grant execute on function public.delete_client_contract(text, text, text, text) to authenticated;
