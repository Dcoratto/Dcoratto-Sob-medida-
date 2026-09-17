create or replace function public.repair_historical_contract_masonry_items(
  p_empresa_id text,
  p_contract_id text,
  p_masonry_total numeric,
  p_pieces jsonb,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := nullif(btrim(coalesce(p_empresa_id, '')), '');
  v_contract_id text := nullif(btrim(coalesce(p_contract_id, '')), '');
  v_contract public.client_contracts%rowtype;
  v_piece jsonb;
  v_piece_label text;
  v_piece_total numeric(14,2);
  v_piece_count integer;
  v_piece_financial_rows jsonb := '[]'::jsonb;
  v_index integer := 0;
  v_reference_count integer := 0;
  v_old_piece_ids text[];
begin
  if v_empresa_id is null or v_contract_id is null then
    raise exception 'Contrato e empresa obrigatorios.';
  end if;

  if p_masonry_total is null or p_masonry_total < 0 or p_masonry_total > 999999999999.99 then
    raise exception 'Total da marmoraria invalido.';
  end if;

  if jsonb_typeof(coalesce(p_pieces, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de pecas invalida.';
  end if;

  v_piece_count := jsonb_array_length(coalesce(p_pieces, '[]'::jsonb));
  if v_piece_count = 0 or v_piece_count > 200 then
    raise exception 'Reparo exige ao menos uma peca de marmoraria valida.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ':' || v_contract_id || ':historical-masonry-repair'));

  select *
  into v_contract
  from public.client_contracts
  where id = v_contract_id
    and empresa_id = v_empresa_id
    and deleted_at is null
  for update;

  if v_contract.id is null then
    raise exception 'Contrato nao encontrado.';
  end if;

  if v_contract.source_document #>> '{historicalImport,phase}' <> 'FASE_2' then
    raise exception 'Contrato nao pertence a importacao historica FASE_2.';
  end if;

  select coalesce(array_agg(id), '{}')
  into v_old_piece_ids
  from public.client_contract_pieces
  where empresa_id = v_empresa_id
    and contract_id = v_contract_id
    and deleted_at is null
    and source = 'pdf_import';

  select count(*)
  into v_reference_count
  from (
    select 1
    from public.employee_activity_sessions
    where contract_id = v_contract_id
       or piece_id = any(v_old_piece_ids)
    union all
    select 1
    from public.crisis_clients
    where contract_id = v_contract_id
       or piece_id = any(v_old_piece_ids)
    union all
    select 1
    from public.installations
    where contract_id = v_contract_id
  ) refs;

  if v_reference_count > 0 then
    raise exception 'Contrato possui referencias operacionais e nao pode ser reparado automaticamente.';
  end if;

  update public.client_contract_pieces
  set deleted_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where empresa_id = v_empresa_id
    and contract_id = v_contract_id
    and deleted_at is null
    and source = 'pdf_import';

  for v_piece in select value from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb))
  loop
    v_index := v_index + 1;
    v_piece_label := left(btrim(coalesce(v_piece ->> 'label', v_piece ->> 'name', '')), 180);
    v_piece_total := null;

    if length(v_piece_label) = 0 then
      raise exception 'Peca sem descricao.';
    end if;

    if nullif(btrim(v_piece ->> 'value'), '') is not null then
      begin
        v_piece_total := (v_piece ->> 'value')::numeric;
      exception
        when invalid_text_representation then
          raise exception 'Valor da peca invalido.';
      end;
    end if;

    if v_piece_total is null or v_piece_total < 0 or v_piece_total > 999999999999.99 then
      raise exception 'Valor da peca invalido.';
    end if;

    v_piece_financial_rows := v_piece_financial_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'label', v_piece_label,
      'sortOrder', v_index,
      'value', v_piece_total,
      'sourceItemNumber', nullif(v_piece ->> 'itemNumber', ''),
      'supplier', nullif(v_piece ->> 'supplier', ''),
      'line', nullif(v_piece ->> 'line', '')
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
        jsonb_set(
          jsonb_set(
            source_document,
            '{financial,contractTotal}',
            to_jsonb(p_masonry_total),
            true
          ),
          '{financial,pieces}',
          v_piece_financial_rows,
          true
        ),
        '{historicalImport,masonryRepair}',
        jsonb_strip_nulls(coalesce(p_audit, '{}'::jsonb) || jsonb_build_object(
          'repairedAt', timezone('utc'::text, now()),
          'masonryPieceCount', v_piece_count,
          'masonryTotal', p_masonry_total
        )),
        true
      ),
      updated_at = timezone('utc'::text, now())
  where id = v_contract_id
    and empresa_id = v_empresa_id;

  return jsonb_build_object(
    'status', 'CORRECTED',
    'contractId', v_contract_id,
    'pieceCount', v_piece_count,
    'masonryTotal', p_masonry_total
  );
end;
$$;

revoke all on function public.repair_historical_contract_masonry_items(text, text, numeric, jsonb, jsonb) from public;
revoke all on function public.repair_historical_contract_masonry_items(text, text, numeric, jsonb, jsonb) from anon;
revoke all on function public.repair_historical_contract_masonry_items(text, text, numeric, jsonb, jsonb) from authenticated;
grant execute on function public.repair_historical_contract_masonry_items(text, text, numeric, jsonb, jsonb) to service_role;
