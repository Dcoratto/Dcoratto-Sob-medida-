# Materiais Alternativos — validação de 08/10/2026

Validação sem novas funcionalidades. Nenhum código de aplicação, pagamento ou Dashboard foi alterado nesta etapa. Nenhum commit, push ou deploy do frontend foi executado.

## Migration e projeto

- Projeto confirmado por connector, `supabase/.temp/project-ref` e URL local: `Dcoratto's Project`, `rgenylmqqfjqwnpyjlsx`.
- Migration inicialmente pendente: `20261009012458_quote_material_alternatives.sql`.
- Aplicada com sucesso pelo connector como `20261009020810`, nome `quote_material_alternatives`, confirmado no histórico remoto.
- Arquivo local renomeado para `supabase/migrations/20261009020810_quote_material_alternatives.sql`, sem alteração de conteúdo, para corresponder ao histórico e evitar reaplicação por divergência de versão. Atualizada somente a referência no harness SQL.
- Dependências presentes: builder de snapshot, leitura pública, aceite existente, `app_private.current_empresa_id()`, tabelas de orçamento/proposta/cliente/material/configuração/estoque e colunas de variantes do estoque.

A revisão anterior à aplicação confirmou coluna JSONB opcional, sem default nem backfill; novos validadores/helpers; wrappers que preservam o corpo das funções existentes. Não há DROP de dados, atualização de registros existentes, mudança de políticas RLS ou DDL de pagamentos. A nova RPC de confirmação delega ao aceite anterior na mesma transação, preservando o orçamento principal.

## Banco remoto e preservação

| Validação | Resultado |
| --- | --- |
| Coluna `quotes.material_alternatives` | JSONB, nullable, sem default |
| Trigger de validação | Instalado em INSERT/UPDATE de alternativas e peças |
| RLS | Ativo em quotes, presentations, versions e acceptances |
| Políticas | Empresa via `app_private.current_empresa_id()`; leitura de aceite restrita à empresa |
| Execução privada | Bases de leitura/aceite/snapshot sem EXECUTE para anon/authenticated; validadores necessários ao trigger disponíveis a authenticated |
| RPCs públicas | Leitura/aceite por token e nova confirmação disponíveis a anon/authenticated; SECURITY DEFINER com search_path vazio nos wrappers |
| Smoke SQL de alternativas | Passou no Supabase real |
| Regressão SQL de quantidade | Passou no Supabase real |
| Snapshots legados | 33 orçamentos comparados, zero diferenças entre builder anterior e wrapper |

Antes/depois da migration: 33 orçamentos e 56 versões existentes preservados. Hashes iguais:

| Conteúdo | MD5 antes/depois |
| --- | --- |
| Orçamentos existentes, excluindo a coluna nova | `44d4147c035c8f0fb4ff97405d706b2e` |
| Versões publicadas existentes | `e64d8bcfe29049abee558221dd613235` |
| Aceites | `7803512ff1ca2fe0004206d6ed41850b` |
| Settings | `f5e5753817191ee8f2f9f0eb332a6751` |

Os corpos das três funções anteriores foram preservados nas bases privadas, com hashes idênticos aos registrados antes da migration. Depois do teste de navegador, os hashes dos 33 orçamentos anteriores, settings e aceites continuaram iguais. O teste acrescentou um orçamento e sua versão, sem editar os orçamentos anteriores.

## Sessão autenticada real

Aplicativo local em `http://127.0.0.1:3000`, conectado ao projeto real, na sessão de Brian Takiya. Cliente MHEGA indicado expressamente pelo usuário.

Orçamento criado: `Y5fyzEQ9tOR8Pq7zuWI5`, ambiente **VALIDAÇÃO — Materiais Alternativos**, status Orçamento. Observação explícita de teste, sem enviar ao cliente, aceitar ou gerar cobrança.

1. Criada uma bancada com 1 m² por unidade, maior lado 100 cm, quantidade três e material principal Preto São Gabriel, Nacional/Chapa/2cm/Polido, preço R$ 700/m².
2. Adicionadas alternativas Branco itaunas e Preto absoluto, associadas ao registro de três unidades. Pesquisa `itaunas` funcionou.
3. Branco itaunas, com especificações diferentes, exibiu revisão comercial e ficou indisponível para simulação pública.
4. Preto absoluto compatível: padrão R$ 600/m², personalizado R$ 650/m², diferença de −R$ 50/m². O principal permaneceu R$ 700/m².
5. Salvo o orçamento, saído para a lista e reaberto pelo botão Editar. Alternativas, associação às peças, três unidades, preço personalizado e pagamento CRÉDITO 3X persistiram. Total principal R$ 3.055,50.
6. Gerada e aberta a proposta digital V1 `DC-7ZUWI5-V1`. As alternativas e as imagens reais foram exibidas.
7. Selecionado Preto absoluto: total R$ 2.882,25, diferença −R$ 173,25. Cálculo: 3 × R$ 50 = R$ 150; perda de 10% soma R$ 15; ajuste de pagamento de 5% resulta em R$ 173,25. A peça exibiu três unidades de R$ 960,75 e o resumo material mudou para Preto absoluto.

O hash completo do orçamento foi `ede09a0551dc8ca3fb10b9f81ca4fef5` antes e depois da seleção pública. Total R$ 3.055,50, material principal e três unidades permaneceram no banco. Nenhum aceite foi criado. Não foi acionada confirmação/aceite contratual.

![Recálculo na proposta real](../.npm-cache/validation/material-alternatives-real.jpg)

## Pagamentos e pendência preexistente

Helpers/testes de pagamento, configuração remota e corpo anterior do builder permanecem intactos. No editor, o fluxo Valor total/CRÉDITO 3X aplicou 5% sobre R$ 2.910,00: total R$ 3.055,50, três parcelas de R$ 1.018,50. Na proposta com alternativa, o simulador público funcionou com Pix/débito/crédito; entrada R$ 500 e CRÉDITO 3X produziram saldo ajustado R$ 2.501,36, total R$ 3.001,36 e parcelas de R$ 833,79 com ajuste final de centavos.

**Pendência real preexistente:** no editor, a entrada digitada como R$ 500,00 é tratada como zero. `CurrencyInput` entrega uma string formatada e o editor usa `Number(entryAmount) || 0`. A mesma expressão e o mesmo handler já existem em HEAD; NumericInput e helper financeiro não têm diff. O problema não foi corrigido por estar fora do escopo. Portanto, a preservação do código foi confirmada, mas não é correto declarar todos os fluxos de pagamento sem problemas.

Não foram executadas cobranças, transações financeiras ou aceite contratual real. Concorrência entre múltiplas sessões reais permanece não exercitada; idempotência, autorização e preservação no aceite foram cobertas no PostgreSQL isolado.

## Advisors

RLS inspecionado e políticas preservadas. O advisor sinaliza EXECUTE de SECURITY DEFINER para anon/authenticated nas RPCs públicas por token, incluindo a nova confirmação. É acesso intencional para proposta pública, com validação de token, versão, validade, IDs autorizados e total no servidor; os helpers de aceite privados não estão expostos. Não representa acesso irrestrito às tabelas.

Permanecem avisos de search_path em seis funções preexistentes de funcionário/dashboard/strip_html, outros RPCs existentes e proteção de senha vazada desativada. Nenhuma configuração foi alterada fora do escopo.

Referências de remediação do advisor: [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anon SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Checks locais

- 98 testes de `src/lib/*.test.ts` e `scripts/*.test.mjs`: passaram.
- Harness PostgreSQL isolado: 234 verificações passaram, incluindo 200 cenários de paridade financeira.
- TypeScript (`npm run lint`, `tsc --noEmit`): passou.
- Build: passou.
- `git diff --check`: passou.
- Diff de Dashboard, NumericInput e helper/teste de pagamento: vazio. Encoding preexistente preservado.

O orçamento de teste e a versão foram mantidos para revisão. O link não foi enviado ao cliente. A disponibilização do frontend em Railway não foi executada nesta validação.
