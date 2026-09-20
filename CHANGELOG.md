# Changelog

A versão que vale é a de `.claude-plugin/plugin.json`; as skills não carregam número próprio.

## 1.3.0 — 2026-09-19

- Servidor do vault: gravação em lote (`lote=true` em `salvar_nota` e `atualizar_nota`) e a
  ferramenta `sincronizar`, que fecha o lote num commit só; ferramenta `validar`, o linter do
  vault, com o mesmo vocabulário e parser da gravação; cache de leitura por arquivo.
- `validar_vault.py` vira casca de linha de comando do linter do servidor (`--vault`,
  `--projeto`, `--tipo`), sem cópia para dentro do vault.
- `/cpv`: varredura de segredos por script (`scripts/segredos.js`), sobre o que o `add -A`
  levaria, com exit 1 e trecho mascarado.
- `obsidian-docs` e `vault-migrador`: migração em lote, um `sincronizar` por projeto, `validar`
  ao fim.
- Hook: lê `CLAUDE_PLUGIN_OPTION_VAULT` antes dos settings; corrigido o escape `MOC/`.
- Autoteste do servidor (`teste_servidor_vault.py`), validador do repositório
  (`scripts/validar_repo.py`) e CI em Linux e Windows.

## 1.2.0 — 2026-09-18

- O plugin injeta as regras do vault por hook de `SessionStart` e `SubagentStart`, em vez de
  pedir edição do `CLAUDE.md`; o gate falha aberto.
- `hooks/hooks.json` carregado por convenção.

## 1.0.0 — 2026-09-17

- `/faz`, `/cpv` e a família `/obsidian-docs` publicadas como skills instaláveis e, em
  seguida, como marketplace e plugin do Claude Code.
- `/faz` roteia o segundo movimento por `/faz leva` e confere a confiança do workspace antes
  de imprimir a linha de `/goal`.
