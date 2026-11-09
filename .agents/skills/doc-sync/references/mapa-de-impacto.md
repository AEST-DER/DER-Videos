# Mapa de impacto: tipo de mudança → documentação a revisar

Use esta tabela como ponto de partida para o passo 2 do fluxo. Ela não é exaustiva: se a mudança afeta algo que uma pessoa leria para usar ou entender o sistema, procure o documento correspondente.

## Sumário
- [Tabela geral](#tabela-geral)
- [Perguntas de checagem rápida](#perguntas-de-checagem-rápida)
- [Onde procurar por ecossistema](#onde-procurar-por-ecossistema)

## Tabela geral

| O que mudou | Documentos prováveis a revisar |
|---|---|
| Endpoint, rota, payload, código de erro, autenticação | OpenAPI/Swagger, `docs/api*`, README, coleções Postman/Bruno, exemplos de cliente |
| Variável de ambiente, flag, arquivo de configuração, valor padrão | `.env.example`, README (configuração), `docs/config*`, Helm values / compose comentados |
| Comando de CLI, argumento, saída | `--help` embutido, README (uso), man pages, `docs/cli*` |
| Schema de banco, migração, formato de dados | `docs/dados*`, diagramas ER, README de migrações, runbooks de rollback |
| Dependência, versão mínima de runtime, requisito de sistema | README (pré-requisitos), `CONTRIBUTING`, Dockerfile/compose comentados, `docs/setup*` |
| Passos de build, teste, lint, deploy, CI | README, `CONTRIBUTING`, `AGENTS.md`/`CLAUDE.md`, `docs/deploy*`, runbooks |
| Estrutura de diretórios, módulos movidos ou renomeados | README (estrutura), `docs/arquitetura*`, `AGENTS.md`/`CLAUDE.md`, ADRs |
| Decisão arquitetural, troca de biblioteca ou padrão | ADRs (novo ADR que supera o antigo), `docs/arquitetura*` |
| API pública de biblioteca (assinatura, comportamento) | Docstrings/JSDoc, guia de uso, exemplos, `docs/reference*`, guia de migração |
| Mudança que quebra compatibilidade | CHANGELOG (marcado como breaking), guia de migração, README |
| Correção de bug com comportamento documentado errado | O trecho que descrevia o comportamento incorreto; CHANGELOG |
| Feature visível ao usuário | README, guia do usuário, CHANGELOG, capturas de tela/GIFs se existirem |
| Observabilidade: logs, métricas, alertas | Runbooks, `docs/observabilidade*`, dashboards documentados |
| Segurança: permissões, segredos, políticas | `SECURITY.md`, `docs/seguranca*`, runbooks |
| Instruções para agentes (convenções, comandos) | `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, instruções do copilot |

## Perguntas de checagem rápida

Antes de declarar "sem impacto", responda a todas:

1. Alguém que seguir o README do zero ainda chega a um sistema funcionando?
2. Algum exemplo de código ou comando na doc ainda roda como está escrito?
3. Algum nome citado na doc (função, flag, rota, variável, arquivo) foi renomeado ou removido?
4. Algum valor padrão, limite, formato ou mensagem de erro citado na doc mudou?
5. Alguma afirmação "o sistema faz X" na doc deixou de ser verdadeira?
6. Alguma decisão registrada (ADR, seção de arquitetura) foi contrariada ou superada?
7. O CHANGELOG, se existir, precisa de uma entrada?

Uma resposta "sim" a qualquer pergunta significa que há impacto documental.

## Onde procurar por ecossistema

- **Node/TS:** `README`, `docs/`, `package.json` (scripts e campos que a doc cita), JSDoc/TSDoc, Storybook, `openapi.*`.
- **Python:** `README`, `docs/` (Sphinx/MkDocs), docstrings, `pyproject.toml`, `requirements*.txt` comentados, notebooks de exemplo.
- **Java/Kotlin:** `README`, `docs/`, Javadoc/KDoc, `application*.yml` comentados, Swagger/OpenAPI.
- **Go:** `README`, `doc.go`, comentários de pacote, exemplos `Example*` em testes (também são verificados pelo `go test`).
- **Infra:** `README` de módulos Terraform (variáveis e outputs), Helm `values.yaml` comentado, runbooks.
- **Monorepos:** documentação por pacote além da raiz; revise ambos os níveis.