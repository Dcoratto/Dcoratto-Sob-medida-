alter table public.materials
  add column if not exists quote_description text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_quote_description_length_check'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_quote_description_length_check
      check (quote_description is null or char_length(btrim(quote_description)) <= 500);
  end if;
end $$;

create table if not exists public.quote_presentations (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on update cascade,
  quote_id text not null,
  current_version_id uuid,
  current_version_number integer not null default 0 check (current_version_number >= 0),
  latest_status text not null default 'RASCUNHO'
    check (latest_status in ('RASCUNHO', 'GERADO', 'COMPARTILHADO', 'VISUALIZADO', 'ACEITO', 'EXPIRADO', 'REVOGADO')),
  last_generated_at timestamptz,
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (empresa_id, quote_id)
);

create table if not exists public.quote_presentation_versions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.quote_presentations(id) on delete cascade,
  empresa_id text not null references public.empresas(id) on update cascade,
  quote_id text not null,
  version_number integer not null check (version_number >= 1),
  proposal_code text not null,
  public_token text not null unique check (char_length(btrim(public_token)) between 24 and 120),
  status text not null default 'GERADO'
    check (status in ('GERADO', 'COMPARTILHADO', 'VISUALIZADO', 'ACEITO', 'EXPIRADO', 'REVOGADO')),
  snapshot jsonb not null default '{}'::jsonb,
  valid_until timestamptz,
  shared_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_by_uid text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (presentation_id, version_number)
);

create table if not exists public.quote_presentation_acceptances (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.quote_presentations(id) on delete cascade,
  version_id uuid not null references public.quote_presentation_versions(id) on delete cascade,
  empresa_id text not null references public.empresas(id) on update cascade,
  quote_id text not null,
  version_number integer not null check (version_number >= 1),
  accepted_name text not null check (char_length(btrim(accepted_name)) between 2 and 120),
  acceptance_token text not null unique check (char_length(btrim(acceptance_token)) between 24 and 120),
  accepted_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (version_id)
);

create table if not exists public.quote_presentation_events (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.quote_presentations(id) on delete cascade,
  version_id uuid references public.quote_presentation_versions(id) on delete cascade,
  acceptance_id uuid references public.quote_presentation_acceptances(id) on delete set null,
  empresa_id text not null references public.empresas(id) on update cascade,
  quote_id text not null,
  version_number integer check (version_number is null or version_number >= 1),
  event_type text not null
    check (event_type in ('created', 'generated', 'shared', 'viewed', 'accepted', 'revoked', 'expired')),
  event_message text not null check (char_length(btrim(event_message)) between 2 and 240),
  actor_uid text,
  actor_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.quote_presentations
  drop constraint if exists quote_presentations_current_version_id_fkey;

alter table public.quote_presentations
  add constraint quote_presentations_current_version_id_fkey
  foreign key (current_version_id)
  references public.quote_presentation_versions(id)
  on delete set null;

create index if not exists idx_quote_presentations_quote
  on public.quote_presentations(empresa_id, quote_id);
create index if not exists idx_quote_presentations_status
  on public.quote_presentations(empresa_id, latest_status, updated_at desc);
create index if not exists idx_quote_presentation_versions_quote
  on public.quote_presentation_versions(empresa_id, quote_id, created_at desc);
create index if not exists idx_quote_presentation_versions_presentation
  on public.quote_presentation_versions(presentation_id, version_number desc);
create index if not exists idx_quote_presentation_versions_token
  on public.quote_presentation_versions(public_token);
create index if not exists idx_quote_presentation_versions_status
  on public.quote_presentation_versions(empresa_id, status, created_at desc);
create index if not exists idx_quote_presentation_acceptances_quote
  on public.quote_presentation_acceptances(empresa_id, quote_id, created_at desc);
create index if not exists idx_quote_presentation_events_quote
  on public.quote_presentation_events(empresa_id, quote_id, created_at desc);
create index if not exists idx_quote_presentation_events_version
  on public.quote_presentation_events(version_id, created_at desc);

create trigger set_updated_at_quote_presentations
before update on public.quote_presentations
for each row execute function public.set_updated_at();

create trigger set_updated_at_quote_presentation_versions
before update on public.quote_presentation_versions
for each row execute function public.set_updated_at();

create or replace function app_private.strip_html(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(coalesce(p_value, ''), E'<[^>]+>', ' ', 'g'),
        E'[\\n\\r\\t]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function app_private.quote_presentation_status_row(
  p_status text,
  p_valid_until timestamptz,
  p_revoked_at timestamptz,
  p_accepted_at timestamptz
)
returns text
language sql
stable
as $$
  select case
    when p_revoked_at is not null then 'REVOGADO'
    when p_accepted_at is not null then 'ACEITO'
    when p_valid_until is not null and p_valid_until < timezone('utc', now()) then 'EXPIRADO'
    else coalesce(nullif(btrim(p_status), ''), 'GERADO')
  end;
$$;

create or replace function app_private.build_quote_presentation_snapshot(
  p_quote public.quotes,
  p_client public.clients,
  p_material public.materials,
  p_settings public.settings,
  p_version_number integer
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_piece_count integer := coalesce(jsonb_array_length(coalesce(p_quote.pieces, '[]'::jsonb)), 0);
  v_material_name text := coalesce(nullif(btrim(p_quote.material_name), ''), nullif(btrim(p_material.name), ''));
  v_material_description text := app_private.strip_html(p_material.quote_description);
  v_piece_rows jsonb := '[]'::jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', coalesce(nullif(btrim(piece ->> 'id'), ''), concat('piece-', ordinality::text)),
          'name', coalesce(nullif(btrim(piece ->> 'name'), ''), 'Peça'),
          'environment', nullif(btrim(coalesce(p_quote.environment, '')), ''),
          'material', v_material_name,
          'dimensionsLabel',
            case
              when nullif(piece ->> 'width', '') is not null and nullif(piece ->> 'length', '') is not null then
                replace(trim(to_char(abs(coalesce((piece ->> 'width')::numeric, 0)), 'FM999999990D##')), '.', ',')
                || ' x ' ||
                replace(trim(to_char(abs(coalesce((piece ->> 'length')::numeric, 0)), 'FM999999990D##')), '.', ',')
                || ' ' || case when lower(coalesce(piece ->> 'unit', 'cm')) = 'm' then 'm' else 'cm' end
              else null
            end,
          'imageUrl', coalesce(nullif(piece ->> 'proposalImageUrl', ''), nullif(piece ->> 'previewUrl', '')),
          'notes', app_private.strip_html(piece ->> 'notes')
        )
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  into v_piece_rows
  from jsonb_array_elements(coalesce(p_quote.pieces, '[]'::jsonb)) with ordinality as pieces(piece, ordinality);

  return jsonb_strip_nulls(
    jsonb_build_object(
      'proposalCode', concat('DC-', upper(right(coalesce(p_quote.id, ''), 6)), '-V', p_version_number::text),
      'versionLabel', concat('V', p_version_number::text),
      'generatedAt', timezone('utc', now()),
      'validUntil', p_quote.validity_date,
      'heroTitle', 'Proposta Personalizada',
      'heroSubtitle', coalesce(
        nullif(btrim(coalesce(p_quote.environment, '')), ''),
        case when v_piece_count > 1 then 'Projeto sob medida para o seu ambiente' else 'Projeto sob medida para o seu espaço' end
      ),
      'company', jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(nullif(btrim(p_settings.company_name), ''), 'D''Coratto'),
        'phone', nullif(btrim(coalesce(p_settings.phone, '')), ''),
        'email', nullif(btrim(coalesce(p_settings.email, '')), ''),
        'address', nullif(btrim(coalesce(p_settings.address, '')), ''),
        'logoUrl', nullif(btrim(coalesce(p_settings.logo_url, '')), '')
      )),
      'client', jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(nullif(btrim(p_quote.client_name), ''), nullif(btrim(p_client.name), ''), 'Cliente'),
        'city', nullif(btrim(coalesce(p_quote.city, p_client.city, '')), ''),
        'neighborhood', nullif(btrim(coalesce(p_quote.neighborhood, p_client.neighborhood, '')), '')
      )),
      'summary', jsonb_strip_nulls(jsonb_build_object(
        'environment', nullif(btrim(coalesce(p_quote.environment, '')), ''),
        'responsible', nullif(btrim(coalesce(p_quote.responsible, '')), ''),
        'pieceCount', v_piece_count
      )),
      'material', case
        when v_material_name is null
          and nullif(btrim(coalesce(p_material.category, '')), '') is null
          and nullif(btrim(coalesce(p_material.image_url, '')), '') is null
          and v_material_description is null
        then null
        else jsonb_strip_nulls(jsonb_build_object(
          'name', v_material_name,
          'category', nullif(btrim(coalesce(p_material.category, '')), ''),
          'materialLine', nullif(btrim(coalesce(p_material.material_line, '')), ''),
          'materialType', nullif(btrim(coalesce(p_material.material_type, '')), ''),
          'thicknessLabel', nullif(btrim(coalesce(p_material.thickness_label, '')), ''),
          'texture', nullif(btrim(coalesce(p_material.texture, '')), ''),
          'description', v_material_description,
          'imageUrl', nullif(btrim(coalesce(p_material.original_url, p_material.medium_url, p_material.thumbnail_url, p_material.image_url, '')), '')
        ))
      end,
      'pieces', v_piece_rows,
      'investment', jsonb_build_object(
        'label', case when v_piece_count > 1 then 'Projeto completo' else 'Projeto sob medida' end,
        'description', coalesce(
          nullif(btrim(coalesce(p_quote.environment, '')), ''),
          case when v_piece_count > 0 then concat(v_piece_count::text, ' peça(s) selecionada(s)') else 'Composição personalizada' end
        ),
        'totalPrice', coalesce(p_quote.total_price, 0),
        'totalArea', coalesce(p_quote.total_area, 0)
      ),
      'payment', jsonb_strip_nulls(jsonb_build_object(
        'method', nullif(btrim(coalesce(p_quote.payment_method, '')), ''),
        'mode', nullif(btrim(coalesce(p_quote.payment_mode, '')), ''),
        'totalPaymentMethod', nullif(btrim(coalesce(p_quote.total_payment_method, '')), ''),
        'remainingPaymentMethod', nullif(btrim(coalesce(p_quote.remaining_payment_method, '')), ''),
        'entryAmount', nullif(p_quote.entry_amount::text, '0.00')::numeric,
        'installmentCount', case when coalesce(p_quote.installment_count, 0) > 0 then p_quote.installment_count else null end,
        'installmentAmount', case when coalesce(p_quote.installment_amount, 0) > 0 then p_quote.installment_amount else null end,
        'notes', app_private.strip_html(p_quote.payment_notes)
      )),
      'delivery', jsonb_strip_nulls(jsonb_build_object(
        'deliveryDays', case when coalesce(p_quote.delivery_days, 0) > 0 then p_quote.delivery_days else null end,
        'deliveryDate', p_quote.delivery_date,
        'measurementDate', p_quote.measurement_date,
        'deliveryIncluded', case when coalesce(p_quote.include_delivery, false) then true else null end,
        'installationIncluded', case when coalesce(p_quote.include_labor, false) then true else null end
      )),
      'notes', jsonb_strip_nulls(jsonb_build_object(
        'commercialNotes', app_private.strip_html(p_quote.commercial_notes),
        'defaultNotes', app_private.strip_html(p_settings.default_notes)
      ))
    )
  );
end;
$$;

create or replace function app_private.insert_quote_presentation_event(
  p_presentation_id uuid,
  p_version_id uuid,
  p_acceptance_id uuid,
  p_empresa_id text,
  p_quote_id text,
  p_version_number integer,
  p_event_type text,
  p_event_message text,
  p_actor_uid text,
  p_actor_name text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
set search_path = public, pg_temp
as $$
  insert into public.quote_presentation_events (
    presentation_id,
    version_id,
    acceptance_id,
    empresa_id,
    quote_id,
    version_number,
    event_type,
    event_message,
    actor_uid,
    actor_name,
    metadata
  ) values (
    p_presentation_id,
    p_version_id,
    p_acceptance_id,
    p_empresa_id,
    p_quote_id,
    p_version_number,
    p_event_type,
    p_event_message,
    nullif(btrim(coalesce(p_actor_uid, '')), ''),
    nullif(btrim(coalesce(p_actor_name, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

create or replace function public.generate_quote_presentation_version(
  p_quote_id text,
  p_created_by_name text default null
)
returns table (
  presentation_id uuid,
  version_id uuid,
  version_number integer,
  status text,
  public_token text,
  proposal_code text,
  valid_until timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := auth.uid()::text;
  v_display_name text := nullif(btrim(coalesce(p_created_by_name, '')), '');
  v_quote public.quotes%rowtype;
  v_client public.clients%rowtype;
  v_material public.materials%rowtype;
  v_settings public.settings%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_version public.quote_presentation_versions%rowtype;
  v_version_number integer;
  v_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sessão obrigatória para gerar a proposta digital.';
  end if;

  if v_empresa_id is null then
    raise exception 'Empresa da sessão não identificada.';
  end if;

  if char_length(coalesce(p_quote_id, '')) > 120 then
    raise exception 'Orçamento inválido.';
  end if;

  if v_display_name is not null and char_length(v_display_name) > 120 then
    raise exception 'Nome do responsável excede 120 caracteres.';
  end if;

  select *
  into v_quote
  from public.quotes
  where id = p_quote_id
    and empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Orçamento não encontrado para esta empresa.';
  end if;

  select *
  into v_client
  from public.clients
  where id = v_quote.client_id
    and empresa_id = v_empresa_id;

  if v_quote.material_id is not null then
    select *
    into v_material
    from public.materials
    where id = v_quote.material_id
      and empresa_id = v_empresa_id;
  end if;

  select *
  into v_settings
  from public.settings
  where empresa_id = v_empresa_id
  order by updated_at desc nulls last
  limit 1;

  insert into public.quote_presentations (
    empresa_id,
    quote_id,
    latest_status,
    created_by_uid,
    created_by_name
  ) values (
    v_empresa_id,
    p_quote_id,
    'RASCUNHO',
    v_actor_uid,
    v_display_name
  )
  on conflict (empresa_id, quote_id) do nothing;

  select *
  into v_presentation
  from public.quote_presentations
  where empresa_id = v_empresa_id
    and quote_id = p_quote_id
  for update;

  v_version_number := coalesce(v_presentation.current_version_number, 0) + 1;
  v_snapshot := app_private.build_quote_presentation_snapshot(v_quote, v_client, v_material, v_settings, v_version_number);

  insert into public.quote_presentation_versions (
    presentation_id,
    empresa_id,
    quote_id,
    version_number,
    proposal_code,
    public_token,
    status,
    snapshot,
    valid_until,
    created_by_uid,
    created_by_name
  ) values (
    v_presentation.id,
    v_empresa_id,
    p_quote_id,
    v_version_number,
    concat('DC-', upper(right(coalesce(p_quote_id, ''), 6)), '-V', v_version_number::text),
    encode(gen_random_bytes(18), 'hex'),
    'GERADO',
    v_snapshot,
    coalesce(v_quote.validity_date, timezone('utc', now()) + interval '15 days'),
    v_actor_uid,
    v_display_name
  )
  returning *
  into v_version;

  update public.quote_presentations
  set current_version_id = v_version.id,
      current_version_number = v_version_number,
      latest_status = v_version.status,
      last_generated_at = timezone('utc', now()),
      created_by_uid = coalesce(created_by_uid, v_actor_uid),
      created_by_name = coalesce(created_by_name, v_display_name)
  where id = v_presentation.id;

  perform app_private.insert_quote_presentation_event(
    v_presentation.id,
    v_version.id,
    null,
    v_empresa_id,
    p_quote_id,
    v_version_number,
    case when v_version_number = 1 then 'created' else 'generated' end,
    case when v_version_number = 1 then 'Proposta digital criada.' else concat('Nova versão V', v_version_number::text, ' gerada.') end,
    v_actor_uid,
    v_display_name,
    jsonb_build_object('proposalCode', v_version.proposal_code)
  );

  return query
  select
    v_presentation.id,
    v_version.id,
    v_version.version_number,
    v_version.status,
    v_version.public_token,
    v_version.proposal_code,
    v_version.valid_until,
    v_version.created_at;
end;
$$;

create or replace function public.mark_quote_presentation_shared(
  p_version_id uuid,
  p_actor_name text default null
)
returns table (
  version_id uuid,
  status text,
  shared_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := auth.uid()::text;
  v_actor_name text := nullif(btrim(coalesce(p_actor_name, '')), '');
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_next_status text;
begin
  if auth.uid() is null then
    raise exception 'Sessão obrigatória para compartilhar a proposta.';
  end if;

  select *
  into v_version
  from public.quote_presentation_versions
  where id = p_version_id
    and empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Versão da proposta não encontrada.';
  end if;

  v_next_status := app_private.quote_presentation_status_row(v_version.status, v_version.valid_until, v_version.revoked_at, v_version.accepted_at);
  if v_next_status = 'GERADO' then
    v_next_status := 'COMPARTILHADO';
  end if;

  update public.quote_presentation_versions
  set status = v_next_status,
      shared_at = coalesce(shared_at, timezone('utc', now()))
  where id = v_version.id
  returning *
  into v_version;

  select * into v_presentation from public.quote_presentations where id = v_version.presentation_id for update;

  if v_presentation.current_version_id = v_version.id then
    update public.quote_presentations
    set latest_status = v_version.status
    where id = v_presentation.id;
  end if;

  if v_next_status = 'COMPARTILHADO' then
    perform app_private.insert_quote_presentation_event(
      v_presentation.id,
      v_version.id,
      null,
      v_version.empresa_id,
      v_version.quote_id,
      v_version.version_number,
      'shared',
      concat('Link da versão V', v_version.version_number::text, ' compartilhado.'),
      v_actor_uid,
      v_actor_name,
      '{}'::jsonb
    );
  end if;

  return query select v_version.id, v_version.status, v_version.shared_at;
end;
$$;

create or replace function public.revoke_quote_presentation_version(
  p_version_id uuid,
  p_actor_name text default null,
  p_reason text default null
)
returns table (
  version_id uuid,
  status text,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id text := app_private.current_empresa_id();
  v_actor_uid text := auth.uid()::text;
  v_actor_name text := nullif(btrim(coalesce(p_actor_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão obrigatória para revogar a proposta.';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Motivo da revogação excede 500 caracteres.';
  end if;

  select *
  into v_version
  from public.quote_presentation_versions
  where id = p_version_id
    and empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception 'Versão da proposta não encontrada.';
  end if;

  update public.quote_presentation_versions
  set status = 'REVOGADO',
      revoked_at = coalesce(revoked_at, timezone('utc', now())),
      revoked_reason = coalesce(v_reason, revoked_reason)
  where id = v_version.id
  returning *
  into v_version;

  select * into v_presentation from public.quote_presentations where id = v_version.presentation_id for update;

  if v_presentation.current_version_id = v_version.id then
    update public.quote_presentations
    set latest_status = 'REVOGADO'
    where id = v_presentation.id;
  end if;

  perform app_private.insert_quote_presentation_event(
    v_presentation.id,
    v_version.id,
    null,
    v_version.empresa_id,
    v_version.quote_id,
    v_version.version_number,
    'revoked',
    concat('Versão V', v_version.version_number::text, ' revogada.'),
    v_actor_uid,
    v_actor_name,
    jsonb_build_object('reason', v_reason)
  );

  return query select v_version.id, v_version.status, v_version.revoked_at;
end;
$$;

create or replace function public.get_public_quote_presentation(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_status text;
  v_first_view boolean := false;
begin
  if char_length(v_token) not between 24 and 120 then
    return jsonb_build_object('state', 'missing');
  end if;

  select *
  into v_version
  from public.quote_presentation_versions
  where public_token = v_token
  for update;

  if not found then
    return jsonb_build_object('state', 'missing');
  end if;

  select * into v_presentation from public.quote_presentations where id = v_version.presentation_id for update;

  v_status := app_private.quote_presentation_status_row(v_version.status, v_version.valid_until, v_version.revoked_at, v_version.accepted_at);

  if v_status = 'EXPIRADO' and v_version.status <> 'EXPIRADO' then
    update public.quote_presentation_versions
    set status = 'EXPIRADO'
    where id = v_version.id
    returning * into v_version;

    if v_presentation.current_version_id = v_version.id then
      update public.quote_presentations
      set latest_status = 'EXPIRADO'
      where id = v_presentation.id;
    end if;

    perform app_private.insert_quote_presentation_event(
      v_presentation.id,
      v_version.id,
      null,
      v_version.empresa_id,
      v_version.quote_id,
      v_version.version_number,
      'expired',
      concat('Versão V', v_version.version_number::text, ' expirada.'),
      null,
      null,
      '{}'::jsonb
    );
  end if;

  if v_status = 'REVOGADO' then
    return jsonb_build_object(
      'state', 'revoked',
      'status', 'REVOGADO',
      'company', coalesce(v_version.snapshot -> 'company', '{}'::jsonb),
      'versionLabel', v_version.snapshot ->> 'versionLabel'
    );
  end if;

  if v_status = 'EXPIRADO' then
    return jsonb_build_object(
      'state', 'expired',
      'status', 'EXPIRADO',
      'company', coalesce(v_version.snapshot -> 'company', '{}'::jsonb),
      'versionLabel', v_version.snapshot ->> 'versionLabel'
    );
  end if;

  if v_version.first_viewed_at is null then
    v_first_view := true;
  end if;

  update public.quote_presentation_versions
  set first_viewed_at = coalesce(first_viewed_at, timezone('utc', now())),
      last_viewed_at = timezone('utc', now()),
      status = case
        when accepted_at is not null then 'ACEITO'
        when status in ('GERADO', 'COMPARTILHADO') then 'VISUALIZADO'
        else status
      end
  where id = v_version.id
  returning * into v_version;

  if v_presentation.current_version_id = v_version.id then
    update public.quote_presentations
    set latest_status = v_version.status
    where id = v_presentation.id;
  end if;

  if v_first_view then
    perform app_private.insert_quote_presentation_event(
      v_presentation.id,
      v_version.id,
      null,
      v_version.empresa_id,
      v_version.quote_id,
      v_version.version_number,
      'viewed',
      concat('Versão V', v_version.version_number::text, ' visualizada pela primeira vez.'),
      null,
      null,
      '{}'::jsonb
    );
  end if;

  return jsonb_build_object(
    'state', 'available',
    'status', v_version.status,
    'meta', jsonb_build_object(
      'versionId', v_version.id,
      'versionNumber', v_version.version_number,
      'versionLabel', coalesce(v_version.snapshot ->> 'versionLabel', concat('V', v_version.version_number::text)),
      'proposalCode', v_version.proposal_code,
      'validUntil', v_version.valid_until,
      'firstViewedAt', v_version.first_viewed_at,
      'lastViewedAt', v_version.last_viewed_at,
      'acceptedAt', v_version.accepted_at
    ),
    'snapshot', v_version.snapshot
  );
end;
$$;

create or replace function public.accept_quote_presentation(
  p_token text,
  p_accepted_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_name text := nullif(btrim(coalesce(p_accepted_name, '')), '');
  v_version public.quote_presentation_versions%rowtype;
  v_presentation public.quote_presentations%rowtype;
  v_acceptance public.quote_presentation_acceptances%rowtype;
  v_status text;
begin
  if char_length(v_token) not between 24 and 120 then
    raise exception 'Proposta inválida.';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe o nome completo para confirmar o aceite.';
  end if;

  select *
  into v_version
  from public.quote_presentation_versions
  where public_token = v_token
  for update;

  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  select * into v_presentation from public.quote_presentations where id = v_version.presentation_id for update;

  v_status := app_private.quote_presentation_status_row(v_version.status, v_version.valid_until, v_version.revoked_at, v_version.accepted_at);

  if v_status = 'REVOGADO' then
    raise exception 'Esta proposta foi revogada e não pode mais ser aceita.';
  end if;

  if v_status = 'EXPIRADO' then
    update public.quote_presentation_versions
    set status = 'EXPIRADO'
    where id = v_version.id
    returning * into v_version;
    if v_presentation.current_version_id = v_version.id then
      update public.quote_presentations set latest_status = 'EXPIRADO' where id = v_presentation.id;
    end if;
    raise exception 'Esta proposta está expirada. Solicite uma nova versão à D''Coratto.';
  end if;

  if exists (
    select 1
    from public.quote_presentation_acceptances
    where version_id = v_version.id
  ) then
    raise exception 'Esta proposta já foi aceita anteriormente.';
  end if;

  insert into public.quote_presentation_acceptances (
    presentation_id,
    version_id,
    empresa_id,
    quote_id,
    version_number,
    accepted_name,
    acceptance_token,
    accepted_snapshot
  ) values (
    v_presentation.id,
    v_version.id,
    v_version.empresa_id,
    v_version.quote_id,
    v_version.version_number,
    v_name,
    encode(gen_random_bytes(18), 'hex'),
    v_version.snapshot
  )
  returning *
  into v_acceptance;

  update public.quote_presentation_versions
  set status = 'ACEITO',
      accepted_at = coalesce(accepted_at, timezone('utc', now())),
      first_viewed_at = coalesce(first_viewed_at, timezone('utc', now())),
      last_viewed_at = timezone('utc', now())
  where id = v_version.id
  returning * into v_version;

  if v_presentation.current_version_id = v_version.id then
    update public.quote_presentations
    set latest_status = 'ACEITO'
    where id = v_presentation.id;
  end if;

  perform app_private.insert_quote_presentation_event(
    v_presentation.id,
    v_version.id,
    v_acceptance.id,
    v_version.empresa_id,
    v_version.quote_id,
    v_version.version_number,
    'accepted',
    concat('Versão V', v_version.version_number::text, ' aceita pelo cliente.'),
    null,
    v_name,
    jsonb_build_object('acceptedName', v_name)
  );

  return jsonb_build_object(
    'accepted', true,
    'acceptedAt', v_version.accepted_at,
    'acceptedName', v_name,
    'versionLabel', coalesce(v_version.snapshot ->> 'versionLabel', concat('V', v_version.version_number::text))
  );
end;
$$;

alter table public.quote_presentations enable row level security;
alter table public.quote_presentation_versions enable row level security;
alter table public.quote_presentation_acceptances enable row level security;
alter table public.quote_presentation_events enable row level security;

drop policy if exists quote_presentations_tenant_all on public.quote_presentations;
create policy quote_presentations_tenant_all
on public.quote_presentations
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists quote_presentation_versions_tenant_all on public.quote_presentation_versions;
create policy quote_presentation_versions_tenant_all
on public.quote_presentation_versions
for all
to authenticated
using (empresa_id = app_private.current_empresa_id())
with check (empresa_id = app_private.current_empresa_id());

drop policy if exists quote_presentation_acceptances_tenant_select on public.quote_presentation_acceptances;
create policy quote_presentation_acceptances_tenant_select
on public.quote_presentation_acceptances
for select
to authenticated
using (empresa_id = app_private.current_empresa_id());

drop policy if exists quote_presentation_events_tenant_select on public.quote_presentation_events;
create policy quote_presentation_events_tenant_select
on public.quote_presentation_events
for select
to authenticated
using (empresa_id = app_private.current_empresa_id());

revoke all on table public.quote_presentations,
  public.quote_presentation_versions,
  public.quote_presentation_acceptances,
  public.quote_presentation_events
from anon, authenticated;

grant select on table public.quote_presentations,
  public.quote_presentation_versions,
  public.quote_presentation_acceptances,
  public.quote_presentation_events
to authenticated;

grant insert, update on table public.quote_presentations,
  public.quote_presentation_versions
to authenticated;

revoke all on function app_private.strip_html(text) from public;
revoke all on function app_private.quote_presentation_status_row(text, timestamptz, timestamptz, timestamptz) from public;
revoke all on function app_private.build_quote_presentation_snapshot(public.quotes, public.clients, public.materials, public.settings, integer) from public;
revoke all on function app_private.insert_quote_presentation_event(uuid, uuid, uuid, text, text, integer, text, text, text, text, jsonb) from public;

revoke all on function public.generate_quote_presentation_version(text, text) from public, anon;
revoke all on function public.mark_quote_presentation_shared(uuid, text) from public, anon;
revoke all on function public.revoke_quote_presentation_version(uuid, text, text) from public, anon;
revoke all on function public.get_public_quote_presentation(text) from public;
revoke all on function public.accept_quote_presentation(text, text) from public;

grant execute on function public.generate_quote_presentation_version(text, text) to authenticated;
grant execute on function public.mark_quote_presentation_shared(uuid, text) to authenticated;
grant execute on function public.revoke_quote_presentation_version(uuid, text, text) to authenticated;
grant execute on function public.get_public_quote_presentation(text) to anon, authenticated;
grant execute on function public.accept_quote_presentation(text, text) to anon, authenticated;
