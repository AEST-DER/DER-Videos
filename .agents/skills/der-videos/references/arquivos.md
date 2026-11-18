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
em `ROOT_FOLDERS` (array exportado de `{ driveId, itemId }`) e aplica o mapa de nomes amigáveis `folderNames` (também exportado).

- **Agrupamento de pastas homônimas:** Pastas raiz de diferentes drives que resultam no mesmo nome de exibição (normalizado via `normalizeGroupKey`, ignorando caixa, espaços extras e diferenças entre hífen/travessão) são agrupadas em um único card virtual na home (`driveId: "group"`, `id: "driveId1:itemId1,driveId2:itemId2"`, `isGrouped: true`, `sourceCount` e `childCount` somado).
- Usa `Promise.allSettled` para buscar todas em paralelo. Se todas retornarem `401`, propaga `401` para o frontend renovar a sessão. Pastas inacessíveis individuais são omitidas quando há pastas válidas para não poluir a tela inicial.

Endpoint Graph usado: `GET /drives/{driveId}/items/{itemId}`
(busca metadados da pasta, não seus filhos — filhos são carregados sob demanda)

---

## pages/api/children.js

Lista o conteúdo de qualquer pasta (ou de um grupo de pastas homônimas), recebendo `driveId` e `itemId` via query string.
- Quando `driveId === "group"` (ou `itemId` contém múltiplos pares `driveId:itemId` separados por vírgula), usa `parseTargets(driveId, itemId)` para buscar os filhos de todas as pastas do grupo em paralelo (`Promise.allSettled`) e mescla subpastas de mesmo nome automaticamente, mantendo o agrupamento em qualquer profundidade da árvore.

Endpoint Graph: `GET /drives/{driveId}/items/{itemId}/children`
Params: `$select=id,name,folder,video,file,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=100`
*(Nota: `thumbnails` não deve ser incluído no `$select`, pois é uma relação de navegação na Graph API e não uma propriedade escalar).*

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

## pages/api/search.js

Executa busca recursiva (*deep-search*) híbrida de pastas e vídeos na Microsoft Graph API.

Query params:
- `q` (obrigatório): termo de busca
- `driveId` e `itemId` (opcionais): restringem a busca à subárvore de uma pasta específica (ou grupo de pastas via `parseTargets`). Quando omitidos, a busca é disparada em paralelo (`Promise.allSettled`) em todas as pastas de `ROOT_FOLDERS` exportadas por `pages/api/shared.js` (incluindo verificação das próprias pastas raiz pelo nome original ou nome mapeado em `folderNames`).
- `type` (opcional): `"all"` (padrão, retorna pastas e vídeos), `"video"` ou `"folder"`.

**Estratégia Híbrida (BFS Concorrente via `/children` + Graph `/search`):**
1. **Metadados de Nível 0**: Consulta as pastas-alvo para obter seus nomes de exibição (incluindo mapeamento `folderNames`) e compor a trilha `parentPath`.
2. **Varredura BFS concorrente (`crawlTargetsBfs`) e Graph `/search` em paralelo**:
   - Usa exatamente o mesmo `$select` de `children.js` (`id,name,folder,video,file,size,lastModifiedDateTime`), sem `thumbnails` nem `parentReference` (que a Graph API omite ou rejeita em drives compartilhados de outros usuários), propagando `driveId` e `trail` diretamente do nó pai.
   - Percorre até `MAX_BFS_DEPTH = 8` níveis, `MAX_BFS_REQUESTS = 120` requisições (em lotes concorrentes de 20) e orçamento de `7.5s`.
   - `matchesQuery` compara o termo de busca exclusivamente contra o nome do próprio item (`name` e `originalName`), normalizando acentos, caixa e separadores (`_`, `-`, `.`), evitando que todos os filhos de uma pasta herdem falsos positivos pelo caminho da pasta pai.

**Retorna** `{ items }` deduplicado e com pastas homônimas mescladas (`mergeDuplicateSearchFolders`), contendo os campos normalizados de `children.js` acrescidos de:
- `originalName`: nome original no OneDrive antes do mapeamento `folderNames`
- `parentPath`: trilha legível da pasta pai extraída de `parentReference.path` ou construída durante o BFS (ex: `"LOTE 1 / 2024 / Trecho A"`)

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
- `items` — array de itens do nível atual (navegação pasta a pasta)
- `navStack` — array de `{ id, driveId, name }` representando o caminho atual
- `playingVideo` — item de vídeo aberto no player, ou null
- `searchInput` — valor em tempo real digitado na barra de busca do header
- `debouncedQuery` — termo de busca estabilizado após debounce de 300ms
- `searchResults`, `searchLoading`, `searchError` — resultados e estados da busca recursiva via `/api/search`

Lógica de navegação e busca:
- Quando `debouncedQuery` está vazio (`isSearching === false`):
  - `navStack.length === 0` → chama `/api/shared` (pastas raiz agrupadas)
  - `navStack.length > 0` → chama `/api/children` com o último item da pilha
- Quando `debouncedQuery` possui texto (`isSearching === true`):
  - Chama `/api/search?q=...` (se `navStack.length > 0`, inclui `driveId` e `itemId` da pasta atual para buscar recursivamente apenas naquela subárvore/grupo; caso contrário, busca em todas as `ROOT_FOLDERS`)
  - Alterna a área principal para exibir `searchResults`, mantendo o breadcrumb clicável com o indicador `🔍 Busca: "..."`
  - Clicar num vídeo abre o `<VideoModal>` imediatamente; clicar numa pasta encontrada limpa a busca e entra diretamente naquela pasta (`push` em `navStack`)
- Clicar numa pasta → push em `navStack`
- Clicar no breadcrumb → limpa a busca ativa (se houver) e faz slice em `navStack`

### `<VideoModal>`
Recebe `video` (item) e `onClose`.
Monta `src` diretamente como `/api/video-url?driveId=...&itemId=...`.
Fecha com Escape ou clique fora.

### `<ItemCard>`
Card clicável. Exibe ícone, badge de tipo (incluindo indicador `PASTA (N ORIGENS)` quando `item.isGrouped`), nome, trilha de origem `↳ parentPath` (nos resultados da busca) e metadados (`childCount` ou tamanho).

### `<MicrosoftLogo>`
SVG inline do logo Microsoft (4 quadrados coloridos).

---

## styles/globals.css

Design tokens em `:root`. Modo escuro nativo (não usa media query — sempre escuro).
Classes principais:
- `.app-container`, `.header`, `.main-content`
- `.header-search`, `.header-search-input`, `.header-search-icon`, `.header-search-clear`
- `.section-header`, `.section-header-right`, `.btn-clear-inline`
- `.items-grid`, `.item-card`, `.item-card-icon`, `.item-card-name`, `.item-card-path`
- `.modal-overlay`, `.modal-content`, `.video-wrapper`, `.video-player`
- `.breadcrumb`, `.breadcrumb-item`, `.breadcrumb-sep`
- `.loading-state`, `.error-state`, `.empty-state`, `.error-banner`
- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`
- `.login-screen`, `.login-btn-ms`
- `.spinner` (animação CSS pura)
