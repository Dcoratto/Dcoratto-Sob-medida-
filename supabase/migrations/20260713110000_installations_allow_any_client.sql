alter table public.installations
  alter column quote_id drop not null;

drop index if exists public.idx_installations_active_quote;

create or replace function public.create_installation_with_checklist(
  p_client_id text,
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
security invoker
set search_path = public
as $$
declare
  v_installation_id text := public.installation_make_id();
  v_empresa_id text := app_private.current_empresa_id();
  v_quote_client_id text;
  item jsonb;
begin
  if v_empresa_id is null then
    raise exception 'Empresa nao identificada para criar a instalacao.';
  end if;

  if jsonb_typeof(coalesce(p_checklist_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_checklist_items) = 0 then
    raise exception 'Checklist padrao obrigatorio nao informado.';
  end if;

  if not exists (
    select 1
    from public.clients
    where id = p_client_id
      and empresa_id = v_empresa_id
  ) then
    raise exception 'Cliente nao encontrado para criar a instalacao.';
  end if;

  if nullif(trim(coalesce(p_quote_id, '')), '') is not null then
    select client_id
    into v_quote_client_id
    from public.quotes
    where id = p_quote_id
      and empresa_id = v_empresa_id;

    if v_quote_client_id is null then
      raise exception 'Projeto relacionado nao encontrado.';
    end if;

    if v_quote_client_id <> p_client_id then
      raise exception 'Cliente e projeto relacionado nao correspondem.';
    end if;
  end if;

  if p_installer_employee_id is not null and not exists (
    select 1
    from public.employees
    where id = p_installer_employee_id
      and empresa_id = v_empresa_id
  ) then
    raise exception 'Instalador responsavel nao encontrado.';
  end if;

  insert into public.installations (
    id,
    empresa_id,
    client_id,
    quote_id,
    installer_employee_id,
    installation_date,
    notes,
    created_by_uid,
    created_by_name
  )
  values (
    v_installation_id,
    v_empresa_id,
    p_client_id,
    nullif(trim(coalesce(p_quote_id, '')), ''),
    nullif(p_installer_employee_id, ''),
    p_installation_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_created_by_uid, '')), ''),
    nullif(trim(coalesce(p_created_by_name, '')), '')
  );

  for item in select * from jsonb_array_elements(p_checklist_items)
  loop
    insert into public.installation_checklist_items (
      id,
      empresa_id,
      installation_id,
      template_key,
      group_key,
      group_label,
      title,
      sort_order,
      required
    )
    values (
      public.installation_make_id(),
      v_empresa_id,
      v_installation_id,
      coalesce(item->>'templateKey', public.installation_make_id()),
      coalesce(item->>'groupKey', 'general'),
      coalesce(item->>'groupLabel', 'Checklist'),
      coalesce(item->>'title', 'Item'),
      coalesce((item->>'sortOrder')::integer, 0),
      coalesce((item->>'required')::boolean, true)
    );
  end loop;

  insert into public.installation_history (
    id,
    empresa_id,
    installation_id,
    event_type,
    message,
    metadata,
    user_uid,
    user_name
  )
  values (
    public.installation_make_id(),
    v_empresa_id,
    v_installation_id,
    'installation_created',
    coalesce(nullif(trim(p_created_by_name), ''), 'Usuario') || ' criou a instalacao',
    jsonb_build_object('clientId', p_client_id, 'quoteId', nullif(trim(coalesce(p_quote_id, '')), '')),
    nullif(trim(coalesce(p_created_by_uid, '')), ''),
    nullif(trim(coalesce(p_created_by_name, '')), '')
  );

  perform public.installation_recalculate_summary(v_installation_id);

  return v_installation_id;
end;
$$;
