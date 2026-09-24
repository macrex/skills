---
name: cpv
description: Fecha a leva — commit no estilo de cada repositório que ela mexeu, push e a nota no vault Obsidian. Só quando o usuário digita /cpv ou pede expressamente para fechar a leva. Argumento opcional 'sem-vault'.
argument-hint: [sem-vault]
disable-model-invocation: true
allowed-tools: Bash(git:*) Bash(node:*) Read Write Edit Glob Grep Skill mcp__vault-docs mcp__plugin_macrex-skills_vault-docs
---

# /cpv — fecha a leva

# Versao: 1.2

**Este comando só vale digitado pelo usuário.** Nenhum agente, skill ou workflow o invoca
(`disable-model-invocation: true`). Invocar `/cpv` É o pedido expresso de commit e push — de
*desta* leva, e só dela; um agente que o disparasse por conveniência cometeria o commit-sem-pedido
que a regra dura proíbe.

Sem argumento faz tudo. `sem-vault` para nos passos de git.

O `allowed-tools` pré-aprova o MCP do vault pelos dois prefixos nus (`mcp__vault-docs` e
`mcp__plugin_macrex-skills_vault-docs`); a documentação do Claude Code só mostra a sintaxe
`Bash(...)`, o prefixo de servidor é comportamento observado. Se as ferramentas do vault voltarem
a pedir permissão dentro do `/cpv`, é isso que mudou: liste-as uma a uma no cabeçalho.

## Contexto

Antes de qualquer outra coisa, rode o descobridor e use a saída como o Contexto que o resto cita.
O primeiro candidato é a pasta **desta skill**, que todo harness anuncia ao carregá-la; troque
`<pasta desta skill>` por ela:

```bash
D="<pasta desta skill>/scripts/repos-da-leva.js"
[ -f "$D" ] || D="${CLAUDE_PLUGIN_ROOT}/skills/cpv/scripts/repos-da-leva.js"
[ -f "$D" ] || D="$HOME/.claude/skills/cpv/scripts/repos-da-leva.js"
[ -f "$D" ] || D="$HOME/.agents/skills/cpv/scripts/repos-da-leva.js"
[ -f "$D" ] || D="$HOME/.claude/scripts/repos-da-leva.js"
if [ -f "$D" ]; then node "$D"; else echo "DESCOBRIDOR AUSENTE"; fi
```

## A leva não é o `cwd` — é o que ela mexeu

A lista traz os repositórios **desta sessão**: a leva é o conjunto do que ela tocou, não o repo
do `cwd` — fechar só este deixaria mudança feita noutro repositório (o de skills, um script do
harness) sem commit e sem nota. A marca em cada linha diz a fonte:

- **`sessao`** — o transcript registrou a sessão escrevendo ali; é o que sabe o que ESTA leva
  tocou, inclusive fora do `cwd`. O descobridor lê o transcript do Claude Code, do Pi e do Codex;
  no Antigravity não há transcript legível e só a varredura roda — a linha `transcript:` da saída
  diz qual foi.
- **`varredura`** — repo com mudança pendente sob o `cwd` (até 2 níveis). Entra como alvo **só**
  quando contém o `cwd`; os outros vão para `NAO INCLUIDOS` (numa pasta-pai a varredura acha
  dezenas de repos sujos de trabalho antigo).

**Processe TODOS os de `REPOSITORIOS DA LEVA`**, um por vez, na ordem. Não eleja "o principal".
Repo marcado `NADA A COMMITAR (so o vault)` já foi commitado e empurrado antes: vá direto ao
passo 5.

**`NAO INCLUIDOS` é lista de leitura, não de trabalho.** Repositórios sujos que esta sessão não
tocou: não estagie, não commite, não empurre — nem "de passagem", nem porque a mudança parece
relacionada. Só entram se o usuário mandar por escrito, nesta conversa.

Nada em `REPOSITORIOS DA LEVA` → **pare** e diga isso. `DESCOBRIDOR AUSENTE` → modo antigo:
`git rev-parse --show-toplevel` a partir do `cwd`, feche só esse repo e avise no relatório que a
descoberta não rodou.

O **vault** (`obsidian/projetos`) nunca entra na lista de commit: a skill `obsidian-docs` o
commita e empurra sozinha, única exceção da regra dura de git.

## Antes de tudo: quando parar

Confira por repositório, nesta ordem. Qualquer um destes **pula aquele repositório** (reporte e
siga para o próximo; um repo travado não cancela os outros). Nunca `pull --rebase` para resolver,
nunca `--no-verify`, nunca inicializar repositório.

| Situação | Como detectar |
|---|---|
| `HEAD` destacado | branch = `HEAD` |
| Repositório sem nenhum commit | a linha traz `SEM NENHUM COMMIT` — não há estilo a inferir |
| Merge ou rebase em andamento | `.git/MERGE_HEAD`, `.git/rebase-merge` ou `.git/rebase-apply` existe |
| Sem remoto | a linha traz `(sem remoto)` — o commit local fica feito, e diga isso |
| Submódulo sujo | `git -C <raiz> submodule status` com `+` — o super-repo gravaria um ponteiro que o push não leva |
| Segredo no que seria commitado | passo 1 |

Só a lista vazia para o comando inteiro.

## Working tree limpo não para o comando

`0 pendente(s)` = não há o que commitar naquele repo; **nunca** force um commit vazio. Mas `/cpv`
fecha a **leva**, e commit é meio: ela pode ter sido commitada minutos antes (por você, outra
sessão ou um `/cpv` que parou no meio), e parar aí deixa o trabalho fechado no git e invisível no
vault. Por isso o descobridor mantém na lista o repo limpo que **a sessão tocou**, e só esse.

Repo limpo: pule os passos 1 a 3; `ahead` maior que zero → dê o push (o pedido expresso cobre
empurrar a leva); vá ao passo 5 e diga no relatório que o commit já existia, com o hash.

## Passos (repita para cada repositório da lista)

Todo comando de git leva `-C <raiz do repo>`: o `cwd` pode não estar dentro dele.

### 1. Segredos

Antes de estagiar, rode o varredor: ele lê exatamente o que o `add -A` levaria (modificados e
novos fora do `.gitignore`) e procura segredo pelo nome (`.env`, `*.pem`, `id_rsa`,
`credentials.json`…) e pelo conteúdo (chave privada, chave AWS, tokens GitHub/Slack/Anthropic, URL
com senha, `password`/`senha`/`api_key`/`token` com valor literal). O caminho é resolvido por
**existência do arquivo**, nunca por `||` no código de saída: o varredor sai 1 quando **acha**
segredo, e uma cadeia `a || b || echo` leria esse 1 como "script ausente" e imprimiria
`VARREDOR AUSENTE` com exit 0, anulando o achado.

```bash
V="<pasta desta skill>/scripts/segredos.js"
[ -f "$V" ] || V="${CLAUDE_PLUGIN_ROOT}/skills/cpv/scripts/segredos.js"
[ -f "$V" ] || V="$HOME/.claude/skills/cpv/scripts/segredos.js"
[ -f "$V" ] || V="$HOME/.agents/skills/cpv/scripts/segredos.js"
if [ -f "$V" ]; then node "$V" <raiz>; echo "varredor exit: $?"; else echo "VARREDOR AUSENTE"; fi
```

**Só siga com `LIMPO` e exit 0.** Qualquer outra saída:

- `SEGREDO` (exit 1) → **pule o repositório** e mostre as linhas `arquivo:linha  motivo`. Não
  relativize um achado: o trecho sai mascarado de propósito; falso positivo é o usuário quem decide.
  Um `.env` empurrado não se desfaz com um commit a mais.
- `NAO VERIFICADO` (exit 2) → o git não respondeu e **nenhum arquivo foi lido**; não é estar limpo.
  Pule o repositório e diga por quê.
- `VARREDOR AUSENTE` → varra à mão pelos mesmos padrões e diga no relatório que o script não rodou.

Assuma que não há segunda barreira: os guards do harness podem não estar nesta máquina e o modo
pode ser `bypassPermissions`. É por isso que a varredura é um script, não a sua atenção.

### 2. Estagiar

`git -C <raiz> add -A`: fecha a leva inteira — index já preparado é absorvido e arquivo novo
entra (`git commit -a` deixaria untracked de fora em silêncio). Antes, olhe a lista de pendentes
daquele repo no Contexto: arquivo que **não é da leva** (sujeira anterior, outro assunto) → não
invente, mostre ao usuário e pergunte antes de estagiar.

### 3. A mensagem

Leia `git -C <raiz> log --format='%s' -20` e escreva **no estilo daquele repositório** (idioma,
prefixo convencional ou a falta dele, tamanho, tom); não imponha um padrão que o repo não usa.
Regras que não dependem do repo:

- Assunto no imperativo, uma linha, sem ponto final.
- Corpo só quando explica o que o diff não mostra (o porquê, a armadilha evitada, o que foi
  tentado antes).
- **Zero trailers.** Nada de `Co-Authored-By`, `Generated with`, menção a
  Claude/Anthropic/assistente. A autoria é só do usuário: não passe `--author`.

### 4. Commit e push

```bash
git -C <raiz> commit -m "<mensagem>"
git -C <raiz> push            # sem upstream: git -C <raiz> push -u origin <branch>
```

Hook de pre-commit falhou → **pule o repositório** e mostre a saída. Push rejeitado
(non-fast-forward) → **pule**: o commit está feito, e como integrar é decisão do usuário.

### 5. O vault

Pule se o argumento for `sem-vault`.

Invoque a skill **`obsidian-docs`** e registre a leva em `Evolucoes/`. Duas coisas são dela:

- **Qual é o projeto no vault.** Hub existente ganha; projeto nunca é duplicado; em dúvida,
  pergunte. Não deduza pelo nome da pasta: repo `pagamentos-repo` pertence ao hub `pagamentos` que
  já existe. Confira pelo MCP: `contexto_projeto <projeto>` acha o hub (e traz a última evolução);
  não achou → `visao_geral`. Nunca `Read`/`Grep` direto no vault.
- **O fluxo de escrita.** `salvar_nota` (ou `atualizar_nota`) do MCP faz frontmatter, pasta por
  tipo, entrada no hub e o `commit → pull --rebase → push` do vault — única exceção da regra de
  git, executada pelo servidor, nunca por você. Passe `arquivos` com a lista de pendentes daquele
  repo (a do Contexto): o servidor anexa "Componentes tocados" quando o projeto tem grafo.

**Uma nota por leva e por projeto.** Dois repositórios na mesma leva são dois projetos e duas
notas, cada uma no seu hub, uma linkando a outra quando a mudança de um explica a do outro. Mesmos
arquivos e tema da nota mais recente de `Evolucoes/` (`listar_notas projeto=<projeto>
tipo=evolucao limite=1`, depois `ler_nota`) → atualize aquela in-place, mantendo nome e data do
arquivo (marcam quando a leva começou). Assunto diferente → nota nova. O `git log` é o log de
commits; o vault é a memória do projeto.

Já escreveu a nota desta leva antes do `/cpv` (comum: a `obsidian-docs` roda ao fechar o
trabalho)? Não crie outra: confira que ela está no hub (`contexto_projeto <projeto>` mostra a
última evolução) e diga no relatório que já existia, com o caminho.

### 6. Relatório

Descoberta só pela varredura (a linha `transcript:` do Contexto diz `nao encontrado`) → uma linha
dizendo isso antes de tudo: repo tocado fora do `cwd` pode ter ficado de fora. Depois, três linhas
**por repositório**:

- o que foi commitado (hash curto e assunto), ou o commit que **já existia**
- push: para onde, ou por que não
- vault: nota criada, atualizada ou já existente, com o caminho — ou "pulado". Com o MCP na
  sessão, feche com `validar projeto=<projeto>`: erro do linter entra na linha (é o vault que
  ficou inconsistente, não a leva)

A linha de fechamento **só existe quando tem conteúdo**: repositório **pulado** (condição de
parada) ou `NAO INCLUIDOS` não vazio — aí é obrigatória, com motivo e contagem, porque silêncio
sobre um repo que a descoberta viu lê como "não havia mais nada", e é assim que uma mudança fica
esquecida no working tree por dias. Nada pulado e `NAO INCLUIDOS` vazio → **não escreva a linha**:
é o caso normal. O vault nunca entra nela — é ignorado por definição.
