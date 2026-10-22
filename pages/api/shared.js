/**
 * pages/api/shared.js
 *
 * Retorna o conteúdo da pasta raiz "VÍDEOS RTA" diretamente.
 * driveId e itemId são fixos — identificados via diagnóstico.
 */

const GRAPH_API    = "https://graph.microsoft.com/v1.0";
const ROOT_DRIVE_ID = ["b!whoE7FWYLUaYEImzCfTbC3Jdb0ZlNedDrl9AUW8vEtvo5yHX02WrQKkIpzT9z8IZ", "b!wdSLol8Ty0-xSVCsjiX7pD9HNZgqlGVLvXtWan8vYJUt53I6xz_oSIEmiH_J07cM", "b!y6Mzv180OU6r0xjapSH3P9PBm-q8ShVCv-o-5bUJm5C_oS3WePVcTpnr0iBw4Sr1"];
const ROOT_ITEM_ID  = ["01QSAFR6WCGH5GRB2XPBCIEBB3WWDRUCSH", "01UIZVXMR7A4PNUNZW5ZDL5Y4YFXDWPLVT", "01VMDDKAWY6S67LYPQ4FE3CZCUEDJRRL5R"];

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const token = getCookie(req, "access_token");
  if (!token) return res.status(401).json({ error: "Não autenticado." });

  for (let i = 0; i < ROOT_DRIVE_ID.length; i++) {
    const driveId = ROOT_DRIVE_ID[i];
    const itemId = ROOT_ITEM_ID[i];
    try {
      const url =
        `${GRAPH_API}/drives/${driveId}/items/${itemId}/children` +
        `?$select=id,name,folder,video,file,size,lastModifiedDateTime,@microsoft.graph.downloadUrl` +
        `&$top=200`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) return res.status(401).json({ error: "Token expirado." });
      return res.status(response.status).json({ error: error.error?.message || "Erro na Graph API" });
    }

    const data = await response.json();
    const items = (data.value || []).map(i => normalizeItem(i, driveId));
    items.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    res.status(200).json({ items });
  } catch (err) {
    console.error("Erro em /api/shared:", err);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}
}

function normalizeItem(item, driveId) {
  const isFolder = !!item.folder;
  const isVideo  = !!item.video || isVideoFile(item.name || "");
  return {
    id: item.id,
    name: item.name || "Sem nome",
    type: isFolder ? "folder" : isVideo ? "video" : "file",
    driveId,
    size: item.size || 0,
    lastModified: item.lastModifiedDateTime || null,
    downloadUrl: item["@microsoft.graph.downloadUrl"] || null,
    childCount: item.folder?.childCount ?? null,
  };
}

function isVideoFile(name) {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  return [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv"].includes(ext);
}

function getCookie(req, name) {
  return (req.headers.cookie || "").split(";").reduce((acc, pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k?.trim() === name) acc = v.join("=").trim();
    return acc;
  }, null);
}