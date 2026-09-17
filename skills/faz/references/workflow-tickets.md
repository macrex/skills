# Esqueleto do Workflow de implementação

Este esqueleto vale quando a terceira parada do `/faz` escolheu **workflow**; o
`PREAMBULO` abaixo é o dos três modos. Quem invoca `/mattpocock-skills:implement`
é o `/faz`, uma vez, antes de montar o workflow; este esqueleto é como o que ela
manda é cumprido, e os agentes por ticket não a invocam de novo — o preâmbulo já
carrega o que ela pede, e o portão é quem cobra.

Um agente por ticket, **em cadeia**: os tickets de uma leva quase sempre tocam
os mesmos arquivos (o módulo central, o ponto de entrada, o esquema), e dois
agentes na mesma working tree se sobrescrevem. O ganho do Workflow aqui é
contexto fresco por ticket, sequência determinística, portão de verificação e
retomada — não paralelismo.

Duas armadilhas já pagas:

- **Portão compara booleano, nunca prosa.** `r.typecheck !== 'limpo'` parou uma
  cadeia inteira no primeiro ticket, que estava verde, porque o agente respondeu
  `"limpo (TYPECHECK_EXIT=0)"`. Peça `testsPass` e `checksPass` como `boolean` no
  schema e decida só por eles.
- **As notas de cada ticket alimentam o próximo.** Sem isso o agente seguinte
  refaz ou conflita com o que já existe.

Três coisas você preenche antes de rodar, e todas saem do projeto, não daqui:
onde os tickets estão (o tracker que o `/faz` já escolheu), **os comandos de
verificação do projeto** (a suíte, e o que mais o repositório oferece — tipos,
lint, build; um projeto que só tem teste tem só teste), e uma dica por ticket
que economize exploração ao agente.

```js
export const meta = {
  name: 'leva-tickets',
  description: 'Implementa os tickets da spec em cadeia, com portao e reparo',
  phases: [{ title: 'Implementacao' }, { title: 'Reparo' }],
}

const TICKETS = [
  { n: '01', ticket: '<identificador do ticket no tracker>', dica: '...' },
]

// Os comandos reais do projeto, um por linha. Se o repositorio nao tem um
// verificador alem do teste, esta lista tem uma linha so.
const VERIFICACAO = ['<comando de teste>', '<comando de tipos/lint/build>']

const PREAMBULO = [
  'Voce implementa UM ticket. Leia-o no tracker, e leia a spec que ele referencia, antes de tocar no codigo.',
  'Nao faca git add/commit/push. Cirurgico: toda linha alterada rastreia ate o ticket.',
  'Teste antes, nos seams que a spec acordou. Servico externo e dublado, nunca chamado de verdade.',
  `Portao obrigatorio antes de responder: ${VERIFICACAO.join(' && ')}. So responda depois de ver a saida verde.`,
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: {
    ticket: { type: 'string' },
    done: { type: 'boolean' },
    testsPass: { type: 'boolean' },
    checksPass: { type: 'boolean', description: 'os demais verificadores do projeto passaram; true tambem quando nao ha nenhum' },
    tests: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', description: 'assinaturas criadas, decisoes e armadilhas — o proximo agente le isto' },
    blockers: { type: 'string' },
  },
  required: ['ticket', 'done', 'testsPass', 'checksPass', 'tests', 'files', 'notes', 'blockers'],
}

const verde = (r) => r && r.done && r.testsPass && r.checksPass

function prompt(t, anteriores) {
  const historico = anteriores.map((a) => `Ticket ${a.ticket} — ${a.notes}\nArquivos: ${a.files.join(', ')}`).join('\n\n')
  return `${PREAMBULO}\n\nSEU TICKET: "${t.ticket}".\nDICA: ${t.dica}\n\nJA ENTREGUE PELOS ANTERIORES:\n${historico || '(nenhum)'}`
}

phase('Implementacao')
const entregues = []
for (const t of TICKETS) {
  let r = await agent(prompt(t, entregues), { label: `ticket ${t.n}`, phase: 'Implementacao', schema: SCHEMA })
  for (let i = 1; !verde(r) && i <= 2; i++) {
    log(`Ticket ${t.n} vermelho — reparo ${i}/2`)
    r = await agent(`${PREAMBULO}\n\nSEU TICKET: "${t.ticket}". Uma tentativa anterior nao fechou o portao:\n${JSON.stringify(r, null, 2)}\nInspecione a working tree, conserte e conclua.`,
      { label: `reparo ${t.n} (${i})`, phase: 'Reparo', schema: SCHEMA })
  }
  if (!verde(r)) return { entregues, parou: { ticket: t.n, estado: r } }
  entregues.push(r)
  log(`Ticket ${t.n} fechado — ${r.tests}`)
}
return { entregues, parou: null }
```

O `<modelo>` da linha entra em `model` de cada `agent()`; o da sessão é `model`
omitido.

Cadeia interrompida com o trabalho já verde na árvore? Rode a verificação você
mesmo, semeie `entregues` com as notas do ticket fechado e relance a partir do
próximo — mais barato que reexecutar o que já está certo.
