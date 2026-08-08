begin;

select set_config(
  'request.jwt.claim.sub',
  (
    select auth_user_id::text
    from public.users
    where auth_user_id is not null
      and role in ('administrativo', 'coordenador')
      and blocked is not true
    order by updated_at desc
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_name text;
  v_employee_id text;
  v_client_id text := 'warehouse-smoke-client';
  v_quote_id text := 'warehouse-smoke-quote';
  v_product_id uuid;
  v_tool_product_id uuid;
  v_tool_id uuid;
  v_purchase_id uuid;
  v_balance numeric;
  v_snapshot numeric;
  v_count integer;
begin
  if v_empresa_id is null then
    raise exception 'Smoke test requires an authenticated company user.';
  end if;

  select coalesce(nome, name, email), id
  into v_actor_name, v_employee_id
  from public.users
  where auth_user_id = (select auth.uid())
    and empresa_id = v_empresa_id
  limit 1;

  select id into v_employee_id
  from public.employees
  where empresa_id = v_empresa_id and active
  order by name
  limit 1;

  if v_employee_id is null then
    raise exception 'Smoke test requires one active employee.';
  end if;

  insert into public.clients (id, empresa_id, name, phone, address, notes)
  values (v_client_id, v_empresa_id, 'Cliente teste almoxarifado', '', '', 'rollback smoke test');

  insert into public.quotes (
    id, empresa_id, client_id, client_name, phone, address, environment, responsible,
    payment_method, delivery_days, commercial_notes, status, total_area, total_price,
    pieces, cutouts, created_by
  ) values (
    v_quote_id, v_empresa_id, v_client_id, 'Cliente teste almoxarifado', '', '', 'Obra teste', 'Teste',
    '', 0, '', 'Orcamento', 0, 0, '[]'::jsonb, '{}'::jsonb, v_actor_name
  );

  insert into public.warehouse_products (
    empresa_id, name, category, item_type, unit, minimum_quantity, unit_cost, created_by_uid
  ) values (
    v_empresa_id, 'Silicone smoke test', 'Colagem', 'CONSUMIVEL', 'un', 2, 20, (select auth.uid())::text
  ) returning id into v_product_id;

  perform public.warehouse_record_movement(
    v_product_id, 'ENTRADA', 10, null, null, null, null,
    'Estoque inicial de teste', null, v_actor_name
  );

  perform public.warehouse_record_movement(
    v_product_id, 'SAIDA', 3, v_employee_id, v_client_id, v_quote_id, v_quote_id,
    'Consumo de teste', null, v_actor_name
  );

  select current_quantity into v_balance from public.warehouse_products where id = v_product_id;
  if v_balance <> 7 then raise exception 'Expected balance 7, got %', v_balance; end if;

  begin
    perform public.warehouse_record_movement(
      v_product_id, 'SAIDA', 8, v_employee_id, null, null, null,
      'Teste sem saldo', null, v_actor_name
    );
    raise exception 'Insufficient balance was not blocked.';
  exception when others then
    if sqlerrm = 'Insufficient balance was not blocked.' then raise; end if;
  end;

  select current_quantity into v_balance from public.warehouse_products where id = v_product_id;
  if v_balance <> 7 then raise exception 'Balance changed after blocked withdrawal.'; end if;

  update public.warehouse_products set unit_cost = 30 where id = v_product_id;
  select unit_cost_snapshot into v_snapshot
  from public.warehouse_movements
  where product_id = v_product_id and movement_type = 'SAIDA'
  order by created_at desc limit 1;
  if v_snapshot <> 20 then raise exception 'Historical cost snapshot changed.'; end if;

  select count(*) into v_count from public.warehouse_work_consumption(v_quote_id);
  if v_count <> 1 then raise exception 'Work consumption report did not return the withdrawal.'; end if;

  insert into public.warehouse_products (
    empresa_id, name, category, item_type, unit, minimum_quantity, created_by_uid
  ) values (
    v_empresa_id, 'Politriz smoke test', 'Ferramentas', 'FERRAMENTA', 'un', 0, (select auth.uid())::text
  ) returning id into v_tool_product_id;

  insert into public.warehouse_tools (empresa_id, product_id, asset_code, condition, created_by_uid)
  values (v_empresa_id, v_tool_product_id, 'SMOKE-001', 'Boa', (select auth.uid())::text)
  returning id into v_tool_id;

  perform public.warehouse_checkout_tool(v_tool_id, v_employee_id, v_client_id, v_quote_id, null, null, v_actor_name);
  if (select status from public.warehouse_tools where id = v_tool_id) <> 'EM_USO' then
    raise exception 'Tool checkout did not set EM_USO.';
  end if;

  perform public.warehouse_return_tool(v_tool_id, 'Boa', null, v_actor_name);
  if (select status from public.warehouse_tools where id = v_tool_id) <> 'DISPONIVEL' then
    raise exception 'Tool return did not set DISPONIVEL.';
  end if;
  if (select count(*) from public.warehouse_tool_movements where tool_id = v_tool_id) <> 2 then
    raise exception 'Tool history was not preserved.';
  end if;

  insert into public.warehouse_purchase_items (
    empresa_id, product_id, requested_quantity, status, requested_by_uid, requested_by_name
  ) values (
    v_empresa_id, v_product_id, 5, 'COMPRADO', (select auth.uid())::text, v_actor_name
  ) returning id into v_purchase_id;

  perform public.warehouse_receive_purchase(v_purchase_id, 5, v_actor_name);
  if (select current_quantity from public.warehouse_products where id = v_product_id) <> 12 then
    raise exception 'Purchase receipt did not update stock.';
  end if;
  if (select status from public.warehouse_purchase_items where id = v_purchase_id) <> 'RECEBIDO' then
    raise exception 'Purchase receipt did not update status.';
  end if;
end;
$$;

rollback;
