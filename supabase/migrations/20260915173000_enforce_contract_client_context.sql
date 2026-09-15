create unique index if not exists client_contracts_id_empresa_client_unique
on public.client_contracts(id, empresa_id, client_id);

alter table public.employee_activity_sessions
drop constraint if exists employee_activity_sessions_contract_context_fkey;

alter table public.employee_activity_sessions
add constraint employee_activity_sessions_contract_context_fkey
foreign key (contract_id, empresa_id, client_id)
references public.client_contracts(id, empresa_id, client_id)
on update cascade
on delete restrict;

alter table public.installations
drop constraint if exists installations_contract_context_fkey;

alter table public.installations
add constraint installations_contract_context_fkey
foreign key (contract_id, empresa_id, client_id)
references public.client_contracts(id, empresa_id, client_id)
on update cascade
on delete restrict;

alter table public.crisis_clients
drop constraint if exists crisis_clients_contract_context_fkey;

alter table public.crisis_clients
add constraint crisis_clients_contract_context_fkey
foreign key (contract_id, empresa_id, client_id)
references public.client_contracts(id, empresa_id, client_id)
on update cascade
on delete restrict;
