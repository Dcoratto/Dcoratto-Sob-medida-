# Auditoria Supabase, Egress e Arquitetura

Data: 2026-05-29

## Diagnóstico

- O maior gargalo de egress era arquitetural: o adaptador `src/lib/firestore.ts` simulava realtime com polling a cada 10 segundos por subscription.
- `pg_stat_statements` mostrou milhares de chamadas `SELECT *`, principalmente em `materials`, `inventory`, `clients`, `quotes`, `fixture_catalog` e `inventory_purchases`.
- Antes das primeiras correções, imagens estavam em base64/texto dentro do banco; depois foram movidas para Storage em WebP.
- Após a auditoria atual, Storage tinha imagens originais WebP, mas listagens ainda usavam URLs originais em vários pontos.
- As policies públicas anônimas já foram removidas; ainda resta endurecer o modelo autenticado por empresa/usuário.

## Principais Fontes de Egress

1. Polling frequente: cada tela aberta criava várias consultas repetidas.
2. `SELECT *`: tabelas pequenas, mas chamadas milhares de vezes, retornando colunas desnecessárias.
3. Imagens originais em listagens: cards de materiais, estoque, peças e proposta carregavam imagens maiores que o necessário.
4. Proposta premium convertia imagens remotas para WebP no browser, baixando a imagem original antes de exibir.
5. Relatórios/dashboard carregavam muitas coleções completas para calcular resumo no frontend.

## Mudanças Aplicadas

- Polling global reduzido de 10s para 5 minutos em modo emergencial anti-egress.
- Cache compartilhado de snapshots por 4 minutos, deduplicando consultas iguais entre componentes/telas.
- Polling pausado quando a aba não está visível.
- Criada base multiempresa com `empresas` e `empresa_id` em todas as tabelas operacionais.
- RLS autenticado saiu de `auth.uid() IS NOT NULL` para isolamento por `empresa_id`.
- Criados campos `thumbnail_url`, `medium_url` e `original_url` para imagens.
- Geradas variantes físicas no Storage para materiais, catálogo de peças, estoque e compras.
- Listagens principais passaram a usar thumbnails com `loading="lazy"` e `decoding="async"`.
- Proposta premium parou de converter imagem remota para base64/WebP no browser.
- Criadas views: `vw_orcamentos_listagem`, `vw_clientes_listagem`, `vw_materiais_listagem`.
- Criada RPC: `get_dashboard_summary()`.
- Telas de alto tráfego agora usam campos específicos no lugar de `SELECT *`: Dashboard, Clientes, Orçamentos, Projetos, Calendário, Relatórios, Materiais, Estoque, Administração, Configurações, Editor de Orçamento e Proposta Premium.
- Ações raras que precisam do documento completo, como duplicar orçamento ou alterar status com sincronização de estoque, passaram a buscar detalhes sob demanda.
- Histórico operacional em Estoque ficou limitado aos 60 eventos mais recentes.

## Métricas Observadas

- Banco público após remoção de imagens inline: aproximadamente 2.4 MB.
- Storage após variantes: aproximadamente 13 MB, com originais + medium + thumbnails.
- `vw_orcamentos_listagem` em teste atual: aproximadamente 0.67 ms.
- `get_dashboard_summary()` em teste atual: aproximadamente 3.4 ms.
- Consultas de listagem agora têm caminho para trocar `SELECT *` por views leves.
- Logs recentes ainda mostram telas chamando `SELECT *`; a correção no frontend precisa ser publicada em produção e as abas antigas precisam ser recarregadas.
- Banco público atual está pequeno; o consumo de 90+ GB é tráfego acumulado do período, principalmente por polling antigo, `SELECT *` repetido e imagens antes da migração para WebP/thumbnails.

## Riscos Restantes

- Storage ainda usa buckets públicos para leitura; o principal controle de egress vem de thumbnails, lazy loading e cache.
- Dashboard e relatórios ainda precisam migrar totalmente para RPC/views para eliminar cálculos grandes no frontend.
- Algumas telas ainda mantêm subscriptions em coleções completas por compatibilidade.
- Para SaaS multiempresa completo, novos tenants devem ter processo explícito de criação/convite e prefixos de Storage por empresa.

## Próxima Fase Recomendada

1. Migrar Dashboard para `get_dashboard_summary()`.
2. Migrar listagens de orçamentos/clientes/materiais para views.
3. Substituir subscriptions por carregamento sob demanda em relatórios e páginas administrativas.
4. Adicionar paginação real em clientes, orçamentos, materiais, estoque e logs.
5. Definir prefixos de Storage por `empresa_id` e policies de escrita por tenant.
6. Criar fluxo formal de convite/criação de empresas.
