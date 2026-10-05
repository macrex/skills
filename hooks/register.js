// Painel da leva: o mod do Claude Code que desenha, num pane ao lado da conversa, o estado da
// leva do workspace. Carregado por "modules" no hooks/hooks.json; os settings hooks seguem la.
// Sem JSX (o arquivo e .js): as arvores saem do `h` global.
//
// A leva grava o estado chamando a ferramenta faz_marco (skills/faz/references/harness.md diz
// quando); o estado fica no $.store do plugin, um por workspace, e sobrevive a reinicio. O
// desenho le do $.state (types/index.d.ts), que sobrevive a hot reload e redesenha sozinho.
// O tempo sai da hora de cada marco; os agentes e workflows, dos hooks do Agent, do Workflow,
// do fim de turno do sub-agente e da notificacao de fim de tarefa.
//
// O grill do /faz (movimento 1) vem antes da leva: os marcos grill e entendimento o abrem e o
// fecham, e as perguntas saem do AskUserQuestion pelo tema (o header). O inicio da leva o tira
// da tela; o /clear volta ao repouso, o Claude dormindo.

import { atom, read, update } from 'claude-code'

const PANE = 'faz-painel'
const FERRAMENTA = 'faz_marco'
const MARCO = 'mcp__macrex-skills__faz_marco'
const MARCOS = ['inicio', 'fase', 'tickets', 'ticket', 'portao', 'item', 'fechamento']
const MARCOS_DO_GRILL = ['grill', 'entendimento', 'linha']
// O mascote do Claude Code, identico ao do cabecalho, parado; so os z se mexem: cada ronco solta um z que
// sobe uma linha e anda uma coluna por quadro. Linhas de mesma largura, para o desenho nao pular
// quando o pane o centraliza.
const RONCO = 700
const ZS = [
  ['          Z', '', ''],
  ['', '', '        z'],
  ['', '         z', '        z'],
  ['          Z', '         z', ''],
]
const BONECO = [' ▐▛███▜▌', '▝▜█████▛▘', '  ▘▘ ▝▝']
// o boneco menor, para o pane baixo: sem as pernas; o corpo fica, e e ele que fecha os olhos por baixo
const BONECO_MENOR = BONECO.slice(0, 2)

// A frase do repouso: o terminal nao muda o tamanho da fonte, entao ela vai em maiusculas
// espacadas e em negrito, que leem maiores; so no pane que tem lugar para ela.
const QUIETO_GRANDE = [...'TUDO QUIETO POR AQUI'].join(' ')
const LARGURA_DO_GRANDE = QUIETO_GRANDE.length + 2
// as linhas do corpo do pane que cabem a frase (com a folga), o boneco e os z; e so o boneco e os z
const LINHAS_DA_FRASE = 12
const LINHAS_DO_BONECO = 7
const LARANJA = '#d77757'
const FASES = ['spec', 'tickets', 'implement', 'revisao', 'correcoes', 'qualidade', 'fechamento']
const PORTOES = ['verde', 'vermelho']
const MODOS = ['inline', 'sub-agents', 'workflow']
// as fases depois do implement, cujo andamento chega item a item, e o titulo do cartao de cada uma
const FASES_COM_ITENS = { revisao: 'Revisão', correcoes: 'Correções', qualidade: 'Qualidade' }
const NO_HISTORICO = 10
const FUNDO = '#24283b'
// a paleta do video do README: cartoes um tom abaixo do fundo, chips um tom acima; as cores do
// texto vao explicitas, porque o fundo e escuro mesmo num terminal de tema claro
const CARTAO = '#1f2335'
const CHIP = '#292e42'
const TEXTO = '#c0caf5'
const APAGADO = '#8b93b8'
const VERDE = '#9ece6a'
const AZUL = '#7aa2f7'
const VERMELHO = '#f7768e'
const AMARELO = '#e0af68'
// o nome de cada fase no chip, o da skill que a cumpre; o fechamento nao vira chip, vira o aviso do /cpv
const ROTULO = { spec: 'to-spec', tickets: 'to-tickets', implement: 'implement', revisao: 'code-review', correcoes: 'correções', qualidade: 'qualidade' }
const FIM_DE_TAREFA = { completed: 'concluido', failed: 'falhou', killed: 'parado', stopped: 'parado' }
const DO_AGENTE = { rodando: ['rodando', LARANJA], concluido: ['concluído', VERDE], falhou: ['falhou', VERMELHO], parado: ['parado', APAGADO] }

const LEVA = atom({ plugin: 'macrex-skills', key: 'leva' }, null)
// Os agentes e workflows da leva, so na sessao (nao vao ao $.store).
const AGENTES = atom({ plugin: 'macrex-skills', key: 'agentes' }, [])
// A conferencia das skills: as skills da leva que esta sessao invocou, so na sessao; a leva as
// invoca logo depois do localizador, antes do inicio, e a sessao nova de uma retomada as recarrega.
const SKILLS = atom({ plugin: 'macrex-skills', key: 'skills' }, [])
// As ultimas levas fechadas do workspace, carregadas do $.store no inicio da sessao.
const HISTORICO = atom({ plugin: 'macrex-skills', key: 'historico' }, [])
// O grill do movimento 1, um por workspace no $.store, ate o inicio da leva ou o Limpar a tela.
const GRILL = atom({ plugin: 'macrex-skills', key: 'grill' }, null)
// A aba do pane, so na sessao: o andamento da leva ou o codigo que a sessao mudou.
const ABA = atom({ plugin: 'macrex-skills', key: 'aba' }, 'painel')
// O ponto de partida da aba Codigo, tirado no inicio da sessao: a raiz do repositorio, o commit do
// working tree de entao (git stash create; o HEAD, se limpo) e os arquivos nao rastreados de entao.
const BASE = atom({ plugin: 'macrex-skills', key: 'base' }, null)
// Os arquivos que a sessao mudou desde a base, com o diff de cada um; e os que estao abertos.
const CODIGO = atom({ plugin: 'macrex-skills', key: 'codigo' }, [])
const ABERTOS = atom({ plugin: 'macrex-skills', key: 'abertos' }, [])
// Os tokens de cada turno desde o inicio da leva (ou da sessao, antes dela), so na sessao: por
// loop, o principal em 'sessao' e cada sub-agente pelo agentId, com o modelo do ultimo turno.
const USO = atom({ plugin: 'macrex-skills', key: 'uso' }, {})
const ABAS = { painel: 'Painel', codigo: 'Diff', grill: 'Grill', tickets: 'Tickets', uso: 'Uso' }
const TOKENS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']
// os caracteres de controle que um Code recusa: todos menos tab e quebra de linha
const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/g
// a linha das abas e a margem embaixo dela
const LINHAS_DAS_ABAS = 2
// as ferramentas que mudam arquivo: depois de cada uma, a aba Codigo aberta se refaz
const MUDAM = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell']
// o maior source que um Code desenha e 10000; a folga e do cabecalho recontado
const LIMITE_DO_CODE = 9900
const SKILL_DA_FASE = { spec: 'to-spec', tickets: 'to-tickets', implement: 'implement', revisao: 'code-review' }

const chave = cwd => `leva:${cwd}`
const chaveDoHistorico = cwd => `levas:${cwd}`
const chaveDoGrill = cwd => `grill:${cwd}`
// a skill da fase que esta sessao ainda nao invocou, ou undefined
const semSkill = (fase, skills) => (skills.includes(SKILL_DA_FASE[fase]) ? undefined : SKILL_DA_FASE[fase])
// um inicio com o mesmo documento sobre a leva aberta e a retomada dela
const retoma = (leva, m) => m.marco === 'inicio' && Boolean(leva) && !leva.fechada && leva.documento === m.documento
const dois = n => String(n).padStart(2, '0')

// a contagem de tokens curta, com a virgula do portugues: 999, 1,5k, 2,3M
function tokens(n) {
  if (n < 1000) return String(n)
  return (n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`).replace('.', ',')
}

function duracao(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${dois(s % 60)}s` : `${Math.floor(m / 60)}h${dois(m % 60)}m`
}

// Aplica um marco ao estado na hora `agora`; devolve o estado novo ou { erro } sem tocar no antigo.
function aplicar(leva, m, agora) {
  if (m.marco === 'inicio') {
    if (typeof m.documento !== 'string' || !m.documento.trim()) return { erro: 'inicio exige documento (titulo da nota ou caminho)' }
    if (m.sujos != null && !(Array.isArray(m.sujos) && m.sujos.every(s => typeof s === 'string'))) {
      return { erro: 'sujos exige uma lista de caminhos (o git status --porcelain de antes da leva)' }
    }
    // a retomada guarda tudo, inclusive os sujos do inicio original
    if (retoma(leva, m)) return leva
    const sujos = m.sujos ?? []
    return { documento: m.documento, fase: 'spec', fases: ['spec'], entradas: { spec: agora }, inicio: agora, tickets: [], sujos, fechada: false }
  }
  if (!MARCOS.includes(m.marco)) return { erro: `marco desconhecido: ${m.marco}; use ${MARCOS.join(', ')}` }
  if (!leva) return { erro: 'nenhuma leva neste workspace: registre o marco inicio antes' }
  // a fase guarda a hora da primeira entrada; voltar a ela nao zera o tempo
  const fase = f => ({
    ...leva,
    fase: f,
    fases: leva.fases.includes(f) ? leva.fases : [...leva.fases, f],
    entradas: { [f]: agora, ...leva.entradas },
  })
  const achar = id => leva.tickets.find(t => t.id === String(id))
  switch (m.marco) {
    case 'fase':
      if (!FASES.includes(m.fase)) return { erro: `fase fora do vocabulario: ${m.fase}; use ${FASES.join(', ')}` }
      if (m.modo == null) return fase(m.fase)
      if (m.fase !== 'implement' || !MODOS.includes(m.modo)) return { erro: `modo vai so com fase implement e e um de ${MODOS.join(', ')}` }
      return { ...fase(m.fase), modo: m.modo }
    case 'tickets':
      if (!Array.isArray(m.tickets) || !m.tickets.every(t => t && t.id != null && typeof t.titulo === 'string')) {
        return { erro: 'tickets exige uma lista de { id, titulo }' }
      }
      return { ...leva, tickets: m.tickets.map(t => ({ id: String(t.id), titulo: t.titulo, estado: 'pendente' })) }
    case 'ticket':
      if (!achar(m.ticket)) return { erro: `ticket inexistente: ${m.ticket}` }
      return {
        ...leva,
        tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, estado: 'em-curso', inicioEm: t.inicioEm ?? agora } : t)),
      }
    case 'portao': {
      if (!achar(m.ticket)) return { erro: `ticket inexistente: ${m.ticket}` }
      if (!PORTOES.includes(m.portao)) return { erro: `portao deve ser verde ou vermelho, veio ${m.portao}` }
      if (m.reparos != null && ![0, 1, 2].includes(m.reparos)) return { erro: `reparos vai de 0 a 2, veio ${m.reparos}` }
      if (m.testes != null && String(m.testes).length > 20) return { erro: `testes cabe em 20 caracteres, veio ${m.testes}` }
      if (m.notas != null && (typeof m.notas !== 'string' || m.notas.length > 500)) return { erro: 'notas e um texto de ate 500 caracteres' }
      const portao = { estado: m.portao, reparos: m.reparos, testes: m.testes == null ? undefined : String(m.testes), notas: m.notas, fimEm: agora }
      return { ...leva, tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, ...portao } : t)) }
    }
    case 'item': {
      const f = m.fase ?? leva.fase
      if (typeof m.item !== 'string' || !m.item.trim() || m.item.length > 60) return { erro: 'item exige o nome do item, ate 60 caracteres' }
      if (!FASES_COM_ITENS[f]) return { erro: `item vai so nas fases ${Object.keys(FASES_COM_ITENS).join(', ')}; veio fase ${f}` }
      if (m.portao != null && !PORTOES.includes(m.portao)) return { erro: `portao deve ser verde ou vermelho, veio ${m.portao}` }
      if (m.detalhe != null && (typeof m.detalhe !== 'string' || m.detalhe.length > 60)) return { erro: 'detalhe e um texto de ate 60 caracteres' }
      if (m.item.trim() === FASES_COM_ITENS[f]) return { erro: `item repete o titulo do cartao (${m.item}): nomeie o passo, ex. Achados da revisao, Testes, Build` }
      // o mesmo item da mesma fase e atualizado, e guarda a hora em que comecou; o que ja
      // chega com o portao, sem ter aberto em curso, conta da entrada na fase
      const itens = leva.itens ?? []
      const velho = itens.find(i => i.fase === f && i.titulo === m.item)
      const novo = {
        fase: f,
        titulo: m.item,
        estado: m.portao ?? 'em-curso',
        detalhe: m.detalhe ?? velho?.detalhe,
        inicioEm: velho?.inicioEm ?? (m.portao && leva.entradas?.[f]) ?? agora,
        fimEm: m.portao ? agora : undefined,
      }
      return { ...leva, itens: velho ? itens.map(i => (i === velho ? novo : i)) : [...itens, novo] }
    }
    case 'fechamento':
      return { ...fase('fechamento'), fechada: true, fim: agora }
  }
}

// Aplica um marco do grill; devolve o grill novo ou { erro } sem tocar no antigo.
function aplicarNoGrill(grill, m, agora) {
  if (m.marco === 'grill') {
    if (typeof m.pedido !== 'string' || !m.pedido.trim()) return { erro: 'grill exige o pedido em poucas palavras' }
    return { pedido: m.pedido, inicio: agora, perguntas: [] }
  }
  if (!grill) return { erro: 'nenhum grill neste workspace: registre o marco grill antes' }
  if (m.marco === 'linha') {
    if (typeof m.linha !== 'string' || !m.linha.trim() || m.linha.length > 4000) return { erro: 'linha exige a linha da leva inteira, ate 4000 caracteres' }
    // o Code da aba Grill recusa caractere de controle alem de tab e quebra de linha
    return { ...grill, linha: m.linha.replace(CONTROLE, '') }
  }
  if (typeof m.documento !== 'string' || !m.documento.trim()) return { erro: 'entendimento exige documento (titulo da nota ou caminho)' }
  return { ...grill, documento: m.documento, fim: agora }
}

// o grill que a aba Painel mostra: o que o inicio da leva e o /clear nao tiraram de la
const naTela = grill => (grill && !grill.fora ? grill : null)

// Tira o grill da aba Painel; a aba Grill o guarda ate o proximo grill do workspace.
async function tirarGrillDaTela($) {
  const grill = await read($, GRILL)
  if (!naTela(grill)) return
  const fora = { ...grill, fora: true }
  await $.store.set(chaveDoGrill(await $.session.cwd()), fora)
  await update($, GRILL, () => fora)
}

// Tira da tela o grill e a leva fechada; o historico fica no store para a proxima fechada. A leva
// aberta fica: a retomada numa sessao nova le os tickets dela do store.
async function limpar($) {
  const cwd = await $.session.cwd()
  await tirarGrillDaTela($)
  if (await ativa($)) return
  await $.store.delete(chave(cwd))
  await update($, LEVA, () => null)
  await update($, AGENTES, () => [])
}

// O stdout do git na pasta `cwd`, ou '' quando sai com codigo acima de `aceito` (o diff
// --no-index sai 1 quando ha diferenca); quotePath desligado guarda os acentos dos caminhos.
async function git($, cwd, args, aceito = 0) {
  const r = await $.process.run(['git', '-c', 'core.quotePath=false', ...args], { cwd })
  return r.exitCode <= aceito ? r.stdout : ''
}
const naoRastreados = async ($, raiz) => (await git($, raiz, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)

// Tira a base da aba Codigo uma vez por sessao: o hot reload roda o session.start de novo.
// ponytail: um repositorio por sessao, o do cwd do inicio; o nao rastreado de antes que a sessao
// mudou fica fora
async function marcarBase($, cwd) {
  if (await read($, BASE)) return
  try {
    const raiz = (await git($, cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (!raiz) return
    const commit = (await git($, raiz, ['stash', 'create'])).trim() || (await git($, raiz, ['rev-parse', 'HEAD'])).trim()
    if (!commit) return
    const soltos = await naoRastreados($, raiz)
    await update($, BASE, () => ({ raiz, commit, soltos }))
  } catch {}
}

// O diff do git em arquivos: o caminho, as linhas somadas e tiradas, e os hunks. O Code recusa
// caractere de controle alem de tab e quebra de linha, entao o \r e os outros saem.
function arquivosDoDiff(texto) {
  return texto.split(/^diff --git /m).slice(1).map(bloco => {
    const limpo = bloco.replace(CONTROLE, '')
    const caminho = (/^\+\+\+ b\/(.+?)\t?$/m.exec(limpo) ?? /^--- a\/(.+?)\t?$/m.exec(limpo) ?? /^a\/.* b\/(.+)$/m.exec(limpo))[1]
    const inicio = limpo.search(/^@@ /m)
    const diff = inicio < 0 ? '' : limpo.slice(inicio).replace(/\n+$/, '')
    const linhas = diff.split('\n')
    return { caminho, mais: linhas.filter(l => l[0] === '+').length, menos: linhas.filter(l => l[0] === '-').length, diff }
  })
}

// Os hunks em pedacos que um Code desenha: o hunk maior que o limite vira varios, cada um com o
// cabecalho recontado. ponytail: a linha acima de 2000 caracteres e cortada
function pedacos(diff) {
  const fora = []
  for (const hunk of diff.split(/\n(?=@@ )/)) {
    if (hunk.length <= LIMITE_DO_CODE) {
      fora.push(hunk)
      continue
    }
    const [cabecalho, ...linhas] = hunk.split('\n')
    let [velha, nova] = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(cabecalho).slice(1).map(Number)
    let parte = []
    let tamanho = 0
    const fecha = () => {
      const velhas = parte.filter(l => l[0] !== '+' && l[0] !== '\\').length
      const novas = parte.filter(l => l[0] !== '-' && l[0] !== '\\').length
      fora.push(`@@ -${velha},${velhas} +${nova},${novas} @@\n${parte.join('\n')}`)
      velha += velhas
      nova += novas
      parte = []
      tamanho = 0
    }
    for (const linha of linhas.map(l => l.slice(0, 2000))) {
      if (parte.length > 0 && tamanho + linha.length + 1 > LIMITE_DO_CODE - 40) fecha()
      parte.push(linha)
      tamanho += linha.length + 1
    }
    if (parte.length > 0) fecha()
  }
  return fora
}

// Refaz a lista da aba Codigo: o working tree contra a base, e os nao rastreados novos inteiros.
async function atualizarCodigo($) {
  const base = await read($, BASE)
  if (!base) return
  try {
    const { raiz, commit, soltos } = base
    const rastreados = await git($, raiz, ['diff', '--no-color', '--no-ext-diff', commit])
    const novos = (await naoRastreados($, raiz)).filter(c => !soltos.includes(c))
    const dosNovos = await Promise.all(novos.map(c => git($, raiz, ['diff', '--no-index', '--no-color', '--', '/dev/null', c], 1)))
    const arquivos = [rastreados, ...dosNovos].flatMap(arquivosDoDiff)
    await update($, CODIGO, () => arquivos)
  } catch {}
}

const trocarAba = async ($, aba) => {
  await update($, ABA, () => aba)
  if (aba === 'codigo') await atualizarCodigo($)
}

// Muda os agentes que `qual` escolhe com o que `como` devolve.
const mexer = ($, qual, como) => update($, AGENTES, lista => lista.map(a => (qual(a) ? { ...a, ...como(a) } : a)))

const ativa = async $ => {
  const leva = await read($, LEVA)
  return Boolean(leva && !leva.fechada)
}
const emGrill = async $ => {
  const grill = await read($, GRILL)
  return Boolean(naTela(grill) && grill.documento == null)
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const salva = await $.store.get(chave(e.cwd))
    if (salva) await update($, LEVA, () => salva)
    const historico = await $.store.get(chaveDoHistorico(e.cwd))
    if (historico) await update($, HISTORICO, () => historico)
    const grill = await $.store.get(chaveDoGrill(e.cwd))
    if (grill) await update($, GRILL, () => grill)
    await marcarBase($, e.cwd)
    // o tempo da fase, dos agentes em curso e do grill anda sozinho no pane
    $.clock.every(1000, async () => ((await ativa($)) || (await emGrill($))) && $.ui.invalidate('ui.render'))
    // no repouso, o ronco: so o pane montado redesenha
    $.clock.every(RONCO, async () => !(await read($, LEVA)) && !naTela(await read($, GRILL)) && $.ui.invalidate('ui.render'))
    await $.command.register({
      name: PANE,
      description: '(macrex-skills) Abre ou fecha o painel da leva ao lado da conversa',
      immediate: true,
    })
    await $.tool.register({
      name: FERRAMENTA,
      description:
        'Registra um marco da leva (/faz leva) no painel da leva do Claude Code. Chame em: inicio (com documento), ' +
        'cada fase, tickets publicados, inicio de cada ticket, resultado de cada portao e fechamento. ' +
        'No interrogatorio do /faz: grill (com pedido) antes da primeira pergunta, entendimento (com documento) ' +
        'quando o documento estiver gravado e linha (com a linha da leva inteira) logo depois de imprimi-la. ' +
        'Erro aqui nunca para a leva.',
      inputSchema: {
        type: 'object',
        properties: {
          marco: { type: 'string', enum: [...MARCOS, ...MARCOS_DO_GRILL] },
          documento: { type: 'string', description: 'inicio e entendimento: o documento da leva (titulo da nota ou caminho)' },
          pedido: { type: 'string', maxLength: 60, description: 'grill: o pedido em poucas palavras' },
          linha: { type: 'string', maxLength: 4000, description: 'linha: a linha da leva que o /faz imprimiu ao fim do grill, inteira' },
          fase: { type: 'string', enum: FASES },
          modo: { type: 'string', enum: MODOS, description: 'fase implement: como o implement roda' },
          tickets: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'string' }, titulo: { type: 'string' } }, required: ['id', 'titulo'] },
          },
          ticket: { type: 'string', description: 'ticket e portao: o id do ticket' },
          item: { type: 'string', maxLength: 60, description: 'item: o nome do passo da revisao, das correcoes ou da qualidade, nunca o da fase' },
          detalhe: { type: 'string', maxLength: 60, description: 'item: o resultado curto, ex. 3 achados ou 16/16' },
          portao: { type: 'string', enum: PORTOES },
          reparos: { type: 'integer', minimum: 0, maximum: 2 },
          testes: { type: 'string', maxLength: 20, description: 'portao: contagem de testes, ex. 3/4' },
          notas: { type: 'string', maxLength: 500, description: 'portao: o que o ticket entregou, para a retomada' },
          sujos: {
            type: 'array',
            items: { type: 'string' },
            description: 'inicio: os caminhos do git status --porcelain de antes da leva',
          },
        },
        required: ['marco'],
      },
    })
    return next(e)
  })

  // o /clear limpa a tela; nenhum session.start vem depois dele
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await limpar($)
    return next(e)
  })

  on('tool.call', { tool: MARCO }, async ($, e) => {
    if (MARCOS_DO_GRILL.includes(e.marco)) {
      const grill = aplicarNoGrill(await read($, GRILL), e, await $.clock.now())
      if (grill.erro) return { deny: grill.erro }
      await $.store.set(chaveDoGrill(await $.session.cwd()), grill)
      await update($, GRILL, () => grill)
      return { result: `marco registrado; ${e.marco}` }
    }
    const antes = await read($, LEVA)
    const leva = aplicar(antes, e, await $.clock.now())
    // deny e a forma de um hook devolver erro de ferramenta: o modelo recebe o texto como erro
    if (leva.erro) return { deny: leva.erro }
    if (e.marco === 'inicio') {
      // a leva comeca (ou retoma): o grill sai da aba Painel
      await tirarGrillDaTela($)
    }
    if (retoma(antes, e)) {
      const tickets = leva.tickets.map(({ id, titulo, estado, notas }) => ({ id, titulo, estado, notas }))
      const estado = JSON.stringify({ fase: leva.fase, tickets, sujos: leva.sujos ?? [] }, null, 2)
      return { result: `marco registrado; retomada na fase ${leva.fase}\n${estado}` }
    }
    const falta = ['inicio', 'fase'].includes(e.marco) && semSkill(leva.fase, await read($, SKILLS))
    const cwd = await $.session.cwd()
    await $.store.set(chave(cwd), leva)
    await update($, LEVA, () => leva)
    if (e.marco === 'fechamento' && !antes.fechada) {
      const modelos = [...new Set((await read($, AGENTES)).map(a => a.modelo).filter(Boolean))]
      const historico = [{ ...leva, modelos }, ...((await $.store.get(chaveDoHistorico(cwd))) ?? [])].slice(0, NO_HISTORICO)
      await $.store.set(chaveDoHistorico(cwd), historico)
      await update($, HISTORICO, () => historico)
      // zera no fechamento, nao no inicio: a proxima leva invoca as reservadas antes do inicio
      await update($, SKILLS, () => [])
    }
    if (e.marco === 'inicio') {
      await update($, AGENTES, () => [])
      await update($, USO, () => ({}))
      $.ui.toast('Leva registrada: /faz-painel mostra o andamento')
    }
    return { result: `marco registrado; fase ${leva.fase}${falta ? ` sem /${falta} invocada` : ''}` }
  })

  // o /cpv digitado depois do fechamento fecha a leva no git: o painel para de pedi-lo.
  // ponytail: marca quando o /cpv expande, nao quando termina; um repo que ele pulou nao desmarca
  on('skill.prompt', async ($, e, next) => {
    const leva = await read($, LEVA)
    if (e.skill.split(':').pop() === 'cpv' && leva?.fechada && leva.cpv == null) {
      const feita = { ...leva, cpv: await $.clock.now() }
      await $.store.set(chave(await $.session.cwd()), feita)
      await update($, LEVA, () => feita)
    }
    return next(e)
  })

  // casa pelo sufixo depois do `:`: mattpocock-skills:to-spec e to-spec contam igual
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const nome = String(e.skill ?? '').split(':').pop()
    if (Object.values(SKILL_DA_FASE).includes(nome)) await update($, SKILLS, lista => (lista.includes(nome) ? lista : [...lista, nome]))
    return next(e)
  })

  // as rodadas do grill pelo CLI: cada pergunta entra pelo tema e espera a resposta.
  // ponytail: o canal tela (grill-tela) responde por fora do AskUserQuestion e nao aparece aqui
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (!(await emGrill($))) return next(e)
    const id = e.tool_use_id
    const novas = e.questions.map(q => ({ id, pergunta: q.question, tema: q.header || q.question }))
    await update($, GRILL, g => ({ ...g, perguntas: [...g.perguntas, ...novas] }))
    const r = await next(e)
    const respostas = r.result?.answers ?? {}
    const grill = await read($, GRILL)
    if (!grill) return r
    const respondido = {
      ...grill,
      perguntas: grill.perguntas.map(p => (p.id === id ? { ...p, resposta: respostas[p.pergunta] ?? 'sem resposta' } : p)),
    }
    await $.store.set(chaveDoGrill(await $.session.cwd()), respondido)
    await update($, GRILL, () => respondido)
    return r
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (!(await ativa($))) return next(e)
    const id = e.tool_use_id
    const inicio = await $.clock.now()
    const nome = e.name || e.description || e.subagent_type || 'agente'
    await update($, AGENTES, lista => [...lista, { id, tipo: 'agente', nome, modelo: e.model ?? '', estado: 'rodando', inicio }])
    const r = await next(e)
    const fim = await $.clock.now()
    const feito = r.result
    if (r.deny !== undefined || r.isError) await mexer($, a => a.id === id, () => ({ estado: 'falhou', duracao: fim - inicio }))
    else if (feito?.status === 'completed') {
      await mexer($, a => a.id === id, a => ({
        estado: 'concluido',
        agentId: feito.agentId,
        modelo: feito.resolvedModel ?? a.modelo,
        duracao: feito.totalDurationMs ?? fim - inicio,
      }))
    } else await mexer($, a => a.id === id, () => ({ agentId: feito?.agentId }))
    return r
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    if (!(await ativa($))) return next(e)
    const id = e.tool_use_id
    const inicio = await $.clock.now()
    await update($, AGENTES, lista => [...lista, { id, tipo: 'workflow', nome: 'workflow', modelo: '', estado: 'rodando', inicio }])
    const r = await next(e)
    const feito = r.result
    await mexer($, a => a.id === id, () =>
      r.deny !== undefined || r.isError || feito?.error
        ? { estado: 'falhou', duracao: 0 }
        : { nome: `workflow ${feito?.workflowName ?? ''}`.trim(), taskId: feito?.taskId },
    )
    return r
  })

  // fim de um sub-agente em background: o turno do loop dele termina
  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      const loop = e.agentId ?? 'sessao'
      await update($, USO, uso => {
        const antes = uso[loop] ?? {}
        const somado = Object.fromEntries(TOKENS.map(k => [k, (antes[k] ?? 0) + (e.usage[k] ?? 0)]))
        return { ...uso, [loop]: { ...somado, modelo: e.usage.model ?? antes.modelo ?? '' } }
      })
    }
    if (e.agentId) {
      const fim = await $.clock.now()
      const estado = e.reason === 'answer' ? 'concluido' : e.reason === 'aborted' ? 'parado' : 'falhou'
      await mexer($, a => a.agentId === e.agentId && a.estado === 'rodando', a => ({
        estado,
        modelo: e.usage?.model ?? a.modelo,
        duracao: fim - a.inicio,
      }))
    }
    return next(e)
  })

  // um teammate nao termina: fica ocioso quando entrega, e e ai que o trabalho dele acabou
  on('classic.TeammateIdle', async ($, e, next) => {
    const fim = await $.clock.now()
    await mexer($, a => a.tipo === 'agente' && a.nome === e.teammate_name && a.estado === 'rodando', a => ({
      estado: 'concluido',
      duracao: fim - a.inicio,
    }))
    return next(e)
  })

  // fim de um workflow (ou agente) em background: a notificacao da tarefa chega como mensagem
  on('session.append', async ($, e, next) => {
    const blocos = e.message.content
    const texto = typeof blocos === 'string' ? blocos : (blocos ?? []).map(b => b.text ?? '').join('\n')
    const aviso = /<task-notification>[\s\S]*?<task-id>([^<]+)<\/task-id>[\s\S]*?<status>([^<]+)<\/status>/.exec(texto)
    if (aviso) {
      const [, tarefa, status] = aviso
      const fim = await $.clock.now()
      await mexer($, a => (a.taskId === tarefa || a.agentId === tarefa) && a.estado === 'rodando', a => ({
        estado: FIM_DE_TAREFA[status] ?? 'concluido',
        duracao: fim - a.inicio,
      }))
    }
    return next(e)
  })

  // a ferramenta que muda arquivo refaz a aba Codigo, se e ela que esta na tela
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (MUDAM.includes(e.tool) && (await read($, ABA)) === 'codigo') await atualizarCodigo($)
    return r
  })

  on('command.run', { command: PANE }, async $ => {
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'Painel da leva fechado.' }
    }
    await $.ui.open({ id: PANE, title: 'Leva' })
    return { text: 'Painel da leva aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const leva = await read($, LEVA)
    // a aba Grill mostra o ultimo grill do workspace; a aba Painel, so o que ainda esta na tela
    const ultimoGrill = await read($, GRILL)
    const grill = naTela(ultimoGrill)
    const aba = await read($, ABA)
    const arquivos = await read($, CODIGO)
    // as abas no topo, a da tela em destaque; 1 e 2 trocam com o foco no pane
    const abas = h(
      Box,
      { gap: 1, marginBottom: 1, flexWrap: 'wrap' },
      ...Object.entries(ABAS).map(([qual, nome], i) =>
        h(Button, {
          key: `aba:${qual}`,
          label: qual === 'codigo' && arquivos.length > 0 ? `${nome} (${arquivos.length})` : nome,
          hotkey: String(i + 1),
          ...(qual === aba ? { variant: 'primary' } : { dimColor: true }),
          onPress: () => trocarAba($, qual),
        }),
      ),
    )
    // o tamanho do corpo do pane; o viewport e o da tela inteira, e centralizar por ele joga o
    // desenho para baixo, fora do pane baixo
    const linhas = e.props?.scroll?.bodyRows ?? e.viewport?.rows
    const colunas = e.props?.bodyColumns ?? e.viewport?.columns
    // o fundo pinta o pane inteiro, nao so as linhas com texto: a raiz ocupa a altura do corpo
    const raiz = { flexDirection: 'column', backgroundColor: FUNDO, minHeight: linhas, paddingX: 2, paddingY: 1 }
    // a largura de dentro de um cartao: o corpo menos a margem da raiz e a do cartao
    const largura = (colunas ?? 64) - 8
    // o repouso: so o Claude dormindo, no meio do pane; a caixa de dentro mantem o desenho alinhado
    if (aba === 'painel' && !grill && !leva) {
      const zs = ZS[Math.floor((await $.clock.now()) / RONCO) % ZS.length]
      // as linhas abaixo das abas
      const livres = linhas == null ? LINHAS_DA_FRASE : linhas - LINHAS_DAS_ABAS
      const alto = livres >= LINHAS_DO_BONECO
      const comFrase = livres >= LINHAS_DA_FRASE && (colunas ?? LARGURA_DO_GRANDE) >= LARGURA_DO_GRANDE
      // no pane baixo, o boneco menor e so os dois z de baixo
      const desenho = (alto ? [...zs, ...BONECO] : [...zs.slice(1), ...BONECO_MENOR]).map(l => l.padEnd(11))
      const dosZs = alto ? 3 : 2
      return h(
        Box,
        raiz,
        abas,
        h(
          Box,
          { flexDirection: 'column', flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
          comFrase && h(Box, { marginBottom: 2 }, h(Text, { bold: true, color: 'gray' }, QUIETO_GRANDE)),
          h(Box, { flexDirection: 'column' }, ...desenho.map((l, i) => h(Text, { color: LARANJA, dimColor: i < dosZs }, l))),
        ),
      )
    }
    // o nome da aba em laranja e o titulo a esquerda; o rotulo e o valor grande (o total) a direita
    const cabecalho = (titulo, rotulo, valor) =>
      h(
        Box,
        { justifyContent: 'space-between', alignItems: 'flex-end' },
        h(Box, { flexDirection: 'column', flexShrink: 1 }, h(Text, { color: LARANJA }, ABAS[aba]), h(Text, { bold: true, color: TEXTO }, titulo)),
        h(Box, { flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 2 }, h(Text, { color: APAGADO }, rotulo), h(Text, { bold: true, color: TEXTO }, valor)),
      )
    // cada secao e um cartao preenchido um tom abaixo do fundo, com o titulo apagado
    const cartao = (titulo, ...filhos) =>
      h(Box, { flexDirection: 'column', backgroundColor: CARTAO, paddingX: 2, paddingY: 1, marginTop: 1 }, titulo && h(Text, { color: APAGADO }, titulo), ...filhos)
    // uma linha de `larg` colunas: as partes da esquerda, espaco, as da direita; cada parte e
    // [texto, props]; sem lugar, a ultima parte da esquerda encolhe com …
    const linhaLarga = (larg, esquerda, direita, props = {}) => {
      const tam = partes => partes.reduce((n, [t]) => n + t.length, 0)
      const falta = tam(esquerda) + tam(direita) + 1 - larg
      const esq = falta > 0 ? esquerda.map(([t, p], i) => (i === esquerda.length - 1 ? [`${t.slice(0, Math.max(1, t.length - falta - 1))}…`, p] : [t, p])) : esquerda
      const parte = ([t, p]) => h(Text, p ?? {}, t)
      return h(Text, { color: TEXTO, ...props }, ...esq.map(parte), h(Text, {}, ' '.repeat(Math.max(1, larg - tam(esq) - tam(direita)))), ...direita.map(parte))
    }
    // um chip da grade das fases: o fundo um tom acima do cartao, o nome a esquerda, o tempo a direita
    const chip = (larg, esquerda, direita, props) => h(Box, { backgroundColor: CHIP, paddingX: 1, width: larg }, linhaLarga(larg - 2, esquerda, direita, props))
    // a aba Codigo: um chip por arquivo, o caminho que abre e fecha o diff, e as linhas somadas e tiradas
    if (aba === 'codigo') {
      const base = await read($, BASE)
      const abertos = await read($, ABERTOS)
      const contagem = (mais, menos) => [h(Text, { color: VERDE }, `+${mais}`), ' ', h(Text, { color: VERMELHO }, `-${menos}`)]
      const arquivo = (a, i) => {
        const aberto = abertos.includes(a.caminho)
        const alternar = () => update($, ABERTOS, l => (l.includes(a.caminho) ? l.filter(c => c !== a.caminho) : [...l, a.caminho]))
        return h(
          Box,
          { flexDirection: 'column', backgroundColor: CHIP, marginTop: 1 },
          h(
            Box,
            { justifyContent: 'space-between', paddingX: 1 },
            h(Button, { key: `arquivo:${i}`, plain: true, label: `${aberto ? '⌄' : '›'} ${a.caminho}`, onPress: alternar }),
            h(Text, { wrap: 'truncate-end' }, ...contagem(a.mais, a.menos)),
          ),
          ...(!aberto
            ? []
            : a.diff
              ? pedacos(a.diff).map(source => h(Code, { source, format: 'diff', path: a.caminho }))
              : [h(Text, { color: APAGADO }, '  binário, sem diff de texto')]),
        )
      }
      const mais = arquivos.reduce((n, a) => n + a.mais, 0)
      const menos = arquivos.reduce((n, a) => n + a.menos, 0)
      const repositorio = base?.raiz.split(/[\\/]/).pop()
      return h(
        Box,
        raiz,
        abas,
        cabecalho(
          repositorio ?? 'Fora de um repositório git',
          `${arquivos.length} ${arquivos.length === 1 ? 'arquivo alterado' : 'arquivos alterados'}`,
          `+${mais} -${menos}`,
        ),
        !base
          ? cartao(null, h(Text, { color: APAGADO }, 'a sessão não começou num repositório git: não há com o que comparar'))
          : arquivos.length === 0
            ? cartao(null, h(Text, { color: APAGADO }, 'nenhum arquivo alterado nesta sessão'))
            : cartao(null, ...arquivos.map(arquivo)),
      )
    }
    const historico = await read($, HISTORICO)
    const passada = l => {
      const verdes = l.tickets.filter(t => t.estado === 'verde').length
      const reparos = l.tickets.reduce((soma, t) => soma + (t.reparos ?? 0), 0)
      const total = l.inicio != null && l.fim != null && `total ${duracao(l.fim - l.inicio)}`
      return [l.documento, total, l.modo, `${verdes}/${l.tickets.length} verdes`, `reparos ${reparos}`, ...(l.modelos ?? [])]
        .filter(Boolean)
        .join(' · ')
    }
    // o historico so aparece sob a leva fechada: com ela aberta, o espaco e do andamento
    const cartaoDoHistorico = historico.length > 0 && cartao('Histórico', ...historico.map(l => h(Text, { color: APAGADO }, passada(l))))
    const agora = await $.clock.now()
    // ticket e item: o portao (verde ✓, vermelho ✗, em curso ◐) e o tempo, alinhados a direita
    const tempoDe = t => (t.inicioEm != null && (t.fimEm != null || t.estado === 'em-curso') ? duracao((t.fimEm ?? agora) - t.inicioEm) : '')
    const portao = (t, rotulo) => {
      if (t.estado === 'pendente') return ['pendente', APAGADO]
      if (t.estado === 'em-curso') return [`${t.detalhe ? `${t.detalhe} ` : ''}em curso ◐`, LARANJA]
      const reparos = t.reparos ? ` · ${t.reparos} ${t.reparos === 1 ? 'reparo' : 'reparos'}` : ''
      return [`${rotulo}${t.estado === 'verde' ? '✓' : '✗'}${reparos}`, t.estado === 'verde' ? VERDE : VERMELHO]
    }
    const linha = (t, esquerda, rotulo) => {
      const [texto, cor] = portao(t, rotulo)
      return linhaLarga(largura, esquerda, [[texto, { color: cor }], ['  '], [tempoDe(t).padStart(6), { color: APAGADO }]])
    }
    const ticket = t => linha(t, [[t.id.padEnd(Math.max(4, t.id.length + 2)), { color: APAGADO }], [t.titulo]], `portão ${t.testes ? `${t.testes} ` : ''}`)
    const item = i => linha(i, [[i.titulo]], i.detalhe ? `${i.detalhe} ` : '')
    // a aba Tickets: a linha do ticket, como na aba Painel, e embaixo as notas do que ele entregou
    if (aba === 'tickets') {
      if (!leva) {
        return h(Box, raiz, abas, cabecalho('Nenhuma leva neste workspace', 'verdes', '—'), cartao(null, h(Text, { color: APAGADO }, 'os tickets aparecem quando o to-tickets publica')))
      }
      const verdes = leva.tickets.filter(t => t.estado === 'verde').length
      const comNotas = (t, i) =>
        h(
          Box,
          { flexDirection: 'column', marginTop: i > 0 ? 1 : 0 },
          ticket(t),
          h(Box, { paddingLeft: 4 }, h(Text, { color: t.notas ? TEXTO : APAGADO }, t.notas ?? 'sem notas ainda')),
        )
      return h(
        Box,
        raiz,
        abas,
        cabecalho(leva.documento, 'verdes', `${verdes}/${leva.tickets.length}`),
        cartao(null, ...(leva.tickets.length > 0 ? leva.tickets.map(comNotas) : [h(Text, { color: APAGADO }, 'nenhum ticket publicado ainda')])),
      )
    }
    // a aba Uso: os tokens desde o inicio da leva (ou da sessao), por modelo e por agente
    if (aba === 'uso') {
      const uso = Object.entries(await read($, USO))
      const agentes = await read($, AGENTES)
      const total = u => TOKENS.reduce((n, k) => n + u[k], 0)
      const porModelo = {}
      for (const [, u] of uso) {
        const antes = porModelo[u.modelo] ?? {}
        porModelo[u.modelo] = Object.fromEntries(TOKENS.map(k => [k, (antes[k] ?? 0) + u[k]]))
      }
      const colunas = (...valores) => valores.map(v => [v.padStart(9)])
      const modelo = ([nome, u]) =>
        linhaLarga(largura, [[nome || 'modelo desconhecido']], colunas(tokens(u.input_tokens), tokens(u.output_tokens), tokens(u.cache_read_input_tokens + u.cache_creation_input_tokens)))
      const nomeDo = id => (id === 'sessao' ? 'sessão principal' : (agentes.find(a => a.agentId === id)?.nome ?? `agente ${id.slice(0, 8)}`))
      const loop = ([id, u]) => linhaLarga(largura, [[nomeDo(id)]], [[u.modelo, { color: AZUL }], ['  '], [tokens(total(u)).padStart(7)]])
      return h(
        Box,
        raiz,
        abas,
        cabecalho(leva?.documento ?? 'Sessão', 'tokens', tokens(uso.reduce((n, [, u]) => n + total(u), 0))),
        ...(uso.length === 0
          ? [cartao(null, h(Text, { color: APAGADO }, 'nenhum turno terminou ainda'))]
          : [
              cartao('Por modelo', linhaLarga(largura, [['']], colunas('entrada', 'saída', 'cache'), { color: APAGADO }), ...Object.entries(porModelo).map(modelo)),
              cartao('Por agente', ...uso.map(loop)),
            ]),
      )
    }
    // a aba Grill: cada pergunta inteira com a resposta embaixo, o entendimento e a linha da leva
    if (aba === 'grill') {
      const g = ultimoGrill
      if (!g) {
        return h(Box, raiz, abas, cabecalho('Nenhum grill neste workspace', 'perguntas', '0'), cartao(null, h(Text, { color: APAGADO }, 'o /faz <pedido> abre um')))
      }
      const respondidas = g.perguntas.filter(p => p.resposta != null).length
      const resposta = p =>
        p.resposta == null
          ? h(Text, { color: LARANJA }, '▸ aguardando')
          : h(Text, { color: p.resposta === 'sem resposta' ? APAGADO : VERDE }, `${p.resposta === 'sem resposta' ? '·' : '✓'} ${p.resposta}`)
      const par = (p, i) =>
        h(Box, { flexDirection: 'column', marginTop: i > 0 ? 1 : 0 }, h(Text, { color: APAGADO }, p.tema), h(Text, { bold: true, color: TEXTO }, p.pergunta), resposta(p))
      return h(
        Box,
        raiz,
        abas,
        cabecalho(g.pedido, g.documento ? 'concluído' : 'em curso', duracao((g.fim ?? agora) - g.inicio)),
        cartao(
          `Perguntas e respostas · ${respondidas}/${g.perguntas.length}`,
          ...(g.perguntas.length > 0 ? g.perguntas.map(par) : [h(Text, { color: APAGADO }, 'nenhuma pergunta ainda')]),
        ),
        g.documento && cartao('Entendimento', h(Text, { color: VERDE }, g.documento)),
        g.linha && cartao('Linha da leva · cole numa sessão nova', h(Code, { source: g.linha })),
      )
    }
    // o grill e sempre mais novo que a leva na tela: o inicio de uma leva o apaga
    if (grill) {
      const respondidas = grill.perguntas.filter(p => p.resposta != null).length
      const pergunta = p =>
        p.resposta == null
          ? h(Text, { color: LARANJA }, `▸ ${p.tema} — aguardando`)
          : h(Text, { color: p.resposta === 'sem resposta' ? APAGADO : VERDE }, `${p.resposta === 'sem resposta' ? '·' : '✓'} ${p.tema} — ${p.resposta}`)
      return h(
        Box,
        raiz,
        abas,
        cabecalho(`Grill · ${grill.pedido}`, grill.documento ? 'concluído' : 'em curso', duracao((grill.fim ?? agora) - grill.inicio)),
        // ponytail: as 15 ultimas; um grill mais longo que o pane rola para fora por cima
        grill.perguntas.length > 0 && cartao(`Perguntas · ${respondidas}/${grill.perguntas.length} respondidas`, ...grill.perguntas.slice(-15).map(pergunta)),
        grill.documento &&
          cartao('Entendimento', h(Text, { color: VERDE }, grill.documento), h(Text, { color: APAGADO }, grill.linha ? 'a linha da leva está na aba Grill: cole numa sessão nova' : 'cole a linha da leva numa sessão nova')),
      )
    }
    const ate = leva.fim ?? agora
    // uma fase dura da sua entrada ate a entrada seguinte, ou ate agora (o fim, se fechada)
    const entradas = leva.entradas ?? {}
    const tempoDaFase = f => {
      const desde = entradas[f]
      if (desde == null) return ''
      return duracao(Math.min(ate, ...Object.values(entradas).filter(t => t > desde)) - desde)
    }
    const skills = await read($, SKILLS)
    // feita e a fase que a leva ja deixou, ou todas as que passou quando fechada
    const feita = f => leva.fases.includes(f) && (f !== leva.fase || leva.fechada)
    // a grade das fases: tres chips por linha onde cabem, senao dois, senao um
    const porLinha = largura >= 68 ? 3 : largura >= 37 ? 2 : 1
    const larguraDoChip = Math.floor((largura - (porLinha - 1)) / porLinha)
    const chipDaFase = f => {
      const atual = f === leva.fase && !leva.fechada
      const [estado, cor] = feita(f) ? [`${tempoDaFase(f)} ✓`, VERDE] : atual ? [`${tempoDaFase(f)} ◐`, LARANJA] : ['—', APAGADO]
      const falta = leva.fases.includes(f) && semSkill(f, skills)
      return chip(larguraDoChip, [[ROTULO[f]], ...(falta ? [[' !', { color: AMARELO, bold: true }]] : [])], [[estado, { color: cor }]], {
        bold: atual,
        color: leva.fases.includes(f) ? TEXTO : APAGADO,
      })
    }
    const fases = FASES.filter(f => ROTULO[f])
    const linhasDeFases = Array.from({ length: Math.ceil(fases.length / porLinha) }, (_, i) => fases.slice(i * porLinha, (i + 1) * porLinha))
    const agentes = await read($, AGENTES)
    const visiveis = [...agentes.filter(a => a.estado === 'rodando'), ...agentes.filter(a => a.estado !== 'rodando').slice(-5)]
    const agente = a => {
      const [estado, cor] = DO_AGENTE[a.estado]
      return linhaLarga(largura, [[a.nome]], [
        ...(a.modelo ? [[a.modelo, { color: AZUL }], ['  ']] : []),
        [estado.padEnd(9), { color: cor }],
        ['  '],
        [duracao(a.duracao ?? agora - a.inicio).padStart(6), { color: APAGADO }],
      ])
    }
    return h(
      Box,
      raiz,
      abas,
      cabecalho(`Leva · ${leva.documento}`, 'total', leva.inicio != null ? duracao(ate - leva.inicio) : '—'),
      leva.fechada &&
        (leva.cpv == null
          ? h(Text, { color: AMARELO }, 'leva fechada, falta o /cpv')
          : h(Text, { color: VERDE }, 'leva fechada, /cpv rodou')),
      cartao('Fases', h(Box, { flexDirection: 'column', gap: 1 }, ...linhasDeFases.map(fs => h(Box, { gap: 1 }, ...fs.map(chipDaFase))))),
      leva.tickets.length > 0 && cartao('Tickets', ...leva.tickets.map(ticket)),
      ...Object.entries(FASES_COM_ITENS).map(([f, titulo]) => {
        const itens = (leva.itens ?? []).filter(i => i.fase === f)
        return itens.length > 0 && cartao(titulo, ...itens.map(item))
      }),
      visiveis.length > 0 && cartao('Sub-agentes', ...visiveis.map(agente)),
      leva.fechada && cartaoDoHistorico,
    )
  })
}
