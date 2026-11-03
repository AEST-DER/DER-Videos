# Diagnóstico — Como Descobrir driveId e itemId

## Contexto

As pastas de vídeo **não aparecem** no endpoint `/me/drive/sharedWithMe` quando
o compartilhamento foi feito via link (não via "Compartilhar com pessoa").
Nesses casos, é preciso usar a Search API da Graph para localizar a pasta.

O endpoint `/me/drive/sharedWithMe` só retorna itens compartilhados
explicitamente com o usuário como pessoa. Acesso via link ou via membro
de site SharePoint não aparece nesse endpoint.

---

## Rota de Diagnóstico: debug-search.js

Crie temporariamente o arquivo `pages/api/debug-search.js`:

```js
export default async function handler(req, res) {
  const token = getCookie(req, "access_token");
  if (!token) return res.status(401).json({ error: "Não autenticado." });

  const results = {};

  // Busca pelo nome da pasta via Search API
  try {
    const searchRes = await fetch("https://graph.microsoft.com/v1.0/search/query", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{
          entityTypes: ["driveItem"],
          query: { queryString: "NOME DA PASTA AQUI" }, // ← alterar
          fields: ["id", "name", "parentReference", "folder", "webUrl"],
          from: 0,
          size: 25,
        }],
      }),
    });
    const data = await searchRes.json();
    const hits = data?.value?.[0]?.hitsContainers?.[0]?.hits || [];
    results.searchHits = hits.map(h => ({
      id: h.resource?.id,
      name: h.resource?.name,
      webUrl: h.resource?.webUrl,
      driveId: h.resource?.parentReference?.driveId,
      parentId: h.resource?.parentReference?.id,
      isFolder: !!h.resource?.folder,
    }));
  } catch (e) {
    results.searchError = e.message;
  }

  res.status(200).json(results);
}

function getCookie(req, name) {
  return (req.headers.cookie || "").split(";").reduce((acc, pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k?.trim() === name) acc = v.join("=").trim();
    return acc;
  }, null);
}
```

### Como usar

1. Substitua `"NOME DA PASTA AQUI"` pelo nome exato da pasta (ex: `"VÍDEOS RTA"`)
2. Suba o arquivo e aguarde redeploy na Vercel
3. Acesse `https://dervideos.vercel.app/api/debug-search` **já logado no site**
4. No JSON retornado, localize o item com `isFolder: true` e o nome correto
5. Copie `driveId` e `id` desse item
6. Adicione em `ROOT_FOLDERS` no `shared.js`
7. **Delete o arquivo de debug** após usar — ele expõe dados internos

### O que procurar no JSON retornado

```json
{
  "searchHits": [
    {
      "id": "01QSAFR6WCGH5GRB2XPBCIEBB3WWDRUCSH",   ← este é o itemId
      "name": "VÍDEOS RTA",
      "driveId": "b!whoE7FWYLUaYEImzCfT...",        ← este é o driveId
      "isFolder": false   ← atenção: a Search API às vezes retorna false
                             mesmo para pastas; confirme pelo name e webUrl
    }
  ]
}
```

**Nota:** A Search API pode retornar `isFolder: false` para pastas — isso é
um bug conhecido da Graph API. Confie no `name` e no `webUrl` para identificar
o item correto, não apenas no `isFolder`.

---

## Rota de Diagnóstico: debug-shared.js

Retorna o raw do endpoint `/me/drive/sharedWithMe` para inspeção:

```js
export default async function handler(req, res) {
  const token = getCookie(req, "access_token");
  if (!token) return res.status(401).json({ error: "Não autenticado." });

  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=50",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  res.status(response.status).json(await response.json());
}

function getCookie(req, name) {
  return (req.headers.cookie || "").split(";").reduce((acc, pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k?.trim() === name) acc = v.join("=").trim();
    return acc;
  }, null);
}
```

Útil para verificar se um item aparece como compartilhado diretamente.
Se a pasta não aparecer aqui, use `debug-search.js` em vez disso.

---

## Rota de Diagnóstico: debug-find-folder.js

Lista todas as pastas na raiz do site SharePoint `dermggovbr.sharepoint.com/sites/AEST`.
Útil quando a pasta está no SharePoint corporativo, não em OneDrive pessoal:

```js
const GRAPH = "https://graph.microsoft.com/v1.0";
const SITE_HOSTNAME = "dermggovbr.sharepoint.com";
const SITE_PATH     = "/sites/AEST";

export default async function handler(req, res) {
  const token = getCookie(req, "access_token");
  if (!token) return res.status(401).json({ error: "Não autenticado." });

  const results = {};
  const siteRes = await fetch(`${GRAPH}/sites/${SITE_HOSTNAME}:${SITE_PATH}`,
    { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

  results.site = { id: siteRes.id, name: siteRes.name };
  const drivesRes = await fetch(`${GRAPH}/sites/${siteRes.id}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

  results.drives = (drivesRes.value || []).map(d =>
    ({ id: d.id, name: d.name, driveType: d.driveType }));

  results.rootFolders = [];
  for (const drive of drivesRes.value || []) {
    const children = await fetch(
      `${GRAPH}/drives/${drive.id}/root/children?$select=id,name,folder`,
      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    for (const item of children.value || []) {
      if (item.folder) results.rootFolders.push(
        { driveName: drive.name, driveId: drive.id, folderId: item.id, folderName: item.name });
    }
  }
  res.status(200).json(results);
}
```

---

## Onde ficam as pastas de vídeo atualmente

As pastas estão em OneDrive pessoal/corporativo de usuários (não no site SharePoint AEST).
URL base: `https://dermggovbr-my.sharepoint.com/personal/{usuario}/Documents/`

Isso significa que o acesso depende do token delegado do usuário que acessa o site —
o usuário precisa ter permissão de leitura nas pastas para que a Graph API retorne os itens.
