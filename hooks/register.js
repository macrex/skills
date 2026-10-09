// Painel da leva: o mod do Claude Code que desenha a leva do workspace num pane ao lado da
// conversa. Carregado por "modules" no hooks/hooks.json; sem JSX (o arquivo e .js), as arvores
// saem do `h` global.
//
// A leva grava o estado pela ferramenta faz_marco (quando, dizem skills/faz/references/painel.md
// e, para os marcos do grill, interrogatorio.md), no $.store do plugin, um por workspace; o
// desenho le do $.state (types/index.d.ts), que sobrevive a hot reload. Os agentes e workflows vem
// dos hooks do Agent, do Workflow, do fim de turno e da notificacao de tarefa, e os agentes se
// acertam pela lista oficial ($.agent.list) a cada segundo da leva. O grill do /faz
// (movimento 1) vem antes da leva: os marcos
// grill, entendimento e linha, as perguntas do AskUserQuestion pelo tema (o header) e as rodadas
// da grill-tela pelo estado da pagina dela. Com a opcao grill_canal = tela, o AskUserQuestion do
// grill vai a pagina da grill-tela (pelaTela).

import { atom, read, update } from 'claude-code'
import { soComPedido } from './so-com-pedido.js'

const PANE = 'painel-macrex'
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
const SKILL_DA_FASE = { spec: 'to-spec', tickets: 'to-tickets', implement: 'implement', revisao: 'code-review' }
// o nome de cada fase no chip, o da skill que a cumpre; o fechamento nao vira chip, vira o aviso do /cpv
const ROTULO = { ...SKILL_DA_FASE, correcoes: 'correções', qualidade: 'qualidade' }
const FIM_DE_TAREFA = { completed: 'concluido', failed: 'falhou', killed: 'parado', stopped: 'parado' }
const DO_AGENTE = { rodando: ['rodando', LARANJA], aguardando: ['aguardando', AMARELO], concluido: ['concluído', VERDE], falhou: ['falhou', VERMELHO], parado: ['parado', APAGADO] }
// o status da lista oficial ($.agent.list) no estado do painel; um status fora daqui nao mexe no agente
const DA_LISTA = { pending: 'rodando', running: 'rodando', waiting: 'aguardando', idle: 'aguardando', completed: 'concluido', failed: 'falhou', killed: 'parado' }
const VIVOS = ['rodando', 'aguardando']
// o agente rodando sem ferramenta ha mais que isto mostra ha quanto tempo esta sem saida
const SEM_SAIDA = 2 * 60 * 1000

const LEVA = atom({ plugin: 'macrex-skills', key: 'leva' }, null)
// Os agentes e workflows da leva, so na sessao (nao vao ao $.store).
const AGENTES = atom({ plugin: 'macrex-skills', key: 'agentes' }, [])
// A conferencia das skills: as skills da leva que esta sessao invocou, so na sessao; a leva as
// invoca logo depois do localizador, antes do inicio, e a sessao nova de uma retomada as recarrega.
const SKILLS = atom({ plugin: 'macrex-skills', key: 'skills' }, [])
// As ultimas levas fechadas do workspace, carregadas do $.store no inicio da sessao.
const HISTORICO = atom({ plugin: 'macrex-skills', key: 'historico' }, [])
// O grill do movimento 1 desta janela: cada grill do workspace fica no $.store pelo id dele, e a janela
// lembra o seu (o id vai junto pelo /clear).
const GRILL = atom({ plugin: 'macrex-skills', key: 'grill' }, null)
// Se o grill foi aberto nesta sessao (pelo marco grill ou pelo grilling da /faz), so no $.state:
// o grill que o store traz de outra sessao, talvez abandonado, nao leva o AskUserQuestion a pagina.
const GRILL_DA_SESSAO = atom({ plugin: 'macrex-skills', key: 'grillDaSessao' }, false)
// A aba do pane, so na sessao.
const ABA = atom({ plugin: 'macrex-skills', key: 'aba' }, 'painel')
// A base da aba Diff, tirada no inicio da sessao; os arquivos que a sessao mudou desde ela, e os abertos.
const BASE = atom({ plugin: 'macrex-skills', key: 'base' }, null)
const CODIGO = atom({ plugin: 'macrex-skills', key: 'codigo' }, [])
const ABERTOS = atom({ plugin: 'macrex-skills', key: 'abertos' }, [])
// A aba Arquivos, so na sessao: a arvore do projeto lida do git, as pastas abertas e o filtro.
const ARVORE = atom({ plugin: 'macrex-skills', key: 'arvore' }, null)
const PASTAS = atom({ plugin: 'macrex-skills', key: 'pastas' }, [])
const FILTRO = atom({ plugin: 'macrex-skills', key: 'filtro' }, '')
// Os tokens de cada turno desde o inicio da leva (ou da sessao, antes dela), so na sessao.
const USO = atom({ plugin: 'macrex-skills', key: 'uso' }, {})
// A ultima medida da sessao (session.measure): o custo, o contexto e a janela de 5 h, so na sessao.
const MEDIDA = atom({ plugin: 'macrex-skills', key: 'medida' }, null)
const ABAS = { painel: 'Painel', codigo: 'Diff', grill: 'Grill', tickets: 'Tickets', uso: 'Uso', arquivos: 'Arquivos' }
const TOKENS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']
// os caracteres de controle que um Code recusa: todos menos tab e quebra de linha
const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/g
// a linha das abas e a margem embaixo dela
const LINHAS_DAS_ABAS = 2
// as ferramentas que mudam arquivo: depois de cada uma, a aba Diff ou a Arquivos aberta se refaz
const MUDAM = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell']
// o maior source que um Code desenha e 10000; a folga e do cabecalho recontado
const LIMITE_DO_CODE = 9900
// a pagina de um grill na grill-tela: todo comando `grill-tela.js <subcomando> <url>` leva a URL dela
const URL_DA_TELA = /http:\/\/127\.0\.0\.1:\d+\/g\/[^/\s?]+\/\d{8}-\d{6}\?t=[0-9a-f]+/
// a API de um grill fica debaixo do caminho dele: a mesma regra do cliente da grill-tela
const rotaDa = (url, rota) => url.replace(/\/?\?t=/, `/api/${rota}?t=`)

const chave = cwd => `leva:${cwd}`
const chaveDoHistorico = cwd => `levas:${cwd}`
const chaveDoGrill = (cwd, id) => `grill:${cwd}:${id}`
// a chave de quando o grill era um por workspace, lida uma vez e trocada pela do id
const chaveAntigaDoGrill = cwd => `grill:${cwd}`
const GRILLS_POR_WORKSPACE = 10
const novoId = agora => `${Number(agora).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
// a skill da fase que esta sessao ainda nao invocou, ou undefined
const semSkill = (fase, skills) => (skills.includes(SKILL_DA_FASE[fase]) ? undefined : SKILL_DA_FASE[fase])
// um inicio com o mesmo documento sobre a leva aberta e a retomada dela
const retoma = (leva, m) => m.marco === 'inicio' && Boolean(leva) && !leva.fechada && leva.documento === m.documento
const dois = n => String(n).padStart(2, '0')
// a ultima parte de um caminho, com / ou \: o nome do projeto pela raiz
const nomeDa = caminho => caminho.split(/[\\/]/).pop()
const verdes = leva => leva.tickets.filter(t => t.estado === 'verde').length
// a contagem da faixa e do spinner, uma so: o ticket em curso sobre o total (sem um em curso, o
// ultimo que comecou); os verdes ficam no painel
function ticketDaLeva(leva) {
  const n = leva.tickets.length
  if (n === 0) return ''
  const emCurso = leva.tickets.findIndex(t => t.estado === 'em-curso')
  return `ticket ${emCurso >= 0 ? emCurso + 1 : leva.tickets.filter(t => t.estado !== 'pendente').length}/${n}`
}
const somar = (a = {}, b) => Object.fromEntries(TOKENS.map(k => [k, (a[k] ?? 0) + (b[k] ?? 0)]))
// o custo medido da leva: o da sessao agora menos o do inicio; sem custo na sessao, nada
const comCusto = (leva, usd) => (usd == null || leva.custoInicio == null ? leva : { ...leva, custo: usd - leva.custoInicio })
const dolares = usd => `US$ ${usd.toFixed(2).replace('.', ',')}`
const porcento = p => `${String(p).replace('.', ',')}%`
// o tempo ate a janela resetar, sem os segundos: 1h40, 25min
function ateResetar(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${dois(m % 60)}`
}

// O estado da leva que a compactacao pede ao resumo, no teto de ~600 tokens (~4 caracteres cada);
// a nota so dos verdes, cortada, e o que passa do teto sai do fim (os ultimos tickets)
const TETO_DA_COMPACTACAO = 2300
const NOTA_NA_COMPACTACAO = 200
function levaNaCompactacao(leva) {
  const nota = n => (n.length > NOTA_NA_COMPACTACAO ? `${n.slice(0, NOTA_NA_COMPACTACAO - 1)}…` : n)
  const linhas = [
    'Preserve literalmente no resumo este estado da leva do /faz, que segue depois da compactacao:',
    `documento: ${leva.documento}`,
    `fase: ${leva.fase}${leva.modo ? ` · modo: ${leva.modo}` : ''}`,
    `sujos: ${(leva.sujos ?? []).join(', ') || 'nenhum'}`,
    ...leva.tickets.map(t => {
      const reparos = t.reparos ? `, ${t.reparos} ${t.reparos === 1 ? 'reparo' : 'reparos'}` : ''
      return `${t.id} ${t.titulo}: ${t.estado}${reparos}${t.estado === 'verde' && t.notas ? ` — ${nota(t.notas)}` : ''}`
    }),
  ]
  const bloco = linhas.join('\n')
  return bloco.length > TETO_DA_COMPACTACAO ? `${bloco.slice(0, TETO_DA_COMPACTACAO - 1)}…` : bloco
}

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

// Aplica um marco ao estado na hora `agora`, com o custo da sessao `usd` (no inicio e no
// fechamento); devolve o estado novo ou { erro } sem tocar no antigo.
function aplicar(leva, m, agora, usd) {
  if (m.marco === 'inicio') {
    if (typeof m.documento !== 'string' || !m.documento.trim()) return { erro: 'inicio exige documento (titulo da nota ou caminho)' }
    if (m.sujos != null && !(Array.isArray(m.sujos) && m.sujos.every(s => typeof s === 'string'))) {
      return { erro: 'sujos exige uma lista de caminhos (o git status --porcelain de antes da leva)' }
    }
    // a retomada guarda tudo, inclusive os sujos do inicio original e o custo, que o carregar ja
    // rebaseou na sessao nova
    if (retoma(leva, m)) return leva
    const sujos = m.sujos ?? []
    return { documento: m.documento, fase: 'spec', fases: ['spec'], entradas: { spec: agora }, inicio: agora, tickets: [], sujos, fechada: false, custoInicio: usd }
  }
  if (!MARCOS.includes(m.marco)) return { erro: `marco desconhecido: ${m.marco}; use ${MARCOS.join(', ')}` }
  if (!leva) return { erro: 'nenhuma leva neste workspace: registre o marco inicio antes' }
  if (['ticket', 'portao'].includes(m.marco) && !leva.tickets.some(t => t.id === String(m.ticket))) return { erro: `ticket inexistente: ${m.ticket}` }
  // a fase guarda a hora da primeira entrada; voltar a ela nao zera o tempo
  const fase = f => ({
    ...leva,
    fase: f,
    fases: leva.fases.includes(f) ? leva.fases : [...leva.fases, f],
    entradas: { [f]: agora, ...leva.entradas },
  })
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
      return {
        ...leva,
        tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, estado: 'em-curso', inicioEm: t.inicioEm ?? agora } : t)),
      }
    case 'portao': {
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
      return { ...comCusto(fase('fechamento'), usd), fechada: true, fim: agora }
  }
}

// Aplica um marco do grill; devolve o grill novo ou { erro } sem tocar no antigo.
function aplicarNoGrill(grill, m, agora) {
  if (m.marco === 'grill') {
    if (typeof m.pedido !== 'string' || !m.pedido.trim()) return { erro: 'grill exige o pedido em poucas palavras' }
    return { id: novoId(agora), pedido: m.pedido, inicio: agora, perguntas: [] }
  }
  if (!grill) return { erro: 'nenhum grill neste workspace: registre o marco grill antes' }
  if (m.marco === 'linha') {
    if (typeof m.linha !== 'string' || !m.linha.trim() || m.linha.length > 4000) return { erro: 'linha exige a linha da leva inteira, ate 4000 caracteres' }
    return { ...grill, linha: m.linha.replace(CONTROLE, '') }
  }
  if (typeof m.documento !== 'string' || !m.documento.trim()) return { erro: 'entendimento exige documento (titulo da nota ou caminho)' }
  return { ...grill, documento: m.documento, fim: agora }
}

// Grava o grill desta janela na chave do id dele.
async function salvarGrill($, grill) {
  await $.store.set(chaveDoGrill(await $.session.root(), grill.id), grill)
}
// Os grills do workspace no store, do mais novo ao mais velho.
async function grillsDo($, raiz) {
  const chaves = (await $.store.keys()).filter(k => k.startsWith(`grill:${raiz}:`))
  const grills = await Promise.all(chaves.map(k => $.store.get(k)))
  return grills.filter(Boolean).sort((a, b) => (b.inicio ?? 0) - (a.inicio ?? 0))
}
// O grill novo do workspace: grava e apaga os que passam dos mais recentes.
async function salvarGrillNovo($, grill) {
  await salvarGrill($, grill)
  const raiz = await $.session.root()
  for (const velho of (await grillsDo($, raiz)).slice(GRILLS_POR_WORKSPACE)) await $.store.delete(chaveDoGrill(raiz, velho.id))
}

// o grill que a aba Painel mostra: o que o inicio da leva nao tirou de la
const naTela = grill => (grill && !grill.fora ? grill : null)

// Tira o grill da aba Painel quando a leva comeca; a aba Grill o guarda ate o Limpar.
async function tirarGrillDaTela($) {
  const grill = await read($, GRILL)
  if (!naTela(grill)) return
  const fora = { ...grill, fora: true }
  await salvarGrill($, fora)
  await update($, GRILL, () => fora)
}

// As rodadas da grill-tela no grill, pelo estado da pagina: a rodada aberta entra aguardando, a
// respondida traz a escolha (e o comentario); a pergunta que ja esta no grill muda no lugar, a
// nova entra no fim. A pagina que voltou ao CLI ou terminou encerra a consulta (telaFim); a URL
// fica no grill, para o cartao do grill na tela. A consulta que falha so pula a volta: o servidor
// e um so por maquina e persiste, e a falha passageira nao para a consulta.
async function sincronizarTela($) {
  const daTelaAgora = await read($, GRILL)
  const url = daTelaAgora?.tela
  if (!url || daTelaAgora.telaFim) return
  let estado = null
  try {
    const r = await $.http.fetch(rotaDa(url, 'estado'))
    if (r.ok) estado = JSON.parse(r.text)
  } catch {}
  const abertas = estado?.fase === 'rodada' && estado.rodada ? [{ rodada: estado.rodada }] : []
  const daTela = [...(estado?.historico ?? []), ...abertas].flatMap(({ rodada, respostas }) =>
    rodada.questoes.map(q => {
      const r = respostas?.find(x => x.id === q.id)
      // sem escolha (delegado, esclarecer, adiado), a marca faz as vezes dela
      const escolha = r && (r.escolha ?? r.marca)
      return { id: `tela:${rodada.rodada}:${q.id}`, pergunta: q.titulo, tema: q.cabecalho, ...(r && { resposta: r.comentario ? `${escolha} (${r.comentario})` : escolha }) }
    }),
  )
  // a mescla e sobre o grill de agora: o que chegou durante a consulta (o entendimento, o fora do
  // inicio, o Limpar) fica
  let mudou = false
  const novo = await update($, GRILL, grill => {
    if (grill?.tela !== url) return grill
    const perguntas = [...grill.perguntas.map(p => daTela.find(t => t.id === p.id) ?? p), ...daTela.filter(t => !grill.perguntas.some(p => p.id === t.id))]
    // a pagina que voltou ao CLI (o Seguir no terminal, mesmo entre rodadas) leva o grill ao canal cli
    const proximo = { ...grill, perguntas, ...(estado?.fase === 'cli' && { canal: 'cli' }), ...(['cli', 'concluido'].includes(estado?.fase) && { telaFim: true }) }
    mudou = JSON.stringify(proximo) !== JSON.stringify(grill)
    return mudou ? proximo : grill
  })
  if (mudou) await salvarGrill($, novo)
}

// O AskUserQuestion do grill no canal tela: a rodada vai a pagina da grill-tela, que sobe na
// primeira, e a resposta dela volta no formato do dialogo, com a URL para a tela final da skill;
// a consulta da pagina a registra no grill. A pagina que nao sobe, recusa a rodada ou volta ao CLI,
// e a interrupcao, devolvem { motivo }: o grill segue pelo dialogo nativo ate o fim, e o toast e o
// contexto dizem por que.
// ponytail: multiSelect vira escolha unica, a pagina nao tem outra
const RECOMENDADA = /\s*\(Recommended\)$/
// a resposta sem escolha volta com o rotulo do botao que o usuario apertou na pagina
const NAO_RESPOSTA = { delegado: 'Decida você', esclarecer: 'Não entendi', adiado: 'Adiar' }
// um subcomando da grill-tela; o que nem roda volta como falha
const rodarTela = ($, args, init) =>
  $.process.run(['node', `${$.plugin.root}/skills/grill-tela/scripts/grill-tela.js`, ...args], init).catch(() => ({ exitCode: 1, stdout: '' }))
async function pelaTela($, e, signal) {
  const grill = await read($, GRILL)
  const projeto = nomeDa(await $.session.root())
  const iniciar = async (...mais) => URL_DA_TELA.exec((await rodarTela($, ['iniciar', '--projeto', projeto, ...mais])).stdout)?.[0]
  const outro = () => iniciar('--pedido', grill.pedido)
  const responde = async u => {
    try {
      return (await $.http.fetch(rotaDa(u, 'estado'))).ok
    } catch {
      return false
    }
  }
  // a pagina guardada que parou de responder volta pelo --retomar do grill dela, ou sobe outra; a
  // que responde mas ja encerrou o grill dela (telaFim) recusaria a rodada, e sobe outra; todas
  // abrem o navegador
  let url = grill.tela
  if (url && !(await responde(url))) url = (await iniciar('--retomar', '--id', /\/(\d{8}-\d{6})\?/.exec(url)?.[1] ?? '')) ?? (await outro())
  else if (!url || grill.telaFim) url = await outro()
  // a rodada seguinte a ultima que a pagina publicou neste grill
  const n = 1 + Math.max(0, ...grill.perguntas.map(p => Number(/^tela:(\d+):/.exec(p.id)?.[1] ?? 0)))
  const questoes = e.questions.map((q, i) => {
    const marcada = Math.max(0, q.options.findIndex(o => RECOMENDADA.test(o.label)))
    return {
      id: `Q${i + 1}`,
      cabecalho: q.header || q.question,
      titulo: q.question,
      opcoes: q.options.map((o, j) => ({ rotulo: o.label.replace(RECOMENDADA, ''), descricao: o.description, recomendada: j === marcada, ...(o.preview && { previa: o.preview }) })),
    }
  })
  let msg = null
  const textos = [] // o que o usuario escreveu a parte na pagina, com a rodada aberta
  const publicada = url && (await rodarTela($, ['rodada', url, '-'], { stdin: JSON.stringify({ rodada: n, questoes }) })).exitCode === 0
  if (publicada) {
    await update($, GRILL, g => g && { ...g, tela: url, telaFim: false })
    await sincronizarTela($)
    // o aviso de onde a rodada esta, antes de esperar: o navegador pode nao ter aberto
    $.ui.toast(`Grill na tela: ${url}`)
    // cada volta do aguardar e um $ e nao conta no orcamento do hook; a interrupcao nao espera a volta
    const parou = new Promise(ok => (signal.aborted ? ok(null) : signal.addEventListener('abort', () => ok(null), { once: true })))
    do {
      const saida = await Promise.race([rodarTela($, ['aguardar', url, '--ate', '120'], { timeoutMs: 150_000 }), parou])
      try {
        msg = saida && JSON.parse(saida.stdout.trim().split('\n').pop())
      } catch {
        msg = null
      }
      if (msg?.tipo === 'texto') textos.push(msg.texto)
    } while ((msg?.tipo === 'pendente' || msg?.tipo === 'texto') && !signal.aborted)
  }
  if (msg?.tipo === 'rodada' && msg.rodada === n && !signal.aborted) {
    await sincronizarTela($)
    const answers = Object.fromEntries(
      e.questions.map((q, i) => {
        const r = msg.respostas.find(x => x.id === `Q${i + 1}`)
        const escolha = r?.escolha ?? NAO_RESPOSTA[r?.marca] ?? 'sem resposta'
        return [q.question, r?.comentario ? `${escolha} (${r.comentario})` : escolha]
      }),
    )
    const aParte = textos.map(t => `O usuário escreveu à parte na grill-tela, antes de responder: ${t}`)
    return { result: { questions: e.questions, answers }, context: [`A rodada foi respondida na grill-tela, em ${url}: a tela final do grill vai a esta URL.`, ...aParte] }
  }
  // de volta ao CLI: a pagina e avisada, e a rodada que ficou aberta nela sai da aba Grill; a URL fica no cartao
  const motivo = !url
    ? 'a página da grill-tela não subiu'
    : !publicada
      ? 'a página recusou a rodada'
      : signal.aborted
        ? 'a rodada foi interrompida'
        : msg?.tipo === 'cli'
          ? 'o usuário voltou ao terminal pela página'
          : 'a página parou de responder'
  $.ui.toast(`Grill de volta ao terminal: ${motivo}`)
  if (url) await rodarTela($, ['cli', url])
  const novo = await update($, GRILL, g => {
    if (!g) return g
    return { ...g, telaFim: true, canal: 'cli', perguntas: g.perguntas.filter(p => p.resposta != null || !p.id.startsWith(`tela:${n}:`)) }
  })
  if (novo) await salvarGrill($, novo)
  return { motivo }
}

// O Abrir do cartao do grill na tela e o Historico da aba Grill: a grill-tela sobe o servidor se ele caiu e
// abre o navegador; o toast diz o que nao deu. O servidor que subiu noutra porta muda a URL, e o
// grill passa a guardar a de agora.
async function abrirTela($, url) {
  const r = await rodarTela($, ['abrir', url])
  if (r.exitCode !== 0) return $.ui.toast('Não deu para abrir o grill na tela')
  const agora = URL_DA_TELA.exec(r.stdout)?.[0]
  if (!agora || agora === url) return
  const novo = await update($, GRILL, g => (g?.tela === url ? { ...g, tela: agora } : g))
  if (novo?.tela === agora) await salvarGrill($, novo)
}
async function abrirHistorico($) {
  const raiz = /http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/.exec((await rodarTela($, ['historico'])).stdout)?.[0]
  $.ui.toast(raiz ? `Histórico de grills: ${raiz}` : 'Não deu para abrir o histórico de grills')
}

// O que tem store volta dele: a leva, o historico e o grill, gravados pela raiz do projeto
// ($.session.root()), que o cd do shell nao move. O grill e o desta janela (`idDoGrill`), senao o
// mais recente do workspace, para a janela nova poder executar o prompt da leva. O custo da sessao
// nova recomeca: o inicio do custo da leva aberta passa a ser o de agora menos o que ela ja custou,
// antes do primeiro session.measure dela.
async function carregar($, raiz, idDoGrill) {
  const salva = await $.store.get(chave(raiz))
  const usd = salva && !salva.fechada ? await $.session.usage().then(u => u.cost?.usd, () => undefined) : undefined
  if (salva) await update($, LEVA, () => (usd == null ? salva : { ...salva, custoInicio: usd - (salva.custo ?? 0) }))
  const historico = await $.store.get(chaveDoHistorico(raiz))
  if (historico) await update($, HISTORICO, () => historico)
  const antigo = await $.store.get(chaveAntigaDoGrill(raiz))
  if (antigo) {
    const comId = { ...antigo, id: antigo.id ?? novoId(antigo.inicio ?? 0) }
    await $.store.set(chaveDoGrill(raiz, comId.id), comId)
    await $.store.delete(chaveAntigaDoGrill(raiz))
  }
  const grill = (idDoGrill && (await $.store.get(chaveDoGrill(raiz, idDoGrill)))) || (await grillsDo($, raiz))[0]
  if (grill) await update($, GRILL, () => grill)
}

// O prompt da leva como sugestao da caixa, que o Tab pega e o Enter envia como digitado (o
// $.prompt.submit chega como do plugin e nao autoriza as skills reservadas): depois do /clear,
// o do grill que nenhuma leva executou, aberta ou fechada; no inicio ou na retomada da sessao, o
// da leva aberta que nasceu do grill. Sem await: a sugestao espera o dialogo que segura a caixa,
// e a que falha so nao aparece.
async function sugerirLinha($, depoisDoClear) {
  const grill = await read($, GRILL)
  if (!grill?.linha) return
  const leva = await read($, LEVA)
  // a leva do documento do grill que comecou depois dele; uma leva velha do mesmo documento nao conta
  const executada = Boolean(leva && leva.documento === grill.documento && !(leva.inicio < grill.inicio))
  const doGrill = executada && !leva.fechada
  if (depoisDoClear ? !executada : doGrill) $.prompt.suggest({ text: grill.linha }).catch(() => {})
}

// O botao Limpar da aba Painel, sempre ao lado do titulo e o unico que limpa (o /clear nao mexe no
// painel): o grill desta janela sai de todas as abas e do store (o de outra janela fica), e a leva, aberta ou fechada, sai com os
// agentes e o uso dela; o historico fica para a proxima fechada. A leva aberta limpa perde a retomada.
async function limpar($) {
  const raiz = await $.session.root()
  const grill = await read($, GRILL)
  if (grill?.id) await $.store.delete(chaveDoGrill(raiz, grill.id))
  await update($, GRILL, () => null)
  await $.store.delete(chave(raiz))
  await update($, LEVA, () => null)
  await update($, AGENTES, () => [])
  await update($, USO, () => ({}))
}

// O stdout do git na pasta `cwd`, ou '' quando sai com codigo acima de `aceito` (o diff
// --no-index sai 1 quando ha diferenca) ou nem roda (sem git); quotePath desligado guarda os
// acentos dos caminhos.
async function git($, cwd, args, aceito = 0) {
  const r = await $.process.run(['git', '-c', 'core.quotePath=false', ...args], { cwd }).catch(() => ({ exitCode: 1, stdout: '' }))
  return r.exitCode <= aceito ? r.stdout : ''
}
const naoRastreados = async ($, raiz) => (await git($, raiz, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)

// Tira a base da aba Diff uma vez por sessao: o hot reload roda o session.start de novo.
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

// O diff do git em arquivos: o caminho, as linhas somadas e tiradas, e os hunks sem CONTROLE (o \r inclusive).
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

// Refaz a lista da aba Diff: o working tree contra a base, e os nao rastreados novos inteiros.
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

// Le a arvore do projeto: os arquivos da raiz que o git nao ignora, sem os apagados do working
// tree. So troca quando os caminhos ou as marcas mudaram, entao editar um arquivo so acende a marca
// dele: o solto que a base da sessao nao tinha e novo, o que mudou desde a base (o diff contra o
// commit dela) e mudado.
// ponytail: a marca so com a raiz no topo do repositorio da base; numa subpasta os caminhos nao casam
const semBarra = c => c.replace(/\\/g, '/').toLowerCase()
async function lerArvore($) {
  const raiz = await $.session.root()
  try {
    const topo = (await git($, raiz, ['rev-parse', '--show-toplevel'])).trim()
    if (!topo) return update($, ARVORE, () => ({ semGit: true, arquivos: [], novos: [], mudados: [] }))
    const lista = async args => (await git($, raiz, ['ls-files', ...args, '-z'])).split('\0').filter(Boolean)
    const [rastreados, soltos, apagados] = await Promise.all([lista(['--cached']), naoRastreados($, raiz), lista(['--deleted'])])
    const sumiram = new Set(apagados)
    const arquivos = [...new Set([...rastreados, ...soltos])].filter(c => !sumiram.has(c)).sort()
    const base = await read($, BASE)
    const daBase = base && semBarra(base.raiz) === semBarra(topo) && semBarra(raiz) === semBarra(topo)
    const novos = daBase ? soltos.filter(c => !base.soltos.includes(c)) : []
    const mudados = daBase ? (await git($, raiz, ['diff', '--name-only', '-z', base.commit])).split('\0').filter(Boolean) : []
    const nova = { arquivos, novos, mudados }
    await update($, ARVORE, velha => (JSON.stringify(velha) === JSON.stringify(nova) ? velha : nova))
  } catch {}
}

// As linhas visiveis da arvore: as pastas (com / no fim) antes dos arquivos, em ordem alfabetica,
// e os filhos so das pastas abertas.
function linhasDaArvore(arquivos, abertas) {
  const raiz = new Map()
  for (const c of arquivos) {
    const partes = c.split('/')
    let no = raiz
    for (const p of partes.slice(0, -1)) {
      if (!(no.get(p) instanceof Map)) no.set(p, new Map())
      no = no.get(p)
    }
    no.set(partes.at(-1), null)
  }
  const linhas = []
  const descer = (no, prefixo, nivel) => {
    const nomes = [...no.keys()].sort((a, b) => (no.get(a) === null) - (no.get(b) === null) || a.localeCompare(b))
    for (const nome of nomes) {
      const pasta = no.get(nome) !== null
      const caminho = `${prefixo}${nome}${pasta ? '/' : ''}`
      linhas.push({ caminho, nome: pasta ? `${nome}/` : nome, nivel, pasta })
      if (pasta && abertas.includes(caminho)) descer(no.get(nome), caminho, nivel + 1)
    }
  }
  descer(raiz, '', 0)
  return linhas
}

// as abas que se refazem ao abrir e depois de cada ferramenta que muda arquivo; a Arquivos abre o
// diff do arquivo mudado, entao refaz o da aba Diff tambem
async function refazer($, aba) {
  if (aba === 'codigo' || aba === 'arquivos') await atualizarCodigo($)
  if (aba === 'arquivos') await lerArvore($)
}

const trocarAba = async ($, aba) => {
  await update($, ABA, () => aba)
  await refazer($, aba)
}

const mexer = ($, qual, como) => update($, AGENTES, lista => lista.map(a => (qual(a) ? { ...a, ...como(a) } : a)))
const vivo = a => VIVOS.includes(a.estado)

// Acerta os agentes vivos da leva pela lista oficial: casa pelo agentId, ou pelo nome enquanto nao
// tem um (o teammate); o herdado de outra sessao que a lista nao conhece mais para. Os workflows
// nao estao na lista e ficam com os hooks.
// ponytail: pelo nome casa o ultimo da lista ainda sem dono; dois teammates de mesmo nome confundem
async function reconciliar($) {
  if (!(await read($, AGENTES)).some(a => a.tipo === 'agente' && vivo(a))) return
  let lista
  try {
    lista = await $.agent.list()
  } catch {
    return
  }
  const agora = await $.clock.now()
  await update($, AGENTES, agentes => {
    let mudou = false
    const novos = agentes.map(a => {
      if (a.tipo !== 'agente' || !vivo(a)) return a
      const info = a.agentId ? lista.find(i => i.id === a.agentId) : lista.findLast(i => i.name === a.nome && !agentes.some(b => b.agentId === i.id))
      const estado = info ? (DA_LISTA[info.status] ?? a.estado) : a.herdado ? 'parado' : a.estado
      const agentId = info?.id ?? a.agentId
      if (estado === a.estado && agentId === a.agentId) return a
      mudou = true
      return { ...a, estado, agentId, ...(!VIVOS.includes(estado) && { duracao: agora - a.inicio }) }
    })
    return mudou ? novos : agentes
  })
}

// O Parar de um agente vivo: confirma e encerra pela TaskStop, que aceita o id da tarefa em
// background, o agentId ou o nome do teammate.
const idDeParar = a => a.taskId ?? a.agentId ?? a.nome
async function parar($, a) {
  // o dialogo dispensado rejeita: e o mesmo que nao parar
  const resposta = await $.ui.ask(`Parar o agente ${a.nome}?`, ['Parar', 'Deixar rodando']).catch(() => '')
  if (resposta !== 'Parar') return
  const r = await $.tool.call({ tool: 'TaskStop', task_id: idDeParar(a) }).catch(() => ({ isError: true }))
  if (r.deny !== undefined || r.isError) return $.ui.toast(`Não deu para parar ${a.nome}`)
  const fim = await $.clock.now()
  await mexer($, x => x.id === a.id && vivo(x), x => ({ estado: 'parado', duracao: fim - x.inicio }))
}

const ativa = async $ => {
  const leva = await read($, LEVA)
  return Boolean(leva && !leva.fechada)
}
const emGrill = async $ => {
  const grill = await read($, GRILL)
  return Boolean(naTela(grill) && grill.documento == null)
}
const emGrillDaSessao = async $ => (await read($, GRILL_DA_SESSAO)) && (await emGrill($))

export function register(on, options) {
  // o hooks.json aceita um modulo so: o so-com-pedido entra por aqui, quando a opcao o liga
  if (options?.so_com_pedido) soComPedido(on)
  // o canal do grill na opcao do plugin (/config); no tela, o AskUserQuestion do grill vai a pagina
  const canalTela = options?.grill_canal === 'tela'
  on('session.start', async ($, e, next) => {
    // o hot reload roda o session.start de novo: a janela fica com o grill dela
    await carregar($, await $.session.root(), (await read($, GRILL))?.id)
    await sugerirLinha($, false)
    await marcarBase($, e.cwd)
    // o tempo da fase, dos agentes em curso e do grill anda sozinho no pane; no grill, a pagina da
    // grill-tela e consultada a cada volta, para a resposta dada nela aparecer sem esperar o agente
    $.clock.every(1000, async () => {
      if (await emGrill($)) await sincronizarTela($)
      if (await ativa($)) await reconciliar($)
      if ((await ativa($)) || (await emGrill($))) $.ui.invalidate('ui.render')
    })
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
        'Registra um marco da leva (/faz) no painel da leva do Claude Code; quando chamar cada marco, e com que ' +
        'campos, esta em references/painel.md da /faz (os do grill, em references/interrogatorio.md). ' +
        'A recusa diz o campo que falta: corrija e chame de novo. Erro aqui nunca para a leva.',
      inputSchema: {
        type: 'object',
        properties: {
          marco: { type: 'string', enum: [...MARCOS, ...MARCOS_DO_GRILL] },
          documento: { type: 'string', description: 'inicio e entendimento: o documento da leva (titulo da nota ou caminho)' },
          pedido: { type: 'string', maxLength: 60, description: 'grill: o pedido em poucas palavras' },
          linha: { type: 'string', maxLength: 4000, description: 'linha: a linha da leva que o /faz imprimiu ao fim do grill, inteira e com as mesmas quebras' },
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

  // O /clear e o /resume trocam a sessao: o processo segue com outro id e um $.state vazio, e
  // nenhum session.start vem. O que so a sessao guarda (a aba, o Diff, o Uso, os agentes, o id do
  // grill da janela) passa da que acaba para a nova por esta variavel; a leva, o historico e o grill
  // voltam do store. A conferencia das skills recomeca, como numa retomada. So o Limpar limpa o
  // painel.
  let herdado = null
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      herdado = {
        aba: await read($, ABA),
        base: await read($, BASE),
        codigo: await read($, CODIGO),
        abertos: await read($, ABERTOS),
        arvore: await read($, ARVORE),
        pastas: await read($, PASTAS),
        filtro: await read($, FILTRO),
        uso: await read($, USO),
        agentes: await read($, AGENTES),
        grill: (await read($, GRILL))?.id,
      }
    }
    return next(e)
  })
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear' || e.source === 'resume') {
      const antes = herdado
      herdado = null
      await carregar($, await $.session.root(), antes?.grill)
      await sugerirLinha($, e.source === 'clear')
      if (antes) {
        await update($, ABA, () => antes.aba)
        await update($, BASE, () => antes.base)
        await update($, CODIGO, () => antes.codigo)
        await update($, ABERTOS, () => antes.abertos)
        await update($, ARVORE, () => antes.arvore)
        await update($, PASTAS, () => antes.pastas)
        await update($, FILTRO, () => antes.filtro)
        await update($, USO, () => antes.uso)
        // a lista oficial e da sessao: o herdado que ela nao conhece mais para (reconciliar)
        await update($, AGENTES, () => antes.agentes.map(a => ({ ...a, herdado: true })))
      }
    }
    return next(e)
  })

  // o Limpar tirou do painel uma leva ou um grill que o agente ainda toca: os marcos dela seguem sem
  // recusa (a recusa o faria recriar o que saiu), ate um inicio ou um grill novo
  let limpo = false
  on('tool.call', { tool: MARCO }, async ($, e) => {
    if (e.marco === 'inicio' || e.marco === 'grill') limpo = false
    else if (limpo && !(MARCOS_DO_GRILL.includes(e.marco) ? await read($, GRILL) : await read($, LEVA))) {
      return { result: 'o usuario limpou o painel: siga sem registrar os marcos desta leva' }
    }
    if (MARCOS_DO_GRILL.includes(e.marco)) {
      const atual = await read($, GRILL)
      const aplicado = aplicarNoGrill(atual, e, await $.clock.now())
      if (aplicado.erro) return { deny: aplicado.erro }
      // o marco grill da mesma leva de chamadas do grilling (o grill desta sessao, sem perguntas
      // nem documento) so troca o pedido: a URL da grill-tela e o inicio ficam
      const soPedido = e.marco === 'grill' && (await read($, GRILL_DA_SESSAO)) && atual && atual.perguntas.length === 0 && atual.documento == null
      const grill = soPedido ? { ...atual, pedido: aplicado.pedido } : aplicado
      await (e.marco === 'grill' && !soPedido ? salvarGrillNovo($, grill) : salvarGrill($, grill))
      await update($, GRILL, () => grill)
      if (e.marco === 'grill') await update($, GRILL_DA_SESSAO, () => true)
      return { result: `marco registrado; ${e.marco}` }
    }
    const antes = await read($, LEVA)
    // o custo da sessao, que o inicio e o fechamento guardam; erro aqui nunca para a leva
    const usd = ['inicio', 'fechamento'].includes(e.marco) ? await $.session.usage().then(u => u.cost?.usd, () => undefined) : undefined
    const leva = aplicar(antes, e, await $.clock.now(), usd)
    // deny e a forma de um hook devolver erro de ferramenta: o modelo recebe o texto como erro
    if (leva.erro) return { deny: leva.erro }
    // a leva comeca (ou retoma): o grill sai da aba Painel
    if (e.marco === 'inicio') await tirarGrillDaTela($)
    if (retoma(antes, e)) {
      const tickets = leva.tickets.map(({ id, titulo, estado, notas }) => ({ id, titulo, estado, notas }))
      const estado = JSON.stringify({ fase: leva.fase, tickets, sujos: leva.sujos ?? [] }, null, 2)
      return { result: `marco registrado; retomada na fase ${leva.fase}\n${estado}` }
    }
    const falta = ['inicio', 'fase'].includes(e.marco) && semSkill(leva.fase, await read($, SKILLS))
    // a janela de 5 h em 90% ao entrar numa fase em que sub-agentes rodam: um aviso por leva
    const janela = (await read($, MEDIDA))?.janela?.percentUsed ?? 0
    const comAgentes = ['revisao', 'correcoes'].includes(leva.fase) || (leva.fase === 'implement' && ['sub-agents', 'workflow'].includes(leva.modo))
    const avisa = e.marco === 'fase' && comAgentes && janela >= 90 && !leva.avisoDaJanela
    // o objeto e novo, o aplicar acabou de cria-lo
    if (avisa) leva.avisoDaJanela = true
    const raiz = await $.session.root()
    await $.store.set(chave(raiz), leva)
    await update($, LEVA, () => leva)
    if (avisa) $.ui.toast(`Janela de 5 h em ${porcento(janela)}: os sub-agentes dividem o limite com esta sessão`)
    if (e.marco === 'fechamento' && !antes.fechada) {
      const modelos = [...new Set((await read($, AGENTES)).map(a => a.modelo).filter(Boolean))]
      const historico = [{ ...leva, modelos }, ...((await $.store.get(chaveDoHistorico(raiz))) ?? [])].slice(0, NO_HISTORICO)
      await $.store.set(chaveDoHistorico(raiz), historico)
      await update($, HISTORICO, () => historico)
      // zera no fechamento, nao no inicio: a proxima leva invoca as reservadas antes do inicio
      await update($, SKILLS, () => [])
    }
    if (e.marco === 'inicio') {
      await update($, AGENTES, () => [])
      await update($, USO, () => ({}))
      $.ui.toast('Leva registrada: /painel-macrex mostra o andamento')
    }
    return { result: `marco registrado; fase ${leva.fase}${falta ? ` sem /${falta} invocada` : ''}` }
  })

  // o /cpv digitado depois do fechamento fecha a leva no git: o painel para de pedi-lo.
  // ponytail: marca quando o /cpv expande, nao quando termina; um repo que ele pulou nao desmarca
  on('skill.prompt', async ($, e, next) => {
    // a /faz nova abre outra leva de chamadas: o primeiro grill dela (o do grilling ou o do marco)
    // cria um grill novo, sem herdar a URL nem o inicio do grill da /faz anterior
    if (e.skill.split(':').pop() === 'faz') {
      noFaz = true
      await update($, GRILL_DA_SESSAO, () => false)
    }
    const leva = await read($, LEVA)
    if (e.skill.split(':').pop() === 'cpv' && leva?.fechada && leva.cpv == null) {
      const feita = { ...leva, cpv: await $.clock.now() }
      await $.store.set(chave(await $.session.root()), feita)
      await update($, LEVA, () => feita)
    }
    return next(e)
  })

  // casa pelo sufixo depois do `:`: mattpocock-skills:to-spec e to-spec contam igual. O grilling
  // que o /faz invoca abre o grill no painel com o pedido dele, sem esperar o marco grill, que o
  // agente pode esquecer; o marco que chega depois so troca o pedido pelo resumo. No canal tela, o
  // grilling de fora da /faz nao abre grill no painel, e o AskUserQuestion dele nao iria a pagina:
  // o resultado da skill manda conduzi-lo pela grill-tela, o ciclo inteiro
  let noFaz = false
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const nome = String(e.skill ?? '').split(':').pop()
    if (Object.values(SKILL_DA_FASE).includes(nome)) await update($, SKILLS, lista => (lista.includes(nome) ? lista : [...lista, nome]))
    const pedido = String(e.args ?? '').trim()
    const daFaz = nome === 'grilling' && noFaz
    // o grilling consome a /faz que o invocou, com ou sem o pedido
    if (nome === 'grilling') noFaz = false
    if (daFaz && pedido && !(await emGrillDaSessao($))) {
      limpo = false
      const grill = aplicarNoGrill(null, { marco: 'grill', pedido: pedido.length > 60 ? `${pedido.slice(0, 59)}…` : pedido }, await $.clock.now())
      await salvarGrillNovo($, grill)
      await update($, GRILL, () => grill)
      await update($, GRILL_DA_SESSAO, () => true)
    }
    const r = await next(e)
    // no canal tela, o grill da /faz nasce na grill-tela ja aqui, e a URL vai ao agente antes da
    // primeira pergunta: o AskUserQuestion que o pelaTela segura nunca espera sem ela a vista
    const doGrill = daFaz && canalTela && r.result !== undefined && (await emGrillDaSessao($)) && (await read($, GRILL))
    if (doGrill && !doGrill.tela && doGrill.canal !== 'cli') {
      const url = URL_DA_TELA.exec((await rodarTela($, ['iniciar', '--projeto', nomeDa(await $.session.root()), '--pedido', doGrill.pedido])).stdout)?.[0]
      if (!url) return r
      const novo = await update($, GRILL, g => g && { ...g, tela: url })
      if (novo) await salvarGrill($, novo)
      $.ui.toast(`Grill na tela: ${url}`)
      const aviso = `O grill desta /faz vai a grill-tela, em ${url}: escreva esta URL ao usuario antes da primeira pergunta, para ele saber onde responder. As rodadas seguem pelo AskUserQuestion, que o plugin leva a essa pagina.`
      return { ...r, context: [...(r.context ?? []), aviso] }
    }
    if (!canalTela || nome !== 'grilling' || daFaz || r.result === undefined || (await emGrillDaSessao($))) return r
    const aviso = 'Este grill nao e o da /faz, e o plugin nao leva o AskUserQuestion dele a pagina: ignore a instrucao de fazer as rodadas pelo AskUserQuestion, invoque a skill grill-tela e conduza o grill inteiro por ela.'
    return { ...r, context: [...(r.context ?? []), aviso] }
  })

  // as rodadas do grill pelo CLI: cada pergunta entra pelo tema e espera a resposta (as da
  // grill-tela chegam pelo estado da pagina, em sincronizarTela). No canal tela, a rodada vai
  // antes a pagina, ate o grill voltar ao CLI
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (!(await emGrill($))) return next(e)
    let voltou = null
    if (canalTela && (await read($, GRILL)).canal !== 'cli' && (await read($, GRILL_DA_SESSAO))) {
      const r = await pelaTela($, e, next.signal)
      if (!r.motivo) return r
      voltou = `A rodada não ficou na grill-tela (${r.motivo}): o grill segue no terminal, pelo diálogo.`
    }
    const id = e.tool_use_id
    const novas = e.questions.map(q => ({ id, pergunta: q.question, tema: q.header || q.question }))
    // o Limpar apertado durante a espera da pagina ja tirou o grill
    await update($, GRILL, g => g && { ...g, perguntas: [...g.perguntas, ...novas] })
    const r = await next(e)
    const respostas = r.result?.answers ?? {}
    // a rodada recusada, interrompida ou sem nenhuma resposta sai do grill: ela volta numa rodada
    // seguinte, e a aba nao a mostra duas vezes, a primeira vazia
    const semResposta = r.deny !== undefined || r.isError || Object.keys(respostas).length === 0
    // o Limpar apertado com a pergunta aberta ja tirou o grill
    const respondido = await update($, GRILL, g => g && {
      ...g,
      perguntas: semResposta
        ? g.perguntas.filter(p => p.id !== id)
        : g.perguntas.map(p => (p.id === id ? { ...p, resposta: respostas[p.pergunta] ?? 'sem resposta' } : p)),
    })
    if (respondido) await salvarGrill($, respondido)
    return voltou ? { ...r, context: [...(r.context ?? []), voltou] } : r
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

  // o fim de cada turno: soma os tokens do loop para a aba Uso e fecha o sub-agente em background
  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      const loop = e.agentId ?? 'sessao'
      await update($, USO, uso => ({ ...uso, [loop]: { ...somar(uso[loop], e.usage), modelo: e.usage.model ?? uso[loop]?.modelo ?? '' } }))
    }
    if (e.agentId) {
      const fim = await $.clock.now()
      const estado = e.reason === 'answer' ? 'concluido' : e.reason === 'aborted' ? 'parado' : 'falhou'
      await mexer($, a => a.agentId === e.agentId && vivo(a), a => ({
        estado,
        modelo: e.usage?.model ?? a.modelo,
        duracao: fim - a.inicio,
      }))
    }
    return next(e)
  })

  // a medida da sessao, a cada turno e a cada ponto da janela: o custo, o contexto e a janela de
  // 5 h (so na assinatura; numa chave de API nao vem) para a aba Uso; a leva aberta grava o custo dela
  on('session.measure', async ($, e, next) => {
    await update($, MEDIDA, () => ({ custo: e.cost?.usd, contexto: e.context.percent, janela: e.rateLimits.find(r => r.kind === 'five_hour') }))
    let mudou = false
    const leva = await update($, LEVA, l => {
      const medida = l && !l.fechada ? comCusto(l, e.cost?.usd) : l
      mudou = medida !== l && medida.custo !== l.custo
      return mudou ? medida : l
    })
    if (mudou) await $.store.set(chave(await $.session.root()), leva)
    return next(e)
  })

  // um teammate nao termina: fica ocioso quando entrega, e e ai que o trabalho dele acabou
  on('classic.TeammateIdle', async ($, e, next) => {
    const fim = await $.clock.now()
    await mexer($, a => a.tipo === 'agente' && a.nome === e.teammate_name && vivo(a), a => ({
      estado: 'concluido',
      duracao: fim - a.inicio,
    }))
    return next(e)
  })

  // a leva atravessa a compactacao do loop principal: o resumo recebe o estado dela. O precompute
  // (o resumo adiantado, que a compactacao seguinte reaproveita sem passar as instructions dela ao
  // resumidor) fica vetado com a leva aberta, para o resumo ser feito com o estado de agora; o
  // sub-agente passa intacto, e a compactacao de verdade nunca e cancelada aqui
  on('session.compact', async ($, e, next) => {
    if (e.agentId || !(await ativa($))) return next(e)
    if (e.trigger === 'precompute') return { skip: 'leva aberta: o resumo leva o estado dela' }
    const bloco = levaNaCompactacao(await read($, LEVA))
    return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${bloco}` : bloco })
  })

  // fim de um workflow (ou agente) em background: a notificacao da tarefa chega como mensagem
  on('session.append', async ($, e, next) => {
    const blocos = e.message.content
    const texto = typeof blocos === 'string' ? blocos : (blocos ?? []).map(b => b.text ?? '').join('\n')
    const aviso = /<task-notification>[\s\S]*?<task-id>([^<]+)<\/task-id>[\s\S]*?<status>([^<]+)<\/status>/.exec(texto)
    if (aviso) {
      const [, tarefa, status] = aviso
      const fim = await $.clock.now()
      await mexer($, a => (a.taskId === tarefa || a.agentId === tarefa) && vivo(a), a => ({
        estado: FIM_DE_TAREFA[status] ?? 'concluido',
        duracao: fim - a.inicio,
      }))
    }
    return next(e)
  })

  // a ferramenta que muda arquivo refaz a aba Diff ou a Arquivos, se e ela que esta na tela; o comando da
  // grill-tela que leva a URL da pagina liga a consulta das rodadas dela no grill em curso; o
  // prompt que o localizador gera (--linha) entra no grill sem depender do marco linha e, sem o
  // marco entendimento, fecha o grill na tela com o documento do prompt: senao o tempo nao para
  on('tool.call', async ($, e, next) => {
    // a ferramenta chamada dentro de um sub-agente traz o agentId dele: e a ultima atividade dele
    if (e.agentId && (await ativa($))) {
      const agora = await $.clock.now()
      await mexer($, a => a.agentId === e.agentId, () => ({ atividade: agora }))
    }
    const r = await next(e)
    if (MUDAM.includes(e.tool)) await refazer($, await read($, ABA))
    const tela = /grill-tela\.js/.test(e.command ?? '') && URL_DA_TELA.exec(e.command)?.[0]
    if (tela && (await emGrill($))) {
      await update($, GRILL, g => ({ ...g, tela, telaFim: false }))
      await sincronizarTela($)
    }
    // so o stdout que abre com o prompt (o comando composto que imprime outra coisa antes nao e o
    // localizador falando), e so no grill na tela: o que a leva tirou de la guarda o prompt dela
    const linha = /skills-do-matt\.js["']?\s+--linha/.test(e.command ?? '') && String(r?.result?.stdout ?? '').trim()
    const grill = linha && /^rode \S+ leva /.test(linha) && naTela(await read($, GRILL))
    if (grill) {
      const agora = await $.clock.now()
      const comLinha = aplicarNoGrill(grill, { marco: 'linha', linha }, agora)
      // o documento vem da abertura do prompt, ja expandido pelo shell (skills-do-matt.js, linhaDaLeva),
      // lida no prompt sem o \r que o PowerShell poe
      const documento = /^rode \S+ leva (.+) até o fim\.$/m.exec(comLinha.linha ?? '')?.[1]
      const fechado = !comLinha.erro && comLinha.documento == null && documento && aplicarNoGrill(comLinha, { marco: 'entendimento', documento }, agora)
      const novo = fechado && !fechado.erro ? fechado : comLinha
      if (!novo.erro) {
        await salvarGrill($, novo)
        await update($, GRILL, () => novo)
      }
    }
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
    const { Box, Text, Button, Code, Input } = $.ui.resolve(e)
    const leva = await read($, LEVA)
    // a aba Grill mostra o ultimo grill do workspace; a aba Painel, so o que ainda esta na tela
    const ultimoGrill = await read($, GRILL)
    // sem leva, o grill que o inicio tirou daqui volta, para o Limpar alcanca-lo
    const grill = leva ? naTela(ultimoGrill) : ultimoGrill
    const aba = await read($, ABA)
    const arquivos = await read($, CODIGO)
    // as abas no topo, a da tela em destaque; o numero de cada uma a troca com o foco no pane
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
      // no pane baixo, so os dois z de baixo e o boneco sem as pernas: o corpo fica, e e ele que
      // fecha os olhos por baixo
      const desenho = (alto ? [...zs, ...BONECO] : [...zs.slice(1), ...BONECO.slice(0, 2)]).map(l => l.padEnd(11))
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
    const apagado = texto => h(Text, { color: APAGADO }, texto)
    // o nome da aba em laranja, com o titulo embaixo, a esquerda; o rotulo e o valor grande (o
    // total) a direita. A marca do repositorio fica so na pagina da grill-tela
    const negrito = texto => h(Text, { bold: true, color: TEXTO }, texto)
    const cabecalho = (titulo, rotulo, valor) =>
      h(
        Box,
        { justifyContent: 'space-between', alignItems: 'flex-end' },
        h(Box, { flexDirection: 'column', flexShrink: 1 }, h(Text, { color: LARANJA }, ABAS[aba]), typeof titulo === 'string' ? negrito(titulo) : titulo),
        h(Box, { flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 2 }, apagado(rotulo), negrito(valor)),
      )
    // a aba desenhada: as abas, o cabecalho e as secoes
    const tela = (titulo, rotulo, valor, ...secoes) => h(Box, raiz, abas, cabecalho(titulo, rotulo, valor), ...secoes)
    // cada secao e um cartao preenchido um tom abaixo do fundo, com o titulo apagado (ou o elemento dado)
    const cartao = (titulo, ...filhos) =>
      h(Box, { flexDirection: 'column', backgroundColor: CARTAO, paddingX: 2, paddingY: 1, marginTop: 1 }, typeof titulo === 'string' ? apagado(titulo) : titulo, ...filhos)
    // uma linha de `larg` colunas: as partes da esquerda, espaco, as da direita; cada parte e
    // [texto, props]; sem lugar, a ultima parte da esquerda encolhe com …
    const linhaLarga = (larg, esquerda, direita, props = {}) => {
      const tam = partes => partes.reduce((n, [t]) => n + t.length, 0)
      const falta = tam(esquerda) + tam(direita) + 1 - larg
      const esq = falta > 0 ? esquerda.map(([t, p], i) => (i === esquerda.length - 1 ? [`${t.slice(0, Math.max(1, t.length - falta - 1))}…`, p] : [t, p])) : esquerda
      const parte = ([t, p]) => h(Text, p ?? {}, t)
      return h(Text, { color: TEXTO, ...props }, ...esq.map(parte), h(Text, {}, ' '.repeat(Math.max(1, larg - tam(esq) - tam(direita)))), ...direita.map(parte))
    }
    // a aba Diff: um chip por arquivo, o caminho que abre e fecha o diff, e as linhas somadas e tiradas
    // o diff de um arquivo da aba Diff, aberto na aba Diff ou na Arquivos: a mesma lista de abertos
    const abertos = await read($, ABERTOS)
    const alternarDiff = caminho => update($, ABERTOS, l => (l.includes(caminho) ? l.filter(c => c !== caminho) : [...l, caminho]))
    const diffDe = a => (a.diff ? pedacos(a.diff).map(source => h(Code, { source, format: 'diff', path: a.caminho })) : [apagado('  binário, sem diff de texto')])
    if (aba === 'codigo') {
      const base = await read($, BASE)
      const arquivo = (a, i) => {
        const aberto = abertos.includes(a.caminho)
        const alternar = () => alternarDiff(a.caminho)
        return h(
          Box,
          { flexDirection: 'column', backgroundColor: CHIP, marginTop: 1 },
          h(
            Box,
            { justifyContent: 'space-between', paddingX: 1 },
            h(Button, { key: `arquivo:${i}`, plain: true, label: `${aberto ? '⌄' : '›'} ${a.caminho}`, onPress: alternar }),
            h(Text, { wrap: 'truncate-end' }, h(Text, { color: VERDE }, `+${a.mais}`), ' ', h(Text, { color: VERMELHO }, `-${a.menos}`)),
          ),
          ...(aberto ? diffDe(a) : []),
        )
      }
      const mais = arquivos.reduce((n, a) => n + a.mais, 0)
      const menos = arquivos.reduce((n, a) => n + a.menos, 0)
      return tela(
        base ? nomeDa(base.raiz) : 'Fora de um repositório git',
        `${arquivos.length} ${arquivos.length === 1 ? 'arquivo alterado' : 'arquivos alterados'}`,
        `+${mais} -${menos}`,
        !base
          ? cartao(null, apagado('a sessão não começou num repositório git: não há com o que comparar'))
          : cartao(null, ...(arquivos.length > 0 ? arquivos.map(arquivo) : [apagado('nenhum arquivo alterado nesta sessão')])),
      )
    }
    // a aba Arquivos: a arvore do projeto, com a pasta que abre e fecha no clique; o nome do arquivo
    // novo vai em verde, o do alterado em amarelo, e a pasta fechada com algum deles leva o ponto. O
    // arquivo com diff na aba Diff ganha o › que abre o diff embaixo dele (o Button nao tem cor, e o
    // nome colorido fica num Text ao lado). Com o filtro, a arvore da lugar a lista plana dos
    // caminhos que casam
    if (aba === 'arquivos') {
      const arvore = await read($, ARVORE)
      const abertas = await read($, PASTAS)
      const filtro = await read($, FILTRO)
      const todos = arvore?.arquivos ?? []
      const filtrar = texto => update($, FILTRO, () => texto)
      const campo = h(Input, { key: 'arvore:filtro', placeholder: 'filtrar pelo caminho', value: filtro, onInput: filtrar, onSubmit: filtrar })
      // ponytail: a lista plana desenha todos os que casam; um teto entra se um repositorio grande pesar no pane
      const termo = filtro.trim().toLowerCase()
      const linhas = termo
        ? todos.filter(c => c.toLowerCase().includes(termo)).map(caminho => ({ caminho, nome: caminho, nivel: 0, pasta: false, doFiltro: true }))
        : linhasDaArvore(todos, abertas)
      const vazio = arvore ? (termo ? 'nenhum caminho casa com o filtro' : 'nenhum arquivo no projeto') : 'lendo a árvore…'
      const recuo = nivel => '  '.repeat(nivel)
      const noDaArvore = ({ caminho, nome, nivel, pasta, doFiltro }) => {
        if (!pasta) {
          const cor = arvore.novos.includes(caminho) ? VERDE : arvore.mudados.includes(caminho) ? AMARELO : TEXTO
          const comDiff = arquivos.find(a => a.caminho === caminho)
          if (!comDiff) return h(Text, { color: cor }, `${recuo(nivel)}${doFiltro ? '' : '  '}${nome}`)
          const aberto = abertos.includes(caminho)
          return h(
            Box,
            { flexDirection: 'column' },
            h(
              Box,
              {},
              h(Text, {}, recuo(nivel)),
              h(Button, { key: `no:${caminho}`, plain: true, label: aberto ? '⌄' : '›', onPress: () => alternarDiff(caminho) }),
              h(Text, { color: cor }, ` ${nome}`),
            ),
            ...(aberto ? diffDe(comDiff) : []),
          )
        }
        const aberta = abertas.includes(caminho)
        const alternar = () => update($, PASTAS, l => (l.includes(caminho) ? l.filter(c => c !== caminho) : [...l, caminho]))
        const mexida = !aberta && [...arvore.novos, ...arvore.mudados].some(c => c.startsWith(caminho))
        return h(
          Box,
          { gap: 2 },
          // o no da pasta com prefixo proprio, para nao se confundir com o campo do filtro
          h(Button, { key: `no:${caminho}`, plain: true, label: `${recuo(nivel)}${aberta ? '▾' : '▸'} ${nome}`, onPress: alternar }),
          mexida && h(Text, { color: AMARELO }, '•'),
        )
      }
      return tela(
        nomeDa(await $.session.root()),
        'arquivos',
        String(todos.length),
        arvore?.semGit
          ? cartao(null, apagado('a sessão não está num repositório git, ou o git não rodou: não há árvore para listar'))
          : cartao(null, campo, ...(linhas.length > 0 ? linhas.map(noDaArvore) : [apagado(vazio)])),
      )
    }
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
      if (!leva) return tela('Nenhuma leva neste workspace', 'verdes', '—', cartao(null, apagado('os tickets aparecem quando o to-tickets publica')))
      const comNotas = (t, i) =>
        h(
          Box,
          { flexDirection: 'column', marginTop: i > 0 ? 1 : 0 },
          ticket(t),
          h(Box, { paddingLeft: 4 }, h(Text, { color: t.notas ? TEXTO : APAGADO }, t.notas ?? 'sem notas ainda')),
        )
      return tela(
        leva.documento,
        'verdes',
        `${verdes(leva)}/${leva.tickets.length}`,
        cartao(null, ...(leva.tickets.length > 0 ? leva.tickets.map(comNotas) : [apagado('nenhum ticket publicado ainda')])),
      )
    }
    // a aba Uso: os tokens desde o inicio da leva (ou da sessao), por modelo e por agente
    if (aba === 'uso') {
      const uso = Object.entries(await read($, USO))
      const agentes = await read($, AGENTES)
      const total = u => TOKENS.reduce((n, k) => n + u[k], 0)
      const porModelo = {}
      for (const [, u] of uso) porModelo[u.modelo] = somar(porModelo[u.modelo], u)
      const aDireita = (...valores) => valores.map(v => [v.padStart(9)])
      const modelo = ([nome, u]) =>
        linhaLarga(largura, [[nome || 'modelo desconhecido']], aDireita(tokens(u.input_tokens), tokens(u.output_tokens), tokens(u.cache_read_input_tokens + u.cache_creation_input_tokens)))
      const nomeDo = id => (id === 'sessao' ? 'sessão principal' : (agentes.find(a => a.agentId === id)?.nome ?? `agente ${id.slice(0, 8)}`))
      const loop = ([id, u]) => linhaLarga(largura, [[nomeDo(id)]], [[u.modelo, { color: AZUL }], ['  '], [tokens(total(u)).padStart(7)]])
      // o custo e os limites medidos: o da leva (o da sessao, sem ela), a janela de 5 h e o contexto
      const medida = await read($, MEDIDA)
      const custo = leva?.custo != null ? ['custo da leva', leva.custo] : !leva && medida?.custo != null ? ['custo da sessão', medida.custo] : null
      const janela = medida?.janela && `5h ${porcento(medida.janela.percentUsed)}${medida.janela.resetsAt ? ` · reseta em ${ateResetar(Date.parse(medida.janela.resetsAt) - agora)}` : ''}`
      const limites = [janela, medida?.contexto != null && `contexto ${porcento(medida.contexto)}`].filter(Boolean).join(' · ')
      return tela(
        leva?.documento ?? 'Sessão',
        'tokens',
        tokens(uso.reduce((n, [, u]) => n + total(u), 0)),
        (custo || limites) && cartao(null, custo && linhaLarga(largura, [[custo[0]]], [[dolares(custo[1])]]), limites && h(Text, { color: TEXTO }, limites)),
        ...(uso.length === 0
          ? [cartao(null, apagado('nenhum turno terminou ainda'))]
          : [
              cartao('Por modelo', linhaLarga(largura, [['']], aDireita('entrada', 'saída', 'cache'), { color: APAGADO }), ...Object.entries(porModelo).map(modelo)),
              cartao('Por agente', ...uso.map(loop)),
            ]),
      )
    }
    const andamento = g => [g.documento ? 'concluído' : 'em curso', duracao((g.fim ?? agora) - g.inicio)]
    // o grill na tela: a URL dele, que segue la depois do sim e do CLI, e o Abrir
    const cartaoDaTela = g =>
      g?.tela &&
      cartao(h(Box, { gap: 2 }, apagado('Grill na tela'), h(Button, { key: 'tela:abrir', label: 'Abrir', dimColor: true, onPress: () => abrirTela($, g.tela) })), h(Code, { source: g.tela }))
    // a aba Grill: cada pergunta inteira com a resposta embaixo, o entendimento e a linha da leva
    if (aba === 'grill') {
      const g = ultimoGrill
      const historicoDeGrills = h(Button, { key: 'grill:historico', label: 'Histórico', dimColor: true, onPress: () => abrirHistorico($) })
      const comHistorico = titulo => h(Box, { gap: 2 }, negrito(titulo), historicoDeGrills)
      if (!g) return tela(comHistorico('Nenhum grill neste workspace'), 'perguntas', '0', cartao(null, apagado('o /faz <pedido> abre um')))
      const resposta = p =>
        p.resposta == null
          ? h(Text, { color: LARANJA }, '▸ aguardando')
          : h(Text, { color: p.resposta === 'sem resposta' ? APAGADO : VERDE }, `${p.resposta === 'sem resposta' ? '·' : '✓'} ${p.resposta}`)
      const par = (p, i) =>
        h(Box, { flexDirection: 'column', marginTop: i > 0 ? 1 : 0 }, apagado(p.tema), negrito(p.pergunta), resposta(p))
      const respondidas = g.perguntas.filter(p => p.resposta != null).length
      return tela(
        comHistorico(g.pedido),
        ...andamento(g),
        cartaoDaTela(g),
        cartao(`Perguntas e respostas · ${respondidas}/${g.perguntas.length}`, ...(g.perguntas.length > 0 ? g.perguntas.map(par) : [apagado('nenhuma pergunta ainda')])),
        g.documento && cartao('Entendimento', h(Text, { color: VERDE }, g.documento)),
        // o Executar leva o texto exato a caixa de envio: copiado da tela, o terminal parte a linha
        // longa e um nome de skill partido nao autoriza a skill. O grill volta do store depois do
        // /clear do Clear, entao o Executar segue valendo na sessao nova
        g.linha &&
          cartao(
            h(
              Box,
              { gap: 2 },
              apagado('Prompt'),
              h(Button, { key: 'grill:clear', label: 'Clear', dimColor: true, onPress: () => $.command.run({ command: 'clear' }) }),
              h(Button, { key: 'grill:colar', label: 'Executar', dimColor: true, onPress: async () => (await $.prompt.fill({ text: g.linha })).isFilled || $.ui.toast('Não deu para colar o prompt') }),
            ),
            h(Code, { source: g.linha }),
          ),
      )
    }
    // a grade das fases, com o grill na frente: tres chips por linha onde cabem, senao dois, senao
    // um. O chip e um tom acima do cartao, com o nome a esquerda e, a direita, o tempo com ◐ na
    // fase em curso e com ✓ na que passou, ou — na que falta
    const porLinha = largura >= 68 ? 3 : largura >= 37 ? 2 : 1
    const larguraDoChip = Math.floor((largura - (porLinha - 1)) / porLinha)
    const estadoDoChip = (tempo, atual, passou) => (atual ? [`${tempo} ◐`, LARANJA] : passou ? [`${tempo} ✓`, VERDE] : ['—', APAGADO])
    const chip = (nome, tempo, atual, passou) => {
      const [estado, cor] = estadoDoChip(tempo, atual, passou)
      return h(Box, { backgroundColor: CHIP, paddingX: 1, width: larguraDoChip }, linhaLarga(larguraDoChip - 2, nome, [[estado, { color: cor }]], { bold: atual, color: passou ? TEXTO : APAGADO }))
    }
    // o grill e a fase antes do spec, em curso ate o entendimento; o nome dele e um botao que leva
    // a aba Grill, onde estao as perguntas
    const chipDoGrill = g => {
      const [estado, cor] = estadoDoChip(g ? duracao((g.fim ?? agora) - g.inicio) : '', Boolean(g && g.documento == null), Boolean(g))
      return h(
        Box,
        { backgroundColor: CHIP, paddingX: 1, width: larguraDoChip, justifyContent: 'space-between' },
        h(Button, { key: 'fase:grill', label: 'grill', plain: true, onPress: () => trocarAba($, 'grill') }),
        h(Text, { color: cor }, estado),
      )
    }
    const fases = FASES.filter(f => ROTULO[f])
    const grade = chips =>
      cartao('Fases', h(Box, { flexDirection: 'column', gap: 1 }, ...Array.from({ length: Math.ceil(chips.length / porLinha) }, (_, i) => h(Box, { gap: 1 }, ...chips.slice(i * porLinha, (i + 1) * porLinha)))))
    // o titulo da aba Painel com o botao Limpar ao lado, o unico que limpa o painel
    const comLimpar = titulo => h(Box, { gap: 2 }, negrito(titulo), h(Button, { key: 'painel:limpar', label: 'Limpar', dimColor: true, onPress: () => { limpo = true; return limpar($) } }))
    // o grill na tela e sempre mais novo que a leva: o inicio de uma leva o tira de la
    if (grill) return tela(comLimpar(`Grill · ${grill.pedido}`), ...andamento(grill), cartaoDaTela(grill), grade([chipDoGrill(grill), ...fases.map(f => chip([[ROTULO[f]]], '', false, false))]))
    const ate = leva.fim ?? agora
    // uma fase dura da sua entrada ate a entrada seguinte, ou ate agora (o fim, se fechada)
    const entradas = leva.entradas ?? {}
    const tempoDaFase = f => {
      const desde = entradas[f]
      if (desde == null) return ''
      return duracao(Math.min(ate, ...Object.values(entradas).filter(t => t > desde)) - desde)
    }
    const skills = await read($, SKILLS)
    const chipDaFase = f => {
      const passou = leva.fases.includes(f)
      const falta = passou && semSkill(f, skills)
      return chip([[ROTULO[f]], ...(falta ? [[' !', { color: AMARELO, bold: true }]] : [])], tempoDaFase(f), f === leva.fase && !leva.fechada, passou)
    }
    // a leva que nasceu do grill guardado (o mesmo documento) mostra a fase dele
    const doGrill = ultimoGrill?.documento === leva.documento ? ultimoGrill : null
    const agentes = await read($, AGENTES)
    const visiveis = [...agentes.filter(vivo), ...agentes.filter(a => !vivo(a)).slice(-5)]
    const agente = a => {
      const [estado, cor] = DO_AGENTE[a.estado]
      const linhaDoAgente = linhaLarga(largura, [[a.nome]], [
        ...(a.modelo ? [[a.modelo, { color: AZUL }], ['  ']] : []),
        [estado.padEnd(10), { color: cor }],
        ['  '],
        [duracao(a.duracao ?? agora - a.inicio).padStart(6), { color: APAGADO }],
      ])
      if (!vivo(a)) return linhaDoAgente
      // o vivo ganha embaixo o Parar e, o agente rodando sem ferramenta ha mais de 2 min, ha quanto
      // tempo; o workflow nao: as ferramentas dele trazem o agentId dos sub-agentes de dentro
      const quieto = agora - (a.atividade ?? a.inicio)
      return h(
        Box,
        { flexDirection: 'column' },
        linhaDoAgente,
        h(
          Box,
          { gap: 2, paddingLeft: 2 },
          h(Button, { key: `agente:parar:${idDeParar(a)}`, label: 'Parar', dimColor: true, onPress: () => parar($, a) }),
          a.tipo === 'agente' && a.estado === 'rodando' && quieto > SEM_SAIDA && h(Text, { color: AMARELO }, `sem saída há ${Math.floor(quieto / 60000)} min`),
        ),
      )
    }
    const historico = await read($, HISTORICO)
    const passada = l => {
      const reparos = l.tickets.reduce((soma, t) => soma + (t.reparos ?? 0), 0)
      const total = l.inicio != null && l.fim != null && `total ${duracao(l.fim - l.inicio)}`
      return [l.documento, total, l.custo != null && dolares(l.custo), l.modo,`${verdes(l)}/${l.tickets.length} verdes`, `reparos ${reparos}`, ...(l.modelos ?? [])].filter(Boolean).join(' · ')
    }
    return tela(
      comLimpar(`Leva · ${leva.documento}`),
      'total',
      leva.inicio != null ? duracao(ate - leva.inicio) : '—',
      leva.fechada && h(Text, { color: leva.cpv == null ? AMARELO : VERDE }, `leva fechada, ${leva.cpv == null ? 'falta o /cpv' : '/cpv rodou'}`),
      grade([chipDoGrill(doGrill), ...fases.map(chipDaFase)]),
      leva.tickets.length > 0 && cartao('Tickets', ...leva.tickets.map(ticket)),
      ...Object.entries(FASES_COM_ITENS).map(([f, titulo]) => {
        const itens = (leva.itens ?? []).filter(i => i.fase === f)
        return itens.length > 0 && cartao(titulo, ...itens.map(item))
      }),
      visiveis.length > 0 && cartao('Sub-agentes', ...visiveis.map(agente)),
      // o historico so aparece sob a leva fechada: com ela aberta, o espaco e do andamento
      leva.fechada && historico.length > 0 && cartao('Histórico', ...historico.map(l => apagado(passada(l)))),
    )
  })

  // a faixa acima do prompt: a leva aberta numa linha, sem abrir o pane; o que outro mod desenha
  // na faixa segue embaixo
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const leva = await read($, LEVA)
    if (e.props.hasSurvey || !leva || leva.fechada) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const aberto = (await $.ui.panes()).some(pane => pane.id === PANE)
    const contagem = ticketDaLeva(leva)
    const partes = ['Leva', ROTULO[leva.fase] ?? leva.fase, ...(contagem ? [contagem] : []), duracao((await $.clock.now()) - leva.inicio)]
    // o botao no terminal e [ Abrir painel ], mais o espaco antes dele; sem lugar nem para Leva, sai
    const doBotao = aberto ? 0 : 'Abrir painel'.length + 5
    const cabe = larg => partes.join(' · ').length <= larg
    while (partes.length > 1 && !cabe(e.props.bodyColumns - doBotao)) partes.pop()
    const comBotao = !aberto && cabe(e.props.bodyColumns - doBotao)
    const abrir = async () => {
      await $.ui.open({ id: PANE, title: 'Leva' })
      $.ui.invalidate('ui.render')
    }
    return h(
      Box,
      { flexDirection: 'column' },
      h(Box, { gap: 1 }, h(Text, { wrap: 'truncate-end' }, partes.join(' · ')), comBotao && h(Button, { key: 'faixa:abrir', label: 'Abrir painel', dimColor: true, onPress: abrir })),
      await next(e),
    )
  })

  // a linha que anima durante o turno leva a fase e o ticket da leva aberta, antes da reticencia
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const leva = await read($, LEVA)
    if (!leva || leva.fechada) return next(e)
    const contagem = ticketDaLeva(leva)
    return next({ ...e, props: { ...e.props, suffix: ` · ${ROTULO[leva.fase] ?? leva.fase}${contagem ? ` · ${contagem}` : ''}${e.props.suffix}` } })
  })

  // o marco na conversa: uma linha apagada no lugar da linha generica da ferramenta
  on('ui.render', { component: 'ToolUse', props: { tool: MARCO } }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    const m = e.props.input ?? {}
    const resumo = [m.fase, m.ticket != null && `ticket ${m.ticket}`, m.portao].filter(Boolean).join(' · ')
    return h(Text, { dimColor: true, ...(e.props.isErrored && { color: VERMELHO }) }, `◆ marco ${m.marco}${resumo ? ` · ${resumo}` : ''}`)
  })
}
