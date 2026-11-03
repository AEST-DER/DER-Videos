# Diretrizes do Workspace — DER Vídeos

Instruções fundamentais para agentes e desenvolvedores atuando neste repositório.

---

## 1. Visão Geral do Projeto

Aplicação web desenvolvida para a organização **DER/MG**, permitindo aos usuários autenticados via Microsoft (Entra ID / Azure AD) navegar e reproduzir vídeos corporativos hospedados no OneDrive/SharePoint diretamente pelo navegador, sem necessidade de download prévio.

- **Deploy:** Vercel (plano Hobby).
- **Stack:** Next.js 14 (Pages Router), React 18, JavaScript puro (ES6+), sem frameworks de UI externos (CSS puro em `styles/globals.css`).

---

## 2. Invariantes Arquiteturais e Guardrails

> [!IMPORTANT]
> As seguintes regras devem ser estritamente preservadas em qualquer refatoração ou alteração de código:

### Autenticação (OAuth 2.0 Authorization Code Flow)
- **Fluxo Interativo de Usuário**: Utiliza exclusivamente chamadas diretas via `fetch` aos endpoints da Microsoft (`/oauth2/v2.0/token` e `/authorize`).
- **NUNCA introduzir**: Client Credentials Flow, NextAuth, MSAL SDK (`@azure/msal-node`, `@azure/msal-browser`) ou bibliotecas de terceiros para autenticação.
- **Cookies HttpOnly**: A sessão é mantida por `access_token` (curta duração, ~1h) e `refresh_token` (30 dias). Ambos são cookies com flags `HttpOnly; Secure; SameSite=Lax`.
- **Renovação de Sessão**: Realizada automaticamente pela rota `pages/api/auth/status.js`.

### Reprodução de Vídeos (Streaming Direto da CDN da Microsoft)
- **Tag `<video>` Nativa**: O frontend **NUNCA** deve fazer `fetch()` na rota `/api/video-url` nem tentar parsear a resposta como JSON (o browser quebra com erro de token inesperado ao receber bytes binários).
- **Consumo Correto**:
  ```jsx
  <video src={`/api/video-url?driveId=${video.driveId}&itemId=${video.id}`} controls />
  ```
- **Redirect 302**: A rota `pages/api/video-url.js` obtém a propriedade `@microsoft.graph.downloadUrl` da Microsoft Graph API e responde com `res.redirect(302, downloadUrl)`. Como a URL expira em poucas horas, ela **nunca** deve ser persistida ou cacheada.

### Gerenciamento de Pastas Raiz
- As pastas raiz exibidas na tela inicial estão configuradas no array `ROOT_FOLDERS` em `pages/api/shared.js`.
- Cada pasta raiz requer `{ driveId, itemId }`, mapeados através do diagnóstico da Graph API.

### Design System & Estilização
- Tema escuro ("media vault") implementado via variáveis CSS em `:root` em `styles/globals.css`.
- Não instalar Tailwind CSS, Bootstrap, Material-UI ou outras bibliotecas visuais sem solicitação expressa.

---

## 3. Skills Agênticas do Workspace

Este workspace possui skills operacionais em `.agents/skills/`.

### Skill: `/der-videos` (`.agents/skills/der-videos/SKILL.md`)
Ative esta skill ou consulte sua documentação para procedimentos operacionais detalhados:
- **`references/arquivos.md`**: Detalhamento e responsabilidade de cada arquivo (`lib/msalConfig.js`, rotas em `pages/api/`, etc.).
- **`references/configuracao.md`**: Guia de App Registration no Azure Entra ID, permissões delegadas e variáveis da Vercel.
- **`references/diagnostico.md`**: Como descobrir `driveId` e `itemId` para adicionar novas pastas usando rotas temporárias de debug.
- **`references/design.md`**: Catálogo de design tokens, paleta de cores e estrutura dos componentes UI.
- **`references/erros.md`**: Troubleshooting de erros conhecidos (ex: códigos `AADSTS900971`, `AADSTS65004`, parsing de JSON em vídeo, etc.).

---

## 4. Segurança e Variáveis de Ambiente

- **Arquivos sensíveis**: `.env.local` e `.env` **NUNCA** devem ser commitados no Git.
- **Variáveis obrigatórias**:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TENANT_ID`
  - `APP_BASE_URL` (ex: `https://dervideos.vercel.app` sem barra final)

