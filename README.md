# skills

Skills de agente de IA que eu uso todo dia. No Claude Code são um **plugin**, e é
assim que eu recomendo instalar:

```
/plugin marketplace add macrex/skills
/plugin install macrex-skills@macrex
```

São duas linhas e acabou: as três skills, o servidor MCP `vault-docs` já conectado e o
agent `vault-migrador`, sem nenhum passo manual. Detalhes e a rota alternativa (o
[CLI `skills`](https://skills.sh), para Cursor, Codex e qualquer agente que leia a
[spec Agent Skills](https://agentskills.io/specification)) estão em [Instalar](#instalar).

As três giram em torno de uma ideia só: **o trabalho termina quando está
registrado**, não quando o código compila. A `/faz` leva um pedido até código
verificado, a `/obsidian-docs` guarda o porquê fora do repositório, e a `/cpv`
fecha a leva no git e na documentação ao mesmo tempo.

A `/faz` não inventa metodologia: ela **simplifica um fluxo que já existe**, o
SDD/TDD do [Matt Pocock](https://github.com/mattpocock/skills) — seis skills
invocadas na ordem certa, com as decisões no meio.

Ela trabalha em dois movimentos, e o motivo é uma restrição real: metade das
skills dele é `disable-model-invocation`, isto é, **nenhum agente as invoca
sozinho** — só o usuário, nomeando-as. Então `/faz <pedido>` já começa o
interrogatório, com as duas skills que são invocáveis por design (`grilling` e
`domain-modeling`), e ao fechar o entendimento grava-o num documento e entrega a
linha de `/goal` pronta, que nomeia `/faz leva <documento>`, cita esse documento
e nomeia as três que só ele destrava. Colá-la numa **sessão nova** roda o resto
até o fim, com o `/goal` segurando a sessão até a leva fechar: o documento é o
que leva o entendimento de uma sessão à outra, e o contexto limpo é o que dá
desempenho a uma leva longa.

## Instalar

Duas rotas, e você **escolhe uma**, não as duas — o porquê está no fim desta seção.

### Rota plugin (Claude Code) — recomendada

```
/plugin marketplace add macrex/skills
/plugin install macrex-skills@macrex
```

É tudo. Ao habilitar o plugin, o Claude Code pergunta a **pasta de projetos do seu vault
Obsidian** (`~/obsidian/projetos`, `D:\obsidian\projetos`) e sobe o servidor MCP `vault-docs`
apontando para ela — sem `--instalar`, sem `cp`, sem editar nada. O agent `vault-migrador` vem
junto. Não usa Obsidian? Deixe a pasta em branco: o plugin instala igual, o servidor cai na
variável `OBSIDIAN_VAULT` se ela existir, e sem nenhuma das duas as ferramentas de vault só
dizem o que falta configurar.

As três skills atendem pelo **nome nu** — `/faz`, `/obsidian-docs`, `/cpv` — e também por
`/macrex-skills:faz` e companhia.

**As regras do vault entram sozinhas.** Um hook de `SessionStart` e `SubagentStart` injeta o
roteamento no início de toda sessão e de todo sub-agente, só quando você configurou a pasta do
vault — você não escreve nada no seu `CLAUDE.md`. Detalhes em [O MCP `vault-docs`](#o-mcp-vault-docs).

**As ferramentas do vault mudam de nome nesta rota.** O Claude Code nomeia o servidor de um
plugin por `plugin:<plugin>:<servidor>`, então o que aqui é `mcp__vault-docs__salvar_nota`
chega como `mcp__plugin_macrex-skills_vault-docs__salvar_nota`. As três skills, o agent
`vault-migrador` e o hook já aceitam os dois prefixos; se você escreveu regra própria no seu
`CLAUDE.md` citando `mcp__vault-docs__*`, é ela que precisa aceitar os dois também.

**Ressalva no Windows:** o plugin invoca o servidor com `python3`, que é o certo em Unix e no
shebang do script. Se o seu launcher for `python` e o MCP não conectar (`claude mcp list` não
mostra `vault-docs … ✔ Connected`), o caminho é ter um `python3` no PATH, ou usar a rota CLI
abaixo, que registra o servidor com o seu python.

**O auto-update nasce desligado.** Ele já vem ligado para os marketplaces da Anthropic; este é
de terceiro, então ligue você: `/plugin`, aba **Marketplaces**, `macrex`, **Enable auto-update**.
Ligado, a versão nova chega sozinha — a checagem roda em segundo plano alguns minutos depois de
a sessão começar, e o Claude Code avisa para rodar `/reload-plugins`; sem isso ela entra no
próximo lançamento.

Para não depender de alguém lembrar do toggle — máquina nova, time inteiro —, o mesmo vai em
`settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "macrex": {
      "source": { "source": "github", "repo": "macrex/skills" },
      "autoUpdate": true
    }
  }
}
```

### Rota CLI (`npx skills add`) — para quem não usa o Claude Code

Plugin é conceito só do Claude Code. Em Cursor, Codex ou qualquer agente que leia a spec Agent
Skills, a rota é esta — e ela tem três passos, porque aqui não há plugin para declarar o MCP nem
o agent. **No Claude Code, prefira a rota acima**: estes três passos são exatamente o que ela
elimina.

**1. As skills.** Todas de uma vez, no perfil do usuário:

```bash
npx skills add https://github.com/macrex/skills -g
```

Uma de cada vez:

```bash
npx skills add https://github.com/macrex/skills --skill faz
npx skills add https://github.com/macrex/skills --skill obsidian-docs
npx skills add https://github.com/macrex/skills --skill cpv
```

Sem `-g` a skill vai para `./.claude/skills/` do projeto; com `-g`, para
`~/.claude/skills/`. Outro agente: `-a cursor`, `-a codex`. Sem confirmação: `-y`.

**2. O servidor MCP `vault-docs`**, de que a família `obsidian-docs` depende (a `cpv` o usa
se estiver presente). Ele não é instalado pelo CLI de skills — nenhum é —, mas vem dentro da
skill, em `scripts/servidor_vault.py`, e se registra sozinho. Aponte-o para a pasta *de
projetos* do seu vault:

```bash
python ~/.claude/skills/obsidian-docs/scripts/servidor_vault.py --instalar --vault ~/obsidian/projetos
```

No Windows, o mesmo, em PowerShell:

```powershell
python $HOME\.claude\skills\obsidian-docs\scripts\servidor_vault.py --instalar --vault D:\obsidian\projetos
```

O comando é um `claude mcp add -s user vault-docs` com o seu python e o caminho absoluto do
servidor: escopo de usuário, vale em todos os projetos, e pode ser repetido à vontade — ele
remove o registro anterior antes de gravar o novo. Precisa de Python 3.9+ (sem nenhuma
dependência) e do `claude` no PATH.

- Instalou **sem `-g`**? A skill ficou no projeto: o caminho é
  `./.claude/skills/obsidian-docs/scripts/servidor_vault.py`.
- `--vault` é dispensável se a variável `OBSIDIAN_VAULT` já apontar para a pasta de projetos.
- Vault que é repositório git ganha commit + `pull --rebase` + push a cada gravação;
  `--sem-git` desliga isso e o servidor só escreve em disco.

Depois **reinicie o Claude Code** — sessão aberta antes do registro não enxerga o servidor — e
confira com `claude mcp list`, que deve mostrar `vault-docs … ✔ Connected`. Se preferir não
registrar nada à mão, basta invocar a `/obsidian-docs`: **nesta rota**, sem as ferramentas
`mcp__vault-docs__*` na sessão, a própria skill roda o `--instalar` e pede o reinício — na rota
plugin ela não roda, porque lá o servidor já vem declarado.

**3. O agent `vault-migrador`**, que o modo `migrar tudo` de `obsidian-docs` usa para varrer
os projetos em paralelo. O CLI de skills não instala agents, então copie o arquivo que veio na skill:

```bash
cp ~/.claude/skills/obsidian-docs/assets/vault-migrador.md ~/.claude/agents/
```

Sem ele a migração em lote ainda roda, com `general-purpose` no lugar.

### Escolha uma rota, não as duas

Skill de escopo pessoal **ganha** de skill de plugin no nome nu. Quem tem
`~/.claude/skills/faz` e instala o plugin continua rodando a cópia antiga ao digitar `/faz`: o
plugin só responde por `/macrex-skills:faz`, as atualizações chegam e não são usadas. E isso não
dá erro nenhum — é por isso que o aviso está aqui.

Migrando da rota CLI para a rota plugin, limpe a rota antiga:

```bash
rm -rf ~/.claude/skills/{faz,cpv,obsidian-docs}
rm -f ~/.claude/agents/vault-migrador.md
claude mcp remove vault-docs
```

As três linhas cobrem os três passos da rota antiga, e nenhuma perde conteúdo — o plugin passa a
entregar as skills, o agent e o servidor. O `claude mcp remove` importa porque o registro antigo
some da lista, mas continua subindo um segundo processo do mesmo servidor. E o
`~/.claude/agents/vault-migrador.md` importa porque agent de escopo pessoal aparece **ao lado** do
que o plugin traz: você acaba com `vault-migrador` e `macrex-skills:vault-migrador` na lista,
apontando para cópias que podem divergir.

**Linter do vault**, opcional, nas duas rotas: `skills/obsidian-docs/scripts/validar_vault.py`
checa o vault inteiro — frontmatter, links quebrados e notas fora do hub. Copie-o para
`<vault>/.scripts/` e rode `python .scripts/validar_vault.py --resumo`.

## As skills

| Skill | Faz | Dispara |
|---|---|---|
| [`faz`](skills/faz/) | Simplifica o fluxo SDD/TDD do [Matt Pocock](https://github.com/mattpocock/skills) começando o interrogatório no seu comando e entregando um `/goal` pronto para o resto: interrogatório, spec, tickets, implementação no modo que você escolher — inline, sub-agents ou workflow, recomendado pela qualidade —, revisão em dois eixos, correções e teste de qualidade | `/faz <pedido>` |
| [`obsidian-docs`](skills/obsidian-docs/) | Documentação de projeto nasce num vault Obsidian, nunca no repositório: spec, plano, ADR, bug, evolução, análise — com hub por projeto e índice automático. Também migra pro vault a documentação já existente (`migrar`/`migrar tudo`). Traz junto o servidor MCP `vault-docs` | `/obsidian-docs`, "documentar" |
| [`cpv`](skills/cpv/) | Fecha a leva: descobre todos os repositórios que a sessão tocou, varre segredos, commita no estilo de cada um, empurra e registra a evolução na documentação | `/cpv` |

A `faz` e a `cpv` são **user-invoked** (`disable-model-invocation: true`): só
disparam quando você digita o nome, nunca por decisão do agente. É de propósito —
nenhuma das duas deve rodar sozinha, e a `cpv` especialmente: um agente que a
invocasse estaria fabricando a própria autorização para commitar. A família
`obsidian-docs` é o contrário: ela precisa disparar sozinha, no instante em que um
documento nasce — é isso que evita que ele nasça dentro do repositório.

## O MCP `vault-docs`

O servidor é a única porta do vault: ele lê por busca e grava as notas já nas convenções, então
nenhuma nasce órfã, sem frontmatter ou fora do hub. Funciona com o Obsidian fechado — é tudo
filesystem, sem plugin. A estrutura que ele mantém: `Home.md` global → `<projeto>/<projeto>.md`
(o hub) → `Specs/`, `Arquitetura/`, `Bugs/`, `Evolucoes/`, `Analises/`.

| Ferramenta | O que faz |
|---|---|
| `visao_geral` | Panorama: projetos, contagem por tipo, notas recentes. |
| `buscar` | Full-text sem acento/caixa, filtros `projeto`/`tipo`/`status`, com trecho. |
| `listar_notas` | Caminho + frontmatter, mais recentes primeiro. |
| `ler_nota` | Conteúdo integral, por caminho relativo ou nome de wikilink. |
| `conexoes` | Wikilinks de saída e backlinks — navegação pelo grafo. |
| `salvar_nota` | Nota nova: pasta por tipo, `YYYY-MM-DD titulo.md`, frontmatter, link e entrada no hub, hub e `Home.md` se o projeto for novo, commit+push. Tickets em `Specs/Tickets - <artefato>/`. |
| `atualizar_nota` | Nota existente: corpo, status, tags, resumo no hub ou sucessora (marca obsoleta e linka). |
| `mapa_codigo` | Mapa do código do projeto lendo o `graphify-out/`: frescor do grafo, comunidades, god nodes. |
| `consultar_codigo` | Pergunta de arquitetura ao grafo (`graphify query/explain/path`), CLI local. |
| `gerar_mapa` | Regrava a nota `Mapa do Codigo <projeto>` a partir do grafo, preservando a sua leitura curada. |

**graphify, opcional.** O [graphify](https://github.com/Graphify-Labs/graphify) (`pip install
graphifyy`) transforma um repositório num grafo gravado em `graphify-out/graph.json`, e o servidor
lê esse arquivo e nada mais. Para ligar um projeto: `graphify update .` dentro do repositório,
`graphify-out/` no `.gitignore` dele — nunca dentro do vault, que é um repositório git com push a
cada nota — e a linha `Repo: <caminho>` no hub, que a primeira chamada com `repo=` grava sozinha.
Sem grafo, as ferramentas de código respondem "sem grafo em <pasta>" e o resto segue igual. Duas
fontes, cada pergunta na sua: o que foi decidido e por quê → vault; o que o código é agora → grafo.

**CLAUDE.md: na rota plugin, você não escreve nada.** O problema é que a skill só passa a valer
depois que dispara, e ela acorda quando um documento nasce — não quando você vai mexer em
código. Antes, isso obrigava cada pessoa a copiar um bloco de regras para o próprio
`CLAUDE.md`. Agora o plugin resolve: ele traz um hook de `SessionStart` e `SubagentStart`
(`hooks/vault-rules.js`) que injeta as regras no início de toda sessão **e de todo sub-agente**,
que é onde elas mais se perdiam.

O hook **só injeta se você configurou a pasta do vault** — ele lê o valor do `userConfig` em
`settings.json`, ou a variável `OBSIDIAN_VAULT`. Quem instalou o plugin sem usar Obsidian não
recebe regra nenhuma. O que é injetado: ler o hub antes de mexer em código, doc nasce no vault e
nunca no repo, registrar a evolução ao fechar a leva, migração é cópia e nunca recorte, acesso
só pelas ferramentas do MCP, e os dois prefixos de ferramenta.

Na **rota CLI** não há plugin para carregar hook, então ali o bloco continua sendo manual:

```markdown
- O vault é a memória dos projetos: ANTES de mexer no código, leia o hub
  (`ler_nota <nome-da-pasta-do-repo>`) e a evolução mais recente
  (`listar_notas projeto=<projeto> tipo=evolucao limite=1`). Código e git vêm depois.
- Todo artefato .md de documentação nasce no vault pela skill `obsidian-docs`, NUNCA no repo
  do projeto. Ao fechar uma leva ou versão, registre a evolução.
- Migração pro vault é CÓPIA, nunca recorte: proibido apagar ou mover arquivo do repo.
```

## A `/cpv` e a autorização de commit

```
/cpv              # commit + push em cada repositório da leva + nota no vault
/cpv sem-vault    # só git; pula a nota
```

A leva é o que a sessão tocou, não o `cwd`: o descobridor lê o transcript — todo `file_path` de
`Edit`/`Write` — e alcança repositório fora do `cwd`; a varredura do `cwd` (dois níveis) só entra
pelo repositório que o contém, e os outros repositórios sujos saem em `NAO INCLUIDOS`, intocados.
Para ver o que o comando veria, rode o descobridor solto:

```bash
node ~/.claude/skills/cpv/scripts/repos-da-leva.js           # texto, como o /cpv vê
node ~/.claude/skills/cpv/scripts/repos-da-leva.js --json    # o mesmo, estruturado
```

O autoteste dele roda em repositórios temporários, sem tocar em nada seu:
`node skills/cpv/scripts/teste-repos-da-leva.js`.

O comando é a **única** autorização de commit, e isso só vale se a regra estiver no seu
`CLAUDE.md`:

```markdown
- NEVER commit or push without my express request. "Express request" = I write commit/push
  in this task, or I type `/cpv`. Approving a change's content is NOT approving its commit.
- `/cpv` closes the batch (commit + push + vault note) and counts as the express request for
  THAT batch. Only I type it — no agent, skill, or workflow invokes it.
```

## Dependências

Cada uma funciona sozinha, mas duas puxam algo de fora:

- **`faz`** precisa de seis [skills do mattpocock](https://github.com/mattpocock/skills):
  `grilling` e `domain-modeling` no interrogatório, que ela invoca sozinha, e
  `to-spec`, `to-tickets`, `implement` e `code-review` depois, que vêm pela linha
  que ela entrega. São elas que fazem o SDD/TDD; a `faz` só encadeia, e a
  implementação ela cumpre no modo que você escolher com os tickets na mesa —
  inline, sub-agents ou workflow. Ela confere as seis em
  disco antes de começar e para se faltar alguma — procurar na lista de skills
  não serve, porque as user-invoked não aparecem para o agente.
  Instale com `/plugin install mattpocock-skills` no
  Claude Code, ou `npx skills@latest add mattpocock/skills` em qualquer agente.
  Ela grava no tracker que existir: vault Obsidian se o MCP estiver na sessão, o tracker do
  `/setup-matt-pocock-skills` se houver, ou os arquivos locais que `to-spec` e
  `to-tickets` já escrevem por padrão.
- **`obsidian-docs`** e a parte de documentação da **`cpv`** precisam do MCP
  `vault-docs` — e ele não vem de fora: mora dentro da própria skill, em
  `skills/obsidian-docs/scripts/servidor_vault.py`, e sobe declarado pelo plugin (rota
  plugin) ou registrado pelo `--instalar` (rota CLI). Python 3.9+, sem nenhuma dependência.
  Sem o servidor, a `cpv` roda com `sem-vault` e fecha só o git.

## Adaptar para você

O texto é em português do Brasil e carrega escolhas minhas. As que você
provavelmente vai querer trocar:

- **`cpv`** assume que autoria é só sua e proíbe qualquer trailer de
  assistente no commit, e que o vault é a única exceção à regra de nunca
  commitar sem pedido. Se a sua regra for outra, edite a seção "Git".
- **`faz`** para três vezes (o aceite do interrogatório, a escolha do modelo e o
  modo da implementação) e nunca commita no fim. Quem quiser que ela feche sozinha muda a linha do
  fechamento.
- **`obsidian-docs`** descreve uma estrutura de vault concreta (`Home.md` →
  hub por projeto → pastas por tipo). O servidor MCP é quem a impõe; a skill só
  a documenta.

## Créditos

O fluxo SDD/TDD que a `/faz` encadeia é do **[Matt Pocock](https://www.aihero.dev)**,
das [`mattpocock/skills`](https://github.com/mattpocock/skills) (MIT): interrogar
antes de projetar (`grilling`, `domain-modeling`), virar spec e tickets como fatias verticais
(`to-spec`, `to-tickets`), implementar nos seams acordados (`implement`) e revisar
em dois eixos separados, padrão e spec (`code-review`). A ideia de que tickets são
*tracer bullets* com arestas de bloqueio, e a de separar os dois eixos de revisão
para que um não mascare o outro, são dele.

Este repositório **não redistribui código dele** — as skills da `/faz` são
invocadas do plugin instalado na sua máquina. O que está aqui é só o
encadeamento: as três paradas, os três modos de implementação e o fechamento.

A cadeia dele termina no relatório: o `code-review` imprime os dois eixos e para,
sem aplicar nada. No fluxo da `/faz` o passo seguinte é aplicar esses achados —
um agente recebe os dois relatórios e corrige, recusando com o motivo o achado
que se revelar errado — e só então vem o teste de qualidade.

## Licença

MIT — veja [LICENSE](LICENSE). As skills do Matt Pocock têm licença própria, no
repositório dele.
