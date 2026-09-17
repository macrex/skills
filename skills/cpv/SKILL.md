---
name: cpv
description: Fecha a leva — commit no estilo de cada repositório que ela mexeu, push e a nota no vault Obsidian. Só quando o usuário digita /cpv ou pede expressamente para fechar a leva. Argumento opcional 'sem-vault'.
argument-hint: [sem-vault]
disable-model-invocation: true
allowed-tools: Bash(git:*) Bash(node:*) Read Write Edit Glob Grep Skill mcp__vault-docs
---

# /cpv — fecha a leva

**Este comando só vale digitado pelo usuário.** Nenhum agente, skill ou workflow
o invoca: o `disable-model-invocation: true` acima existe para isso. Invocar
`/cpv` É o pedido expresso de commit e push — de *desta* leva, e só dela. Um
agente que o disparasse por conveniência cometeria o commit-sem-pedido que a
regra dura proíbe, e este arquivo estaria dando cobertura retroativa a ele.

Sem argumento faz tudo. `sem-vault` para nos passos de git.

## Contexto

Antes de qualquer outra coisa, rode o descobridor e use a saída dele como o
Contexto que o resto deste arquivo cita:

```bash
node "$HOME/.claude/skills/cpv/scripts/repos-da-leva.js" 2>&1 || node "$HOME/.agents/skills/cpv/scripts/repos-da-leva.js" 2>&1 || node "$HOME/.claude/scripts/repos-da-leva.js" 2>&1 || echo "DESCOBRIDOR AUSENTE"
```

## A leva não é o `cwd` — é o que ela mexeu

O bloco acima lista os repositórios **desta sessão**. A leva é o conjunto do que ela
tocou, não o repo do `cwd`: fechar só este deixaria a mudança feita em outro repositório
(o de skills, um script do harness) sem commit e sem nota.

Duas fontes alimentam a lista, e a marca em cada linha diz qual foi:

- **`sessao`** — o transcript registrou a sessão escrevendo ali. É a fonte que
  sabe o que ESTA leva tocou, inclusive fora do `cwd`.
- **`varredura`** — repo com mudança pendente sob o `cwd` (até 2 níveis). Ela
  entra como alvo **só** quando é o repo que contém o `cwd`; os outros vão para
  `NAO INCLUIDOS` — numa pasta-pai a varredura acha dezenas de repos sujos de trabalho
  antigo, e tratá-los como leva seria um `git add -A` em cada um.

**Processe TODOS os listados em `REPOSITORIOS DA LEVA`**, um por vez, na ordem em
que aparecem. Não eleja "o principal": a leva é o conjunto. Repo marcado
`NADA A COMMITAR (so o vault)` já foi commitado e empurrado antes — pule direto
ao passo 5, que é o que faltava.

**`NAO INCLUIDOS` é lista de leitura, não de trabalho.** São repositórios sujos
que esta sessão não tocou. Não estagie, não commite, não empurre nenhum deles —
nem "de passagem", nem porque a mudança parece relacionada. Eles existem no
relatório para o usuário saber que estão lá, e só entram se ele mandar por
escrito, nesta conversa.

Nada em `REPOSITORIOS DA LEVA` → **pare** e diga isso. `DESCOBRIDOR AUSENTE` (a
máquina não tem o `scripts/repos-da-leva.js` da skill) → caia no modo antigo, com
`git rev-parse --show-toplevel` a partir do `cwd`, feche só esse repo e avise no
relatório que a descoberta não rodou.

O **vault** (`obsidian/projetos`) nunca entra na lista de commit: a skill
`obsidian-docs` já o commita e empurra sozinha, e é a única exceção da regra
dura de git.

## Antes de tudo: quando parar

Confira por repositório, nesta ordem. Qualquer um destes **pula aquele
repositório** — reporte o que encontrou e siga para o próximo; um repo travado
não cancela os outros. Nunca `pull --rebase` para resolver, nunca `--no-verify`,
nunca inicializar repositório.

| Situação | Como detectar |
|---|---|
| `HEAD` destacado | branch = `HEAD` |
| Repositório sem nenhum commit | a linha traz `SEM NENHUM COMMIT` — não há estilo a inferir |
| Merge ou rebase em andamento | `.git/MERGE_HEAD`, `.git/rebase-merge` ou `.git/rebase-apply` existe |
| Sem remoto | a linha traz `(sem remoto)` — o commit local fica feito, e diga isso |
| Submódulo sujo | `git -C <raiz> submodule status` com `+` — o super-repo gravaria um ponteiro que o push não leva |
| Segredo no que seria commitado | veja o passo 1 |

Só uma coisa para o comando inteiro: a lista vazia.

## Working tree limpo não para o comando

`0 pendente(s)` quer dizer só uma coisa: não há o que commitar naquele repo.
**Nunca** force um commit vazio. Mas `/cpv` fecha a **leva**, e commit é meio, não
fim — a leva pode ter sido commitada minutos antes, por você, por outra sessão ou
por um `/cpv` que parou no meio. Parar aí deixa o trabalho fechado no git e
invisível no vault, que é justamente o que o passo 5 existe para impedir.

Por isso o descobridor mantém na lista o repo limpo que **a sessão tocou**, e só
esse: limpo, em dia e sem marca `sessao` ele nem aparece.

Repo limpo, então:

1. Pule os passos 1 a 3 — não há o que estagiar nem mensagem a escrever.
2. `ahead` maior que zero (ou `git status` dizendo *ahead*) → dê o push. É o passo
   4 valendo por si: o pedido expresso cobre empurrar a leva, não só criá-la.
3. Vá para o passo 5. Diga no relatório que o commit já existia, com o hash — o
   usuário precisa saber que a leva registrada não nasceu deste comando.

## Passos (repita para cada repositório da lista)

Todo comando de git leva `-C <raiz do repo>`: o `cwd` da sessão pode não estar
dentro dele — e, na leva que motivou este comando, não estava em nenhum.

### 1. Segredos

Antes de estagiar qualquer coisa, procure no que vai entrar (arquivos novos e
modificados) por:

- nome de arquivo: `.env`, `.env.*`, `id_rsa`, `*.pem`, `*.pfx`, `*.keystore`,
  `credentials.json`, `secrets.*`, `config.json` de projeto que o guarde
- conteúdo: `-----BEGIN * PRIVATE KEY`, `AKIA[0-9A-Z]{16}`, `ghp_`, `github_pat_`,
  `sk-ant-`, `xox[baprs]-`, e atribuições de `password`/`senha`/`api_key`/`token`
  com valor literal não vazio

Achou → **pule o repositório** e mostre arquivo e linha. Um `.env` empurrado não
se desfaz com um commit a mais.

Assuma que não há segunda barreira: os guards do harness podem não estar instalados
nesta máquina e o modo pode ser `bypassPermissions`.

### 2. Estagiar

`git -C <raiz> add -A`. O comando fecha a leva inteira: um index já preparado é
absorvido, e arquivo novo entra — `git commit -a` deixaria untracked de fora em
silêncio.

Antes disso, olhe a lista de pendentes daquele repo no Contexto. Arquivo que
**não é da leva** (sujeira anterior, mudança de outro assunto) → não invente:
mostre ao usuário e pergunte antes de estagiar. `add -A` é do repositório
inteiro, e a lista é a única chance de ver isso antes.

### 3. A mensagem

Leia `git -C <raiz> log --format='%s' -20` e escreva **no estilo daquele
repositório** — idioma, prefixo convencional (ou a falta dele), tamanho, tom.
Repositórios diferentes têm estilos diferentes, e cada mensagem segue o do seu.
Não imponha um padrão que o repo não usa.

Regras que não dependem do repo:

- Assunto no imperativo, uma linha, sem ponto final.
- Corpo só quando explica algo que o diff não mostra (o porquê, a armadilha
  evitada, o que foi tentado antes).
- **Zero trailers.** Nada de `Co-Authored-By`, `Generated with`, menção a
  Claude/Anthropic/assistente. A autoria é só do usuário — não passe `--author`,
  deixe o git usar a config dele.

### 4. Commit e push

```bash
git -C <raiz> commit -m "<mensagem>"
git -C <raiz> push            # sem upstream: git -C <raiz> push -u origin <branch>
```

Hook de pre-commit falhou → **pule o repositório** e mostre a saída dele. Push
rejeitado (non-fast-forward) → **pule**: o commit está feito, e como integrar é
decisão do usuário.

### 5. O vault

Pule este passo se o argumento for `sem-vault`.

Invoque a skill **`obsidian-docs`** e registre a leva em `Evolucoes/`. Duas coisas
são dela, não suas:

- **Qual é o projeto no vault.** Hub existente ganha; projeto nunca é duplicado;
  em dúvida, pergunte. Não deduza pelo nome da pasta — repo `pagamentos-repo`
  pertence ao hub `pagamentos` que já existe. Confira pelo MCP `vault-docs`:
  `ler_nota <projeto>` acha o hub; não achou → `visao_geral` lista os que existem.
  Nunca `Read`/`Grep` direto no vault para consultar.
- **O fluxo de escrita.** A skill grava com `salvar_nota` (ou `atualizar_nota`)
  do MCP `vault-docs`, que já faz frontmatter, pasta por tipo, entrada no hub e o
  `commit → pull --rebase → push` do vault — a única exceção da regra de git,
  restrita ao vault e executada pelo servidor, nunca por você. Passe `arquivos`
  com a lista de pendentes daquele repo (a mesma do Contexto): o servidor anexa
  "Componentes tocados" a partir do grafo do graphify, quando o projeto tem um.

**Uma nota por leva e por projeto.** Dois repositórios na mesma leva são dois
projetos no vault e duas notas — cada uma no hub do seu projeto, e uma linkando a
outra quando a mudança de um explica a do outro. Se os arquivos tocados e o tema
forem os mesmos da nota mais recente de `Evolucoes/` daquele projeto
(`listar_notas projeto=<projeto> tipo=evolucao limite=1`, depois `ler_nota`), atualize
aquela nota in-place, mantendo o nome e a data originais do arquivo (eles marcam
quando a leva começou). Assunto diferente → nota nova. O `git log` já é o log de
commits; o vault é a memória do projeto.

Já escreveu a nota desta leva antes do `/cpv` (é comum: a skill `obsidian-docs`
roda ao fechar o trabalho)? Não crie outra — confira que ela está no hub
(`ler_nota <projeto>`) e diga no relatório que já existia, com o caminho.

### 6. Relatório

Três linhas **por repositório**:

- o que foi commitado (hash curto e assunto), ou o commit que **já existia**
- push: para onde, ou por que não
- vault: nota criada, atualizada ou já existente, com o caminho — ou "pulado"

A linha de fechamento **só existe quando tem conteúdo**: algum repositório
**pulado** (bateu numa condição de parada) ou `NAO INCLUIDOS` não vazio. Nesse
caso ela é obrigatória, com o motivo e a contagem — repo que a descoberta viu e o
comando não fechou tem que aparecer, porque silêncio sobre ele lê como "não havia
mais nada", e é assim que uma mudança fica esquecida no working tree por dias.

Nada pulado e `NAO INCLUIDOS` vazio → **não escreva a linha**. "Nenhum pulado,
nenhum não incluído" não informa nada: é o caso normal, e o usuário já lê isso na
ausência da linha. O vault também nunca entra nela — ele é ignorado por definição,
não por acidente desta leva.
