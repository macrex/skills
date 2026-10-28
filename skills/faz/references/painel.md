# Os marcos da leva no painel (Claude Code)

Cada marco é uma chamada de `mcp__macrex-skills__faz_marco`:

- `inicio`, logo depois das três reservadas, com o `documento` da linha (o que vem depois de `leva` na abertura, sem o `até o fim` dos prompts antigos) e os `sujos` (os caminhos
  do `git status --porcelain` de antes da leva); a leva já entra na fase `spec`.
- `fase` ao entrar em cada fase seguinte (`tickets`, `implement`, `revisao`, `correcoes`,
  `qualidade`, `fechamento`), a de `implement` com o `modo` (o da seção `## Execução` do documento,
  `leva.md`) e o `branch` da leva (`leva/<slug>`), que o estado da leva guarda para a retomada. O
  resultado da `fase` `tickets` traz a calibração do `time.md` da raiz, de onde a previsão parte, e
  a `fase` `fechamento`, antes do commit squash, grava a leva nele, para o `git add time.md`.
- `tickets` com a lista `{ id, titulo, perfil, onda }` e o `modo` da seção `## Execução` assim que
  o `to-tickets` publicar: o `perfil` de cada ticket (`texto`, `unidade`, `tela` ou `pesado`; "A
  previsão de tempo", em `leva.md`) e a `onda` dele. Com o `time.md`, o painel dá a previsão de
  cada ticket pela mediana do perfil no modo e a da leva pelas ondas, e o resultado traz as duas;
  a `previsao` de um ticket, em minutos inteiros do tempo da máquina, só vai com o `motivo`, o fato
  que o tira da mediana, ou volta recusada. Sem o `time.md`, mande a `previsao` de cada ticket e a
  da leva inteira. De novo, inteira e com os novos no fim, quando a leva ganhar tickets (os que já
  andaram guardam o portão, o tempo, a previsão, o perfil e a onda; nunca reenvie o `portao` deles); `ticket` com o `id`
  dele ao começar cada um; `portao` com o `ticket`, `verde` ou `vermelho`, os `reparos` (0 a 2) e
  os `testes` (ex. `3/4`, até 20 caracteres) quando o executor os informou, e as `notas` do que
  ele entregou (até 500 caracteres). Nos modos workflow e sub-agents quem marca `ticket` e
  `portao` são os agentes de cada ticket (as linhas de `marcos`, em `workflow-tickets.md`, vão no
  prompt deles), porque só eles veem a hora real do começo e do fim, e o painel soma ao ticket o
  custo dos turnos do agente que o marcou. Quando a notificação do fim chegar, a sessão
  só acerta o que diverge do retorno: `portao` vermelho para os `parados` e os `pendentes`, e
  `ticket` e `portao` para o fechado que nenhum agente marcou. O verde já marcado não se reenvia.
- `item` na conciliação de cada onda, na fase implement: `Conciliação <n>`, com o `<n>` da onda,
  ao começar e de novo, com `portao` e a contagem de tickets conciliados sobre os da onda em
  `detalhe` (ex. `3/3`), quando ela terminar. A conciliação que fica esperando o ticket seguinte (no
  modo sub-agents) manda o mesmo item com `espera: true` e `detalhe` `esperando <n>` antes de esperar,
  e de novo sem `espera` quando ele chega: o relógio do item para na espera, e o tempo dele é só o
  trabalhado.
- `item` em cada passo da revisão, das correções e da qualidade: um por eixo da revisão
  (`Standards`, `Spec`) ao abrir o sub-agente e de novo, com `portao` e o número de achados em
  `detalhe`, quando o relatório chegar; nas correções, `Achados da revisão`, com a contagem de
  aplicadas e recusadas; na qualidade, um por verificador, nomeado por ele (`Testes`, `Build`,
  `Download real`), com a contagem em `detalhe` (até 60 caracteres). O nome do item nunca é o da
  fase, que já é o título do cartão.
- `fechamento` no fim, depois do commit squash: o hook `so_com_pedido` só libera esse commit com
  a leva aberta, e o `fechamento` a fecha. O resultado traz a tabela dos tempos, previsto contra
  o real da máquina (a espera pelo usuário numa linha à parte), que vai à seção `## Tempos` da nota
  de evolução como veio. O `time.md` a `fase` `fechamento` já gravou; sem ela, o `fechamento` o
  grava, e ele fica na working tree até o próximo commit.

**Retomada:** resposta do `inicio` que começa com `retomada na fase` traz a leva aberta do mesmo
documento. Diga ao usuário em uma linha de onde retomou, pule as fases já passadas, comece o
implement do primeiro ticket que não está verde, da ponta do `branch` da leva que a resposta
devolve (as notas dos verdes semeiam `entregues`, no fim de `workflow-tickets.md`), e use no
`code-review` os sujos gravados. Os modelos não ficam no estado da leva: com implement ou revisão
pela frente, leia-os de novo na seção `## Execução` do documento (`leva.md`).

**Conferência das skills:** resposta terminada em `sem /<skill> invocada` quer dizer que esta
sessão entrou na fase sem ter invocado a skill dela. O `code-review` você invoca na hora; uma
reservada só se invoca no turno da linha, então diga ao usuário qual faltou e peça que cole o nome
dela de novo.
