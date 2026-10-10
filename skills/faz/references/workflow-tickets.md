# Esqueleto do Workflow de implementação

Vale quando a terceira parada do `/faz` escolheu **workflow**; o `PREAMBULO` abaixo é o dos
três modos. O `/faz` já invocou a `implement`; os agentes por ticket não a invocam de novo — o
preâmbulo carrega o que ela pede, e o portão é quem cobra.

Um agente por ticket, **em cadeia**: os tickets de uma leva quase sempre tocam os mesmos
arquivos, e dois agentes na mesma working tree se sobrescrevem.

Três coisas você preenche antes de rodar, e todas saem do projeto, não daqui: onde os tickets
estão (o tracker que o `/faz` já escolheu), **os comandos de verificação do projeto** (a suíte,
e o que mais o repositório oferece — tipos, lint, build), e uma dica por ticket que economize
exploração ao agente. Ao adaptá-lo, o portão segue decidindo só por `testsPass` e `checksPass`
(comparar prosa já parou uma cadeia verde), e as `notes` de cada ticket seguem alimentando o
próximo.

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

O modelo do implement escolhido na terceira parada entra em `model` de cada
`agent()`; o da sessão é `model` omitido.

Cadeia interrompida com o trabalho já verde na árvore? Rode a verificação você mesmo, semeie
`entregues` com as notas do ticket fechado e relance a partir do próximo.
