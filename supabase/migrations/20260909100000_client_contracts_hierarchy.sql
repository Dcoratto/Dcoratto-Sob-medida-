create table if not exists public.client_contracts (
  id text primary key,
  empresa_id text not null references public.empresas(id) on update cascade on delete restrict,
  client_id text not null references public.clients(id) on update cascade on delete restrict,
  quote_id text references public.quotes(id) on update cascade on delete set null,
  contract_number text not null,
  contract_date date,
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'pdf_import', 'quote_backfill')),
  review_status text not null default 'confirmed' check (review_status in ('pending_review', 'confirmed')),
  source_document jsonb not null default '{}'::jsonb,
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by_uid text,
  deleted_by_name text,
  constraint client_contracts_contract_number_not_blank check (length(btrim(contract_number)) between 1 and 80)
);

create table if not exists public.client_contract_pieces (
  id text primary key,
  empresa_id text not null references public.empresas(id) on update cascade on delete restrict,
  contract_id text not null references public.client_contracts(id) on update cascade on delete restrict,
  quote_piece_id text,
  piece_label text not null,
  piece_type_key text,
  sort_order integer not null default 0,
  source text not null default 'manual' check (source in ('manual', 'pdf_import', 'quote_backfill')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint client_contract_pieces_label_not_blank check (length(btrim(piece_label)) between 1 and 180)
);

alter table public.employee_activity_sessions add column if not exists contract_id text references public.client_contracts(id) on update cascade on delete set null;
alter table public.installations add column if not exists contract_id text references public.client_contracts(id) on update cascade on delete set null;
alter table public.crisis_clients add column if not exists contract_id text references public.client_contracts(id) on update cascade on delete set null;
alter table public.crisis_clients add column if not exists piece_id text;
alter table public.crisis_clients add column if not exists piece_label text;

create unique index if not exists client_contracts_empresa_contract_number_unique
on public.client_contracts(empresa_id, lower(contract_number))
where deleted_at is null;

create unique index if not exists client_contracts_empresa_quote_unique
on public.client_contracts(empresa_id, quote_id)
where quote_id is not null and deleted_at is null;

create index if not exists idx_client_contracts_empresa_client
on public.client_contracts(empresa_id, client_id, created_at desc)
where deleted_at is null;

create index if not exists idx_client_contracts_empresa_quote
on public.client_contracts(empresa_id, quote_id)
where quote_id is not null and deleted_at is null;

create unique index if not exists client_contract_pieces_quote_piece_unique
on public.client_contract_pieces(empresa_id, contract_id, quote_piece_id)
where quote_piece_id is not null and deleted_at is null;

create index if not exists idx_client_contract_pieces_contract
on public.client_contract_pieces(empresa_id, contract_id, sort_order)
where deleted_at is null;

create index if not exists idx_employee_activity_sessions_contract
on public.employee_activity_sessions(empresa_id, contract_id, started_at desc)
where contract_id is not null;

create index if not exists idx_installations_contract
on public.installations(empresa_id, contract_id)
where contract_id is not null and deleted_at is null;

create index if not exists idx_crisis_clients_contract
on public.crisis_clients(empresa_id, contract_id)
where contract_id is not null and deleted_at is null;

drop index if exists public.idx_crisis_clients_active_client;
create unique index if not exists idx_crisis_clients_active_contract_context
on public.crisis_clients(empresa_id, client_id, coalesce(contract_id, ''), coalesce(piece_id, ''))
where deleted_at is null;

drop trigger if exists set_updated_at_client_contracts on public.client_contracts;
create trigger set_updated_at_client_contracts
before update on public.client_contracts
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_client_contract_pieces on public.client_contract_pieces;
create trigger set_updated_at_client_contract_pieces
before update on public.client_contract_pieces
for each row execute function public.set_updated_at();

alter table public.client_contracts enable row level security;
alter table public.client_contract_pieces enable row level security;

drop policy if exists client_contracts_select_same_empresa on public.client_contracts;
create policy client_contracts_select_same_empresa
on public.client_contracts
for select
to authenticated
using (empresa_id = app_private.current_empresa_id());

drop policy if exists client_contracts_insert_same_empresa on public.client_contracts;
create policy client_contracts_insert_same_empresa
on public.client_contracts
for insert
to authenticated
with check (empresa_id = app_private.current_empresa_id() and app_private.current_user_access_role() in ('coordenador', 'administrativo'));

drop policy if exists client_contracts_update_same_empresa on public.client_contracts;
create policy client_contracts_update_same_empresa
on public.client_contracts
for update
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.current_user_access_role() in ('coordenador', 'administrativo'))
with check (empresa_id = app_private.current_empresa_id() and app_private.current_user_access_role() in ('coordenador', 'administrativo'));

drop policy if exists client_contract_pieces_select_same_empresa on public.client_contract_pieces;
create policy client_contract_pieces_select_same_empresa
on public.client_contract_pieces
for select
to authenticated
using (
  empresa_id = app_private.current_empresa_id()
  and exists (
    select 1 from public.client_contracts cc
    where cc.id = contract_id
      and cc.empresa_id = client_contract_pieces.empresa_id
      and cc.deleted_at is null
  )
);

drop policy if exists client_contract_pieces_insert_same_empresa on public.client_contract_pieces;
create policy client_contract_pieces_insert_same_empresa
on public.client_contract_pieces
for insert
to authenticated
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_access_role() in ('coordenador', 'administrativo')
  and exists (
    select 1 from public.client_contracts cc
    where cc.id = contract_id
      and cc.empresa_id = client_contract_pieces.empresa_id
      and cc.deleted_at is null
  )
);

drop policy if exists client_contract_pieces_update_same_empresa on public.client_contract_pieces;
create policy client_contract_pieces_update_same_empresa
on public.client_contract_pieces
for update
to authenticated
using (empresa_id = app_private.current_empresa_id() and app_private.current_user_access_role() in ('coordenador', 'administrativo'))
with check (
  empresa_id = app_private.current_empresa_id()
  and app_private.current_user_access_role() in ('coordenador', 'administrativo')
  and exists (
    select 1 from public.client_contracts cc
    where cc.id = contract_id
      and cc.empresa_id = client_contract_pieces.empresa_id
      and cc.deleted_at is null
  )
);

grant select on public.client_contracts to authenticated;
grant select on public.client_contract_pieces to authenticated;
grant insert, update on public.client_contracts to authenticated;
grant insert, update on public.client_contract_pieces to authenticated;

insert into public.client_contracts (
  id, empresa_id, client_id, quote_id, contract_number, contract_date, status, source, review_status, created_by_name, created_at, updated_at
)
select
  app_private.make_entity_id(),
  q.empresa_id,
  q.client_id,
  q.id,
  'ORC-' || q.id,
  (q.created_at at time zone 'America/Sao_Paulo')::date,
  case when lower(coalesce(q.status, '')) in ('cancelado', 'recusado') then 'cancelled' else 'active' end,
  'quote_backfill',
  'confirmed',
  'Backfill automatico',
  coalesce(q.created_at, timezone('utc', now())),
  timezone('utc', now())
from public.quotes q
where q.client_id is not null
  and not exists (
    select 1
    from public.client_contracts cc
    where cc.empresa_id = q.empresa_id
      and cc.quote_id = q.id
      and cc.deleted_at is null
  );

insert into public.client_contract_pieces (
  id, empresa_id, contract_id, quote_piece_id, piece_label, piece_type_key, sort_order, source, created_at, updated_at
)
select
  app_private.make_entity_id(),
  cc.empresa_id,
  cc.id,
  nullif(piece.item ->> 'id', ''),
  left(coalesce(nullif(piece.item ->> 'name', ''), nullif(piece.item ->> 'id', ''), 'Peca sem nome'), 180),
  nullif(piece.item ->> 'kind', ''),
  piece.ordinality::integer,
  'quote_backfill',
  timezone('utc', now()),
  timezone('utc', now())
from public.client_contracts cc
inner join public.quotes q on q.id = cc.quote_id and q.empresa_id = cc.empresa_id
cross join lateral jsonb_array_elements(coalesce(q.pieces, '[]'::jsonb)) with ordinality as piece(item, ordinality)
where cc.deleted_at is null
  and not exists (
    select 1
    from public.client_contract_pieces cp
    where cp.empresa_id = cc.empresa_id
      and cp.contract_id = cc.id
      and cp.quote_piece_id = nullif(piece.item ->> 'id', '')
      and cp.deleted_at is null
  );

update public.employee_activity_sessions s
set contract_id = cc.id
from public.client_contracts cc
where s.contract_id is null
  and s.quote_id is not null
  and cc.empresa_id = s.empresa_id
  and cc.quote_id = s.quote_id
  and cc.deleted_at is null;

update public.installations i
set contract_id = cc.id
from public.client_contracts cc
where i.contract_id is null
  and i.quote_id is not null
  and cc.empresa_id = i.empresa_id
  and cc.quote_id = i.quote_id
  and cc.deleted_at is null;

create or replace function public.confirm_client_contract_import(
  p_client_id text,
  p_contract_number text,
  p_contract_date date,
  p_quote_id text,
  p_pieces jsonb,
  p_actor_uid text,
  p_actor_name text
)
returns text
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_client_id text := nullif(btrim(coalesce(p_client_id, '')), '');
  v_contract_number text := nullif(btrim(coalesce(p_contract_number, '')), '');
  v_quote_client_id text;
  v_contract_id text;
  v_piece jsonb;
  v_index integer := 0;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if app_private.current_user_access_role() not in ('coordenador', 'administrativo') then
    raise exception 'Sem permissao para confirmar contratos.';
  end if;

  if v_client_id is null then
    raise exception 'Selecione um cliente.';
  end if;

  if v_contract_number is null or length(v_contract_number) > 80 then
    raise exception 'Informe o numero do contrato para conferencia manual.';
  end if;

  if not exists (select 1 from public.clients where id = v_client_id and empresa_id = v_empresa_id) then
    raise exception 'Cliente nao encontrado nesta empresa.';
  end if;

  if p_quote_id is not null and btrim(p_quote_id) <> '' then
    select client_id into v_quote_client_id
    from public.quotes
    where id = p_quote_id and empresa_id = v_empresa_id;

    if v_quote_client_id is null then
      raise exception 'Orcamento vinculado nao encontrado.';
    end if;

    if v_quote_client_id <> v_client_id then
      raise exception 'O orcamento informado nao pertence ao cliente selecionado.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ':' || lower(v_contract_number) || ':client-contract'));

  insert into public.client_contracts (
    id, empresa_id, client_id, quote_id, contract_number, contract_date, status, source, review_status, created_by_uid, created_by_name
  )
  values (
    app_private.make_entity_id(),
    v_empresa_id,
    v_client_id,
    nullif(btrim(coalesce(p_quote_id, '')), ''),
    v_contract_number,
    p_contract_date,
    'active',
    'pdf_import',
    'confirmed',
    nullif(btrim(coalesce(p_actor_uid, auth.uid()::text)), ''),
    left(btrim(coalesce(p_actor_name, '')), 120)
  )
  returning id into v_contract_id;

  if jsonb_typeof(coalesce(p_pieces, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de pecas invalida.';
  end if;

  for v_piece in select value from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb))
  loop
    v_index := v_index + 1;
    if length(btrim(coalesce(v_piece ->> 'label', v_piece ->> 'name', ''))) = 0 then
      raise exception 'Revise as pecas antes de confirmar o contrato.';
    end if;

    insert into public.client_contract_pieces (
      id, empresa_id, contract_id, quote_piece_id, piece_label, piece_type_key, sort_order, source
    )
    values (
      app_private.make_entity_id(),
      v_empresa_id,
      v_contract_id,
      nullif(left(btrim(coalesce(v_piece ->> 'quotePieceId', v_piece ->> 'id', '')), 80), ''),
      left(btrim(coalesce(v_piece ->> 'label', v_piece ->> 'name', '')), 180),
      nullif(left(btrim(coalesce(v_piece ->> 'pieceTypeKey', '')), 80), ''),
      v_index,
      'pdf_import'
    );
  end loop;

  return v_contract_id;
exception
  when unique_violation then
    raise exception 'Contrato ja cadastrado para esta empresa.';
end;
$$;

create or replace function public.start_employee_activity_with_contract(
  p_employee_id text,
  p_client_id text,
  p_contract_id text,
  p_quote_id text,
  p_function_key text,
  p_piece_id text,
  p_piece_label text,
  p_notes text,
  p_actor_uid text,
  p_actor_name text
)
returns public.employee_activity_sessions
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_function_key text := lower(trim(coalesce(p_function_key, '')));
  v_function_label text;
  v_linked_step text;
  v_client_name text;
  v_contract_client_id text;
  v_contract_quote_id text;
  v_contract_label text;
  v_piece_label text;
  v_result public.employee_activity_sessions;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada.';
  end if;

  if not app_private.current_user_can_track_employee_activity() then
    raise exception 'Voce nao tem permissao para iniciar atividades.';
  end if;

  if v_function_key = '' then
    raise exception 'Selecione a etapa ou funcao da atividade.';
  end if;

  select label, linked_production_step into v_function_label, v_linked_step
  from public.employee_function_catalog
  where empresa_id = v_empresa_id and key = v_function_key and active = true;

  if v_function_label is null then
    raise exception 'Funcao selecionada nao existe.';
  end if;

  if not exists (
    select 1 from public.employees
    where id = p_employee_id and empresa_id = v_empresa_id and active = true and status = 'ATIVO'
  ) then
    raise exception 'Funcionario indisponivel para atividade.';
  end if;

  if exists (
    select 1 from public.employee_activity_sessions
    where empresa_id = v_empresa_id and employee_id = p_employee_id and status in ('ATIVA', 'PAUSADA')
  ) then
    raise exception 'Este funcionario ja possui uma atividade aberta.';
  end if;

  select cc.client_id, cc.quote_id, 'Contrato ' || cc.contract_number
  into v_contract_client_id, v_contract_quote_id, v_contract_label
  from public.client_contracts cc
  where cc.id = nullif(btrim(coalesce(p_contract_id, '')), '')
    and cc.empresa_id = v_empresa_id
    and cc.deleted_at is null;

  if v_contract_client_id is null then
    raise exception 'Contrato informado nao foi encontrado.';
  end if;

  if v_contract_client_id <> nullif(btrim(coalesce(p_client_id, '')), '') then
    raise exception 'O contrato informado nao pertence ao cliente selecionado.';
  end if;

  if nullif(btrim(coalesce(p_quote_id, '')), '') is not null and v_contract_quote_id is distinct from nullif(btrim(coalesce(p_quote_id, '')), '') then
    raise exception 'O orcamento informado nao pertence ao contrato selecionado.';
  end if;

  select name into v_client_name
  from public.clients
  where id = v_contract_client_id and empresa_id = v_empresa_id;

  if nullif(btrim(coalesce(p_piece_id, '')), '') is not null then
    select piece_label into v_piece_label
    from public.client_contract_pieces
    where empresa_id = v_empresa_id
      and contract_id = p_contract_id
      and (
        id = p_piece_id
        or quote_piece_id = p_piece_id
      )
      and deleted_at is null
    limit 1;

    if v_piece_label is null then
      raise exception 'A peca informada nao pertence ao contrato selecionado.';
    end if;
  end if;

  insert into public.employee_activity_sessions (
    id, empresa_id, employee_id, client_id, quote_id, contract_id, client_name_snapshot, quote_label_snapshot,
    function_key, function_label, linked_production_step, piece_id, piece_label, notes, status, started_at,
    created_by_uid, created_by_name, updated_by_uid, updated_by_name
  )
  values (
    app_private.make_entity_id(), v_empresa_id, p_employee_id, v_contract_client_id, v_contract_quote_id, p_contract_id,
    left(coalesce(v_client_name, ''), 160), left(coalesce(v_contract_label, ''), 200),
    v_function_key, left(v_function_label, 120), nullif(trim(coalesce(v_linked_step, '')), ''),
    nullif(trim(coalesce(p_piece_id, '')), ''), nullif(left(trim(coalesce(v_piece_label, p_piece_label, '')), 160), ''),
    nullif(left(coalesce(p_notes, ''), 1000), ''), 'ATIVA', timezone('utc', now()),
    nullif(trim(coalesce(p_actor_uid, '')), ''), left(trim(coalesce(p_actor_name, '')), 120),
    nullif(trim(coalesce(p_actor_uid, '')), ''), left(trim(coalesce(p_actor_name, '')), 120)
  )
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.create_installation_with_contract(
  p_client_id text,
  p_contract_id text,
  p_quote_id text,
  p_installation_date timestamptz,
  p_installer_employee_id text,
  p_notes text,
  p_created_by_uid text,
  p_created_by_name text,
  p_checklist_items jsonb
)
returns text
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_contract_client_id text;
  v_contract_quote_id text;
  v_installation_id text;
begin
  if auth.uid() is null or v_empresa_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_contract_id is null or btrim(p_contract_id) = '' then
    raise exception 'Selecione um contrato para criar a instalacao.';
  end if;

  select client_id, quote_id
  into v_contract_client_id, v_contract_quote_id
  from public.client_contracts
  where id = p_contract_id
    and empresa_id = v_empresa_id
    and deleted_at is null;

  if v_contract_client_id is null then
    raise exception 'Contrato informado nao foi encontrado.';
  end if;

  if v_contract_client_id <> p_client_id then
    raise exception 'O contrato informado nao pertence ao cliente selecionado.';
  end if;

  if p_quote_id is not null and btrim(p_quote_id) <> '' and v_contract_quote_id is distinct from p_quote_id then
    raise exception 'O orcamento informado nao pertence ao contrato selecionado.';
  end if;

  v_installation_id := public.create_installation_with_checklist(
    p_client_id,
    v_contract_quote_id,
    p_installation_date,
    p_installer_employee_id,
    p_notes,
    p_created_by_uid,
    p_created_by_name,
    p_checklist_items
  );

  update public.installations
  set contract_id = p_contract_id,
      updated_at = timezone('utc', now())
  where id = v_installation_id
    and empresa_id = v_empresa_id;

  return v_installation_id;
end;
$$;

revoke all on function public.confirm_client_contract_import(text, text, date, text, jsonb, text, text) from public;
revoke all on function public.confirm_client_contract_import(text, text, date, text, jsonb, text, text) from anon;
grant execute on function public.confirm_client_contract_import(text, text, date, text, jsonb, text, text) to authenticated;

revoke all on function public.start_employee_activity_with_contract(text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.start_employee_activity_with_contract(text, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.start_employee_activity_with_contract(text, text, text, text, text, text, text, text, text, text) to authenticated;

revoke all on function public.create_installation_with_contract(text, text, text, timestamptz, text, text, text, text, jsonb) from public;
revoke all on function public.create_installation_with_contract(text, text, text, timestamptz, text, text, text, text, jsonb) from anon;
grant execute on function public.create_installation_with_contract(text, text, text, timestamptz, text, text, text, text, jsonb) to authenticated;
