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
  O `/cpv` é a única autorização de commit; nenhum agente o invoca.
- `faz` precisa das skills do Matt Pocock e do `/goal`, os dois do Claude Code:
  `/plugin install mattpocock-skills`. Em outro agente ela carrega, mas não vai até o fim.
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
ou `python` no PATH. O agent `vault-migrador` não vem (o Pi não tem sub-agentes): `migrar tudo`
roda inline. Não instale também por `npx skills add -a pi`, ou as skills ficam duplicadas.

### Outros agentes (Cursor, Codex, Gemini CLI, Copilot, OpenCode, Windsurf...)

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
