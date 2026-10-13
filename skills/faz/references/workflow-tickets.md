# Esqueleto do Workflow de implementação

Vale quando a terceira parada do `/faz` escolheu **workflow**; o `PREAMBULO` abaixo é o dos
três modos. O `/faz` já invocou a `implement`; os agentes por ticket não a invocam de novo — o
preâmbulo carrega o que ela pede, e o portão é quem cobra.

Um agente por ticket, **em ondas**: cada onda reúne os tickets cujos bloqueadores já fecharam e
entraram na working tree principal. Com `WORKTREES`, os tickets de uma onda rodam juntos, **cada
um na sua worktree** (`isolation: 'worktree'`), porque dois agentes na mesma working tree se
sobrescrevem; é aí que o workflow ganha dos outros modos. A worktree nasce do `HEAD` e não tem o
que a leva já entregou: o agente copia nela o estado da working tree principal, guarda essa base
só no índice da worktree e devolve o patch do que mudou sobre ela. Os dois reparos rodam na
mesma worktree; vermelho depois deles, a worktree é descartada e param ele e os que ele
bloqueia. Depois de cada onda, um agente de integração verifica a working tree principal e
aplica nela os patches um a um, sem commit, com a verificação inteira depois de cada um: o patch
que não aplica, ou que a deixa vermelha, é desfeito com `git apply -R` e o ticket volta na onda
seguinte, sobre a base que já tem o vizinho; no segundo conflito, ele para. Assim a principal
nunca fica vermelha, e os independentes seguem de verdade. Sem `WORKTREES`, cada onda roda em
cadeia direto na working tree principal, e o vermelho depois dos reparos para o workflow
inteiro: a principal suja não deixa os seguintes partirem limpos.

Cinco coisas você preenche antes de rodar, e todas saem do projeto, não daqui: onde os tickets
estão (o tracker que o `/faz` já escolheu), o `bloqueadoPor` de cada um (a coluna dos bloqueios
da tabela do `to-tickets`), **os comandos de verificação do projeto** (a suíte, e o que mais o
repositório oferece — tipos, lint, build), a `RAIZ` e a pasta dos `PATCHES` (o scratchpad da
sessão), e uma dica por ticket que economize exploração ao agente. `WORKTREES` é `false` quando
o projeto não tem git ou não tem commit (a worktree nasce de um). Ao adaptá-lo, o portão segue
decidindo só por `testsPass` e `checksPass` (comparar prosa já parou uma cadeia verde), e as
`notes` de cada ticket seguem alimentando os seguintes.

```js
export const meta = {
  name: 'leva-tickets',
  description: 'Implementa os tickets da spec em ondas, um por worktree, com portao, integracao e reparo',
  phases: [{ title: 'Implementacao' }, { title: 'Integracao' }, { title: 'Reparo' }],
}

// n: o id que o marco tickets deu ao ticket no painel; bloqueadoPor: os n dos tickets que a tabela
// do to-tickets poe antes deste
const TICKETS = [
  { n: '01', ticket: '<identificador do ticket no tracker>', dica: '...', bloqueadoPor: [] },
]

// Os comandos reais do projeto, um por linha. Se o repositorio nao tem um
// verificador alem do teste, esta lista tem uma linha so.
const VERIFICACAO = ['<comando de teste>', '<comando de tipos/lint/build>']

// a working tree principal, a pasta onde cada worktree grava o patch dela, e false sem git ou
// sem commit: a worktree nasce do HEAD
const RAIZ = '<caminho absoluto do repositorio>'
const PATCHES = '<scratchpad da sessao>'
const WORKTREES = true

const GIT = 'Nao faca git commit nem push; na working tree principal, tambem nao faca git add, stash, checkout nem reset.'

const PREAMBULO = [
  'Voce implementa UM ticket. Leia-o no tracker, e leia a spec que ele referencia, antes de tocar no codigo.',
  `${GIT} Cirurgico: toda linha alterada rastreia ate o ticket.`,
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
    notes: { type: 'string', description: 'assinaturas criadas, decisoes e armadilhas — os seguintes leem isto' },
    blockers: { type: 'string' },
    worktree: { type: 'string', description: 'o caminho da worktree em que trabalhou; vazio na working tree principal' },
    patch: { type: 'string', description: 'o caminho do patch gravado em PATCHES; vazio na working tree principal' },
  },
  required: ['ticket', 'done', 'testsPass', 'checksPass', 'tests', 'files', 'notes', 'blockers', 'worktree', 'patch'],
}

const INTEGRACAO = {
  type: 'object',
  properties: {
    aplicados: { type: 'array', items: { type: 'string' }, description: 'os n dos tickets cujo patch ficou na principal, verde' },
    conflitos: { type: 'array', items: { type: 'string' }, description: 'os n dos tickets cujo patch nao aplicou ou deixou a principal vermelha, ja desfeito' },
    testsPass: { type: 'boolean', description: 'a ultima verificacao da principal' },
    checksPass: { type: 'boolean' },
    tests: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['aplicados', 'conflitos', 'testsPass', 'checksPass', 'tests', 'notes'],
}

const verde = (r) => r && r.done && r.testsPass && r.checksPass
const opcoes = (label, fase, isolado) => ({ label, phase: fase, schema: SCHEMA, ...(isolado && { isolation: 'worktree' }) })

const NA_PRINCIPAL = `Trabalhe direto na working tree principal, ${RAIZ}.`
// o patch e o que o ticket mudou sobre a base que esta no indice da worktree, novos inclusive
const gravarPatch = (t, w) => `No fim, \`git -C "${w}" ls-files -z --others --exclude-standard | xargs -0 -r git -C "${w}" add -N\` e \`git -C "${w}" diff --binary > "${PATCHES}/ticket-${t.n}.patch"\`; devolva esse caminho em patch e ${w} em worktree.`
// a worktree descartavel: a base e o estado da principal, so no indice dela
const naWorktree = (t) => [
  `Voce esta numa worktree descartavel, nao em ${RAIZ}; W abaixo e o caminho dela. Os comandos sao do bash (no Windows, o Git Bash da ferramenta Bash).`,
  `Antes de tudo, traga para W o estado da working tree principal: \`git -C "${RAIZ}" diff HEAD --binary > "${PATCHES}/base-${t.n}.patch"\` e \`git -C "W" apply --allow-empty "${PATCHES}/base-${t.n}.patch"\`;`,
  `depois copie de ${RAIZ} para o mesmo caminho em W cada arquivo que \`git -C "${RAIZ}" ls-files -z --others --exclude-standard\` lista (nomes separados por NUL);`,
  'e grave essa base so no indice de W com `git -C "W" add -A` (nunca um commit). Fora esse e o add -N do fim, nenhum git add: o que entra no indice sai do patch.',
  'Dependencia que o .gitignore deixa de fora (node_modules, venv) e que a verificacao pede: instale-a em W antes do portao.',
  `Implemente e passe o portao de dentro de W. ${gravarPatch(t, 'W')}`,
].join('\n')
const naMesmaWorktree = (t, w) => [
  `Trabalhe so em ${w}, a worktree da tentativa anterior, com a base ja no indice; nao toque em ${RAIZ}.`,
  `Os comandos sao do bash (no Windows, o Git Bash da ferramenta Bash): rode todo git com -C "${w}" e o portao de dentro dela, e nenhum git add alem do -N do fim.`,
  gravarPatch(t, w),
].join('\n')

// o painel da leva marca o tempo real do ticket so se o agente disser quando comecou e acabou:
// a sessao so ve o fim do workflow
const marcos = (t, reparos) => [
  `Painel da leva: carregue mcp__macrex-skills__faz_marco pelo ToolSearch e, como primeira acao, chame-a com { marco: 'ticket', ticket: '${t.n}' };`,
  `como ultima, antes de responder, com { marco: 'portao', ticket: '${t.n}', portao: 'verde' ou 'vermelho' (o seu portao), reparos: ${reparos}, testes, notas (ate 500 caracteres) }.`,
  'Ferramenta ausente ou recusada: siga sem ela.',
].join('\n')

function prompt(t, onde) {
  const historico = entregues.map((a) => `Ticket ${a.ticket} — ${a.notes}\nArquivos: ${a.files.join(', ')}`).join('\n\n')
  return `${PREAMBULO}\n${onde}\n${marcos(t, 0)}\n\nSEU TICKET: "${t.ticket}".\nDICA: ${t.dica}\n\nJA ENTREGUE PELOS ANTERIORES:\n${historico || '(nenhum)'}`
}

function integrar(onda, prontos, worktrees) {
  return [
    `Voce integra a onda ${onda} na working tree principal, ${RAIZ}, sem commit. ${GIT}`,
    `Primeiro rode nela: ${VERIFICACAO.join(' && ')}. Vermelha antes de qualquer patch: nao aplique nenhum, va direto a remocao das worktrees e devolva o resultado dessa verificacao.`,
    `Verde: aplique cada patch, nesta ordem, com \`git -C "${RAIZ}" apply --whitespace=nowarn <patch>\`, e rode a verificacao inteira depois de cada um.`,
    `O patch que nao aplica, ou que deixa a verificacao vermelha, vai em conflitos, sem forcar; o que aplicou e reprovou voce desfaz com \`git -C "${RAIZ}" apply -R <patch>\` antes do seguinte.`,
    prontos.map((f) => `- ticket ${f.t.n}: ${f.r.patch}`).join('\n') || '(nenhum)',
    `Por fim remova estas worktrees com \`git -C "${RAIZ}" worktree remove --force <caminho>\` e o branch que cada uma criou, que nao tem commit proprio:`,
    worktrees.join('\n') || '(nenhuma)',
  ].join('\n')
}

phase('Implementacao')
const entregues = []
const parados = []
const conflitos = {}
const fechado = (n) => entregues.some((r) => r.n === n)
const parado = (n) => parados.some((p) => p.n === n)
// o vermelho para ele e todo ticket que depende dele, direta ou indiretamente
function parar(n, motivo) {
  if (parado(n)) return
  parados.push({ n, motivo })
  TICKETS.filter((t) => t.bloqueadoPor.includes(n)).forEach((t) => parar(t.n, `depende de ${n}`))
}
function registrarVerde(t, r) {
  entregues.push({ ...r, n: t.n })
  log(`Ticket ${t.n} fechado — ${r.tests}`)
}
function pararVermelho(t, r) {
  parar(t.n, r ? `vermelho depois dos dois reparos: ${r.blockers}` : 'o agente nao devolveu resultado')
  log(`Ticket ${t.n} vermelho depois dos reparos: param ele e os que dependem dele (${parados.map((p) => p.n).join(', ')})`)
}
// o que nao fechou nem parou vai no retorno com o motivo, para a retomada
function fim(parou, motivo) {
  const pendentes = TICKETS.filter((t) => !fechado(t.n) && !parado(t.n)).map((t) => {
    const inexistentes = t.bloqueadoPor.filter((b) => !TICKETS.some((x) => x.n === b))
    const espera = t.bloqueadoPor.filter((b) => !fechado(b))
    return { n: t.n, motivo: motivo || (inexistentes.length ? `bloqueio inexistente: ${inexistentes.join(', ')}` : `espera ${espera.join(', ')}, que nunca fecha: ciclo em bloqueadoPor`) }
  })
  if (pendentes.length) log(`Ficaram de fora: ${pendentes.map((p) => `${p.n} (${p.motivo})`).join('; ')}`)
  return { entregues, parados, pendentes, parou }
}

// onde a tentativa trabalha: a principal sem WORKTREES; senao a worktree da tentativa anterior,
// ou uma nova quando nao ha anterior ou o agente morreu sem dizer qual era
function lugar(t, worktrees) {
  const w = worktrees[worktrees.length - 1]
  if (!WORKTREES) return { onde: NA_PRINCIPAL, isolado: false }
  return w ? { onde: naMesmaWorktree(t, w), isolado: false } : { onde: naWorktree(t), isolado: true }
}

// o ticket com os dois reparos, no mesmo lugar
async function implementar(t) {
  const worktrees = []
  const anotar = (r) => {
    if (!r) log(`Ticket ${t.n}: o agente nao devolveu resultado; a worktree dele, se nasceu, fica no git worktree list`)
    else if (r.worktree && !worktrees.includes(r.worktree)) worktrees.push(r.worktree)
    return r
  }
  let l = lugar(t, worktrees)
  let r = anotar(await agent(prompt(t, l.onde), opcoes(`ticket ${t.n}`, 'Implementacao', l.isolado)))
  for (let i = 1; !verde(r) && i <= 2; i++) {
    log(`Ticket ${t.n} vermelho — reparo ${i}/2`)
    l = lugar(t, worktrees)
    r = anotar(await agent(`${PREAMBULO}\n${l.onde}\n${marcos(t, i)}\n\nSEU TICKET: "${t.ticket}". Uma tentativa anterior nao fechou o portao:\n${JSON.stringify(r, null, 2)}\nInspecione onde ela trabalhou, conserte e conclua.`,
      opcoes(`reparo ${t.n} (${i})`, 'Reparo', l.isolado)))
  }
  return { t, r, worktrees }
}

for (let onda = 1; ; onda++) {
  const daOnda = TICKETS.filter((t) => !fechado(t.n) && !parado(t.n) && t.bloqueadoPor.every(fechado))
  if (daOnda.length === 0) return fim(null)
  if (!WORKTREES) {
    // a principal e uma so: vermelho depois dos reparos para o workflow inteiro
    for (const t of daOnda) {
      const { r } = await implementar(t)
      if (!verde(r)) {
        pararVermelho(t, r)
        return fim({ ticket: t.n, estado: r }, `o workflow parou no ticket ${t.n}`)
      }
      registrarVerde(t, r)
    }
    continue
  }
  log(`Onda ${onda}: ${daOnda.map((t) => t.n).join(', ')} juntos, cada um na sua worktree`)
  const tentativas = await parallel(daOnda.map((t) => () => implementar(t)))
  const feitos = daOnda.map((t, i) => tentativas[i] || { t, r: null, worktrees: [] })
  for (const { t, r } of feitos) if (!verde(r)) pararVermelho(t, r)
  const prontos = feitos.filter((f) => verde(f.r))
  const integrado = await agent(integrar(onda, prontos, feitos.flatMap((f) => f.worktrees)), { label: `integracao ${onda}`, phase: 'Integracao', schema: INTEGRACAO })
  if (!(integrado && integrado.testsPass && integrado.checksPass)) {
    return fim({ onda, integracao: integrado }, integrado ? `a working tree principal ficou vermelha na integracao da onda ${onda}` : `a integracao da onda ${onda} nao devolveu resultado`)
  }
  for (const { t, r } of prontos) {
    if (integrado.aplicados.includes(t.n)) registrarVerde(t, r)
    else if ((conflitos[t.n] = (conflitos[t.n] || 0) + 1) === 2) parar(t.n, 'o patch conflitou em duas integracoes')
    else log(`Ticket ${t.n}: o patch nao entrou na onda ${onda}; volta na seguinte, sobre a base nova`)
  }
}
```

O modelo do implement escolhido na terceira parada entra em `model` de cada
`agent()`; o da sessão é `model` omitido.

Cada agente de ticket marca o próprio `ticket` e `portao` no painel da leva, que assim tem o tempo
real de cada um; no fim, a sessão só acerta o que diverge do retorno (`references/painel.md`).
O retorno traz sempre `entregues`, `parados` e `pendentes`, estes dois com o motivo de cada um:
bloqueio inexistente, ciclo em `bloqueadoPor`, ou o workflow que parou antes. Ao fim de todo
workflow, confira `git worktree list`: a worktree do agente que morreu sem resultado não tem quem
a remova. Workflow interrompido com trabalho já verde na working tree principal? Rode a
verificação você mesmo, remova as worktrees que sobraram, semeie `entregues` com as notas dos
tickets fechados (cada um com o seu `n`) e relance: as ondas recomeçam dos que faltam.
