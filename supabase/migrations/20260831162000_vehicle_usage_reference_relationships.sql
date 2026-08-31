alter table public.vehicle_usage_sessions
  add constraint vehicle_usage_employee_fk
    foreign key (employee_id)
    references public.employees(id)
    on update cascade
    on delete restrict;

alter table public.vehicle_usage_sessions
  add constraint vehicle_usage_client_fk
    foreign key (client_id)
    references public.clients(id)
    on update cascade
    on delete set null;

alter table public.vehicle_usage_sessions
  add constraint vehicle_usage_quote_fk
    foreign key (quote_id)
    references public.quotes(id)
    on update cascade
    on delete set null;

select pg_notify('pgrst', 'reload schema');
