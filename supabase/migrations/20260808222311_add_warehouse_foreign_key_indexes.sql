create index warehouse_movements_client_fk_idx on public.warehouse_movements(client_id) where client_id is not null;
create index warehouse_movements_employee_fk_idx on public.warehouse_movements(employee_id) where employee_id is not null;
create index warehouse_movements_quote_fk_idx on public.warehouse_movements(quote_id) where quote_id is not null;
create index warehouse_movements_work_quote_fk_idx on public.warehouse_movements(work_quote_id) where work_quote_id is not null;

create index warehouse_purchase_items_product_fk_idx on public.warehouse_purchase_items(empresa_id, product_id);
create index warehouse_purchase_items_received_movement_fk_idx on public.warehouse_purchase_items(received_movement_id) where received_movement_id is not null;

create index warehouse_tool_movements_client_fk_idx on public.warehouse_tool_movements(client_id) where client_id is not null;
create index warehouse_tool_movements_employee_fk_idx on public.warehouse_tool_movements(employee_id) where employee_id is not null;
create index warehouse_tool_movements_work_quote_fk_idx on public.warehouse_tool_movements(work_quote_id) where work_quote_id is not null;

create index warehouse_tools_current_client_fk_idx on public.warehouse_tools(current_client_id) where current_client_id is not null;
create index warehouse_tools_current_employee_fk_idx on public.warehouse_tools(current_employee_id) where current_employee_id is not null;
create index warehouse_tools_current_work_quote_fk_idx on public.warehouse_tools(current_work_quote_id) where current_work_quote_id is not null;
