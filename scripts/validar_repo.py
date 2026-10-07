#!/usr/bin/env python3
"""Confere o que cada harness espera deste repositorio antes de instala-lo.

  python scripts/validar_repo.py

Checa os manifestos (.claude-plugin/plugin.json e marketplace.json, hooks/hooks.json),
que todo caminho citado neles existe, e o frontmatter de cada skills/*/SKILL.md e
do agent: `name` igual ao nome da pasta, `description` presente e dentro do limite,
campos conhecidos. Depois o contrato por harness: cada arquivo de
skills/faz/references/harness/ tem as mesmas linhas, uma secao de instalacao no
README e o registro do MCP em skills/obsidian-docs/references/registrar-mcp.md — um
harness novo entra no teste ao ganhar o arquivo, e falha ate os outros dois o conhecerem. Por fim, que a
pasta de skill mexida subiu a `# Versao` do seu SKILL.md e o plugin mexido subiu a
patch ou a minor do plugin.json (checar_versoes). Sai com 1 se algo falhar — e o que a CI roda.
"""
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMPOS_SKILL = {"name", "description", "argument-hint", "disable-model-invocation",
                "allowed-tools", "user-invocable", "model", "context", "agent", "hooks", "when_to_use"}
CAMPOS_AGENT = {"name", "description", "tools", "model", "skills", "color", "permissionMode", "hooks"}
MAX_DESCRICAO = 1024
# Mexer so nisto nao muda o plugin instalado, e nao pede versao nova.
SO_DO_REPO = (".github/", "scripts/", "assets/", "README.md", "GLOSSARY.md", ".claude/", "LICENSE", ".gitignore", "tsconfig.json")
# As linhas que toda referencia de harness da /faz tem: e o que o /faz le de cada harness.
LINHAS_HARNESS = ("Skills do Matt", "Invocar uma skill", "Perguntar", "Sub-agente",
                  "Segurar a sessão")
falhas = []


def ler(rel):
    with open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def falha(msg):
    falhas.append(msg)


def carregar_json(rel):
    try:
        return json.loads(ler(rel))
    except (OSError, ValueError) as e:
        falha(f"{rel}: {e}")
        return None


def frontmatter(rel):
    texto = ler(rel)
    if not texto.startswith("---\n"):
        falha(f"{rel}: sem frontmatter")
        return None
    fim = texto.find("\n---", 4)
    if fim == -1:
        falha(f"{rel}: frontmatter sem fechamento")
        return None
    campos, chave = {}, None
    for linha in texto[4:fim].splitlines():
        if linha.startswith((" ", "\t")) and chave:
            campos[chave] += " " + linha.strip()
        elif ":" in linha:
            chave, _, v = linha.partition(":")
            chave = chave.strip()
            campos[chave] = v.strip()
    return campos


def checar_skill(pasta):
    rel = f"skills/{pasta}/SKILL.md"
    fm = frontmatter(rel)
    if fm is None:
        return
    if fm.get("name") != pasta:
        falha(f"{rel}: name '{fm.get('name')}' difere da pasta '{pasta}'")
    desc = fm.get("description", "").lstrip("> ").strip()
    if not desc:
        falha(f"{rel}: description ausente")
    elif len(desc) > MAX_DESCRICAO:
        falha(f"{rel}: description com {len(desc)} caracteres (limite {MAX_DESCRICAO})")
    for campo in fm:
        if campo not in CAMPOS_SKILL:
            falha(f"{rel}: campo desconhecido no frontmatter: {campo}")
    # referencias a arquivos da propria skill precisam existir
    corpo = ler(rel)
    for ref in set(re.findall(r"`((?:references|scripts|assets)/[\w./ -]+?)`", corpo)):
        if not os.path.exists(os.path.join(RAIZ, "skills", pasta, ref)):
            falha(f"{rel}: cita {ref}, que nao existe")
    # o Codex ignora disable-model-invocation: skill escondida leva o agents/openai.yaml
    if fm.get("disable-model-invocation") == "true":
        yaml = os.path.join(RAIZ, "skills", pasta, "agents", "openai.yaml")
        if not os.path.exists(yaml) or "allow_implicit_invocation: false" not in ler(f"skills/{pasta}/agents/openai.yaml"):
            falha(f"skills/{pasta}: disable-model-invocation sem agents/openai.yaml com allow_implicit_invocation: false")


def checar_harnesses():
    pasta = os.path.join(RAIZ, "skills", "faz", "references", "harness")
    # cada arquivo abre com `# <Harness>`: sem o `# `, a primeira linha e o titulo
    secoes = [ler(f"skills/faz/references/harness/{a}")[2:] for a in sorted(os.listdir(pasta)) if a.endswith(".md")]
    if len(secoes) < 2:
        falha("faz/references/harness/: menos de dois harnesses")
    readme = ler("README.md")
    registro = ler("skills/obsidian-docs/references/registrar-mcp.md")
    for secao in secoes:
        titulo, _, corpo = secao.partition("\n")
        nome = titulo.split(" (")[0].strip()
        for linha in LINHAS_HARNESS:
            if f"**{linha}:**" not in corpo:
                falha(f"faz/references/harness/: {nome} sem a linha {linha}")
        if not re.search(r"^### .*" + re.escape(nome), readme, re.M):
            falha(f"README.md: sem secao de instalacao para {nome}")
        if nome not in registro:
            falha(f"obsidian-docs/references/registrar-mcp.md: nao diz como registrar o MCP no {nome}")
        else:
            print(f"harness ok: {nome}")


def git(*args):
    r = subprocess.run(["git", *args], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
    return r.stdout if r.returncode == 0 else None


def versao(texto):
    m = re.search(r"^# Versao: (\S+)", texto or "", re.M)
    return m.group(1) if m else None


def checar_versoes(plugin):
    """Quem muda sobe a versao: a pasta de skill mexida, a `# Versao` do seu SKILL.md; o plugin
    mexido, a patch ou a minor do plugin.json (a major so com autorizacao do usuario), que a CI publica como
    release. A base e VERSAO_BASE (a CI passa o commit de antes do push ou a base do PR) ou, sem
    ela, o HEAD: confere o working tree."""
    base = os.environ.get("VERSAO_BASE") or "HEAD"
    if git("cat-file", "-e", base + "^{commit}") is None:
        print(f"versoes: base {base} fora do historico, checagem pulada")
        return
    mudados = ((git("diff", "--name-only", base) or "") + (git("ls-files", "--others", "--exclude-standard") or "")).splitlines()
    for pasta in sorted({c.split("/")[1] for c in mudados if c.startswith("skills/") and c.count("/") >= 2}):
        rel = f"skills/{pasta}/SKILL.md"
        antes = git("show", f"{base}:{rel}")
        if antes is not None and os.path.exists(os.path.join(RAIZ, rel)) and versao(antes) == versao(ler(rel)):
            falha(f"skills/{pasta}: mudou desde {base[:12]} sem subir a '# Versao: {versao(antes)}' do SKILL.md")
    rel = ".claude-plugin/plugin.json"
    try:
        antes = json.loads(git("show", f"{base}:{rel}") or "{}").get("version", "")
    except ValueError:
        antes = ""
    agora = str((plugin or {}).get("version", ""))
    if not all(re.fullmatch(r"\d+\.\d+\.\d+", v) for v in (antes, agora)):
        return
    M, m, p = map(int, antes.split("."))
    if antes == agora:
        if any(not c.startswith(SO_DO_REPO) for c in mudados):
            falha(f"{rel}: o plugin mudou desde {base[:12]} e segue na {antes}; suba para {M}.{m}.{p + 1} ou {M}.{m + 1}.0")
    elif agora not in (f"{M}.{m}.{p + 1}", f"{M}.{m + 1}.0", f"{M + 1}.0.0"):
        falha(f"{rel}: de {antes} para {agora}; a leva sobe a patch ({M}.{m}.{p + 1}) ou a minor ({M}.{m + 1}.0), e a major ({M + 1}.0.0) so com autorizacao do usuario")


def main():
    plugin = carregar_json(".claude-plugin/plugin.json")
    mercado = carregar_json(".claude-plugin/marketplace.json")
    hooks = carregar_json("hooks/hooks.json")

    if plugin:
        for campo in ("name", "version", "description"):
            if not plugin.get(campo):
                falha(f"plugin.json: falta {campo}")
        if not re.fullmatch(r"\d+\.\d+\.\d+", str(plugin.get("version", ""))):
            falha(f"plugin.json: version '{plugin.get('version')}' nao e semver")
        for rel in plugin.get("agents", []):
            if not os.path.exists(os.path.join(RAIZ, rel)):
                falha(f"plugin.json: agent {rel} nao existe")
                continue
            fm = frontmatter(rel) or {}
            for campo in ("name", "description"):
                if not fm.get(campo):
                    falha(f"{rel}: falta {campo}")
            for campo in fm:
                if campo not in CAMPOS_AGENT:
                    falha(f"{rel}: campo desconhecido no frontmatter: {campo}")
        for nome, srv in (plugin.get("mcpServers") or {}).items():
            for arg in srv.get("args", []):
                if "${CLAUDE_PLUGIN_ROOT}" in arg:
                    rel = arg.replace("${CLAUDE_PLUGIN_ROOT}/", "")
                    if not os.path.exists(os.path.join(RAIZ, rel)):
                        falha(f"plugin.json: mcpServers.{nome} aponta para {rel}, que nao existe")
    if mercado:
        if not mercado.get("plugins"):
            falha("marketplace.json: sem plugins")
        for p in mercado.get("plugins", []):
            if plugin and p.get("name") != plugin.get("name"):
                falha(f"marketplace.json: plugin '{p.get('name')}' difere de plugin.json '{plugin.get('name')}'")
            if p.get("source") != "." and not os.path.isdir(os.path.join(RAIZ, str(p.get("source")))):
                falha(f"marketplace.json: source '{p.get('source')}' nao existe")
    if hooks:
        for rel in hooks.get("modules", []):
            if not os.path.exists(os.path.join(RAIZ, "hooks", rel)):
                falha(f"hooks.json: modules aponta para {rel}, que nao existe")
        for evento, grupos in (hooks.get("hooks") or {}).items():
            for grupo in grupos:
                for h in grupo.get("hooks", []):
                    m = re.search(r"\$\{CLAUDE_PLUGIN_ROOT\}/([^\s\"]+)", h.get("command", ""))
                    if m and not os.path.exists(os.path.join(RAIZ, m.group(1))):
                        falha(f"hooks.json: {evento} chama {m.group(1)}, que nao existe")

    for pasta in sorted(os.listdir(os.path.join(RAIZ, "skills"))):
        if os.path.isfile(os.path.join(RAIZ, "skills", pasta, "SKILL.md")):
            checar_skill(pasta)
        else:
            falha(f"skills/{pasta}: sem SKILL.md")
    checar_harnesses()
    checar_versoes(plugin)

    if falhas:
        print("\n".join("FALHA " + f for f in falhas))
        sys.exit(1)
    print("repositorio ok: manifestos, caminhos, frontmatter das skills e contrato por harness")


if __name__ == "__main__":
    main()
