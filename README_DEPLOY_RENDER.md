# Deploy no Render

Este projeto usa React/Vite no frontend e um pequeno servidor Node/Express em `server.js` para servir a build em `dist` e manter rotas de backend como `/api/calendar-feed`.

Por isso, no Render use o deploy como **Web Service Node**, nao como site estatico.

## 1. Preparar o Supabase

1. Confirme que o projeto Supabase esta ativo.
2. Copie a URL do projeto.
3. Copie a chave anon/publishable.
4. Copie a service role key apenas se as rotas de backend precisarem dela. Neste projeto, `/api/calendar-feed` usa `SUPABASE_SERVICE_ROLE_KEY`.
5. Em Authentication > URL Configuration, adicione a URL publica do Render depois do primeiro deploy.

Exemplo:

```text
https://seu-servico.onrender.com
```

## 2. Criar o Web Service no Render

1. Acesse o Render.
2. Clique em **New +**.
3. Escolha **Web Service**.
4. Conecte o repositorio GitHub do projeto.
5. Configure:

```text
Environment: Node
Build Command: npm ci && npm run build
Start Command: npm start
```

O script `npm start` executa:

```text
node server.js
```

O servidor ja usa `process.env.PORT`, que e obrigatorio no Render.

## 3. Variaveis de ambiente

Configure no Render em **Environment**:

```text
APP_URL=https://seu-servico.onrender.com
NODE_ENV=production
CORS_ORIGIN=https://seu-servico.onrender.com

VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_OU_PUBLISHABLE

SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=SUA_CHAVE_ANON_OU_PUBLISHABLE
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
SUPABASE_SITE_URL=https://seu-servico.onrender.com

GEMINI_API_KEY=SUA_CHAVE_GEMINI_SE_USAR_IA
```

Observacoes:

- As variaveis `VITE_*` sao lidas durante o build do frontend.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser usada no frontend.
- O Render define `PORT` automaticamente. Nao precisa configurar manualmente.
- Se nao usar a rota `/api/calendar-feed`, a service role key pode ficar sem valor.

## 4. Comandos locais para testar antes do deploy

```bash
npm install
npm run lint
npm run build
npm start
```

Depois abra:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/healthz
```

## 5. Configuracao alternativa sem backend

Se um dia o projeto nao precisar mais de `server.js` nem de rotas `/api`, ele pode rodar como Vite preview:

```text
Build Command: npm ci && npm run build
Start Command: npm run preview -- --host 0.0.0.0 --port $PORT
```

No estado atual do projeto, prefira `npm start`, porque ele preserva as rotas backend.

## 6. Checklist final

- `npm run build` gera a pasta `dist`.
- `npm start` serve `dist` usando Express.
- `server.js` escuta `process.env.PORT`.
- `/healthz` responde `ok`.
- Supabase esta configurado por variaveis de ambiente.
- URL do Render foi adicionada no Supabase Auth.
- `APP_URL`, `CORS_ORIGIN` e `SUPABASE_SITE_URL` usam a URL publica do Render.
