create or replace function app_private.current_user_can_track_employee_activity()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.employee_has_permission('apontar');
$$;

grant execute on function app_private.current_user_can_track_employee_activity() to authenticated;
