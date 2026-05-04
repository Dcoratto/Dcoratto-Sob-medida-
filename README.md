# D'Coratto Sob Medida - Sistema de Gestão

Sistema web completo para gestão de marmorarias, focado em precisão técnica e experiência do usuário.

## Tecnologias
- React
- TypeScript
- Tailwind CSS
- Firebase (Auth, Firestore, Storage)
- Lucide React (ícones)
- Motion (animações)
- jsPDF (geração de documentos)

## Funcionalidades
- **Autenticação:** Logins seguros com níveis de acesso (Admin/Usuário).
- **Orçamentos:** Cálculos automáticos de área, mão de obra, materiais e adicionais (frontão, saia, virada).
- **Desenho Técnico:** Ferramenta CAD integrada no navegador para medições precisas.
- **Estoque:** Controle de chapas, retalhos e custos.
- **Catálogo:** Gestão de materiais e fornecedores.
- **PDF:** Geração de propostas profissionais prontas para o cliente.

## Configuração local
1. Clone o repositório.
2. Instale as dependências: `npm install`.
3. Configure as variáveis de ambiente baseadas no `.env.example`.
4. Inicie o servidor de desenvolvimento: `npm run dev`.

## Build
```bash
npm run build
```

O resultado do build fica na pasta `dist`.

## Deploy na Vercel
1. Conecte o repositório GitHub à Vercel.
2. Use as configurações padrão:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
3. Adicione as variáveis de ambiente necessárias, se usar integrações externas.

## Deploy no GitHub Pages
Este projeto já inclui um workflow em `.github/workflows/deploy.yml`.

1. Envie a pasta para um repositório no GitHub.
2. No GitHub, abra `Settings > Pages`.
3. Em `Build and deployment`, selecione `GitHub Actions`.
4. Faça push na branch `main`.

---
Desenvolvido com foco em minimalismo e eficiência.
