# Configuração — Azure e Vercel

## Variáveis de Ambiente

Configuradas em dois lugares: `.env.local` (dev local) e Vercel Dashboard (produção).

| Variável | Descrição | Exemplo |
|---|---|---|
| `AZURE_CLIENT_ID` | Application (client) ID do App Registration | `a1b2c3d4-...` |
| `AZURE_CLIENT_SECRET` | Value do secret gerado em "Certificates & secrets" | `abc~def...` |
| `AZURE_TENANT_ID` | Directory (tenant) ID da organização | `52e57331-...` |
| `APP_BASE_URL` | URL base do site sem barra final | `https://dervideos.vercel.app` |

Para adicionar na Vercel: **Dashboard → Project → Settings → Environment Variables**
Após salvar, fazer **Redeploy** para as variáveis entrarem em vigor.

---

## App Registration no Azure (Entra ID)

**Nome do app:** DER-AEST-SharePoint-Graph
**Tenant:** der.mg.gov.br

### Configurações aplicadas

**Authentication:**
- Plataforma: Web
- Redirect URI: `https://dervideos.vercel.app/api/auth/callback`

**API Permissions (delegadas — todas com Admin Consent concedido):**

| Permissão | Tipo | Admin Consent necessário | Status |
|---|---|---|---|
| `User.Read` | Delegada | Não | ✅ Concedido |
| `Files.Read.All` | Delegada | Não | ✅ Concedido |
| `offline_access` | Delegada | Não | ✅ Concedido |
| `Files.Read.All` | Aplicativo | Sim | ✅ Concedido |
| `Sites.Read.All` | Aplicativo | Sim | ✅ Concedido |

**Importante:** As permissões de Aplicativo (`Files.Read.All` e `Sites.Read.All`)
existem de uma configuração anterior e não são usadas pelo fluxo atual (Authorization Code).
O fluxo ativo usa apenas as três permissões Delegadas.

### Adicionando nova Redirect URI

Se o projeto for migrado para outro domínio ou precisar de ambiente de homologação:
Azure Portal → App Registrations → DER-AEST-SharePoint-Graph → Authentication → Add URI

---

## vercel.json

```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "devCommand": "next dev"
}
```

Este arquivo é obrigatório para a Vercel detectar o framework corretamente.
Sem ele, o deploy falha com "No Output Directory named 'public' found".

---

## Limitações do Plano Hobby da Vercel

- Timeout de Serverless Functions: **10 segundos**
- As chamadas à Graph API costumam responder em 1-3s
- Pastas com muitos itens podem precisar de paginação (ver `children.js` → `nextLink`)
- Sem domínio customizado no plano gratuito (usar `.vercel.app`)
