# Ferramentas do vault ausentes — o que conferir em cada harness

O prefixo depende do harness: `mcp__vault-docs__*` (`npx skills add` no Claude Code, e Pi),
`mcp__plugin_macrex-skills_vault-docs__*` (plugin), e o prefixo próprio que Codex e Antigravity dão
ao servidor `vault-docs`.

- **Claude Code**: confira com `claude mcp list`. Skill vinda do plugin (está sob
  `~/.claude/plugins/cache/`): o plugin já declara o servidor; **não** rode `--instalar` (criaria um
  segundo `vault-docs`) — falta o reinício, ou a pasta do vault, que o cliente preenche em
  `/config`. Vinda do `npx skills add`: registre com
  `python <pasta da skill obsidian-docs>/scripts/servidor_vault.py --instalar --vault <pasta de projetos do vault>`.
  O reinício do Claude Code é do usuário (sessão aberta antes do registro não carrega o servidor).
- **Pi**: as ferramentas vêm da extensão `vault-docs` do pacote; não há MCP para registrar, e
  `claude mcp list` e `--instalar` não existem aqui. Faltam por `OBSIDIAN_VAULT` vazia ou pacote
  fora do `pi list`; diga qual.
- **Codex** e **Antigravity** (CLI `agy`; um `mcp_config.json` com BOM quebra o `agy mcp`):
  registre com
  `<codex|agy> mcp add vault-docs -- python <pasta da skill obsidian-docs>/scripts/servidor_vault.py --vault <pasta de projetos do vault>`
  (`python3` fora do Windows) e peça o reinício.
