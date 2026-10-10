// O nucleo do painel da leva: os hooks que dividem os efeitos com $ do grill, da grill-tela, do diff
// e da arvore e dos alertas. O validate so segue o $ ate uma funcao deste arquivo, e o session.start,
// o /clear, o marco, o tool.call sem filtro e o Pane chamam helpers de todos esses assuntos; separados,
// os helpers com efeito teriam de ser copiados. Os hooks vem em cinco registros, na ordem da raiz.

import { atom, read, update } from 'claude-code'
import type { AgentInfo, BuiltinToolResults, EngineInterface, On, ProcessRunInit, RenderElement } from 'claude-code'
import type { Grill, Leva, LevaAgente, LevaHistorico } from '../../../types/index.d.ts'
import { FERRAMENTA, MARCOS, MARCOS_DO_GRILL, RONCO, FASES, PORTOES, MODOS, NO_HISTORICO, SKILL_DA_FASE, DA_LISTA, VIVOS, MUDAM, URL_DA_TELA, RETOMAR } from '../dominio/vocabulario.ts'
import type { Aba, Marco } from '../dominio/vocabulario.ts'
import { nomeDa, somar, porcento } from '../dominio/formato.ts'
import { novoId, semSkill, retoma, aplicar, aplicarNoGrill, naTela } from '../dominio/marcos.ts'
import { vivo, idDeParar, alertas } from '../dominio/alertas.ts'
import { arquivosDoDiff } from '../dominio/diff.ts'
import { semBarra } from '../dominio/arvore.ts'
import { rotaDa, idDaTela, NAO_RESPOSTA, questoesDaTela, respostasDaTela } from '../dominio/grill-tela.ts'
import type { RespostaDaTela, EstadoDaTela, AvisoDaTela, Perguntas, QuestaoDaTela } from '../dominio/grill-tela.ts'
import { chave, chaveDoHistorico, chaveDoGrill, chaveAntigaDoGrill, GRILLS_POR_WORKSPACE } from '../estado.ts'
import type { Contexto } from '../estado.ts'
import { primitivas } from '../desenho/primitivas.ts'
import type { Acoes, Elementos } from '../desenho/primitivas.ts'
import { abaRepouso } from '../desenho/aba-repouso.ts'
import { abaDiff } from '../desenho/aba-diff.ts'
import { abaArquivos } from '../desenho/aba-arquivos.ts'
import { abaTickets } from '../desenho/aba-tickets.ts'
import { abaUso } from '../desenho/aba-uso.ts'
import { abaGrill } from '../desenho/aba-grill.ts'
import { geralDoGrill, geralDaLeva } from '../desenho/aba-geral.ts'

// os matchers dos on() moram neste arquivo: o validate so le o valor de um const declarado nele
const PANE = 'painel-macrex'
const MARCO = 'mcp__macrex-skills__faz_marco'

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
// As chaves dos alertas ja avisados num toast, so na sessao: a chave que volta depois de sumir avisa de novo.
const ALERTADOS = atom({ plugin: 'macrex-skills', key: 'alertados' }, [])
// A permissao que o Claude Code pediu e ainda espera o usuario, com o loop que a pediu, so na sessao.
// ponytail: uma por vez; duas pendentes juntas mostram a ultima
const PERMISSAO = atom({ plugin: 'macrex-skills', key: 'permissao' }, null)
// o result de uma ferramenta sem filtro e unknown: o do shell traz o stdout
type Saida = { stdout?: unknown }

// Grava o grill desta janela na chave do id dele.
async function salvarGrill($: EngineInterface, grill: Grill) {
  await $.store.set(chaveDoGrill(await $.session.root(), grill.id), grill)
}
// Os grills do workspace no store, do mais novo ao mais velho.
async function grillsDo($: EngineInterface, raiz: string) {
  const chaves = (await $.store.keys()).filter(k => k.startsWith(`grill:${raiz}:`))
  // o store devolve unknown: o que mora nas chaves grill: e o Grill que o salvarGrill gravou
  const grills = (await Promise.all(chaves.map(k => $.store.get(k)))) as (Grill | undefined)[]
  return (grills.filter(Boolean) as Grill[]).sort((a, b) => (b.inicio ?? 0) - (a.inicio ?? 0))
}
// O grill novo do workspace: grava e apaga os que passam dos mais recentes.
async function salvarGrillNovo($: EngineInterface, grill: Grill) {
  await salvarGrill($, grill)
  const raiz = await $.session.root()
  for (const velho of (await grillsDo($, raiz)).slice(GRILLS_POR_WORKSPACE)) await $.store.delete(chaveDoGrill(raiz, velho.id))
}

// Tira o grill da aba Geral quando a leva comeca; a aba Grill o guarda ate o Limpar.
async function tirarGrillDaTela($: EngineInterface) {
  const grill = await read($, GRILL)
  if (!naTela(grill)) return
  const fora = { ...grill!, fora: true }
  await salvarGrill($, fora)
  await update($, GRILL, () => fora)
}

// As rodadas da grill-tela no grill, pelo estado da pagina: a rodada aberta entra aguardando, a
// respondida traz a escolha (e o comentario); a pergunta que ja esta no grill muda no lugar, a
// nova entra no fim. A pagina que voltou ao CLI ou terminou encerra a consulta (telaFim); a URL
// fica no grill, para o cartao do grill na tela. A consulta que falha so pula a volta: o servidor
// e um so por maquina e persiste, e a falha passageira nao para a consulta.
async function sincronizarTela($: EngineInterface) {
  const daTelaAgora = await read($, GRILL)
  const url = daTelaAgora?.tela
  if (!url || daTelaAgora.telaFim) return
  let estado: EstadoDaTela | null = null
  try {
    const r = await $.http.fetch(rotaDa(url, 'estado'))
    if (r.ok) estado = JSON.parse(r.text)
  } catch {}
  const abertas: EstadoDaTela['historico'] = estado?.fase === 'rodada' && estado.rodada ? [{ rodada: estado.rodada }] : []
  // a rodada do terminal que o registrar gravou na sessao ja esta no grill, pelo AskUserQuestion dela
  const daTela = [...(estado?.historico ?? []).filter(h => !h.terminal), ...abertas].flatMap(({ rodada, respostas }) =>
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
    const proximo = { ...grill, perguntas, ...(estado?.fase === 'cli' && { canal: 'cli' as const }), ...(['cli', 'concluido'].includes(estado?.fase as string) && { telaFim: true }) }
    mudou = JSON.stringify(proximo) !== JSON.stringify(grill)
    return mudou ? proximo : grill
  })
  if (mudou) await salvarGrill($, novo!)
}

// um subcomando da grill-tela; o que nem roda volta como falha
const rodarTela = ($: EngineInterface, args: string[], init?: ProcessRunInit) =>
  $.process.run(['node', `${$.plugin.root}/skills/grill-tela/scripts/grill-tela.js`, ...args], init).catch(() => ({ exitCode: 1, stdout: '' }))
// O grill do terminal no historico de grills: a rodada respondida no dialogo, ou o sim com o
// documento, vai a sessao do grill na tela ou a do terminal, que a primeira rodada cria. A grill-tela
// so grava em sessao no terminal, e a falha nunca para o grill. O sim do grill que a pagina conduz
// (fora do canal cli) e da pagina, e nao vai.
async function registrarNoHistoricoDeGrills($: EngineInterface, corpo: { tipo: 'sim'; documento?: string } | { tipo: 'terminal'; questoes: QuestaoDaTela[]; respostas: RespostaDaTela[] }) {
  const grill = await read($, GRILL)
  const alvo = grill?.tela ?? grill?.registro
  if (!grill || (corpo.tipo === 'sim' && (!alvo || (grill.tela && grill.canal !== 'cli')))) return
  const args = alvo ? ['registrar', alvo, '-'] : ['registrar', '--projeto', nomeDa(await $.session.root()), '--pedido', grill.pedido, '-']
  const r = await rodarTela($, args, { stdin: JSON.stringify(corpo) })
  const url = !alvo && r.exitCode === 0 && URL_DA_TELA.exec(r.stdout)?.[0]
  if (!url) return
  const novo = await update($, GRILL, g => (g?.id === grill.id ? { ...g, registro: url } : g))
  if (novo?.registro === url) await salvarGrill($, novo)
}
// O AskUserQuestion do grill no canal tela: a rodada vai a pagina da grill-tela, que sobe na
// primeira, e a resposta dela volta no formato do dialogo, com a URL para a tela final da skill;
// a consulta da pagina a registra no grill. A pagina que nao sobe, recusa a rodada ou volta ao CLI,
// e a interrupcao, devolvem { motivo }: o grill segue pelo dialogo nativo ate o fim, e o toast e o
// contexto dizem por que.
// ponytail: multiSelect vira escolha unica, a pagina nao tem outra
async function pelaTela($: EngineInterface, e: { questions: Perguntas }, signal: AbortSignal): Promise<{ result: BuiltinToolResults['AskUserQuestion']; context: string[]; motivo?: undefined } | { motivo: `${string} ${string}` }> {
  const grill = await read($, GRILL)
  const projeto = nomeDa(await $.session.root())
  const iniciar = async (...mais: string[]) => URL_DA_TELA.exec((await rodarTela($, ['iniciar', '--projeto', projeto, ...mais])).stdout)?.[0]
  // o pelaTela so roda com o grill aberto (emGrill)
  const outro = () => iniciar('--pedido', grill!.pedido)
  // o estado da pagina, ou null quando ela nao responde
  const estadoDa = async (u: string): Promise<EstadoDaTela | null> => {
    try {
      const r = await $.http.fetch(rotaDa(u, 'estado'))
      return r.ok ? JSON.parse(r.text) : null
    } catch {
      return null
    }
  }
  const responde = async (u: string) => (await estadoDa(u)) !== null
  // a pagina guardada que parou de responder volta pelo --retomar do grill dela, ou sobe outra; a
  // que responde mas ja encerrou o grill dela (telaFim) recusaria a rodada, e sobe outra; todas
  // abrem o navegador
  let url = grill!.tela
  if (url && !(await responde(url))) url = (await iniciar('--retomar', '--id', idDaTela(url) ?? '')) ?? (await outro())
  else if (!url || grill!.telaFim) url = await outro()
  // a rodada seguinte a ultima que a pagina publicou neste grill
  // e da sessao, que tem tambem as rodadas do terminal: o numero nunca se repete
  const daSessao = url ? await estadoDa(url) : null
  const n = 1 + Math.max(0, ...grill!.perguntas.map(p => Number(/^tela:(\d+):/.exec(p.id)?.[1] ?? 0)), ...(daSessao?.historico ?? []).map(h => h.rodada.rodada), daSessao?.rodada?.rodada ?? 0)
  const questoes = questoesDaTela(e.questions)
  let msg: AvisoDaTela | null = null
  const textos: string[] = [] // o que o usuario escreveu a parte na pagina, com a rodada aberta
  const publicada = url && (await rodarTela($, ['rodada', url, '-'], { stdin: JSON.stringify({ rodada: n, questoes }) })).exitCode === 0
  if (publicada) {
    await update($, GRILL, g => g && { ...g, tela: url, telaFim: false })
    await sincronizarTela($)
    // o aviso de onde a rodada esta, antes de esperar: o navegador pode nao ter aberto
    $.ui.toast(`Grill na tela: ${url}`)
    // cada volta do aguardar e um $ e nao conta no orcamento do hook; a interrupcao nao espera a volta
    // o aguardar so roda com a rodada publicada, e ela so com a url (o let nao deixa o if estreitar)
    const parou = new Promise<null>(ok => (signal.aborted ? ok(null) : signal.addEventListener('abort', () => ok(null), { once: true })))
    do {
      const saida = await Promise.race([rodarTela($, ['aguardar', url!, '--ate', '120'], { timeoutMs: 150_000 }), parou])
      try {
        msg = saida && JSON.parse(saida.stdout.trim().split('\n').pop() as string)
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
        // o if acima estreitou o msg, que o fechamento nao enxerga (e let)
        const r = (msg as Extract<AvisoDaTela, { tipo: 'rodada' }>).respostas.find(x => x.id === `Q${i + 1}`)
        const escolha = r?.escolha ?? NAO_RESPOSTA[r?.marca as string] ?? 'sem resposta'
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
    return { ...g, telaFim: true, canal: 'cli' as const, perguntas: g.perguntas.filter(p => p.resposta != null || !p.id.startsWith(`tela:${n}:`)) }
  })
  if (novo) await salvarGrill($, novo)
  return { motivo }
}

// O Abrir do cartao do grill na tela e o Historico da aba Grill: a grill-tela sobe o servidor se ele caiu e
// abre o navegador; o toast diz o que nao deu. O servidor que subiu noutra porta muda a URL, e o
// grill passa a guardar a de agora.
async function abrirTela($: EngineInterface, url: string) {
  const r = await rodarTela($, ['abrir', url])
  if (r.exitCode !== 0) return $.ui.toast('Não deu para abrir o grill na tela')
  const agora = URL_DA_TELA.exec(r.stdout)?.[0]
  if (!agora || agora === url) return
  const novo = await update($, GRILL, g => (g?.tela === url ? { ...g, tela: agora } : g))
  if (novo?.tela === agora) await salvarGrill($, novo)
}
async function abrirHistorico($: EngineInterface) {
  const raiz = /http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/.exec((await rodarTela($, ['historico'])).stdout)?.[0]
  $.ui.toast(raiz ? `Histórico de grills: ${raiz}` : 'Não deu para abrir o histórico de grills')
}

// O que tem store volta dele: a leva, o historico e o grill, gravados pela raiz do projeto
// ($.session.root()), que o cd do shell nao move. O grill e o desta janela (`idDoGrill`), senao o
// mais recente do workspace, para a janela nova poder executar o prompt da leva. O custo da sessao
// nova recomeca: o inicio do custo da leva aberta passa a ser o de agora menos o que ela ja custou,
// antes do primeiro session.measure dela. Os tickets perdem o inicio do custo: o portao do ticket
// em curso sai sem custo, que a sessao velha nao deixou medido ate o fim.
async function carregar($: EngineInterface, raiz: string, idDoGrill: string | undefined) {
  // o store devolve unknown: cada chave guarda o que o mod gravou nela
  const salva = (await $.store.get(chave(raiz))) as Leva | undefined
  const usd = salva && !salva.fechada ? await $.session.usage().then(u => u.cost?.usd, () => undefined) : undefined
  if (salva) await update($, LEVA, () => (usd == null ? salva : { ...salva, custoInicio: usd - (salva.custo ?? 0), tickets: salva.tickets.map(({ custoInicio, ...t }) => t) }))
  const historico = (await $.store.get(chaveDoHistorico(raiz))) as LevaHistorico[] | undefined
  if (historico) await update($, HISTORICO, () => historico)
  const antigo = (await $.store.get(chaveAntigaDoGrill(raiz))) as Grill | undefined
  if (antigo) {
    const comId = { ...antigo, id: antigo.id ?? novoId(antigo.inicio ?? 0) }
    await $.store.set(chaveDoGrill(raiz, comId.id), comId)
    await $.store.delete(chaveAntigaDoGrill(raiz))
  }
  const grill = (idDoGrill && ((await $.store.get(chaveDoGrill(raiz, idDoGrill))) as Grill | undefined)) || (await grillsDo($, raiz))[0]
  if (grill) await update($, GRILL, () => grill)
}

// O prompt da leva como sugestao da caixa, que o Tab pega e o Enter envia como digitado (o
// $.prompt.submit chega como do plugin e nao autoriza as skills reservadas): depois do /clear,
// o do grill que nenhuma leva executou, aberta ou fechada; no inicio ou na retomada da sessao, o
// da leva aberta que nasceu do grill. Sem await: a sugestao espera o dialogo que segura a caixa,
// e a que falha so nao aparece.
async function sugerirLinha($: EngineInterface, depoisDoClear: boolean) {
  const grill = await read($, GRILL)
  if (!grill?.linha) return
  const leva = await read($, LEVA)
  // a leva do documento do grill que comecou depois dele; uma leva velha do mesmo documento nao conta
  const executada = Boolean(leva && leva.documento === grill.documento && !(leva.inicio! < grill.inicio))
  const doGrill = executada && !leva!.fechada
  if (depoisDoClear ? !executada : doGrill) $.prompt.suggest({ text: grill.linha }).catch(() => {})
}

// O botao Limpar da aba Geral, sempre ao lado do titulo e o unico que limpa (o /clear nao mexe no
// painel): o grill desta janela sai de todas as abas e do store (o de outra janela fica), e a leva, aberta ou fechada, sai com os
// agentes e o uso dela; o historico fica para a proxima fechada. A leva aberta limpa perde a retomada.
async function limpar($: EngineInterface) {
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
// acentos dos caminhos. O gitCru devolve o resultado inteiro, para quem decide pelo codigo de saida.
const gitCru = ($: EngineInterface, cwd: string, args: string[]) => $.process.run(['git', '-c', 'core.quotePath=false', ...args], { cwd }).catch(() => ({ exitCode: 1, stdout: '' }))
async function git($: EngineInterface, cwd: string, args: string[], aceito = 0) {
  const r = await gitCru($, cwd, args)
  return r.exitCode <= aceito ? r.stdout : ''
}
const naoRastreados = async ($: EngineInterface, raiz: string) => (await git($, raiz, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)

// Tira a base da aba Diff uma vez por sessao: o hot reload roda o session.start de novo.
// ponytail: um repositorio por sessao, o do cwd do inicio; o nao rastreado de antes que a sessao
// mudou fica fora
async function marcarBase($: EngineInterface, cwd: string) {
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

// Refaz a lista da aba Diff: o working tree contra a base, e os nao rastreados novos inteiros.
async function atualizarCodigo($: EngineInterface) {
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
async function lerArvore($: EngineInterface) {
  const raiz = await $.session.root()
  try {
    const topo = (await git($, raiz, ['rev-parse', '--show-toplevel'])).trim()
    if (!topo) return update($, ARVORE, () => ({ semGit: true, arquivos: [], novos: [], mudados: [] }))
    const lista = async (args: string[]) => (await git($, raiz, ['ls-files', ...args, '-z'])).split('\0').filter(Boolean)
    const [rastreados, soltos, apagados] = await Promise.all([lista(['--cached']), naoRastreados($, raiz), lista(['--deleted'])])
    const sumiram = new Set(apagados)
    const arquivos = [...new Set([...rastreados, ...soltos])].filter(c => !sumiram.has(c)).sort()
    const base = await read($, BASE)
    const daBase = base && semBarra(base.raiz) === semBarra(topo) && semBarra(raiz) === semBarra(topo)
    const novos = daBase ? soltos.filter(c => !base!.soltos.includes(c)) : []
    const mudados = daBase ? (await git($, raiz, ['diff', '--name-only', '-z', base!.commit])).split('\0').filter(Boolean) : []
    const nova = { arquivos, novos, mudados }
    await update($, ARVORE, velha => (JSON.stringify(velha) === JSON.stringify(nova) ? velha : nova))
  } catch {}
}

// as abas que se refazem ao abrir e depois de cada ferramenta que muda arquivo; a Arquivos abre o
// diff do arquivo mudado, entao refaz o da aba Diff tambem
async function refazer($: EngineInterface, aba: Aba) {
  if (aba === 'codigo' || aba === 'arquivos') await atualizarCodigo($)
  if (aba === 'arquivos') await lerArvore($)
}

const trocarAba = async ($: EngineInterface, aba: Aba) => {
  await update($, ABA, () => aba)
  await refazer($, aba)
}

// copiada em agentes.ts: o validate nao segue o $ por um import; mudou aqui, muda la
const mexer = ($: EngineInterface, qual: (a: LevaAgente) => boolean, como: (a: LevaAgente) => Partial<LevaAgente>) => update($, AGENTES, lista => lista.map(a => (qual(a) ? { ...a, ...como(a) } : a)))

// Acerta os agentes vivos da leva pela lista oficial: casa pelo agentId, ou pelo nome enquanto nao
// tem um (o teammate); o herdado de outra sessao que a lista nao conhece mais para. Os workflows
// nao estao na lista e ficam com os hooks.
// ponytail: pelo nome casa o ultimo da lista ainda sem dono; dois teammates de mesmo nome confundem
async function reconciliar($: EngineInterface) {
  if (!(await read($, AGENTES)).some(a => a.tipo === 'agente' && vivo(a))) return
  let lista: AgentInfo[]
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

// O Descartar do diff aberto: confirma e volta o arquivo a foto do inicio da sessao (o commit da
// base), so no working tree; o novo da sessao (solto que a base nao tinha) sai pelo clean. O
// codigo de saida decide, entao vai o gitCru, nao o git que engole a falha.
async function descartar($: EngineInterface, caminho: string) {
  // o dialogo dispensado rejeita: e o mesmo que manter
  const resposta = await $.ui.ask(`Descartar a mudança em ${caminho}?`, ['Descartar', 'Manter']).catch(() => '')
  const base = await read($, BASE)
  if (resposta !== 'Descartar' || !base) return
  const novo = (await naoRastreados($, base.raiz)).includes(caminho) && !base.soltos.includes(caminho)
  const args = novo ? ['clean', '-f', '--', caminho] : ['restore', `--source=${base.commit}`, '--worktree', '--', caminho]
  const r = await gitCru($, base.raiz, args)
  if (r.exitCode !== 0) return $.ui.toast(`Não deu para descartar ${caminho}`)
  await update($, ABERTOS, l => l.filter(c => c !== caminho))
  await refazer($, await read($, ABA))
}

// O Parar de um agente vivo: confirma e encerra pela TaskStop, que aceita o id da tarefa em
// background, o agentId ou o nome do teammate.
async function parar($: EngineInterface, a: LevaAgente) {
  // o dialogo dispensado rejeita: e o mesmo que nao parar
  const resposta = await $.ui.ask(`Parar o agente ${a.nome}?`, ['Parar', 'Deixar rodando']).catch(() => '')
  if (resposta !== 'Parar') return
  const r = await $.tool.call({ tool: 'TaskStop', task_id: idDeParar(a) }).catch(() => ({ isError: true }) as { isError: true; deny?: undefined })
  if (r.deny !== undefined || r.isError) return $.ui.toast(`Não deu para parar ${a.nome}`)
  const fim = await $.clock.now()
  await mexer($, x => x.id === a.id && vivo(x), x => ({ estado: 'parado', duracao: fim - x.inicio }))
}

// copiada em agentes.ts e leva.ts: o validate nao segue o $ por um import; mudou aqui, muda la
const ativa = async ($: EngineInterface) => {
  const leva = await read($, LEVA)
  return Boolean(leva && !leva.fechada)
}

// copiada em fora-do-pane.ts: o validate nao segue o $ por um import; mudou aqui, muda la
const alertasDe = async ($: EngineInterface) => alertas({ leva: await read($, LEVA), agentes: await read($, AGENTES), permissao: await read($, PERMISSAO), agora: await $.clock.now() })
// A permissao respondida: a ferramenta rodou ou o turno acabou no loop que a pediu (`agentId`,
// ausente no principal); a ferramenta de outro loop nao a responde.
async function semPermissao($: EngineInterface, agentId: string | undefined) {
  const permissao = await read($, PERMISSAO)
  if (!permissao || permissao.agentId !== agentId) return
  await update($, PERMISSAO, () => null)
  await alertar($)
}
// Avisa num toast os alertas novos e redesenha a faixa quando a lista muda; diz se ha algum.
async function alertar($: EngineInterface) {
  const lista = await alertasDe($)
  // o caso comum, sem alerta antes nem agora, nao escreve no estado
  if (lista.length === 0 && (await read($, ALERTADOS)).length === 0) return false
  const chaves = lista.map(a => a.chave)
  let novos: typeof lista = []
  let mudou = false
  await update($, ALERTADOS, antes => {
    novos = lista.filter(a => !antes.includes(a.chave))
    mudou = JSON.stringify(antes) !== JSON.stringify(chaves)
    return mudou ? chaves : antes
  })
  for (const a of novos) $.ui.toast(`Alerta: ${a.texto}`)
  if (mudou) $.ui.invalidate('ui.render')
  return lista.length > 0
}
const emGrill = async ($: EngineInterface) => {
  const grill = await read($, GRILL)
  return Boolean(naTela(grill) && grill!.documento == null)
}
const emGrillDaSessao = async ($: EngineInterface) => (await read($, GRILL_DA_SESSAO)) && (await emGrill($))

// a sessao: o inicio, o fim e a troca pelo /clear ou pelo /resume
export function registrarSessao(on: On, ctx: Contexto) {
  on('session.start', async ($, e, next) => {
    // o hot reload roda o session.start de novo: a janela fica com o grill dela
    await carregar($, await $.session.root(), (await read($, GRILL))?.id)
    await sugerirLinha($, false)
    await marcarBase($, e.cwd)
    for (const t of ctx.tiques) t.cancel()
    ctx.tiques = [
      // o tempo da fase, dos agentes em curso e do grill anda sozinho no pane; no grill, a pagina da
      // grill-tela e consultada a cada volta, para a resposta dada nela aparecer sem esperar o agente;
      // os alertas novos avisam
      $.clock.every(1000, async () => {
        const noGrill = await emGrill($)
        if (noGrill) await sincronizarTela($)
        await reconciliar($)
        if ((await alertar($)) || noGrill || (await ativa($))) $.ui.invalidate('ui.render')
      }),
      // no repouso, o ronco: so o pane montado redesenha
      $.clock.every(RONCO, async () => !(await read($, LEVA)) && !naTela(await read($, GRILL)) && $.ui.invalidate('ui.render')),
    ]
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
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      ctx.herdado = {
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
      const antes = ctx.herdado
      ctx.herdado = null
      await carregar($, await $.session.root(), antes?.grill)
      await sugerirLinha($, e.source === 'clear')
      if (antes) {
        await update($, ABA, () => antes.aba)
        // o /clear recomeca o Diff: a base nova e o tree de agora (o commit da sessao velha sai do Diff)
        if (e.source === 'resume') {
          await update($, BASE, () => antes.base)
          await update($, CODIGO, () => antes.codigo)
          await update($, ARVORE, () => antes.arvore)
        }
        await update($, ABERTOS, () => antes.abertos)
        await update($, PASTAS, () => antes.pastas)
        await update($, FILTRO, () => antes.filtro)
        await update($, USO, () => antes.uso)
        // a lista oficial e da sessao: o herdado que ela nao conhece mais para (reconciliar)
        await update($, AGENTES, () => antes.agentes.map(a => ({ ...a, herdado: true })))
      }
      if (e.source === 'clear') {
        await marcarBase($, await $.session.root())
        await refazer($, await read($, ABA))
      }
    }
    return next(e)
  })
}

// os marcos da leva e do grill, a /faz e o /cpv, a Skill e as rodadas do grill
export function registrarMarcosEGrill(on: On, ctx: Contexto) {
  // o Limpar tirou do painel uma leva ou um grill que o agente ainda toca: os marcos dela seguem sem
  // recusa (a recusa o faria recriar o que saiu), ate um inicio ou um grill novo
  on('tool.call', { tool: MARCO }, async ($, chamada) => {
    // a ferramenta do proprio plugin chega sem os campos tipados: a entrada e a do inputSchema
    const e = chamada as unknown as Marco
    if (e.marco === 'inicio' || e.marco === 'grill') ctx.limpo = false
    else if (ctx.limpo && !(MARCOS_DO_GRILL.includes(e.marco) ? await read($, GRILL) : await read($, LEVA))) {
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
      if (e.marco === 'entendimento') await registrarNoHistoricoDeGrills($, { tipo: 'sim', documento: grill.documento })
      return { result: `marco registrado; ${e.marco}` }
    }
    const antes = await read($, LEVA)
    // o custo da sessao, que o inicio e o fechamento guardam, e no inline o ticket e o portao (nos
    // modos paralelos os tickets correm juntos); erro aqui nunca para a leva
    const comUsd = ['inicio', 'fechamento'].includes(e.marco) || (['ticket', 'portao'].includes(e.marco) && antes?.modo === 'inline')
    const usd = comUsd ? await $.session.usage().then(u => u.cost?.usd, () => undefined) : undefined
    const leva = aplicar(antes, e, await $.clock.now(), usd)!
    // deny e a forma de um hook devolver erro de ferramenta: o modelo recebe o texto como erro
    if (leva.erro) return { deny: leva.erro }
    // a leva comeca (ou retoma): o grill sai da aba Geral
    if (e.marco === 'inicio') await tirarGrillDaTela($)
    if (retoma(antes, e)) {
      const tickets = leva.tickets.map(({ id, titulo, estado, notas }) => ({ id, titulo, estado, notas }))
      const estado = JSON.stringify({ fase: leva.fase, tickets, sujos: leva.sujos ?? [] }, null, 2)
      return { result: `marco registrado; retomada na fase ${leva.fase}\n${estado}` }
    }
    const falta = ['inicio', 'fase'].includes(e.marco) && semSkill(leva.fase, await read($, SKILLS))
    // a janela de 5 h em 90% ao entrar numa fase em que sub-agentes rodam: um aviso por leva
    const janela = (await read($, MEDIDA))?.janela?.percentUsed ?? 0
    const comAgentes = ['revisao', 'correcoes'].includes(leva.fase) || (leva.fase === 'implement' && ['sub-agents', 'workflow'].includes(leva.modo as string))
    const avisa = e.marco === 'fase' && comAgentes && janela >= 90 && !leva.avisoDaJanela
    // o objeto e novo, o aplicar acabou de cria-lo
    if (avisa) leva.avisoDaJanela = true
    const raiz = await $.session.root()
    await $.store.set(chave(raiz), leva)
    await update($, LEVA, () => leva)
    await alertar($)
    if (avisa) $.ui.toast(`Janela de 5 h em ${porcento(janela)}: os sub-agentes dividem o limite com esta sessão`)
    // o fechamento aplicado tinha leva antes
    if (e.marco === 'fechamento' && !antes!.fechada) {
      const modelos = [...new Set((await read($, AGENTES)).map(a => a.modelo).filter(Boolean))]
      const historico = [{ ...leva, modelos }, ...(((await $.store.get(chaveDoHistorico(raiz))) as LevaHistorico[] | undefined) ?? [])].slice(0, NO_HISTORICO)
      await $.store.set(chaveDoHistorico(raiz), historico)
      await update($, HISTORICO, () => historico)
      // zera no fechamento, nao no inicio: a proxima leva invoca as reservadas antes do inicio
      await update($, SKILLS, () => [])
    }
    if (e.marco === 'inicio') {
      // o vivo de fora da leva fica, para o alerta dele; o cartao Sub-agentes nao o mostra
      await update($, AGENTES, lista => lista.filter(a => a.foraDaLeva && vivo(a)))
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
      ctx.noFaz = true
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
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const nome = String(e.skill ?? '').split(':').pop() as string
    if (Object.values(SKILL_DA_FASE).includes(nome)) await update($, SKILLS, lista => (lista.includes(nome) ? lista : [...lista, nome]))
    const pedido = String(e.args ?? '').trim()
    const daFaz = nome === 'grilling' && ctx.noFaz
    // o grilling consome a /faz que o invocou, com ou sem o pedido
    if (nome === 'grilling') ctx.noFaz = false
    if (daFaz && pedido && !(await emGrillDaSessao($))) {
      ctx.limpo = false
      // o pedido nao vazio nunca e recusado
      const grill = aplicarNoGrill(null, { marco: 'grill', pedido: pedido.length > 60 ? `${pedido.slice(0, 59)}…` : pedido }, await $.clock.now()) as Grill
      await salvarGrillNovo($, grill)
      await update($, GRILL, () => grill)
      await update($, GRILL_DA_SESSAO, () => true)
    }
    const r = await next(e)
    // no canal tela, o grill da /faz nasce na grill-tela ja aqui, e a URL vai ao agente antes da
    // primeira pergunta: o AskUserQuestion que o pelaTela segura nunca espera sem ela a vista
    const doGrill = daFaz && ctx.canalTela && r.result !== undefined && (await emGrillDaSessao($)) && (await read($, GRILL))
    if (doGrill && !doGrill.tela && doGrill.canal !== 'cli') {
      const url = URL_DA_TELA.exec((await rodarTela($, ['iniciar', '--projeto', nomeDa(await $.session.root()), '--pedido', doGrill.pedido])).stdout)?.[0]
      if (!url) return r
      const novo = await update($, GRILL, g => g && { ...g, tela: url })
      if (novo) await salvarGrill($, novo)
      $.ui.toast(`Grill na tela: ${url}`)
      const aviso = `O grill desta /faz vai a grill-tela, em ${url}: escreva esta URL ao usuario antes da primeira pergunta, para ele saber onde responder. As rodadas seguem pelo AskUserQuestion, que o plugin leva a essa pagina.`
      return { ...r, context: [...(r.context ?? []), aviso] }
    }
    if (!ctx.canalTela || nome !== 'grilling' || daFaz || r.result === undefined || (await emGrillDaSessao($))) return r
    const aviso = 'Este grill nao e o da /faz, e o plugin nao leva o AskUserQuestion dele a pagina: ignore a instrucao de fazer as rodadas pelo AskUserQuestion, invoque a skill grill-tela e conduza o grill inteiro por ela.'
    return { ...r, context: [...(r.context ?? []), aviso] }
  })

  // as rodadas do grill pelo CLI: cada pergunta entra pelo tema e espera a resposta (as da
  // grill-tela chegam pelo estado da pagina, em sincronizarTela). No canal tela, a rodada vai
  // antes a pagina, ate o grill voltar ao CLI
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (!(await emGrill($))) return next(e)
    let voltou = null
    // o emGrill acima garante o grill
    if (ctx.canalTela && (await read($, GRILL))!.canal !== 'cli' && (await read($, GRILL_DA_SESSAO))) {
      const r = await pelaTela($, e, next.signal)
      if (!r.motivo) return r
      voltou = `A rodada não ficou na grill-tela (${r.motivo}): o grill segue no terminal, pelo diálogo.`
    }
    const id = e.tool_use_id
    const novas = e.questions.map(q => ({ id, pergunta: q.question, tema: q.header || q.question }))
    // o Limpar apertado durante a espera da pagina ja tirou o grill
    await update($, GRILL, g => g && { ...g, perguntas: [...g.perguntas, ...novas] })
    const r = await next(e)
    // o result tipado e o do respondido (o do erro e unknown), e o answers vem como {}: o que a pergunta tem e a resposta em texto
    const respostas = ((r.result as BuiltinToolResults['AskUserQuestion'] | undefined)?.answers ?? {}) as Record<string, string>
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
    if (respondido && !semResposta) {
      const questoes = questoesDaTela(e.questions)
      await registrarNoHistoricoDeGrills($, { tipo: 'terminal', questoes, respostas: respostasDaTela(e.questions, questoes, respostas) })
    }
    // o context vai tambem no deny, como sempre foi; o tipo do deny nao o preve
    return voltou ? ({ ...r, context: [...(r.context ?? []), voltou] } as typeof r) : r
  })
}

// a permissao pendente e o fim de cada turno
export function registrarPermissaoETurno(on: On) {
  // o pedido de permissao acende o alerta; o mod so observa, a decisao segue com o Claude Code
  on('classic.PermissionRequest', async ($, e, next) => {
    await update($, PERMISSAO, () => ({ ferramenta: e.tool_name, agentId: e.agent_id }))
    await alertar($)
    return next(e)
  })

  // o fim de cada turno: soma os tokens do loop para a aba Uso, fecha o sub-agente em background e
  // apaga a permissao pendente
  on('turn.complete', async ($, e, next) => {
    await semPermissao($, e.agentId)
    if (e.usage) {
      const loop = e.agentId ?? 'sessao'
      await update($, USO, uso => ({ ...uso, [loop]: { ...somar(uso[loop], e.usage!), modelo: e.usage!.model ?? uso[loop]?.modelo ?? '' } }))
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
}

// a ferramenta que muda arquivo, a grill-tela pelo shell e a linha do localizador
export function registrarFerramentas(on: On, ctx: Contexto) {
  // a ferramenta que muda arquivo refaz a aba Diff ou a Arquivos, se e ela que esta na tela; o comando da
  // grill-tela que leva a URL da pagina liga a consulta das rodadas dela no grill em curso; o
  // prompt que o localizador gera (--linha) entra no grill sem depender do marco linha e, sem o
  // marco entendimento, fecha o grill na tela com o documento do prompt: senao o tempo nao para
  on('tool.call', async ($, chamada, next) => {
    // sem filtro, o evento e o de qualquer ferramenta: o command so o Bash e o PowerShell trazem
    const e = chamada as typeof chamada & { command?: string }
    // a ferramenta chamada dentro de um sub-agente traz o agentId dele: e a ultima atividade dele
    if (e.agentId) {
      const agora = await $.clock.now()
      await mexer($, a => a.agentId === e.agentId, () => ({ atividade: agora }))
    }
    const r = await next(e)
    await semPermissao($, e.agentId)
    if (MUDAM.includes(e.tool)) await refazer($, await read($, ABA))
    const tela = /grill-tela\.js/.test(e.command ?? '') && URL_DA_TELA.exec(e.command!)?.[0]
    if (tela && (await emGrill($))) {
      // o emGrill acima garante o grill
      await update($, GRILL, g => ({ ...g!, tela, telaFim: false }))
      await sincronizarTela($)
    }
    // no canal tela, o --retomar do grill desta janela que voltou ao CLI o devolve a tela, na URL de agora (o servidor
    // pode ter subido noutra porta): a rodada seguinte vai a pagina
    const deVolta = ctx.canalTela && RETOMAR.test(e.command ?? '') && URL_DA_TELA.exec(String((r?.result as Saida | undefined)?.stdout ?? ''))?.[0]
    if (deVolta && (await emGrill($))) {
      const novo = await update($, GRILL, g => {
        if (g?.canal !== 'cli' || idDaTela(g.tela) !== idDaTela(deVolta)) return g
        const { canal, ...resto } = g
        return { ...resto, tela: deVolta, telaFim: false }
      })
      if (novo?.tela === deVolta) await salvarGrill($, novo)
    }
    // so o stdout que abre com o prompt (o comando composto que imprime outra coisa antes nao e o
    // localizador falando), e so no grill na tela: o que a leva tirou de la guarda o prompt dela
    const linha = /skills-do-matt\.js["']?\s+--linha/.test(e.command ?? '') && String((r?.result as Saida | undefined)?.stdout ?? '').trim()
    const grill = linha && /^rode \S+ leva /.test(linha) && naTela(await read($, GRILL))
    if (grill) {
      const agora = await $.clock.now()
      const comLinha = aplicarNoGrill(grill, { marco: 'linha', linha }, agora)
      // o documento vem da abertura do prompt, ja expandido pelo shell (skills-do-matt.js, linhaDaLeva),
      // lida no prompt sem o \r que o PowerShell poe
      // a recusa nao tem linha: o ?? '' a cobre
      const documento = /^rode \S+ leva (.+) até o fim\.$/m.exec((comLinha as Grill).linha ?? '')?.[1]
      const fechado = !comLinha.erro && comLinha.documento == null && documento && aplicarNoGrill(comLinha, { marco: 'entendimento', documento }, agora)
      const novo = fechado && !fechado.erro ? fechado : comLinha
      if (!novo.erro) {
        await salvarGrill($, novo)
        await update($, GRILL, () => novo)
        if (novo === fechado) await registrarNoHistoricoDeGrills($, { tipo: 'sim', documento: novo.documento })
        // o fim do grill: o painel vai a aba Grill com o cartao Prompt no topo, o Executar a vista. A
        // key so existe depois que o pane redesenha a aba, e a recusa de antes disso tenta de novo; o
        // pane fechado recusa todas, e a aba fica Grill para quando ele abrir
        // ponytail: 5 tentativas a cada 100 ms; um aviso de redesenho do engine troca o laco, se vier
        await trocarAba($, 'grill')
        for (let i = 0; i < 5; i++) {
          const rolou = await $.ui.scroll({ to: { key: 'grill:prompt' }, in: PANE, block: 'start' }).catch(() => ({}) as { deny?: undefined })
          if (!rolou.deny) break
          await $.clock.sleep(100)
        }
      }
    }
    return r
  })
}

// o comando que abre e fecha o pane, e o desenho dele
export function registrarPane(on: On, ctx: Contexto) {
  on('command.run', { command: PANE }, async $ => {
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'Painel da leva fechado.' }
    }
    await $.ui.open({ id: PANE, title: 'Leva' })
    return { text: 'Painel da leva aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elementos = $.ui.resolve(e) as Elementos
    const leva = await read($, LEVA)
    // a aba Grill mostra o ultimo grill do workspace; a aba Geral, so o que ainda esta na tela
    const ultimoGrill = await read($, GRILL)
    // sem leva, o grill que o inicio tirou daqui volta, para o Limpar alcanca-lo
    const grill = leva ? naTela(ultimoGrill) : ultimoGrill
    const aba = await read($, ABA)
    const arquivos = await read($, CODIGO)
    // os efeitos dos botoes e do campo, ligados ao $ aqui: o desenho (painel/desenho/) e puro
    const acoes: Acoes = {
      trocarAba: qual => trocarAba($, qual),
      limpar: () => {
        ctx.limpo = true
        return limpar($)
      },
      // o diff aberto na aba Diff ou na Arquivos: a mesma lista de abertos
      alternarDiff: caminho => update($, ABERTOS, l => (l.includes(caminho) ? l.filter(c => c !== caminho) : [...l, caminho])),
      alternarPasta: caminho => update($, PASTAS, l => (l.includes(caminho) ? l.filter(c => c !== caminho) : [...l, caminho])),
      filtrar: texto => update($, FILTRO, () => texto),
      copiar: async (a, press) => {
        const r = await $.ui.copy({ text: a.patch, surface: press?.surface }).catch(() => ({ isCopied: false }))
        if (!r.isCopied) $.ui.toast(`Não deu para copiar o diff de ${a.caminho}`)
      },
      descartar: caminho => descartar($, caminho),
      parar: a => parar($, a),
      abrirTela: url => abrirTela($, url),
      abrirHistorico: () => abrirHistorico($),
      clear: () => $.command.run({ command: 'clear' }),
      executar: async texto => (await $.prompt.fill({ text: texto })).isFilled || $.ui.toast('Não deu para colar o prompt'),
    }
    // o tamanho do corpo do pane; o viewport e o da tela inteira, e centralizar por ele joga o
    // desenho para baixo, fora do pane baixo
    const linhas = e.props?.scroll?.bodyRows ?? e.viewport?.rows
    const colunas = e.props?.bodyColumns ?? e.viewport?.columns
    const kit = primitivas(elementos, { aba, arquivos, linhas, colunas }, acoes)
    if (aba === 'painel' && !grill && !leva) return abaRepouso(kit, { agora: await $.clock.now() })
    // um renderer por aba; cada entrada le o que a aba desenha, na ordem de sempre
    const abertos = await read($, ABERTOS)
    const desenhar: Record<Aba, () => Promise<RenderElement>> = {
      codigo: async () => abaDiff(kit, { arquivos, abertos, base: await read($, BASE) }, acoes),
      arquivos: async () => {
        const arvore = await read($, ARVORE)
        const abertas = await read($, PASTAS)
        const filtro = await read($, FILTRO)
        return abaArquivos(kit, { arvore, abertas, filtro, arquivos, abertos, raiz: await $.session.root() }, acoes)
      },
      tickets: async () => abaTickets(kit, { leva, agora: await $.clock.now() }),
      uso: async () => {
        const agora = await $.clock.now()
        const uso = Object.entries(await read($, USO))
        const agentes = await read($, AGENTES)
        return abaUso(kit, { uso, agentes, medida: await read($, MEDIDA), leva, agora })
      },
      grill: async () => abaGrill(kit, { ultimoGrill, agora: await $.clock.now() }, acoes),
      painel: async () => {
        const agora = await $.clock.now()
        if (grill) return geralDoGrill(kit, { grill, agora }, acoes)
        // o repouso ja voltou sem leva: aqui, na aba Geral sem grill, a leva existe
        const skills = await read($, SKILLS)
        const agentes = await read($, AGENTES)
        return geralDaLeva(kit, { leva: leva!, ultimoGrill, skills, agentes, historico: await read($, HISTORICO), agora }, acoes)
      },
    }
    return desenhar[aba]()
  })
}
