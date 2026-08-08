-- Almoxarifado is intentionally isolated from the slab inventory tables.

create table public.warehouse_products (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on update cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  category text not null check (char_length(btrim(category)) between 2 and 60),
  item_type text not null check (item_type in ('CONSUMIVEL', 'FERRAMENTA')),
  unit text not null check (char_length(btrim(unit)) between 1 and 30),
  current_quantity numeric(14,3) not null default 0 check (current_quantity >= 0),
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  physical_location text not null default '' check (char_length(physical_location) <= 120),
  default_supplier_id text check (default_supplier_id is null or char_length(default_supplier_id) <= 160),
  unit_cost numeric(14,2) check (unit_cost is null or unit_cost >= 0),
  active boolean not null default true,
  created_by_uid text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, id)
);

create table public.warehouse_movements (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on update cascade,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO')),
  quantity numeric(14,3) not null check (quantity > 0),
  previous_quantity numeric(14,3) not null check (previous_quantity >= 0),
  resulting_quantity numeric(14,3) not null check (resulting_quantity >= 0),
  unit_cost_snapshot numeric(14,2) check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  total_cost_snapshot numeric(16,2) check (total_cost_snapshot is null or total_cost_snapshot >= 0),
  employee_id text references public.employees(id) on update cascade on delete set null,
  client_id text references public.clients(id) on update cascade on delete set null,
  work_quote_id text references public.quotes(id) on update cascade on delete set null,
  quote_id text references public.quotes(id) on update cascade on delete set null,
  reason text not null check (char_length(btrim(reason)) between 2 and 160),
  notes text check (notes is null or char_length(notes) <= 1000),
  performed_by_uid text not null,
  performed_by_name text not null check (char_length(btrim(performed_by_name)) between 1 and 120),
  created_at timestamptz not null default timezone('utc', now()),
  constraint warehouse_movements_product_fk foreign key (empresa_id, product_id)
    references public.warehouse_products(empresa_id, id) on update cascade on delete restrict
);

create table public.warehouse_tools (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on update cascade,
  product_id uuid not null,
  asset_code text not null check (char_length(btrim(asset_code)) between 2 and 80),
  serial_number text check (serial_number is null or char_length(serial_number) <= 120),
  condition text not null default 'BOA' check (char_length(condition) between 2 and 60),
  status text not null default 'DISPONIVEL' check (status in ('DISPONIVEL', 'EM_USO', 'MANUTENCAO', 'DANIFICADA', 'INATIVA')),
  notes text check (notes is null or char_length(notes) <= 1000),
  current_employee_id text references public.employees(id) on update cascade on delete set null,
  current_client_id text references public.clients(id) on update cascade on delete set null,
  current_work_quote_id text references public.quotes(id) on update cascade on delete set null,
  checked_out_at timestamptz,
  expected_return_at timestamptz,
  active boolean not null default true,
  created_by_uid text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, asset_code),
  unique (empresa_id, id),
  constraint warehouse_tools_product_fk foreign key (empresa_id, product_id)
    references public.warehouse_products(empresa_id, id) on update cascade on delete restrict
);

create table public.warehouse_tool_movements (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on update cascade,
  tool_id uuid not null,
  movement_type text not null check (movement_type in ('RETIRADA', 'DEVOLUCAO', 'ALTERACAO_STATUS')),
  previous_status text not null,
  resulting_status text not null,
  employee_id text references public.employees(id) on update cascade on delete set null,
  client_id text references public.clients(id) on update cascade on delete set null,
  work_quote_id text references public.quotes(id) on update cascade on delete set null,
  reason text check (reason is null or char_length(reason) <= 160),
  notes text check (notes is null or char_length(notes) <= 1000),
  performed_by_uid text not null,
  performed_by_name text not null check (char_length(btrim(performed_by_name)) between 1 and 120),
  created_at timestamptz not null default timezone('utc', now()),
  constraint warehouse_tool_movements_tool_fk foreign key (empresa_id, tool_id)
    references public.warehouse_tools(empresa_id, id) on update cascade on delete restrict
);

create table public.warehouse_purchase_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on update cascade,
  product_id uuid not null,
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  suggested_quantity numeric(14,3) check (suggested_quantity is null or suggested_quantity > 0),
  supplier_id text check (supplier_id is null or char_length(supplier_id) <= 160),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'SOLICITADO', 'COMPRADO', 'RECEBIDO', 'CANCELADO')),
  notes text check (notes is null or char_length(notes) <= 1000),
  requested_by_uid text not null,
  requested_by_name text not null check (char_length(btrim(requested_by_name)) between 1 and 120),
  requested_at timestamptz not null default timezone('utc', now()),
  received_movement_id uuid references public.warehouse_movements(id) on update cascade on delete restrict,
  received_by_uid text,
  received_by_name text,
  received_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint warehouse_purchase_items_product_fk foreign key (empresa_id, product_id)
    references public.warehouse_products(empresa_id, id) on update cascade on delete restrict
);

create index warehouse_products_empresa_active_name_idx on public.warehouse_products(empresa_id, active, name);
create index warehouse_products_empresa_stock_idx on public.warehouse_products(empresa_id, current_quantity, minimum_quantity) where active;
create index warehouse_movements_empresa_created_idx on public.warehouse_movements(empresa_id, created_at desc);
create index warehouse_movements_product_created_idx on public.warehouse_movements(empresa_id, product_id, created_at desc);
create index warehouse_movements_work_idx on public.warehouse_movements(empresa_id, work_quote_id, created_at desc) where work_quote_id is not null;
create index warehouse_movements_employee_idx on public.warehouse_movements(empresa_id, employee_id, created_at desc) where employee_id is not null;
create index warehouse_tools_empresa_status_idx on public.warehouse_tools(empresa_id, status, asset_code);
create index warehouse_tools_product_idx on public.warehouse_tools(empresa_id, product_id);
create index warehouse_tool_movements_history_idx on public.warehouse_tool_movements(empresa_id, tool_id, created_at desc);
create index warehouse_purchase_items_status_idx on public.warehouse_purchase_items(empresa_id, status, created_at desc);

create trigger set_updated_at_warehouse_products before update on public.warehouse_products
for each row execute function public.set_updated_at();
create trigger set_updated_at_warehouse_tools before update on public.warehouse_tools
for each row execute function public.set_updated_at();
create trigger set_updated_at_warehouse_purchase_items before update on public.warehouse_purchase_items
for each row execute function public.set_updated_at();

create or replace function app_private.warehouse_has_permission(p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where (u.auth_user_id = (select auth.uid()) or u.id = (select auth.uid())::text)
      and u.blocked is not true
      and u.empresa_id = app_private.current_empresa_id()
      and case
        when u.permissions #> array['almoxarifado', p_action] is not null
          then coalesce((u.permissions #>> array['almoxarifado', p_action])::boolean, false)
        when u.role in ('administrativo', 'coordenador') then true
        when u.role = 'vendedor' then p_action in ('visualizar', 'movimentar')
        when u.role = 'liberacao' then p_action = 'visualizar'
        else false
      end
  );
$$;

create or replace function app_private.warehouse_reference_is_valid(
  p_table regclass,
  p_id text,
  p_empresa_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  if p_id is null then return true; end if;
  execute format('select exists (select 1 from %s where id = $1 and empresa_id = $2)', p_table)
    into v_found using p_id, p_empresa_id;
  return coalesce(v_found, false);
end;
$$;

create or replace function app_private.warehouse_supplier_is_valid(p_supplier_id text, p_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_supplier_id is null or exists (
    select 1
    from public.settings s,
      jsonb_array_elements(coalesce(s.material_catalog -> 'suppliers', '[]'::jsonb)) supplier
    where s.empresa_id = p_empresa_id
      and supplier ->> 'id' = p_supplier_id
  );
$$;

create or replace function public.warehouse_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total_products', count(*) filter (where active),
    'below_minimum', count(*) filter (where active and current_quantity > 0 and current_quantity <= minimum_quantity),
    'out_of_stock', count(*) filter (where active and current_quantity = 0),
    'borrowed_tools', (select count(*) from public.warehouse_tools where empresa_id = app_private.current_empresa_id() and active and status = 'EM_USO'),
    'pending_purchases', (select count(*) from public.warehouse_purchase_items where empresa_id = app_private.current_empresa_id() and status in ('PENDENTE', 'SOLICITADO', 'COMPRADO')),
    'movements_today', (select count(*) from public.warehouse_movements where empresa_id = app_private.current_empresa_id() and created_at >= date_trunc('day', timezone('America/Sao_Paulo', now())) at time zone 'America/Sao_Paulo')
  )
  from public.warehouse_products
  where empresa_id = app_private.current_empresa_id();
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
  v_empresa_id text := app_private.current_empresa_id();
  v_product public.warehouse_products%rowtype;
  v_result public.warehouse_movements%rowtype;
  v_resulting numeric(14,3);
  v_movement_quantity numeric(14,3);
begin
  if (select auth.uid()) is null or not app_private.warehouse_has_permission('movimentar') then
    raise exception 'Sem permissao para movimentar o almoxarifado.';
  end if;
  if p_movement_type not in ('ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO') then raise exception 'Tipo de movimentacao invalido.'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then raise exception 'Quantidade invalida.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 2 and 160 then raise exception 'Motivo invalido.'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Observacao excede 1000 caracteres.'; end if;
  if char_length(btrim(coalesce(p_performed_by_name, ''))) not between 1 and 120 then raise exception 'Responsavel invalido.'; end if;

  select * into v_product from public.warehouse_products
  where id = p_product_id and empresa_id = v_empresa_id and active for update;
  if not found then raise exception 'Produto nao encontrado.'; end if;
  if v_product.item_type <> 'CONSUMIVEL' then raise exception 'Ferramentas devem usar o fluxo proprio.'; end if;
  if p_movement_type = 'SAIDA' and p_employee_id is null then raise exception 'Funcionario obrigatorio para retirada.'; end if;

  if not app_private.warehouse_reference_is_valid('public.employees', p_employee_id, v_empresa_id)
    or not app_private.warehouse_reference_is_valid('public.clients', p_client_id, v_empresa_id)
    or not app_private.warehouse_reference_is_valid('public.quotes', p_work_quote_id, v_empresa_id)
    or not app_private.warehouse_reference_is_valid('public.quotes', p_quote_id, v_empresa_id) then
    raise exception 'Referencia relacionada invalida.';
  end if;
  if p_client_id is not null and exists (
    select 1 from public.quotes q
    where q.id in (p_work_quote_id, p_quote_id) and q.client_id <> p_client_id
  ) then raise exception 'Cliente, obra e orcamento nao correspondem.'; end if;

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
    v_empresa_id, v_product.id, p_movement_type, v_movement_quantity, v_product.current_quantity, v_resulting,
    v_product.unit_cost, case when v_product.unit_cost is null then null else round(v_movement_quantity * v_product.unit_cost, 2) end,
    p_employee_id, p_client_id, p_work_quote_id, p_quote_id, btrim(p_reason), nullif(btrim(p_notes), ''),
    (select auth.uid())::text, btrim(p_performed_by_name)
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
  select
    product.id,
    product.name,
    product.category,
    product.unit,
    sum(movement.quantity)::numeric,
    coalesce(sum(movement.total_cost_snapshot), 0)::numeric,
    jsonb_agg(
      jsonb_build_object(
        'date', movement.created_at,
        'quantity', movement.quantity,
        'unit_cost', movement.unit_cost_snapshot,
        'total_cost', movement.total_cost_snapshot,
        'employee', employee.name,
        'performed_by', movement.performed_by_name
      ) order by movement.created_at desc
    )
  from public.warehouse_movements movement
  join public.warehouse_products product
    on product.id = movement.product_id and product.empresa_id = movement.empresa_id
  left join public.employees employee on employee.id = movement.employee_id
  where movement.empresa_id = app_private.current_empresa_id()
    and movement.work_quote_id = p_work_quote_id
    and movement.movement_type = 'SAIDA'
    and app_private.warehouse_has_permission('visualizar')
  group by product.id, product.name, product.category, product.unit
  order by product.name;
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
  v_empresa_id text := app_private.current_empresa_id();
  v_tool public.warehouse_tools%rowtype;
begin
  if (select auth.uid()) is null or not app_private.warehouse_has_permission('movimentar') then raise exception 'Sem permissao para retirar ferramenta.'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Observacao excede 1000 caracteres.'; end if;
  if char_length(btrim(coalesce(p_performed_by_name, ''))) not between 1 and 120 then raise exception 'Responsavel invalido.'; end if;
  select * into v_tool from public.warehouse_tools where id = p_tool_id and empresa_id = v_empresa_id and active for update;
  if not found then raise exception 'Ferramenta nao encontrada.'; end if;
  if v_tool.status <> 'DISPONIVEL' then raise exception 'Ferramenta nao esta disponivel.'; end if;
  if not app_private.warehouse_reference_is_valid('public.employees', p_employee_id, v_empresa_id)
    or not app_private.warehouse_reference_is_valid('public.clients', p_client_id, v_empresa_id)
    or not app_private.warehouse_reference_is_valid('public.quotes', p_work_quote_id, v_empresa_id) then raise exception 'Referencia relacionada invalida.'; end if;
  if p_client_id is not null and p_work_quote_id is not null and not exists (
    select 1 from public.quotes where id = p_work_quote_id and client_id = p_client_id and empresa_id = v_empresa_id
  ) then raise exception 'Cliente e obra nao correspondem.'; end if;

  update public.warehouse_tools set status = 'EM_USO', current_employee_id = p_employee_id,
    current_client_id = p_client_id, current_work_quote_id = p_work_quote_id,
    checked_out_at = timezone('utc', now()), expected_return_at = p_expected_return_at
  where id = v_tool.id returning * into v_tool;
  insert into public.warehouse_tool_movements (
    empresa_id, tool_id, movement_type, previous_status, resulting_status, employee_id, client_id,
    work_quote_id, notes, performed_by_uid, performed_by_name
  ) values (
    v_empresa_id, v_tool.id, 'RETIRADA', 'DISPONIVEL', 'EM_USO', p_employee_id, p_client_id,
    p_work_quote_id, nullif(btrim(p_notes), ''), (select auth.uid())::text, btrim(p_performed_by_name)
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
  v_empresa_id text := app_private.current_empresa_id();
  v_tool public.warehouse_tools%rowtype;
begin
  if (select auth.uid()) is null or not app_private.warehouse_has_permission('movimentar') then raise exception 'Sem permissao para devolver ferramenta.'; end if;
  if char_length(btrim(coalesce(p_condition, ''))) not between 2 and 60 then raise exception 'Estado invalido.'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Observacao excede 1000 caracteres.'; end if;
  if char_length(btrim(coalesce(p_performed_by_name, ''))) not between 1 and 120 then raise exception 'Responsavel invalido.'; end if;
  select * into v_tool from public.warehouse_tools where id = p_tool_id and empresa_id = v_empresa_id and active for update;
  if not found then raise exception 'Ferramenta nao encontrada.'; end if;
  if v_tool.status <> 'EM_USO' then raise exception 'Ferramenta nao esta em uso.'; end if;

  insert into public.warehouse_tool_movements (
    empresa_id, tool_id, movement_type, previous_status, resulting_status, employee_id, client_id,
    work_quote_id, notes, performed_by_uid, performed_by_name
  ) values (
    v_empresa_id, v_tool.id, 'DEVOLUCAO', v_tool.status, 'DISPONIVEL', v_tool.current_employee_id,
    v_tool.current_client_id, v_tool.current_work_quote_id, nullif(btrim(p_notes), ''),
    (select auth.uid())::text, btrim(p_performed_by_name)
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
  v_empresa_id text := app_private.current_empresa_id();
  v_purchase public.warehouse_purchase_items%rowtype;
  v_product public.warehouse_products%rowtype;
  v_movement_id uuid;
begin
  if (select auth.uid()) is null or not app_private.warehouse_has_permission('comprar') then raise exception 'Sem permissao para receber compra.'; end if;
  if p_received_quantity is null or p_received_quantity <= 0 or p_received_quantity > 1000000 then raise exception 'Quantidade invalida.'; end if;
  if char_length(btrim(coalesce(p_performed_by_name, ''))) not between 1 and 120 then raise exception 'Responsavel invalido.'; end if;
  select * into v_purchase from public.warehouse_purchase_items where id = p_purchase_id and empresa_id = v_empresa_id for update;
  if not found then raise exception 'Compra nao encontrada.'; end if;
  if v_purchase.status in ('RECEBIDO', 'CANCELADO') then raise exception 'Compra nao pode ser recebida neste status.'; end if;
  select * into v_product from public.warehouse_products where id = v_purchase.product_id and empresa_id = v_empresa_id and active for update;
  if not found then raise exception 'Produto nao encontrado.'; end if;

  update public.warehouse_products set current_quantity = current_quantity + p_received_quantity where id = v_product.id;
  insert into public.warehouse_movements (
    empresa_id, product_id, movement_type, quantity, previous_quantity, resulting_quantity,
    unit_cost_snapshot, total_cost_snapshot, reason, performed_by_uid, performed_by_name
  ) values (
    v_empresa_id, v_product.id, 'ENTRADA', p_received_quantity, v_product.current_quantity,
    v_product.current_quantity + p_received_quantity, v_product.unit_cost,
    case when v_product.unit_cost is null then null else round(p_received_quantity * v_product.unit_cost, 2) end,
    'Recebimento de compra', (select auth.uid())::text, btrim(p_performed_by_name)
  ) returning id into v_movement_id;
  update public.warehouse_purchase_items set status = 'RECEBIDO', received_movement_id = v_movement_id,
    received_by_uid = (select auth.uid())::text, received_by_name = btrim(p_performed_by_name), received_at = timezone('utc', now())
  where id = v_purchase.id returning * into v_purchase;
  return v_purchase;
end;
$$;

alter table public.warehouse_products enable row level security;
alter table public.warehouse_movements enable row level security;
alter table public.warehouse_tools enable row level security;
alter table public.warehouse_tool_movements enable row level security;
alter table public.warehouse_purchase_items enable row level security;

create policy warehouse_products_select on public.warehouse_products for select to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('visualizar'));
create policy warehouse_products_insert on public.warehouse_products for insert to authenticated
with check (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('editar') and app_private.warehouse_supplier_is_valid(default_supplier_id, empresa_id));
create policy warehouse_products_update on public.warehouse_products for update to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('editar'))
with check (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('editar') and app_private.warehouse_supplier_is_valid(default_supplier_id, empresa_id));

create policy warehouse_movements_select on public.warehouse_movements for select to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('visualizar'));

create policy warehouse_tools_select on public.warehouse_tools for select to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('visualizar'));
create policy warehouse_tools_insert on public.warehouse_tools for insert to authenticated
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.warehouse_has_permission('editar')
  and status = 'DISPONIVEL'
  and exists (
    select 1 from public.warehouse_products product
    where product.id = product_id
      and product.empresa_id = warehouse_tools.empresa_id
      and product.item_type = 'FERRAMENTA'
      and product.active
  )
);
create policy warehouse_tools_update on public.warehouse_tools for update to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('editar'))
with check (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('editar'));

create policy warehouse_tool_movements_select on public.warehouse_tool_movements for select to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('visualizar'));

create policy warehouse_purchase_items_select on public.warehouse_purchase_items for select to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('visualizar'));
create policy warehouse_purchase_items_insert on public.warehouse_purchase_items for insert to authenticated
with check (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('comprar') and app_private.warehouse_supplier_is_valid(supplier_id, empresa_id));
create policy warehouse_purchase_items_update on public.warehouse_purchase_items for update to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('comprar'))
with check (empresa_id = app_private.current_empresa_id() and app_private.warehouse_has_permission('comprar') and status <> 'RECEBIDO' and received_movement_id is null and app_private.warehouse_supplier_is_valid(supplier_id, empresa_id));

revoke all on table public.warehouse_products, public.warehouse_movements, public.warehouse_tools,
  public.warehouse_tool_movements, public.warehouse_purchase_items from anon, authenticated;
grant select on table public.warehouse_products, public.warehouse_movements, public.warehouse_tools,
  public.warehouse_tool_movements, public.warehouse_purchase_items to authenticated;
grant insert (empresa_id, name, description, category, item_type, unit, minimum_quantity, physical_location, default_supplier_id, unit_cost, active, created_by_uid)
  on public.warehouse_products to authenticated;
grant update (name, description, category, unit, minimum_quantity, physical_location, default_supplier_id, unit_cost, active)
  on public.warehouse_products to authenticated;
grant insert (empresa_id, product_id, asset_code, serial_number, condition, notes, active, created_by_uid)
  on public.warehouse_tools to authenticated;
grant update (asset_code, serial_number, condition, notes, active)
  on public.warehouse_tools to authenticated;
grant insert (empresa_id, product_id, requested_quantity, suggested_quantity, supplier_id, status, notes, requested_by_uid, requested_by_name)
  on public.warehouse_purchase_items to authenticated;
grant update (requested_quantity, suggested_quantity, supplier_id, status, notes)
  on public.warehouse_purchase_items to authenticated;

revoke all on function app_private.warehouse_has_permission(text) from public;
revoke all on function app_private.warehouse_reference_is_valid(regclass, text, text) from public;
revoke all on function app_private.warehouse_supplier_is_valid(text, text) from public;
grant execute on function app_private.warehouse_has_permission(text) to authenticated;
revoke all on function public.warehouse_dashboard_summary() from public, anon;
grant execute on function public.warehouse_dashboard_summary() to authenticated;
revoke all on function public.warehouse_work_consumption(text) from public, anon;
grant execute on function public.warehouse_work_consumption(text) to authenticated;

revoke all on function public.warehouse_record_movement(uuid, text, numeric, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.warehouse_checkout_tool(uuid, text, text, text, timestamptz, text, text) from public, anon;
revoke all on function public.warehouse_return_tool(uuid, text, text, text) from public, anon;
revoke all on function public.warehouse_receive_purchase(uuid, numeric, text) from public, anon;
grant execute on function public.warehouse_record_movement(uuid, text, numeric, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.warehouse_checkout_tool(uuid, text, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.warehouse_return_tool(uuid, text, text, text) to authenticated;
grant execute on function public.warehouse_receive_purchase(uuid, numeric, text) to authenticated;
