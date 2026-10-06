// Testes do painel da leva (hooks/register.js), pela porta da sessao: o comando, a ferramenta
// da leva e o desenho do Pane. Rode com `claude plugin test .` na raiz do repositorio.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = { plugin: 'macrex-skills', component: 'Pane', requestId: 'faz-painel', props: {}, surface: 'terminal' } as const
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
  return {
    toasts,
    relogio,
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
  test('/faz-painel abre o pane e, aberto, fecha', async ($, on) => {
    const abertos = new Set<string>()
    on('ui.open', ($, e) => { abertos.add(e.id); return { value: { isPlaced: true } } })
    on('ui.close', ($, e) => { abertos.delete(e.id); return { value: undefined } })
    on('ui.panes', () => ({
      value: [...abertos].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
    }))

    await $.command.run({ command: 'faz-painel' })
    expect([...abertos]).toEqual(['faz-painel'])
    await $.command.run({ command: 'faz-painel' })
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

  test('a aba Grill guarda cada pergunta com a resposta e a linha da leva num bloco de codigo, que o Copiar leva exata, mesmo depois do inicio', async ($, on) => {
    const { marco, sessao, toasts } = mundo($, on)
    const copias: string[] = []
    on('ui.copy', ($, e) => { copias.push(e.text); return { value: { isCopied: true } } })
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
    expect(await quadro(ui)).toMatch(/^Prompt {2}\[ Copiar \]$/m)
    await ui.press({ key: 'grill:copiar' })
    expect(copias).toEqual(['/faz leva doc das abas até o fim\n— sem commitar nada.'])
    expect(toasts).toContain('Prompt copiado: cole numa sessão nova')

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
    const URL = 'http://127.0.0.1:4321/?t=abc123'
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
    expect(consultas.at(-1)).toBe('http://127.0.0.1:4321/api/estado?t=abc123')
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
    expect(await quadro(ui)).toMatch(/\nGrill {2}concluído\ngrill de antes {2}0s\n/)
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
    expect(await quadro(ui)).toMatch(/concluído\ngrill sem entendimento {2}1m20s\n/)
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
    expect(await quadro(ui)).toMatch(/concluído\ngrill com entendimento {2}10s\n/)
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
    await $.tool.call({ tool: 'Bash', command: 'node "C:/s/grill-tela/scripts/grill-tela.js" rodada http://127.0.0.1:4321/?t=abc123 r1.json' } as never)
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
    expect(toasts.length).toBe(1)
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
})
