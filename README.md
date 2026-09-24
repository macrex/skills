# skills

Skills para agentes de IA:\
`/faz` leva um pedido até código verificado,\
`/obsidian-docs` guarda a documentação num vault Obsidian fora do repositório, e\
`/cpv` fecha a leva com commit, push e a nota no vault. Funcionam no Claude Code, no Pi, no Codex e no Antigravity.

## Usar

| Comando | O que faz |
|---|---|
| `/faz <pedido>` | Interroga, grava o entendimento e entrega a linha que roda a leva numa sessão nova: spec, tickets, implementação, revisão em dois eixos e teste de qualidade |
| `/obsidian-docs` | Registra spec, plano, ADR, bug, evolução ou análise no vault, com hub por projeto; `migrar` e `migrar tudo` copiam a documentação que já existe no repositório. Também dispara sozinha quando um documento nasce |
| `/cpv` | Commita no estilo do repositório, empurra e registra a evolução no vault; `/cpv sem-vault` fecha só o git |

`/faz` e `/cpv` só rodam quando você digita. `/faz` precisa das skills do
[Matt Pocock](https://github.com/mattpocock/skills) e de um `/goal`: nativo no Claude Code e no
Codex, extensão no Pi; no Antigravity, responda `continue` se a sessão parar antes do fim. No Codex
as skills atendem por `$macrex-skills:faz`, `$macrex-skills:obsidian-docs` e `$macrex-skills:cpv`.

## Instalar

Requisitos: Python 3.9+ e Node. Troque `~/obsidian/projetos` pela pasta de projetos do seu vault;
sem Obsidian, pule o que fala de vault.

### Claude Code

```
/plugin marketplace add macrex/skills
/plugin install macrex-skills@macrex
/plugin install mattpocock-skills
```

Informe a pasta do vault ao habilitar e ligue o auto-update em `/plugin`, aba Marketplaces,
`macrex`. No Windows o plugin chama `python3`; se só tem `python`, ponha um `python3` no PATH. Se
já tinha as skills em `~/.claude/skills`, remova-as, ou elas ganham do plugin.

### Pi

```bash
pi install https://github.com/macrex/skills
pi install https://github.com/mattpocock/skills
pi install npm:@narumitw/pi-goal
export OBSIDIAN_VAULT=~/obsidian/projetos      # Windows: setx OBSIDIAN_VAULT D:\obsidian\projetos
```

Em `~/.pi/agent/settings.json`, troque a entrada do Matt por
`{ "source": "https://github.com/mattpocock/skills", "skills": ["skills/engineering/**", "skills/productivity/**"] }`
para ficar só com as skills que o plugin do Claude Code instala. Para levas de vários tickets, suba
`continuationLimits.automaticTurns` em `~/.pi/agent/pi-goal.json`. `pi install npm:pi-subagents`
habilita o modo sub-agents.

### Codex

```bash
git clone https://github.com/macrex/skills ~/.codex/skills/macrex
git clone https://github.com/mattpocock/skills ~/.codex/skills/mattpocock
codex mcp add vault-docs -- python ~/.codex/skills/macrex/skills/obsidian-docs/scripts/servidor_vault.py --vault ~/obsidian/projetos
```

Regras do vault no `AGENTS.md`: passo 3 de "Outros agentes". Para atualizar, `git pull` nas duas
pastas.

### Antigravity (CLI `agy`)

```bash
git clone https://github.com/macrex/skills ~/.gemini/antigravity-cli/macrex
git clone https://github.com/mattpocock/skills ~/.gemini/antigravity-cli/mattpocock
cp -r ~/.gemini/antigravity-cli/macrex/skills/* ~/.gemini/antigravity-cli/mattpocock/skills/*/*/ ~/.gemini/antigravity-cli/skills/
agy mcp add vault-docs -- python ~/.gemini/antigravity-cli/skills/obsidian-docs/scripts/servidor_vault.py --vault ~/obsidian/projetos
```

O CLI só lê skill que está direto em `~/.gemini/antigravity-cli/skills/`, daí a cópia. Regras do
vault no `AGENTS.md`: passo 3 de "Outros agentes". Para atualizar, `git pull` nos dois clones e
repita o `cp`.

### Outros agentes (Cursor, Gemini CLI, Copilot, OpenCode, Windsurf...)

1. Skills: `npx skills@latest add macrex/skills -g -a cursor` (ou `gemini-cli`, `github-copilot`,
   `opencode`, `windsurf`, `'*'`). Se também usa o plugin no Claude Code, clone na pasta de skills
   do agente, como no Codex: o `npx` grava em `~/.agents/skills`, que o Claude Code também lê, e
   cada skill aparece duas vezes.
2. MCP `vault-docs`, no config de MCP do agente, como servidor stdio:
   `python <pasta da skill obsidian-docs>/scripts/servidor_vault.py --vault ~/obsidian/projetos`.
3. Regras do vault, no `AGENTS.md` ou `CLAUDE.md`:

   ```bash
   curl -fsSLo vault-rules.js https://raw.githubusercontent.com/macrex/skills/main/hooks/vault-rules.js
   node vault-rules.js SessionStart >> AGENTS.md && rm vault-rules.js
   ```

## Créditos e licença

O fluxo que a `/faz` encadeia é do [Matt Pocock](https://github.com/mattpocock/skills) (MIT); este
repositório não redistribui código dele. Licença MIT, veja [LICENSE](LICENSE).
