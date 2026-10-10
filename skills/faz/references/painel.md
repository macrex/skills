# Os marcos da leva no painel (Claude Code)

Cada marco é uma chamada de `mcp__macrex-skills__faz_marco`:

- `inicio`, logo depois das três reservadas, com o `documento` da linha (o que vem entre `leva` e `até o fim`, sem eles) e os `sujos` (os caminhos
  do `git status --porcelain` de antes da leva); a leva já entra na fase `spec`.
- `fase` ao entrar em cada fase seguinte (`tickets`, `implement`, `revisao`, `correcoes`,
  `qualidade`), a de `implement` com o `modo` que o usuário escolheu.
- `tickets` com a lista `{ id, titulo }` assim que o `to-tickets` publicar e de novo, inteira e com
  os novos no fim, quando a leva ganhar tickets (os que já andaram guardam o portão e o tempo; nunca
  reenvie o `portao` deles); `ticket` com o `id`
  dele ao começar cada um; `portao` com o `ticket`, `verde` ou `vermelho`, os `reparos` (0 a 2) e
  os `testes` (ex. `3/4`, até 20 caracteres) quando o executor os informou, e as `notas` do que
  ele entregou (até 500 caracteres). No modo workflow a sessão não vê cada ticket começar: quando a notificação do
  fim do workflow chegar, registre `ticket` e `portao` de cada um pelo relatório dele.
- `item` em cada passo da revisão, das correções e da qualidade: um por eixo da revisão
  (`Standards`, `Spec`) ao abrir o sub-agente e de novo, com `portao` e o número de achados em
  `detalhe`, quando o relatório chegar; nas correções, `Achados da revisão`, com a contagem de
  aplicadas e recusadas; na qualidade, um por verificador, nomeado por ele (`Testes`, `Build`,
  `Download real`), com a contagem em `detalhe` (até 60 caracteres). O nome do item nunca é o da
  fase, que já é o título do cartão.
- `fechamento` no fim.

**Retomada:** resposta do `inicio` que começa com `retomada na fase` traz a leva aberta do mesmo
documento. Diga ao usuário em uma linha de onde retomou, pule as fases já passadas, comece o
implement do primeiro ticket que não está verde (as notas dos verdes semeiam `entregues`, no fim
de `workflow-tickets.md`) e use no `code-review` os sujos gravados. Os modelos não ficam no
estado da leva: com implement ou revisão pela frente, pergunte-os de novo como na terceira parada
(`leva.md`), o do implement só se ele roda em sub-agents ou workflow.

**Conferência das skills:** resposta terminada em `sem /<skill> invocada` quer dizer que esta
sessão entrou na fase sem ter invocado a skill dela. O `code-review` você invoca na hora; uma
reservada só se invoca no turno da linha, então diga ao usuário qual faltou e peça que cole o nome
dela de novo.
