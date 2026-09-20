#!/usr/bin/env python3
"""Confere o que o Claude Code espera deste repositorio antes de instala-lo.

  python scripts/validar_repo.py

Checa os manifestos (.claude-plugin/plugin.json e marketplace.json, hooks/hooks.json),
que todo caminho citado neles existe, e o frontmatter de cada skills/*/SKILL.md e
do agent: `name` igual ao nome da pasta, `description` presente e dentro do limite,
campos conhecidos. Sai com 1 se algo falhar — e o que a CI roda.
"""
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMPOS_SKILL = {"name", "description", "argument-hint", "disable-model-invocation",
                "allowed-tools", "user-invocable", "model", "context", "agent", "hooks", "when_to_use"}
CAMPOS_AGENT = {"name", "description", "tools", "model", "skills", "color", "permissionMode", "hooks"}
MAX_DESCRICAO = 1024
falhas = []


def falha(msg):
    falhas.append(msg)


def carregar_json(rel):
    try:
        with open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        falha(f"{rel}: {e}")
        return None


def frontmatter(rel):
    with open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        texto = f.read()
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
    with open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        corpo = f.read()
    for ref in set(re.findall(r"`((?:references|scripts|assets)/[\w./ -]+?)`", corpo)):
        if not os.path.exists(os.path.join(RAIZ, "skills", pasta, ref)):
            falha(f"{rel}: cita {ref}, que nao existe")


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

    for rel in (plugin or {}).get("agents", []):
        if os.path.exists(os.path.join(RAIZ, rel)):
            fm = frontmatter(rel) or {}
            for campo in ("name", "description"):
                if not fm.get(campo):
                    falha(f"{rel}: falta {campo}")
            for campo in fm:
                if campo not in CAMPOS_AGENT:
                    falha(f"{rel}: campo desconhecido no frontmatter: {campo}")

    if falhas:
        print("\n".join("FALHA " + f for f in falhas))
        sys.exit(1)
    print("repositorio ok: manifestos, caminhos e frontmatter das skills")


if __name__ == "__main__":
    main()
