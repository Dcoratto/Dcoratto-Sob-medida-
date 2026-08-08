-- RLS policies evaluate this helper with the caller privileges.
grant execute on function app_private.warehouse_supplier_is_valid(text, text) to authenticated;
