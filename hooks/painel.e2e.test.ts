// E2e do painel da leva (hooks/register.ts), pela porta da sessao: uma leva inteira, do grill da
// /faz ao /clear depois do /cpv, com o git, a pagina da grill-tela, o relogio, o store e a lista de
// agentes simulados. Nos pontos marcados desenha as seis abas, o repouso, a faixa acima do prompt e
// o spinner, no terminal e no desktop, e compara o texto de cada quadro, os resultados do faz_marco
// e os toasts com o golden (hooks/painel.e2e.golden.ts), a foto do desenho aceito. Rode com
// `claude plugin test .` na raiz do repositorio.
//
// Um quadro diferente do golden (ou sem golden) reprova com o recebido e o esperado; antes, o teste
// imprime cada quadro da jornada numa linha `@@GOLDEN@@{"nome":...,"texto":...}`, na ordem dela.
// A mudanca intencional de desenho regrava o golden a partir dessas linhas, no mesmo commit.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { GOLDEN } from './painel.e2e.golden.ts'

// o console do kit, que a lib es2023 do tsconfig nao declara
declare const console: { log: (texto: string) => void }

const PLUGIN = 'macrex-skills'
const MARCO = 'mcp__macrex-skills__faz_marco'
const SURFACES = ['terminal', 'desktop'] as const
const RAIZ = 'D:/ws/painel'
const URL = 'http://127.0.0.1:47110/g/painel/20261009-142524?t=abc123'
const HISTORICO_DE_GRILLS = 'http://127.0.0.1:47110/?t=abc123'
const PROMPT = 'rode /macrex-skills:faz leva Painel em módulos até o fim.\n/mattpocock-skills:to-spec expandiu esse documento in-place; siga.'
// o corpo do pane com tamanho fixo: o desenho nao depende do viewport
const LARGO = { bodyColumns: 80, scroll: { bodyRows: 40 } }
const ESTREITO = { bodyColumns: 50, scroll: { bodyRows: 40 } }
const BAIXO = { bodyColumns: 80, scroll: { bodyRows: 6 } }
const PROPS_DA_FAIXA = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const PROPS_DO_SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' }
const INICIO = Date.UTC(2026, 9, 9, 13, 0, 0)
const segundos = (n: number) => n * 1000
const minutos = (n: number) => n * 60000

// O mundo sob o mod, como o mundo() do painel.test.ts: o workspace, o store em memoria, o relogio
// parado e a tela que aceita toast; mais o $.state por sessao, que o /clear troca.
function mundo($: Engine, on: On, store: Record<string, unknown>) {
  const toasts: string[] = []
  mock.store(on, store)
  const relogio = mock.clock(on, { now: INICIO })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.cwd', () => ({ value: RAIZ }))
  on('session.root', () => ({ value: RAIZ }))
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  let uso: Record<string, unknown> = { startedAt: 0, context: { window: 200000 }, rateLimits: [] }
  on('session.usage', () => ({ value: uso }) as never)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // o $.state do engine e da sessao: o /clear abre outra com ele vazio, sem session.start
  let sessao = 0
  const valores = new Map<string, { value: unknown; version: number }>()
  on('state.get', ($, e) => ({ value: valores.get(`${sessao}:${e.key}`) ?? { value: undefined, version: 0 } }) as never)
  on('state.set', ($, e) => {
    const chave = `${sessao}:${e.key}`
    const versao = valores.get(chave)?.version ?? 0
    if (e.ifVersion != null && e.ifVersion !== versao) return { value: { isSet: false, version: versao } } as never
    valores.set(chave, { value: e.value, version: versao + 1 })
    return { value: { isSet: true, version: versao + 1 } } as never
  })
  return {
    toasts,
    relogio,
    usar: (usd: number) => { uso = { ...uso, cost: { usd } } },
    sessao: () => $.session.start({ cwd: RAIZ, surface: 'terminal', isInteractive: true }),
    // o /clear: a sessao acaba, o processo segue com outro id e um $.state vazio
    clear: async () => {
      await $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } } as never)
      sessao++
      await $.classic.SessionStart({ source: 'clear' } as never)
    },
  }
}

// O pane montado como texto, o mesmo quadro() do painel.test.ts: Text inteiro numa linha, Button
// como [ rotulo ], Code linha a linha; a Box em coluna empilha, a em fila poe lado a lado.
type No = string | { type: string; props?: Record<string, unknown>; children?: No[] }
async function quadro(ui: { drawn: () => Promise<unknown> }) {
  const texto = (n: No): string => (typeof n === 'string' ? n : (n.children ?? []).map(texto).join(''))
  const linhas = (n: No): string[] => {
    if (typeof n === 'string' || n.type === 'Text') return [texto(n)]
    if (n.type === 'Button') return [`[ ${n.props?.label} ]`]
    if (n.type === 'Code') return String(n.props?.source).split('\n')
    const filhos = (n.children ?? []).map(linhas)
    if (n.props?.flexDirection === 'column') return filhos.flat()
    return Array.from({ length: Math.max(0, ...filhos.map(f => f.length)) }, (_, i) => filhos.map(f => f[i] ?? '').filter(Boolean).join('  '))
  }
  return linhas((await ui.drawn()) as No).join('\n')
}

// O git do workspace: a base de cada sessao (o stash create conta), os rastreados, os soltos e os
// apagados, os mudados e o diff contra cada base, e o diff de cada novo; o restore do Descartar
// tira o arquivo do diff.
function repo(on: On) {
  const git = {
    bases: 0,
    rastreados: ['README.md', 'assets/logo.png', 'hooks/painel.test.ts', 'hooks/register.js', 'skills/faz/SKILL.md'],
    soltos: ['velho.txt'],
    apagados: [] as string[],
    mudados: {} as Record<string, string[]>,
    diff: {} as Record<string, string>,
    novos: {} as Record<string, string>,
  }
  const lista = (l: string[]) => l.map(c => `${c}\0`).join('')
  return {
    git,
    rodar: (argv: readonly string[]) => {
      const a = argv.join(' ')
      const base = /\b(base\d+)\b/.exec(a)?.[1] ?? ''
      if (/ restore /.test(a)) {
        const caminho = argv.at(-1) ?? ''
        git.diff[base] = (git.diff[base] ?? '').split(/^(?=diff --git )/m).filter(b => !b.startsWith(`diff --git a/${caminho} `)).join('')
        git.mudados[base] = (git.mudados[base] ?? []).filter(c => c !== caminho)
        return { exitCode: 0, stdout: '' }
      }
      if (/--no-index/.test(a)) return { exitCode: 1, stdout: git.novos[argv.at(-1) ?? ''] ?? '' }
      const stdout = /rev-parse --show-toplevel/.test(a) ? `${RAIZ}\n`
        : /stash create/.test(a) ? `base${++git.bases}\n`
        : /ls-files --cached/.test(a) ? lista(git.rastreados)
        : /ls-files --others/.test(a) ? lista(git.soltos)
        : /ls-files --deleted/.test(a) ? lista(git.apagados)
        : /diff --name-only -z/.test(a) ? lista(git.mudados[base] ?? [])
        : /diff --no-color --no-ext-diff/.test(a) ? (git.diff[base] ?? '')
        : ''
      return { exitCode: 0, stdout }
    },
  }
}

const diffDe = (caminho: string, cabecalho: string, ...linhas: string[]) =>
  [`diff --git a/${caminho} b/${caminho}`, 'index 1111111..2222222 100644', `--- a/${caminho}`, `+++ b/${caminho}`, cabecalho, ...linhas, ''].join('\n')
const BINARIO = ['diff --git a/assets/logo.png b/assets/logo.png', 'index 1111111..2222222 100644', 'Binary files a/assets/logo.png and b/assets/logo.png differ', ''].join('\n')
const NOVO = ['diff --git a/docs/novo.md b/docs/novo.md', 'new file mode 100644', 'index 0000000..3333333', '--- /dev/null', '+++ b/docs/novo.md', '@@ -0,0 +1,2 @@', '+# Novo', '+linha nova', ''].join('\n')

// a leva fechada antes desta, no historico do workspace
const LEVA_ANTERIOR = {
  documento: 'Leva anterior',
  fase: 'fechamento',
  fases: ['spec', 'tickets', 'implement', 'fechamento'],
  entradas: {},
  inicio: INICIO - minutos(90),
  fim: INICIO - minutos(60),
  tickets: [{ id: '01', titulo: 'Velho', estado: 'verde', reparos: 2 }, { id: '02', titulo: 'Outro', estado: 'vermelho' }],
  sujos: [],
  fechada: true,
  custo: 0.8,
  modo: 'sub-agents',
  modelos: ['claude-opus-5-5', 'claude-haiku-5-5'],
}

describe('painel da leva, de ponta a ponta', () => {
  test('a jornada de uma leva desenha o mesmo que o golden em cada quadro', { options: { grill_canal: 'tela' }, timeoutMs: 60_000 }, async ($, on) => {
    const { toasts, relogio, usar, sessao, clear } = mundo($, on, { [`levas:${RAIZ}`]: [LEVA_ANTERIOR] })
    const { git, rodar } = repo(on)

    // a pagina da grill-tela: o estado dela, os subcomandos rodados e as voltas do aguardar, a
    // primeira segura ate o teste solta-la
    let estado: Record<string, any> = { fase: 'inicio', historico: [] }
    const comandos: string[] = []
    const voltas: string[] = []
    let segura: Promise<void> | null = null
    let soltar = () => {}
    const tela = async (argv: string[], stdin?: string) => {
      const [sub = '', ...args] = argv
      comandos.push([sub, ...args].join(' ') + (stdin ? `\n  ${stdin}` : ''))
      let stdout = 'ok\n'
      if (sub === 'iniciar' || sub === 'abrir') stdout = `${URL}\n`
      if (sub === 'historico') stdout = `Histórico de grills: ${HISTORICO_DE_GRILLS}\n`
      if (sub === 'rodada') estado = { ...estado, fase: 'rodada', rodada: JSON.parse(stdin ?? '') }
      if (sub === 'aguardar') {
        if (segura) await segura
        segura = null
        stdout = `${voltas.shift() ?? '{"tipo":"cli"}'}\n`
        const msg = JSON.parse(stdout.trim().split('\n').pop() ?? '')
        if (msg.tipo === 'rodada') estado = { fase: 'aguarde', rodada: estado.rodada, historico: [...estado.historico, { rodada: estado.rodada, respostas: msg.respostas }] }
        if (msg.tipo === 'cli') estado = { ...estado, fase: 'cli' }
      }
      return { exitCode: 0, stdout }
    }
    on('process.run', async ($, e) => {
      const [programa, , ...resto] = e.argv
      const r = programa === 'git' ? rodar(e.argv) : await tela(resto, e.init?.stdin)
      return { value: { ...r, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } }))

    // o pane aberto ou fechado, para a faixa e o /painel-macrex
    const abertos = new Set<string>()
    on('ui.open', ($, e) => { abertos.add(e.id); return { value: { isPlaced: true } } })
    on('ui.close', ($, e) => { abertos.delete(e.id); return { value: undefined } })
    on('ui.panes', () => ({ value: [...abertos].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
    on('ui.copy', () => ({ value: { isCopied: true } }) as never)
    const sugestoes: string[] = []
    on('prompt.suggest', ($, e) => { sugestoes.push(e.text); return { isShown: true } })
    on('prompt.fill', ($, e) => { sugestoes.push(`fill: ${e.text}`); return { isFilled: true } })
    // o que outro mod desenha na faixa e no spinner, embaixo do mod
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Text, {}, 'outro mod') as never)
    on('ui.render', { component: 'Spinner' }, ($, e) => h($.ui.resolve(e).Text, {}, `${e.props.word}${e.props.suffix}`) as never)
    on('ui.render', { component: 'ToolUse' }, ($, e) => h($.ui.resolve(e).Text, {}, `generica ${e.props.tool}`) as never)

    // a lista oficial dos agentes e as ferramentas sob o mod
    let lista: { id: string; description: string; type: string; status: string; name?: string }[] = []
    on('agent.list', () => ({ value: lista }))
    const DO_AGENTE: Record<string, unknown> = {
      'opus-implement-01': { status: 'completed', agentId: 'a0', resolvedModel: 'claude-opus-5-5', totalDurationMs: segundos(95) },
      'sonnet-testes': { status: 'async_launched', agentId: 'a1' },
      'sonnet-revisor': { status: 'async_launched', agentId: 'a2' },
      'haiku-time': 'Spawned successfully.',
    }
    on('tool.call', { tool: 'Agent' }, ($, e) => ({ result: DO_AGENTE[e.name ?? ''] }) as never)
    on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched', taskId: 'w1', workflowName: 'tickets' } }) as never)
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    on('tool.call', { tool: 'Bash' }, ($, e) => ({ result: { stdout: /--linha/.test(e.command) ? `${PROMPT}\n` : '', stderr: '' } }) as never)
    on('tool.call', { tool: 'Read' }, () => ({ result: {} }) as never)
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }) as never)
    // o dialogo nativo: as respostas do grill no terminal e o Descartar do diff ($.ui.ask)
    const RESPOSTAS: Record<string, string> = {
      'Onde fica o golden?': 'Módulo .ts (Recommended)',
      'O e2e roda no desktop?': 'Só terminal',
      'Descartar a mudança em README.md?': 'Descartar',
    }
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({
      result: { questions: e.questions, answers: Object.fromEntries(e.questions.map(q => [q.question, RESPOSTAS[q.question] ?? ''])) },
    }) as never)
    on('skill.prompt', ($, e) => ({ text: e.text }))
    on('classic.SessionStart', () => ({}) as never)
    on('classic.PermissionRequest', () => ({}) as never)
    on('classic.TeammateIdle', () => ({}) as never)
    on('turn.complete', () => ({ text: '' }))
    const compactacoes: string[] = []
    on('session.compact', ($, e) => { compactacoes.push(`${e.trigger}: ${e.instructions ?? ''}`); return { messages: e.messages } as never })

    // o que a jornada compara com o golden, na ordem em que acontece
    const recebidos: Record<string, string> = {}
    const confere = (nome: string, texto: string) => {
      if (nome in recebidos) throw new Error(`quadro repetido na jornada: ${nome}`)
      recebidos[nome] = texto
    }
    const PANE = { plugin: PLUGIN, component: 'Pane', requestId: 'painel-macrex' } as const
    // o quadro de um componente em cada surface
    const desenhar = async (nome: string, alvo: object) => {
      for (const surface of SURFACES) {
        const ui = await $.ui.mount({ ...alvo, surface } as never)
        confere(`${nome} · ${surface}`, await quadro(ui))
        await ui.unmount()
      }
    }
    const pane = (nome: string, props: object = LARGO) => desenhar(nome, { ...PANE, props })
    // um botao ou o filtro do pane, apertado no terminal
    const noPane = async (agir: (ui: any) => Promise<unknown>) => {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: LARGO } as never)
      await agir(ui)
      await ui.unmount()
    }
    const apertar = (key: string) => noPane(ui => ui.press({ key }))
    const faixa = (nome: string, props: object = {}) => desenhar(nome, { plugin: PLUGIN, component: 'AbovePrompt', props: { ...PROPS_DA_FAIXA, ...props } })
    const spinner = (nome: string) => desenhar(nome, { plugin: PLUGIN, component: 'Spinner', props: PROPS_DO_SPINNER })
    const resultados: string[] = []
    const chamar = async (input: Record<string, unknown>) => {
      const r = await $.tool.call(input as never)
      resultados.push(`${input.tool}: ${JSON.stringify(r)}`)
      return r
    }
    const marco = (input: Record<string, unknown>) => chamar({ tool: MARCO, ...input })
    const turno = (agentId: string | undefined, model: string, entrada: number, saida: number, lido: number, criado: number) =>
      $.turn.complete({
        answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...(agentId ? { agentId } : {}),
        usage: { model, input_tokens: entrada, output_tokens: saida, cache_read_input_tokens: lido, cache_creation_input_tokens: criado },
      } as never)
    const info = (id: string, status: string, name?: string) => ({ id, description: 'd', type: 'general-purpose', status, ...(name ? { name } : {}) })

    // 1. O repouso: a sessao comeca sem leva nem grill
    await sessao()
    await pane('01 repouso')
    await pane('02 repouso baixo', BAIXO)
    await relogio.advance(700)
    await pane('03 repouso ronco')
    await faixa('04 faixa sem leva')
    await spinner('05 spinner sem leva')

    // 2. O grill da /faz no canal tela: o grilling sobe a pagina, e o marco grill so troca o pedido
    await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'painel em módulos' })
    await chamar({ tool: 'Skill', skill: 'mattpocock-skills:grilling', args: 'o painel da leva em módulos TypeScript, com um e2e golden que guarde o desenho', tool_use_id: 'tu-grilling' })
    await marco({ marco: 'grill', pedido: 'painel em módulos com e2e golden' })
    await relogio.advance(segundos(4))
    await pane('10 grill geral')
    await pane('11 grill geral estreito', ESTREITO)
    await apertar('fase:grill')
    await pane('12 grill aba sem perguntas')

    // a primeira rodada vai a pagina e espera: as perguntas aguardam na aba Grill
    segura = new Promise(ok => { soltar = ok })
    const rodada1 = chamar({
      tool: 'AskUserQuestion',
      tool_use_id: 'tu-rodada-1',
      questions: [
        { header: 'Módulos', question: 'Como dividir o register.js?', multiSelect: false,
          options: [{ label: 'Camadas e features (Recommended)', description: 'domínio, estado, features' }, { label: 'Um arquivo por aba', description: 'abas/', preview: 'abas/\n  geral.ts' }] },
        { header: 'Linguagem', question: 'O mod vira TypeScript?', multiSelect: false, options: [{ label: 'Sim, strict', description: '' }, { label: 'Não, JSDoc', description: '' }] },
      ],
    })
    await relogio.settle()
    await pane('13 grill aba rodada aguardando')
    voltas.push(
      '{"tipo":"texto","texto":"e o golden fica onde?"}',
      'Rodada 1 respondida na tela:\n\n{"tipo":"rodada","rodada":1,"respostas":[{"id":"Q1","marca":"aceito","escolha":"Camadas e features","comentario":null},{"id":"Q2","marca":"outra","escolha":"Sim, strict","comentario":"com noUncheckedIndexedAccess"}]}',
    )
    soltar()
    await rodada1
    await relogio.advance(segundos(6))

    // a segunda rodada volta ao terminal pela pagina: o dialogo nativo responde, e o registrar a grava
    voltas.push('{"tipo":"cli"}')
    await chamar({
      tool: 'AskUserQuestion',
      tool_use_id: 'tu-rodada-2',
      questions: [
        { header: 'Golden', question: 'Onde fica o golden?', multiSelect: false, options: [{ label: 'Módulo .ts (Recommended)', description: 'importado pelo teste' }, { label: 'JSON', description: 'lido do disco' }] },
        { header: 'Superfícies', question: 'O e2e roda no desktop?', multiSelect: false, options: [{ label: 'Terminal e desktop (Recommended)', description: '' }, { label: 'Só terminal', description: '' }] },
      ],
    })
    await relogio.advance(segundos(8))
    await pane('14 grill aba respondido')
    await apertar('tela:abrir')
    await apertar('grill:historico')

    // o entendimento e o prompt do localizador: o painel vai a aba Grill, no cartao Prompt
    await marco({ marco: 'entendimento', documento: 'Painel em módulos' })
    await chamar({ tool: 'Bash', tool_use_id: 'tu-linha', command: 'node "D:/ws/skills/faz/scripts/skills-do-matt.js" --linha "Painel em módulos" "da sessão" "da sessão"' })
    await marco({ marco: 'linha', linha: PROMPT })
    await relogio.advance(segundos(1))
    await pane('15 grill aba prompt')
    await apertar('grill:colar')
    await apertar('aba:painel')
    await pane('16 grill concluido geral')

    // o Clear do fim do grill: a sessao nova sugere o prompt da leva e volta com o grill
    await clear()
    await pane('17 grill depois do clear')

    // 3. A leva: as skills conferidas, o inicio, os tickets e o implement inline, com custo
    await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'Painel em módulos' })
    for (const skill of ['mattpocock-skills:to-spec', 'mattpocock-skills:implement']) await chamar({ tool: 'Skill', skill, tool_use_id: `tu-${skill}` })
    usar(1)
    await marco({ marco: 'inicio', documento: 'Painel em módulos até o fim.', sujos: ['velho.txt'] })
    await relogio.advance(segundos(9))
    await pane('20 leva spec geral')
    await faixa('21 faixa leva spec')
    await spinner('22 spinner leva spec')
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'tickets', tickets: [{ id: '01', titulo: 'E2e golden' }, { id: '02', titulo: 'Domínio puro' }] })
    await relogio.advance(segundos(6))
    await marco({ marco: 'tickets', tickets: [{ id: '01', titulo: 'E2e golden' }, { id: '02', titulo: 'Domínio puro' }, { id: '03', titulo: 'Composition root' }] })
    await marco({ marco: 'fase', fase: 'implement', modo: 'inline' })
    usar(1.2)
    await marco({ marco: 'ticket', ticket: '01' })
    await chamar({ tool: 'Agent', tool_use_id: 'tu-a0', name: 'opus-implement-01', description: 'implement', prompt: 'p', model: 'opus' })
    await relogio.advance(segundos(18))
    usar(1.5)
    await marco({ marco: 'portao', ticket: '01', portao: 'verde', testes: '109/109', notas: 'O e2e percorre a leva inteira e compara cada quadro com o golden.' })
    usar(1.6)
    await marco({ marco: 'ticket', ticket: '02' })

    // os agentes da leva: um em fundo, um workflow e um teammate; a lista oficial os acerta
    lista = [info('a1', 'running'), info('t1', 'running', 'haiku-time')]
    await chamar({ tool: 'Agent', tool_use_id: 'tu-a1', name: 'sonnet-testes', description: 'testes', prompt: 'p', model: 'sonnet' })
    await chamar({ tool: 'Workflow', tool_use_id: 'tu-w1', script: 'x' })
    await chamar({ tool: 'Agent', tool_use_id: 'tu-t1', name: 'haiku-time', description: 'time', prompt: 'p', model: 'haiku' })
    await relogio.advance(segundos(121))
    await pane('23 leva implement agentes sem saida')
    await faixa('24 faixa alerta sem saida')
    await chamar({ tool: 'Read', tool_use_id: 'tu-read', file_path: `${RAIZ}/hooks/register.js`, agentId: 'a1' })
    await $.classic.TeammateIdle({ teammate_name: 'haiku-time', team_name: '' } as never)
    await relogio.advance(segundos(1))

    // o portao vermelho acende o alerta, e o reparo o apaga
    usar(1.9)
    await marco({ marco: 'portao', ticket: '02', portao: 'vermelho', testes: '3/4' })
    await relogio.advance(segundos(2))
    await pane('25 leva portao vermelho')
    await faixa('26 faixa portao vermelho')
    await faixa('27 faixa portao vermelho no turno', { isWorking: true })
    await spinner('28 spinner implement')
    await marco({ marco: 'ticket', ticket: '02' })
    await relogio.advance(segundos(4))
    usar(2.1)
    await marco({ marco: 'portao', ticket: '02', portao: 'verde', reparos: 1, testes: '4/4', notas: 'Marcos, diff e árvore sem $.' })

    // a permissao pendente acende o alerta; o fim do turno a apaga
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } } as never)
    await faixa('29 faixa permissao pendente')
    await turno(undefined, 'claude-opus-5-5', 12000, 3400, 250000, 8000)
    // o sub-agente termina pelo turno dele; o workflow, pela notificacao da tarefa
    await turno('a1', 'claude-sonnet-5-5', 5000, 1200, 40000, 0)
    await $.session.append({
      message: { type: 'user', role: 'user', content: [{ type: 'text', text: '<task-notification>\n<task-id>w1</task-id>\n<status>completed</status>\n</task-notification>' }] },
      door: 'delivery',
      origin: { kind: 'tool', tool: 'Workflow' },
      uuid: 'u-w1',
    } as never)
    usar(2.2)
    await marco({ marco: 'ticket', ticket: '03' })
    await relogio.advance(segundos(10))
    usar(2.3)
    await marco({ marco: 'portao', ticket: '03', portao: 'verde', testes: '112/112' })
    // o inicio de novo, com o mesmo documento, e a retomada: devolve o estado da leva sem mexer nela
    await marco({ marco: 'inicio', documento: 'Painel em módulos até o fim.' })

    // 4. A revisao, as correcoes e a qualidade, item a item; a janela de 5 h em 92% avisa
    await $.session.measure({
      context: { window: 200000, tokens: 90000, percent: 45 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 92, resetsAt: new Date(relogio.now() + minutos(100)).toISOString() }, { kind: 'seven_day', percentUsed: 10 }],
      cost: { usd: 2.4 },
      changed: ['cost'],
    } as never)
    await marco({ marco: 'fase', fase: 'revisao' })
    await marco({ marco: 'item', item: 'Achados da revisão' })
    lista = [...lista, info('a2', 'running')]
    await chamar({ tool: 'Agent', tool_use_id: 'tu-a2', name: 'sonnet-revisor', description: 'revisao', prompt: 'p', model: 'sonnet' })
    lista = lista.map(i => (i.id === 'a2' ? info('a2', 'waiting') : i))
    await relogio.advance(segundos(1))
    await faixa('30 faixa agente aguardando')
    lista = lista.map(i => (i.id === 'a2' ? info('a2', 'completed') : i))
    await relogio.advance(segundos(8))
    await marco({ marco: 'item', item: 'Achados da revisão', portao: 'verde', detalhe: '3 achados' })
    await marco({ marco: 'fase', fase: 'correcoes' })
    await marco({ marco: 'item', item: 'Ajustes' })
    await relogio.advance(segundos(5))
    await marco({ marco: 'item', item: 'Ajustes', portao: 'vermelho', detalhe: '2 de 3' })
    await marco({ marco: 'item', item: 'Ajustes', portao: 'verde', detalhe: '3 de 3' })
    await marco({ marco: 'fase', fase: 'qualidade' })
    await relogio.advance(segundos(3))
    await marco({ marco: 'item', item: 'Testes', portao: 'verde', detalhe: '112/112' })
    await marco({ marco: 'item', item: 'Build' })
    // as recusas: o ticket que nao existe e o item com o nome do cartao
    await marco({ marco: 'portao', ticket: '09', portao: 'verde' })
    await marco({ marco: 'item', item: 'Qualidade' })
    await relogio.advance(segundos(2))
    await turno('a2', 'claude-sonnet-5-5', 3000, 900, 0, 1200)
    await pane('31 leva qualidade geral')
    await pane('32 leva qualidade geral estreito', ESTREITO)
    await apertar('aba:tickets')
    await pane('33 tickets')
    await apertar('aba:uso')
    await pane('34 uso')

    // a compactacao com a leva aberta: o resumo recebe o estado dela, e o precompute fica vetado
    for (const trigger of ['auto', 'precompute']) {
      const r = await $.session.compact({ messages: [{ role: 'user', text: 'oi', toolUses: [] }], trigger, instructions: 'o plano' } as never)
      compactacoes.push(`${trigger} -> ${JSON.stringify({ skip: (r as { skip?: unknown }).skip })}`)
    }
    confere('35 compactacao', compactacoes.join('\n'))

    // o Abrir painel da faixa, o /painel-macrex que fecha e abre, e a linha do marco na conversa
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, component: 'AbovePrompt', surface, props: PROPS_DA_FAIXA } as never)
      if (surface === 'terminal') await ui.press({ key: 'faixa:abrir' })
      confere(`36 faixa com o pane aberto · ${surface}`, await quadro(ui))
      await ui.unmount()
    }
    const comando = async () => resultados.push(`painel-macrex: ${JSON.stringify(await $.command.run({ command: 'painel-macrex' } as never))}`)
    await comando()
    await faixa('37 faixa com o pane fechado')
    await comando()
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({
        plugin: PLUGIN, surface, component: 'ToolUse',
        props: { tool_use_id: 't', tool: MARCO, input: { marco: 'portao', ticket: '01', portao: 'verde', testes: '3/4' }, isRunning: false, isErrored: false, isInterrupted: false },
      } as never)
      confere(`38 linha do marco · ${surface}`, await quadro(ui))
      await ui.unmount()
    }

    // 5. O diff da sessao: dois alterados, um binario e um novo; o aberto mostra o diff e as acoes
    git.diff.base2 = [
      diffDe('README.md', '@@ -1,2 +1,3 @@', ' # Skills', '-velho', '+novo', '+mais uma'),
      BINARIO,
      diffDe('hooks/register.js', '@@ -10,2 +10,2 @@ export function register', ' const a = 1', '-const b = 2', '+const b = 3'),
    ].join('')
    git.mudados.base2 = ['README.md', 'assets/logo.png', 'hooks/register.js']
    git.soltos = [...git.soltos, 'docs/novo.md']
    git.novos['docs/novo.md'] = NOVO
    await chamar({ tool: 'Edit', tool_use_id: 'tu-edit', file_path: `${RAIZ}/hooks/register.js`, old_string: 'b = 2', new_string: 'b = 3' })
    await apertar('aba:codigo')
    await pane('40 diff')
    await apertar('arquivo:0')
    await apertar('arquivo:1')
    await apertar('arquivo:3')
    await pane('41 diff abertos')
    await apertar('diff:descartar:README.md')
    await pane('42 diff descartado')

    // a arvore do projeto: as pastas abertas, o diff aberto embaixo do arquivo, e o filtro
    await apertar('aba:arquivos')
    await pane('43 arquivos')
    await apertar('no:hooks/')
    await apertar('no:docs/')
    await apertar('no:hooks/register.js')
    await pane('44 arquivos pastas abertas')
    await noPane(ui => ui.input({ key: 'arvore:filtro', text: 'reg', kind: 'change' }))
    await pane('45 arquivos filtro')
    await noPane(ui => ui.input({ key: 'arvore:filtro', text: 'nada-casa' }))
    await pane('46 arquivos filtro vazio')
    await noPane(ui => ui.input({ key: 'arvore:filtro', text: '' }))
    await apertar('aba:grill')
    await pane('47 grill durante a leva')

    // 6. O fechamento: o historico, o aviso do /cpv antes e depois dele
    usar(3)
    await marco({ marco: 'fechamento' })
    await relogio.advance(segundos(1))
    await apertar('aba:painel')
    await pane('50 leva fechada')
    await faixa('51 faixa leva fechada')
    await spinner('52 spinner leva fechada')
    await $.skill.prompt({ skill: 'macrex-skills:cpv', text: 'x' })
    await pane('53 leva fechada cpv rodou')
    await apertar('aba:uso')
    await pane('54 uso leva fechada')

    // 7. O /clear depois do /cpv: a aba, o uso e os agentes voltam; o Diff recomeca na base nova
    await clear()
    await pane('70 uso depois do clear')
    await apertar('aba:codigo')
    await pane('71 diff depois do clear')
    await apertar('aba:painel')
    await pane('72 geral depois do clear')

    // 8. O Limpar tira a leva e o grill: o painel volta ao repouso, e o marco da leva limpa segue sem recusa
    await apertar('painel:limpar')
    await pane('80 limpo')
    await marco({ marco: 'portao', ticket: '01', portao: 'verde' })

    confere('90 resultados', resultados.join('\n'))
    confere('91 toasts', toasts.join('\n'))
    confere('92 grill-tela', comandos.join('\n'))
    confere('93 sugestoes', sugestoes.join('\n'))

    // o golden: um quadro diferente reprova com os dois textos; antes, a jornada inteira e impressa
    const nomes = Object.keys(recebidos)
    const diferentes = nomes.filter(n => recebidos[n] !== GOLDEN[n])
    const sobram = Object.keys(GOLDEN).filter(n => !(n in recebidos))
    if (diferentes.length > 0 || sobram.length > 0) for (const nome of nomes) console.log(`@@GOLDEN@@${JSON.stringify({ nome, texto: recebidos[nome] })}`)
    for (const nome of diferentes) expect(recebidos[nome], `quadro ${nome}`).toBe(GOLDEN[nome])
    expect(sobram, 'quadros do golden que a jornada não desenhou').toEqual([])
  })
})
