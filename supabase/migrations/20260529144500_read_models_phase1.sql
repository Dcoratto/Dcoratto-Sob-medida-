-- Phase 1: read models for high-traffic screens.
-- These are additive and security-invoker so existing RLS still applies.

create or replace view public.vw_orcamentos_listagem
with (security_invoker = true) as
select
  id,
  client_id,
  client_name,
  phone,
  address,
  environment,
  responsible,
  responsible_user_uid,
  responsible_user_name,
  material_id,
  material_name,
  status,
  total_area,
  total_price,
  measurement_date,
  delivery_date,
  created_at,
  updated_at,
  jsonb_array_length(coalesce(pieces, '[]'::jsonb)) as quantidade_pecas
from public.quotes;

create or replace view public.vw_clientes_listagem
with (security_invoker = true) as
select
  id,
  name,
  phone,
  email,
  city,
  address,
  condominium_id,
  condominium_name,
  manual_quote_status,
  manual_stage,
  created_at,
  updated_at
from public.clients;

create or replace view public.vw_materiais_listagem
with (security_invoker = true) as
select
  id,
  name,
  provider,
  category,
  material_line,
  material_type,
  thickness_label,
  texture,
  price_per_m2,
  active,
  thumbnail_url,
  medium_url,
  created_at,
  updated_at
from public.materials;

create or replace function public.get_dashboard_summary()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'quotes_total', (select count(*) from public.quotes),
    'quotes_open', (
      select count(*)
      from public.quotes
      where status in ('Orçamento', 'Orçamento Aprovado', 'Medição', 'Projeto', 'Projeto Aprovado', 'Corte', 'Acabamento', 'Montagem', 'Produção Finalizada', 'Conferência Final', 'Entrega')
    ),
    'clients_total', (select count(*) from public.clients),
    'materials_active', (select count(*) from public.materials where active is true),
    'inventory_available', (select count(*) from public.inventory where status = 'Disponível'),
    'inventory_reserved', (select count(*) from public.inventory where status = 'Reservada'),
    'revenue_total', (select coalesce(sum(total_price), 0) from public.quotes),
    'updated_at', timezone('utc'::text, now())
  );
$$;

grant select on public.vw_orcamentos_listagem to authenticated;
grant select on public.vw_clientes_listagem to authenticated;
grant select on public.vw_materiais_listagem to authenticated;
grant execute on function public.get_dashboard_summary() to authenticated;
