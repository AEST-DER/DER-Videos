/**
 * pages/api/shared.js
 *
 * Retorna a lista de pastas raiz configuradas.
 * Cada entrada vira um card na tela inicial — ao clicar,
 * o frontend navega para dentro via /api/children normalmente.
 */

const GRAPH_API = "https://graph.microsoft.com/v1.0";

// Cada objeto representa uma pasta raiz de um drive diferente.
// Para adicionar mais: inclua um novo objeto com driveId e itemId.
const ROOT_FOLDERS = [
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
];

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const token = getCookie(req, "access_token");
  if (!token) return res.status(401).json({ error: "Não autenticado." });

  // Busca os metadados de cada pasta raiz em paralelo
  const results = await Promise.allSettled(
    ROOT_FOLDERS.map(({ driveId, itemId }) =>
      fetch(`${GRAPH_API}/drives/${driveId}/items/${itemId}?$select=id,name,folder,lastModifiedDateTime`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (r) => {
        if (!r.ok) {
          const e = await r.json();
          throw new Error(`${r.status}: ${e.error?.message || "Erro na Graph API"}`);
        }
        return { driveId, data: await r.json() };
      })
    )
  );

  const items = results.map((result, index) => {
    if (result.status === "fulfilled") {
      const { driveId, data } = result.value;
      return {
        id: data.id,
        name: data.name === "VÍDEOS RTA" ? "LOTE 1" : data.name || `Pasta ${index + 1}`,
        type: "folder",
        driveId,
        childCount: data.folder?.childCount ?? null,
        lastModified: data.lastModifiedDateTime || null,
        size: 0,
        downloadUrl: null,
      };
    } else {
      // Pasta inacessível — mostra com erro em vez de quebrar tudo
      console.error(`Erro ao buscar pasta raiz ${index}:`, result.reason?.message);
      return {
        id: ROOT_FOLDERS[index].itemId,
        name: `Pasta ${index + 1} (inacessível)`,
        type: "folder",
        driveId: ROOT_FOLDERS[index].driveId,
        childCount: null,
        lastModified: null,
        size: 0,
        downloadUrl: null,
        error: true,
      };
    }
  });

  res.status(200).json({ items });
}

function getCookie(req, name) {
  return (req.headers.cookie || "").split(";").reduce((acc, pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k?.trim() === name) acc = v.join("=").trim();
    return acc;
  }, null);
}
