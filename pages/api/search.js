/**
 * pages/api/search.js
 *
 * Busca recursiva (deep-search) de pastas e vídeos na Microsoft Graph API.
 *
 * Query params:
 *   - q:       (Obrigatório) Termo de busca
 *   - driveId: (Opcional) Filtra a busca dentro de um drive específico
 *   - itemId:  (Opcional) Filtra a busca a partir de uma pasta específica (subárvore)
 *   - type:    (Opcional) "video" | "folder" | "all" (padrão: "all", exclui arquivos comuns que não são vídeo)
 *
 * Chama: GET https://graph.microsoft.com/v1.0/drives/{driveId}/items/{itemId}/search(q='{termo}')
 * Se driveId/itemId não forem informados, executa a busca em paralelo em todas as ROOT_FOLDERS.
 */

import { ROOT_FOLDERS, folderNames } from "./shared";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

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

  // Define os alvos de busca: uma subárvore específica ou todas as pastas raiz (multi-drive)
  const targets =
    driveId && itemId
      ? [{ driveId, itemId }]
      : ROOT_FOLDERS;

  // Escapa aspas simples para a sintaxe OData search(q='...') e aplica URL encode
  const escapedQuery = encodeURIComponent(query.replace(/'/g, "''"));

  try {
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const url =
          `${GRAPH_API}/drives/${target.driveId}/items/${target.itemId}/search(q='${escapedQuery}')` +
          `?$select=id,name,folder,video,file,size,lastModifiedDateTime,parentReference,thumbnails` +
          `&$top=50`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (response.status === 401) {
            const authErr = new Error("Token expirado. Faça login novamente.");
            authErr.status = 401;
            throw authErr;
          }
          throw new Error(
            `${response.status}: ${errData.error?.message || "Erro na Graph API"}`
          );
        }

        const data = await response.json();
        return {
          driveId: target.driveId,
          rootItemId: target.itemId,
          items: data.value || [],
        };
      })
    );

    // Se todas as chamadas falharam com 401, propaga 401 para o frontend renovar sessão
    const allUnauthorized =
      results.length > 0 &&
      results.every((r) => r.status === "rejected" && r.reason?.status === 401);

    if (allUnauthorized) {
      return res.status(401).json({ error: "Token expirado. Faça login novamente." });
    }

    const seen = new Set();
    const normalizedItems = [];

    for (const result of results) {
      if (result.status !== "fulfilled") {
        console.error("Erro parcial em /api/search:", result.reason?.message);
        continue;
      }

      const { driveId: targetDriveId, items } = result.value;

      for (const rawItem of items) {
        const itemDriveId = rawItem.parentReference?.driveId || targetDriveId;
        const uniqueKey = `${itemDriveId}:${rawItem.id}`;

        if (seen.has(uniqueKey)) continue;
        seen.add(uniqueKey);

        const item = normalizeSearchResult(rawItem, itemDriveId);

        // Filtra conforme o parâmetro 'type' (por padrão traz pastas e vídeos, ignorando outros arquivos)
        if (type === "video" && item.type !== "video") continue;
        if (type === "folder" && item.type !== "folder") continue;
        if (type === "all" && item.type === "file") continue;

        normalizedItems.push(item);
      }
    }

    // Ordena: pastas primeiro, depois vídeos, ambos em ordem alfabética pt-BR
    normalizedItems.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    return res.status(200).json({ items: normalizedItems });
  } catch (err) {
    console.error("Erro interno em /api/search:", err);
    return res.status(500).json({ error: "Erro interno ao realizar busca" });
  }
}

function normalizeSearchResult(item, driveId) {
  const isFolder = !!item.folder;
  const isVideo = !!item.video || isVideoFile(item.name || "");
  const displayName = isFolder ? folderNames[item.name] || item.name : item.name;

  return {
    id: item.id,
    name: displayName || "Sem nome",
    originalName: item.name || "Sem nome",
    type: isFolder ? "folder" : isVideo ? "video" : "file",
    driveId,
    size: item.size || 0,
    lastModified: item.lastModifiedDateTime || null,
    thumbnailUrl: item.thumbnails?.[0]?.large?.url || null,
    childCount: item.folder?.childCount ?? null,
    parentPath: formatParentPath(item.parentReference?.path),
  };
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
