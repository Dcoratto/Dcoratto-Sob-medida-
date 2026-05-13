# D'Coratto Sob Medida - Sistema de Gestao

Sistema web para gestao de marmoraria, com foco em operacao comercial, precisao tecnica e apresentacao profissional para o cliente.

## Tecnologias
- React
- TypeScript
- Tailwind CSS
- Firebase Authentication
- Firebase Firestore
- Firebase Storage
- Motion
- jsPDF

## Funcionalidades
- Autenticacao com niveis de acesso
- Orcamentos com calculos de area, mao de obra e adicionais
- Cadastro de materiais e fornecedores
- Controle de estoque
- Relatorios
- Geracao de propostas em PDF

## Configuracao local
1. Clone o repositorio.
2. Instale as dependencias com `npm install`.
3. Configure as variaveis de ambiente com base em `.env.example`.
4. Inicie o ambiente local com `npm run dev`.

## Scripts disponiveis
- `npm run dev`: inicia o projeto local em `http://localhost:3000`
- `npm run lint`: valida a tipagem TypeScript
- `npm run build`: gera a versao de producao em `dist`
- `npm run preview`: abre a build localmente
- `npm run clean`: remove a pasta `dist`

## Arquitetura de deploy recomendada
- Front-end: Vercel ou Firebase Hosting
- Banco, autenticacao e arquivos: Firebase
- Railway: nao e necessario para a arquitetura atual

## Deploy na Vercel
1. Conecte o repositorio GitHub na Vercel.
2. Mantenha as configuracoes padrao do projeto Vite:
   - Build command: `npm run build`
   - Output directory: `dist`
3. Publique.

O arquivo `vercel.json` ja inclui rewrite para SPA.

## Deploy no Firebase Hosting
1. Gere a build com `npm run build`.
2. Instale a CLI do Firebase, se ainda nao tiver.
3. Rode `firebase login`.
4. Rode `firebase use ai-studio-applet-webapp-2ecc9`.
5. Use a configuracao pronta do arquivo `firebase.hosting.json.example` para atualizar `firebase.json`.
6. Rode `firebase deploy --only hosting`.

## Firebase atual
- Projeto padrao: `ai-studio-applet-webapp-2ecc9`
- Firestore rules: `firestore.rules`
- Hosting preparado em arquivo auxiliar pronto para aplicar

## Observacao sobre Railway
O projeto atual nao depende de um backend Node proprio dentro do repositorio. Por isso, Railway pode ficar fora da arquitetura neste momento sem prejuizo para o funcionamento normal do sistema.
