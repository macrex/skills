<p align="center">
  <img src="assets/logo.svg" width="64" height="64" alt="Logo do macrex skills">
</p>

<h1 align="center">macrex skills</h1>

<p align="center">
  <b>Skills para agentes de IA. Um pedido vira código verificado: interrogatório, spec, tickets, implementação, revisão e teste de qualidade.<br>O <code>/faz-painel</code> mostra a leva ao lado da conversa, e a documentação vive num vault Obsidian fora do repositório.</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue" alt="Licença: MIT"></a>
  <a href="https://github.com/macrex/skills/actions/workflows/ci.yml"><img src="https://github.com/macrex/skills/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/funciona%20com-Claude%20Code%20%C2%B7%20Pi%20%C2%B7%20Codex%20%C2%B7%20Antigravity-black" alt="Funciona com Claude Code, Pi, Codex e Antigravity">
</p>

Depois de instalado, peça do jeito de sempre:

```
> /faz exportar os chamados em CSV
> /faz-painel
> /cpv
```

O `/faz` interroga até o pedido ficar claro e entrega a linha da leva. Numa sessão nova, a leva roda
sozinha até tudo estar verificado, sem commitar nada, e o `/faz-painel` acompanha cada passo:

https://github.com/user-attachments/assets/b1894356-3e85-48c4-9da4-b91bd38bb613

<p align="center"><sub>Demonstração de 30 segundos. Ligue o som para ouvir a música.</sub></p>

## Usar

| Comando | O que faz |
|---|---|
| `/faz <pedido>` | Interroga, grava o entendimento e entrega a linha que roda a leva numa sessão nova: spec, tickets, implementação, revisão em dois eixos e teste de qualidade |
| `/obsidian-docs` | Registra spec, plano, ADR, bug, evolução ou análise no vault, com hub por projeto; `migrar` e `migrar tudo` copiam a documentação que já existe no repositório. Também dispara sozinha quando um documento nasce |
| `/cpv` | Commita no estilo do repositório, empurra e registra a evolução no vault; `/cpv sem-vault` fecha só o git |
| `/faz-painel` | Só no Claude Code: abre e fecha, ao lado da conversa, o painel da leva em curso no workspace. No `/faz <pedido>` ele acompanha o grill: o pedido, cada pergunta pelo tema com a resposta e o documento do entendimento; quando a leva começa, a tela troca para ela, que mostra as fases, os tickets com o portão de cada um, o tempo de cada fase e ticket, o total, e os sub-agentes, teammates e workflows da leva com modelo, estado e duração. Terminado o grill ou a leva, o botão Limpar a tela (tecla `l`) volta ao repouso, o Claude dormindo; `Esc` fecha, e um toast avisa quando uma leva começa |
| `/grill-tela` | Mostra o grill do Matt Pocock numa página HTML local, em vez de perguntar no terminal. O canal tem três modos: `cli` (o padrão, o grill segue no terminal), `perguntar` (o agente pergunta CLI ou tela quando o `grilling` começa) e `tela` (sempre na página). Escolha pela opção **Canal do grill** no Claude Code, por `GRILL_CANAL` no Pi e pela regra no `AGENTS.md` no Codex e no Antigravity |

`/faz` e `/cpv` só rodam quando você digita. `/faz` precisa das skills do
[Matt Pocock](https://github.com/mattpocock/skills); no Codex e no Pi ela usa um `/goal` (nativo
no Codex, extensão no Pi), e no Antigravity responda `continue` se a sessão parar antes do fim. No Codex
as skills atendem por `$macrex-skills:faz`, `$macrex-skills:obsidian-docs`, `$macrex-skills:cpv` e
`$macrex-skills:grill-tela`; nele a grill-tela roda fora do sandbox, que bloqueia a rede local, e
pede a sua aprovação.

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
`macrex`. O canal do grill é a opção **Canal do grill** em `/config`: `cli` (o padrão, o hook
fica calado e o grill segue o seu fluxo), `perguntar` (CLI ou tela, a cada grill) ou `tela` (sempre
na página). O plugin pede o Claude Code 2.1.287 ou mais novo. O `/faz-painel` é um mod do Claude Code e
não pede configuração, mas só aparece onde a Anthropic já liberou os mods; sem eles, o resto do plugin
funciona igual. Depois de instalar ou atualizar o plugin, reinicie a sessão (`claude --continue` mantém
a conversa): até lá, a sessão segue com a versão anterior. No Windows o plugin chama `python3`; se só tem `python`, ponha um `python3` no PATH. Se
já tinha as skills em `~/.claude/skills`, remova-as, ou elas ganham do plugin.

### Pi

```bash
pi install https://github.com/macrex/skills
pi install https://github.com/mattpocock/skills
pi install npm:@narumitw/pi-goal
export OBSIDIAN_VAULT=~/obsidian/projetos      # Windows: setx OBSIDIAN_VAULT D:\obsidian\projetos
export GRILL_CANAL=perguntar                   # opcional: cli (padrão), perguntar ou tela
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

Regras do vault no `AGENTS.md`: passo 3 de "Outros agentes". Para o grill perguntar o canal,
`node ~/.codex/skills/macrex/hooks/grill-canal.js regra >> AGENTS.md` (`regra tela` para ir sempre
à tela); para voltar ao CLI, apague o bloco `<grill-canal>`. Para atualizar, `git pull`
nas duas pastas.

### Antigravity (CLI `agy`)

```bash
git clone https://github.com/macrex/skills ~/.gemini/antigravity-cli/macrex
git clone https://github.com/mattpocock/skills ~/.gemini/antigravity-cli/mattpocock
cp -r ~/.gemini/antigravity-cli/macrex/skills/* ~/.gemini/antigravity-cli/mattpocock/skills/*/*/ ~/.gemini/config/skills/
agy mcp add vault-docs -- python ~/.gemini/config/skills/obsidian-docs/scripts/servidor_vault.py --vault ~/obsidian/projetos
```

O CLI só lê skill que está direto em `~/.gemini/config/skills/` (a pasta global desde o `agy` 1.2.14), daí a cópia. Regras do
vault no `AGENTS.md`: passo 3 de "Outros agentes". Para o grill perguntar o canal,
`node ~/.gemini/antigravity-cli/macrex/hooks/grill-canal.js regra >> ~/.gemini/GEMINI.md` (`regra tela` para
ir sempre à tela); para voltar ao CLI, apague o bloco `<grill-canal>`. Para atualizar,
`git pull` nos dois clones e repita o `cp`.

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
