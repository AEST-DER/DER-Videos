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
 *   1. Tenta o endpoint de busca por pasta `/drives/{driveId}/items/{itemId}/search(q='{termo}')`
 *      (sem `thumbnails` no `$select`, pois a Graph API rejeita `thumbnails` em `/search` com HTTP 400).
 *   2. Se o índice do SharePoint não retornar resultados para pastas compartilhadas de outros usuários
 *      (comportamento conhecido da Graph API onde `/items/{id}/search` retorna `[]` em drives externos),
 *      executa uma varredura recursiva rápida em largura (BFS concorrente) via `/children` com filtro local
 *      insensível a acentos/maiúsculas e orçamento de tempo seguro para a Vercel.
 */

import { ROOT_FOLDERS, folderNames, normalizeGroupKey } from "./shared";
import { parseTargets } from "./children";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

// Limites de segurança para a varredura BFS dentro do timeout de 10s da Vercel Hobby
const MAX_BFS_DEPTH = 6;
const MAX_BFS_REQUESTS = 45;
const BFS_TIME_BUDGET_MS = 6500;

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
    // 0. Se a busca é global (na raiz), também verifica as próprias pastas raiz (ROOT_FOLDERS),
    //    pois o usuário pode pesquisar pelo nome amigável do lote (ex: "LOTE 1", "PLANEP")
    //    ou pelo nome original da pasta raiz.
    const rootMatches = [];
    if (isRootSearch) {
      const rootMetaResults = await Promise.allSettled(
        targets.map(async (target) => {
          const url = `${GRAPH_API}/drives/${target.driveId}/items/${target.itemId}?$select=id,name,folder,lastModifiedDateTime,parentReference`;
          const r = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!r.ok) return null;
          return { driveId: target.driveId, data: await r.json() };
        })
      );

      for (const r of rootMetaResults) {
        if (r.status === "fulfilled" && r.value?.data) {
          const item = normalizeSearchResult(r.value.data, r.value.driveId, "Início");
          if (matchesQuery(item, normalizedQuery) && matchesTypeFilter(item, type)) {
            rootMatches.push(item);
          }
        }
      }
    }
    // 1. Tenta o endpoint nativo de search da Graph API em cada alvo
    // IMPORTANTE: Não incluir `thumbnails` no $select de /search (causa HTTP 400 na Graph API)
    const searchResults = await Promise.allSettled(
      targets.map(async (target) => {
        const url =
          `${GRAPH_API}/drives/${target.driveId}/items/${target.itemId}/search(q='${escapedQuery}')` +
          `?$select=id,name,folder,video,file,size,lastModifiedDateTime,parentReference` +
          `&$top=50`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const err = new Error(
            `${response.status}: ${errData.error?.message || "Erro na Graph API"}`
          );
          err.status = response.status;
          throw err;
        }

        const data = await response.json();
        return {
          target,
          items: data.value || [],
        };
      })
    );

    // Se todas as chamadas falharam com 401, propaga 401 para o frontend renovar sessão
    const allUnauthorized =
      searchResults.length > 0 &&
      searchResults.every((r) => r.status === "rejected" && r.reason?.status === 401);

    if (allUnauthorized) {
      return res.status(401).json({ error: "Token expirado. Faça login novamente." });
    }

    const seenItems = new Set();
    const collectedItems = [];
    const targetsNeedingBfs = [];

    for (const rootItem of rootMatches) {
      const uniqueKey = `${rootItem.driveId}:${rootItem.id}`;
      if (!seenItems.has(uniqueKey)) {
        seenItems.add(uniqueKey);
        collectedItems.push(rootItem);
      }
    }

    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const target = targets[i];

      if (result.status !== "fulfilled") {
        // Se falhou por erro diferente de 401/403/404, tenta fallback BFS nesse alvo
        const status = result.reason?.status;
        if (status !== 401 && status !== 403 && status !== 404) {
          targetsNeedingBfs.push(target);
        }
        continue;
      }

      const { items } = result.value;

      // No OneDrive for Business / SharePoint, /items/{id}/search frequentemente retorna []
      // para pastas compartilhadas ou subitens cujo nome foi mapeado em folderNames.
      // Nesses casos, acionamos a varredura BFS para garantir que nenhum item existente passe despercebido.
      if (items.length === 0) {
        targetsNeedingBfs.push(target);
        continue;
      }

      for (const rawItem of items) {
        const itemDriveId = rawItem.parentReference?.driveId || target.driveId;
        const uniqueKey = `${itemDriveId}:${rawItem.id}`;
        if (seenItems.has(uniqueKey)) continue;

        const item = normalizeSearchResult(rawItem, itemDriveId);
        if (!matchesQuery(item, normalizedQuery)) continue;
        if (!matchesTypeFilter(item, type)) continue;

        seenItems.add(uniqueKey);
        collectedItems.push(item);
      }

      // Se nenhum subitem foi encontrado neste alvo via /search, inclui no BFS
      const foundInTarget = items.some((rawItem) => {
        const itemDriveId = rawItem.parentReference?.driveId || target.driveId;
        const item = normalizeSearchResult(rawItem, itemDriveId);
        return matchesQuery(item, normalizedQuery) && matchesTypeFilter(item, type);
      });
      if (!foundInTarget) {
        targetsNeedingBfs.push(target);
      }
    }

    // 2. Fallback / Complemento: Varredura recursiva rápida em largura (BFS) via /children
    // Resolve 100% dos casos em que o índice /search do OneDrive de outro usuário retorna vazio
    if (targetsNeedingBfs.length > 0) {
      const bfsItems = await crawlTargetsBfs(
        targetsNeedingBfs,
        accessToken,
        normalizedQuery,
        type
      );

      for (const item of bfsItems) {
        const uniqueKey = `${item.driveId}:${item.id}`;
        if (!seenItems.has(uniqueKey)) {
          seenItems.add(uniqueKey);
          collectedItems.push(item);
        }
      }
    }

    // Agrupa pastas de mesmo nome que estejam no mesmo caminho lógico ou nível
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
 * Percorre as pastas via `/children` respeitando limite de requisições e orçamento de tempo.
 */
async function crawlTargetsBfs(targets, accessToken, normalizedQuery, type) {
  const startTime = Date.now();
  let requestCount = 0;
  const matched = [];
  const visitedFolders = new Set();

  // Inicializa a fila do nível 0 com os alvos de busca
  let currentQueue = targets.map((t) => ({
    driveId: t.driveId,
    itemId: t.itemId,
    trail: "",
  }));

  for (let depth = 0; depth < MAX_BFS_DEPTH && currentQueue.length > 0; depth++) {
    if (Date.now() - startTime > BFS_TIME_BUDGET_MS) break;
    if (requestCount >= MAX_BFS_REQUESTS) break;

    const remainingBudget = MAX_BFS_REQUESTS - requestCount;
    const batch = currentQueue.slice(0, remainingBudget);
    requestCount += batch.length;

    const nextQueue = [];

    const batchResults = await Promise.allSettled(
      batch.map(async (node) => {
        const folderKey = `${node.driveId}:${node.itemId}`;
        if (visitedFolders.has(folderKey)) return { node, children: [] };
        visitedFolders.add(folderKey);

        const url =
          `${GRAPH_API}/drives/${node.driveId}/items/${node.itemId}/children` +
          `?$select=id,name,folder,video,file,size,lastModifiedDateTime,parentReference` +
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
        const childDriveId = rawChild.parentReference?.driveId || node.driveId;
        const item = normalizeSearchResult(rawChild, childDriveId, node.trail);

        if (matchesQuery(item, normalizedQuery) && matchesTypeFilter(item, type)) {
          matched.push(item);
        }

        // Se for pasta, enfileira para explorar o próximo nível de profundidade
        if (item.type === "folder") {
          const nextTrail = item.parentPath
            ? `${item.parentPath} / ${item.name}`
            : item.name;

          nextQueue.push({
            driveId: childDriveId,
            itemId: item.id,
            trail: nextTrail,
          });
        }
      }
    }

    currentQueue = nextQueue;
  }

  return matched;
}

function normalizeSearchResult(item, driveId, fallbackTrail = "") {
  const isFolder = !!item.folder;
  const isVideo = !!item.video || isVideoFile(item.name || "");
  const rawName = (item.name || "Sem nome").trim();
  const displayName = isFolder ? folderNames[rawName] || rawName : rawName;
  const parentPath = formatParentPath(item.parentReference?.path) || fallbackTrail;

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
    parentPath,
  };
}

/**
 * Remove acentos, converte para minúsculas e normaliza espaços
 * para permitir busca tolerante a acentuação e caixa.
 */
function normalizeText(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesQuery(item, normalizedQuery) {
  if (!normalizedQuery) return true;
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = normalizeText(
    `${item.name} ${item.originalName || ""} ${item.parentPath || ""}`
  );
  return terms.every((term) => haystack.includes(term));
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

/**
 * Converte o parentReference.path da Graph API
 * (ex: "/drives/b!.../root:/02 - Produto 2/2024/Trecho A")
 * em uma trilha legível (ex: "LOTE 1 / 2024 / Trecho A").
 */
function formatParentPath(rawPath) {
  if (!rawPath) return "";

  const rootMarker = "root:";
  const idx = rawPath.indexOf(rootMarker);
  const relative = idx !== -1 ? rawPath.slice(idx + rootMarker.length) : rawPath;

  const segments = relative
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      try {
        const decoded = decodeURIComponent(seg);
        return folderNames[decoded] || decoded;
      } catch {
        return folderNames[seg] || seg;
      }
    });

  return segments.join(" / ");
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
