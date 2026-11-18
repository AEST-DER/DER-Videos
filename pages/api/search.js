/**
 * pages/api/search.js
 *
 * Busca recursiva (deep-search) de pastas e vídeos na Microsoft Graph API.
 *
 * Query params:
 *   - q:       (Obrigatório) Termo de busca
 *   - driveId: (Opcional) Filtra a busca dentro de um drive específico (ou "group")
 *   - itemId:  (Opcional) Filtra a busca a partir de uma pasta específica (ou lista de pares "driveId:itemId")
 *   - type:    (Opcional) "video" | "folder" | "all" (padrão: "all", exclui arquivos comuns que não são vídeo)
 *
 * Estratégia Híbrida de Deep-Search (resiliente às limitações do OneDrive for Business):
 *   1. Executa em paralelo a consulta rápida `/drives/{driveId}/items/{itemId}/search(q='{termo}')`
 *      e uma varredura recursiva rápida em largura (BFS concorrente) via `/children`.
 *   2. No `/children` do BFS, usa o mesmo `$select` testado e aprovado de `children.js`
 *      (sem `parentReference`, que é omitido/bloqueado pela Graph API em drives compartilhados de terceiros),
 *      propagando o `driveId` e a trilha (`trail`) diretamente a partir do nó pai.
 */

import { ROOT_FOLDERS, folderNames, normalizeGroupKey } from "./shared";
import { parseTargets } from "./children";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

// Limites de segurança para a varredura BFS dentro do timeout de 10s da Vercel Hobby
const MAX_BFS_DEPTH = 8;
const MAX_BFS_REQUESTS = 120;
const BFS_TIME_BUDGET_MS = 7500;
const BFS_CONCURRENCY_PER_BATCH = 20;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const accessToken = getTokenFromCookies(req);
  if (!accessToken) {
    return res.status(401).json({ error: "Não autenticado. Faça login primeiro." });
  }

  const { q, driveId, itemId, type = "all" } = req.query;
  const query = (q || "").trim();

  if (!query) {
    return res.status(400).json({ error: "O parâmetro de busca 'q' é obrigatório." });
  }

  // Deduplica alvos (uma subárvore específica, grupo de pastas ou todas as ROOT_FOLDERS)
  const rawTargets =
    driveId && itemId ? parseTargets(driveId, itemId) : ROOT_FOLDERS;

  const targets = [];
  const seenTargets = new Set();
  for (const t of rawTargets) {
    const k = `${t.driveId}:${t.itemId}`;
    if (!seenTargets.has(k)) {
      seenTargets.add(k);
      targets.push(t);
    }
  }

  const isRootSearch = !(driveId && itemId);
  const normalizedQuery = normalizeText(query);
  const escapedQuery = encodeURIComponent(query.replace(/'/g, "''"));

  try {
    // 1. Consulta os metadados das pastas-alvo para:
    //    - Obter o nome amigável da raiz de cada alvo (para compor a trilha `parentPath` no BFS)
    //    - Permitir que buscas na raiz também encontrem as próprias pastas de nível 0
    const targetMetaResults = await Promise.allSettled(
      targets.map(async (target) => {
        const url = `${GRAPH_API}/drives/${target.driveId}/items/${target.itemId}?$select=id,name,folder,lastModifiedDateTime`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) {
          const err = new Error(`HTTP ${r.status}`);
          err.status = r.status;
          throw err;
        }
        const data = await r.json();
        const rawName = (data.name || "").trim();
        const displayName = folderNames[rawName] || folderNames[data.name] || rawName;
        return {
          driveId: target.driveId,
          itemId: target.itemId,
          data,
          displayName,
        };
      })
    );

    // Se todas as chamadas falharam com 401, propaga 401 para o frontend renovar sessão
    const allUnauthorized =
      targetMetaResults.length > 0 &&
      targetMetaResults.every((r) => r.status === "rejected" && r.reason?.status === 401);

    if (allUnauthorized) {
      return res.status(401).json({ error: "Token expirado. Faça login novamente." });
    }

    const seenItems = new Set();
    const collectedItems = [];
    const accessibleTargets = [];

    for (let i = 0; i < targetMetaResults.length; i++) {
      const r = targetMetaResults[i];
      const fallbackTarget = targets[i];

      if (r.status === "fulfilled" && r.value) {
        const { driveId: tDriveId, itemId: tItemId, data, displayName } = r.value;
        accessibleTargets.push({
          driveId: tDriveId,
          itemId: tItemId,
          trail: displayName || "",
        });

        // Se a busca começou na Home, verifica se a própria pasta raiz corresponde ao termo
        if (isRootSearch) {
          const rootItem = normalizeSearchResult(data, tDriveId, "Início");
          if (matchesQuery(rootItem, normalizedQuery) && matchesTypeFilter(rootItem, type)) {
            const uniqueKey = `${rootItem.driveId}:${rootItem.id}`;
            if (!seenItems.has(uniqueKey)) {
              seenItems.add(uniqueKey);
              collectedItems.push(rootItem);
            }
          }
        }
      } else if (r.reason?.status !== 401 && r.reason?.status !== 403 && r.reason?.status !== 404) {
        accessibleTargets.push({
          driveId: fallbackTarget.driveId,
          itemId: fallbackTarget.itemId,
          trail: "",
        });
      }
    }

    // 2. Executa em paralelo:
    //    (A) Endpoint `/search` da Graph API (para casos onde o índice do SharePoint responde)
    //    (B) Varredura recursiva rápida em largura (BFS) via `/children` (que garante encontrar
    //        subpastas e vídeos em qualquer nível de profundidade mesmo em drives compartilhados onde `/search` falha)
    const [graphSearchSettled, bfsItems] = await Promise.all([
      Promise.allSettled(
        accessibleTargets.map(async (target) => {
          const url =
            `${GRAPH_API}/drives/${target.driveId}/items/${target.itemId}/search(q='${escapedQuery}')` +
            `?$select=id,name,folder,video,file,size,lastModifiedDateTime` +
            `&$top=50`;

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) return { target, items: [] };
          const data = await response.json();
          return { target, items: data.value || [] };
        })
      ),
      crawlTargetsBfs(accessibleTargets, accessToken, normalizedQuery, type),
    ]);

    // Consolida resultados do BFS (que possuem a trilha hierárquica exata)
    for (const item of bfsItems) {
      const uniqueKey = `${item.driveId}:${item.id}`;
      if (!seenItems.has(uniqueKey)) {
        seenItems.add(uniqueKey);
        collectedItems.push(item);
      }
    }

    // Consolida resultados adicionais do Graph `/search` (caso estejam além da profundidade do BFS)
    for (const res of graphSearchSettled) {
      if (res.status !== "fulfilled") continue;
      const { target, items } = res.value;

      for (const rawItem of items) {
        // Ignora a própria pasta raiz se o `/search` a devolver como nó inicial
        if (rawItem.id === target.itemId) continue;

        const uniqueKey = `${target.driveId}:${rawItem.id}`;
        if (seenItems.has(uniqueKey)) continue;

        const item = normalizeSearchResult(rawItem, target.driveId, target.trail);
        if (!matchesQuery(item, normalizedQuery)) continue;
        if (!matchesTypeFilter(item, type)) continue;

        seenItems.add(uniqueKey);
        collectedItems.push(item);
      }
    }

    // Agrupa pastas de mesmo nome que estejam no mesmo caminho lógico
    const finalItems = mergeDuplicateSearchFolders(collectedItems);

    // Ordena: pastas primeiro, depois vídeos, ambos em ordem alfabética pt-BR
    finalItems.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    return res.status(200).json({ items: finalItems });
  } catch (err) {
    console.error("Erro interno em /api/search:", err);
    return res.status(500).json({ error: "Erro interno ao realizar busca" });
  }
}

/**
 * Varredura em largura (BFS) concorrente por nível de profundidade.
 * Usa exatamente o mesmo formato de chamada `/children` de `pages/api/children.js`.
 */
async function crawlTargetsBfs(targets, accessToken, normalizedQuery, type) {
  const startTime = Date.now();
  let requestCount = 0;
  const matched = [];
  const visitedFolders = new Set();

  let currentQueue = targets.map((t) => ({
    driveId: t.driveId,
    itemId: t.itemId,
    trail: t.trail || "",
  }));

  for (let depth = 0; depth < MAX_BFS_DEPTH && currentQueue.length > 0; depth++) {
    if (Date.now() - startTime > BFS_TIME_BUDGET_MS) break;
    if (requestCount >= MAX_BFS_REQUESTS) break;

    const nextQueue = [];

    // Processa a fila do nível atual em sub-lotes concorrentes
    for (let i = 0; i < currentQueue.length; i += BFS_CONCURRENCY_PER_BATCH) {
      if (Date.now() - startTime > BFS_TIME_BUDGET_MS) break;
      if (requestCount >= MAX_BFS_REQUESTS) break;

      const remainingBudget = MAX_BFS_REQUESTS - requestCount;
      const chunk = currentQueue.slice(i, i + Math.min(BFS_CONCURRENCY_PER_BATCH, remainingBudget));

      const nodesToFetch = [];
      for (const node of chunk) {
        const folderKey = `${node.driveId}:${node.itemId}`;
        if (!visitedFolders.has(folderKey)) {
          visitedFolders.add(folderKey);
          nodesToFetch.push(node);
        }
      }

      if (nodesToFetch.length === 0) continue;
      requestCount += nodesToFetch.length;

      const batchResults = await Promise.allSettled(
        nodesToFetch.map(async (node) => {
          const url =
            `${GRAPH_API}/drives/${node.driveId}/items/${node.itemId}/children` +
            `?$select=id,name,folder,video,file,size,lastModifiedDateTime` +
            `&$top=200`;

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            return { node, children: [] };
          }

          const data = await response.json();
          return { node, children: data.value || [] };
        })
      );

      for (const res of batchResults) {
        if (res.status !== "fulfilled") continue;
        const { node, children } = res.value;

        for (const rawChild of children) {
          const item = normalizeSearchResult(rawChild, node.driveId, node.trail);

          if (matchesQuery(item, normalizedQuery) && matchesTypeFilter(item, type)) {
            matched.push(item);
          }

          // Se for subpasta, enfileira para explorar o próximo nível de profundidade
          if (item.type === "folder") {
            const nextTrail = node.trail
              ? `${node.trail} / ${item.name}`
              : item.name;

            nextQueue.push({
              driveId: node.driveId,
              itemId: item.id,
              trail: nextTrail,
            });
          }
        }
      }
    }

    currentQueue = nextQueue;
  }

  return matched;
}

function normalizeSearchResult(item, driveId, trail = "") {
  const isFolder = !!item.folder;
  const isVideo = !!item.video || isVideoFile(item.name || "");
  const rawName = (item.name || "Sem nome").trim();
  const displayName = isFolder ? folderNames[rawName] || rawName : rawName;

  return {
    id: item.id,
    name: displayName,
    originalName: rawName,
    type: isFolder ? "folder" : isVideo ? "video" : "file",
    driveId,
    size: item.size || 0,
    lastModified: item.lastModifiedDateTime || null,
    thumbnailUrl: null,
    childCount: item.folder?.childCount ?? null,
    parentPath: trail,
  };
}

/**
 * Remove acentos, converte para minúsculas e normaliza separadores (_, -, .)
 * para permitir busca tolerante a acentuação, caixa e pontuação.
 */
function normalizeText(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(item, normalizedQuery) {
  if (!normalizedQuery) return true;
  const terms = normalizedQuery.split(" ").filter(Boolean);
  // Compara tanto com separadores normalizados quanto com a string contínua
  const haystackSpaced = normalizeText(`${item.name} ${item.originalName || ""}`);
  const haystackCompact = haystackSpaced.replace(/\s+/g, "");
  return terms.every(
    (term) => haystackSpaced.includes(term) || haystackCompact.includes(term)
  );
}

function matchesTypeFilter(item, type) {
  if (type === "video") return item.type === "video";
  if (type === "folder") return item.type === "folder";
  return item.type === "folder" || item.type === "video";
}

function mergeDuplicateSearchFolders(items) {
  const folderGroups = new Map();
  const nonFolders = [];

  for (const item of items) {
    if (item.type !== "folder") {
      nonFolders.push(item);
      continue;
    }

    const key = `${normalizeGroupKey(item.parentPath)}::${normalizeGroupKey(item.name)}`;
    if (!folderGroups.has(key)) {
      folderGroups.set(key, {
        ...item,
        sources: [{ driveId: item.driveId, itemId: item.id, childCount: item.childCount }],
      });
    } else {
      const existing = folderGroups.get(key);
      existing.sources.push({
        driveId: item.driveId,
        itemId: item.id,
        childCount: item.childCount,
      });
      if (existing.childCount !== null || item.childCount !== null) {
        existing.childCount = (existing.childCount || 0) + (item.childCount || 0);
      }
    }
  }

  const mergedFolders = Array.from(folderGroups.values()).map((group) => {
    if (group.sources.length === 1) return group;
    return {
      ...group,
      id: group.sources.map((s) => `${s.driveId}:${s.itemId}`).join(","),
      driveId: "group",
      isGrouped: true,
      sourceCount: group.sources.length,
    };
  });

  return [...mergedFolders, ...nonFolders];
}

function isVideoFile(name) {
  const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv"];
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const ext = name.toLowerCase().slice(dotIndex);
  return videoExtensions.includes(ext);
}

function getTokenFromCookies(req) {
  const cookieStr = req.headers.cookie || "";
  const cookies = cookieStr.split(";").reduce((acc, pair) => {
    const [key, ...val] = pair.trim().split("=");
    if (key) acc[key.trim()] = val.join("=").trim();
    return acc;
  }, {});
  return cookies.access_token || null;
}
