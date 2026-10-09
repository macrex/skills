// Testes do painel da leva (hooks/register.js), pela porta da sessao: o comando, a ferramenta
// da leva e o desenho do Pane. Rode com `claude plugin test .` na raiz do repositorio.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = { plugin: 'macrex-skills', component: 'Pane', requestId: 'painel-macrex', props: {}, surface: 'terminal' } as const
const SURFACES = ['terminal', 'desktop'] as const
const MARCO = 'mcp__macrex-skills__faz_marco'

// O mundo sob o mod: o workspace `cwd` (a raiz do projeto), o store em memoria (com o que ja
// estiver gravado), o relogio parado e a tela que aceita toast; e os atalhos do teste: o marco da
// leva, uma sessao nova, o /clear e o cd do shell, que move o cwd da sessao e nao a raiz.
function mundo($: Engine, on: On, store: Record<string, unknown> = {}, cwd = 'D:/ws/a') {
  const toasts: string[] = []
  let shell = cwd
  mock.store(on, store)
  const relogio = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.cwd', () => ({ value: shell }))
  on('session.root', () => ({ value: cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  // o $.session.usage() da sessao: sem custo nem janela ate o teste dar um
  let uso: Record<string, unknown> = { startedAt: 0, context: { window: 200000 }, rateLimits: [] }
  on('session.usage', () => ({ value: uso }) as never)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  return {
    toasts,
    relogio,
    usar: (u: Record<string, unknown>) => { uso = { ...uso, ...u } },
    marco: (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never),
    sessao: () => $.session.start({ cwd, surface: 'terminal', isInteractive: true }),
    clear: () => $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } } as never),
    cd: (pasta: string) => { shell = pasta },
  }
}

const segundos = (n: number) => n * 1000

// O $.state do engine e da sessao, e o /clear abre outra com ele vazio, sem session.start. O kit
// guarda um $.state so; este responde por sessao, e a funcao devolvida faz o que o /clear faz.
function estadoPorSessao(on: On) {
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
  return () => { sessao++ }
}

// O $.state de cada janela do Claude Code: `janela()` diz qual responde agora; o store segue um so.
function estadoPorJanela(on: On, janela: () => string) {
  const valores = new Map<string, { value: unknown; version: number }>()
  on('state.get', ($, e) => ({ value: valores.get(`${janela()}:${e.key}`) ?? { value: undefined, version: 0 } }) as never)
  on('state.set', ($, e) => {
    const chave = `${janela()}:${e.key}`
    const versao = valores.get(chave)?.version ?? 0
    if (e.ifVersion != null && e.ifVersion !== versao) return { value: { isSet: false, version: versao } } as never
    valores.set(chave, { value: e.value, version: versao + 1 })
    return { value: { isSet: true, version: versao + 1 } } as never
  })
}

// O pane montado como texto, para ler o desenho sem o terminal: Text inteiro numa linha, Button
// como [ rotulo ], Code linha a linha; a Box em coluna empilha, a em fila (o padrao) poe lado a
// lado. Um toMatch sobre ele mostra a aba inteira quando falha.
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

const TICKETS = [{ id: '01', titulo: 'Mod do painel' }, { id: '02', titulo: 'Ferramenta faz_marco' }]

describe('painel da leva', () => {
  test('/painel-macrex abre o pane e, aberto, fecha', async ($, on) => {
    const abertos = new Set<string>()
    on('ui.open', ($, e) => { abertos.add(e.id); return { value: { isPlaced: true } } })
    on('ui.close', ($, e) => { abertos.delete(e.id); return { value: undefined } })
    on('ui.panes', () => ({
      value: [...abertos].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
    }))

    await $.command.run({ command: 'painel-macrex' })
    expect([...abertos]).toEqual(['painel-macrex'])
    await $.command.run({ command: 'painel-macrex' })
    expect([...abertos]).toEqual([])
  })

  test('o repouso cabe no pane: frase e boneco no grande, so o boneco no estreito, o boneco menor no baixo', async ($, on) => {
    mundo($, on)
    // o tamanho que vale e o do corpo do pane, nao o da tela inteira
    const ui = await $.ui.mount({ ...PANE, viewport: { columns: 200, rows: 60 }, props: { bodyColumns: 60, scroll: { bodyRows: 30 } } } as never)
    const FRASE = /^T U D O {3}Q U I E T O {3}P O R {3}A Q U I$/

    expect((await ui.find({ type: 'Text', text: FRASE }))?.props.bold).toBe(true)
    expect(await ui.find({ text: /▝▜█████▛▘/ })).toBeDefined()
    expect((await ui.find({ type: 'Box' }))?.props.minHeight).toBe(30)
    // sem leva nem grill, so o Claude dormindo; o rotulo da aba Grill e Button, nao Text
    expect(await ui.find({ type: 'Text', text: /leva|grill/i })).toBeUndefined()
    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await desktop.find({ text: /▐▛███▜▌/ })).toBeDefined()
    await desktop.unmount()

    await ui.redraw({ bodyColumns: 30, scroll: { bodyRows: 30 } } as never)
    expect(await ui.find({ text: /T U D O|Tudo quieto/ })).toBeUndefined()
    expect(await ui.find({ text: /▝▜█████▛▘/ })).toBeDefined()

    await ui.redraw({ bodyColumns: 60, scroll: { bodyRows: 6 } } as never)
    expect(await ui.find({ text: /T U D O|Tudo quieto/ })).toBeUndefined()
    // o menor tira as pernas e guarda o corpo, que fecha os olhos por baixo
    expect(await ui.find({ text: /▘▘ ▝▝/ })).toBeUndefined()
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
    expect(await ui.find({ text: /▝▜█████▛▘/ })).toBeDefined()
  })

  test('o Claude dormindo ronca sozinho: so os z mudam com o tempo, o boneco fica parado', async ($, on) => {
    const { relogio, sessao } = mundo($, on)
    await sessao()
    const ui = await $.ui.mount(PANE)
    const vistos = new Set<string>()
    for (let i = 0; i < 4; i++) {
      expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
      vistos.add(await quadro(ui))
      await relogio.advance(700)
    }
    expect(vistos.size).toBe(4)
    const boneco = (q: string) => q.split('\n').slice(-3).join('\n')
    expect(new Set([...vistos].map(boneco)).size).toBe(1)
    expect([...vistos].some(q => /Z/.test(q))).toBe(true)
  })

  test('na aba Painel o grill e a primeira fase, com o estado e o tempo, sem as perguntas; na leva que nasce dele, fica com ✓', async ($, on) => {
    const { marco, relogio } = mundo($, on)
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({
      result: { questions: e.questions, answers: { 'Onde guardar o estado?': '$.store' } },
    }) as never)
    const perguntar = (...temas: string[]) =>
      $.tool.call({
        tool: 'AskUserQuestion',
        questions: temas.map(t => ({ header: t, question: t === 'Estado' ? 'Onde guardar o estado?' : `${t}?`, multiSelect: false, options: [] })),
      } as never)

    // fora de um grill, o AskUserQuestion nao vai ao pane
    await perguntar('Solto')
    expect((await marco({ marco: 'grill', pedido: 'painel acompanha o grill' })).deny).toBeUndefined()
    await perguntar('Estado', 'Botão')
    await relogio.advance(segundos(80))

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ text: /Grill · painel acompanha o grill/ })).toBeDefined()
      expect(await quadro(ui)).toMatch(/\[ grill \] {2}1m20s ◐/)
      expect((await ui.find({ type: 'Text', text: /^to-spec / }))?.text).toMatch(/—$/)
      expect(await ui.find({ text: /Estado|Botão|Solto/ })).toBeUndefined()
      await ui.unmount()
    }

    // concluido o grill, a fase fica com ✓ e o tempo que levou; o entendimento esta na aba Grill
    await marco({ marco: 'entendimento', documento: 'doc do grill' })
    await relogio.advance(segundos(30))
    const ui = await $.ui.mount(PANE)
    expect(await quadro(ui)).toMatch(/\[ grill \] {2}1m20s ✓/)
    expect(await ui.find({ text: /doc do grill$/ })).toBeUndefined()

    // o grill da grade leva a aba Grill, com as perguntas dele e o entendimento; a solta fica fora
    await ui.press({ key: 'fase:grill' })
    expect(await ui.find({ type: 'Text', text: /^painel acompanha o grill$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Onde guardar o estado\?$/ })).toBeDefined()
    expect(await ui.find({ text: /Solto/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^doc do grill$/ })).toBeDefined()
    await ui.press({ key: 'aba:painel' })

    // a leva que nasce desse grill (o mesmo documento) mantem a fase dele; outra leva, nao
    await marco({ marco: 'inicio', documento: 'doc do grill' })
    expect(await quadro(ui)).toMatch(/\[ grill \] {2}1m20s ✓/)
    await marco({ marco: 'inicio', documento: 'outro doc' })
    expect(await quadro(ui)).toMatch(/\[ grill \] {2}—/)
  })

  test('o grilling invocado pelo /faz abre o grill no painel mesmo sem o marco grill', async ($, on) => {
    const { marco } = mundo($, on)
    on('skill.prompt', ($, e) => ({ text: e.text }))
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    const grilling = (args: string) => $.tool.call({ tool: 'Skill', skill: 'mattpocock-skills:grilling', args } as never)
    const ui = await $.ui.mount(PANE)

    // o grilling solto, fora do /faz, nao vai ao pane
    await grilling('um grill qualquer')
    expect(await ui.find({ text: /Grill ·/ })).toBeUndefined()

    await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'x' })
    await grilling('o datalake nao deve consultar sempre a delegacao de perfil, so se nao for usuario de servico')
    expect(await ui.find({ text: /Grill · o datalake nao deve consultar sempre a delegacao de perfil,…/ })).toBeDefined()

    // o marco grill que chega na mesma leva de chamadas so troca o pedido
    await marco({ marco: 'grill', pedido: 'delegacao so para SPE e SPF' })
    expect(await ui.find({ text: /Grill · delegacao so para SPE e SPF/ })).toBeDefined()
  })

  test('a aba Grill guarda cada pergunta com a resposta e a linha da leva num bloco de codigo, que o Executar leva exata a caixa de envio, mesmo depois do inicio', async ($, on) => {
    const { marco, sessao, toasts } = mundo($, on)
    const colados: string[] = []
    let caixa = true
    on('prompt.fill', ($, e) => { if (!caixa) return { isFilled: false }; colados.push(e.text); return { isFilled: true } })
    const comandos: string[] = []
    on('command.run', ($, e) => { comandos.push(e.command); return { text: '' } })
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({
      result: { questions: e.questions, answers: { 'Onde guardar o estado?': '$.store' } },
    }) as never)
    const pergunta = (header: string, question: string) => ({ header, question, multiSelect: false, options: [] })
    const ui = await $.ui.mount(PANE)

    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ type: 'Text', text: /^Nenhum grill neste workspace$/ })).toBeDefined()

    await marco({ marco: 'grill', pedido: 'abas no painel' })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [pergunta('Estado', 'Onde guardar o estado?'), pergunta('Botão', 'Botão ou atalho?')] } as never)
    await marco({ marco: 'entendimento', documento: 'doc das abas' })
    expect((await marco({ marco: 'linha', linha: '/faz leva doc das abas até o fim\r\n— sem commitar nada.' })).deny).toBeUndefined()

    expect(await ui.find({ type: 'Text', text: /^abas no painel$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Onde guardar o estado\?$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓ \$\.store$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Botão ou atalho\?$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^· sem resposta$/ })).toBeDefined()
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('/faz leva doc das abas até o fim\n— sem commitar nada.')
    expect(await quadro(ui)).toMatch(/^Prompt {2}\[ Clear \] {2}\[ Executar \]$/m)
    await ui.press({ key: 'grill:clear' })
    expect(comandos).toEqual(['clear'])
    await ui.press({ key: 'grill:colar' })
    expect(colados).toEqual(['/faz leva doc das abas até o fim\n— sem commitar nada.'])
    expect(toasts).not.toContain('Não deu para colar o prompt')
    caixa = false
    await ui.press({ key: 'grill:colar' })
    expect(toasts).toContain('Não deu para colar o prompt')

    // numa sessao nova sem /clear, a aba Painel ainda mostra o grill
    await sessao()
    await ui.press({ key: 'aba:painel' })
    expect(await ui.find({ text: /abas no painel/ })).toBeDefined()

    // o inicio da leva tira o grill da aba Painel; a aba Grill o guarda, inclusive numa sessao nova
    await marco({ marco: 'inicio', documento: 'doc das abas' })
    await sessao()
    expect(await ui.find({ text: /abas no painel/ })).toBeUndefined()
    expect(await ui.find({ text: /Leva · doc das abas/ })).toBeDefined()
    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ type: 'Text', text: /^Onde guardar o estado\?$/ })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()

    expect((await marco({ marco: 'linha' })).deny).toMatch(/linha/)
  })

  test('a rodada interrompida, recusada ou sem nenhuma resposta sai da aba Grill e do store; a reenviada aparece uma vez, respondida', async ($, on) => {
    // o caso da sessao de 2026-10-09: a rodada interrompida, a mesma recusada com "quero esclarecer",
    // uma que voltou vazia e por fim a respondida
    const { marco, sessao } = mundo($, on)
    const voltas: Record<string, unknown>[] = [
      { isError: true, result: 'The user interrupted the tool use' },
      { deny: 'quero esclarecer' },
      { result: { answers: {} } },
      { result: { answers: { 'Onde guardar o estado?': '$.store', 'Botão ou atalho?': 'Botão' } } },
    ]
    on('tool.call', { tool: 'AskUserQuestion' }, () => voltas.shift() as never)
    const pergunta = (header: string, question: string) => ({ header, question, multiSelect: false, options: [] })
    const rodada = () => $.tool.call({ tool: 'AskUserQuestion', questions: [pergunta('Estado', 'Onde guardar o estado?'), pergunta('Botão', 'Botão ou atalho?')] } as never)
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:grill' })
    await marco({ marco: 'grill', pedido: 'abas no painel' })

    for (let i = 0; i < 3; i++) {
      await rodada()
      expect(await ui.find({ type: 'Text', text: /^Perguntas e respostas · 0\/0$/ })).toBeDefined()
      // a sessao nova le o grill do store: a rodada tambem saiu de la
      await sessao()
      expect(await ui.find({ type: 'Text', text: /^Perguntas e respostas · 0\/0$/ })).toBeDefined()
    }
    await rodada()
    expect(await ui.find({ type: 'Text', text: /^Perguntas e respostas · 2\/2$/ })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: /^Onde guardar o estado\?$/ })).toHaveLength(1)
    expect(await ui.find({ type: 'Text', text: /sem resposta/ })).toBeUndefined()
    await sessao()
    expect(await quadro(ui)).toMatch(/Perguntas e respostas · 2\/2\nEstado\nOnde guardar o estado\?\n✓ \$\.store\nBotão\nBotão ou atalho\?\n✓ Botão/)
  })

  test('a sessao nova le do store o grill do workspace', async ($, on) => {
    const { sessao } = mundo($, on, { 'grill:D:/ws/a': { pedido: 'grill do store', inicio: 0, perguntas: [] } })
    await sessao()
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ text: /Grill · grill do store/ })).toBeDefined()
  })

  test('a sessao nova aberta numa subpasta carrega o grill, a leva e o historico gravados pela raiz', async ($, on) => {
    const fechada = { documento: 'antiga', fase: 'fechamento', fases: ['spec'], tickets: [], fechada: true, inicio: 0, fim: segundos(30), modelos: [] }
    const { cd } = mundo($, on, {
      'grill:D:/ws/a': { pedido: 'grill da raiz', inicio: 0, fim: 1000, documento: 'antiga', perguntas: [], fora: true },
      'leva:D:/ws/a': fechada,
      'levas:D:/ws/a': [fechada],
    })
    cd('D:/ws/a/src')
    await $.session.start({ cwd: 'D:/ws/a/src', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^antiga · / }))?.text).toMatch(/total 30s/)
    expect(await ui.find({ type: 'Text', text: /^Hist/ })).toBeDefined()
    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ text: /grill da raiz/ })).toBeDefined()
  })

  test('o grill fechado pelo prompt do localizador para de redesenhar o painel a cada segundo', async ($, on) => {
    const { marco, relogio, sessao } = mundo($, on)
    let redesenhos = 0
    on('ui.invalidate', ($, e) => { if (e.event === 'ui.render') redesenhos++; return { value: undefined } })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'rode /macrex-skills:faz leva doc até o fim.\n', stderr: '' } }) as never)
    await sessao()
    await marco({ marco: 'grill', pedido: 'grill' })
    await relogio.advance(segundos(3))
    expect(redesenhos).toBeGreaterThan(0)

    await $.tool.call({ tool: 'Bash', command: 'node "D:/ws/skills/faz/scripts/skills-do-matt.js" --linha "doc" "da sessão" "da sessão"' } as never)
    redesenhos = 0
    await relogio.advance(segundos(3))
    expect(redesenhos).toBe(0)
  })

  test('o /clear nao limpa o painel; so o Limpar da aba Painel, ao lado do titulo, tira o grill de todas as abas', async ($, on) => {
    const { marco, clear, sessao } = mundo($, on)
    const ui = await $.ui.mount(PANE)
    await marco({ marco: 'grill', pedido: 'grill guardado' })
    await clear()
    await sessao()
    expect(await quadro(ui)).toMatch(/\nGrill · grill guardado {2}\[ Limpar \]/)
    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ type: 'Text', text: /^grill guardado$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /Limpar/ })).toBeUndefined()

    await ui.press({ key: 'aba:painel' })
    await ui.press({ key: 'painel:limpar' })
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ type: 'Text', text: /^Nenhum grill neste workspace$/ })).toBeDefined()
    // limpo tambem no store: a sessao nova nao o traz de volta
    await sessao()
    expect(await ui.find({ type: 'Text', text: /^Nenhum grill neste workspace$/ })).toBeDefined()
  })

  test('a aba Grill acompanha a grill-tela: a rodada publicada entra aguardando e a resposta chega pelo estado da pagina', async ($, on) => {
    const { marco, sessao, relogio } = mundo($, on)
    const URL = 'http://127.0.0.1:4321/g/a/20261009-142524?t=abc123'
    const RODADA = {
      rodada: 1,
      questoes: [
        { id: 'Q1', cabecalho: 'Transporte', titulo: 'Como o agente e a tela conversam?', opcoes: [] },
        { id: 'Q2', cabecalho: 'Momento', titulo: 'Quando a tela abre?', opcoes: [] },
      ],
    }
    let estado: Record<string, unknown> = { fase: 'rodada', rodada: RODADA, historico: [] }
    const consultas: string[] = []
    on('http.fetch', ($, e) => {
      consultas.push(e.url)
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } }
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'Rodada 1 na tela, 2 questões.', stderr: '' } }) as never)
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({ result: { questions: e.questions, answers: { 'Algo mais?': 'Não' } } }) as never)
    await sessao()
    await marco({ marco: 'grill', pedido: 'grill na tela' })
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:grill' })

    // o comando que publica a rodada leva a URL da pagina: a rodada entra, aguardando
    await $.tool.call({ tool: 'Bash', command: `node "C:/s/grill-tela/scripts/grill-tela.js" rodada ${URL} r1.json` } as never)
    expect(consultas.at(-1)).toBe('http://127.0.0.1:4321/g/a/20261009-142524/api/estado?t=abc123')
    expect(await quadro(ui)).toMatch(/Transporte\nComo o agente e a tela conversam\?\n▸ aguardando\n/)

    // respondida na pagina: o relogio do painel le o estado de novo, sem esperar o agente
    estado = {
      fase: 'aguarde',
      rodada: RODADA,
      historico: [{
        rodada: RODADA,
        respostas: [
          { id: 'Q1', marca: 'aceito', escolha: 'Servidor local', comentario: null },
          { id: 'Q2', marca: 'outra', escolha: 'Só no fim', comentario: 'e no meio também' },
        ],
      }],
    }
    await relogio.advance(segundos(1))
    expect(await ui.find({ type: 'Text', text: /^✓ Servidor local$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓ Só no fim \(e no meio também\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Perguntas e respostas · 2\/2$/ })).toBeDefined()

    // o botao Voltar ao CLI da pagina encerra a consulta; o grill segue pelo AskUserQuestion, no fim da lista
    estado = { ...estado, fase: 'cli' }
    await relogio.advance(segundos(1))
    const feitas = consultas.length
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Resto', question: 'Algo mais?', multiSelect: false, options: [] }] } as never)
    await relogio.advance(segundos(3))
    expect(consultas.length).toBe(feitas)
    expect(await quadro(ui)).toMatch(/Quando a tela abre\?\n✓ Só no fim \(e no meio também\)\nResto\nAlgo mais\?\n✓ Não/)
  })

  test('a resposta da grill-tela sem escolha (delegado, esclarecer, adiado) aparece pela marca', async ($, on) => {
    const { marco, sessao } = mundo($, on)
    const URL = 'http://127.0.0.1:4321/g/a/20261009-142524?t=abc123'
    const RODADA = { rodada: 1, questoes: ['Q1', 'Q2', 'Q3'].map(id => ({ id, cabecalho: `Tema ${id}`, titulo: `Pergunta ${id}?`, opcoes: [] })) }
    const estado = {
      fase: 'aguarde',
      rodada: RODADA,
      historico: [{
        rodada: RODADA,
        respostas: [
          { id: 'Q1', marca: 'delegado', escolha: null, comentario: null },
          { id: 'Q2', marca: 'esclarecer', escolha: null, comentario: 'o que e isso?' },
          { id: 'Q3', marca: 'adiado', escolha: null, comentario: null },
        ],
      }],
    }
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } }))
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'Rodada 1 na tela, 3 questões.', stderr: '' } }) as never)
    await sessao()
    await marco({ marco: 'grill', pedido: 'grill na tela' })
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:grill' })
    await $.tool.call({ tool: 'Bash', command: `node "C:/s/grill-tela/scripts/grill-tela.js" rodada ${URL} r1.json` } as never)
    expect(await ui.find({ type: 'Text', text: /^✓ delegado$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓ esclarecer \(o que e isso\?\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓ adiado$/ })).toBeDefined()
  })

  test('no canal tela, o AskUserQuestion do grill vai a pagina da grill-tela e volta com a resposta dela; o Voltar ao CLI devolve o dialogo nativo', { options: { grill_canal: 'tela' } }, async ($, on) => {
    const { marco, toasts } = mundo($, on)
    const URL = 'http://127.0.0.1:4321/g/a/20261009-142524?t=abc123'
    const comandos: { args: string[]; stdin?: string }[] = []
    // as voltas do aguardar, em ordem: o prazo que venceu, a mensagem a parte e a resposta da rodada 1; na rodada 2, o Voltar ao CLI
    const voltas = [
      '{"tipo":"pendente"}',
      '{"tipo":"texto","texto":"e o prazo?"}',
      'Rodada 1 respondida na tela:\n\n| Questão | Marca | Escolha | Comentário |\n\n{"tipo":"rodada","rodada":1,"respostas":[' +
        '{"id":"Q1","marca":"aceito","escolha":"Artifact","comentario":"só no fim"},{"id":"Q2","marca":"delegado","escolha":null,"comentario":null}]}',
      '{"tipo":"cli"}',
    ]
    let estado: Record<string, any> = { fase: 'inicio', historico: [] }
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } }))
    on('process.run', ($, e) => {
      const [node, script, sub, ...args] = e.argv
      expect(node).toBe('node')
      expect(script).toMatch(/skills[\\/]grill-tela[\\/]scripts[\\/]grill-tela\.js$/)
      comandos.push({ args: [sub, ...args], stdin: e.init?.stdin })
      let stdout = 'ok\n'
      if (sub === 'iniciar') stdout = `${URL}\n`
      if (sub === 'rodada') estado = { ...estado, fase: 'rodada', rodada: JSON.parse(e.init?.stdin ?? '') }
      if (sub === 'aguardar') {
        stdout = `${voltas.shift()}\n`
        const msg = JSON.parse(stdout.trim().split('\n').pop()!)
        if (msg.tipo === 'rodada') estado = { fase: 'aguarde', rodada: estado.rodada, historico: [...estado.historico, { rodada: estado.rodada, respostas: msg.respostas }] }
        if (msg.tipo === 'cli') estado = { ...estado, fase: 'cli' }
      }
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    const nativas: string[] = []
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      nativas.push(...e.questions.map(q => q.question))
      return { result: { questions: e.questions, answers: { 'Algo mais?': 'Não' } } } as never
    })
    const perguntar = (questions: unknown[]) => $.tool.call({ tool: 'AskUserQuestion', questions } as never)
    await marco({ marco: 'grill', pedido: 'grill pelo canal tela' })

    // a primeira rodada sobe a pagina com o nome da raiz, publica a rodada e espera ate a resposta
    const r1 = await perguntar([
      { header: 'Transporte', question: 'Como o agente e a tela conversam?', multiSelect: false,
        options: [{ label: 'Servidor local', description: 'Node, só stdlib' }, { label: 'Artifact (Recommended)', description: 'Página no claude.ai', preview: '+---+\n| A |\n+---+' }] },
      { header: 'Momento', question: 'Quando a tela abre?', multiSelect: false, options: [{ label: 'No início', description: 'logo' }, { label: 'No fim' }] },
    ])
    expect(nativas).toEqual([])
    expect(comandos.map(c => c.args)).toEqual([
      ['iniciar', '--projeto', 'a', '--pedido', 'grill pelo canal tela'],
      ['rodada', URL, '-'],
      ['aguardar', URL, '--ate', '120'],
      ['aguardar', URL, '--ate', '120'],
      ['aguardar', URL, '--ate', '120'],
    ])
    // a recomendada e a do (Recommended), sem a marca no rotulo; sem nenhuma marcada, a primeira
    expect(JSON.parse(comandos[1].stdin ?? '')).toEqual({
      rodada: 1,
      questoes: [
        { id: 'Q1', cabecalho: 'Transporte', titulo: 'Como o agente e a tela conversam?', opcoes: [
          { rotulo: 'Servidor local', descricao: 'Node, só stdlib', recomendada: false },
          { rotulo: 'Artifact', descricao: 'Página no claude.ai', recomendada: true, previa: '+---+\n| A |\n+---+' },
        ] },
        { id: 'Q2', cabecalho: 'Momento', titulo: 'Quando a tela abre?', opcoes: [
          { rotulo: 'No início', descricao: 'logo', recomendada: true },
          { rotulo: 'No fim', recomendada: false },
        ] },
      ],
    })
    // o resultado e o do dialogo, as respostas pelo texto da pergunta, e a URL vai ao modelo para a tela final
    expect(r1.result).toEqual({
      questions: expect.any(Array),
      answers: { 'Como o agente e a tela conversam?': 'Artifact (só no fim)', 'Quando a tela abre?': 'Decida você' },
    })
    expect(r1.context?.join('\n')).toContain(URL)
    expect(r1.context?.join('\n')).toContain('e o prazo?')
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:grill' })
    expect(await quadro(ui)).toMatch(/Transporte\nComo o agente e a tela conversam\?\n✓ Artifact \(só no fim\)\nMomento\nQuando a tela abre\?\n✓ delegado/)

    // a segunda vai a mesma pagina; o Voltar ao CLI avisa a pagina e o dialogo nativo pergunta, sem a rodada aberta duplicada
    comandos.length = 0
    const r2 = await perguntar([{ header: 'Resto', question: 'Algo mais?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }])
    expect(comandos.map(c => c.args)).toEqual([['rodada', URL, '-'], ['aguardar', URL, '--ate', '120'], ['cli', URL]])
    expect(JSON.parse(comandos[0].stdin ?? '').rodada).toBe(2)
    expect(nativas).toEqual(['Algo mais?'])
    expect(r2.result?.answers).toEqual({ 'Algo mais?': 'Não' })
    // a volta ao terminal avisa o usuario e o modelo do motivo
    expect(toasts).toContain('Grill de volta ao terminal: o usuário voltou ao terminal pela página')
    expect(r2.context?.join('\n')).toMatch(/o usuário voltou ao terminal pela página/)
    expect(await quadro(ui)).toMatch(/Perguntas e respostas · 3\/3\n[\s\S]*Resto\nAlgo mais\?\n✓ Não/)

    // de volta ao CLI, o grill fica nele ate o fim: a pagina nao sobe de novo
    comandos.length = 0
    await perguntar([{ header: 'Fim', question: 'Fechamos?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }])
    expect(comandos).toEqual([])
    expect(nativas).toEqual(['Algo mais?', 'Fechamos?'])
  })

  test('no canal tela, a pagina que nao sobe deixa o grill no dialogo nativo; fora do grill, nada vai a pagina', { options: { grill_canal: 'tela' } }, async ($, on) => {
    const { marco } = mundo($, on)
    const comandos: string[] = []
    on('process.run', ($, e) => {
      comandos.push(e.argv[2])
      return { value: { exitCode: 1, stdout: '', stderr: 'o servidor não subiu em 5 segundos', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({ result: { questions: e.questions, answers: { 'Algo mais?': 'Não' } } }) as never)
    const perguntar = () =>
      $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Resto', question: 'Algo mais?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }] } as never)

    await perguntar()
    expect(comandos).toEqual([])
    await marco({ marco: 'grill', pedido: 'pagina fora do ar' })
    expect((await perguntar()).result?.answers).toEqual({ 'Algo mais?': 'Não' })
    await perguntar()
    expect(comandos).toEqual(['iniciar'])
  })

  test('no canal tela, o Limpar apertado durante a espera da pagina leva a rodada ao dialogo com o motivo', { options: { grill_canal: 'tela' } }, async ($, on) => {
    const { marco, toasts } = mundo($, on)
    const URL = 'http://127.0.0.1:4321/g/a/20261009-142524?t=abc123'
    let ui: Awaited<ReturnType<Engine['ui']['mount']>>
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '{"fase":"rodada","historico":[]}' } }))
    on('process.run', async ($, e) => {
      const sub = e.argv[2]
      // o usuario aperta o Limpar com a rodada na pagina, e a pagina volta ao CLI
      if (sub === 'aguardar') await ui.press({ key: 'painel:limpar' })
      const stdout = sub === 'iniciar' ? `${URL}\n` : sub === 'aguardar' ? '{"tipo":"cli"}\n' : 'ok\n'
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({ result: { questions: e.questions, answers: { 'Algo mais?': 'Não' } } }) as never)
    await marco({ marco: 'grill', pedido: 'grill limpo na espera' })
    ui = await $.ui.mount(PANE)

    const r = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Resto', question: 'Algo mais?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }] } as never)
    expect(r.result?.answers).toEqual({ 'Algo mais?': 'Não' })
    expect(toasts.at(-1)).toBe('Grill de volta ao terminal: o usuário voltou ao terminal pela página')
    expect(r.context?.join('\n')).toMatch(/A rodada não ficou na grill-tela \(o usuário voltou ao terminal pela página\)/)
  })

  test('no canal tela, a rodada avisa a URL antes de esperar; a pagina guardada que morreu e retomada ou refeita, e sem pagina a rodada volta ao terminal com o motivo', { options: { grill_canal: 'tela' } }, async ($, on) => {
    // o caso da sessao de 2026-10-09: a rodada publicada numa pagina que o usuario nunca viu, sem a URL no terminal
    const { marco, toasts } = mundo($, on)
    const URL = (n: number) => `http://127.0.0.1:400${n}/g/a/2026100${n}-000000?t=abc${n}`
    const vivas = new Set<string>()
    const subidas: Record<string, string[]> = { novo: [URL(1)], retomar: [] }
    const comandos: string[][] = []
    let toastsAoEsperar: string[] = []
    let estado: Record<string, any> = { fase: 'inicio', historico: [] }
    on('http.fetch', ($, e) => {
      const viva = [...vivas].some(u => e.url === u.replace('?t=', '/api/estado?t='))
      return { value: viva ? { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } : { status: 502, ok: false, headers: {}, text: '' } }
    })
    on('process.run', ($, e) => {
      const [, , sub, ...args] = e.argv
      comandos.push([sub, ...args])
      let stdout = ''
      let ok = true
      if (sub === 'iniciar') {
        const url = subidas[args.includes('--retomar') ? 'retomar' : 'novo'].shift()
        if (url) vivas.add(url)
        stdout = url ? `${url}\n` : ''
        ok = Boolean(url)
      }
      if (sub === 'rodada') {
        ok = vivas.has(args[0])
        if (ok) estado = { ...estado, fase: 'rodada', rodada: JSON.parse(e.init?.stdin ?? '') }
      }
      if (sub === 'aguardar') {
        toastsAoEsperar = [...toasts]
        const respostas = [{ id: 'Q1', marca: 'aceito', escolha: 'Sim', comentario: null }]
        const rodada = estado.rodada
        estado = { fase: 'aguarde', historico: [...estado.historico, { rodada, respostas }] }
        stdout = `${JSON.stringify({ tipo: 'rodada', rodada: rodada.rodada, respostas })}\n`
      }
      return { value: { exitCode: ok ? 0 : 1, stdout, stderr: ok ? '' : 'falhou', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    const nativas: string[] = []
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      nativas.push(...e.questions.map(q => q.question))
      return { result: { questions: e.questions, answers: { [e.questions[0].question]: 'Não' } } } as never
    })
    const perguntar = (question: string) =>
      $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Tema', question, multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }] } as never)
    await marco({ marco: 'grill', pedido: 'grill sem silencio' })

    // a primeira sobe a pagina, e o toast com a URL sai antes do primeiro aguardar
    const r1 = await perguntar('Primeira?')
    expect(toastsAoEsperar).toContain(`Grill na tela: ${URL(1)}`)
    expect(r1.context?.join('\n')).toContain(URL(1))

    // a pagina guardada morreu: o --retomar a traz de volta antes da rodada, que vai a URL nova
    vivas.clear()
    subidas.retomar.push(URL(2))
    comandos.length = 0
    const r2 = await perguntar('Segunda?')
    expect(comandos.map(c => c.slice(0, 4))).toEqual([['iniciar', '--projeto', 'a', '--retomar'], ['rodada', URL(2), '-'], ['aguardar', URL(2), '--ate', '120']])
    expect(r2.context?.join('\n')).toContain(URL(2))
    expect(toastsAoEsperar).toContain(`Grill na tela: ${URL(2)}`)

    // sem retomada, uma pagina nova
    vivas.clear()
    subidas.novo.push(URL(3))
    comandos.length = 0
    await perguntar('Terceira?')
    expect(comandos.map(c => c.slice(0, 4))).toEqual([['iniciar', '--projeto', 'a', '--retomar'], ['iniciar', '--projeto', 'a', '--pedido'], ['rodada', URL(3), '-'], ['aguardar', URL(3), '--ate', '120']])
    expect(nativas).toEqual([])

    // nenhuma sobe: nada e publicado, o dialogo pergunta e o toast e o contexto dizem por que
    vivas.clear()
    comandos.length = 0
    const r4 = await perguntar('Quarta?')
    expect(comandos.map(c => c[0])).toEqual(['iniciar', 'iniciar'])
    expect(nativas).toEqual(['Quarta?'])
    expect(toasts.at(-1)).toBe('Grill de volta ao terminal: a página da grill-tela não subiu')
    expect(r4.context?.join('\n')).toMatch(/A rodada não ficou na grill-tela \(a página da grill-tela não subiu\)/)
  })

  test('no canal tela, o grilling da /faz cria o grill na grill-tela e entrega a URL ao agente antes da primeira pergunta', { options: { grill_canal: 'tela' } }, async ($, on) => {
    // o caso da sessao de 2026-10-09: o grill chegou a primeira espera sem a URL em lugar nenhum a vista
    const { marco } = mundo($, on)
    const URL = 'http://127.0.0.1:47110/g/a/20261009-142524?t=abc123'
    const comandos: string[][] = []
    let estado: Record<string, any> = { fase: 'inicio', historico: [] }
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } }))
    on('process.run', ($, e) => {
      const [, , sub, ...args] = e.argv
      comandos.push([sub, ...args])
      let stdout = 'ok\n'
      if (sub === 'iniciar') stdout = `${URL}\n`
      if (sub === 'rodada') estado = { fase: 'rodada', rodada: JSON.parse(e.init?.stdin ?? ''), historico: [] }
      if (sub === 'aguardar') {
        const respostas = [{ id: 'Q1', marca: 'aceito', escolha: 'Sim', comentario: null }]
        estado = { fase: 'aguarde', historico: [{ rodada: estado.rodada, respostas }] }
        stdout = `${JSON.stringify({ tipo: 'rodada', rodada: 1, respostas })}\n`
      }
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    on('skill.prompt', ($, e) => ({ text: e.text }))

    await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'x' })
    const r = await $.tool.call({ tool: 'Skill', skill: 'mattpocock-skills:grilling', args: 'historico de grills na tela' } as never)
    // a URL chega ao agente no resultado da skill, com a instrucao de escreve-la antes da primeira pergunta
    expect(r.context?.join('\n')).toContain(URL)
    expect(r.context?.join('\n')).toMatch(/antes da primeira pergunta/)
    expect(comandos).toEqual([['iniciar', '--projeto', 'a', '--pedido', 'historico de grills na tela']])

    // o marco grill da mesma leva de chamadas so troca o pedido: a URL fica
    await marco({ marco: 'grill', pedido: 'historico na tela' })
    comandos.length = 0
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Tema', question: 'Primeira?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }] } as never)
    // a primeira rodada vai a pagina que ja estava a vista, sem subir outra
    expect(comandos.map(c => c.slice(0, 2))).toEqual([['rodada', URL], ['aguardar', URL]])
  })

  test('no canal tela, a segunda /faz antes de qualquer pergunta cria outro grill na grill-tela, sem herdar a URL da primeira', { options: { grill_canal: 'tela' } }, async ($, on) => {
    const { marco } = mundo($, on)
    const URL = (n: number) => `http://127.0.0.1:47110/g/a/2026100${n}-000000?t=abc123`
    const urls = [URL(1), URL(2)]
    const comandos: string[][] = []
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ fase: 'inicio', historico: [] }) } }))
    on('process.run', ($, e) => {
      const [, , sub, ...args] = e.argv
      comandos.push([sub, ...args])
      const stdout = sub === 'iniciar' ? `${urls.shift()}\n` : sub === 'aguardar' ? '{"tipo":"cli"}\n' : 'ok\n'
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({ result: { questions: e.questions, answers: { 'Primeira?': 'Sim' } } }) as never)
    on('skill.prompt', ($, e) => ({ text: e.text }))
    for (const pedido of ['primeira faz', 'segunda faz']) {
      await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'x' })
      await $.tool.call({ tool: 'Skill', skill: 'mattpocock-skills:grilling', args: pedido } as never)
      await marco({ marco: 'grill', pedido: `${pedido} resumida` })
    }
    expect(comandos.filter(c => c[0] === 'iniciar').map(c => c.at(-1))).toEqual(['primeira faz', 'segunda faz'])
    comandos.length = 0
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Tema', question: 'Primeira?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }] } as never)
    expect(comandos[0]).toEqual(['rodada', URL(2), '-'])
    const ui = await $.ui.mount(PANE)
    expect(await quadro(ui)).toMatch(/Grill · segunda faz resumida/)
  })

  test('o grill na tela ganha um cartao com a URL e o Abrir nas abas Painel e Grill, que fica depois do sim e do CLI; o Historico abre o historico', { options: { grill_canal: 'tela' } }, async ($, on) => {
    const { relogio, sessao, toasts } = mundo($, on)
    const URL = 'http://127.0.0.1:47110/g/a/20261009-142524?t=abc123'
    const comandos: string[][] = []
    let consultas = 0
    let estado: Record<string, any> = { fase: 'inicio', historico: [] }
    on('http.fetch', () => { consultas++; return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } } })
    on('process.run', ($, e) => {
      if (e.argv[0] === 'git') return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      const [, , sub, ...args] = e.argv
      comandos.push([sub, ...args])
      const stdout = sub === 'iniciar' || sub === 'abrir' ? `${URL}\n` : sub === 'historico' ? 'http://127.0.0.1:47110/?t=abc123\n' : sub === 'aguardar' ? '{"tipo":"cli"}\n' : 'ok\n'
      if (sub === 'rodada') estado = { fase: 'rodada', rodada: JSON.parse(e.init?.stdin ?? ''), historico: [] }
      if (sub === 'aguardar') estado = { ...estado, fase: 'cli' }
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({ result: { questions: e.questions, answers: { 'Primeira?': 'Sim' } } }) as never)
    on('skill.prompt', ($, e) => ({ text: e.text }))
    await sessao()
    const ui = await $.ui.mount(PANE)

    // sem grill, a aba Grill ja tem o Historico
    await ui.press({ key: 'aba:grill' })
    expect(await quadro(ui)).toMatch(/^Nenhum grill neste workspace {2}\[ Histórico \]/m)
    await ui.press({ key: 'grill:historico' })
    expect(comandos.at(-1)).toEqual(['historico'])
    expect(toasts.at(-1)).toBe('Histórico de grills: http://127.0.0.1:47110/?t=abc123')

    await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'x' })
    await $.tool.call({ tool: 'Skill', skill: 'mattpocock-skills:grilling', args: 'cartao da tela' } as never)
    await ui.press({ key: 'aba:painel' })
    expect(await quadro(ui)).toMatch(new RegExp(`Grill na tela {2}\\[ Abrir \\]\\n${URL.replace(/[.?]/g, '\\$&')}\\n`))
    await ui.press({ key: 'tela:abrir' })
    expect(comandos.at(-1)).toEqual(['abrir', URL])
    await ui.press({ key: 'aba:grill' })
    expect(await quadro(ui)).toMatch(/Grill na tela {2}\[ Abrir \]/)

    // o grill volta ao CLI pela pagina: o cartao fica, e a consulta da pagina para
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Tema', question: 'Primeira?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }] } as never)
    expect(await quadro(ui)).toMatch(/Grill na tela {2}\[ Abrir \]/)
    expect(await ui.find({ type: 'Code', text: URL })).toBeDefined()
    await relogio.advance(segundos(1))
    const feitas = consultas
    await relogio.advance(segundos(3))
    expect(consultas).toBe(feitas)
  })

  test('o cartao do grill na tela fica depois do sim, e a consulta da pagina para', async ($, on) => {
    const { marco, relogio, sessao } = mundo($, on)
    const URL = 'http://127.0.0.1:47110/g/a/20261009-142524?t=abc123'
    let consultas = 0
    let estado: Record<string, any> = { fase: 'final', historico: [] }
    on('http.fetch', () => { consultas++; return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } } })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'Tela final na tela, 1 decisão.', stderr: '' } }) as never)
    await sessao()
    await marco({ marco: 'grill', pedido: 'grill do sim' })
    await $.tool.call({ tool: 'Bash', command: `node "C:/s/grill-tela/scripts/grill-tela.js" final ${URL} f.json` } as never)
    estado = { fase: 'concluido', historico: [] }
    await relogio.advance(segundos(1))
    const feitas = consultas
    await relogio.advance(segundos(3))
    expect(consultas).toBe(feitas)
    const ui = await $.ui.mount(PANE)
    expect(await quadro(ui)).toMatch(/Grill na tela {2}\[ Abrir \]/)
    expect(await ui.find({ type: 'Code', text: URL })).toBeDefined()
  })

  test('fora do canal tela, o grilling da /faz nao sobe a grill-tela', async ($, on) => {
    mundo($, on)
    const comandos: string[] = []
    on('process.run', ($, e) => { comandos.push(e.argv[2]); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    on('skill.prompt', ($, e) => ({ text: e.text }))
    await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'x' })
    const r = await $.tool.call({ tool: 'Skill', skill: 'mattpocock-skills:grilling', args: 'pedido' } as never)
    expect(r.context).toBeUndefined()
    expect(comandos.filter(c => c === 'iniciar')).toEqual([])
  })

  test('no canal tela, so o grill desta sessao vai a pagina; o grilling de fora da /faz vai a grill-tela; o Seguir no terminal entre rodadas leva o grill ao CLI', { options: { grill_canal: 'tela' } }, async ($, on) => {
    // o grill abandonado de outra sessao, que o store traz de volta
    const { sessao, relogio } = mundo($, on, { 'grill:D:/ws/a': { pedido: 'grill velho', inicio: 0, perguntas: [] } })
    const URL = 'http://127.0.0.1:4321/g/a/20261009-142524?t=abc123'
    const comandos: string[] = []
    let estado: Record<string, any> = { fase: 'inicio', historico: [] }
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(estado) } }))
    on('process.run', ($, e) => {
      // o git da base da aba Diff, no inicio da sessao, fica fora
      if (e.argv[0] === 'git') return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      const sub = e.argv[2]
      comandos.push(sub)
      let stdout = 'ok\n'
      if (sub === 'iniciar') stdout = `${URL}\n`
      if (sub === 'rodada') estado = { fase: 'rodada', rodada: JSON.parse(e.init?.stdin ?? ''), historico: [] }
      if (sub === 'aguardar') {
        const respostas = [{ id: 'Q1', marca: 'aceito', escolha: 'Sim', comentario: null }]
        estado = { fase: 'aguarde', historico: [{ rodada: estado.rodada, respostas }] }
        stdout = `${JSON.stringify({ tipo: 'rodada', rodada: estado.historico[0].rodada.rodada, respostas })}\n`
      }
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    const nativas: string[] = []
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      nativas.push(...e.questions.map(q => q.question))
      return { result: { questions: e.questions, answers: {} } } as never
    })
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    on('skill.prompt', ($, e) => ({ text: e.text }))
    const grilling = (args = '') => $.tool.call({ tool: 'Skill', skill: 'mattpocock-skills:grilling', args } as never)
    const perguntar = () =>
      $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Resto', question: 'Algo mais?', multiSelect: false, options: [{ label: 'Sim', description: '' }, { label: 'Não', description: '' }] }] } as never)
    await sessao()

    // o grill velho nao sequestra a pergunta comum para a pagina
    await perguntar()
    expect(comandos).toEqual([])
    expect(nativas).toEqual(['Algo mais?'])

    // o grilling de fora da /faz nao abre grill no painel: o resultado manda conduzi-lo pela grill-tela
    expect((await grilling('um grill qualquer')).context?.join('\n')).toMatch(/invoque a skill grill-tela e conduza o grill inteiro por ela/)
    // o da /faz abre o grill desta sessao, que vai a pagina
    await $.skill.prompt({ skill: 'macrex-skills:faz', text: 'x' })
    expect((await grilling('pedido da faz')).context?.join('\n')).toContain(URL)
    await perguntar()
    expect(comandos).toEqual(['iniciar', 'rodada', 'aguardar'])
    expect(nativas).toEqual(['Algo mais?'])

    // o Seguir no terminal apertado entre rodadas: a consulta da pagina leva o grill ao CLI
    estado = { ...estado, fase: 'cli' }
    await relogio.advance(segundos(1))
    comandos.length = 0
    await perguntar()
    expect(comandos).toEqual([])
    expect(nativas).toEqual(['Algo mais?', 'Algo mais?'])
  })

  test('cada janela tem o seu grill: a nova mostra o mais recente, o /clear mantem o da janela, o Limpar tira so o dela', async ($, on) => {
    // duas janelas do Claude Code no mesmo workspace: o $.state e de cada uma, o store e um so
    let janela = 'A'
    estadoPorJanela(on, () => janela)
    const { marco, sessao, clear, relogio } = mundo($, on)
    on('classic.SessionStart', () => ({}) as never)
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({ result: { questions: e.questions, answers: { [e.questions[0].question]: 'Sim' } } }) as never)
    const titulo = async () => { await ui.redraw(); return /\nGrill · ([^\n]+?) {2}\[ Limpar \]/.exec(await quadro(ui))?.[1] }
    const ui = await $.ui.mount(PANE)

    await sessao()
    await marco({ marco: 'grill', pedido: 'grill da A' })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ header: 'Tema', question: 'Da A?', multiSelect: false, options: [] }] } as never)
    // a janela nova mostra o grill mais recente do workspace, e abre o seu
    janela = 'B'
    await sessao()
    expect(await titulo()).toBe('grill da A')
    await relogio.advance(segundos(5))
    await marco({ marco: 'grill', pedido: 'grill da B' })
    expect(await titulo()).toBe('grill da B')
    // a janela A segue com o seu, mesmo depois de uma escrita da B
    janela = 'A'
    expect(await titulo()).toBe('grill da A')
    await ui.press({ key: 'aba:grill' })
    await ui.redraw()
    expect(await quadro(ui)).toMatch(/Da A\?\n✓ Sim/)
    await ui.press({ key: 'aba:painel' })
    // o /clear na A traz o grill dela, nao o mais recente (o da B)
    await clear()
    janela = 'A2'
    await $.classic.SessionStart({ source: 'clear' } as never)
    expect(await titulo()).toBe('grill da A')
    // o Limpar na A tira so o grill dela: uma janela nova acha o da B
    await ui.press({ key: 'painel:limpar' })
    expect(await titulo()).toBeUndefined()
    janela = 'C'
    await sessao()
    expect(await titulo()).toBe('grill da B')
  })

  test('o grill gravado no formato antigo (um por workspace) aparece e passa a ser da janela', async ($, on) => {
    const { sessao } = mundo($, on, { 'grill:D:/ws/a': { pedido: 'grill antigo', inicio: 0, perguntas: [] } })
    await sessao()
    const ui = await $.ui.mount(PANE)
    expect(await quadro(ui)).toMatch(/\nGrill · grill antigo {2}\[ Limpar \]/)
    // o Limpar o apaga de vez: a chave antiga nao o traz de volta
    await ui.press({ key: 'painel:limpar' })
    await sessao()
    expect(await ui.find({ text: /grill antigo/ })).toBeUndefined()
  })

  test('o workspace guarda os 10 grills mais recentes: o 11º apaga o mais antigo', async ($, on) => {
    // oito grills de outras janelas, entre o da janela A (o mais antigo) e o da B
    let janela = 'A'
    estadoPorJanela(on, () => janela)
    const outros = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`grill:D:/ws/a:g${i}`, { id: `g${i}`, pedido: `grill ${i}`, inicio: segundos(i + 1), perguntas: [] }]))
    const { marco, sessao, clear, relogio } = mundo($, on, outros)
    on('classic.SessionStart', () => ({}) as never)
    const ui = await $.ui.mount(PANE)
    const titulo = async () => { await ui.redraw(); return /\nGrill · ([^\n]+?) {2}\[ Limpar \]/.exec(await quadro(ui))?.[1] }
    await sessao()
    await marco({ marco: 'grill', pedido: 'grill da A' })
    janela = 'B'
    await sessao()
    await relogio.advance(segundos(60))
    await marco({ marco: 'grill', pedido: 'o decimo' })
    // com dez, o da A segue no store: o /clear na A o traz
    janela = 'A'
    await clear()
    janela = 'A2'
    await $.classic.SessionStart({ source: 'clear' } as never)
    expect(await titulo()).toBe('grill da A')
    // o decimo primeiro apaga o mais antigo, o da A: o /clear seguinte cai no mais recente
    janela = 'C'
    await sessao()
    await relogio.advance(segundos(60))
    await marco({ marco: 'grill', pedido: 'o decimo primeiro' })
    janela = 'A2'
    await clear()
    janela = 'A3'
    await $.classic.SessionStart({ source: 'clear' } as never)
    expect(await titulo()).toBe('o decimo primeiro')
  })

  test('o /clear troca a sessao e o $.state recomeca vazio: o painel volta com tudo o que desenhava', async ($, on) => {
    const novaSessao = estadoPorSessao(on)
    const { marco, clear } = mundo($, on)
    on('turn.complete', () => ({ text: '' }))
    on('classic.SessionStart', () => ({}) as never)
    const ui = await $.ui.mount(PANE)
    await marco({ marco: 'grill', pedido: 'grill de antes' })
    await marco({ marco: 'entendimento', documento: 'doc' })
    await marco({ marco: 'inicio', documento: 'doc' })
    await $.turn.complete({
      answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer',
      usage: { model: 'claude-opus-5-5', input_tokens: 1500, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as never)
    await ui.press({ key: 'aba:uso' })

    // o /clear: a sessao acaba, o processo segue com outro id e um $.state vazio, sem session.start
    await clear()
    novaSessao()
    await ui.redraw()
    expect(await quadro(ui)).toMatch(/▐▛███▜▌/)
    await $.classic.SessionStart({ source: 'clear' } as never)
    await ui.redraw()

    // a sessao nova abre na mesma aba, com os tokens, a leva e o grill de antes (o estado simulado
    // nao avisa quem le, entao o teste redesenha depois de cada troca)
    expect(await quadro(ui)).toMatch(/\nUso {2}tokens\ndoc {2}1,5k\n/)
    await ui.press({ key: 'aba:painel' })
    await ui.redraw()
    expect(await quadro(ui)).toMatch(/\nLeva · doc {2}\[ Limpar \] {2}0s\n[\s\S]*\[ grill \] {2}0s ✓/)
    await ui.press({ key: 'aba:grill' })
    await ui.redraw()
    expect(await quadro(ui)).toMatch(/\nGrill {2}concluído\ngrill de antes {2}\[ Histórico \] {2}0s\n/)
  })

  test('o /clear depois de um cd no shell traz o grill e a leva de volta, e o Limpar os apaga: o store e da raiz do projeto', async ($, on) => {
    const novaSessao = estadoPorSessao(on)
    const { marco, clear, cd } = mundo($, on)
    on('classic.SessionStart', () => ({}) as never)
    const ui = await $.ui.mount(PANE)
    const depoisDoClear = async () => {
      await clear()
      novaSessao()
      await $.classic.SessionStart({ source: 'clear' } as never)
      await ui.redraw()
    }

    cd('D:/ws/a/src/main/java')
    await marco({ marco: 'grill', pedido: 'grill com cd' })
    cd('D:/ws/a')
    await depoisDoClear()
    expect(await quadro(ui)).toMatch(/Grill · grill com cd/)

    await marco({ marco: 'entendimento', documento: 'doc' })
    await marco({ marco: 'inicio', documento: 'doc' })
    cd('D:/ws/a/outra')
    await depoisDoClear()
    expect(await quadro(ui)).toMatch(/Leva · doc/)

    await ui.press({ key: 'painel:limpar' })
    cd('D:/ws/a')
    await depoisDoClear()
    expect(await quadro(ui)).toMatch(/▐▛███▜▌/)
  })

  test('a sessao nova do /clear sugere na caixa o prompt do grill que nenhuma leva aberta executou, sem envia-lo', async ($, on) => {
    const novaSessao = estadoPorSessao(on)
    const { marco, clear } = mundo($, on)
    on('classic.SessionStart', () => ({}) as never)
    const sugeridas: string[] = []
    on('prompt.suggest', ($, e) => { sugeridas.push(e.text); return { isShown: true } })
    on('prompt.submit', () => { throw new Error('o prompt da leva nunca e enviado pelo plugin') })
    const depoisDoClear = async () => {
      await clear()
      novaSessao()
      await $.classic.SessionStart({ source: 'clear' } as never)
    }
    const LINHA = 'rode /macrex-skills:faz leva doc até o fim.\n/mattpocock-skills:to-spec'

    // sem linha, nada a sugerir
    await marco({ marco: 'grill', pedido: 'grill' })
    await depoisDoClear()
    expect(sugeridas).toEqual([])

    await marco({ marco: 'entendimento', documento: 'doc' })
    await marco({ marco: 'linha', linha: LINHA })
    await depoisDoClear()
    expect(sugeridas).toEqual([LINHA])

    // a leva que nasceu do grill ja esta aberta: o /clear no meio dela nao sugere de novo
    await marco({ marco: 'inicio', documento: 'doc' })
    await depoisDoClear()
    expect(sugeridas).toEqual([LINHA])
    // nem depois de fechada: a leva do grill ja rodou
    await marco({ marco: 'fechamento' })
    await depoisDoClear()
    expect(sugeridas).toEqual([LINHA])
  })

  test('a retomada da leva aberta que nasceu do grill sugere o mesmo prompt, no inicio da sessao e no SessionStart de resume', async ($, on) => {
    const LINHA = 'rode /macrex-skills:faz leva doc até o fim.'
    const grill = { pedido: 'grill', inicio: 0, perguntas: [], documento: 'doc', fim: 1, linha: LINHA, fora: true }
    const aberta = { documento: 'doc', fase: 'implement', fases: ['spec', 'implement'], tickets: [], fechada: false }
    const { sessao } = mundo($, on, { 'grill:D:/ws/a': grill, 'leva:D:/ws/a': aberta })
    on('classic.SessionStart', () => ({}) as never)
    const sugeridas: string[] = []
    on('prompt.suggest', ($, e) => { sugeridas.push(e.text); return { isShown: true } })

    await sessao()
    expect(sugeridas).toEqual([LINHA])
    await $.classic.SessionStart({ source: 'resume' } as never)
    expect(sugeridas).toEqual([LINHA, LINHA])
  })

  test('sem leva aberta do grill, a retomada nao sugere: nem com a leva fechada, nem com a de outro documento', async ($, on) => {
    const grill = { pedido: 'grill', inicio: 0, perguntas: [], documento: 'doc', fim: 1, linha: 'rode /macrex-skills:faz leva doc até o fim.' }
    const { sessao, marco } = mundo($, on, {
      'grill:D:/ws/a': grill,
      'leva:D:/ws/a': { documento: 'doc', fase: 'fechamento', fases: ['spec'], tickets: [], fechada: true },
    })
    on('classic.SessionStart', () => ({}) as never)
    const sugeridas: string[] = []
    on('prompt.suggest', ($, e) => { sugeridas.push(e.text); return { isShown: true } })

    await sessao()
    await $.classic.SessionStart({ source: 'resume' } as never)
    await marco({ marco: 'inicio', documento: 'outro' })
    await $.classic.SessionStart({ source: 'resume' } as never)
    expect(sugeridas).toEqual([])
    // a leva do grill de novo aberta volta a sugerir
    await marco({ marco: 'inicio', documento: 'doc' })
    await $.classic.SessionStart({ source: 'resume' } as never)
    expect(sugeridas).toEqual([grill.linha])
  })

  test('o Limpar fica sempre ao lado do titulo e tira o grill e a leva, aberta ou fechada', async ($, on) => {
    const { marco, sessao } = mundo($, on)
    const ui = await $.ui.mount(PANE)

    await marco({ marco: 'grill', pedido: 'grill largado' })
    expect(await quadro(ui)).toMatch(/\nGrill · grill largado {2}\[ Limpar \]/)
    await ui.press({ key: 'painel:limpar' })
    expect(await ui.find({ text: /grill largado/ })).toBeUndefined()
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()

    // a aberta tambem sai, do store inclusive: a sessao nova nao a traz e o inicio nao a retoma
    await marco({ marco: 'inicio', documento: 'aberta' })
    await marco({ marco: 'fase', fase: 'spec' })
    expect(await quadro(ui)).toMatch(/\nLeva · aberta {2}\[ Limpar \]/)
    await ui.press({ key: 'painel:limpar' })
    expect(await ui.find({ text: /aberta/ })).toBeUndefined()
    await sessao()
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
    expect((await marco({ marco: 'inicio', documento: 'aberta' })).result).not.toMatch(/retomada/)

    await marco({ marco: 'fechamento' })
    expect(await quadro(ui)).toMatch(/\nLeva · aberta {2}\[ Limpar \]/)
    await ui.press({ key: 'painel:limpar' })
    expect(await ui.find({ text: /aberta/ })).toBeUndefined()
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
  })

  test('o Limpar zera a aba Uso junto com a leva', async ($, on) => {
    const { marco } = mundo($, on)
    on('turn.complete', () => ({ text: '' }))
    await marco({ marco: 'inicio', documento: 'doc' })
    await $.turn.complete({
      answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer',
      usage: { model: 'claude-opus-5-5', input_tokens: 1500, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as never)
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:uso' })
    expect(await ui.find({ type: 'Text', text: /^claude-opus-5-5 / })).toBeDefined()

    await ui.press({ key: 'aba:painel' })
    await ui.press({ key: 'painel:limpar' })
    await ui.press({ key: 'aba:uso' })
    expect(await ui.find({ type: 'Text', text: /^claude-opus-5-5 / })).toBeUndefined()
  })

  test('o prompt que o localizador gera vai para a aba Grill mesmo sem o marco linha', async ($, on) => {
    const { marco } = mundo($, on)
    const PROMPT = 'rode /macrex-skills:faz leva doc até o fim.\n/mattpocock-skills:to-spec expandiu esse documento in-place;'
    on('tool.call', { tool: 'Bash' }, ($, e) => ({ result: { stdout: /--linha/.test(e.command) ? `${PROMPT}\n` : '', stderr: '' } }) as never)
    const comando = 'node "D:/ws/skills/faz/scripts/skills-do-matt.js" --linha "doc" "da sessão" "da sessão"'
    // sem grill, o comando nao mexe no painel
    await $.tool.call({ tool: 'Bash', command: comando } as never)
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()

    await marco({ marco: 'grill', pedido: 'csv' })
    await marco({ marco: 'entendimento', documento: 'doc' })
    await $.tool.call({ tool: 'Bash', command: comando } as never)
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe(PROMPT)
  })

  test('so o prompt do grill na tela entra: o localizador rodado depois do inicio ou num comando composto nao troca o prompt', async ($, on) => {
    const { marco } = mundo($, on)
    const PROMPT = 'rode /macrex-skills:faz leva doc até o fim.\nO documento é o entendimento'
    const CODIGO = '// A linha da leva pronta, para o agente imprimir como\nfunction linhaDaLeva(harness, faz, nome, documento) {'
    let stdout = PROMPT
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: `${stdout}\n`, stderr: '' } }) as never)
    const localizador = 'node "D:/ws/skills/faz/scripts/skills-do-matt.js" --linha "doc" "da sessão" "da sessão"'
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:grill' })

    // no grill, o comando composto que imprime outra coisa antes do prompt nao e o prompt
    await marco({ marco: 'grill', pedido: 'csv' })
    await marco({ marco: 'entendimento', documento: 'doc' })
    stdout = `${CODIGO}\n${PROMPT}`
    await $.tool.call({ tool: 'Bash', command: `sed -n 126,150p skills-do-matt.js; ${localizador}` } as never)
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    stdout = PROMPT
    await $.tool.call({ tool: 'Bash', command: localizador } as never)
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe(PROMPT)

    // a leva comecou: o grill saiu da aba Painel, e o localizador rodado de novo nao mexe nele
    await marco({ marco: 'inicio', documento: 'doc' })
    stdout = 'rode /macrex-skills:faz leva outro doc até o fim.'
    await $.tool.call({ tool: 'Bash', command: localizador } as never)
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe(PROMPT)
  })

  test('o prompt do localizador fecha o grill que nao recebeu o marco entendimento: o tempo para e o documento vem do prompt', async ($, on) => {
    const { marco, relogio } = mundo($, on)
    // o localizador imprime o documento que recebeu, ja expandido pelo shell; o \r\n e o do
    // PowerShell no Windows
    let expandido = ''
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: `rode /macrex-skills:faz leva ${expandido} até o fim.\r\nO documento é o entendimento\r\n`, stderr: '' } }) as never)
    const localizador = (argumento: string, documento = argumento.replace(/^["']|["']$/g, '')) => {
      expandido = documento
      return $.tool.call({ tool: 'Bash', command: `node "D:/ws/skills/faz/scripts/skills-do-matt.js" --linha ${argumento} "da sessão" "da sessão"` } as never)
    }
    const ui = await $.ui.mount(PANE)

    await marco({ marco: 'grill', pedido: 'grill sem entendimento' })
    await relogio.advance(segundos(80))
    await localizador('"doc do comando"')
    await relogio.advance(segundos(30))
    expect(await quadro(ui)).toMatch(/\[ grill \] {2}1m20s ✓/)
    await ui.press({ key: 'aba:grill' })
    expect(await quadro(ui)).toMatch(/concluído\ngrill sem entendimento {2}\[ Histórico \] {2}1m20s\n/)
    expect(await ui.find({ type: 'Text', text: /^doc do comando$/ })).toBeDefined()

    // o documento entre aspas simples (PowerShell), sem aspas ou numa variavel do shell fecha igual
    for (const [argumento, documento] of [["'doc do PowerShell'"], ['doc-sem-aspas'], ['"$DOC"', 'doc da variavel']]) {
      await marco({ marco: 'grill', pedido: 'outro grill' })
      await localizador(argumento, documento)
      expect(await ui.find({ type: 'Text', text: new RegExp(`^${documento ?? argumento.replace(/'/g, '')}$`) })).toBeDefined()
    }

    // o documento em branco nao fecha o grill, e o prompt entra mesmo assim
    await marco({ marco: 'grill', pedido: 'grill em branco' })
    await localizador('" "')
    expect(await quadro(ui)).not.toMatch(/concluído\ngrill em branco/)
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('rode /macrex-skills:faz leva   até o fim.\nO documento é o entendimento')

    // o grill que a leva ja tirou da aba Painel nao e fechado pelo comando
    await marco({ marco: 'grill', pedido: 'grill fora' })
    await marco({ marco: 'inicio', documento: 'leva sem entendimento' })
    await localizador('"doc fora"')
    expect(await ui.find({ type: 'Text', text: /^doc fora$/ })).toBeUndefined()

    // o entendimento que chegou antes fica: o comando nao troca o documento nem o fim
    await marco({ marco: 'grill', pedido: 'grill com entendimento' })
    await relogio.advance(segundos(10))
    await marco({ marco: 'entendimento', documento: 'doc do marco' })
    await relogio.advance(segundos(5))
    await localizador('"doc do comando"')
    expect(await quadro(ui)).toMatch(/concluído\ngrill com entendimento {2}\[ Histórico \] {2}10s\n/)
    expect(await ui.find({ type: 'Text', text: /^doc do marco$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^doc do comando$/ })).toBeUndefined()
  })

  test('depois do Limpar, os marcos da leva ou do grill que seguem rodando nao recriam o que saiu', async ($, on) => {
    const { marco } = mundo($, on)
    const ui = await $.ui.mount(PANE)
    await marco({ marco: 'grill', pedido: 'grill largado' })
    await ui.press({ key: 'painel:limpar' })
    const doGrill = await marco({ marco: 'entendimento', documento: 'doc' })
    expect(doGrill.deny).toBeUndefined()
    expect(doGrill.result).toMatch(/limpou o painel/)

    await marco({ marco: 'inicio', documento: 'aberta' })
    await marco({ marco: 'tickets', tickets: [{ id: '01', titulo: 'um' }] })
    await ui.press({ key: 'painel:limpar' })
    const daLeva = await marco({ marco: 'ticket', ticket: '01' })
    expect(daLeva.deny).toBeUndefined()
    expect(daLeva.result).toMatch(/limpou o painel/)
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()

    // um inicio novo volta a registrar
    expect((await marco({ marco: 'inicio', documento: 'nova' })).result).toMatch(/^marco registrado/)
    expect(await ui.find({ text: /Leva · nova/ })).toBeDefined()
  })

  test('a consulta da grill-tela nao desfaz o entendimento que chega enquanto ela espera a pagina', async ($, on) => {
    const { marco, sessao } = mundo($, on)
    let durante: (() => Promise<unknown>) | null = null
    on('http.fetch', async () => {
      const agora = durante
      durante = null
      if (agora) await agora()
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ fase: 'concluido', historico: [] }) } }
    })
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'Rodada 1 na tela.', stderr: '' } }) as never)
    await sessao()
    await marco({ marco: 'grill', pedido: 'grill na tela' })
    durante = () => marco({ marco: 'entendimento', documento: 'doc da tela' })
    await $.tool.call({ tool: 'Bash', command: 'node "C:/s/grill-tela/scripts/grill-tela.js" rodada http://127.0.0.1:4321/g/a/20261009-142524?t=abc123 r1.json' } as never)
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ type: 'Text', text: /^doc da tela$/ })).toBeDefined()
    await sessao()
    expect(await ui.find({ type: 'Text', text: /^doc da tela$/ })).toBeDefined()
  })

  test('o grill que saiu da aba Painel, sem leva, volta a ela com o Limpar', async ($, on) => {
    const { sessao } = mundo($, on, { 'grill:D:/ws/a': { pedido: 'grill velho', inicio: 0, fim: 1000, documento: 'doc', perguntas: [], fora: true } })
    await sessao()
    const ui = await $.ui.mount(PANE)
    expect(await quadro(ui)).toMatch(/\nGrill · grill velho {2}\[ Limpar \]/)
    await ui.press({ key: 'painel:limpar' })
    await ui.press({ key: 'aba:grill' })
    expect(await ui.find({ type: 'Text', text: /^Nenhum grill neste workspace$/ })).toBeDefined()
  })

  test('o /clear deixa a leva fechada na tela; o Limpar a tira e guarda o historico', async ($, on) => {
    const { marco, clear, sessao } = mundo($, on)

    for (const surface of SURFACES) {
      await marco({ marco: 'inicio', documento: 'velha' })
      await marco({ marco: 'fechamento' })
      await clear()
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ text: /Leva · velha/ })).toBeDefined()
      await ui.press({ key: 'painel:limpar' })
      expect(await ui.find({ text: /velha/ })).toBeUndefined()
      expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
      await ui.unmount()
    }

    // limpa vale para a sessao nova; a proxima leva fechada traz o historico de volta
    await sessao()
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
    await marco({ marco: 'inicio', documento: 'nova' })
    await marco({ marco: 'fechamento' })
    expect(await ui.find({ type: 'Text', text: /^velha · / })).toBeDefined()
  })

  test('os marcos da leva aparecem no pane: documento, fase, tickets e portao', async ($, on) => {
    const { toasts, marco } = mundo($, on)

    expect((await marco({ marco: 'inicio', documento: '2026-10-03 Painel da leva' })).deny).toBeUndefined()
    expect(toasts).toEqual(['Leva registrada: /painel-macrex mostra o andamento'])
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'fase', fase: 'implement' })
    await marco({ marco: 'ticket', ticket: '01' })
    await marco({ marco: 'portao', ticket: '01', portao: 'verde', reparos: 1, testes: '3/4' })
    await marco({ marco: 'ticket', ticket: '02' })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ text: /2026-10-03 Painel da leva/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.props.bold).toBe(true)
      expect((await ui.find({ type: 'Text', text: /^to-tickets\b/ }))?.props.color).toBe('#c0caf5')
      expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.props.color).toBe('#8b93b8')
      expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/portão 3\/4 ✓ · 1 reparo\s+\d/)
      expect((await ui.find({ type: 'Text', text: /^02 / }))?.text).toMatch(/em curso ◐/)
      await ui.unmount()
    }
  })

  test('a grade das fases: as passadas com ✓ verde, a atual com ◐, as que faltam com —; o fechamento nao vira chip', async ($, on) => {
    const { marco } = mundo($, on)

    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'fase', fase: 'implement' })
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /^Fases$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+0s ✓$/)
    expect((await ui.find({ type: 'Text', text: /^0s ✓$/ }))?.props.color).toBe('#9ece6a')
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.text).toMatch(/^implement( !)?\s+0s ◐$/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/^code-review( !)?\s+—$/)
    expect(await ui.find({ type: 'Text', text: /^fechamento\b/ })).toBeUndefined()

    await marco({ marco: 'fechamento' })
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.text).toMatch(/✓$/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/—$/)
    expect(await ui.find({ type: 'Text', text: /^fechamento\b/ })).toBeUndefined()
  })

  test('a largura do pane decide os chips por linha e encolhe o titulo que nao cabe', async ($, on) => {
    const { marco } = mundo($, on)
    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: [{ id: 'T1', titulo: 'um titulo comprido demais para caber na linha do ticket' }] })
    // 80 colunas: 72 por dentro do cartao, tres chips de 23 (21 de texto); 50: dois de 20 (18)
    const ui = await $.ui.mount({ ...PANE, viewport: { columns: 200, rows: 60 }, props: { bodyColumns: 80, scroll: { bodyRows: 40 } } } as never)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text.length).toBe(21)
    expect((await ui.find({ type: 'Text', text: /^T1 / }))?.text.length).toBe(72)
    await ui.redraw({ bodyColumns: 50, scroll: { bodyRows: 40 } } as never)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text.length).toBe(18)
    expect((await ui.find({ type: 'Text', text: /^T1 / }))?.text).toMatch(/^T1 {2}um titulo.*… pendente {8}$/)
  })

  test('os itens da revisao, das correcoes e da qualidade aparecem num cartao por fase', async ($, on) => {
    const { relogio, marco } = mundo($, on)

    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'fase', fase: 'revisao' })
    await marco({ marco: 'item', item: 'Standards' })
    await marco({ marco: 'item', item: 'Spec' })
    await relogio.advance(segundos(80))
    await marco({ marco: 'item', item: 'Standards', portao: 'verde', detalhe: '1 achado' })
    await marco({ marco: 'fase', fase: 'qualidade' })
    await relogio.advance(segundos(30))
    // gravado uma vez so, ja com o portao: o tempo conta da entrada na fase
    await marco({ marco: 'item', item: 'claude plugin test .', portao: 'vermelho', detalhe: '15/16' })

    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^claude plugin test \./ }))?.text).toMatch(/15\/16 ✗\s+30s$/)
    expect(await ui.find({ type: 'Text', text: /^Revisão$/ })).toBeDefined()
    const standards = await ui.find({ type: 'Text', text: /Standards/ })
    expect(standards?.text).toMatch(/^Standards\s+1 achado ✓\s+1m20s$/)
    expect((await ui.find({ type: 'Text', text: /^1 achado ✓$/ }))?.props.color).toBe('#9ece6a')
    expect((await ui.find({ type: 'Text', text: /^Spec\b/ }))?.text).toMatch(/^Spec\s+em curso ◐/)
    expect(await ui.find({ type: 'Text', text: /^Correções$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Qualidade$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^15\/16 ✗$/ }))?.props.color).toBe('#f7768e')

    expect((await marco({ marco: 'item' })).deny).toMatch(/item/)
    expect((await marco({ marco: 'item', item: 'x', fase: 'implement' })).deny).toMatch(/fase/)
    expect((await marco({ marco: 'item', item: 'x', detalhe: 'y'.repeat(61) })).deny).toMatch(/detalhe/)
    expect((await marco({ marco: 'item', item: 'x', portao: 'amarelo' })).deny).toMatch(/portao/)
    // o item repetindo o titulo do cartao nao diz nada: a ferramenta pede o nome do passo
    expect((await marco({ marco: 'item', item: 'Qualidade', portao: 'verde' })).deny).toMatch(/titulo do cartao/)
  })

  test('com a leva ativa, o tempo da fase anda sozinho no pane, sem marco novo', async ($, on) => {
    const { relogio, marco, sessao } = mundo($, on)
    await sessao()
    await marco({ marco: 'inicio', documento: 'doc' })
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+0s ◐$/)
    await relogio.advance(segundos(1))
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+1s ◐$/)
    await relogio.advance(segundos(29))
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+30s ◐$/)
  })

  test('marco invalido volta como erro com o motivo e nao mexe no estado', async ($, on) => {
    const { marco } = mundo($, on)

    expect((await marco({ marco: 'fase', fase: 'spec' })).deny).toMatch(/nenhuma leva/)
    expect((await marco({ marco: 'inicio' })).deny).toMatch(/documento/)
    expect((await marco({ marco: 'inicio', documento: 'doc', sujos: 'CONTEXT.md' })).deny).toMatch(/sujos/)
    expect((await marco({ marco: 'inicio', documento: 'doc', sujos: [1] })).deny).toMatch(/sujos/)
    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    expect((await marco({ marco: 'sei-la' })).deny).toMatch(/marco/)
    expect((await marco({ marco: 'fase', fase: 'deploy' })).deny).toMatch(/fase/)
    expect((await marco({ marco: 'fase', fase: 'tickets', modo: 'inline' })).deny).toMatch(/modo/)
    expect((await marco({ marco: 'fase', fase: 'implement', modo: 'paralelo' })).deny).toMatch(/modo/)
    expect((await marco({ marco: 'ticket', ticket: '99' })).deny).toMatch(/99/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'amarelo' })).deny).toMatch(/portao/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', reparos: 3 })).deny).toMatch(/reparos/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', testes: 'x'.repeat(21) })).deny).toMatch(/testes/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', notas: 'x'.repeat(501) })).deny).toMatch(/notas/)

    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/pendente/)

    // no limite, aceita: notas de 500 caracteres e o modo na fase implement
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', notas: 'x'.repeat(500) })).deny).toBeUndefined()
    expect((await marco({ marco: 'fase', fase: 'implement', modo: 'workflow' })).deny).toBeUndefined()
    // o grill: entendimento sem grill, grill sem pedido e entendimento sem documento
    expect((await marco({ marco: 'entendimento', documento: 'x' })).deny).toMatch(/grill/)
    expect((await marco({ marco: 'grill' })).deny).toMatch(/pedido/)
    await marco({ marco: 'grill', pedido: 'p' })
    expect((await marco({ marco: 'entendimento' })).deny).toMatch(/documento/)
  })

  test('fechada, o pane lembra o /cpv; um inicio novo substitui a leva', async ($, on) => {
    const { marco } = mundo($, on)

    await marco({ marco: 'inicio', documento: 'velha' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'fechamento' })
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ text: /leva fechada, falta o \/cpv/ })).toBeDefined()

    // fechada, nem o mesmo documento retoma: comeca do zero
    expect((await marco({ marco: 'inicio', documento: 'velha' })).result).toMatch(/^marco registrado; fase spec\b/)
    expect(await ui.find({ type: 'Text', text: /^01 / })).toBeUndefined()

    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'inicio', documento: 'nova' })
    expect(await ui.find({ text: /velha/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^01 / })).toBeUndefined()
    expect(await ui.find({ text: /nova/ })).toBeDefined()
  })

  test('depois do /cpv, a leva fechada deixa de pedir o /cpv, e isso sobrevive ao store', async ($, on) => {
    const { marco, sessao } = mundo($, on)
    on('skill.prompt', ($, e) => ({ text: e.text }))

    await marco({ marco: 'inicio', documento: 'doc' })
    // o /cpv com a leva aberta nao conta: ela ainda nao fechou
    await $.skill.prompt({ skill: 'macrex-skills:cpv', text: 'x' })
    await marco({ marco: 'fechamento' })
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ text: /falta o \/cpv/ })).toBeDefined()

    await $.skill.prompt({ skill: 'macrex-skills:cpv', text: 'x' })
    expect(await ui.find({ text: /falta o \/cpv/ })).toBeUndefined()
    expect(await ui.find({ text: /\/cpv rodou/ })).toBeDefined()

    // uma sessao nova le a leva do store: o /cpv tem de estar gravado la
    await sessao()
    expect(await ui.find({ text: /\/cpv rodou/ })).toBeDefined()
  })

  test('um inicio com o mesmo documento retoma a leva aberta e devolve fase, tickets com notas e sujos', async ($, on) => {
    const { relogio, marco } = mundo($, on)

    await marco({ marco: 'inicio', documento: 'doc', sujos: ['CONTEXT.md', 'tsconfig.json'] })
    await relogio.advance(segundos(60))
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'fase', fase: 'implement' })
    await marco({ marco: 'ticket', ticket: '01' })
    await marco({ marco: 'portao', ticket: '01', portao: 'verde', notas: 'faz_marco aceita sujos' })
    await relogio.advance(segundos(30))

    const r = await marco({ marco: 'inicio', documento: 'doc', sujos: ['outro.md'] })
    const [cabeca, ...corpo] = String(r.result).split('\n')
    expect(cabeca).toBe('marco registrado; retomada na fase implement')
    expect(JSON.parse(corpo.join('\n'))).toEqual({
      fase: 'implement',
      tickets: [
        { id: '01', titulo: 'Mod do painel', estado: 'verde', notas: 'faz_marco aceita sujos' },
        { id: '02', titulo: 'Ferramenta faz_marco', estado: 'pendente' },
      ],
      sujos: ['CONTEXT.md', 'tsconfig.json'],
    })

    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.props.bold).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^to-spec( !)?\s+1m00s ✓/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/portão ✓/)
    expect(await ui.find({ type: 'Text', text: /^1m30s$/ })).toBeDefined()
  })

  test('a compactacao do loop principal com a leva aberta pede no resumo o estado da leva', async ($, on) => {
    const { marco } = mundo($, on)
    const vistas: Array<{ trigger: string; instructions?: string }> = []
    const messages = [{ role: 'user', text: 'oi', toolUses: [] }]
    on('session.compact', ($, e) => { vistas.push(e); return { messages } as never })
    const compactar = (e: Record<string, unknown>) => $.session.compact({ messages, ...e } as never)

    // sem leva, a compactacao passa intacta
    await compactar({ trigger: 'manual', instructions: 'o plano' })
    expect(vistas.pop()).toMatchObject({ trigger: 'manual', instructions: 'o plano' })

    await marco({ marco: 'inicio', documento: 'doc', sujos: ['CONTEXT.md'] })
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'fase', fase: 'implement', modo: 'workflow' })
    await marco({ marco: 'ticket', ticket: '01' })
    await marco({ marco: 'portao', ticket: '01', portao: 'verde', reparos: 1, notas: `faz_marco aceita sujos ${'x'.repeat(400)}` })
    await marco({ marco: 'ticket', ticket: '02' })
    await marco({ marco: 'portao', ticket: '02', portao: 'vermelho', reparos: 2, notas: 'segredo do vermelho' })

    // as instructions existentes ficam, e o bloco da leva vem depois delas, no teto
    const r = await compactar({ trigger: 'auto', instructions: 'o plano' })
    expect(r.skip).toBeUndefined()
    const { instructions = '' } = vistas.pop() ?? { trigger: '' }
    expect(instructions.startsWith('o plano\n\n')).toBe(true)
    expect(instructions).toMatch(/literalmente/)
    expect(instructions).toMatch(/documento: doc/)
    expect(instructions).toMatch(/fase: implement/)
    expect(instructions).toMatch(/modo: workflow/)
    expect(instructions).toMatch(/01 Mod do painel: verde, 1 reparo — faz_marco aceita sujos x+…/)
    expect(instructions).toMatch(/02 Ferramenta faz_marco: vermelho, 2 reparos$/m)
    expect(instructions).not.toMatch(/segredo do vermelho/)
    expect(instructions).toMatch(/sujos: CONTEXT\.md/)
    expect(instructions.length).toBeLessThan(2400)

    // sem instructions, so o bloco; o precompute, cujo resumo a compactacao seguinte reaproveitaria
    // sem o bloco, fica vetado; o sub-agente passa intacto
    await compactar({ trigger: 'plugin' })
    expect(vistas.pop()?.instructions).toMatch(/^Preserve/)
    expect((await compactar({ trigger: 'precompute', instructions: 'o plano' })).skip).toBeDefined()
    expect(vistas).toEqual([])
    await compactar({ trigger: 'auto', agentId: 'a1' })
    expect(vistas.pop()?.instructions).toBeUndefined()

    // a leva fechada nao entra mais
    await marco({ marco: 'fechamento' })
    await compactar({ trigger: 'manual' })
    expect(vistas.pop()?.instructions).toBeUndefined()
  })

  test('a fase declarada sem a sua skill aparece com ! e o marco avisa', async ($, on) => {
    const { marco } = mundo($, on)
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    const skill = (nome: string) => $.tool.call({ tool: 'Skill', skill: nome } as never)

    // a leva invoca as reservadas logo depois do localizador, antes do inicio: contam assim mesmo
    await skill('mattpocock-skills:to-spec')
    await skill('to-tickets')
    await skill('mattpocock-skills:grilling')
    expect((await marco({ marco: 'inicio', documento: 'doc' })).result).toBe('marco registrado; fase spec')
    expect((await marco({ marco: 'fase', fase: 'tickets' })).result).toBe('marco registrado; fase tickets')
    expect((await marco({ marco: 'fase', fase: 'implement' })).result).toBe('marco registrado; fase implement sem /implement invocada')
    expect((await marco({ marco: 'fase', fase: 'revisao' })).result).toBe('marco registrado; fase revisao sem /code-review invocada')
    expect((await marco({ marco: 'fase', fase: 'correcoes' })).result).toBe('marco registrado; fase correcoes')

    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^to-tickets\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^correções\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^qualidade\b/ }))?.text).not.toMatch(/!/)

    // skill fora das quatro nao conta: a fase implement segue sem a sua
    await skill('implementar')
    expect((await marco({ marco: 'fase', fase: 'implement' })).result).toBe('marco registrado; fase implement sem /implement invocada')

    await skill('mattpocock-skills:code-review')
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).not.toMatch(/!/)

    // o fechamento nunca tem !, e zera as skills: a leva seguinte confere do zero
    expect((await marco({ marco: 'fechamento' })).result).toBe('marco registrado; fase fechamento')
    expect(await ui.find({ type: 'Text', text: /^fechamento\b/ })).toBeUndefined()
    expect((await marco({ marco: 'inicio', documento: 'seguinte' })).result).toBe('marco registrado; fase spec sem /to-spec invocada')
    expect((await marco({ marco: 'fase', fase: 'revisao' })).result).toBe('marco registrado; fase revisao sem /code-review invocada')
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/!/)
  })

  test('na retomada numa sessao nova as skills invocadas recomecam vazias', async ($, on) => {
    const { marco, sessao } = mundo($, on, {
      'leva:D:/ws/b': { documento: 'doc', fase: 'tickets', fases: ['spec', 'tickets'], tickets: [], fechada: false },
    }, 'D:/ws/b')
    await sessao()
    await marco({ marco: 'inicio', documento: 'doc' })
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^to-tickets\b/ }))?.text).toMatch(/!/)
  })

  test('o fechamento guarda a leva no historico, que fica com as 10 ultimas e aparece abaixo da fechada', async ($, on) => {
    const { relogio, marco } = mundo($, on)
    on('tool.call', { tool: 'Agent' }, () => ({
      result: { status: 'completed', agentId: 'a1', resolvedModel: 'claude-opus-5-5', totalDurationMs: 1 },
    }) as never)

    for (let n = 1; n <= 11; n++) {
      await marco({ marco: 'inicio', documento: `leva ${String(n).padStart(2, '0')}` })
      await marco({ marco: 'tickets', tickets: TICKETS })
      await marco({ marco: 'fase', fase: 'implement', modo: 'inline' })
      await marco({ marco: 'portao', ticket: '01', portao: 'verde', reparos: 2 })
      await $.tool.call({ tool: 'Agent', name: 'opus-revisao', description: 'r', prompt: 'p' } as never)
      await relogio.advance(segundos(60))
      await marco({ marco: 'fechamento' })
    }
    await marco({ marco: 'fechamento' })

    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ text: /leva fechada, falta o \/cpv/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Hist/ })).toBeDefined()
    const linhas = (await ui.findAll({ type: 'Text', text: /^leva \d\d · / })).map(t => t.text)
    expect(linhas.length).toBe(10)
    expect(linhas[0]).toMatch(/^leva 11 · total 1m00s · inline · 1\/2 verdes · reparos 2 · claude-opus-5-5$/)
    expect(linhas.some(l => /^leva 01 /.test(l))).toBe(false)

    await marco({ marco: 'inicio', documento: 'aberta' })
    expect(await ui.find({ type: 'Text', text: /^Hist/ })).toBeUndefined()
  })

  test('o historico do workspace e carregado no inicio da sessao e aparece sob a leva fechada', async ($, on) => {
    const fechada = { documento: 'antiga', fase: 'fechamento', fases: ['spec'], tickets: [], fechada: true, inicio: 0, fim: segundos(30), modelos: [] }
    const { sessao } = mundo($, on, { 'leva:D:/ws/b': fechada, 'levas:D:/ws/a': [{ ...fechada, documento: 'de outro workspace' }], 'levas:D:/ws/b': [fechada] }, 'D:/ws/b')
    await sessao()
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /^antiga · / }))?.text).toMatch(/total 30s/)
    expect(await ui.find({ text: /de outro workspace/ })).toBeUndefined()
  })

  test('o estado e por workspace e o inicio da sessao o carrega do store', async ($, on) => {
    const { sessao } = mundo($, on, {
      'leva:D:/ws/a': { documento: 'de outro workspace', fase: 'spec', fases: ['spec'], tickets: [], fechada: false },
      'leva:D:/ws/b': { documento: 'gravada antes', fase: 'revisao', fases: ['spec', 'revisao'], tickets: [], fechada: false },
    }, 'D:/ws/b')
    await sessao()
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ text: /gravada antes/ })).toBeDefined()
    expect(await ui.find({ text: /de outro workspace/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.props.bold).toBe(true)
  })

  test('o pane mostra o tempo de cada fase, de cada ticket e o total', async ($, on) => {
    const { relogio, marco } = mundo($, on)

    await marco({ marco: 'inicio', documento: 'doc' })
    await relogio.advance(segundos(90))
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await relogio.advance(segundos(30))
    await marco({ marco: 'fase', fase: 'implement' })
    await marco({ marco: 'ticket', ticket: '01' })
    await relogio.advance(segundos(65))
    await marco({ marco: 'portao', ticket: '01', portao: 'verde' })
    await marco({ marco: 'ticket', ticket: '02' })
    await relogio.advance(segundos(10))

    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /^to-spec( !)?\s+1m30s ✓/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^to-tickets( !)?\s+30s ✓/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^implement( !)?\s+1m15s ◐/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/1m05s$/)
    expect((await ui.find({ type: 'Text', text: /^02 / }))?.text).toMatch(/10s$/)
    expect(await ui.find({ type: 'Text', text: /^3m15s$/ })).toBeDefined()

    // fechada, o total para no fim: desenhado de novo dez minutos depois, segue o mesmo
    await marco({ marco: 'fechamento' })
    await relogio.advance(segundos(600))
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /^3m15s$/ })).toBeDefined()
  })

  test('os agentes e workflows da leva aparecem com nome, modelo, estado e duracao', async ($, on) => {
    const { relogio, marco } = mundo($, on)
    on('tool.call', { tool: 'Agent' }, ($, e) => ({
      result: e.name === 'opus-sincrono'
        ? { status: 'completed', agentId: 'a1', resolvedModel: 'claude-opus-5-5', totalDurationMs: segundos(125) }
        : { status: 'async_launched', agentId: 'a2' },
    }) as never)
    on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched', taskId: 'w1', workflowName: 'tickets' } }) as never)
    on('turn.complete', () => ({ text: '' }))
    const agente = (name: string, model?: string) =>
      $.tool.call({ tool: 'Agent', name, description: 'revisao', prompt: 'p', model } as never)

    await agente('fora-da-leva')
    await marco({ marco: 'inicio', documento: 'doc' })
    await agente('opus-sincrono')
    await agente('sonnet-fundo', 'sonnet')
    await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
    await relogio.advance(segundos(40))

    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /fora-da-leva/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /opus-sincrono/ }))?.text).toMatch(/claude-opus-5-5\s+concluído\s+2m05s$/)
    expect((await ui.find({ type: 'Text', text: /sonnet-fundo/ }))?.text).toMatch(/sonnet\s+rodando\s+40s$/)
    expect((await ui.find({ type: 'Text', text: /workflow tickets/ }))?.text).toMatch(/rodando\s+40s$/)

    await $.turn.complete({
      answer: 'ok', durationMs: segundos(40), isAborted: false, turnId: 't1', agentId: 'a2', reason: 'answer',
      usage: { model: 'claude-sonnet-5-5' },
    } as never)
    // o fim do workflow chega pela notificacao da tarefa (session.append), que o kit nao deixa
    // um teste responder: esse caminho so se verifica numa sessao real
    expect((await ui.find({ type: 'Text', text: /sonnet-fundo/ }))?.text).toMatch(/claude-sonnet-5-5\s+concluído\s+40s$/)
    expect(await ui.find({ type: 'Text', text: /Read|Bash/ })).toBeUndefined()
  })

  test('o teammate que fica ocioso sai de rodando para concluido', async ($, on) => {
    const { relogio, marco } = mundo($, on)
    // o Agent de um teammate so responde que o spawn deu certo: nao ha agentId nem status de fim
    on('tool.call', { tool: 'Agent' }, () => ({ result: 'Spawned successfully.' }) as never)
    on('classic.TeammateIdle', () => ({}) as never)
    await marco({ marco: 'inicio', documento: 'doc' })
    await $.tool.call({ tool: 'Agent', name: 'haiku-conta-hooks', description: 'conta', prompt: 'p', model: 'haiku' } as never)
    await relogio.advance(segundos(25))
    await $.classic.TeammateIdle({ teammate_name: 'haiku-conta-hooks', team_name: '' } as never)
    await relogio.advance(segundos(60))

    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /haiku-conta-hooks/ }))?.text).toMatch(/concluído\s+25s$/)
  })

  test('a lista oficial acerta os agentes no tique do relogio: waiting e idle aguardam, completed, failed e killed fecham com a duracao', async ($, on) => {
    const { relogio, marco, sessao } = mundo($, on)
    const ids: Record<string, string> = { 'sonnet-espera': 'a1', 'sonnet-feito': 'a2', 'sonnet-roda': 'a3', 'sonnet-falha': 'a4', 'sonnet-morto': 'a5' }
    // o teammate nao tem agentId no Agent: casa pelo nome
    on('tool.call', { tool: 'Agent' }, ($, e) => ({ result: e.name === 'haiku-time' ? 'Spawned successfully.' : { status: 'async_launched', agentId: ids[e.name] } }) as never)
    on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched', taskId: 'w1', workflowName: 'tickets' } }) as never)
    let lista: { id: string; description: string; type: string; status: string; name?: string }[] = []
    on('agent.list', () => ({ value: lista }))
    await sessao()
    await marco({ marco: 'inicio', documento: 'doc' })
    for (const name of [...Object.keys(ids), 'haiku-time']) await $.tool.call({ tool: 'Agent', name, description: 'd', prompt: 'p' } as never)
    await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
    const info = (id: string, status: string, name?: string) => ({ id, description: 'd', type: 'general-purpose', status, name })
    // a cada segundo a lista e lida: o que ela ainda nao conhece segue como esta
    await relogio.advance(segundos(29))
    lista = [info('a1', 'waiting'), info('a2', 'completed'), info('a3', 'running'), info('a4', 'failed'), info('a5', 'killed'), info('t1', 'idle', 'haiku-time')]
    await relogio.advance(segundos(1))

    const ui = await $.ui.mount(PANE)
    const linha = async (nome: string) => (await ui.find({ type: 'Text', text: new RegExp(nome) }))?.text
    expect(await linha('sonnet-espera')).toMatch(/aguardando\s+30s$/)
    expect(await linha('haiku-time')).toMatch(/aguardando\s+30s$/)
    expect(await linha('sonnet-feito')).toMatch(/concluído\s+30s$/)
    expect(await linha('sonnet-falha')).toMatch(/falhou\s+30s$/)
    expect(await linha('sonnet-morto')).toMatch(/parado\s+30s$/)
    expect(await linha('sonnet-roda')).toMatch(/rodando\s+30s$/)
    // o workflow nao esta na lista: segue com os hooks
    expect(await linha('workflow tickets')).toMatch(/rodando\s+30s$/)
    // o que fechou nao anda mais; o que aguarda fecha quando a lista diz
    await relogio.advance(segundos(9))
    lista = [info('a1', 'completed'), info('t1', 'idle', 'haiku-time')]
    await relogio.advance(segundos(1))
    expect(await linha('sonnet-espera')).toMatch(/concluído\s+40s$/)
    expect(await linha('sonnet-feito')).toMatch(/concluído\s+30s$/)
    // o que a lista ainda nao conhece, nesta sessao, segue rodando
    expect(await linha('sonnet-roda')).toMatch(/rodando\s+40s$/)
  })

  test('depois do /clear, o agente rodando herdado que a lista nao conhece mais vira parado', async ($, on) => {
    const novaSessao = estadoPorSessao(on)
    const { relogio, marco, sessao, clear } = mundo($, on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'velho' } }) as never)
    on('classic.SessionStart', () => ({}) as never)
    on('agent.list', () => ({ value: [] }))
    await sessao()
    await marco({ marco: 'inicio', documento: 'doc' })
    await $.tool.call({ tool: 'Agent', name: 'opus-herdado', description: 'd', prompt: 'p' } as never)
    await relogio.advance(segundos(5))
    await clear()
    novaSessao()
    await relogio.advance(segundos(4))
    await $.classic.SessionStart({ source: 'clear' } as never)
    await relogio.advance(segundos(1))

    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /opus-herdado/ }))?.text).toMatch(/parado\s+10s$/)
    expect(await quadro(ui)).not.toMatch(/\[ Parar \]/)
  })

  test('o agente rodando mostra ha quanto tempo nao tem saida, passados 2 min da ultima ferramenta dele', async ($, on) => {
    const { relogio, marco, sessao } = mundo($, on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a1' } }) as never)
    on('tool.call', { tool: 'Read' }, () => ({ result: {} }) as never)
    on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched', taskId: 'w1', workflowName: 'tickets' } }) as never)
    on('agent.list', () => ({ value: [{ id: 'a1', description: 'd', type: 'general-purpose', status: 'running' }] }))
    await sessao()
    await marco({ marco: 'inicio', documento: 'doc' })
    await $.tool.call({ tool: 'Agent', name: 'sonnet-lento', description: 'd', prompt: 'p' } as never)
    // o workflow nao ganha o aviso: as ferramentas dele trazem o agentId dos sub-agentes de dentro
    await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
    const ui = await $.ui.mount(PANE)
    await relogio.advance(segundos(100))
    // a ferramenta chamada dentro do sub-agente traz o agentId dele
    await $.tool.call({ tool: 'Read', file_path: 'a.md', agentId: 'a1' } as never)
    await relogio.advance(segundos(110))
    expect(await ui.find({ text: /sem saída/ })).toBeUndefined()
    await relogio.advance(segundos(70))
    expect(await ui.find({ type: 'Text', text: /^sem saída há 3 min$/ })).toBeDefined()
    expect((await quadro(ui)).match(/sem saída/g)).toHaveLength(1)
  })

  test('o Parar de um agente rodando confirma e encerra pela TaskStop; recusado, o agente segue', async ($, on) => {
    const { relogio, marco, sessao, toasts } = mundo($, on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a1' } }) as never)
    on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched', taskId: 'w1', workflowName: 'tickets' } }) as never)
    on('agent.list', () => ({ value: [{ id: 'a1', description: 'd', type: 'general-purpose', status: 'running' }] }))
    let escolha = 'Deixar rodando'
    const perguntas: string[] = []
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      perguntas.push(e.questions[0].question)
      return { result: { questions: e.questions, answers: { [e.questions[0].question]: escolha } } } as never
    })
    const parados: unknown[] = []
    let falha = false
    on('tool.call', { tool: 'TaskStop' }, ($, e) => {
      if (falha) return { deny: 'nao' } as never
      parados.push(e.task_id)
      return { result: { message: 'ok', task_id: e.task_id, task_type: 'local_agent' } } as never
    })
    await sessao()
    await marco({ marco: 'inicio', documento: 'doc' })
    await $.tool.call({ tool: 'Agent', name: 'sonnet-parar', description: 'd', prompt: 'p' } as never)
    await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
    const ui = await $.ui.mount(PANE)
    await relogio.advance(segundos(20))

    await ui.press({ key: 'agente:parar:a1' } as never)
    expect(perguntas).toEqual(['Parar o agente sonnet-parar?'])
    expect(parados).toEqual([])
    expect((await ui.find({ type: 'Text', text: /sonnet-parar/ }))?.text).toMatch(/rodando\s+20s$/)

    escolha = 'Parar'
    falha = true
    await ui.press({ key: 'agente:parar:a1' } as never)
    expect(toasts).toContain('Não deu para parar sonnet-parar')
    expect((await ui.find({ type: 'Text', text: /sonnet-parar/ }))?.text).toMatch(/rodando\s+20s$/)

    falha = false
    await ui.press({ key: 'agente:parar:a1' } as never)
    expect(parados).toEqual(['a1'])
    expect((await ui.find({ type: 'Text', text: /sonnet-parar/ }))?.text).toMatch(/parado\s+20s$/)
    // o workflow para pelo id da tarefa
    await ui.press({ key: 'agente:parar:w1' } as never)
    expect(parados).toEqual(['a1', 'w1'])
    expect(await quadro(ui)).not.toMatch(/\[ Parar \]/)
  })

  test('toda aba abre com o cabecalho: o nome dela em laranja, sem marca e sem caixa alta, e o titulo embaixo, com e sem leva', async ($, on) => {
    const { marco } = mundo($, on)
    const ui = await $.ui.mount(PANE)
    const conferir = async (semLeva: boolean) => {
      // as abas saem dos botoes desenhados: a aba nova entra no teste sozinha
      const abas = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('aba:'))
      expect(abas.length).toBeGreaterThan(1)
      for (const aba of abas) {
        await ui.press({ key: String(aba.key) })
        // a aba Painel sem leva nem grill e o repouso, o Claude dormindo, sem cabecalho de proposito
        if (semLeva && aba.key === 'aba:painel') continue
        const nome = String(aba.props.label).replace(/ \(\d+\)$/, '')
        // a linha 1 e a das abas; a 2 abre com o nome da aba, como no botao, a 3 com o titulo; a
        // marca do repositorio fica so na pagina da grill-tela
        expect(await quadro(ui)).toMatch(new RegExp(`^.*\\n${nome}(  .*)?\\n\\S`))
        expect(await quadro(ui)).not.toMatch(/❯▁/)
        expect((await ui.find({ type: 'Text', text: new RegExp(`^${nome}$`) }))?.props.color).toBe('#d77757')
      }
    }
    await conferir(true)
    await marco({ marco: 'inicio', documento: 'doc' })
    await conferir(false)
  })

  test('a aba Tickets mostra cada ticket com o portao, os testes, os reparos e as notas do que entregou', async ($, on) => {
    const { relogio, marco } = mundo($, on)
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:tickets' })
    expect(await ui.find({ type: 'Text', text: /^Nenhuma leva neste workspace$/ })).toBeDefined()

    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'ticket', ticket: '01' })
    await relogio.advance(segundos(30))
    await marco({ marco: 'portao', ticket: '01', portao: 'verde', reparos: 1, testes: '3/4', notas: 'Pane com abas; o Code desenha o diff.' })
    await marco({ marco: 'ticket', ticket: '02' })

    expect(await ui.find({ type: 'Text', text: /^1\/2$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/^01 +Mod do painel\s+portão 3\/4 ✓ · 1 reparo\s+30s$/)
    expect(await ui.find({ type: 'Text', text: /^Pane com abas; o Code desenha o diff\.$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^02 / }))?.text).toMatch(/^02 +Ferramenta faz_marco\s+em curso ◐/)
    expect(await ui.find({ type: 'Text', text: /^sem notas ainda$/ })).toBeDefined()
  })

  test('a aba Uso soma os tokens de cada turno por modelo e por agente, desde o inicio da leva', async ($, on) => {
    const { marco } = mundo($, on)
    on('turn.complete', () => ({ text: '' }))
    on('tool.call', { tool: 'Agent' }, () => ({
      result: { status: 'completed', agentId: 'ag1', resolvedModel: 'claude-sonnet-5-5', totalDurationMs: 1000 },
    }) as never)
    const turno = (model: string, entrada: number, saida: number, lido: number, criado: number, agentId?: string) =>
      $.turn.complete({
        answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...(agentId ? { agentId } : {}),
        usage: { model, input_tokens: entrada, output_tokens: saida, cache_read_input_tokens: lido, cache_creation_input_tokens: criado },
      } as never)

    // o turno de antes da leva fica fora: o inicio zera a conta
    await turno('claude-opus-5-5', 999, 1, 0, 0)
    await marco({ marco: 'inicio', documento: 'doc' })
    await turno('claude-opus-5-5', 1000, 200, 30000, 0)
    await turno('claude-opus-5-5', 500, 300, 0, 1500)
    await $.tool.call({ tool: 'Agent', name: 'sonnet-review', description: 'r', prompt: 'p', model: 'sonnet' } as never)
    await turno('claude-sonnet-5-5', 2500, 1000, 0, 0, 'ag1')

    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:uso' })
    expect(await ui.find({ type: 'Text', text: /^doc$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^37,0k$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^claude-opus-5-5 / }))?.text).toMatch(/^claude-opus-5-5\s+1,5k\s+500\s+31,5k$/)
    expect((await ui.find({ type: 'Text', text: /^claude-sonnet-5-5 / }))?.text).toMatch(/^claude-sonnet-5-5\s+2,5k\s+1,0k\s+0$/)
    expect((await ui.find({ type: 'Text', text: /^sessão principal/ }))?.text).toMatch(/claude-opus-5-5\s+33,5k$/)
    expect((await ui.find({ type: 'Text', text: /^sonnet-review/ }))?.text).toMatch(/claude-sonnet-5-5\s+3,5k$/)
  })

  test('a aba Uso mostra o custo medido da leva, a janela de 5 h e o contexto; o historico guarda o custo', async ($, on) => {
    const { marco, usar, relogio } = mundo($, on)
    const medir = (usd: number, rateLimits: unknown[], percent = 45) =>
      $.session.measure({ context: { window: 200000, tokens: 90000, percent }, rateLimits, cost: { usd }, changed: ['cost'] } as never)
    const cincoHoras = (percentUsed: number) => ({ kind: 'five_hour', percentUsed, resetsAt: new Date(relogio.now() + 100 * 60000).toISOString() })
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:uso' })

    // o custo da leva e o da sessao menos o que ela tinha no inicio
    usar({ cost: { usd: 1.5 } })
    await marco({ marco: 'inicio', documento: 'doc' })
    await medir(2.75, [cincoHoras(62), { kind: 'seven_day', percentUsed: 10 }])
    expect((await ui.find({ type: 'Text', text: /^custo da leva/ }))?.text).toMatch(/^custo da leva\s+US\$ 1,25$/)
    expect(await ui.find({ type: 'Text', text: /^5h 62% · reseta em 1h40 · contexto 45%$/ })).toBeDefined()

    // chave de API: sem janela, so o contexto
    await medir(2.75, [], 50)
    expect(await ui.find({ type: 'Text', text: /^contexto 50%$/ })).toBeDefined()
    expect(await ui.find({ text: /5h/ })).toBeUndefined()

    // o fechamento le o custo de agora e a linha do historico o mostra
    usar({ cost: { usd: 3 } })
    await marco({ marco: 'fechamento' })
    await ui.press({ key: 'aba:painel' })
    expect((await ui.find({ type: 'Text', text: /^doc · / }))?.text).toMatch(/ · US\$ 1,50 · /)
  })

  test('a retomada numa sessao nova soma o custo das duas sessoes', async ($, on) => {
    const { marco, usar, sessao } = mundo($, on)
    const medir = (usd: number) => $.session.measure({ context: { window: 200000 }, rateLimits: [], cost: { usd }, changed: ['cost'] } as never)
    usar({ cost: { usd: 1 } })
    await marco({ marco: 'inicio', documento: 'doc' })
    await medir(2)
    // a sessao nova recomeca o custo dela; o turno antes da retomada ja soma ao que a leva custou
    usar({ cost: { usd: 0 } })
    await sessao()
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:uso' })
    await medir(0.05)
    expect((await ui.find({ type: 'Text', text: /^custo da leva/ }))?.text).toMatch(/US\$ 1,05$/)
    usar({ cost: { usd: 0.2 } })
    await marco({ marco: 'inicio', documento: 'doc' })
    await medir(0.5)
    expect((await ui.find({ type: 'Text', text: /^custo da leva/ }))?.text).toMatch(/US\$ 1,50$/)
  })

  test('com a janela de 5 h em 90% ou mais, o implement com sub-agentes, a revisao ou as correcoes avisam uma vez por leva', async ($, on) => {
    const { marco, toasts } = mundo($, on)
    const janela = (percentUsed: number) =>
      $.session.measure({ context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed }], changed: ['rateLimits'] } as never)
    const avisos = () => toasts.filter(t => /sub-agentes dividem o limite/.test(t)).length

    await marco({ marco: 'inicio', documento: 'doc' })
    await janela(92)
    await marco({ marco: 'fase', fase: 'implement', modo: 'inline' })
    expect(avisos()).toBe(0)
    await marco({ marco: 'fase', fase: 'implement', modo: 'workflow' })
    expect(avisos()).toBe(1)
    await marco({ marco: 'fase', fase: 'revisao' })
    await marco({ marco: 'fase', fase: 'correcoes' })
    expect(avisos()).toBe(1)

    // a leva seguinte avisa de novo; abaixo de 90%, nao
    await marco({ marco: 'inicio', documento: 'outra' })
    await marco({ marco: 'fase', fase: 'revisao' })
    expect(avisos()).toBe(2)
    await marco({ marco: 'inicio', documento: 'terceira' })
    await janela(89)
    await marco({ marco: 'fase', fase: 'correcoes' })
    expect(avisos()).toBe(2)
  })

  test('a aba Codigo lista o que a sessao mudou desde o inicio e abre o diff de cada arquivo', async ($, on) => {
    const { sessao } = mundo($, on)
    // o git do repositorio: o velho.txt ja estava solto no inicio e fica fora da lista
    const git = {
      diff: [
        'diff --git a/hooks/register.js b/hooks/register.js',
        'index 1111111..2222222 100644',
        '--- a/hooks/register.js',
        '+++ b/hooks/register.js',
        '@@ -10,3 +10,4 @@ export function register(on) {',
        ' const a = 1',
        '-const b = 2',
        '+const b = 3',
        '+const c = 4',
        ' const d = 5',
        '',
      ].join('\n'),
      soltos: ['velho.txt'],
    }
    const novo = (n: number) => ['diff --git a/novo.md b/novo.md', 'new file mode 100644', '--- /dev/null', '+++ b/novo.md', `@@ -0,0 +1,${n} @@`, ...Array.from({ length: n }, (_, i) => `+linha ${i}`), ''].join('\n')
    let linhasDoNovo = 0
    on('process.run', ($, e) => {
      const a = e.argv.join(' ')
      const saida = /rev-parse --show-toplevel/.test(a) ? 'D:/ws/a\n'
        : /stash create/.test(a) ? 'abc123\n'
        : /ls-files/.test(a) ? [...git.soltos, ...(linhasDoNovo ? ['novo.md'] : [])].map(c => `${c}\0`).join('')
        : /--no-index/.test(a) ? novo(linhasDoNovo)
        : /diff .*abc123/.test(a) ? git.diff
        : ''
      return { value: { exitCode: /--no-index/.test(a) ? 1 : 0, stdout: saida, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('tool.call', { tool: 'Write' }, () => ({ result: {} }) as never)
    await sessao()

    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Button', text: /Painel/ })).toBeDefined()
    await ui.press({ key: 'aba:codigo' })
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^a$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1 arquivo alterado$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /› hooks\/register\.js/ })).toBeDefined()
    expect(await ui.find({ text: /velho/ })).toBeUndefined()
    expect(await ui.find({ type: 'Code' })).toBeUndefined()

    // clicar no arquivo abre o diff dele, no Code de diff, com o cabecalho do hunk
    await ui.press({ key: 'arquivo:0' })
    const code = await ui.find({ type: 'Code' })
    expect(code?.props.format).toBe('diff')
    expect(code?.props.source).toMatch(/^@@ -10,3 \+10,4 @@ export function register/)
    expect(await ui.find({ type: 'Button', text: /⌄ hooks\/register\.js/ })).toBeDefined()

    // a ferramenta que muda arquivo refaz a lista; o arquivo novo e grande vira varios Code,
    // cada um no limite do Code e com o cabecalho recontado
    linhasDoNovo = 2000
    await $.tool.call({ tool: 'Write', file_path: 'D:/ws/a/novo.md', content: 'x' } as never)
    expect(await ui.find({ type: 'Text', text: /^2 arquivos alterados$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^\+2002 -1$/ }))).toBeDefined()
    await ui.press({ key: 'arquivo:1' })
    const doNovo = (await ui.findAll({ type: 'Code' })).slice(1)
    expect(doNovo.length).toBeGreaterThan(1)
    expect(doNovo.every(c => String(c.props.source).length <= 10000)).toBe(true)
    expect(doNovo[0].props.source).toMatch(/^@@ -0,0 \+1,\d+ @@\n\+linha 0\n/)
    const [, n] = /^@@ -0,0 \+1,(\d+) @@/.exec(String(doNovo[0].props.source)) ?? []
    expect(doNovo[1].props.source).toMatch(new RegExp(`^@@ -0,0 \\+${Number(n) + 1},\\d+ @@\\n\\+linha ${n}\\n`))
  })

  // O git da arvore do projeto: os rastreados, os soltos (o que o .gitignore nao ignora) e os
  // apagados do working tree, cada um pelo seu ls-files, e os mudados desde a base da sessao (o
  // diff contra o abc123); o velho.txt ja estava solto no inicio.
  function repo(on: On, git = { rastreados: ['README.md', 'hooks/register.js', 'hooks/painel.test.ts', 'skills/faz/SKILL.md'], soltos: ['velho.txt'], apagados: [] as string[], mudados: [] as string[], diff: '' }) {
    on('process.run', ($, e) => {
      const a = e.argv.join(' ')
      const lista = (l: string[]) => l.map(c => `${c}\0`).join('')
      const stdout = /rev-parse --show-toplevel/.test(a) ? 'D:/ws/a\n'
        : /stash create/.test(a) ? 'abc123\n'
        : /ls-files --cached/.test(a) ? lista(git.rastreados)
        : /ls-files --others/.test(a) ? lista(git.soltos)
        : /ls-files --deleted/.test(a) ? lista(git.apagados)
        : /diff --name-only -z abc123/.test(a) ? lista(git.mudados)
        : /diff --no-color --no-ext-diff abc123/.test(a) ? git.diff
        : ''
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    for (const tool of ['Write', 'Edit', 'Bash']) on('tool.call', { tool }, () => ({ result: {} }) as never)
    return { git }
  }

  // as cores do nome do arquivo: o que nao mudou, o alterado e o novo
  const COR = { igual: '#c0caf5', mudado: '#e0af68', novo: '#9ece6a' }
  const corDe = async (ui: { find: (m: object) => Promise<{ props: Record<string, unknown> } | undefined> }, nome: RegExp) =>
    (await ui.find({ type: 'Text', text: nome }))?.props.color

  test('a aba Arquivos mostra a arvore do projeto e abre e fecha as pastas; o arquivo e so texto', async ($, on) => {
    const { sessao } = mundo($, on)
    const { git } = repo(on)
    await sessao()
    const ui = await $.ui.mount(PANE)

    // a sexta aba, na tecla 6: as pastas fechadas antes dos arquivos, o cabecalho com a raiz e o total
    expect((await ui.find({ type: 'Button', text: /^Arquivos$/ }))?.props.hotkey).toBe('6')
    await ui.press({ key: 'aba:arquivos' })
    expect(await quadro(ui)).toMatch(/Arquivos {2}arquivos\na {2}5\n/)
    expect(await quadro(ui)).toMatch(/\[ ▸ hooks\/ \]\n\[ ▸ skills\/ \]\n {2}README\.md\n {2}velho\.txt$/)
    // o arquivo nao e botao, e nada manda caminho ao prompt
    expect(await ui.find({ type: 'Button', text: /README/ })).toBeUndefined()
    expect(await ui.find({ text: /Enviar/ })).toBeUndefined()

    await ui.press({ key: 'no:hooks/' })
    expect(await quadro(ui)).toMatch(/\[ ▾ hooks\/ \]\n {4}painel\.test\.ts\n {4}register\.js\n\[ ▸ skills\/ \]/)

    // o arquivo criado na sessao aparece depois da ferramenta, com o nome em verde
    git.soltos = [...git.soltos, 'docs/novo.md']
    await $.tool.call({ tool: 'Write', file_path: 'D:/ws/a/docs/novo.md', content: 'x' } as never)
    await ui.press({ key: 'no:docs/' })
    expect(await quadro(ui)).toMatch(/\[ ▾ docs\/ \]\n {4}novo\.md\n/)
    expect(await corDe(ui, /novo\.md$/)).toBe(COR.novo)

    // o editado so muda de cor: a arvore em si nao mexe
    const antes = await quadro(ui)
    expect(await corDe(ui, /README\.md$/)).toBe(COR.igual)
    git.mudados = ['README.md']
    await $.tool.call({ tool: 'Edit', file_path: 'D:/ws/a/README.md', old_string: 'a', new_string: 'b' } as never)
    expect(await quadro(ui)).toBe(antes)
    expect(await corDe(ui, /README\.md$/)).toBe(COR.mudado)

    // o apagado do working tree sai; clicar de novo na pasta a fecha
    git.apagados = ['README.md']
    await $.tool.call({ tool: 'Bash', command: 'rm README.md' } as never)
    expect(await ui.find({ text: /README\.md/ })).toBeUndefined()
    await ui.press({ key: 'no:hooks/' })
    expect(await ui.find({ text: /register\.js/ })).toBeUndefined()
  })

  test('o nome do arquivo alterado fica amarelo e o do novo verde, sem rotulo; a pasta fechada com algum deles leva o ponto', async ($, on) => {
    const { sessao } = mundo($, on)
    const { git } = repo(on)
    git.mudados = ['hooks/register.js']
    await sessao()
    git.soltos = [...git.soltos, 'docs/novo.md']
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:arquivos' })
    expect(await quadro(ui)).toMatch(/\[ ▸ docs\/ \] {2}•\n\[ ▸ hooks\/ \] {2}•\n\[ ▸ skills\/ \]\n/)

    // aberta, a pasta perde o ponto: a cor esta no nome dos filhos
    await ui.press({ key: 'no:hooks/' })
    await ui.press({ key: 'no:docs/' })
    expect(await quadro(ui)).toMatch(/\[ ▾ docs\/ \]\n {4}novo\.md\n\[ ▾ hooks\/ \]\n {4}painel\.test\.ts\n {4}register\.js\n/)
    expect(await corDe(ui, /register\.js$/)).toBe(COR.mudado)
    expect(await corDe(ui, /novo\.md$/)).toBe(COR.novo)
    expect(await corDe(ui, /painel\.test\.ts$/)).toBe(COR.igual)
    expect(await ui.find({ type: 'Text', text: /^(novo|mudou)$/ })).toBeUndefined()
  })

  test('o clique no arquivo alterado abre embaixo o diff dele, o mesmo da aba Diff; o arquivo sem mudanca nao abre nada', async ($, on) => {
    const { sessao } = mundo($, on)
    const { git } = repo(on)
    git.mudados = ['hooks/register.js']
    git.diff = [
      'diff --git a/hooks/register.js b/hooks/register.js',
      '--- a/hooks/register.js',
      '+++ b/hooks/register.js',
      // o hunk tem de bater com as contagens do cabecalho: o Code descarta o format de diff invalido
      '@@ -10,1 +10,1 @@ export function register(on) {',
      '-const b = 2',
      '+const b = 3',
      '',
    ].join('\n')
    await sessao()
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:arquivos' })
    await ui.press({ key: 'no:hooks/' })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    // so o alterado tem o › para abrir; o nome segue amarelo
    expect(await quadro(ui)).toMatch(/\n {4}painel\.test\.ts\n.*\[ › \].*register\.js\n/)
    expect(await corDe(ui, /register\.js$/)).toBe(COR.mudado)

    await ui.press({ key: 'no:hooks/register.js' })
    const code = await ui.find({ type: 'Code' })
    expect(code?.props.format).toBe('diff')
    expect(code?.props.source).toBe('@@ -10,1 +10,1 @@ export function register(on) {\n-const b = 2\n+const b = 3')
    expect(await quadro(ui)).toMatch(/\[ ⌄ \].*register\.js\n@@ -10,1/)

    await ui.press({ key: 'no:hooks/register.js' })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
  })

  test('o filtro da aba Arquivos casa trecho do caminho sem diferenciar maiusculas e, vazio, volta a arvore', async ($, on) => {
    const { sessao } = mundo($, on)
    const { git } = repo(on)
    git.mudados = ['hooks/register.js']
    await sessao()
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:arquivos' })
    await ui.press({ key: 'no:hooks/' })
    const arvore = await quadro(ui)

    // com texto, a lista plana dos caminhos que casam, com a mesma cor da arvore
    await ui.input({ key: 'arvore:filtro', text: 'REGISTER', kind: 'change' })
    expect(await quadro(ui)).toMatch(/\nhooks\/register\.js$/)
    expect(await ui.find({ text: /README|painel\.test/ })).toBeUndefined()
    expect(await corDe(ui, /^hooks\/register\.js$/)).toBe(COR.mudado)

    // sem caso, o aviso; vazio, a arvore volta com as pastas abertas de antes
    await ui.input({ key: 'arvore:filtro', text: 'zzz', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /^nenhum caminho casa com o filtro$/ })).toBeDefined()
    await ui.input({ key: 'arvore:filtro', text: '', kind: 'change' })
    expect(await quadro(ui)).toBe(arvore)
  })

  test('a aba Arquivos fora de um repositorio git diz que nao ha arvore', async ($, on) => {
    const { sessao } = mundo($, on)
    on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }))
    await sessao()
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:arquivos' })
    expect(await ui.find({ type: 'Text', text: /não está num repositório git/ })).toBeDefined()
  })

  test('a aba Arquivos sem o git instalado diz que nao ha arvore, em vez de ler para sempre', async ($, on) => {
    const { sessao } = mundo($, on)
    on('process.run', () => { throw new Error('spawn git ENOENT') })
    await sessao()
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'aba:arquivos' })
    expect(await ui.find({ type: 'Text', text: /lendo a árvore/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /o git não rodou/ })).toBeDefined()
  })

  test('o /clear guarda a aba Arquivos com as pastas abertas', async ($, on) => {
    const novaSessao = estadoPorSessao(on)
    const { sessao, clear } = mundo($, on)
    repo(on)
    on('classic.SessionStart', () => ({}) as never)
    await sessao()
    const ui = await $.ui.mount(PANE)
    // o estado simulado nao avisa quem le: o teste redesenha depois de cada troca
    await ui.press({ key: 'aba:arquivos' })
    await ui.redraw()
    await ui.press({ key: 'no:hooks/' })
    await ui.redraw()
    const antes = await quadro(ui)
    expect(antes).toMatch(/\[ ▾ hooks\/ \]\n {4}painel\.test\.ts\n/)

    await clear()
    novaSessao()
    await $.classic.SessionStart({ source: 'clear' } as never)
    await ui.redraw()
    expect(await quadro(ui)).toBe(antes)
  })
})

// A leva viva fora do pane: a faixa acima do prompt, o sufixo do spinner e a linha do marco.
const FAIXA = { plugin: 'macrex-skills', component: 'AbovePrompt', surface: 'terminal' } as const
const PROPS_DA_FAIXA = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }

describe('faixa da leva', () => {
  test('a faixa mostra a leva aberta numa linha com o Abrir painel, estreita da direita para a esquerda e some com survey, sem leva ou fechada', async ($, on) => {
    const { marco, relogio } = mundo($, on)
    const abertos = new Set<string>()
    on('ui.open', ($, e) => { abertos.add(e.id); return { value: { isPlaced: true } } })
    on('ui.panes', () => ({ value: [...abertos].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
    // o que outro mod desenha na faixa fica embaixo da linha da leva
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, {}, 'outro mod')
    })

    const ui = await $.ui.mount({ ...FAIXA, props: PROPS_DA_FAIXA } as never)
    expect(await ui.find({ text: /^Leva/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^outro mod$/ })).toBeDefined()

    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'fase', fase: 'implement' })
    await marco({ marco: 'ticket', ticket: '01' })
    await marco({ marco: 'portao', ticket: '01', portao: 'verde' })
    await marco({ marco: 'ticket', ticket: '02' })
    await relogio.advance(segundos(80))
    await ui.redraw(PROPS_DA_FAIXA as never)
    // uma contagem so, a do ticket em curso: sem os verdes, que o painel mostra
    expect(await quadro(ui)).toMatch(/^Leva · implement · ticket 2\/2 · 1m20s {2}\[ Abrir painel \]\noutro mod$/)

    // estreita: sai o tempo, depois o ticket, depois a fase
    const larg = (n: number) => ui.redraw({ ...PROPS_DA_FAIXA, bodyColumns: n } as never)
    await larg(46)
    expect((await ui.find({ type: 'Text', text: /^Leva/ }))?.text).toBe('Leva · implement · ticket 2/2')
    await larg(40)
    expect((await ui.find({ type: 'Text', text: /^Leva/ }))?.text).toBe('Leva · implement')
    await larg(30)
    expect((await ui.find({ type: 'Text', text: /^Leva/ }))?.text).toBe('Leva')

    // o Abrir painel abre o pane e some
    await larg(120)
    await ui.press({ key: 'faixa:abrir' })
    expect([...abertos]).toEqual(['painel-macrex'])
    expect(await ui.find({ type: 'Button', text: /Abrir painel/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Leva · implement/ })).toBeDefined()

    await ui.redraw({ ...PROPS_DA_FAIXA, hasSurvey: true } as never)
    expect(await ui.find({ text: /^Leva/ })).toBeUndefined()
    await marco({ marco: 'fechamento' })
    await ui.redraw(PROPS_DA_FAIXA as never)
    expect(await ui.find({ text: /^Leva/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^outro mod$/ })).toBeDefined()
  })

  test('o spinner leva a fase e o ticket da leva ativa antes da reticencia, a mesma contagem da faixa', async ($, on) => {
    const { marco } = mundo($, on)
    const sufixos: string[] = []
    on('ui.render', { component: 'Spinner' }, ($, e) => {
      sufixos.push(e.props.suffix)
      const { Text } = $.ui.resolve(e)
      return h(Text, {}, `${e.props.word}${e.props.suffix}`)
    })
    const SPINNER = { plugin: 'macrex-skills', component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' } } as const
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...SPINNER, surface } as never)
      expect(sufixos.at(-1)).toBe('…')
      await ui.unmount()
    }
    await marco({ marco: 'inicio', documento: 'doc' })
    let ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' } as never)
    expect(sufixos.at(-1)).toBe(' · to-spec…')
    await ui.unmount()
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'fase', fase: 'implement' })
    await marco({ marco: 'portao', ticket: '01', portao: 'verde' })
    for (const surface of SURFACES) {
      ui = await $.ui.mount({ ...SPINNER, surface } as never)
      expect(await ui.find({ type: 'Text', text: /^Sauteing · implement · ticket 1\/2…$/ })).toBeDefined()
      await ui.unmount()
    }
    await marco({ marco: 'fechamento' })
    ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' } as never)
    expect(sufixos.at(-1)).toBe('…')
  })

  test('a chamada do faz_marco na conversa e uma linha apagada com o marco e o resumo', async ($, on) => {
    on('ui.render', { component: 'ToolUse' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, {}, `generica ${e.props.tool}`)
    })
    const linha = async (input: Record<string, unknown>, isErrored = false) => {
      const ui = await $.ui.mount({
        plugin: 'macrex-skills',
        surface: 'terminal',
        component: 'ToolUse',
        props: { tool_use_id: 't', tool: MARCO, input, isRunning: false, isErrored, isInterrupted: false },
      } as never)
      const texto = await ui.find({ type: 'Text', text: /^◆/ })
      await ui.unmount()
      return texto
    }
    expect((await linha({ marco: 'portao', ticket: '01', portao: 'verde', testes: '3/4' }))?.text).toBe('◆ marco portao · ticket 01 · verde')
    expect((await linha({ marco: 'fase', fase: 'implement', modo: 'inline' }))?.text).toBe('◆ marco fase · implement')
    const inicio = await linha({ marco: 'inicio', documento: 'doc' })
    expect(inicio?.text).toBe('◆ marco inicio')
    expect(inicio?.props.dimColor).toBe(true)
    expect((await linha({ marco: 'ticket', ticket: '9' }, true))?.props.color).toBe('#f7768e')
    // as outras ferramentas ficam com a linha delas
    const bash = await $.ui.mount({ plugin: 'macrex-skills', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 'b', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false } } as never)
    expect(await bash.find({ text: /◆/ })).toBeUndefined()
    expect(await bash.find({ type: 'Text', text: /^generica Bash$/ })).toBeDefined()
  })
})
