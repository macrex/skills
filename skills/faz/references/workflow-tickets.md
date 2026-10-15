# Esqueleto do Workflow de implementação

Vale quando o implement do `/faz` roda em **workflow** (só no Claude Code, escolhido na terceira parada: `leva.md`); o `PREAMBULO`
abaixo é o dos três modos. O `/faz` já invocou a `implement-spec`; os agentes por ticket não a
invocam de novo — o preâmbulo carrega o que ela pede, e o portão é quem cobra.

Um agente por ticket, **em ondas**: cada onda reúne os tickets cujos bloqueadores já fecharam e
entraram no branch da leva. Só o `bloqueadoPor` separa ondas: dois tickets que mexem no mesmo
arquivo rodam juntos. Com `WORKTREES`, cada ticket da onda roda na sua worktree (`isolation:
'worktree'`), num branch próprio, `leva/<slug>-<n>`, criado da ponta do branch da leva, e commita
ali, nunca na working tree principal. Os dois reparos rodam na mesma worktree; vermelho depois
deles, param ele e os que ele bloqueia. Depois de cada onda, um agente de **conciliação**, no
modelo do implement, faz numa worktree do branch da leva `git merge --no-ff` de cada branch de
ticket verde, um a um, resolvendo os conflitos sem perguntar e rodando a verificação rápida depois
de cada merge e a inteira uma vez, depois do último, com até dois reparos: vermelho depois deles,
ele desfaz o merge culpado (`git reset --hard` para a ponta de antes dele) e param o ticket e os
que dependem dele, enquanto os independentes seguem. Ticket nunca é refeito porque a base mudou. Assim o branch da
leva nunca fica vermelho, e a onda seguinte parte da ponta dele. A worktree e o branch de cada
ticket somem na conciliação da onda; a worktree do branch da leva e o próprio branch, só pela
sessão, depois do squash. Sem `WORKTREES`, cada onda roda em cadeia direto na working tree
principal, sem commit, e o vermelho depois dos reparos para o workflow inteiro: a principal suja
não deixa os seguintes partirem limpos.

Cinco coisas você preenche antes de rodar, e todas saem do projeto, não daqui: onde os tickets
estão (o tracker que o `/faz` já escolheu), o `bloqueadoPor` de cada um (a coluna dos bloqueios
da tabela do `to-tickets`), **os comandos de verificação do projeto** (a suíte, e o que mais o
repositório oferece — tipos, lint, build — e, entre eles, os de segundos, que a conciliação roda
depois de cada merge), a `RAIZ` com o `BRANCH` da leva e a pasta `LEVA_WT`
da worktree dele (no scratchpad da sessão; a conciliação a cria se não existe), e uma dica por
ticket que economize exploração ao agente. O `BRANCH` é `leva/<slug>`, que a sessão cria do
`HEAD` no começo do implement (`git -C <raiz> branch leva/<slug>`) e reaproveita na retomada.
`WORKTREES` é `false` quando o projeto não tem git ou não tem commit (a worktree nasce de um), e
então não há branch da leva. Ao adaptá-lo, o portão segue decidindo só por `testsPass` e
`checksPass` (comparar prosa já parou uma cadeia verde), e as `notes` de cada ticket seguem
alimentando os seguintes.

```js
export const meta = {
  name: 'leva-tickets',
  description: 'Implementa os tickets da spec em ondas, um por worktree, com portao, conciliacao e reparo',
  phases: [{ title: 'Implementacao' }, { title: 'Conciliacao' }, { title: 'Reparo' }],
}

// n: o id que o marco tickets deu ao ticket no painel; bloqueadoPor: os n dos tickets que a tabela
// do to-tickets poe antes deste
const TICKETS = [
  { n: '01', ticket: '<identificador do ticket no tracker>', dica: '...', bloqueadoPor: [] },
]

// Os comandos reais do projeto, um por linha. Se o repositorio nao tem um
// verificador alem do teste, esta lista tem uma linha so.
const VERIFICACAO = ['<comando de teste>', '<comando de tipos/lint/build>']
// o que a conciliacao roda depois de cada merge: os comandos de segundos (a suite unitaria, os
// tipos); a VERIFICACAO, com o e2e e o que mais demora, roda uma vez, depois do ultimo merge da
// onda. Verificacao toda de segundos: repita a VERIFICACAO
const VERIFICACAO_RAPIDA = ['<comando de teste>']

// a working tree principal, o branch da leva (a sessao o cria do HEAD), a worktree dele, e false
// sem git ou sem commit: a worktree nasce do HEAD
const RAIZ = '<caminho absoluto do repositorio>'
const BRANCH = 'leva/<slug>'
const LEVA_WT = '<scratchpad da sessao>/leva-<slug>'
const WORKTREES = true

const SO_LOCAL = 'sem trailer de assistente; nada de push. Na working tree principal, nenhum git add, commit, stash, checkout nem reset.'
const GIT = WORKTREES
  ? `Commit so no branch do ticket, de dentro da worktree dele, ${SO_LOCAL}`
  : 'Nao faca git commit nem push; na working tree principal, tambem nao faca git add, stash, checkout nem reset.'

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
  },
  required: ['ticket', 'done', 'testsPass', 'checksPass', 'tests', 'files', 'notes', 'blockers', 'worktree'],
}

const CONCILIACAO = {
  type: 'object',
  properties: {
    conciliados: { type: 'array', items: { type: 'string' }, description: 'os n dos tickets cujo merge ficou no branch da leva, verde' },
    recusados: { type: 'array', items: { type: 'string' }, description: 'os n dos tickets cujo merge ficou vermelho depois dos dois reparos, ja desfeito' },
    testsPass: { type: 'boolean', description: 'a ultima verificacao do branch da leva' },
    checksPass: { type: 'boolean' },
    tests: { type: 'string' },
    ponta: { type: 'string', description: 'o hash da ponta do branch da leva no fim' },
    notes: { type: 'string' },
  },
  required: ['conciliados', 'recusados', 'testsPass', 'checksPass', 'tests', 'ponta', 'notes'],
}

const verde = (r) => r && r.done && r.testsPass && r.checksPass
const opcoes = (label, fase, isolado) => ({ label, phase: fase, schema: SCHEMA, ...(isolado && { isolation: 'worktree' }) })
const ramo = (t) => `${BRANCH}-${t.n}`

const NA_PRINCIPAL = `Trabalhe direto na working tree principal, ${RAIZ}.`
// o ticket entra no branch da leva so pelo que commitou no branch dele
const commitar = (t, w) => `Com o portao verde, commite tudo em ${ramo(t)}: \`git -C "${w}" add -A\` e \`git -C "${w}" commit -m "<ticket ${t.n}: o que entregou>"\`; devolva o caminho de ${w} em worktree.`
// a worktree descartavel nasce do HEAD da principal: o agente a poe no branch do ticket
const naWorktree = (t) => [
  `Voce esta numa worktree descartavel, nao em ${RAIZ}; W abaixo e o caminho dela. Os comandos sao do bash (no Windows, o Git Bash da ferramenta Bash).`,
  `Antes de tudo, ponha W no branch do ticket, a partir da ponta do branch da leva: \`git -C "W" switch -c ${ramo(t)} ${BRANCH}\`.`,
  `Se ${ramo(t)} ja existe, de uma tentativa que morreu, remova a worktree dela (\`git -C "W" worktree list\` e \`git -C "W" worktree remove --force <caminho>\`) e use \`switch -C\`.`,
  'Dependencia que o .gitignore deixa de fora (node_modules, venv) e que a verificacao pede: instale-a em W antes do portao.',
  `Implemente e passe o portao de dentro de W. ${commitar(t, 'W')}`,
].join('\n')
const naMesmaWorktree = (t, w) => [
  `Trabalhe so em ${w}, a worktree da tentativa anterior, no branch ${ramo(t)}; nao toque em ${RAIZ}.`,
  `Os comandos sao do bash (no Windows, o Git Bash da ferramenta Bash): rode todo git com -C "${w}" e o portao de dentro dela.`,
  commitar(t, w),
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

function conciliar(onda, prontos, feitos) {
  return [
    `Voce concilia a onda ${onda} no branch da leva, ${BRANCH}, sem perguntar nada a ninguem. Commit so no branch da leva, ${SO_LOCAL}`,
    `Painel da leva: carregue mcp__macrex-skills__faz_marco pelo ToolSearch e, como primeira acao, chame-a com { marco: 'item', item: 'Conciliação ${onda}' }; como ultima, de novo com o mesmo item, portao 'verde' ou 'vermelho' (a ultima verificacao do branch da leva) e detalhe '<conciliados>/${prontos.length}'. Ferramenta ausente ou recusada: siga sem ela.`,
    `Trabalhe em ${LEVA_WT}, a worktree do branch da leva; se ela nao existe, crie-a com \`git -C "${RAIZ}" worktree add "${LEVA_WT}" ${BRANCH}\` e instale nela a dependencia que o .gitignore deixa de fora e a verificacao pede. Os comandos sao do bash: rode todo git com -C "${LEVA_WT}" e a verificacao de dentro dela.`,
    'A ponta atual do branch da leva ja passou pela verificacao inteira (na conciliacao anterior, ou no portao de cada ticket, que a roda sobre ela): nao a verifique antes dos merges.',
    `Para cada branch abaixo, nesta ordem, anote a ponta (\`git -C "${LEVA_WT}" rev-parse HEAD\`), faca \`git -C "${LEVA_WT}" -c rerere.enabled=true merge --no-ff <branch>\`, resolva os conflitos voce mesmo, juntando a intencao dos dois lados, conclua o merge e rode a verificacao rapida: ${VERIFICACAO_RAPIDA.join(' && ')}.`,
    `Rapida vermelha: ate dois reparos, cada um commitado no branch da leva. Vermelha depois deles: desfaca aquele merge com \`git -C "${LEVA_WT}" reset --hard <a ponta anotada>\`, ponha o ticket em recusados e siga para o seguinte.`,
    `Depois do ultimo merge, rode a verificacao inteira, uma vez: ${VERIFICACAO.join(' && ')}. Vermelha: ache o merge que trouxe a falha pelo que ela toca; sem causa evidente, \`git -C "${LEVA_WT}" bisect start --first-parent HEAD <a primeira ponta anotada>\` com a inteira como teste. Ate dois reparos, cada um commitado; vermelha depois deles, desfaca o merge culpado (reset --hard para a ponta de antes dele), refaca os que vinham depois com a rapida (o rerere repete os conflitos ja resolvidos), ponha o culpado em recusados e rode a inteira de novo. Falha que nao toca nenhum ticket da onda: rode a inteira na primeira ponta anotada; vermelha la, o vermelho e de antes da onda: desfaca todos os merges (reset --hard para ela), nenhum conciliado, va direto a remocao e devolva o resultado dessa verificacao.`,
    'Uma verificacao vale para a arvore em que rodou: commitar o que acabou de passar nao pede outra, e o reparo se commita antes de ser verificado. Falha intermitente se repete so ate a verificacao fechar; as rodadas que confirmam um reparo contam como a verificacao dele.',
    prontos.map((f) => `- ticket ${f.t.n}: ${ramo(f.t)}`).join('\n') || '(nenhum)',
    `Por fim remova estas worktrees com \`git -C "${RAIZ}" worktree remove --force <caminho>\`, o branch worktree-<pasta> que o harness criou com cada uma, se existe, e os branches dos tickets da onda com \`git -C "${RAIZ}" branch -D\`; o que nao sair (arquivo preso no Windows) vai em notes. Nunca remova ${LEVA_WT} nem ${BRANCH}.`,
    feitos.flatMap((f) => f.worktrees).join('\n') || '(nenhuma worktree)',
    feitos.map((f) => ramo(f.t)).join('\n'),
  ].join('\n')
}

phase('Implementacao')
const entregues = []
const parados = []
let ponta = ''
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
// o que nao fechou nem parou vai no retorno com o motivo, para a retomada; o branch da leva e a
// ponta dele vao para o squash da sessao
function fim(parou, motivo) {
  const pendentes = TICKETS.filter((t) => !fechado(t.n) && !parado(t.n)).map((t) => {
    const inexistentes = t.bloqueadoPor.filter((b) => !TICKETS.some((x) => x.n === b))
    const espera = t.bloqueadoPor.filter((b) => !fechado(b))
    return { n: t.n, motivo: motivo || (inexistentes.length ? `bloqueio inexistente: ${inexistentes.join(', ')}` : `espera ${espera.join(', ')}, que nunca fecha: ciclo em bloqueadoPor`) }
  })
  if (pendentes.length) log(`Ficaram de fora: ${pendentes.map((p) => `${p.n} (${p.motivo})`).join('; ')}`)
  return { entregues, parados, pendentes, parou, branch: WORKTREES ? BRANCH : '', ponta }
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
  const conciliado = await agent(conciliar(onda, prontos, feitos), { label: `conciliacao ${onda}`, phase: 'Conciliacao', schema: CONCILIACAO })
  if (!(conciliado && conciliado.testsPass && conciliado.checksPass)) {
    return fim({ onda, conciliacao: conciliado }, conciliado ? `o branch da leva ficou vermelho na conciliacao da onda ${onda}` : `a conciliacao da onda ${onda} nao devolveu resultado`)
  }
  ponta = conciliado.ponta
  for (const { t, r } of prontos) {
    if (conciliado.conciliados.includes(t.n)) registrarVerde(t, r)
    else {
      parar(t.n, 'a conciliacao desfez o merge depois dos dois reparos')
      log(`Ticket ${t.n}: merge desfeito na conciliacao da onda ${onda}; param ele e os que dependem dele`)
    }
  }
}
```

O modelo do implement escolhido na terceira parada entra em `model` de cada
`agent()`, o da conciliação inclusive; o da sessão é `model` omitido.

Cada agente de ticket marca o próprio `ticket` e `portao` no painel da leva, que assim tem o tempo
real de cada um, e a conciliação marca o item `Conciliação <n>` da fase implement; no fim, a sessão
só acerta o que diverge do retorno (`references/painel.md`). O retorno traz sempre `entregues`,
`parados` e `pendentes`, estes dois com o motivo de cada um: bloqueio inexistente, ciclo em
`bloqueadoPor`, ou o workflow que parou antes; e o `branch` da leva com a `ponta` dele, que a
sessão leva ao squash. Ao fim de todo workflow, confira `git worktree list` e os branches
`leva/<slug>-*`: a worktree e o branch do agente que morreu sem resultado, ou os que o `worktree
remove --force` não tirou no Windows, não têm quem os remova. Workflow interrompido com ondas já
conciliadas? O branch da leva guarda o que fechou: rode a verificação na ponta dele, remova as
worktrees e os branches de ticket que sobraram, semeie `entregues` com as notas dos tickets
fechados (cada um com o seu `n`) e relance: as ondas recomeçam dos que faltam, da ponta do branch
da leva.
