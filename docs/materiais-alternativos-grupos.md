# Troca de materiais por grupo — entrega de 08/10/2026

Branch `main`, limpa no início desta etapa. Sem commit, push ou deploy Railway. O frontend foi validado localmente contra o Supabase real e com uma prévia isolada para os casos de múltiplos grupos.

## Arquivos desta alteração

| Arquivo | Alteração |
| --- | --- |
| `src/components/ProposalMaterialAlternatives.tsx` | Galeria única, seletor de grupo, resumo e restauração independente |
| `src/pages/QuotePresentationPage.tsx` | Seção de superfícies usa materiais do snapshot original |
| `src/lib/quoteMaterialGroups.ts` | Deriva grupos e galeria; valida elegibilidade completa e monta o mapa de escolhas existente |
| `src/lib/quoteMaterialGroups.test.ts` | Sete testes novos de comportamento, compatibilidade e renderização |
| `supabase/migrations/20261009025512_quote_material_group_selection.sql` | Validação privada de integridade do grupo na RPC existente |
| `supabase/tests/quote_material_group_selection.sql` | Regressão SQL sem escrita de dados |
| `scripts/test-material-alternatives-db.ts` | Aceite completo, rejeição parcial/mista e retry de aceite legado |
| Este relatório | Resultados e limites da validação |

## Experiência e identidade dos grupos

Uma única galeria deduplicada por ID do material alternativo mostra imagem, nome, acabamento e seleção. As imagens e a ampliação foram preservadas. Clicar em um card abre o seletor “Substituir qual material do projeto?”, com somente os materiais originais efetivamente presentes nas peças publicadas. Não há galeria nem lista de seleção por peça.

Os grupos são derivados exclusivamente dos IDs dos materiais originais do snapshot publicado. Ambiente, ordem de cliques e materiais escolhidos na simulação não mudam a identidade. O resumo distingue registros e unidades físicas. Materiais originais sem alternativas completas permanecem visíveis, com orientação para ajuste pelo vendedor.

“Aplicar material” só é habilitado quando todas as peças do grupo têm uma opção autorizada para o mesmo material e acabamento, sem revisão comercial. A seleção por grupo é traduzida para o mapa de IDs de peças/opções já usado pela confirmação. Opções específicas diferentes podem cobrir registros diferentes do mesmo grupo, preservando seus preços congelados; não se estende a elegibilidade a nenhuma peça não autorizada. Dois acabamentos igualmente válidos e ambíguos exigem ajuste do vendedor.

Cada grupo tem escolha independente. “Alterar” direciona à galeria e pré-indica o grupo no seletor. “Restaurar original” remove somente as escolhas daquele grupo. O resumo informa substituições, originais mantidos e diferenças, sem enumerar peças. A seção “Superfícies reais desta versão do projeto” permanece mostrando os materiais principais originais.

## Cálculo, persistência e segurança

O motor `simulateMaterialAlternatives` e suas fórmulas não foram modificados. As escolhas são sempre recalculadas a partir do snapshot original; não há acúmulo de diferenças nem multiplicação adicional de quantidade. Preços personalizados, mínimos, imagens e vínculos cadastrados permanecem nos dados existentes. Nenhum cadastro administrativo precisou ser alterado.

A configuração de alternativas e o mapa persistido continuam no formato anterior. O aceite guarda material original nas peças congeladas, material escolhido, registros, quantidades, valores, versão e horário pelo fluxo já existente. A leitura pública restaura as escolhas confirmadas; escolhas ainda não confirmadas continuam sendo apenas simulações em memória. Aceites legados parciais são exibidos como “Escolhas anteriores preservadas”, sem converter ou apagar dados. Retries idênticos desses aceites continuam válidos.

A migration foi criada pela CLI e aplicada ao projeto `rgenylmqqfjqwnpyjlsx`, confirmado pelo vínculo local. O arquivo local foi alinhado à versão remota `20261009025512`. Ela acrescenta uma função privada SECURITY INVOKER, com search_path vazio e execução revogada para PUBLIC/anon/authenticated, e insere somente sua chamada na RPC existente, após autorização das peças e antes da confirmação. A RPC pública continua usando os mesmos bloqueios de linha e a mesma transação. Não altera tabelas, políticas RLS, snapshots, orçamento principal, estoque, contratos ou produção.

No servidor, uma nova confirmação exige todas as peças do grupo original, mesmo material/acabamento, elegibilidade e quantidades válidas. O fluxo anterior continua validando token, versão atual, fingerprint, validade/revogação, IDs autorizados e total calculado no servidor. O navegador não pode fornecer novos preços ou contornar a regra selecionando só parte das peças.

Grupos, galeria e elegibilidade são memoizados por snapshot. Trocar/restaurar trabalha em memória, sem consulta por grupo ou peça e sem alteração do cache existente. O helper SQL também trabalha no JSON congelado, sem consultas ao catálogo/estoque por peça.

## Preservação verificada no Supabase

Hashes iguais antes/depois da migration:

| Conteúdo | MD5 |
| --- | --- |
| Todos os orçamentos | `200dc6641e0bfb1ce31736d487cad0a8` |
| Versões existentes | `a4a661a0ad89dc79fff405adbdb88a94` |
| Aceites | `7803512ff1ca2fe0004206d6ed41850b` |
| Settings | `f5e5753817191ee8f2f9f0eb332a6751` |
| Avaliador SQL de valores | `8e67a7a12e9bcd5e427557bf5ef8a5cb` |
| Builder de snapshot | `fd09af70096e1ca6ffc402b7ff46e3bd` |

Depois dos testes no navegador, o hash dos 33 orçamentos e o dos aceites permaneceram iguais. RLS permaneceu ativo nas quatro tabelas de orçamento/proposta/versão/aceite; o validador ficou privado e a RPC por token manteve seu acesso público controlado.

O advisor mantém as categorias já existentes: [search_path mutável](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), execução de RPCs SECURITY DEFINER por [anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) e [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), e [proteção de senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). A função nova é privada/invoker; não foi ampliado o acesso nem alterada configuração fora do escopo. O acesso por token continua sendo intencional nas RPCs públicas existentes.

## Testes executados

| Cenários obrigatórios | Evidência |
| --- | --- |
| 1, 2 e 4 materiais originais; galeria única/deduplicada; sem seleção por peça | Testes unitários e renderização passaram; quatro grupos exercitados no navegador |
| Clique abre seletor; somente materiais usados; registros × unidades | Navegador real e prévia isolada: passaram |
| Grupo completo; outros grupos preservados; quantidade três | Testes unitários/SQL, proposta real e prévia: passaram |
| Preço personalizado e diferença financeira | Proposta real: R$ 650/m² e total R$ 3.055,50 → R$ 2.882,25 |
| Substituições simultâneas; restaurar somente um grupo | Prévia com quatro originais: R$ 10.000 → R$ 9.600 → R$ 9.900; restauração do primeiro manteve a segunda escolha e resultou em R$ 10.300 |
| Repetição/alteração não acumula diferenças | Testes unitários passaram; cálculo original reutilizado |
| Elegibilidade parcial/revisão comercial | Botões bloqueados no navegador; chamadas SQL parciais/mistas rejeitadas |
| Snapshots antigos e aceites parciais legados | Unitários, proposta real já publicada e retry SQL passaram |
| Confirmação registra escolhas, quantidades, versão, horário; releitura | PostgreSQL isolado com RPC e builder reais: passou |
| Orçamento principal intacto | Comparação integral no harness e hashes remotos iguais |
| Pagamentos sem alteração e sem N+1 | Diff vazio nos motores/código de pagamento; 200 cenários de paridade SQL/TS; sem novas consultas no frontend |
| Celular e desktop | 390 × 844 e viewport desktop; largura de rolagem igual à largura disponível, sem overflow horizontal |
| Atualização não perde escolhas confirmadas | Leitura da confirmação real no harness e roundtrip JSON/renderização preservaram as escolhas |

- `node --import tsx --test src/lib/*.test.ts scripts/*.test.mjs`: **105 testes passaram**.
- `node --import tsx scripts/test-material-alternatives-db.ts`: **247 verificações passaram**.
- Novo smoke SQL: **passou no Supabase real**.
- `npm run lint` / TypeScript (`tsc --noEmit`): **passou**.
- `npm run build`: **passou**.
- `git diff --check`: **passou**.

O projeto não define um lint separado: `npm run lint` executa TypeScript.

![Galeria e resumo no celular, proposta real](../.npm-cache/validation/material-groups-mobile.jpg)

![Seletor mobile, quatro grupos fictícios e elegibilidade parcial bloqueada](../.npm-cache/validation/material-groups-selector.jpg)

## Limites e estado final

O teste de navegador real usou o snapshot V1 da proposta de validação anterior da MHEGA. O orçamento de origem dessa proposta já não está presente no banco atual; a proposta publicada continua legível. Nenhum novo orçamento foi criado, e nenhum aceite contratual real foi registrado. Por isso, confirmação e releitura foram verificadas no PostgreSQL isolado com as funções reais, não declaradas como um novo aceite real no navegador. Concorrência entre múltiplas conexões reais não foi exercitada; a ordem de bloqueios e a transação existentes foram preservadas.

Os casos com quatro materiais no navegador usaram dados fictícios locais, sem gravação no Supabase. O HTML/módulo temporários da prévia foram removidos. As evidências visuais ficam no diretório ignorado `.npm-cache/validation`.

Pagamentos não foram alterados. O problema preexistente da entrada formatada no editor, descrito no relatório de validação anterior, permanece fora do escopo. Dashboard/encoding, QuoteEditor, tipos, cliente da API de aceite, quantidade e motores financeiros não têm diff nesta etapa.

Git final: três arquivos rastreados modificados e cinco arquivos novos. Todas as alterações são locais, além da migration aplicada no Supabase. O frontend ainda precisa do deploy normal em Railway para aparecer na aplicação hospedada.

Commit sugerido, sem executar:

`feat: simplifica troca de materiais por grupo na proposta digital`
