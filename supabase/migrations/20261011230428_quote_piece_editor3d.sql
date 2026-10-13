-- Additive, isolated Beta storage. No changes/backfill to quotes, pieces or existing policies.
-- Authorization grants are managed only by the trusted database administrator/service role.
create table public.quote_editor3d_access_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  empresa_id text not null references public.empresas(id),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(user_id,empresa_id)
);
alter table public.quote_editor3d_access_grants enable row level security;
revoke all on public.quote_editor3d_access_grants from public,anon,authenticated;
grant all on public.quote_editor3d_access_grants to service_role;
create policy trusted_grants on public.quote_editor3d_access_grants for all to service_role using(true) with check(true);

-- This read-only elevated helper is necessary to read trusted auth.users identity and protected
-- grants. It accepts no caller identity or role. Existing self-editable user roles cannot grant Beta.
create function app_private.quote_editor3d_authorized(p_write boolean) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from auth.users a
    join lateral(select u.empresa_id,u.blocked,u.role,u.permissions from public.users u
      where u.auth_user_id=a.id or u.id=a.id::text order by u.updated_at desc nulls last,u.id limit 1) u on true
    where a.id=auth.uid() and u.blocked is not true and u.empresa_id=app_private.current_empresa_id()
      and (lower(a.email)='brian_takiya77@outlook.com' and a.email_confirmed_at is not null
        or exists(select 1 from public.quote_editor3d_access_grants g where g.user_id=a.id and g.empresa_id=u.empresa_id and g.enabled))
      and (lower(a.email)='brian_takiya77@outlook.com' and a.email_confirmed_at is not null
        or coalesce(u.permissions #> array['orcamento',case when p_write then 'editar' else 'visualizar' end]='true'::jsonb,
          u.role in ('vendedor','coordenador')))
  );
$$;
revoke all on function app_private.quote_editor3d_authorized(boolean) from public,anon;
grant execute on function app_private.quote_editor3d_authorized(boolean) to authenticated;

create function app_private.valid_editor3d_model(p_model jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare d jsonb; k text; n numeric;
begin
  if p_model is null or jsonb_typeof(p_model)<>'object' or octet_length(p_model::text)>1024
    or (select count(*) from jsonb_object_keys(p_model))<>3
    or p_model->'schemaVersion' is distinct from '1'::jsonb
    or p_model->>'type' is distinct from 'rectangular_countertop' then return false; end if;
  d:=p_model->'dimensions';
  if d is null or jsonb_typeof(d)<>'object' or (select count(*) from jsonb_object_keys(d))<>3 then return false; end if;
  foreach k in array array['lengthMm','depthMm','thicknessMm'] loop
    if jsonb_typeof(d->k) is distinct from 'number' then return false; end if;
    n:=(d->>k)::numeric;
    if n<>trunc(n) or n < (case k when 'thicknessMm' then 10 else 100 end)
      or n > (case k when 'lengthMm' then 6000 when 'depthMm' then 2500 else 200 end) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function app_private.valid_editor3d_model(jsonb) from public,anon;
grant execute on function app_private.valid_editor3d_model(jsonb) to authenticated,service_role;

create function app_private.editor3d_valid_link(p_quote_id text,p_piece_id text,p_empresa_id text) returns boolean
language sql stable security invoker set search_path='' as $$
  select p_piece_id ~ '^[A-Za-z0-9_-]{1,100}$' and exists(select 1 from public.quotes q
    where q.id=p_quote_id and q.empresa_id=p_empresa_id
      and (select count(*) from jsonb_array_elements(case when jsonb_typeof(q.pieces)='array' then q.pieces else '[]'::jsonb end) p
        where p->>'id'=p_piece_id)=1
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(q.pieces)='array' then q.pieces else '[]'::jsonb end) p
        where jsonb_typeof(p->'id')='string' and p->>'id'=p_piece_id));
$$;
revoke all on function app_private.editor3d_valid_link(text,text,text) from public,anon;
grant execute on function app_private.editor3d_valid_link(text,text,text) to authenticated,service_role;

create table public.quote_piece_drawings (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  quote_id text not null references public.quotes(id) on delete cascade,
  piece_id text not null check(piece_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  schema_version integer not null default 1 check(schema_version=1),
  model jsonb not null check(app_private.valid_editor3d_model(model)),
  revision integer not null default 1 check(revision>=1),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(quote_id,piece_id)
);
create index quote_piece_drawings_empresa on public.quote_piece_drawings(empresa_id);
alter table public.quote_piece_drawings enable row level security;
revoke all on public.quote_piece_drawings from public,anon,authenticated;
grant select,insert,update on public.quote_piece_drawings to authenticated;
grant all on public.quote_piece_drawings to service_role;
create policy editor3d_read on public.quote_piece_drawings for select to authenticated
  using(empresa_id=(select app_private.current_empresa_id()) and (select app_private.quote_editor3d_authorized(false))
    and app_private.editor3d_valid_link(quote_id,piece_id,empresa_id));
create policy editor3d_insert on public.quote_piece_drawings for insert to authenticated
  with check(empresa_id=(select app_private.current_empresa_id()) and (select app_private.quote_editor3d_authorized(true))
    and app_private.editor3d_valid_link(quote_id,piece_id,empresa_id));
create policy editor3d_update on public.quote_piece_drawings for update to authenticated
  using(empresa_id=(select app_private.current_empresa_id()) and (select app_private.quote_editor3d_authorized(true)))
  with check(empresa_id=(select app_private.current_empresa_id()) and (select app_private.quote_editor3d_authorized(true))
    and app_private.editor3d_valid_link(quote_id,piece_id,empresa_id));

create function app_private.editor3d_drawing_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not app_private.quote_editor3d_authorized(true) then raise exception 'Sem autorização para o Editor 3D Beta' using errcode='42501'; end if;
  -- Share lock serializes against concurrent edits/removal of the official piece JSON.
  perform 1 from public.quotes where id=new.quote_id and empresa_id=new.empresa_id for share;
  if not app_private.editor3d_valid_link(new.quote_id,new.piece_id,new.empresa_id) then raise exception 'Salve o orçamento e a peça com ID único antes de vincular o desenho'; end if;
  if not app_private.valid_editor3d_model(new.model) or new.schema_version<>1 then raise exception 'Modelo geométrico inválido'; end if;
  if tg_op='UPDATE' then
    if (new.id,new.quote_id,new.piece_id,new.empresa_id,new.schema_version,new.created_by,new.created_at)
      is distinct from (old.id,old.quote_id,old.piece_id,old.empresa_id,old.schema_version,old.created_by,old.created_at) then raise exception 'Vínculo do desenho é imutável'; end if;
    if new.revision<>old.revision+1 then raise exception 'Conflito de revisão do desenho' using errcode='40001'; end if;
  else
    if new.revision<>1 then raise exception 'Revisão inicial inválida'; end if;
    new.created_by:=auth.uid(); new.created_at:=now();
  end if;
  new.updated_by:=auth.uid(); new.updated_at:=now();
  return new;
end $$;
revoke all on function app_private.editor3d_drawing_guard() from public,anon;
grant execute on function app_private.editor3d_drawing_guard() to authenticated;
create trigger editor3d_drawing_guard before insert or update on public.quote_piece_drawings
  for each row execute function app_private.editor3d_drawing_guard();

create function public.quote_editor3d_access() returns boolean
language sql stable security invoker set search_path='' as $$select app_private.quote_editor3d_authorized(true)$$;

create function public.quote_piece_drawing_get(p_quote_id text,p_piece_id text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not app_private.quote_editor3d_authorized(false) then raise exception 'Sem autorização para o Editor 3D Beta' using errcode='42501'; end if;
  if not app_private.editor3d_valid_link(p_quote_id,p_piece_id,app_private.current_empresa_id()) then raise exception 'Salve o orçamento e a peça com ID único antes de vincular o desenho'; end if;
  select jsonb_build_object('id',d.id,'quote_id',d.quote_id,'piece_id',d.piece_id,'schema_version',d.schema_version,
    'model',d.model,'revision',d.revision,'created_at',d.created_at,'updated_at',d.updated_at) into result
  from public.quote_piece_drawings d where d.quote_id=p_quote_id and d.piece_id=p_piece_id;
  return result;
end $$;

create function public.quote_piece_drawing_save(p_quote_id text,p_piece_id text,p_model jsonb,p_expected_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.quote_piece_drawings;
begin
  if not app_private.quote_editor3d_authorized(true) then raise exception 'Sem autorização para o Editor 3D Beta' using errcode='42501'; end if;
  if not app_private.valid_editor3d_model(p_model) then raise exception 'Modelo geométrico inválido ou maior que 1 KiB'; end if;
  if p_quote_id is null or length(p_quote_id)>100 or p_piece_id is null or length(p_piece_id)>100 then raise exception 'Vínculo inválido'; end if;
  perform 1 from public.quotes where id=p_quote_id and empresa_id=app_private.current_empresa_id() for share;
  if not app_private.editor3d_valid_link(p_quote_id,p_piece_id,app_private.current_empresa_id()) then raise exception 'Salve o orçamento e a peça com ID único antes de vincular o desenho'; end if;
  if p_expected_revision is null then
    begin
      insert into public.quote_piece_drawings(empresa_id,quote_id,piece_id,model)
      values(app_private.current_empresa_id(),p_quote_id,p_piece_id,p_model) returning * into d;
    exception when unique_violation then raise exception 'Desenho criado em outra sessão. Recarregue explicitamente para comparar.' using errcode='40001'; end;
  else
    if p_expected_revision<1 or p_expected_revision>=2147483647 then raise exception 'Revisão inválida'; end if;
    update public.quote_piece_drawings set model=p_model,revision=p_expected_revision+1
    where quote_id=p_quote_id and piece_id=p_piece_id and revision=p_expected_revision returning * into d;
    if d.id is null then raise exception 'Desenho alterado em outra sessão. Suas alterações locais foram preservadas.' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('id',d.id,'quote_id',d.quote_id,'piece_id',d.piece_id,'schema_version',d.schema_version,
    'model',d.model,'revision',d.revision,'created_at',d.created_at,'updated_at',d.updated_at);
end $$;
revoke all on function public.quote_editor3d_access(),public.quote_piece_drawing_get(text,text),public.quote_piece_drawing_save(text,text,jsonb,integer) from public,anon;
grant execute on function public.quote_editor3d_access(),public.quote_piece_drawing_get(text,text),public.quote_piece_drawing_save(text,text,jsonb,integer) to authenticated;
