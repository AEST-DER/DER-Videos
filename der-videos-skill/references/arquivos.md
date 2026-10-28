# Referência de Arquivos

## lib/msalConfig.js

Contém três funções exportadas, sem estado global:

| Função | Descrição |
|---|---|
| `getAuthorizationUrl(redirectUri)` | Monta a URL de login da Microsoft com os escopos corretos |
| `exchangeCodeForToken(code, redirectUri)` | Troca o authorization code por access_token + refresh_token |
| `refreshAccessToken(refreshToken)` | Renova o access_token usando o refresh_token |

O `redirectUri` deve ser idêntico ao cadastrado no Azure App Registration.
É lido de `process.env.APP_BASE_URL` + `/api/auth/callback`.

---

## pages/api/auth/login.js

Redireciona o browser para a tela de login da Microsoft.
Constrói o `redirectUri` a partir de `APP_BASE_URL` ou `req.headers.host` como fallback.

---

## pages/api/auth/callback.js

Recebe `?code=` da Microsoft após login bem-sucedido.
Chama `exchangeCodeForToken`, salva os dois tokens em cookies HttpOnly e redireciona para `/`.
Em caso de erro, redireciona para `/?error=mensagem`.

---

## pages/api/auth/status.js

Chamado pelo frontend ao carregar a página para saber se o usuário está logado.
- Se `access_token` cookie existe → retorna `{ authenticated: true }`
- Se não existe mas `refresh_token` existe → tenta renovar, seta novo cookie, retorna `true`
- Caso contrário → retorna `{ authenticated: false }`

---

## pages/api/auth/logout.js

Expira ambos os cookies com `Max-Age=0` e redireciona para `/`.

---

## pages/api/shared.js

Ponto de entrada da navegação. Retorna os metadados das pastas raiz configuradas
em `ROOT_FOLDERS` (array de `{ driveId, itemId }`).

Usa `Promise.allSettled` para buscar todas em paralelo.
Se uma pasta falhar, retorna com `error: true` no item em vez de quebrar as demais.

Endpoint Graph usado: `GET /drives/{driveId}/items/{itemId}`
(busca metadados da pasta, não seus filhos — filhos são carregados sob demanda)

---

## pages/api/children.js

Lista o conteúdo de qualquer pasta, recebendo `driveId` e `itemId` via query string.
Usado tanto para navegar dentro das pastas raiz quanto para subpastas recursivas.

Endpoint Graph: `GET /drives/{driveId}/items/{itemId}/children`
Params: `$select=id,name,folder,video,file,size,lastModifiedDateTime,@microsoft.graph.downloadUrl,thumbnails&$top=100`

**Retorna** array normalizado com campos:
```js
{
  id, name,
  type,          // "folder" | "video" | "file"
  driveId,
  size,
  lastModified,
  downloadUrl,   // @microsoft.graph.downloadUrl (expira!)
  thumbnailUrl,
  childCount,    // só para pastas
}
```

Ordenação: pastas primeiro, depois arquivos/vídeos, ambos alfabéticos pt-BR.

---

## pages/api/video-url.js

Recebe `driveId` e `itemId` via query string.
Busca o item completo na Graph API (sem `$select`, para garantir que `@microsoft.graph.downloadUrl` venha).
Faz `res.redirect(302, downloadUrl)` — o browser segue o redirect e faz streaming.

**Não retorna JSON.** A tag `<video src="/api/video-url?...">` acessa diretamente.

---

## pages/index.js

Página única com toda a UI. Componentes:

### `<Home>` (default export)
Estado principal:
- `authenticated` — null (verificando) | true | false
- `items` — array de itens do nível atual
- `navStack` — array de `{ id, driveId, name }` representando o caminho atual
- `playingVideo` — item de vídeo aberto no player, ou null

Lógica de navegação:
- `navStack.length === 0` → chama `/api/shared` (pastas raiz)
- `navStack.length > 0` → chama `/api/children` com o último item da pilha
- Clicar numa pasta → push em `navStack`
- Clicar no breadcrumb → slice em `navStack`

### `<VideoModal>`
Recebe `video` (item) e `onClose`.
Monta `src` diretamente como `/api/video-url?driveId=...&itemId=...`.
Fecha com Escape ou clique fora.

### `<ItemCard>`
Card clicável. Exibe ícone, badge de tipo, nome e metadados (childCount ou tamanho).

### `<MicrosoftLogo>`
SVG inline do logo Microsoft (4 quadrados coloridos).

---

## styles/globals.css

Design tokens em `:root`. Modo escuro nativo (não usa media query — sempre escuro).
Classes principais:
- `.app-container`, `.header`, `.main-content`
- `.items-grid`, `.item-card`, `.item-card-icon`, `.item-card-name`
- `.modal-overlay`, `.modal-content`, `.video-wrapper`, `.video-player`
- `.breadcrumb`, `.breadcrumb-item`, `.breadcrumb-sep`
- `.loading-state`, `.error-state`, `.empty-state`, `.error-banner`
- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`
- `.login-screen`, `.login-btn-ms`
- `.spinner` (animação CSS pura)
