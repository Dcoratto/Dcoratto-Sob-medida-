create or replace function app_private.warehouse_actor_identity()
returns table (
  auth_user_id text,
  empresa_id text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_empresa_id text := app_private.current_empresa_id();
begin
  if v_auth_uid is null then
    raise exception 'Usuário autenticado é obrigatório.';
  end if;

  return query
  select
    v_auth_uid::text,
    u.empresa_id,
    coalesce(nullif(btrim(u.nome), ''), nullif(btrim(u.name), ''), nullif(btrim(u.email), ''), v_auth_uid::text)
  from public.users u
  where (u.auth_user_id = v_auth_uid or u.id = v_auth_uid::text)
    and u.blocked is not true
    and u.empresa_id = v_empresa_id
  order by case when u.auth_user_id = v_auth_uid then 0 else 1 end
  limit 1;

  if not found then
    raise exception 'Usuário do almoxarifado não encontrado para a empresa atual.';
  end if;
end;
$$;

create or replace function app_private.warehouse_assign_insert_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
begin
  select * into v_actor from app_private.warehouse_actor_identity();

  new.empresa_id := v_actor.empresa_id;

  if tg_table_name in ('warehouse_products', 'warehouse_tools') then
    new.created_by_uid := v_actor.auth_user_id;
  elsif tg_table_name = 'warehouse_purchase_items' then
    new.requested_by_uid := v_actor.auth_user_id;
    new.requested_by_name := v_actor.display_name;
  end if;

  return new;
end;
$$;

drop trigger if exists warehouse_products_assign_insert_audit on public.warehouse_products;
create trigger warehouse_products_assign_insert_audit
before insert on public.warehouse_products
for each row execute function app_private.warehouse_assign_insert_audit_fields();

drop trigger if exists warehouse_tools_assign_insert_audit on public.warehouse_tools;
create trigger warehouse_tools_assign_insert_audit
before insert on public.warehouse_tools
for each row execute function app_private.warehouse_assign_insert_audit_fields();

drop trigger if exists warehouse_purchase_items_assign_insert_audit on public.warehouse_purchase_items;
create trigger warehouse_purchase_items_assign_insert_audit
before insert on public.warehouse_purchase_items
for each row execute function app_private.warehouse_assign_insert_audit_fields();

create or replace function public.warehouse_stock_alerts(p_limit integer default 12)
returns table (
  id uuid,
  name text,
  category text,
  unit text,
  current_quantity numeric,
  minimum_quantity numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select
      product.id,
      product.name,
      product.category,
      product.unit,
      product.current_quantity,
      product.minimum_quantity,
      case
        when product.current_quantity = 0 then 0
        when product.current_quantity <= product.minimum_quantity then 1
        else 2
      end as severity
    from public.warehouse_products product
    where product.empresa_id = app_private.current_empresa_id()
      and product.active
      and app_private.warehouse_has_permission('visualizar')
      and (
        product.current_quantity = 0
        or product.current_quantity <= product.minimum_quantity
        or product.current_quantity <= (product.minimum_quantity * 1.25)
      )
  )
  select
    scoped.id,
    scoped.name,
    scoped.category,
    scoped.unit,
    scoped.current_quantity,
    scoped.minimum_quantity
  from scoped
  order by scoped.severity, scoped.current_quantity, scoped.name
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

create or replace function public.warehouse_list_movements(
  p_page integer default 0,
  p_page_size integer default 20,
  p_movement_type text default null,
  p_product_id uuid default null,
  p_employee_id text default null,
  p_client_id text default null,
  p_work_quote_id text default null,
  p_category text default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  id uuid,
  product_id uuid,
  movement_type text,
  quantity numeric,
  previous_quantity numeric,
  resulting_quantity numeric,
  unit_cost_snapshot numeric,
  total_cost_snapshot numeric,
  employee_id text,
  client_id text,
  work_quote_id text,
  quote_id text,
  reason text,
  notes text,
  performed_by_name text,
  created_at timestamptz,
  product jsonb,
  employee jsonb,
  client jsonb,
  work jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      movement.id,
      movement.product_id,
      movement.movement_type,
      movement.quantity,
      movement.previous_quantity,
      movement.resulting_quantity,
      movement.unit_cost_snapshot,
      movement.total_cost_snapshot,
      movement.employee_id,
      movement.client_id,
      movement.work_quote_id,
      movement.quote_id,
      movement.reason,
      movement.notes,
      movement.performed_by_name,
      movement.created_at,
      jsonb_build_object('name', product.name, 'category', product.category, 'unit', product.unit) as product,
      case when employee_ref.id is null then null else jsonb_build_object('name', employee_ref.name) end as employee,
      case when client_ref.id is null then null else jsonb_build_object('name', client_ref.name) end as client,
      case when work_ref.id is null then null else jsonb_build_object('environment', work_ref.environment, 'client_name', work_ref.client_name) end as work
    from public.warehouse_movements movement
    join public.warehouse_products product
      on product.id = movement.product_id
     and product.empresa_id = movement.empresa_id
    left join public.employees employee_ref
      on employee_ref.id = movement.employee_id
     and employee_ref.empresa_id = movement.empresa_id
    left join public.clients client_ref
      on client_ref.id = movement.client_id
     and client_ref.empresa_id = movement.empresa_id
    left join public.quotes work_ref
      on work_ref.id = movement.work_quote_id
     and work_ref.empresa_id = movement.empresa_id
    where movement.empresa_id = app_private.current_empresa_id()
      and app_private.warehouse_has_permission('visualizar')
      and (p_movement_type is null or movement.movement_type = p_movement_type)
      and (p_product_id is null or movement.product_id = p_product_id)
      and (p_employee_id is null or movement.employee_id = p_employee_id)
      and (p_client_id is null or movement.client_id = p_client_id)
      and (p_work_quote_id is null or movement.work_quote_id = p_work_quote_id)
      and (p_category is null or product.category = p_category)
      and (p_date_from is null or movement.created_at >= (p_date_from::timestamp at time zone 'America/Sao_Paulo'))
      and (p_date_to is null or movement.created_at < ((p_date_to + 1)::timestamp at time zone 'America/Sao_Paulo'))
  ),
  counted as (
    select filtered.*, count(*) over() as total_count
    from filtered
  )
  select
    counted.id,
    counted.product_id,
    counted.movement_type,
    counted.quantity,
    counted.previous_quantity,
    counted.resulting_quantity,
    counted.unit_cost_snapshot,
    counted.total_cost_snapshot,
    counted.employee_id,
    counted.client_id,
    counted.work_quote_id,
    counted.quote_id,
    counted.reason,
    counted.notes,
    counted.performed_by_name,
    counted.created_at,
    counted.product,
    counted.employee,
    counted.client,
    counted.work,
    counted.total_count
  from counted
  order by counted.created_at desc
  offset greatest(coalesce(p_page, 0), 0) * least(greatest(coalesce(p_page_size, 20), 1), 50)
  limit least(greatest(coalesce(p_page_size, 20), 1), 50);
$$;

create or replace function public.warehouse_record_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_employee_id text default null,
  p_client_id text default null,
  p_work_quote_id text default null,
  p_quote_id text default null,
  p_reason text default null,
  p_notes text default null,
  p_performed_by_name text default null
)
returns public.warehouse_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_product public.warehouse_products%rowtype;
  v_result public.warehouse_movements%rowtype;
  v_resulting numeric(14,3);
  v_movement_quantity numeric(14,3);
  v_employee_id text := nullif(btrim(coalesce(p_employee_id, '')), '');
  v_client_id text := nullif(btrim(coalesce(p_client_id, '')), '');
  v_work_quote_id text := nullif(btrim(coalesce(p_work_quote_id, '')), '');
  v_quote_id text := nullif(btrim(coalesce(p_quote_id, '')), '');
  v_available_to_return numeric(14,3);
begin
  select * into v_actor from app_private.warehouse_actor_identity();

  if not app_private.warehouse_has_permission('movimentar') then
    raise exception 'Sem permissão para movimentar o almoxarifado.';
  end if;
  if p_movement_type not in ('ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO') then raise exception 'Tipo de movimentação inválido.'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then raise exception 'Quantidade inválida.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 2 and 160 then raise exception 'Motivo inválido.'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Observação excede 1000 caracteres.'; end if;

  select * into v_product from public.warehouse_products
  where id = p_product_id and empresa_id = v_actor.empresa_id and active for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if v_product.item_type <> 'CONSUMIVEL' then raise exception 'Ferramentas devem usar o fluxo próprio.'; end if;
  if p_movement_type = 'SAIDA' and v_employee_id is null then raise exception 'Funcionário obrigatório para retirada.'; end if;

  if not app_private.warehouse_reference_is_valid('public.employees', v_employee_id, v_actor.empresa_id)
    or not app_private.warehouse_reference_is_valid('public.clients', v_client_id, v_actor.empresa_id)
    or not app_private.warehouse_reference_is_valid('public.quotes', v_work_quote_id, v_actor.empresa_id)
    or not app_private.warehouse_reference_is_valid('public.quotes', v_quote_id, v_actor.empresa_id) then
    raise exception 'Referência relacionada inválida.';
  end if;
  if v_client_id is not null and exists (
    select 1 from public.quotes q
    where q.id in (v_work_quote_id, v_quote_id) and q.client_id <> v_client_id
  ) then raise exception 'Cliente, obra e orçamento não correspondem.'; end if;

  if p_movement_type = 'DEVOLUCAO' and (v_client_id is not null or v_work_quote_id is not null or v_quote_id is not null) then
    select coalesce(sum(
      case movement_type
        when 'SAIDA' then quantity
        when 'DEVOLUCAO' then -quantity
        else 0
      end
    ), 0)
    into v_available_to_return
    from public.warehouse_movements
    where empresa_id = v_actor.empresa_id
      and product_id = v_product.id
      and (v_client_id is null or client_id = v_client_id)
      and (v_work_quote_id is null or work_quote_id = v_work_quote_id)
      and (v_quote_id is null or quote_id = v_quote_id)
      and movement_type in ('SAIDA', 'DEVOLUCAO');

    if v_available_to_return <= 0 then
      raise exception 'Não existe saída pendente de devolução para o vínculo informado.';
    end if;
    if p_quantity > v_available_to_return then
      raise exception 'A devolução informada excede o consumo registrado para este vínculo.';
    end if;
  end if;

  if p_movement_type = 'AJUSTE' then
    v_resulting := p_quantity;
    v_movement_quantity := abs(v_product.current_quantity - p_quantity);
    if v_movement_quantity = 0 then raise exception 'O novo saldo deve ser diferente do saldo atual.'; end if;
  else
    v_movement_quantity := p_quantity;
    v_resulting := case
      when p_movement_type in ('ENTRADA', 'DEVOLUCAO') then v_product.current_quantity + p_quantity
      else v_product.current_quantity - p_quantity
    end;
  end if;
  if v_resulting < 0 then raise exception 'Saldo insuficiente.'; end if;

  update public.warehouse_products set current_quantity = v_resulting where id = v_product.id;
  insert into public.warehouse_movements (
    empresa_id, product_id, movement_type, quantity, previous_quantity, resulting_quantity,
    unit_cost_snapshot, total_cost_snapshot, employee_id, client_id, work_quote_id, quote_id,
    reason, notes, performed_by_uid, performed_by_name
  ) values (
    v_actor.empresa_id, v_product.id, p_movement_type, v_movement_quantity, v_product.current_quantity, v_resulting,
    v_product.unit_cost, case when v_product.unit_cost is null then null else round(v_movement_quantity * v_product.unit_cost, 2) end,
    v_employee_id, v_client_id, v_work_quote_id, v_quote_id, btrim(p_reason), nullif(btrim(p_notes), ''),
    v_actor.auth_user_id, v_actor.display_name
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.warehouse_work_consumption(p_work_quote_id text)
returns table (
  product_id uuid,
  product_name text,
  category text,
  unit text,
  total_quantity numeric,
  total_cost numeric,
  withdrawals jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select
      movement.product_id,
      product.name as product_name,
      product.category,
      product.unit,
      case when movement.movement_type = 'DEVOLUCAO' then -movement.quantity else movement.quantity end as net_quantity,
      case when movement.movement_type = 'DEVOLUCAO' then -coalesce(movement.total_cost_snapshot, 0) else coalesce(movement.total_cost_snapshot, 0) end as net_cost,
      movement.created_at,
      movement.movement_type,
      movement.quantity,
      movement.unit_cost_snapshot,
      movement.total_cost_snapshot,
      employee.name as employee_name,
      movement.performed_by_name
    from public.warehouse_movements movement
    join public.warehouse_products product
      on product.id = movement.product_id and product.empresa_id = movement.empresa_id
    left join public.employees employee
      on employee.id = movement.employee_id and employee.empresa_id = movement.empresa_id
    where movement.empresa_id = app_private.current_empresa_id()
      and movement.work_quote_id = p_work_quote_id
      and movement.movement_type in ('SAIDA', 'DEVOLUCAO')
      and app_private.warehouse_has_permission('visualizar')
  )
  select
    scoped.product_id,
    scoped.product_name,
    scoped.category,
    scoped.unit,
    greatest(sum(scoped.net_quantity), 0)::numeric,
    greatest(sum(scoped.net_cost), 0)::numeric,
    jsonb_agg(
      jsonb_build_object(
        'date', scoped.created_at,
        'movement_type', scoped.movement_type,
        'quantity', scoped.net_quantity,
        'unit_cost', scoped.unit_cost_snapshot,
        'total_cost', case when scoped.movement_type = 'DEVOLUCAO' then -coalesce(scoped.total_cost_snapshot, 0) else scoped.total_cost_snapshot end,
        'employee', scoped.employee_name,
        'performed_by', scoped.performed_by_name
      ) order by scoped.created_at desc
    )
  from scoped
  group by scoped.product_id, scoped.product_name, scoped.category, scoped.unit
  order by scoped.product_name;
$$;

create or replace function public.warehouse_checkout_tool(
  p_tool_id uuid,
  p_employee_id text,
  p_client_id text default null,
  p_work_quote_id text default null,
  p_expected_return_at timestamptz default null,
  p_notes text default null,
  p_performed_by_name text default null
)
returns public.warehouse_tools
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_tool public.warehouse_tools%rowtype;
  v_employee_id text := nullif(btrim(coalesce(p_employee_id, '')), '');
  v_client_id text := nullif(btrim(coalesce(p_client_id, '')), '');
  v_work_quote_id text := nullif(btrim(coalesce(p_work_quote_id, '')), '');
begin
  select * into v_actor from app_private.warehouse_actor_identity();

  if not app_private.warehouse_has_permission('movimentar') then raise exception 'Sem permissão para retirar ferramenta.'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Observação excede 1000 caracteres.'; end if;
  if v_employee_id is null then raise exception 'Funcionário obrigatório para retirada.'; end if;

  select * into v_tool from public.warehouse_tools where id = p_tool_id and empresa_id = v_actor.empresa_id and active for update;
  if not found then raise exception 'Ferramenta não encontrada.'; end if;
  if v_tool.status <> 'DISPONIVEL' then raise exception 'Ferramenta não está disponível.'; end if;
  if not app_private.warehouse_reference_is_valid('public.employees', v_employee_id, v_actor.empresa_id)
    or not app_private.warehouse_reference_is_valid('public.clients', v_client_id, v_actor.empresa_id)
    or not app_private.warehouse_reference_is_valid('public.quotes', v_work_quote_id, v_actor.empresa_id) then raise exception 'Referência relacionada inválida.'; end if;
  if v_client_id is not null and v_work_quote_id is not null and not exists (
    select 1 from public.quotes where id = v_work_quote_id and client_id = v_client_id and empresa_id = v_actor.empresa_id
  ) then raise exception 'Cliente e obra não correspondem.'; end if;

  update public.warehouse_tools set status = 'EM_USO', current_employee_id = v_employee_id,
    current_client_id = v_client_id, current_work_quote_id = v_work_quote_id,
    checked_out_at = timezone('utc', now()), expected_return_at = p_expected_return_at
  where id = v_tool.id returning * into v_tool;
  insert into public.warehouse_tool_movements (
    empresa_id, tool_id, movement_type, previous_status, resulting_status, employee_id, client_id,
    work_quote_id, notes, performed_by_uid, performed_by_name
  ) values (
    v_actor.empresa_id, v_tool.id, 'RETIRADA', 'DISPONIVEL', 'EM_USO', v_employee_id, v_client_id,
    v_work_quote_id, nullif(btrim(p_notes), ''), v_actor.auth_user_id, v_actor.display_name
  );
  return v_tool;
end;
$$;

create or replace function public.warehouse_return_tool(
  p_tool_id uuid,
  p_condition text default 'BOA',
  p_notes text default null,
  p_performed_by_name text default null
)
returns public.warehouse_tools
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_tool public.warehouse_tools%rowtype;
begin
  select * into v_actor from app_private.warehouse_actor_identity();

  if not app_private.warehouse_has_permission('movimentar') then raise exception 'Sem permissão para devolver ferramenta.'; end if;
  if char_length(btrim(coalesce(p_condition, ''))) not between 2 and 60 then raise exception 'Estado inválido.'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Observação excede 1000 caracteres.'; end if;
  select * into v_tool from public.warehouse_tools where id = p_tool_id and empresa_id = v_actor.empresa_id and active for update;
  if not found then raise exception 'Ferramenta não encontrada.'; end if;
  if v_tool.status <> 'EM_USO' then raise exception 'Ferramenta não está em uso.'; end if;

  insert into public.warehouse_tool_movements (
    empresa_id, tool_id, movement_type, previous_status, resulting_status, employee_id, client_id,
    work_quote_id, notes, performed_by_uid, performed_by_name
  ) values (
    v_actor.empresa_id, v_tool.id, 'DEVOLUCAO', v_tool.status, 'DISPONIVEL', v_tool.current_employee_id,
    v_tool.current_client_id, v_tool.current_work_quote_id, nullif(btrim(p_notes), ''),
    v_actor.auth_user_id, v_actor.display_name
  );
  update public.warehouse_tools set status = 'DISPONIVEL', condition = btrim(p_condition),
    notes = coalesce(nullif(btrim(p_notes), ''), notes), current_employee_id = null,
    current_client_id = null, current_work_quote_id = null, checked_out_at = null, expected_return_at = null
  where id = v_tool.id returning * into v_tool;
  return v_tool;
end;
$$;

create or replace function public.warehouse_receive_purchase(
  p_purchase_id uuid,
  p_received_quantity numeric,
  p_performed_by_name text
)
returns public.warehouse_purchase_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_purchase public.warehouse_purchase_items%rowtype;
  v_product public.warehouse_products%rowtype;
  v_movement_id uuid;
begin
  select * into v_actor from app_private.warehouse_actor_identity();

  if not app_private.warehouse_has_permission('comprar') then raise exception 'Sem permissão para receber compra.'; end if;
  if p_received_quantity is null or p_received_quantity <= 0 or p_received_quantity > 1000000 then raise exception 'Quantidade inválida.'; end if;
  select * into v_purchase from public.warehouse_purchase_items where id = p_purchase_id and empresa_id = v_actor.empresa_id for update;
  if not found then raise exception 'Compra não encontrada.'; end if;
  if v_purchase.received_movement_id is not null or v_purchase.received_at is not null or v_purchase.received_by_uid is not null then
    raise exception 'Compra já recebida.';
  end if;
  if v_purchase.status in ('RECEBIDO', 'CANCELADO') then raise exception 'Compra não pode ser recebida neste status.'; end if;
  if p_received_quantity <> v_purchase.requested_quantity then
    raise exception 'Nesta versão, a quantidade recebida deve ser exatamente igual à solicitada.';
  end if;

  select * into v_product from public.warehouse_products where id = v_purchase.product_id and empresa_id = v_actor.empresa_id and active for update;
  if not found then raise exception 'Produto não encontrado.'; end if;

  update public.warehouse_products set current_quantity = current_quantity + p_received_quantity where id = v_product.id;
  insert into public.warehouse_movements (
    empresa_id, product_id, movement_type, quantity, previous_quantity, resulting_quantity,
    unit_cost_snapshot, total_cost_snapshot, reason, performed_by_uid, performed_by_name
  ) values (
    v_actor.empresa_id, v_product.id, 'ENTRADA', p_received_quantity, v_product.current_quantity,
    v_product.current_quantity + p_received_quantity, v_product.unit_cost,
    case when v_product.unit_cost is null then null else round(p_received_quantity * v_product.unit_cost, 2) end,
    'Recebimento de compra', v_actor.auth_user_id, v_actor.display_name
  ) returning id into v_movement_id;
  update public.warehouse_purchase_items set status = 'RECEBIDO', received_movement_id = v_movement_id,
    received_by_uid = v_actor.auth_user_id, received_by_name = v_actor.display_name, received_at = timezone('utc', now())
  where id = v_purchase.id returning * into v_purchase;
  return v_purchase;
end;
$$;

revoke all on function app_private.warehouse_actor_identity() from public;
revoke all on function app_private.warehouse_assign_insert_audit_fields() from public;

revoke all on function public.warehouse_stock_alerts(integer) from public, anon;
grant execute on function public.warehouse_stock_alerts(integer) to authenticated;

revoke all on function public.warehouse_list_movements(integer, integer, text, uuid, text, text, text, text, date, date) from public, anon;
grant execute on function public.warehouse_list_movements(integer, integer, text, uuid, text, text, text, text, date, date) to authenticated;

revoke all on function public.warehouse_record_movement(uuid, text, numeric, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.warehouse_checkout_tool(uuid, text, text, text, timestamptz, text, text) from public, anon;
revoke all on function public.warehouse_return_tool(uuid, text, text, text) from public, anon;
revoke all on function public.warehouse_receive_purchase(uuid, numeric, text) from public, anon;
grant execute on function public.warehouse_record_movement(uuid, text, numeric, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.warehouse_checkout_tool(uuid, text, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.warehouse_return_tool(uuid, text, text, text) to authenticated;
grant execute on function public.warehouse_receive_purchase(uuid, numeric, text) to authenticated;
