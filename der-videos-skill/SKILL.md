---
name: der-videos
description: >
  Skill para desenvolvimento e manutenção da aplicação DER Vídeos —
  um viewer Next.js hospedado na Vercel que autentica usuários via Microsoft
  (OAuth 2.0 Authorization Code Flow) e exibe vídeos armazenados em drives
  do OneDrive/SharePoint usando a Microsoft Graph API.
  Use esta skill sempre que o usuário mencionar: adicionar novas pastas de
  vídeo, corrigir erros de autenticação Microsoft, ajustar rotas da Graph API,
  mudar o visual da interface, configurar variáveis de ambiente na Vercel,
  registrar permissões no Azure/Entra ID, resolver erros de AADSTS, ou
  qualquer outra tarefa relacionada a esta aplicação. Use também ao receber
  arquivos .zip ou código desta aplicação para dar continuidade ao desenvolvimento.
---

# DER Vídeos — Skill de Desenvolvimento

## Visão Geral

Aplicação Next.js (Pages Router) que permite usuários da organização DER/MG
acessarem e reproduzirem vídeos armazenados em drives do OneDrive corporativo,
sem precisar baixar os arquivos. Hospedada na Vercel (plano Hobby).

**Stack:** Next.js 14 · React 18 · JavaScript puro · sem bibliotecas de UI

---

## Estrutura de Arquivos

```
DER-Videos/
├── package.json
├── next.config.js
├── vercel.json
├── .gitignore
├── .env.local               ← credenciais locais (nunca no Git)
├── lib/
│   └── msalConfig.js        ← funções de autenticação OAuth
├── pages/
│   ├── _app.js
│   ├── index.js             ← toda a UI (login + navegação + player)
│   └── api/
│       ├── auth/
│       │   ├── login.js     ← redireciona para login Microsoft
│       │   ├── callback.js  ← troca code por token, salva em cookie
│       │   ├── status.js    ← verifica/renova sessão
│       │   └── logout.js    ← expira cookies
│       ├── shared.js        ← retorna cards das pastas raiz
│       ├── children.js      ← lista filhos de uma pasta
│       └── video-url.js     ← redireciona 302 para downloadUrl do vídeo
└── styles/
    └── globals.css          ← design tokens + estilos (tema escuro)
```

Para detalhes de cada arquivo, leia `references/arquivos.md`.

---

## Fluxo de Autenticação

**Fluxo usado:** OAuth 2.0 Authorization Code Flow (login interativo do usuário).
**Não usa:** Client Credentials, NextAuth, MSAL SDK, ou qualquer biblioteca de terceiros.
As chamadas OAuth são feitas diretamente via `fetch` para os endpoints da Microsoft.

```
Usuário → /api/auth/login → Microsoft Login → /api/auth/callback
         → token salvo em cookie HttpOnly → tela principal
```

**Cookies usados (HttpOnly, não acessíveis via JS):**
- `access_token` — expira conforme `expires_in` da Microsoft (geralmente 1h)
- `refresh_token` — expira em 30 dias; `/api/auth/status` renova automaticamente

**Escopos solicitados:**
```
https://graph.microsoft.com/Files.Read.All offline_access User.Read
```

Para detalhes das variáveis de ambiente e configuração Azure, leia `references/configuracao.md`.

---

## Pastas Raiz Configuradas

As pastas de vídeo são hardcoded em `pages/api/shared.js` como array `ROOT_FOLDERS`.
Cada entrada tem `driveId` e `itemId` — identificados via rota de diagnóstico.

**Como adicionar uma nova pasta raiz:**
1. Deploy da rota `pages/api/debug-search.js` (ver `references/diagnostico.md`)
2. Acessar `/api/debug-search` logado no site
3. Localizar o item desejado no JSON retornado → copiar `driveId` e `id`
4. Adicionar novo objeto em `ROOT_FOLDERS` em `shared.js`
5. Remover rota de debug após uso

**Estrutura atual de ROOT_FOLDERS em shared.js:**
```js
const ROOT_FOLDERS = [
  { driveId: "b!whoE7...", itemId: "01QSAFR6..." },  // VÍDEOS RTA - usuário A
  { driveId: "b!wdSLo...", itemId: "01UIZVX..." },   // pasta - usuário B
  { driveId: "b!y6Mzv...", itemId: "01VMDDK..." },   // pasta - usuário C
  { driveId: "b!zlW0t...", itemId: "01IFKV5..." },   // pasta - usuário D
  { driveId: "b!FMYdA...", itemId: "01LLIJS..." },   // pasta - usuário E
];
```

---

## Reprodução de Vídeo

**Fluxo:**
1. Usuário clica no card do vídeo
2. Frontend monta: `src="/api/video-url?driveId=...&itemId=..."`
3. A tag `<video>` do browser faz GET nessa rota
4. `/api/video-url` busca o item na Graph API e faz `res.redirect(302, downloadUrl)`
5. O browser segue o redirect e faz streaming direto da CDN da Microsoft

**Importante:** A `@microsoft.graph.downloadUrl` expira em poucas horas.
Por isso o redirect é feito sempre sob demanda, nunca cacheado no frontend.
Não usar `fetch()` para ler essa rota — usar diretamente como `src` da tag `<video>`.

---

## Design System

Tema escuro "media vault". Variáveis CSS em `:root` em `globals.css`:
- `--bg-base: #0D0D0F` · `--bg-card: #1A1A1F` · `--accent: #3B7EF6`
- `--text-primary: #F0F0F5` · `--text-secondary: #8888A0`
- Fonte: Inter (Google Fonts)

Componentes principais em `index.js`: `VideoModal`, `ItemCard`, `MicrosoftLogo`.
Para referência completa do CSS, leia `references/design.md`.

---

## Referências

- `references/arquivos.md` — código e responsabilidade de cada arquivo
- `references/configuracao.md` — Azure, Vercel, variáveis de ambiente
- `references/diagnostico.md` — rotas de debug e como descobrir driveId/itemId
- `references/erros.md` — erros conhecidos e suas soluções
