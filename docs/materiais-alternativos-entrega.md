# Materiais alternativos — entrega para revisão

Relatório da implementação local inicial na branch `main`. O diretório estava limpo no início. A validação posterior aplicou a migration no Supabase e utilizou uma sessão autenticada real; consulte [materiais-alternativos-validacao.md](materiais-alternativos-validacao.md) para o resultado atualizado. Nenhum commit ou push foi executado.

## Arquivos

Modificados:

- `src/types.ts`: tipos de configuração, alternativas publicadas e associação às peças.
- `src/pages/QuoteEditor.tsx`: cadastro, edição de elegibilidade, precificação isolada, rascunho, salvamento e reabertura.
- `src/pages/QuotePresentationPage.tsx`: simulação, atualização dos dados apresentados e integração ao aceite existente.
- `src/lib/quoteDigital.ts`: tipos do snapshot e chamada da confirmação validada.
- `src/lib/firestore.ts`: impede descartar silenciosamente a nova coluna caso a migration ainda não esteja instalada.

Criados:

- `src/components/MaterialAlternativeDialog.tsx`.
- `src/components/ProposalMaterialAlternatives.tsx`.
- `src/lib/quoteMaterialAlternatives.ts`.
- `src/lib/quoteMaterialAlternatives.test.ts`.
- `public/material-placeholder.svg`.
- `supabase/migrations/20261009020810_quote_material_alternatives.sql` (versão alinhada ao histórico remoto na validação).
- `supabase/tests/quote_material_alternatives.sql`.
- `scripts/test-material-alternatives-db.ts`.
- Este relatório.

## Persistência e vínculo com peças

A migration adiciona a coluna JSONB opcional `quotes.material_alternatives`. A configuração usa a RLS já existente de `quotes`; nenhuma tabela, política de acesso existente ou dado histórico é removido.

Cada alternativa possui ID próprio, material principal/variante, material alternativo/variante, IDs das peças elegíveis e preço personalizado próprio. As opções são específicas daquele orçamento e daquele grupo principal. A opção “todas” captura as peças atuais do grupo: peças adicionadas posteriormente precisam ser disponibilizadas pelo vendedor, evitando ampliar uma oferta publicada silenciosamente.

O editor mantém mudanças em estado e no mecanismo existente de rascunhos locais. O banco recebe a configuração somente no salvamento do orçamento. Remover uma alternativa não remove o catálogo nem altera os materiais das peças. Se o material principal de uma peça mudar, configurações incompatíveis precisam ser revisadas ou removidas; a seção de precificação permite isso e exibe o erro.

A nova coluna não pode ser descartada pelo mecanismo legado de tolerância a colunas ausentes: o salvamento informa a necessidade da migration e preserva o rascunho. Aplique a migration antes de disponibilizar a nova versão da aplicação.

## Precificação e cálculo

A fonte de preços e mínimos é a mesma usada pelo editor: catálogo/variante e mínimo do estoque aplicável. A máscara monetária existente é reutilizada. Preços personalizados pertencem à alternativa e não modificam overrides principais, catálogo ou outros orçamentos. O botão de preço padrão limpa somente o override daquela alternativa.

No salvamento, `calculateAlternativePieceDeltas` reutiliza `buildPiecePricingBreakdowns` com as mesmas áreas, quantidades, complexidade e componentes do orçamento. Compara os subtotais principal/alternativo, respeitando a perda habilitada. Custos independentes se cancelam na diferença; a quantidade não é multiplicada novamente. O subtotal original e o contexto comercial são congelados junto das diferenças calculadas por peça.

A simulação soma as diferenças da seleção atual e chama o helper existente `calculateQuotePaymentTotals`, sem modificá-lo. A complexidade global legada é considerada quando aplicável. O rateio visual usa `allocateQuotePresentationValues`, preservando a soma das peças igual ao total apresentado. As diferenças do resumo são atribuídas em ordem determinística de IDs, inclusive nos casos de centavos residuais; a ordem de cliques não interfere no resultado.

Alternativas que envolvem preço manual ou diferenças de espessura, acabamento ou tipo de material são sinalizadas para revisão comercial e não podem ser escolhidas pelo cliente. Não foram inventadas novas regras de fabricação.

## Proposta digital e imagens

Cada registro de peça pode escolher seu material independentemente, inclusive nos orçamentos antigos com um único ambiente global. Um registro com três unidades continua sendo um único registro. O mapa `pieceId → alternativeId` impede duas alternativas simultâneas na mesma peça.

Cards mostram imagem, nome, especificações, principal, seleção atual e diferença financeira. A ampliação é uma ação separada da seleção. Trocas atualizam imediatamente peças, resumo de materiais, diferença e total, sem requisições ou recarga. Retornar ao principal recupera o snapshot original.

As imagens usam URLs existentes e a variante média quando disponível, com carregamento lazy. Não há upload nem duplicação de arquivos. As referências são congeladas no snapshot; imagens ausentes ou indisponíveis recebem placeholder. A retenção física de arquivos antigos permanece dependente das regras de armazenamento existentes: este trabalho não cria uma política nova de retenção do Storage.

## Snapshots, confirmação e segurança

O builder existente é preservado em uma função privada e envolvido por uma extensão aditiva. Propostas sem alternativas retornam exatamente o resultado anterior; o teste SQL compara os dois builders. Quantidades e regras anteriores de rateio continuam intactas.

A publicação congela preços, imagens, elegibilidade, diferenças calculadas pelo motor e versão de cálculo. Atualizações posteriores no catálogo não reprecificam propostas já publicadas. A base financeira é a configuração criada pelo vendedor sob RLS e congelada na versão; a confirmação pública não recebe nem confia em novos preços, áreas, quantidades ou diferenças calculadas pelo navegador.

`accept_quote_presentation_materials` recebe token, nome, versão, mapa de IDs e total esperado. O servidor valida token/versão, validade/revogação, versão atual, fingerprint do orçamento, peças oferecidas, materiais disponibilizados, revisão comercial e limites de payload. Recalcula o total com os dados congelados; o total enviado pelo navegador é apenas uma comparação para detectar divergência.

O avaliador SQL privado reproduz a aritmética em centavos do helper existente, inclusive a ordem das operações IEEE-754 antes do arredondamento. A paridade foi verificada em 200 cenários determinísticos. Nenhum helper, regra de parcelas, desconto, juros, entrada, checkout ou cobrança existente foi modificado.

O aceite usa bloqueios de linha na mesma transação, segue a ordem compatível com leitura/aceite existentes e delega o registro ao fluxo de aprovação já instalado. Repetir a mesma confirmação retorna o mesmo resultado sem inserir outro aceite; uma escolha diferente depois do aceite exige nova versão. O endpoint antigo também passa pela validação de versão quando há alternativas, impedindo contornar a checagem usando a chamada anterior.

O `accepted_snapshot` conserva o snapshot original, total confirmado, seleção, IDs e dados das peças afetadas, quantidade, versão e horário. O snapshot publicado e o orçamento original permanecem intactos. Contrato e produção não são modificados automaticamente. A leitura pública restaura as escolhas confirmadas ao reabrir o link.

As funções privadas têm execução revogada para os papéis públicos pertinentes. Não há secrets, service role no frontend, novo upload ou nova integração financeira.

## Performance

O cadastro reutiliza catálogo, variantes, peças, imagens e estado já carregados. A pesquisa reutiliza `matchesMaterialSearch`, incluindo busca parcial sem acentos, especificações e materiais ativos sem estoque.

Nenhuma consulta foi adicionada por troca de material no cliente. A validação SQL carrega os materiais necessários em uma consulta com colunas essenciais e o estoque desses materiais em outra consulta; a iteração posterior trabalha sobre JSON em memória. Não há busca ao catálogo ou ao estoque para cada peça/alternativa. A confirmação bloqueia registros específicos por identificador.

## Testes executados

| Verificação | Resultado |
| --- | --- |
| `npm run lint` — neste projeto executa `tsc --noEmit` | Passou |
| `node --import tsx --test src/lib/*.test.ts scripts/*.test.mjs` | 98 testes passaram, incluindo 12 novos |
| `node --import tsx scripts/test-material-alternatives-db.ts` | 234 verificações passaram no PostgreSQL isolado |
| Regressão SQL existente de quantidade | Passou no harness com builder real e migration de quantidade |
| Novo smoke SQL de alternativas | Passou no harness |
| `npm run build` | Passou |
| `git diff --check` | Passou |
| Diff dos helpers de pagamento e `Dashboard.tsx` | Sem alterações |
| `npm run check:encoding` | Falhou por três ocorrências preexistentes em `Dashboard.tsx`, linhas 46–48 |

O harness usa PGlite, schemas/tabelas de teste e as funções reais de snapshot, quantidade e aceite das migrations existentes. Somente a geração do token criptográfico do aceite é substituída no ambiente isolado por UUID, pois o teste não avalia criptografia. Não conecta ao Supabase e não altera dados reais.

Para repetir o teste isolado, sem adicionar dependência ao aplicativo:

```powershell
npm install --prefix .npm-cache/material-alternatives-test --no-audit --no-fund --package-lock=false @electric-sql/pglite@0.3.14
node --import tsx scripts/test-material-alternatives-db.ts
```

O teste inclui persistência/releitura, snapshot antigo, mínimo, duplicatas, variante inválida, isolamento entre empresas, material não autorizado, peça externa, preço manipulado, token/versão incorretos, orçamento editado, versão superada, expiração/revogação, confirmação repetida, catálogo atualizado após publicação e preservação do orçamento principal. Testes existentes de pagamento também passaram.

No navegador, os componentes reais foram abertos com dados fictícios locais. Foram verificados cadastro, pesquisa `itaunas`, seleção específica, contador de três unidades em um registro, combinações independentes e atualização do total. O layout foi inspecionado a 390 × 844 e 1200 × 900; a tela mobile não apresentou overflow horizontal. A prévia temporária foi encerrada e seu módulo de teste removido.

Prévia com dados fictícios:

![Materiais alternativos em prévia local](C:/Users/brian/Desktop/dcoratto-sob-medida/.npm-cache/material-alternatives-preview.png)

## Pendências registradas na entrega inicial

Esta lista é histórica. A aplicação remota, o smoke SQL e o ciclo autenticado de salvar/reabrir/publicar/simular foram executados posteriormente, conforme o relatório de validação vinculado no início deste documento.

- Aplicar a migration aditiva no ambiente Supabase de destino antes do deploy do frontend. Nenhuma migration remota foi aplicada nesta entrega.
- Executar o smoke SQL no banco de destino e conferir seus advisors/RLS efetivos. O harness valida as funções e o isolamento, mas não reproduz todas as políticas e extensões instaladas no projeto remoto.
- Validar com navegador autenticado o ciclo completo do editor: salvar, fechar, reabrir, gerar versão e abrir o link real. Esta sessão não utilizou navegador autenticado; essa validação ponta a ponta ficou pendente.
- Validar o aceite via aplicação conectada e concorrência real entre sessões. A idempotência foi executada no PostgreSQL isolado; concorrência de múltiplas conexões não foi exercitada pelo PGlite.
- Conferir imagens reais e combinações comerciais representativas. A revisão visual usou imagens de placeholder e dados fictícios.

Os problemas de codificação preexistentes foram preservados, conforme a restrição de escopo.

## Git

`git status --short`: cinco arquivos existentes modificados (`M`) e nove arquivos novos (`??`), todos locais e disponíveis para revisão. Nos arquivos já rastreados, `git diff --stat` registrou 140 inserções e oito remoções. Os novos módulos contêm UI, cálculo, migration, testes e este relatório e aparecem separadamente como não rastreados. Não foram alterados arquivos de pagamento nem dependências/lockfile do aplicativo.

Mensagem sugerida, sem executar commit:

`feat: adiciona materiais alternativos interativos na proposta`
