revoke all privileges on table public.client_contracts from authenticated;
revoke all privileges on table public.client_contract_pieces from authenticated;

grant select, insert, update on table public.client_contracts to authenticated;
grant select, insert, update on table public.client_contract_pieces to authenticated;
