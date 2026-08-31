revoke all on function public.report_vehicle_occurrence(text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.start_vehicle_usage(text, text, text, text, text, text, integer, text, jsonb, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.finish_vehicle_usage(text, integer, text, jsonb, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function app_private.vehicle_has_permission(text) from public;
revoke all on function app_private.current_employee_id() from public;
revoke all on function app_private.vehicle_checklist_complete(text, jsonb) from public;
revoke all on function app_private.vehicle_reference_snapshot(text, text) from public;

grant execute on function public.report_vehicle_occurrence(text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.start_vehicle_usage(text, text, text, text, text, text, integer, text, jsonb, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.finish_vehicle_usage(text, integer, text, jsonb, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function app_private.vehicle_has_permission(text) to authenticated;
grant execute on function app_private.current_employee_id() to authenticated;
grant execute on function app_private.vehicle_checklist_complete(text, jsonb) to authenticated;
grant execute on function app_private.vehicle_reference_snapshot(text, text) to authenticated;
