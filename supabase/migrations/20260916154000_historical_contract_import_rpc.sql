create or replace function public.import_historical_client_contract(
  p_empresa_id text,
  p_client_id text,
  p_create_client boolean,
  p_client jsonb,
  p_contract_number text,
  p_contract_date date,
  p_contract_total numeric,
  p_pieces jsonb,
  p_source_document jsonb,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := nullif(btrim(coalesce(p_empresa_id, '')), '');
  v_client_id text := nullif(btrim(coalesce(p_client_id, '')), '');
  v_client_name text := left(btrim(coalesce(p_client ->> 'name', '')), 180);
  v_contract_number text := nullif(btrim(coalesce(p_contract_number, '')), '');
  v_contract_id text;
  v_piece jsonb;
  v_piece_label text;
  v_piece_total numeric(14,2);
  v_piece_count integer;
  v_piece_financial_rows jsonb := '[]'::jsonb;
  v_index integer := 0;
  v_created_client boolean := false;
  v_existing_contract public.client_contracts%rowtype;
begin
  if v_empresa_id is null then
    raise exception 'Empresa obrigatoria.';
  end if;

  if v_contract_number is null or length(v_contract_number) > 80 then
    raise exception 'Numero do contrato invalido.';
  end if;

  if p_contract_total is not null and (p_contract_total < 0 or p_contract_total > 999999999999.99) then
    raise exception 'Valor do contrato invalido.';
  end if;

  if jsonb_typeof(coalesce(p_pieces, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de pecas invalida.';
  end if;

  v_piece_count := jsonb_array_length(coalesce(p_pieces, '[]'::jsonb));
  if v_piece_count = 0 or v_piece_count > 200 then
    raise exception 'Revise as pecas antes de importar o contrato.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ':' || lower(v_contract_number) || ':historical-contract-import'));

  select *
  into v_existing_contract
  from public.client_contracts
  where empresa_id = v_empresa_id
    and lower(contract_number) = lower(v_contract_number)
  order by deleted_at nulls first, created_at desc
  limit 1;

  if v_existing_contract.id is not null then
    if v_existing_contract.deleted_at is not null then
      return jsonb_build_object(
        'status', 'SOFT_DELETED_SKIPPED',
        'contractId', v_existing_contract.id,
        'clientId', v_existing_contract.client_id
      );
    end if;

    return jsonb_build_object(
      'status', 'ALREADY_EXISTS',
      'contractId', v_existing_contract.id,
      'clientId', v_existing_contract.client_id
    );
  end if;

  if v_client_id is not null then
    if not exists (
      select 1
      from public.clients
      where id = v_client_id
        and empresa_id = v_empresa_id
    ) then
      raise exception 'Cliente informado nao existe nesta empresa.';
    end if;
  elsif p_create_client then
    if length(v_client_name) = 0 then
      raise exception 'Nome do cliente obrigatorio.';
    end if;

    select id
    into v_client_id
    from public.clients
    where empresa_id = v_empresa_id
      and lower(name) = lower(v_client_name)
    order by created_at asc
    limit 1;

    if v_client_id is null then
      insert into public.clients (
        id,
        empresa_id,
        name,
        phone,
        email,
        cpf,
        address,
        city,
        neighborhood,
        notes
      )
      values (
        app_private.make_entity_id(),
        v_empresa_id,
        v_client_name,
        left(btrim(coalesce(p_client ->> 'phone', '')), 80),
        nullif(left(btrim(coalesce(p_client ->> 'email', '')), 180), ''),
        nullif(left(btrim(coalesce(p_client ->> 'cpf', '')), 40), ''),
        left(btrim(coalesce(p_client ->> 'address', '')), 240),
        nullif(left(btrim(coalesce(p_client ->> 'city', '')), 120), ''),
        nullif(left(btrim(coalesce(p_client ->> 'neighborhood', '')), 120), ''),
        'Criado pela importacao historica de contratos.'
      )
      returning id into v_client_id;

      v_created_client := true;
    end if;
  else
    raise exception 'Cliente obrigatorio.';
  end if;

  insert into public.client_contracts (
    id,
    empresa_id,
    client_id,
    quote_id,
    contract_number,
    contract_date,
    status,
    source,
    review_status,
    source_document,
    created_by_name
  )
  values (
    app_private.make_entity_id(),
    v_empresa_id,
    v_client_id,
    null,
    v_contract_number,
    p_contract_date,
    'active',
    'pdf_import',
    'confirmed',
    jsonb_strip_nulls(
      coalesce(p_source_document, '{}'::jsonb)
      || jsonb_build_object(
        'financial',
        jsonb_build_object(
          'contractTotal', p_contract_total
        )
      )
    ),
    left(btrim(coalesce(p_actor_name, '')), 120)
  )
  returning id into v_contract_id;

  for v_piece in select value from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb))
  loop
    v_index := v_index + 1;
    v_piece_label := left(btrim(coalesce(v_piece ->> 'label', v_piece ->> 'name', '')), 180);
    v_piece_total := null;

    if length(v_piece_label) = 0 then
      raise exception 'Peca sem descricao.';
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
      'label', v_piece_label,
      'sortOrder', v_index,
      'value', v_piece_total
    )));

    insert into public.client_contract_pieces (
      id,
      empresa_id,
      contract_id,
      quote_piece_id,
      piece_label,
      piece_type_key,
      sort_order,
      source
    )
    values (
      app_private.make_entity_id(),
      v_empresa_id,
      v_contract_id,
      null,
      v_piece_label,
      null,
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

  return jsonb_build_object(
    'status', 'IMPORTED',
    'contractId', v_contract_id,
    'clientId', v_client_id,
    'clientCreated', v_created_client,
    'pieceCount', v_piece_count
  );
end;
$$;

revoke all on function public.import_historical_client_contract(text, text, boolean, jsonb, text, date, numeric, jsonb, jsonb, text) from public;
revoke all on function public.import_historical_client_contract(text, text, boolean, jsonb, text, date, numeric, jsonb, jsonb, text) from anon;
revoke all on function public.import_historical_client_contract(text, text, boolean, jsonb, text, date, numeric, jsonb, jsonb, text) from authenticated;
grant execute on function public.import_historical_client_contract(text, text, boolean, jsonb, text, date, numeric, jsonb, jsonb, text) to service_role;
