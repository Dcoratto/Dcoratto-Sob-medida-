create or replace function public.confirm_client_contract_import(
  p_client_id text,
  p_contract_number text,
  p_contract_date date,
  p_quote_id text,
  p_contract_total numeric,
  p_pieces jsonb,
  p_actor_uid text,
  p_actor_name text
)
returns text
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_client_id text := nullif(btrim(coalesce(p_client_id, '')), '');
  v_contract_number text := nullif(btrim(coalesce(p_contract_number, '')), '');
  v_quote_id text := nullif(btrim(coalesce(p_quote_id, '')), '');
  v_quote_client_id text;
  v_quote_total numeric(14,2);
  v_contract_total numeric(14,2) := p_contract_total;
  v_contract_id text;
  v_piece jsonb;
  v_piece_label text;
  v_piece_quote_piece_id text;
  v_piece_total numeric(14,2);
  v_piece_count integer;
  v_piece_financial_rows jsonb := '[]'::jsonb;
  v_index integer := 0;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if app_private.current_user_access_role() not in ('coordenador', 'administrativo') then
    raise exception 'Sem permissao para confirmar contratos.';
  end if;

  if v_client_id is null then
    raise exception 'Selecione um cliente.';
  end if;

  if v_contract_number is null or length(v_contract_number) > 80 then
    raise exception 'Informe o numero do contrato para conferencia manual.';
  end if;

  if v_contract_total is not null and (v_contract_total < 0 or v_contract_total > 999999999999.99) then
    raise exception 'Valor do contrato invalido.';
  end if;

  if not exists (select 1 from public.clients where id = v_client_id and empresa_id = v_empresa_id) then
    raise exception 'Cliente nao encontrado nesta empresa.';
  end if;

  if v_quote_id is not null then
    select client_id, total_price
    into v_quote_client_id, v_quote_total
    from public.quotes
    where id = v_quote_id and empresa_id = v_empresa_id;

    if v_quote_client_id is null then
      raise exception 'Orcamento vinculado nao encontrado.';
    end if;

    if v_quote_client_id <> v_client_id then
      raise exception 'O orcamento informado nao pertence ao cliente selecionado.';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_pieces, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de pecas invalida.';
  end if;

  v_piece_count := jsonb_array_length(coalesce(p_pieces, '[]'::jsonb));
  if v_piece_count = 0 or v_piece_count > 200 then
    raise exception 'Revise as pecas antes de confirmar o contrato.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ':' || lower(v_contract_number) || ':client-contract'));

  insert into public.client_contracts (
    id, empresa_id, client_id, quote_id, contract_number, contract_date, status, source, review_status, source_document, created_by_uid, created_by_name
  )
  values (
    app_private.make_entity_id(),
    v_empresa_id,
    v_client_id,
    v_quote_id,
    v_contract_number,
    p_contract_date,
    'active',
    'pdf_import',
    'confirmed',
    jsonb_strip_nulls(jsonb_build_object(
      'financial', jsonb_build_object(
        'contractTotal', coalesce(v_quote_total, v_contract_total)
      )
    )),
    nullif(btrim(coalesce(p_actor_uid, auth.uid()::text)), ''),
    left(btrim(coalesce(p_actor_name, '')), 120)
  )
  returning id into v_contract_id;

  for v_piece in select value from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb))
  loop
    v_index := v_index + 1;
    v_piece_label := btrim(coalesce(v_piece ->> 'label', v_piece ->> 'name', ''));
    v_piece_quote_piece_id := nullif(left(btrim(coalesce(v_piece ->> 'quotePieceId', v_piece ->> 'id', '')), 80), '');
    v_piece_total := null;

    if length(v_piece_label) = 0 or length(v_piece_label) > 180 then
      raise exception 'Revise as pecas antes de confirmar o contrato.';
    end if;

    if v_piece ? 'value' and nullif(btrim(v_piece ->> 'value'), '') is not null then
      begin
        v_piece_total := (v_piece ->> 'value')::numeric;
      exception
        when invalid_text_representation then
          raise exception 'Valor da peca invalido.';
      end;

      if v_piece_total < 0 or v_piece_total > 999999999999.99 then
        raise exception 'Valor da peca invalido.';
      end if;
    end if;

    v_piece_financial_rows := v_piece_financial_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'quotePieceId', v_piece_quote_piece_id,
      'label', v_piece_label,
      'sortOrder', v_index,
      'value', v_piece_total
    )));

    insert into public.client_contract_pieces (
      id, empresa_id, contract_id, quote_piece_id, piece_label, piece_type_key, sort_order, source
    )
    values (
      app_private.make_entity_id(),
      v_empresa_id,
      v_contract_id,
      v_piece_quote_piece_id,
      v_piece_label,
      nullif(left(btrim(coalesce(v_piece ->> 'pieceTypeKey', '')), 80), ''),
      v_index,
      'pdf_import'
    );
  end loop;

  update public.client_contracts
  set source_document = jsonb_set(
    source_document,
    '{financial,pieces}',
    v_piece_financial_rows,
    true
  )
  where id = v_contract_id
    and empresa_id = v_empresa_id;

  return v_contract_id;
exception
  when unique_violation then
    raise exception 'Contrato ja cadastrado para esta empresa.';
end;
$$;

create or replace function public.confirm_client_contract_import(
  p_client_id text,
  p_contract_number text,
  p_contract_date date,
  p_quote_id text,
  p_pieces jsonb,
  p_actor_uid text,
  p_actor_name text
)
returns text
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select public.confirm_client_contract_import(
    p_client_id,
    p_contract_number,
    p_contract_date,
    p_quote_id,
    null::numeric,
    p_pieces,
    p_actor_uid,
    p_actor_name
  );
$$;

revoke all on function public.confirm_client_contract_import(text, text, date, text, numeric, jsonb, text, text) from public;
revoke all on function public.confirm_client_contract_import(text, text, date, text, numeric, jsonb, text, text) from anon;
grant execute on function public.confirm_client_contract_import(text, text, date, text, numeric, jsonb, text, text) to authenticated;

revoke all on function public.confirm_client_contract_import(text, text, date, text, jsonb, text, text) from public;
revoke all on function public.confirm_client_contract_import(text, text, date, text, jsonb, text, text) from anon;
grant execute on function public.confirm_client_contract_import(text, text, date, text, jsonb, text, text) to authenticated;
