# Erros Conhecidos e Soluções

## AADSTS900971: No reply address provided

**Causa:** O `redirectUri` não está sendo enviado corretamente para a Microsoft,
ou está sendo construído dinamicamente de forma errada (ex: `req.headers.host` vazio).

**Solução:** Garantir que `APP_BASE_URL` está configurada nas variáveis de ambiente
da Vercel com o valor exato `https://dervideos.vercel.app` (sem barra no final).
O código em `login.js` e `callback.js` usa essa variável como base do `redirectUri`.

---

## AADSTS65004: User declined to consent to access the app

**Causa mais comum:** O Admin Consent não foi concedido corretamente para as
permissões delegadas, ou foi concedido apenas para as permissões de Aplicativo.

**Verificação:** No Azure Portal → App Registrations → API permissions,
cada permissão delegada deve ter status "Granted for der.mg.gov.br".

**Causa secundária (já resolvida):** O código estava solicitando o escopo
`Files.Read.All` mas a permissão concedida era apenas `Files.Read`.
Escopos solicitados e permissões concedidas devem ser idênticos.

---

## Unexpected token, is not valid JSON (erro de reprodução de vídeo)

**Causa:** O frontend estava fazendo `fetch()` na rota `/api/video-url` e
tentando ler a resposta como JSON. Como a rota faz redirect 302 para o arquivo
binário, o `fetch` recebia bytes de vídeo (ex: `ftypmp4`) e quebrava ao tentar
parsear como JSON.

**Solução aplicada (Gemini + usuário):** Remover o `fetch` do frontend.
Usar a rota `/api/video-url?driveId=...&itemId=...` diretamente como `src`
da tag `<video>`. O navegador gerencia o redirect nativamente.

```jsx
// ✅ Correto
<video src={`/api/video-url?driveId=${video.driveId}&itemId=${video.id}`} controls />

// ❌ Errado
const res = await fetch(`/api/video-url?...`);
const data = await res.json(); // quebra com conteúdo binário
```

---

## Build Failed: No Output Directory named "public" found

**Causa:** A Vercel não detectou o framework Next.js automaticamente e
tentou servir como site estático.

**Solução:** Garantir que `vercel.json` existe na raiz do projeto com:
```json
{ "framework": "nextjs", "outputDirectory": ".next" }
```
Também verificar nas configurações do projeto na Vercel se o Framework Preset
está como "Next.js" em Settings → General → Build & Development Settings.

---

## Apenas 1 item aparece no sharedWithMe

**Causa:** O endpoint `/me/drive/sharedWithMe` só retorna itens compartilhados
explicitamente com o usuário como pessoa. Pastas acessíveis via link de
compartilhamento, via membro de site SharePoint ou via grupo não aparecem.

**Solução:** Usar a Search API para localizar as pastas pelo nome e obter
`driveId` e `itemId`, depois configurar como `ROOT_FOLDERS` hardcoded em `shared.js`.
Ver `diagnostico.md` para o processo completo.

---

## Pastas não aparecem / apenas arquivos listados na raiz

**Causa:** A versão antiga de `shared.js` buscava os filhos de uma única pasta raiz.
Ao migrar para múltiplas raízes com array `ROOT_FOLDERS`, o código usava um `for`
que chamava `res.status(200).json()` dentro do loop — retornando apenas na
primeira iteração e ignorando as demais.

**Solução:** Usar `Promise.allSettled` para buscar todas em paralelo e retornar
um único array com os metadados de cada pasta raiz como card. Os filhos de cada
pasta são carregados sob demanda via `/api/children` quando o usuário clica.

---

## Token expirado durante navegação

**Sintoma:** Após ~1 hora, chamadas à Graph API retornam 401.
O frontend redireciona para a tela de login.

**Comportamento esperado:** `/api/auth/status` tenta renovar automaticamente
usando o `refresh_token` (válido por 30 dias). Se o refresh também expirar,
o usuário precisa fazer login novamente.

**Se o refresh não estiver funcionando:** Verificar se o escopo `offline_access`
está sendo solicitado em `lib/msalConfig.js` e se a permissão está concedida no Azure.

---

## Erro 403: Sem permissão para acessar esta pasta

**Causa:** O usuário logado não tem acesso à pasta no OneDrive/SharePoint.
O token delegado só permite acessar o que aquele usuário específico tem permissão.

**Solução:** Verificar se a pasta foi compartilhada com o usuário que está tentando acessar,
ou se o usuário faz parte do grupo/site que tem acesso.

---

## @microsoft.graph.downloadUrl não disponível

**Causa:** Alguns tipos de arquivo ou configurações de tenant podem bloquear
a geração de URLs de download direto.

**Verificação:** Acessar `/api/debug-shared` ou `/api/debug-search` logado
e verificar se `@microsoft.graph.downloadUrl` aparece nos itens de vídeo.

Se não aparecer, pode ser necessário usar o endpoint `/content` da Graph API
com redirect, mas isso requer configuração adicional de CORS no Azure.
