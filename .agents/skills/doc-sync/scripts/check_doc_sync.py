#!/usr/bin/env python3
"""Portão de verificação da skill doc-sync.

Uso:
    check_doc_sync.py --inventory
        Lista a documentação existente no repositório (rodar ANTES de codar).

    check_doc_sync.py [--base REF]
        Verifica se mudanças de código vieram acompanhadas de mudanças em
        documentação. Sai com código 1 se código mudou e a doc não.

    check_doc_sync.py --sem-impacto "motivo concreto"
        Aceita a ausência de alterações em doc, registrando a justificativa.

Somente biblioteca padrão. Requer git.
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

DOC_EXTS = {".md", ".mdx", ".rst", ".adoc", ".txt"}
DOC_NAMES = {
    "readme", "changelog", "changes", "history", "contributing", "security",
    "agents", "claude", "architecture", "license", "authors", "codeowners",
}
DOC_DIRS = {"docs", "doc", "documentation", "adr", "adrs", "runbooks", "wiki"}
DOC_SPECIAL = {
    ".env.example", ".env.sample", ".env.template", "openapi.yaml",
    "openapi.yml", "openapi.json", "swagger.yaml", "swagger.yml",
    "swagger.json", ".cursorrules",
}
CODE_EXTS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".kt", ".go",
    ".rs", ".rb", ".php", ".cs", ".swift", ".c", ".h", ".cpp", ".hpp", ".scala",
    ".sh", ".sql", ".vue", ".svelte", ".tf", ".proto", ".graphql", ".gql",
}
CONFIG_NAMES = {
    "package.json", "pyproject.toml", "setup.py", "setup.cfg", "go.mod",
    "cargo.toml", "pom.xml", "build.gradle", "dockerfile", "docker-compose.yml",
    "docker-compose.yaml", "compose.yml", "compose.yaml", "makefile",
}
IGNORE_DIRS = {".git", "node_modules", "vendor", "dist", "build", ".venv", "venv",
               "__pycache__", ".next", "target", ".idea", ".vscode"}
TEST_RE = re.compile(r"(^|/)(tests?|__tests__|spec)(/|$)|(_test|\.test|\.spec)\.[a-z]+$|(^|/)test_[^/]+$")


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def git_root():
    r = run(["git", "rev-parse", "--show-toplevel"])
    if r.returncode != 0:
        sys.exit("Erro: este diretório não é um repositório git.")
    return Path(r.stdout.strip())


def is_doc(path: str) -> bool:
    p = Path(path)
    low = path.lower()
    if p.name.lower() in DOC_SPECIAL:
        return True
    parts = {x.lower() for x in p.parts[:-1]}
    if p.suffix.lower() in DOC_EXTS:
        return True
    if parts & DOC_DIRS and p.suffix.lower() in DOC_EXTS | {".yaml", ".yml", ".json", ".png", ".svg", ".puml", ".mmd"}:
        return True
    return p.stem.lower() in DOC_NAMES and "/" not in low.strip("/") and p.suffix == ""


def classify(path: str) -> str:
    if is_doc(path):
        return "doc"
    if TEST_RE.search(path.lower()):
        return "test"
    p = Path(path)
    if p.suffix.lower() in CODE_EXTS:
        return "code"
    if p.name.lower() in CONFIG_NAMES or p.suffix.lower() in {".yaml", ".yml", ".toml", ".ini", ".json", ".env"}:
        return "config"
    return "other"


def changed_files(base):
    files = set()
    if base:
        r = run(["git", "diff", "--name-only", f"{base}...HEAD"])
        files.update(r.stdout.splitlines())
    for cmd in (["git", "diff", "--name-only"],
                ["git", "diff", "--name-only", "--cached"],
                ["git", "ls-files", "--others", "--exclude-standard"]):
        files.update(run(cmd).stdout.splitlines())
    return sorted(f for f in files if f and not (set(Path(f).parts) & IGNORE_DIRS))


def inventory(root):
    r = run(["git", "ls-files", "--cached", "--others", "--exclude-standard"])
    docs = sorted(f for f in r.stdout.splitlines()
                  if f and not (set(Path(f).parts) & IGNORE_DIRS) and is_doc(f))
    if not docs:
        print("Nenhum arquivo de documentação encontrado.")
        print("Registre isso no relatório final (ver SKILL.md, casos de borda).")
        return
    print(f"{len(docs)} arquivo(s) de documentação:\n")
    for d in docs:
        print(f"  {d}")
    print("\nLeia os que tratam da área que você vai alterar antes de começar.")


def candidate_docs(root, changed_code, all_docs):
    """Docs que citam o nome (sem extensão) ou caminho de arquivos alterados."""
    needles = set()
    for f in changed_code:
        needles.add(f)
        stem = Path(f).stem
        if len(stem) >= 4 and stem.lower() not in {"index", "main", "test", "utils", "init", "__init__"}:
            needles.add(stem)
    hits = {}
    for d in all_docs:
        try:
            text = (root / d).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        found = sorted(n for n in needles if n in text)
        if found:
            hits[d] = found[:4]
    return hits


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inventory", action="store_true", help="lista a documentação existente")
    ap.add_argument("--base", help="ref base (ex.: origin/main) para incluir commits da branch")
    ap.add_argument("--sem-impacto", metavar="MOTIVO", help="justificativa concreta de que não há impacto documental")
    args = ap.parse_args()

    root = git_root()
    os.chdir(root)

    if args.inventory:
        inventory(root)
        return 0

    files = changed_files(args.base)
    if not files:
        print("Nenhuma alteração detectada. Nada a verificar.")
        return 0

    groups = {"code": [], "config": [], "doc": [], "test": [], "other": []}
    for f in files:
        groups[classify(f)].append(f)

    print("Alterações detectadas:")
    for k, label in (("code", "código"), ("config", "configuração"), ("test", "testes"),
                     ("doc", "documentação"), ("other", "outros")):
        if groups[k]:
            print(f"  {label}: {len(groups[k])}")
            for f in groups[k]:
                print(f"    - {f}")

    impacting = groups["code"] + groups["config"]
    if not impacting:
        print("\nOK: só testes/doc/outros mudaram; sem exigência documental automática.")
        print("Ainda responda às perguntas de checagem rápida (references/mapa-de-impacto.md).")
        return 0

    r = run(["git", "ls-files", "--cached", "--others", "--exclude-standard"])
    all_docs = [f for f in r.stdout.splitlines()
                if f and not (set(Path(f).parts) & IGNORE_DIRS) and is_doc(f)]
    suggestions = candidate_docs(root, impacting, [d for d in all_docs if d not in groups["doc"]])

    if suggestions:
        print("\nDocumentos NÃO alterados que citam arquivos/símbolos modificados:")
        for d, ns in suggestions.items():
            print(f"  - {d}  (cita: {', '.join(ns)})")
        print("Avalie cada um: atualizar ou confirmar que continua correto.")

    if groups["doc"]:
        print("\nOK: a documentação foi alterada junto com o código.")
        if suggestions:
            print("Atenção: revise os documentos sugeridos acima antes de concluir.")
        return 0

    if args.sem_impacto:
        motivo = args.sem_impacto.strip()
        if len(motivo.split()) < 6:
            print("\nFALHA: a justificativa de --sem-impacto é curta demais para ser concreta.")
            print("Explique o que mudou, o que NÃO mudou externamente e como verificou (ex.: grep).")
            return 1
        print(f"\nOK (sem impacto declarado): {motivo}")
        print("Inclua esta justificativa na seção 'Documentação' do relatório final.")
        return 0

    print("\nFALHA: código/configuração mudaram e nenhuma documentação foi alterada.")
    print("Volte ao passo 3 do SKILL.md (busca de referências obsoletas) e atualize a doc afetada.")
    print('Se realmente não houver impacto: --sem-impacto "motivo concreto e verificável".')
    return 1


if __name__ == "__main__":
    sys.exit(main())