<p align="center">
  <img src="assets/logo.svg" width="64" height="64" alt="Logo do macrex skills">
</p>

<h1 align="center">macrex skills</h1>

<p align="center">
  <b>Skills para agentes de IA. Um pedido vira código verificado: interrogatório, spec, tickets, implementação, revisão e teste de qualidade.<br>O <code>/painel-macrex</code> mostra a leva ao lado da conversa, e a documentação vive num vault Obsidian fora do repositório.</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue" alt="Licença: MIT"></a>
  <a href="https://github.com/macrex/skills/actions/workflows/ci.yml"><img src="https://github.com/macrex/skills/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/macrex/skills/releases/latest"><img src="https://img.shields.io/github/v/release/macrex/skills" alt="Release"></a>
  <img src="https://img.shields.io/badge/funciona%20com-Claude%20Code%20%C2%B7%20Pi%20%C2%B7%20Codex%20%C2%B7%20Antigravity-black" alt="Funciona com Claude Code, Pi, Codex e Antigravity">
</p>

```
> /faz exportar os chamados em CSV
> /painel-macrex
> /cpv
```

O `/faz` interroga até o pedido ficar claro e entrega a linha da leva. Colada numa sessão nova, a leva
roda sozinha até tudo estar verificado, sem commitar nada, e o `/painel-macrex` acompanha cada passo:

https://github.com/user-attachments/assets/b1894356-3e85-48c4-9da4-b91bd38bb613

<p align="center"><sub>Demonstração de 30 segundos. Ligue o som para ouvir a música.</sub></p>

## Usar

| Comando | O que faz |
|---|---|
| `/faz <pedido>` | Interroga, grava o entendimento e entrega a linha que roda a leva: spec, tickets, implementação, revisão em dois eixos e teste de qualidade |
| `/painel-macrex` | Abre e fecha o painel da leva ao lado da conversa (só no Claude Code; as abas estão abaixo) |
| `/cpv` | Commita no estilo do repositório, empurra e registra a evolução no vault; `/cpv sem-vault` fecha só o git |
| `/obsidian-docs` | Registra spec, plano, ADR, bug, evolução ou análise no vault, um hub por projeto; `migrar` e `migrar tudo` copiam a documentação que já está no repositório. Também dispara sozinha quando um documento nasce |
| `/grill-tela` | Faz o grill do Matt Pocock numa página HTML local. O canal do grill é `cli` (o padrão, no terminal), `perguntar` (o agente pergunta no início) ou `tela`: opção **Canal do grill** em `/config` no Claude Code, `GRILL_CANAL` no Pi, regra no `AGENTS.md` no Codex e no Antigravity. Um servidor só por máquina atende todos os grills, cada um na sua URL, que segue abrindo a leitura do grill depois do sim; a raiz é o histórico de grills, com os ativos no topo |

| Aba do painel | Mostra |
|---|---|
| Painel | As fases, do grill à qualidade, cada uma com o estado e o tempo; com a leva, também os tickets com o portão, os passos da revisão, das correções e da qualidade e os sub-agentes, teammates e workflows com modelo e estado; fechada a leva, o lembrete do `/cpv` e o histórico. O grill da grade abre a aba Grill. Só o botão Limpar, sempre ao lado do título, limpa o painel: tira o grill e a leva, aberta ou fechada, com o uso dela (a aberta perde a retomada); o `/clear` não mexe nele |
| Diff | Os arquivos que a sessão mudou, com as linhas somadas e tiradas; o clique num arquivo abre o diff |
| Grill | Cada pergunta do grill desta janela com a resposta, venha ela do terminal ou da página da `/grill-tela`, o cartão do grill na tela com a URL e o Abrir (também na aba Painel, e segue lá depois do sim), o botão Histórico, que abre o histórico de grills, e o prompt do `/faz leva` com os botões Clear, que roda o `/clear`, e Executar, que põe o texto exato na caixa de envio; fica até o Limpar da aba Painel |
| Tickets | O portão e as notas de cada ticket |
| Uso | Os tokens desde o início da leva, por modelo e por agente |
| Arquivos | A árvore do projeto, sem o que o git ignora, com o nome do que a sessão criou em verde e do que ela alterou em amarelo, `•` na pasta fechada que tem algum deles e um filtro por trecho do caminho; o clique na pasta a abre e fecha, e o `›` do arquivo alterado ou novo abre embaixo dele o mesmo diff da aba Diff |

`/faz` e `/cpv` só rodam quando você digita. A `/faz` precisa das skills do
[Matt Pocock](https://github.com/mattpocock/skills). No Codex e no Pi ela segura a sessão com um `/goal`
(nativo no Codex, extensão no Pi); no Antigravity, responda `continue` se a sessão parar antes do fim.
No Codex as skills atendem por `$macrex-skills:<nome>`, e a grill-tela roda fora do sandbox, que
bloqueia a rede local, com a sua aprovação.

## Instalar

Requisitos: Python 3.9+ e Node. Troque `~/obsidian/projetos` pela pasta de projetos do seu vault;
sem Obsidian, pule o que fala de vault.

### Claude Code

```
/plugin marketplace add macrex/skills
/plugin install macrex-skills@macrex
/plugin install mattpocock-skills
```

- Informe a pasta do vault ao habilitar e ligue o auto-update em `/plugin`, aba Marketplaces, `macrex`.
- Pede o Claude Code 2.1.287 ou mais novo. O `/painel-macrex` é um mod: só aparece onde a Anthropic já
  liberou os mods, e sem eles o resto do plugin funciona igual.
- Depois de instalar ou atualizar, reinicie a sessão (`claude --continue` mantém a conversa); até lá
  vale a versão anterior.
- No Windows o plugin chama `python3`: se só existe `python`, ponha um `python3` no PATH.
- Skills antigas em `~/.claude/skills` ganham do plugin: remova-as.

### Pi

```bash
pi install https://github.com/macrex/skills
pi install https://github.com/mattpocock/skills
pi install npm:@narumitw/pi-goal
export OBSIDIAN_VAULT=~/obsidian/projetos      # Windows: setx OBSIDIAN_VAULT D:\obsidian\projetos
export GRILL_CANAL=perguntar                   # opcional: cli (padrão), perguntar ou tela
```

- Em `~/.pi/agent/settings.json`, troque a entrada do Matt por
  `{ "source": "https://github.com/mattpocock/skills", "skills": ["skills/engineering/**", "skills/productivity/**"] }`,
  as mesmas skills que o plugin do Claude Code instala.
- Levas de vários tickets: suba `continuationLimits.automaticTurns` em `~/.pi/agent/pi-goal.json`.
- `pi install npm:pi-subagents` habilita o modo sub-agents.

### Codex

```bash
git clone https://github.com/macrex/skills ~/.codex/skills/macrex
git clone https://github.com/mattpocock/skills ~/.codex/skills/mattpocock
codex mcp add vault-docs -- python ~/.codex/skills/macrex/skills/obsidian-docs/scripts/servidor_vault.py --vault ~/obsidian/projetos
```

Regras do vault no `AGENTS.md`: passo 3 de "Outros agentes". Para o grill perguntar o canal,
`node ~/.codex/skills/macrex/hooks/grill-canal.js regra >> AGENTS.md` (`regra tela` vai sempre à tela;
apagar o bloco `<grill-canal>` volta ao CLI). Atualize com `git pull` nas duas pastas.

### Antigravity (CLI `agy`)

```bash
git clone https://github.com/macrex/skills ~/.gemini/antigravity-cli/macrex
git clone https://github.com/mattpocock/skills ~/.gemini/antigravity-cli/mattpocock
cp -r ~/.gemini/antigravity-cli/macrex/skills/* ~/.gemini/antigravity-cli/mattpocock/skills/*/*/ ~/.gemini/config/skills/
agy mcp add vault-docs -- python ~/.gemini/config/skills/obsidian-docs/scripts/servidor_vault.py --vault ~/obsidian/projetos
```

O `agy` só lê skill direto em `~/.gemini/config/skills/` (a pasta global desde a 1.2.14), daí a cópia.
Regras do vault no `AGENTS.md`: passo 3 de "Outros agentes". Para o grill perguntar o canal,
`node ~/.gemini/antigravity-cli/macrex/hooks/grill-canal.js regra >> ~/.gemini/GEMINI.md` (`regra tela`
vai sempre à tela; apagar o bloco `<grill-canal>` volta ao CLI). Atualize com `git pull` nos dois
clones e repita o `cp`.

### Outros agentes (Cursor, Gemini CLI, Copilot, OpenCode, Windsurf...)

1. Skills: `npx skills@latest add macrex/skills -g -a cursor` (ou `gemini-cli`, `github-copilot`,
   `opencode`, `windsurf`, `'*'`). Se também usa o plugin no Claude Code, clone na pasta de skills do
   agente, como no Codex: o `npx` grava em `~/.agents/skills`, que o Claude Code também lê, e cada
   skill aparece duas vezes.
2. MCP `vault-docs`, como servidor stdio no config de MCP do agente:
   `python <pasta da skill obsidian-docs>/scripts/servidor_vault.py --vault ~/obsidian/projetos`.
3. Regras do vault, no `AGENTS.md` ou `CLAUDE.md`:

   ```bash
   curl -fsSLo vault-rules.js https://raw.githubusercontent.com/macrex/skills/main/hooks/vault-rules.js
   node vault-rules.js SessionStart >> AGENTS.md && rm vault-rules.js
   ```

## Créditos e licença

O fluxo que a `/faz` encadeia é do [Matt Pocock](https://github.com/mattpocock/skills) (MIT); este
repositório não redistribui código dele. Licença MIT, veja [LICENSE](LICENSE).
