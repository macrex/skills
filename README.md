# skills

Três skills de agente de IA com uma ideia só: **o trabalho termina quando está registrado**,
não quando o código compila. A `/faz` leva um pedido até código verificado, a `/obsidian-docs`
guarda o porquê num vault Obsidian fora do repositório, e a `/cpv` fecha a leva no git e na
documentação ao mesmo tempo. Vêm junto o servidor MCP `vault-docs` (Python 3.9+, sem
dependências) e o agent `vault-migrador`.

## As skills

| Skill | Faz | Dispara |
|---|---|---|
| [`faz`](skills/faz/) | Encadeia o SDD/TDD do [Matt Pocock](https://github.com/mattpocock/skills): interrogatório, spec, tickets, implementação (inline, sub-agents ou workflow), revisão em dois eixos, correções e teste de qualidade. Grava o entendimento num documento e entrega a linha de `/goal` que roda o resto numa sessão nova | `/faz <pedido>` |
| [`obsidian-docs`](skills/obsidian-docs/) | Documentação nasce no vault Obsidian, nunca no repositório: spec, plano, ADR, bug, evolução, análise, com hub por projeto e índice automático. Migra a documentação existente (`migrar`, `migrar tudo`). Traz o servidor MCP `vault-docs` | `/obsidian-docs`, ou sozinha quando um documento nasce |
| [`cpv`](skills/cpv/) | Fecha a leva: descobre os repositórios que a sessão tocou, varre segredos, commita no estilo de cada um, empurra e registra a evolução no vault | `/cpv`, `/cpv sem-vault` |

- `faz` e `cpv` são user-invoked (`disable-model-invocation: true`): só rodam quando você digita.
  O `/cpv` é a única autorização de commit; nenhum agente o invoca. No Antigravity, que não
  documenta esse campo, as duas aparecem na lista do agente.
- `faz` precisa das skills do Matt Pocock e de um loop `/goal` que segure a sessão até a leva
  fechar: nativo no Claude Code e no Codex, extensão no Pi, inexistente no Antigravity (lá você
  reenvia `continue` quando a sessão parar). O que muda de um harness para outro está em
  [`skills/faz/references/harness.md`](skills/faz/references/harness.md).
- `obsidian-docs` e a nota do `cpv` precisam do MCP `vault-docs`; sem ele, `cpv` fecha só o git.

## Instalar

Escolha **uma** rota. Requisitos: Python 3.9+ (servidor MCP) e Node (hook, extensão e scripts do `/cpv`).

### Claude Code (plugin, recomendado)

```
/plugin marketplace add macrex/skills
/plugin install macrex-skills@macrex
```

Ao habilitar, informe a **pasta de projetos do vault** (ex.: `~/obsidian/projetos`); o MCP, o agent
e as regras do vault (hook de `SessionStart`/`SubagentStart`) entram sozinhos. Sem Obsidian,
deixe em branco. As skills atendem por `/faz`, `/obsidian-docs`, `/cpv` e por `/macrex-skills:faz`.

- **Windows:** o plugin chama `python3`. Se o seu launcher é só `python`, ponha um `python3` no
  PATH ou registre o MCP pela rota CLI abaixo.
- **Auto-update nasce desligado:** `/plugin`, aba **Marketplaces**, `macrex`, **Enable auto-update**.
  Ele só baixa uma versão nova quando a `version` do `.claude-plugin/plugin.json` sobe: mudança
  publicada sem esse bump não chega a quem usa o plugin.
- **Tinha a rota CLI antes?** Remova-a, ou `~/.claude/skills/faz` continua ganhando do plugin no `/faz`:

  ```bash
  rm -rf ~/.claude/skills/{faz,cpv,obsidian-docs} ~/.claude/agents/vault-migrador.md
  claude mcp remove vault-docs
  ```

### Pi (`pi install`)

```bash
pi install https://github.com/macrex/skills
export OBSIDIAN_VAULT=~/obsidian/projetos       # Windows: setx OBSIDIAN_VAULT D:\obsidian\projetos
```

Chegam as três skills e a extensão `vault-docs`, que sobe o mesmo servidor Python e injeta as
regras do vault no system prompt. Sem a variável a extensão fica calada. Node 22.19+, `python3`
ou `python` no PATH. O agent `vault-migrador` não vem (o Pi não tem sub-agentes nativos): `migrar tudo`
roda inline. Não instale também por `npx skills add -a pi`, ou as skills ficam duplicadas.

Para o `/faz`, as skills do Matt e um `/goal`:

```bash
pi install https://github.com/mattpocock/skills
pi install npm:@narumitw/pi-goal        # /goal <objetivo>, que segura a sessão até a leva fechar
pi install npm:pi-subagents             # opcional: modo sub-agents e a revisão em dois eixos
```

O repositório do Matt traz também `in-progress/` e `misc/`, que o plugin do Claude Code não
instala; em `~/.pi/agent/settings.json` troque a entrada dele por esta, que deixa as mesmas 25:

```json
{ "source": "https://github.com/mattpocock/skills", "skills": ["skills/engineering/**", "skills/productivity/**"] }
```

O `/goal` do `@narumitw/pi-goal` pausa depois de 25 respostas (`continuationLimits.automaticTurns` em
`~/.pi/agent/pi-goal.json`); uma leva de vários tickets passa disso — suba o valor.

### Codex (`npx skills add`)

```bash
npx skills@latest add macrex/skills -g -a codex        # ~/.agents/skills, com link em ~/.codex/skills
npx skills@latest add mattpocock/skills -g -a codex    # para o /faz
codex mcp add vault-docs -- python ~/.agents/skills/obsidian-docs/scripts/servidor_vault.py --vault ~/obsidian/projetos
```

As regras do vault vão no `AGENTS.md` (passo 3 de "Outros agentes"). O `/goal` é nativo;
sub-agentes pedem `[features] multi_agent = true` no `~/.codex/config.toml`. `faz` e `cpv` ficam
fora da lista do agente pelo `agents/openai.yaml` de cada uma; `$faz` e `$cpv` as invocam.

### Antigravity (CLI `agy` e IDE)

```bash
npx skills@latest add macrex/skills -g -a antigravity      # ~/.agents/skills, que o IDE lê
npx skills@latest add mattpocock/skills -g -a antigravity  # para o /faz
ln -s ~/.agents/skills/* ~/.gemini/antigravity-cli/skills/  # o CLI só lê esta pasta
agy mcp add vault-docs -- python ~/.agents/skills/obsidian-docs/scripts/servidor_vault.py --vault ~/obsidian/projetos
```

O CLI e o IDE compartilham `~/.gemini/config/mcp_config.json`, então o `agy mcp add` vale para os
dois (o arquivo com BOM quebra o `agy mcp`; grave sem). As regras do vault vão no `AGENTS.md` do
projeto ou no `~/.gemini/GEMINI.md` (passo 3). Não há `/goal` nem sub-agente: o `/faz` roda
inline, e você reenvia `continue` se a sessão parar antes de a leva fechar. No CLI as skills
atendem por `/faz`, `/obsidian-docs` e `/cpv`; no IDE, cite a skill pelo nome.

### Outros agentes (Cursor, Gemini CLI, Copilot, OpenCode, Windsurf...)

**1. Skills**, pelo [CLI `skills`](https://skills.sh) (spec [Agent Skills](https://agentskills.io/specification)):

```bash
npx skills add macrex/skills -g -a cursor      # -a codex, gemini-cli, github-copilot, opencode, windsurf... ou '*'
npx skills add macrex/skills -g --skill faz    # uma só; sem -g vai para o projeto
```

**2. Servidor MCP `vault-docs`**, no config de MCP do agente, como servidor stdio apontando para a
pasta de projetos do vault (o caminho da skill é o que o comando acima imprimiu):

```json
{ "mcpServers": { "vault-docs": {
  "command": "python",
  "args": ["<pasta da skill obsidian-docs>/scripts/servidor_vault.py", "--vault", "~/obsidian/projetos"]
} } }
```

`--sem-git` desliga o commit + push automático do vault. No Claude Code sem plugin, o próprio
servidor se registra (`claude mcp add`, escopo user):

```bash
python ~/.claude/skills/obsidian-docs/scripts/servidor_vault.py --instalar --vault ~/obsidian/projetos
```
```powershell
python $HOME\.claude\skills\obsidian-docs\scripts\servidor_vault.py --instalar --vault D:\obsidian\projetos
```

**3. Regras do vault**, que no plugin e no Pi entram sozinhas. Aqui vão no seu `AGENTS.md` ou `CLAUDE.md`:

```bash
curl -fsSLo vault-rules.js https://raw.githubusercontent.com/macrex/skills/main/hooks/vault-rules.js
node vault-rules.js SessionStart >> AGENTS.md && rm vault-rules.js
```

**4. Agent `vault-migrador`** (só Claude Code; opcional, `migrar tudo` usa `general-purpose` sem ele):

```bash
cp ~/.claude/skills/obsidian-docs/assets/vault-migrador.md ~/.claude/agents/
```

## Créditos e licença

O fluxo SDD/TDD que a `/faz` encadeia é do [Matt Pocock](https://www.aihero.dev)
([`mattpocock/skills`](https://github.com/mattpocock/skills), MIT); este repositório não redistribui
código dele. Licença MIT, veja [LICENSE](LICENSE).
