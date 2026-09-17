# Movimento 2 do /faz: a leva, disparada pela linha

Você está na sessão nova, e chegou aqui pela linha de `/goal` que o movimento 1
entregou: ela cita este arquivo, o documento do entendimento e as quatro skills
do [Matt Pocock](https://github.com/mattpocock/skills) que esta leva encadeia. É
a linha que autoriza as três reservadas ao usuário — `to-spec`, `to-tickets` e
`implement` —, porque é ele quem as nomeia; o `code-review` você invoca sozinho.
Nesta sessão para-se **uma vez**, com os tickets na mesa, para o usuário escolher
como a implementação roda; nada mais é perguntado — o conteúdo já foi confirmado
no interrogatório. Antes de tudo, `git status --porcelain`: o que já estiver sujo
não é da leva, e a revisão o exclui.

## Onde as notas vivem

O tracker é o do projeto, e é onde o documento citado na linha está: a spec é
escrita uma vez e cresce no mesmo lugar — o entendimento a inaugurou no
movimento 1, `to-spec` a expande in-place, os tickets a referenciam, o fechamento
fica ao lado dela. Esta seção é a configuração de tracker que `to-spec`,
`to-tickets` e `code-review` esperam ter recebido: `docs/agents/issue-tracker.md`
ausente não pede o `/setup-matt-pocock-skills`.

- Documento no vault Obsidian (MCP `vault-docs` na sessão) → pela
  `/obsidian-docs`: a spec com `atualizar_nota`; os tickets, um por nota, com
  `salvar_nota tipo=plano artefato=<nota da spec>`; o fechamento com
  `salvar_nota tipo=evolucao`.
- Documento em arquivo → o tracker que `/setup-matt-pocock-skills` configurou
  ou, sem ele, os arquivos locais que `to-spec` e `to-tickets` já escrevem por
  padrão (`.scratch/<feature>/`), ao lado do documento.

## Os passos, e o que cada um produz

| Passo | Faz | Produz |
|---|---|---|
| to-spec | `/mattpocock-skills:to-spec <documento>`, expandindo o documento in-place; os seams vão na spec, mostrados, não perguntados | a spec com histórias, decisões de implementação e de teste, seams |
| to-tickets | `/mattpocock-skills:to-tickets <spec>`; a tabela é mostrada, não perguntada | um ticket por fatia vertical |
| implement | `/mattpocock-skills:implement`, cumprida **no modo que o usuário escolher na terceira parada** (logo abaixo). Ela manda commitar; aqui a leva fica na working tree | código, suíte verde por ticket |
| code-review | `/mattpocock-skills:code-review`. A leva inteira está na working tree e não há commit, então o que ela ancora em `<fixo>...HEAD` é vazio por desenho: o diff é `git diff HEAD` mais os arquivos de `git ls-files --others --exclude-standard`, lidos inteiros, menos o que já estava sujo antes da leva; a lista de commits é vazia, e a checagem de diff não-vazio se faz sobre esses dois. Passe a spec como argumento (o conteúdo, via `ler_nota`, quando está no vault). Os dois sub-agentes que ela manda abrir (Standards e Spec) são `Agent` que você mesmo dispara | dois relatórios, lado a lado |
| correções | sem skill: um `Agent` recebe os dois relatórios e aplica tudo; achado que se revela errado é recusado com o motivo | working tree corrigida, suíte verde |
| qualidade | sem skill: os verificadores do projeto; depois um script no scratchpad sobe o que der para subir (a skill `run` ajuda) e exercita os caminhos reais | contagem de verificações; falha causada pelo script conserta o script e reexecuta |
| fechamento | nota de evolução no tracker | o que mudou, o que a revisão pegou, o que não foi verificado |

## A terceira parada: o modo do implement

Com a tabela de tickets na mesa — e só aí, porque nada disso é legível antes —
pare. **O critério da sua recomendação é a qualidade do que sai da leva, nunca o
que custa menos a você.** O inline é o mais rápido e o mais barato dos três, e é
exatamente o modo em que quem escreveu o código é quem declara que ele está
verde: recomendá-lo porque sai barato é recomendar contra o usuário.

**O que cada modo faz pela qualidade, e o que cobra dela:**

| Modo | Sustenta a qualidade por | Cobra dela |
|---|---|---|
| inline | continuidade: você leu a spec, os tickets e as decisões inteiros, não um resumo deles, e enxerga o conflito entre dois tickets antes de ele acontecer | seu contexto acumula tudo — leitura, saída de teste, tentativa morta — e a atenção dilui: o fim da leva sai pior que o começo |
| sub-agents | atenção cheia por ticket: cada agente chega limpo e carrega só o que aquele ticket pede; entre um e outro você lê o resultado e corrige o rumo | o repasse é lossy — o próximo só sabe o que as notas contaram — e quem julga se fechou é você, lendo prosa |
| workflow | o portão é **mecânico**: quem decide se o ticket fechou é um booleano do schema avaliado pelo script, não o agente que escreveu o código; o reparo é estruturado e o registro por ticket fica auditável | rampa fria por ticket, o mesmo repasse lossy, e nenhum humano entre um ticket e o seguinte |

**Os parâmetros, que você lê dos tickets e do repositório:**

| Parâmetro | Onde está | Puxa para |
|---|---|---|
| Risco da mudança | o ticket: migração, dinheiro, autenticação, dado que não volta, contrato público | workflow — o portão mecânico é o que impede o "quase verde" passar |
| Força da verificação | o repositório: existe suíte, tipos, lint que reprovem de verdade? | portão forte → workflow ou sub-agents convertem isso em garantia; portão fraco → inline, porque aí quem pega o erro é o humano olhando |
| Acoplamento entre tickets | a tabela: quantos tocam os mesmos arquivos e dependem de decisão anterior | alto → inline, que a continuidade evita o conflito que o repasse não conta; baixo → sub-agents ou workflow |
| Profundidade por ticket | o ticket: pede exploração própria do código, ou a spec já diz onde mexer | fundo → uma janela inteira por ticket; raso → inline |
| Volume contra contexto | a soma dos tickets contra o que cabe numa sessão | não cabe → sai do inline: a queda de qualidade no fim da leva é certa |
| Auditoria | o usuário precisa mostrar o que cada ticket fez? | workflow — o registro por ticket já sai estruturado |

Os parâmetros brigam entre si, e é esse o julgamento: risco alto com suíte fraca
não vira workflow, vira inline com o humano vendo, porque portão que não reprova
não garante nada. Escolha um modo e diga **em uma linha qual parâmetro decidiu**.

Pergunte com `AskUserQuestion`: os três, o seu marcado, e a linha do parâmetro
que decidiu. Diga que o `<modelo>` da linha vale para os agentes de sub-agents e
de workflow — no inline quem executa é a sessão. Se o usuário trocar, é decisão
dele: nomeie a garantia de que ele está abrindo mão, uma linha, e siga sem
reabrir.

**O que cada modo cumpre igual.** O preâmbulo — o `PREAMBULO` de
`workflow-tickets.md`, ao lado deste arquivo: TDD nos seams acordados,
verificação frequente, a suíte inteira no fim, nada de commit —, o portão
booleano e as notas que passam de um ticket ao seguinte são os mesmos nos três;
muda quem os executa:

- **inline**: você, ticket a ticket, na ordem. O portão roda antes de passar ao
  próximo; dois vermelhos param a leva no mesmo ponto em que parariam a cadeia.
- **sub-agents**: um `Agent` por ticket, disparados **um de cada vez** — nunca em
  paralelo, é a mesma working tree. O prompt de cada um é o preâmbulo mais as
  notas dos anteriores, e o portão é você lendo o que ele devolve.
- **workflow**: o esqueleto de `workflow-tickets.md`, sem mudanças.

## Quando algo trava

- Ticket vermelho depois dos dois reparos **para a cadeia** — os seguintes
  dependem dele. Rode a verificação você mesmo, conserte o que for do portão ou
  do código, e retome do próximo (fim de `workflow-tickets.md`) — **uma vez**.
  Vermelho de novo: o implement para ali, os passos seguintes rodam sobre os
  tickets que fecharam, e o relatório diz qual ficou.
- Passo bloqueado por causa externa (túnel, credencial, rede) é relatado com o
  motivo; os seguintes continuam sobre o que está pronto.
- Verificado é o que você viu na saída. O relatório final separa o que foi
  exercitado do que não foi (a interface que ninguém abriu no navegador).
