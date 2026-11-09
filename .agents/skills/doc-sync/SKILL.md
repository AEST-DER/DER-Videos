---
name: doc-sync
description: Obriga o agente que implementa uma mudança (feature, bugfix, refactor, migração, mudança de API, config ou infraestrutura) a atualizar a documentação já existente no repositório antes de dar a tarefa por concluída. Use SEMPRE que for alterar código, configuração, schema, endpoints, variáveis de ambiente, CLI, dependências ou comportamento observável de um projeto, mesmo que o usuário não mencione documentação, README, changelog, ADR ou docs. Também use ao revisar PRs, fechar tarefas agênticas ou quando o usuário pedir "implemente", "corrija", "adicione", "refatore" ou "migre" em um repositório que tenha qualquer arquivo de documentação.
---

# doc-sync: documentação faz parte da mudança

Código e documentação que o descreve são um único artefato. Quando a mudança entra e a doc fica para trás, o próximo agente (ou pessoa) lê uma descrição falsa do sistema e toma decisões erradas com confiança. Como agentes costumam trabalhar a partir da documentação existente, doc desatualizada é um dos defeitos que mais se propagam. Por isso, nesta skill, **a tarefa só está concluída quando a documentação afetada foi atualizada na mesma mudança**.

O escopo é a documentação **existente**. Não crie documentação nova só para cumprir tabela. Crie um arquivo novo apenas se a mudança introduzir algo sem nenhum lugar natural para ser documentado, e então prefira estender o documento mais próximo.

## Fluxo obrigatório

### 1. Antes de codar: mapear a documentação

Antes da primeira edição, descubra o que existe. Isso evita que a doc seja um "depois eu vejo" esquecido.

```bash
python <caminho-da-skill>/scripts/check_doc_sync.py --inventory
```

O comando lista arquivos de documentação do repositório (README, `docs/`, ADRs, CHANGELOG, `AGENTS.md`/`CLAUDE.md`, OpenAPI/Swagger, `.env.example`, runbooks etc.). Se o script não puder rodar, faça o mesmo com `git ls-files` e `grep`. Leia os documentos que tratam da área que você vai tocar, pois eles também revelam convenções que a mudança precisa respeitar.

### 2. Durante: manter o "registro de impacto"

À medida que implementa, anote mentalmente (ou em um rascunho) cada alteração com efeito externo: assinatura pública, comportamento, flag, variável de ambiente, comando, schema, dependência, erro retornado, caminho de arquivo. Cada item é uma pergunta: "qual documento diz algo sobre isso?". Consulte `references/mapa-de-impacto.md` para o mapeamento tipo de mudança → tipo de documento.

### 3. Antes de declarar concluído: busca de referências obsoletas

Para cada nome que mudou ou foi removido (função, flag, rota, variável, arquivo, comando), procure no repositório inteiro, **incluindo arquivos que não são .md**:

```bash
grep -rn "nome_antigo" --include="*.md" --include="*.mdx" --include="*.rst" --include="*.txt" --include="*.yaml" --include="*.yml" --include="*.json" --include="*.example" .
```

Todo resultado em documentação é uma de duas coisas: uma referência que precisa ser atualizada, ou uma menção que continua correta. Decida explicitamente, não por omissão.

### 4. Atualizar a documentação

Regras para editar:

- **Edite o que existe.** Altere o trecho afetado, não acrescente um parágrafo "Atualização" no fim nem deixe a versão antiga ao lado da nova.
- **Verifique contra o código.** Cada afirmação nova na doc precisa ser confirmada no código ou executada (comando de exemplo, valor padrão, nome de parâmetro). Doc escrita de memória reintroduz o problema que a skill quer evitar.
- **Respeite o estilo local.** Idioma, tom, nível de detalhe, formato de exemplos e de ADR do projeto prevalecem sobre suas preferências.
- **Atualize exemplos e trechos de código.** Exemplos desatualizados são copiados literalmente por quem lê; são o dano mais caro.
- **Registre decisões.** Se a mudança contraria ou substitui uma decisão documentada (ADR, seção de arquitetura), atualize o documento e registre o porquê. Em projetos com ADRs imutáveis, crie um ADR novo que substitui o anterior e marque o antigo como superseded, em vez de reescrevê-lo.
- **CHANGELOG.** Se o projeto mantém um, adicione a entrada no formato e na seção corretos (ex.: "Unreleased"). Mudanças que quebram compatibilidade precisam ser marcadas como tal.
- **Docs que você encontrou erradas no caminho.** Se estiverem na área que você tocou, corrija. Se estiverem longe do escopo, não expanda a mudança: liste no relatório final como pendência.

### 5. Portão de verificação (obrigatório)

Rode o verificador depois de implementar e documentar:

```bash
python <caminho-da-skill>/scripts/check_doc_sync.py
```

Ele compara o que mudou (staged, não staged e não rastreado) e verifica se a documentação foi tocada. Também sugere documentos que citam arquivos ou símbolos alterados. Interprete o resultado assim:

- **Saiu com sucesso e a doc foi alterada:** confira se os documentos sugeridos foram realmente avaliados.
- **Falhou (código mudou, doc não):** volte ao passo 3. Só avance se a mudança realmente não tiver impacto documental, o que se declara com `--sem-impacto "motivo concreto"`.

Um "sem impacto" legítimo é específico: *"refactor interno de `parser.py`; nenhuma assinatura pública, comportamento ou configuração mudou; nenhum doc referencia o módulo (grep feito)"*. Motivos vagos como "mudança pequena" ou "não precisa" não passam, porque mudanças pequenas são justamente as que acumulam divergência silenciosa.

### 6. Relatório final

Encerre a resposta com esta seção, sempre, mesmo quando nada precisou mudar:

```markdown
## Documentação
**Atualizada:**
- `README.md` — seção "Configuração": nova variável `CACHE_TTL`
- `docs/api.md` — endpoint `POST /orders`: novo campo `currency`
**Avaliada, sem alteração necessária:**
- `docs/arquitetura.md` — não menciona o módulo alterado (grep feito)
**Pendências fora do escopo:**
- `docs/deploy.md` ainda cita `docker-compose v1`; não relacionado a esta mudança
```

Se ainda não rodou o verificador, ou ele falhou e você não resolveu, a tarefa **não está concluída**: diga isso, em vez de apresentar o trabalho como finalizado.

## Casos de borda

- **Repositório sem documentação alguma.** Registre isso no relatório e, se a mudança for pública ou sensível (API, configuração, migração), proponha ao usuário um README mínimo em vez de criá-lo sozinho.
- **Documentação gerada automaticamente** (OpenAPI gerado, typedoc, sphinx-apidoc). Não edite a saída gerada à mão; regenere com o comando do projeto, ou atualize a fonte (docstrings, anotações) da qual ela deriva.
- **Mudança apenas em testes.** Em geral não exige doc, a menos que altere a forma de rodar os testes ou as convenções de teste documentadas.
- **Várias tarefas em paralelo ou subagentes.** O agente que implementa é dono da documentação da sua parte; não delegue a "atualização de docs" para depois nem assuma que outro agente fará. Se vários agentes tocarem o mesmo documento, reconcilie ao final.
- **Conflito entre doc e código.** O código é a fonte da verdade sobre o que o sistema faz hoje; se a doc diverge e a divergência não faz parte da sua mudança, corrija a doc ou sinalize, mas não altere o código só para casar com a doc sem confirmar com o usuário.
- **Usuário pede explicitamente para não mexer em docs.** Respeite, mas mencione no relatório quais documentos ficaram desatualizados por causa da mudança, para que a dívida fique visível.