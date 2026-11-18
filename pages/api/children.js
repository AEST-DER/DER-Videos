/**
 * pages/api/children.js
 *
 * Lista o conteúdo (filhos) de uma pasta (ou de um grupo de pastas homônimas) no OneDrive.
 *
 * Query params:
 *   - driveId: ID do drive onde a pasta está (ou "group" quando itemId contém múltiplos pares driveId:itemId)
 *   - itemId:  ID da pasta a listar (ou lista separada por vírgula "driveId1:itemId1,driveId2:itemId2")
 *
 * Chama: GET https://graph.microsoft.com/v1.0/drives/{driveId}/items/{itemId}/children
 */

import { folderNames, normalizeGroupKey } from "./shared";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const accessToken = getTokenFromCookies(req);
  if (!accessToken) {
    return res.status(401).json({ error: "Não autenticado. Faça login primeiro." });
  }

  const { driveId, itemId } = req.query;

  if (!driveId || !itemId) {
    return res
      .status(400)
      .json({ error: "Parâmetros obrigatórios: driveId e itemId" });
  }

  // Suporta tanto uma pasta única quanto um grupo virtual ("driveId1:itemId1,driveId2:itemId2")
  const targets = parseTargets(driveId, itemId);

  try {
    // Busca os filhos da pasta. O $select limita os campos para economizar banda.
    // Nota: não incluir `thumbnails` no $select direto (é um relacionamento e não propriedade escalar; usá-lo com $expand ou $select em itens compartilhados pode causar erro 400 na Graph API).
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const url =
          `${GRAPH_API}/drives/${target.driveId}/items/${target.itemId}/children` +
          `?$select=id,name,folder,video,file,size,lastModifiedDateTime,@microsoft.graph.downloadUrl` +
          `&$top=100`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          console.error(
            `Erro Graph API [drives/${target.driveId}/items/${target.itemId}/children]:`,
            error
          );

          const err = new Error(
            error.error?.message || "Erro ao consultar a Graph API"
          );
          err.status = response.status;
          throw err;
        }

        const data = await response.json();
        return {
          driveId: target.driveId,
          items: (data.value || []).map((item) => normalizeItem(item, target.driveId)),
          nextLink: data["@odata.nextLink"] || null,
        };
      })
    );

    // Se todas as chamadas falharam, retorna o status apropriado (401, 403, etc.)
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    if (fulfilled.length === 0) {
      const firstReason = results[0]?.reason;
      const status = firstReason?.status || 500;
      if (status === 401) {
        return res.status(401).json({ error: "Token expirado. Faça login novamente." });
      }
      if (status === 403) {
        return res.status(403).json({ error: "Sem permissão para acessar esta pasta." });
      }
      return res.status(status).json({
        error: firstReason?.message || "Erro ao consultar a Graph API",
      });
    }

    const rawItems = [];
    const seen = new Set();
    let nextLink = null;

    for (const r of fulfilled) {
      if (r.value.nextLink && !nextLink) {
        nextLink = r.value.nextLink;
      }
      for (const item of r.value.items) {
        const key = `${item.driveId}:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          rawItems.push(item);
        }
      }
    }

    // Se houver subpastas com o mesmo nome dentro do nível atual (ex: subpastas de um grupo),
    // agrupa-as automaticamente para manter a navegação unificada em qualquer profundidade
    const items = mergeFoldersByName(rawItems);

    // Ordena: pastas primeiro, depois arquivos, ambos em ordem alfabética
    items.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    res.status(200).json({ items, nextLink });
  } catch (err) {
    console.error("Erro interno em /api/children:", err);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

export function parseTargets(driveId, itemId) {
  if (driveId === "group" || String(itemId).includes(",")) {
    return String(itemId)
      .split(",")
      .map((pair) => {
        const [dId, iId] = pair.trim().split(":");
        return dId && iId ? { driveId: dId, itemId: iId } : null;
      })
      .filter(Boolean);
  }
  return [{ driveId, itemId }];
}

function mergeFoldersByName(items) {
  const folderGroups = new Map();
  const nonFolders = [];

  for (const item of items) {
    if (item.type !== "folder") {
      nonFolders.push(item);
      continue;
    }

    const key = normalizeGroupKey(item.name);
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
      if (
        item.lastModified &&
        (!existing.lastModified || new Date(item.lastModified) > new Date(existing.lastModified))
      ) {
        existing.lastModified = item.lastModified;
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

function normalizeItem(item, driveId) {
  const isFolder = !!item.folder;
  const isVideo =
    !!item.video || isVideoFile(item.name || "");
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
    downloadUrl: item["@microsoft.graph.downloadUrl"] || null,
    thumbnailUrl: item.thumbnails?.[0]?.large?.url || null,
    childCount: item.folder?.childCount ?? null,
  };
}

function isVideoFile(name) {
  const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv"];
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
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
