create or replace function app_private.guard_employee_attendance_status_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('FOLGA', 'AFASTADO')
     and (
       new.check_in_at is not null
       or new.break_start_at is not null
       or new.break_end_at is not null
       or new.check_out_at is not null
       or coalesce(old.check_in_at, old.break_start_at, old.break_end_at, old.check_out_at) is not null
       or exists (
         select 1
         from public.employee_activity_sessions session
         where session.empresa_id = new.empresa_id
           and session.employee_id = new.employee_id
           and session.started_at::date = new.work_date
       )
       or exists (
         select 1
         from public.employee_overtime_sessions overtime
         where overtime.empresa_id = new.empresa_id
           and overtime.employee_id = new.employee_id
           and overtime.work_date = new.work_date
       )
     ) then
    raise exception 'Este dia possui registros operacionais. Ajuste os apontamentos antes de marcar como folga ou afastado.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_employee_attendance_status_conflicts on public.employee_attendance_records;
create trigger guard_employee_attendance_status_conflicts
before insert or update on public.employee_attendance_records
for each row execute function app_private.guard_employee_attendance_status_conflicts();
