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

insert into public.empresas (id, name, slug)
values ('warehouse-smoke-other', 'Warehouse Smoke Other', 'warehouse-smoke-other')
on conflict (id) do nothing;

insert into public.clients (id, empresa_id, name, phone, address, notes)
values ('warehouse-smoke-client-other', 'warehouse-smoke-other', 'Cliente outra empresa', '', '', 'rollback smoke test');

insert into public.quotes (
  id, empresa_id, client_id, client_name, phone, address, environment, responsible,
  payment_method, delivery_days, commercial_notes, status, total_area, total_price,
  pieces, cutouts, created_by
) values (
  'warehouse-smoke-quote-other', 'warehouse-smoke-other', 'warehouse-smoke-client-other', 'Cliente outra empresa', '', '', 'Obra outra empresa', 'Teste',
  '', 0, '', 'Orcamento', 0, 0, '[]'::jsonb, '{}'::jsonb, 'smoke'
);

insert into public.employees (id, empresa_id, name, role, active, created_at)
values ('warehouse-smoke-other-employee', 'warehouse-smoke-other', 'Funcionario outra empresa', 'Instalador', true, timezone('utc', now()));

set local role authenticated;

do $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_other_empresa_id text := 'warehouse-smoke-other';
  v_actor_name text;
  v_employee_id text;
  v_other_employee_id text := 'warehouse-smoke-other-employee';
  v_client_id text := 'warehouse-smoke-client';
  v_client_alt_id text := 'warehouse-smoke-client-alt';
  v_other_client_id text := 'warehouse-smoke-client-other';
  v_quote_id text := 'warehouse-smoke-quote';
  v_quote_alt_id text := 'warehouse-smoke-quote-alt';
  v_other_quote_id text := 'warehouse-smoke-quote-other';
  v_product_id uuid;
  v_other_category_product_id uuid;
  v_tool_product_id uuid;
  v_tool_id uuid;
  v_purchase_id uuid;
  v_purchase_spoof_id uuid;
  v_balance numeric;
  v_snapshot numeric;
  v_net_quantity numeric;
  v_net_cost numeric;
  v_name_check text;
  v_uid_check text;
  v_count integer;
begin
  if v_empresa_id is null then
    raise exception 'Smoke test requires an authenticated company user.';
  end if;

  select coalesce(nome, name, email)
  into v_actor_name
  from public.users
  where auth_user_id = auth.uid()
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
  values
    (v_client_id, v_empresa_id, 'Cliente teste almoxarifado', '', '', 'rollback smoke test'),
    (v_client_alt_id, v_empresa_id, 'Cliente alternativo almoxarifado', '', '', 'rollback smoke test');

  insert into public.quotes (
    id, empresa_id, client_id, client_name, phone, address, environment, responsible,
    payment_method, delivery_days, commercial_notes, status, total_area, total_price,
    pieces, cutouts, created_by
  ) values
  (
    v_quote_id, v_empresa_id, v_client_id, 'Cliente teste almoxarifado', '', '', 'Obra teste', 'Teste',
    '', 0, '', 'Orcamento', 0, 0, '[]'::jsonb, '{}'::jsonb, v_actor_name
  ),
  (
    v_quote_alt_id, v_empresa_id, v_client_alt_id, 'Cliente alternativo almoxarifado', '', '', 'Obra alternativa', 'Teste',
    '', 0, '', 'Orcamento', 0, 0, '[]'::jsonb, '{}'::jsonb, v_actor_name
  );

  insert into public.warehouse_products (
    empresa_id, name, category, item_type, unit, minimum_quantity, unit_cost, created_by_uid
  ) values (
    v_empresa_id, 'Silicone smoke test', 'Colagem', 'CONSUMIVEL', 'un', 2, 20, 'spoofed-user'
  ) returning id, created_by_uid into v_product_id, v_uid_check;

  if v_uid_check <> auth.uid()::text then
    raise exception 'Product author spoofing was not blocked.';
  end if;

  perform public.warehouse_record_movement(
    v_product_id, 'ENTRADA', 20, null, null, null, null,
    'Estoque inicial de teste', null, 'Nome Forjado'
  );

  select performed_by_name into v_name_check
  from public.warehouse_movements
  where product_id = v_product_id and movement_type = 'ENTRADA'
  order by created_at desc
  limit 1;

  if v_name_check <> v_actor_name then
    raise exception 'RPC author spoofing was not blocked.';
  end if;

  begin
    perform public.warehouse_record_movement(
      v_product_id, 'SAIDA', 1, v_employee_id, v_client_id, v_quote_alt_id, v_quote_alt_id,
      'Cliente e obra incompatíveis', null, 'Nome Forjado'
    );
    raise exception 'Client/work mismatch was not blocked.';
  exception when others then
    if sqlerrm = 'Client/work mismatch was not blocked.' then raise; end if;
  end;

  begin
    perform public.warehouse_record_movement(
      v_product_id, 'SAIDA', 1, v_employee_id, v_other_client_id, null, null,
      'Cliente de outra empresa', null, 'Nome Forjado'
    );
    raise exception 'Cross-company client was not blocked.';
  exception when others then
    if sqlerrm = 'Cross-company client was not blocked.' then raise; end if;
  end;

  perform public.warehouse_record_movement(
    v_product_id, 'SAIDA', 10, v_employee_id, v_client_id, v_quote_id, v_quote_id,
    'Consumo de teste', null, 'Nome Forjado'
  );

  perform public.warehouse_record_movement(
    v_product_id, 'DEVOLUCAO', 3, null, v_client_id, v_quote_id, v_quote_id,
    'Devolucao parcial de teste', null, 'Nome Forjado'
  );

  select current_quantity into v_balance from public.warehouse_products where id = v_product_id;
  if v_balance <> 13 then raise exception 'Expected balance 13, got %', v_balance; end if;

  begin
    perform public.warehouse_record_movement(
      v_product_id, 'DEVOLUCAO', 8, null, v_client_id, v_quote_id, v_quote_id,
      'Devolucao excessiva', null, 'Nome Forjado'
    );
    raise exception 'Excessive return was not blocked.';
  exception when others then
    if sqlerrm = 'Excessive return was not blocked.' then raise; end if;
  end;

  update public.warehouse_products set unit_cost = 30 where id = v_product_id;

  select unit_cost_snapshot into v_snapshot
  from public.warehouse_movements
  where product_id = v_product_id and movement_type = 'SAIDA'
  order by created_at desc
  limit 1;

  if v_snapshot <> 20 then raise exception 'Historical cost snapshot changed.'; end if;

  select total_quantity, total_cost
  into v_net_quantity, v_net_cost
  from public.warehouse_work_consumption(v_quote_id)
  where product_id = v_product_id;

  if v_net_quantity <> 7 then raise exception 'Expected net work quantity 7, got %', v_net_quantity; end if;
  if v_net_cost <> 140 then raise exception 'Expected net work cost 140, got %', v_net_cost; end if;

  insert into public.warehouse_products (
    empresa_id, name, category, item_type, unit, minimum_quantity, unit_cost, created_by_uid
  ) values (
    v_empresa_id, 'Disco smoke test', 'Corte', 'CONSUMIVEL', 'un', 1, 5, 'spoofed-user'
  ) returning id into v_other_category_product_id;

  perform public.warehouse_record_movement(
    v_other_category_product_id, 'ENTRADA', 5, null, null, null, null,
    'Estoque inicial corte', null, 'Nome Forjado'
  );

  perform public.warehouse_record_movement(
    v_other_category_product_id, 'SAIDA', 1, v_employee_id, v_client_id, v_quote_id, v_quote_id,
    'Consumo de corte', null, 'Nome Forjado'
  );

  select count(*) into v_count
  from public.warehouse_list_movements(0, 50, null, null, null, null, null, 'Colagem', null, null)
  where product ->> 'category' <> 'Colagem';

  if v_count <> 0 then
    raise exception 'Category filter returned movements outside Colagem.';
  end if;

  select count(*) into v_count
  from public.warehouse_list_movements(0, 50, null, null, null, null, null, 'Colagem', null, null);

  if v_count < 3 then
    raise exception 'Category filter did not return the expected Colagem movements.';
  end if;

  insert into public.warehouse_products (
    empresa_id, name, category, item_type, unit, minimum_quantity, created_by_uid
  ) values (
    v_empresa_id, 'Politriz smoke test', 'Ferramentas', 'FERRAMENTA', 'un', 0, 'spoofed-user'
  ) returning id into v_tool_product_id;

  insert into public.warehouse_tools (empresa_id, product_id, asset_code, condition, created_by_uid)
  values (v_empresa_id, v_tool_product_id, 'SMOKE-001', 'Boa', 'spoofed-user')
  returning id, created_by_uid into v_tool_id, v_uid_check;

  if v_uid_check <> auth.uid()::text then
    raise exception 'Tool author spoofing was not blocked.';
  end if;

  begin
    perform public.warehouse_checkout_tool(v_tool_id, null, v_client_id, v_quote_id, null, null, 'Nome Forjado');
    raise exception 'Tool checkout without employee was not blocked.';
  exception when others then
    if sqlerrm = 'Tool checkout without employee was not blocked.' then raise; end if;
  end;

  begin
    perform public.warehouse_checkout_tool(v_tool_id, v_other_employee_id, v_client_id, v_quote_id, null, null, 'Nome Forjado');
    raise exception 'Cross-company employee was not blocked.';
  exception when others then
    if sqlerrm = 'Cross-company employee was not blocked.' then raise; end if;
  end;

  perform public.warehouse_checkout_tool(v_tool_id, v_employee_id, v_client_id, v_quote_id, null, null, 'Nome Forjado');

  if (select status from public.warehouse_tools where id = v_tool_id) <> 'EM_USO' then
    raise exception 'Tool checkout did not set EM_USO.';
  end if;

  select performed_by_name into v_name_check
  from public.warehouse_tool_movements
  where tool_id = v_tool_id and movement_type = 'RETIRADA'
  order by created_at desc
  limit 1;

  if v_name_check <> v_actor_name then
    raise exception 'Tool movement author spoofing was not blocked.';
  end if;

  perform public.warehouse_return_tool(v_tool_id, 'Boa', null, 'Nome Forjado');

  if (select status from public.warehouse_tools where id = v_tool_id) <> 'DISPONIVEL' then
    raise exception 'Tool return did not set DISPONIVEL.';
  end if;
  if (select count(*) from public.warehouse_tool_movements where tool_id = v_tool_id) <> 2 then
    raise exception 'Tool history was not preserved.';
  end if;

  insert into public.warehouse_purchase_items (
    empresa_id, product_id, requested_quantity, status, requested_by_uid, requested_by_name
  ) values (
    v_empresa_id, v_product_id, 5, 'COMPRADO', 'spoofed-user', 'Nome Forjado'
  ) returning id, requested_by_uid, requested_by_name into v_purchase_spoof_id, v_uid_check, v_name_check;

  if v_uid_check <> auth.uid()::text or v_name_check <> v_actor_name then
    raise exception 'Purchase author spoofing was not blocked.';
  end if;

  insert into public.warehouse_purchase_items (
    empresa_id, product_id, requested_quantity, status, requested_by_uid, requested_by_name
  ) values (
    v_empresa_id, v_product_id, 5, 'COMPRADO', auth.uid()::text, v_actor_name
  ) returning id into v_purchase_id;

  begin
    perform public.warehouse_receive_purchase(v_purchase_id, 4, 'Nome Forjado');
    raise exception 'Partial receipt was not blocked.';
  exception when others then
    if sqlerrm = 'Partial receipt was not blocked.' then raise; end if;
  end;

  perform public.warehouse_receive_purchase(v_purchase_id, 5, 'Nome Forjado');

  if (select current_quantity from public.warehouse_products where id = v_product_id) <> 18 then
    raise exception 'Purchase receipt did not update stock atomically.';
  end if;
  if (select status from public.warehouse_purchase_items where id = v_purchase_id) <> 'RECEBIDO' then
    raise exception 'Purchase receipt did not update status.';
  end if;
  if (select received_by_name from public.warehouse_purchase_items where id = v_purchase_id) <> v_actor_name then
    raise exception 'Purchase receipt author spoofing was not blocked.';
  end if;

  begin
    perform public.warehouse_receive_purchase(v_purchase_id, 5, 'Nome Forjado');
    raise exception 'Second receipt was not blocked.';
  exception when others then
    if sqlerrm = 'Second receipt was not blocked.' then raise; end if;
  end;
end;
$$;

rollback;
