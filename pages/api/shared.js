/**
 * pages/api/shared.js
 *
 * Retorna a lista de pastas raiz configuradas.
 * Pastas de diferentes drives que resultam no mesmo nome de exibição (via folderNames
 * ou nome idêntico) são agrupadas automaticamente em um único card na tela inicial.
 * Ao clicar, o frontend navega para dentro via /api/children normalmente.
 */

const GRAPH_API = "https://graph.microsoft.com/v1.0";

// Cada objeto representa uma pasta raiz de um drive diferente.
// Para adicionar mais: inclua um novo objeto com driveId e itemId.
export const ROOT_FOLDERS = [
  {
    driveId: "b!whoE7FWYLUaYEImzCfTbC3Jdb0ZlNedDrl9AUW8vEtvo5yHX02WrQKkIpzT9z8IZ",
    itemId:  "01QSAFR6WCGH5GRB2XPBCIEBB3WWDRUCSH",
  },
  {
    driveId: "b!wdSLol8Ty0-xSVCsjiX7pD9HNZgqlGVLvXtWan8vYJUt53I6xz_oSIEmiH_J07cM",
    itemId:  "01UIZVXMR7A4PNUNZW5ZDL5Y4YFXDWPLVT",
  },
  {
    driveId: "b!y6Mzv180OU6r0xjapSH3P9PBm-q8ShVCv-o-5bUJm5C_oS3WePVcTpnr0iBw4Sr1",
    itemId:  "01VMDDKAWY6S67LYPQ4FE3CZCUEDJRRL5R",
  },
  {
    driveId: "b!zlW0tK-Is0OXk9PgToFMqnJdb0ZlNedDrl9AUW8vEtvo5yHX02WrQKkIpzT9z8IZ",
    itemId:  "01IFKV5KPNOM5KNL5JL5H3RWGPO3KLB5OY",
  },
  {

    driveId: "b!FMYdA-D_iESZQCQ6fXeblzHcIIBSXapEohXiUjrKcGHvPalwL-DbS7cHsiJcUgLb",
    itemId:  "01LLIJSH4JBVHVQZMCCVEZZW7DMQPCHBUL",
  },
  {
    name: "lote 1",
    itemId: "01JFH3TV7CMVXMZZ7DSJGLXDLZTC3VWBLL",
    driveId: "b!IagbPkMxS06IPBiiSlUGbBZvKl1JzmlFtWfUToL4hQHch8lkZrbzRanNFWWaUNDq",
    shareUrl: "https://dermggovbr-my.sharepoint.com/:f:/g/personal/x01594341222_der_mg_gov_br/IgDiZW7M5-OSTLuNeZi3WwVrAQbhzs2ilawik_I_EB7yakY"
  }
];

export const folderNames = {
  "02 - Produto 2": "LOTE 1",
  "PLANEP - LOTE 2": "LOTE 2 - PLANEP",
  "PLANEP – LOTE 2": "LOTE 2 - PLANEP",
  "PLANEP": "LOTE 2 - PLANEP",
  "LOTE 2": "LOTE 2 - PLANEP"
};

/**
 * Normaliza o nome de exibição para usar como chave de agrupamento
 * (case-insensitive, remove espaços extras e uniformiza travessões/hifens).
 */
export function normalizeGroupKey(name) {
  return (name || "")
    .trim()
    .replace(/\s*[–—-]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const token = getCookie(req, "access_token");
  if (!token) return res.status(401).json({ error: "Não autenticado." });

  // Deduplica entradas idênticas em ROOT_FOLDERS por driveId:itemId
  const uniqueRoots = [];
  const seenRoots = new Set();
  for (const root of ROOT_FOLDERS) {
    const key = root.shareUrl || `${root.driveId}:${root.itemId}`;
    if (!seenRoots.has(key)) {
      seenRoots.add(key);
      uniqueRoots.push(root);
    }
  }

    // Busca os metadados de cada pasta raiz em paralelo (resgatando shareUrl quando disponível)
  const results = await Promise.allSettled(
    uniqueRoots.map((root) => fetchRootFolder(root, token))
  );

  // Se todas as chamadas falharam com 401, retorna 401 para o frontend renovar a sessão
  const allUnauthorized =
    results.length > 0 &&
    results.every((r) => r.status === "rejected" && r.reason?.status === 401);

  if (allUnauthorized) {
    return res.status(401).json({ error: "Token expirado. Faça login novamente." });
  }

  const rawItems = results.map((result, index) => {
    if (result.status === "fulfilled") {
      const { driveId, data } = result.value;
      const originalName = (data.name || "").trim();
      const displayName = folderNames[originalName] || folderNames[data.name] || originalName || `Pasta ${index + 1}`;
      return {
        id: data.id,
        name: displayName,
        originalName: originalName || displayName,
        type: "folder",
        driveId,
        childCount: data.folder?.childCount ?? null,
        lastModified: data.lastModifiedDateTime || null,
        size: 0,
        downloadUrl: null,
      };
    } else {
      console.error(`Erro ao buscar pasta raiz ${index}:`, result.reason?.message);
      return {
        id: uniqueRoots[index].itemId,
        name: `Pasta ${index + 1} (inacessível)`,
        originalName: `Pasta ${index + 1}`,
        type: "folder",
        driveId: uniqueRoots[index].driveId,
        childCount: null,
        lastModified: null,
        size: 0,
        downloadUrl: null,
        error: true,
      };
    }
  });

  // Agrupa pastas acessíveis que possuem o mesmo nome normalizado
  const groupedMap = new Map();
  const inaccessibleItems = [];

  for (const item of rawItems) {
    if (item.error) {
      inaccessibleItems.push(item);
      continue;
    }

    const groupKey = normalizeGroupKey(item.name);

    if (!groupedMap.has(groupKey)) {
      groupedMap.set(groupKey, {
        ...item,
        sources: [
          {
            driveId: item.driveId,
            itemId: item.id,
            originalName: item.originalName,
            childCount: item.childCount,
          },
        ],
      });
    } else {
      const existing = groupedMap.get(groupKey);
      existing.sources.push({
        driveId: item.driveId,
        itemId: item.id,
        originalName: item.originalName,
        childCount: item.childCount,
      });

      // Soma a contagem de itens filhos das pastas agrupadas
      if (existing.childCount !== null || item.childCount !== null) {
        existing.childCount = (existing.childCount || 0) + (item.childCount || 0);
      }

      // Mantém a data de modificação mais recente
      if (
        item.lastModified &&
        (!existing.lastModified || new Date(item.lastModified) > new Date(existing.lastModified))
      ) {
        existing.lastModified = item.lastModified;
      }
    }
  }

  // Para grupos com mais de uma pasta raiz de origem, codifica os pares driveId:itemId
  // para que /api/children e /api/search possam consultar todas as origens do grupo
  const items = Array.from(groupedMap.values()).map((group) => {
    if (group.sources.length === 1) {
      return group;
    }

    const compositeTargets = group.sources
      .map((s) => `${s.driveId}:${s.itemId}`)
      .join(",");

    return {
      ...group,
      id: compositeTargets,
      driveId: "group",
      isGrouped: true,
      sourceCount: group.sources.length,
    };
  });

  // Ordena as pastas agrupadas alfabeticamente (pt-BR)
  items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  // Só anexa pastas inacessíveis caso nenhuma pasta tenha carregado com sucesso,
  // evitando poluir a home com cards de erro quando o usuário tem acesso parcial
  const finalItems = items.length > 0 ? items : inaccessibleItems;

  res.status(200).json({ items: finalItems });
}

function getCookie(req, name) {
  return (req.headers.cookie || "").split(";").reduce((acc, pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k?.trim() === name) acc = v.join("=").trim();
    return acc;
  }, null);
}

export function encodeSharingUrl(url){
  const base64 = Buffer.from(url.trim(), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `u!${base64}`;
}

export async function fetchRootFolder({ driveId, itemId, shareUrl }, token) {
  // 1. Se tiver shareUrl, usa /shares com redeemSharingLink
  if (shareUrl) {
    const shareToken = encodeSharingUrl(shareUrl);
    const res = await fetch(
      `${GRAPH_API}/shares/${shareToken}/driveItem?$select=id,name,folder,lastModifiedDateTime,parentReference`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: "redeemSharingLink",
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      return {
        driveId: driveId || data.parentReference?.driveId,
        data,
      };
    }
    // Se não tiver driveId/itemId de fallback, já lança o erro da Graph API
    if (!driveId || !itemId) {
      const e = await res.json().catch(() => ({}));
      const err = new Error(`${res.status}: ${e.error?.message || "Erro ao acessar shareUrl"}`);
      err.status = res.status;
      throw err;
    }
  }
  // 2. Fluxo por driveId + itemId (ou fallback caso o shareUrl tenha falhado)
  const res = await fetch(
    `${GRAPH_API}/drives/${driveId}/items/${itemId}?$select=id,name,folder,lastModifiedDateTime`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const err = new Error(`${res.status}: ${e.error?.message || "Erro na Graph API"}`);
    err.status = res.status;
    throw err;
  }
  return { driveId, data: await res.json() };
}