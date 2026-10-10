# /faz <pedido> — o interrogatório, que começa no comando

## Confira as seis em disco

Confira pelo localizador: a sua lista de skills esconde as reservadas
(`disable-model-invocation`), mesmo instaladas.

```bash
node "<pasta desta skill>/scripts/skills-do-matt.js"
```

Saiu 1: faltam as marcadas `FALTA`. Nomeie-as, dê o comando de instalação do seu harness
("Skills do Matt" na referência do seu harness) e **pare aqui**.

## Confira o repositório

```bash
git rev-parse --verify -q HEAD
```

Falhou (fora do git ou sem commit)? Siga com o interrogatório, mas diga isso ao usuário agora e
repita no aviso da linha: a revisão da leva compara contra `HEAD`, que ainda não existe, e fora
do git o `/cpv` não tem o que fechar. `git init` e o commit inicial são dele, antes de colar a
linha — nunca seus.

## Interrogue

Invoque `grilling` e `domain-modeling` **na mesma leva de chamadas, antes da primeira pergunta**,
e no Claude Code registre nela também o marco `grill` no painel da leva: ferramenta
`mcp__macrex-skills__faz_marco` (listada só pelo nome, carregue-a antes pelo `ToolSearch`), com o
`pedido` em poucas palavras (até 60 caracteres). As duas skills são o `/grill-with-docs`
(reservado ao usuário) montado com as duas peças, e o resultado tem de ser indistinguível dele.
Elas conduzem, não perguntas suas: o `grilling`, as rodadas; o `domain-modeling`, o vocabulário
dentro delas. As perguntas do `AskUserQuestion` entram no painel pelo `header`, que nomeia o tema
(nunca `Q1`). No mesmo painel, depois: `entendimento` com o `documento`, quando ele estiver
gravado. A linha da leva o painel pega sozinho do localizador.

Fronteira vazia, consolide o entendimento numa tabela e peça o **sim do usuário** — a única
confirmação de conteúdo da leva inteira.

## Grave o entendimento

Dado o sim, o entendimento vira **um documento**: a leva roda noutra sessão, sem este histórico,
e o que não estiver escrito não chega lá. Ele nasce onde as notas do projeto vivem, e é ele que o
`to-spec` expande in-place depois:

- MCP `vault-docs` na sessão → vault Obsidian pela `/obsidian-docs`, `salvar_nota tipo=spec`.
- Sem ele → o tracker que `/setup-matt-pocock-skills` configurou. Sem nenhum, os arquivos locais
  que `to-spec` e `to-tickets` já escrevem por padrão (`.scratch/<feature>/`).

O documento leva o pedido original, o vocabulário canônico do `domain-modeling`, a tabela de
decisões inteira do interrogatório e os fatos do código que as sustentam (caminho e linha).
Guarde como ele é endereçável (título da nota ou caminho do arquivo): a linha cita isso.

## Entregue a linha

Os modelos dos agentes não se perguntam aqui: a leva os pergunta na terceira parada, junto com o
modo do implement, quando os tickets já estão na mesa. Imprima o aviso e a linha para o usuário
colar, e pare: parar é ter entregado a linha. A linha sai **pronta do localizador**: rode-o com o
documento, imprima a saída num bloco de código exatamente como saiu, sem reescrever nem juntar
linhas.

```bash
node "<pasta desta skill>/scripts/skills-do-matt.js" --linha "<documento>"
```

`<documento>` é como a nota é endereçável. Fora do Claude Code a primeira linha sai com
`<abertura>`: troque só essa palavra pela abertura do seu harness ("Segurar a sessão" na
referência dele, que também diz o que o aviso acrescenta quando falta o pré-requisito). A linha
nomeia as skills como o localizador as acha, cada nome abrindo uma linha ("Autorização" na
referência do seu harness): é ela que autoriza as três reservadas, e um nome trocado ou partido
não autoriza. O pedido original não vai na linha: já está no documento.

> Cole numa **sessão nova** (`/clear` ou outra janela), neste mesmo workspace. O entendimento
> está todo no documento, e a leva é longa: começar com o contexto limpo é o que dá desempenho a
> ela.
