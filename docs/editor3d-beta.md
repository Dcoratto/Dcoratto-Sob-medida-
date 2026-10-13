# Editor 2D/3D Beta 0.1 — Fase 1

Implementação limitada à bancada retangular experimental. O Beta não escreve em `quotes`, não chama o salvamento do orçamento e não altera o DrawingCanvas, medidas oficiais, quantidade, materiais, recortes, pagamentos, propostas ou contratos.

## Arquivos

Modificados, com alterações localizadas: `src/pages/QuoteEditor.tsx` (entrada, autorização e abertura), `vite.config.mjs` (chunk Three.js), `.env.example`, `package.json` e `package-lock.json`.

Criados: `src/lib/editor3dModel.ts`, `src/lib/editor3dPersistence.ts`, `src/lib/editor3dModel.test.ts`; `src/components/editor3d/Editor3DEntry.tsx`, `Editor3DBeta.tsx`, `Countertop2D.tsx`, `Countertop3D.tsx`; `scripts/test-editor3d-db.ts`; `supabase/migrations/20261011230428_quote_piece_editor3d.sql`; `supabase/tests/quote_piece_editor3d.sql`; este documento.

## Modelo, bibliotecas e unidades

React 19/Vite existentes. Three.js 0.186.1 com OrbitControls; tipos 0.186.0. React Three Fiber/Drei foram avaliados, mas não são necessários para o único sólido desta fase. A dependência compartilhada `fflate` permanece em 0.8.2; a 0.8.3 exigida pelos novos tipos fica aninhada, sem atualizar a dependência existente dos PDFs.

Referências: [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction).

```json
{"schemaVersion":1,"type":"rectangular_countertop","dimensions":{"lengthMm":2500,"depthMm":600,"thicknessMm":20}}
```

Uma geometria em milímetros inteiros alimenta SVG 2D, sólido 3D e área informativa. X = comprimento; Y = espessura; Z = profundidade. A vista superior usa X/Z. Interface: centímetros (`mm / 10`); Three.js: metros (`mm / 1000`). Área superior: `lengthMm * depthMm / 1000000` m². Strings incompletas permanecem no campo e não substituem a última geometria válida.

| Dimensão | Limites canônicos | Interface |
| --- | --- | --- |
| Comprimento | 100–6000 mm | 10–600 cm |
| Profundidade | 100–2500 mm | 10–250 cm |
| Espessura | 10–200 mm | 1–20 cm |

Precisão de 1 mm (0,1 cm), sem notação exponencial nos inputs. Limites experimentais, não regras comerciais do orçamento. Cliente e PostgreSQL rejeitam esquema desconhecido, campos extras, valores não numéricos, frações de mm e valores fora dos limites. JSON máximo de 1 KiB; JSON malformado é rejeitado pelo parser do banco.

SVG oferece ajuste, grade visual, cotas com tamanho de fonte constante, zoom, pan, teclado e dois ponteiros para pinça. Three.js oferece órbita, zoom, pan, ajustar/restaurar e controles touch. Renderização sob demanda, sem loop contínuo; cleanup de geometria/material/controles/listeners/RAF/WebGL. Falhas de módulo/renderização/WebGL preservam o modelo e a vista 2D.

## Flag e autorização

`VITE_EDITOR3D_BETA=false` por padrão. Para disponibilizar após a migration, configurar `VITE_EDITOR3D_BETA=true` no ambiente Vite e reiniciar/recompilar. A flag não concede acesso no banco.

O administrador principal é validado pela identidade confirmada no Supabase Auth, seguindo a identidade já usada pelo sistema. Outros usuários precisam de concessão explícita em `quote_editor3d_access_grants`, além das permissões existentes de orçamento. Esta concessão só pode ser administrada por acesso confiável ao banco/service role; nenhuma chave privilegiada entra no frontend. Não há concessão automática para perfis editáveis pelo próprio usuário.

Exemplo administrativo, com IDs previamente conferidos no Auth e no tenant:

```sql
insert into public.quote_editor3d_access_grants(user_id,empresa_id,enabled)
values ('<UUID_AUTH_VERIFICADO>', '<ID_EMPRESA_VERIFICADO>', true)
on conflict(user_id,empresa_id) do update set enabled=excluded.enabled;
```

As políticas existentes de `users` permitem alterações de perfil pelo próprio usuário. Por isso, papel/permissões do navegador não bastam para autorizar o Beta. O único helper elevado, `app_private.quote_editor3d_authorized`, é uma consulta sem escrita à identidade Auth e à concessão protegida, com `auth.uid()`, `search_path=''` e grants mínimos. RPCs de desenho, validações e trigger são SECURITY INVOKER. Políticas existentes não foram flexibilizadas.

## Persistência e concorrência

Tabela isolada `quote_piece_drawings`: UUID, empresa, orçamento, ID da peça, schema, modelo, revisão, autores e timestamps. Unicidade `(quote_id,piece_id)`. ID de peça aceito somente quando é string segura e aparece exatamente uma vez no JSON persistido de um orçamento acessível do tenant. Não usa nome/posição/índice. Orçamento novo ou peça ainda não persistida exige salvar pelo fluxo existente; históricos sem ID seguro não recebem backfill.

RLS explícita para SELECT/INSERT/UPDATE, sem DELETE para authenticated e sem acesso anon. Campos de vínculo, ID e metadados de criação são imutáveis. Trigger valida modelo/vínculo, bloqueia alteração sem incremento de revisão e mantém metadados no servidor. O salvamento bloqueia o orçamento para estabilizar o vínculo durante a operação.

`quote_piece_drawing_get` consulta apenas o desenho solicitado e devolve colunas essenciais. `quote_piece_drawing_save` cria com revisão 1 ou atualiza condicionando à revisão carregada, incrementando atomicamente. Colisão de criação e revisão desatualizada retornam `40001`; não há upsert de desenho. A resposta confirma somente o modelo enviado; edições posteriores continuam pendentes. Falhas preservam modelo/texto local e conflitos oferecem recarga explícita com confirmação de descarte.

Cache de até 32 desenhos salvos, separado por usuário/orçamento/peça, com revalidação na abertura e atualização pontual após sucesso. Nenhuma consulta por tecla/frame/câmera nem por peça na listagem. Nenhum novo autosave oficial.

Migration aditiva aplicada em `rgenylmqqfjqwnpyjlsx`, versão remota `20261011230428`, alinhada ao arquivo local. Dependências conferidas: `auth.uid()`, `app_private.current_empresa_id()`, `auth.users`, `users`, `empresas` e `quotes.pieces`.

## Validação executada em 11/10/2026

- `npm run lint`: aprovado; o script executa `tsc --noEmit`.
- `git diff --check`: aprovado também para todos os arquivos novos, usando a verificação de whitespace com `git diff --no-index --check`.
- Testes existentes e novos descobertos por `rg`, executados com `npx tsx --test`: 110 aprovados, zero falhas.
- `npx tsx scripts/test-editor3d-db.ts`: aprovado em PostgreSQL PGlite com a migration real, RLS e roles. Testa criação/reabertura/CAS, colisões de criação, revisão antiga, schema/limites, vínculo/tenant, imutabilidade, usuário negado, autoelevação e preservação do JSON oficial. Os casos CAS são intercalados, não uma medição de carga simultânea.
- Banco remoto: RPCs sob role authenticated com identidade Auth real testaram leitura, incremento 1→2 e rejeição de revisão antiga; transação revertida e revisão 1 preservada.
- `npm run build -- --manifest`: aprovado. Grafo de importações estáticas do QuoteEditor exclui Editor3DBeta e Three.js; QuoteEditor importa Beta dinamicamente, Beta importa Countertop3D dinamicamente, e este importa `editor3d-three`.
- Chunks: Beta 14,31 kB (gzip 5,57); Countertop3D 4,07 kB (gzip 2,05); Three.js 538,91 kB (gzip 134,14). Vite informa chunk acima de 500 kB, carregado somente na vista 3D.
- Security advisors remotos: nenhum aviso menciona os novos objetos.
- Supabase remoto: RLS habilitada nas duas tabelas; anon sem SELECT; authenticated sem acesso à tabela de concessões.
- Preservação remota: hash de todos os registros de quotes antes/depois `683131c2c25e72916a2ca186a7f453a0`; hash das políticas anteriores antes/depois `b80ca9a6b8d3d4cfc059597e2693c926`. Comparação com a mesma serialização e ordenação, excluindo somente as duas tabelas novas no segundo hash.

O harness reaproveita PGlite 0.3.14 já disponível em `.npm-cache/material-alternatives-test`. Para reproduzir em outra máquina, instalar essa versão em diretório de testes ignorado e definir `PGLITE_MODULE` para seu `dist/index.js`. O SQL também pode ser executado em banco descartável com a migration e as dependências reais. Não executar os fixtures SQL no banco operacional.

## Validação manual e limites da evidência

Sessão autenticada real no localhost, cliente MHEGA, orçamento `Y3sf7Ck19z6KnJHMtNMO`, peça `vxxy82qnx` (Mezanino | WC masculino). Abriu a peça e o Beta, alterou para 300 × 80 × 3 cm, salvou desenho, reabriu e confirmou revisão 1 e área experimental 2,400 m². O sólido WebGL foi renderizado junto ao SVG; controles de órbita/zoom/restaurar foram acionados. Texto incompleto `300,` permaneceu inválido sem mudar a geometria válida.

Peça oficial permaneceu com 2,930 m², maior lado 220 cm, quantidade 1 e R$ 3.610,70. Orçamento permaneceu com 88,1 m² e R$ 175.000,00. Não foram acionados salvar peça/orçamento, pagamento, publicação de proposta ou contrato.

A automação bloqueou ao abrir a confirmação nativa de descarte. A confirmação foi substituída por alertdialog acessível dentro do Beta. Validação manual final deste diálogo, viewport mobile, touch físico, fallback por perda de contexto e edição durante uma requisição real ainda dependem de liberar a aba bloqueada; não estão declaradas aprovadas. O controle de edições posteriores ao envio foi testado no modelo, e conflitos foram testados em SQL real.

O único desenho de teste criado foi removido por ID/orçamento/peça/revisão/modelo exatos após a validação. Nenhum registro anterior de desenho existia; dados oficiais e rascunhos foram preservados. O servidor local foi reiniciado sem a flag temporária de teste. Feature flag continua desligada por padrão. Não houve commit, push ou deploy Railway.

Git final: branch `main`, cinco arquivos existentes modificados e onze arquivos novos, todos listados acima. Nenhum arquivo fora do módulo e de sua integração/dependências foi alterado.

## Retomada das validações pendentes — 13/10/2026

Esta rodada não concluiu as validações manuais. O controle de navegador Windows foi encerrado automaticamente antes de qualquer interação com o CRM: não conseguiu determinar a URL atual com confiança suficiente para aplicar sua política. Nenhum bloqueio foi contornado, nenhuma sessão autenticada foi comprovada nesta rodada e nenhuma captura anterior foi reutilizada como evidência nova.

| Teste solicitado | Resultado desta rodada |
| --- | --- |
| Diálogo interno: salvar, cancelar, descartar e falha de persistência | Pendente; não executado na interface |
| Mobile/touch: pan, zoom e pinça no SVG e órbita/pan/zoom no 3D | Pendente; não executado |
| Perda real de contexto WebGL e recuperação/fallback | Pendente; não simulada |
| Edição durante salvamento real, resposta atrasada, falha e conflito | Pendente na interface; testes automatizados existentes repetidos, sem substituir o teste real |
| TypeScript/lint (`npm run lint`, que executa `tsc --noEmit`) | Aprovado, exit code 0 |
| Testes existentes e afetados (`npx tsx --test`, arquivos descobertos por `rg`) | 110 aprovados; zero falhas, cancelamentos ou skips |
| SQL/RLS (`npx tsx scripts/test-editor3d-db.ts`) | Aprovado em PostgreSQL isolado com migration real; schema, autorização, IDOR, revisão/CAS, vínculo e preservação oficial |
| Build (`npm run build -- --manifest`) | Aprovado, exit code 0; aviso existente do chunk Three.js acima de 500 kB |
| `git diff --check`, incluindo arquivos novos | Aprovado |

Preservação no Supabase, comprovada por consultas de leitura antes e depois: hash de todos os orçamentos `683131c2c25e72916a2ca186a7f453a0`, hash de **todas** as políticas (incluindo o Beta) `c26c7ec45f84905cf5dfdb0828698396`, ambos idênticos. Zero desenhos para a peça de teste MHEGA antes e depois. Esta rodada não criou nem atualizou dados no banco. Essas verificações comprovam preservação dos registros e políticas; não comprovam interação manual com o editor oficial.

Não foi identificado defeito novo por teste executado, portanto nenhum código de produção foi corrigido. Somente este relatório foi alterado nesta rodada; as alterações preexistentes da Fase 1 foram mantidas. Nenhuma dependência, migration, RLS ou arquitetura de persistência foi modificada. A flag foi ativada apenas em um processo local de teste, posteriormente encerrado; o servidor foi restaurado sem essa flag. `VITE_EDITOR3D_BETA=false` continua como padrão. Sem commit, push ou deploy Railway.

Para concluir, é necessário retomar em um navegador com URL verificável e sessão autenticada, executar os quatro grupos manuais acima e registrar capturas novas e resultados reais. Os resultados manuais de 11/10 permanecem históricos; não resolvem as pendências desta rodada.
