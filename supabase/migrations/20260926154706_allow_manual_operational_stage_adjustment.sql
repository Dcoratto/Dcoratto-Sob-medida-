create or replace function app_private.operational_validate_stage_transition() returns trigger
language plpgsql set search_path='' as $$
declare
  flow constant text[] := array['sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed','aftercare'];
  from_index integer;
  to_index integer;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if current_setting('app.operational_stage_adjustment', true) = 'manual' then return new; end if;
  from_index := array_position(flow, old.stage);
  to_index := array_position(flow, new.stage);
  if from_index is null or to_index is null or to_index > from_index + 1 then
    raise exception 'Avance uma etapa por vez no fluxo operacional';
  end if;
  return new;
end $$;

create or replace function app_private.operational_manual_stage_adjust(p_contract_id text,p_version integer,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  tenant text:=app_private.current_empresa_id();
  c public.client_contracts;
  o public.operational_contracts;
  target text:=p_payload->>'stage';
  reason text:=btrim(coalesce(p_payload->>'reason',''));
  pieces_total integer:=0;
  pieces_installed integer:=0;
  actor text;
  payload jsonb;
begin
  if auth.uid() is null or tenant is null or octet_length(p_payload::text)>20000 or not app_private.operational_permission('editar') then
    raise exception 'Sem permissao';
  end if;
  if target is null or target not in ('sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed') then
    raise exception 'Etapa invalida';
  end if;
  if length(reason)=0 then raise exception 'Informe o motivo do ajuste manual'; end if;
  if length(reason)>2000 or reason~'[<>]' then raise exception 'Texto invalido (maximo 2000 caracteres, sem HTML)'; end if;

  select * into c
  from public.client_contracts
  where id=p_contract_id and empresa_id=tenant and deleted_at is null and status='active' and review_status='confirmed'
  for update;
  if c.id is null or not exists(select 1 from public.client_contract_pieces where contract_id=c.id and empresa_id=tenant and deleted_at is null) then
    raise exception 'Contrato indisponivel';
  end if;

  insert into public.operational_contracts(contract_id,empresa_id) values(c.id,tenant) on conflict do nothing;
  select * into o from public.operational_contracts where contract_id=c.id for update;
  if p_version is null or o.version<>p_version then
    raise exception 'Contrato alterado por outra operacao. Atualize o painel.' using errcode='40001';
  end if;
  if o.stage='aftercare' then raise exception 'Resolva as ocorrencias de pos-instalacao'; end if;
  if o.stage=target then return app_private.operational_detail(c.id); end if;

  select count(*),count(op.installed_at)
    into pieces_total,pieces_installed
  from public.client_contract_pieces p
  left join public.operational_pieces op on op.piece_id=p.id and op.contract_id=c.id
  where p.contract_id=c.id and p.empresa_id=tenant and p.deleted_at is null;

  perform set_config('app.operational_stage_adjustment','manual',true);
  update public.operational_contracts
    set stage=target,version=version+1,updated_at=now()
  where contract_id=c.id;

  select coalesce(u.nome,u.name,u.email) into actor
  from public.users u
  where u.auth_user_id=auth.uid() or u.id=auth.uid()::text
  order by u.updated_at desc nulls last
  limit 1;

  payload:=jsonb_build_object(
    'from',o.stage,
    'to',target,
    'reason',reason,
    'historical_completed',target='completed' and pieces_installed<pieces_total,
    'piece_count',pieces_total,
    'installed_count',pieces_installed
  );
  insert into public.operational_events(empresa_id,contract_id,kind,payload,actor_uid,actor_name)
  values(tenant,c.id,'manual_stage_adjust',payload,auth.uid(),coalesce(actor,'Usuario'));
  return app_private.operational_detail(c.id);
end $$;

create or replace function public.operational_mutate(p_contract_id text,p_version integer,p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  flow constant text[] := array['sold','measurement','executive','approval','ready','cutting','finishing','assembly','inspection','final_finishing','delivery','installation','completed','aftercare'];
  current_stage text;
begin
  if p_action in ('install_pieces','correct_installation') then
    return app_private.operational_installation_mutate(p_contract_id,p_version,p_action,p_payload);
  end if;
  if p_action='manual_stage_adjust' then
    return app_private.operational_manual_stage_adjust(p_contract_id,p_version,p_payload);
  end if;
  if p_action='move' then
    select stage into current_stage from public.operational_contracts where contract_id=p_contract_id and empresa_id=app_private.current_empresa_id();
    current_stage:=coalesce(current_stage,'sold');
    if array_position(flow,p_payload->>'stage') < array_position(flow,current_stage) and length(btrim(coalesce(p_payload->>'reason','')))=0 then
      raise exception 'Informe o motivo do retorno de etapa';
    end if;
  end if;
  return app_private.operational_mutate(p_contract_id,p_version,p_action,p_payload);
end $$;

revoke all on function app_private.operational_manual_stage_adjust(text,integer,jsonb) from public,anon;
grant execute on function app_private.operational_manual_stage_adjust(text,integer,jsonb) to authenticated;
revoke all on function app_private.operational_validate_stage_transition() from public,anon,authenticated;
