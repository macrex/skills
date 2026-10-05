// Testes do painel da leva (hooks/register.js), pela porta da sessao: o comando, a ferramenta
// da leva e o desenho do Pane. Rode com `claude plugin test .` na raiz do repositorio.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = { plugin: 'macrex-skills', component: 'Pane', requestId: 'faz-painel', props: {} } as const
const SURFACES = ['terminal', 'desktop'] as const
const MARCO = 'mcp__macrex-skills__faz_marco'

// O mundo sob o mod: um workspace, o store em memoria, o relogio parado e a tela que aceita toast.
function mundo(on: On, cwd = 'D:/ws/a') {
  const toasts: string[] = []
  mock.store(on)
  const relogio = mock.clock(on)
  on('session.cwd', () => ({ value: cwd }))
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  return { toasts, relogio }
}

// A sessao nova sobre um store ja gravado: o session.start do mod carrega dele o workspace cwd.
function sessaoNova(on: On, store: Record<string, unknown>, cwd = 'D:/ws/b') {
  mock.store(on, store)
  const relogio = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', () => ({ value: undefined }))
  return relogio
}

const segundos = (n: number) => n * 1000

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

  test('sem leva nem grill, o pane mostra so o Claude dormindo', async ($, on) => {
    mundo(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
      // o rotulo da aba Grill e Button, nao Text
      expect(await ui.find({ type: 'Text', text: /leva|grill/i })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('o repouso cabe no pane: frase e boneco no grande, so o boneco no estreito, o boneco menor no baixo', async ($, on) => {
    mundo(on)
    // o tamanho que vale e o do corpo do pane, nao o da tela inteira
    const montar = (bodyColumns: number, bodyRows: number) =>
      $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 60 }, props: { bodyColumns, scroll: { bodyRows } } } as never)
    const FRASE = /^T U D O {3}Q U I E T O {3}P O R {3}A Q U I$/

    let ui = await montar(60, 30)
    expect((await ui.find({ type: 'Text', text: FRASE }))?.props.bold).toBe(true)
    expect(await ui.find({ text: /▝▜█████▛▘/ })).toBeDefined()
    expect((await ui.find({ type: 'Box' }))?.props.minHeight).toBe(30)
    await ui.unmount()

    ui = await montar(30, 30)
    expect(await ui.find({ text: /T U D O|Tudo quieto/ })).toBeUndefined()
    expect(await ui.find({ text: /▝▜█████▛▘/ })).toBeDefined()
    await ui.unmount()

    ui = await montar(60, 6)
    expect(await ui.find({ text: /T U D O|Tudo quieto/ })).toBeUndefined()
    // o menor tira as pernas e guarda o corpo, que fecha os olhos por baixo
    expect(await ui.find({ text: /▘▘ ▝▝/ })).toBeUndefined()
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
    expect(await ui.find({ text: /▝▜█████▛▘/ })).toBeDefined()
  })

  test('o Claude dormindo ronca sozinho: so os z mudam com o tempo, o boneco fica parado', async ($, on) => {
    const relogio = sessaoNova(on, {}, 'D:/ws/a')
    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const quadro = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    const vistos = new Set<string>()
    for (let i = 0; i < 4; i++) {
      expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
      vistos.add(await quadro())
      await relogio.advance(700)
    }
    expect(vistos.size).toBe(4)
    const boneco = (q: string) => q.split('\n').slice(-3).join('\n')
    expect(new Set([...vistos].map(boneco)).size).toBe(1)
    expect([...vistos].some(q => /Z/.test(q))).toBe(true)
  })

  test('o grill aparece no pane: pedido, cada pergunta pelo tema com a resposta, e o entendimento', async ($, on) => {
    mundo(on)
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({
      result: { questions: e.questions, answers: { 'Onde guardar o estado?': '$.store' } },
    }) as never)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    const perguntar = (...temas: string[]) =>
      $.tool.call({
        tool: 'AskUserQuestion',
        questions: temas.map(t => ({ header: t, question: t === 'Estado' ? 'Onde guardar o estado?' : `${t}?`, multiSelect: false, options: [] })),
      } as never)

    // fora de um grill, o AskUserQuestion nao vai ao pane
    await perguntar('Solto')
    expect((await marco({ marco: 'grill', pedido: 'painel acompanha o grill' })).deny).toBeUndefined()
    await perguntar('Estado', 'Botão')

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ text: /painel acompanha o grill/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /Estado/ }))?.text).toMatch(/^✓ Estado — \$\.store$/)
      expect((await ui.find({ type: 'Text', text: /Botão/ }))?.text).toMatch(/sem resposta/)
      expect(await ui.find({ text: /Solto/ })).toBeUndefined()
      await ui.unmount()
    }

    expect((await marco({ marco: 'entendimento', documento: '2026-10-04 Grill no painel' })).deny).toBeUndefined()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /2026-10-04 Grill no painel/ })).toBeDefined()
  })

  test('a aba Grill guarda cada pergunta com a resposta e a linha da leva num bloco de codigo, mesmo depois do inicio', async ($, on) => {
    sessaoNova(on, {}, 'D:/ws/a')
    on('ui.toast', () => ({ value: undefined }))
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({
      result: { questions: e.questions, answers: { 'Onde guardar o estado?': '$.store' } },
    }) as never)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    const pergunta = (header: string, question: string) => ({ header, question, multiSelect: false, options: [] })
    const montar = async (aba: string) => {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      await $.ui.press({ plugin: 'macrex-skills', key: `aba:${aba}` })
      return ui
    }

    // sem grill, a aba ja tem o cabecalho: a marca laranja e o nome da aba
    let ui = await montar('grill')
    expect((await ui.find({ type: 'Text', text: /^Grill$/ }))?.props.color).toBe('#d77757')
    expect(await ui.find({ type: 'Text', text: /^Nenhum grill neste workspace$/ })).toBeDefined()
    await ui.unmount()

    await marco({ marco: 'grill', pedido: 'abas no painel' })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [pergunta('Estado', 'Onde guardar o estado?'), pergunta('Botão', 'Botão ou atalho?')] } as never)
    await marco({ marco: 'entendimento', documento: 'doc das abas' })
    expect((await marco({ marco: 'linha', linha: '/faz leva doc das abas até o fim\r\n— sem commitar nada.' })).deny).toBeUndefined()

    ui = await montar('grill')
    expect((await ui.find({ type: 'Text', text: /^Grill$/ }))?.props.color).toBe('#d77757')
    expect(await ui.find({ type: 'Text', text: /^abas no painel$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Onde guardar o estado\?$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✓ \$\.store$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Botão ou atalho\?$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^· sem resposta$/ })).toBeDefined()
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('/faz leva doc das abas até o fim\n— sem commitar nada.')
    await ui.unmount()

    // o inicio da leva tira o grill da aba Painel; a aba Grill o guarda, inclusive numa sessao nova
    await marco({ marco: 'inicio', documento: 'doc das abas' })
    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })
    ui = await montar('grill')
    expect(await ui.find({ type: 'Text', text: /^Onde guardar o estado\?$/ })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    await ui.unmount()
    ui = await montar('painel')
    expect(await ui.find({ text: /abas no painel/ })).toBeUndefined()
    expect(await ui.find({ text: /Leva · doc das abas/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^Painel$/ }))?.props.color).toBe('#d77757')

    expect((await marco({ marco: 'linha' })).deny).toMatch(/linha/)
  })

  test('entendimento sem grill e grill sem pedido voltam como erro', async ($, on) => {
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    expect((await marco({ marco: 'entendimento', documento: 'x' })).deny).toMatch(/grill/)
    expect((await marco({ marco: 'grill' })).deny).toMatch(/pedido/)
    await marco({ marco: 'grill', pedido: 'p' })
    expect((await marco({ marco: 'entendimento' })).deny).toMatch(/documento/)
  })

  test('o inicio da leva tira o grill da tela, e o grill sobrevive a uma sessao nova ate la', async ($, on) => {
    sessaoNova(on, {}, 'D:/ws/a')
    on('ui.toast', () => ({ value: undefined }))
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    await marco({ marco: 'grill', pedido: 'pedido do grill' })
    await marco({ marco: 'entendimento', documento: 'doc do grill' })
    // o /clear antes de colar a linha: a sessao nova le o grill do store
    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /pedido do grill/ })).toBeDefined()
    await ui.unmount()

    await marco({ marco: 'inicio', documento: 'doc do grill' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /pedido do grill/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.props.bold).toBe(true)
    await ui.unmount()

    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /pedido do grill/ })).toBeUndefined()
  })

  test('o /clear tira o grill da tela e guarda a leva aberta para a retomada', async ($, on) => {
    sessaoNova(on, {}, 'D:/ws/a')
    on('ui.toast', () => ({ value: undefined }))
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    on('session.end', ($, e) => ({ sessionId: e.sessionId }))
    const clear = () => $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } } as never)

    await marco({ marco: 'grill', pedido: 'grill largado' })
    await clear()
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /grill largado/ })).toBeUndefined()
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
    await ui.unmount()

    await marco({ marco: 'inicio', documento: 'aberta' })
    await clear()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /aberta/ })).toBeDefined()
    await ui.unmount()

    await marco({ marco: 'fechamento' })
    await clear()
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /aberta/ })).toBeUndefined()
  })

  test('o /clear da leva fechada volta ao Claude dormindo e guarda o historico', async ($, on) => {
    sessaoNova(on, {}, 'D:/ws/a')
    on('ui.toast', () => ({ value: undefined }))
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    on('session.end', ($, e) => ({ sessionId: e.sessionId }))
    const clear = () => $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } } as never)
    let ui

    for (const surface of SURFACES) {
      await marco({ marco: 'inicio', documento: 'velha' })
      await marco({ marco: 'fechamento' })
      await clear()
      ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ text: /velha/ })).toBeUndefined()
      expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
      await ui.unmount()
    }

    // limpa vale para a sessao nova; a proxima leva fechada traz o historico de volta
    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeDefined()
    await ui.unmount()
    await marco({ marco: 'inicio', documento: 'nova' })
    await marco({ marco: 'fechamento' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^velha · / })).toBeDefined()
  })

  test('os marcos da leva aparecem no pane: documento, fase, tickets e portao', async ($, on) => {
    const { toasts } = mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

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
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'fase', fase: 'implement' })
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^Fases$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+0s ✓$/)
    expect((await ui.find({ type: 'Text', text: /^0s ✓$/ }))?.props.color).toBe('#9ece6a')
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.text).toMatch(/^implement( !)?\s+0s ◐$/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/^code-review( !)?\s+—$/)
    expect(await ui.find({ type: 'Text', text: /^fechamento\b/ })).toBeUndefined()
    await ui.unmount()

    await marco({ marco: 'fechamento' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.text).toMatch(/✓$/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/—$/)
    expect(await ui.find({ type: 'Text', text: /^fechamento\b/ })).toBeUndefined()
  })

  test('a largura do pane decide os chips por linha e encolhe o titulo que nao cabe', async ($, on) => {
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: [{ id: 'T1', titulo: 'um titulo comprido demais para caber na linha do ticket' }] })
    const montar = (bodyColumns: number) =>
      $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 60 }, props: { bodyColumns, scroll: { bodyRows: 40 } } } as never)
    // 80 colunas: 72 por dentro do cartao, tres chips de 23 (21 de texto); 50: dois de 20 (18)
    let ui = await montar(80)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text.length).toBe(21)
    expect((await ui.find({ type: 'Text', text: /^T1 / }))?.text.length).toBe(72)
    await ui.unmount()
    ui = await montar(50)
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text.length).toBe(18)
    expect((await ui.find({ type: 'Text', text: /^T1 / }))?.text).toMatch(/^T1 {2}um titulo.*… pendente {8}$/)
  })

  test('os itens da revisao, das correcoes e da qualidade aparecem num cartao por fase', async ($, on) => {
    const { relogio } = mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

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

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
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
    const relogio = mock.clock(on)
    mock.store(on, {})
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.cwd', () => ({ value: 'D:/ws/a' }))
    on('command.register', () => ({ value: undefined }))
    on('tool.register', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: MARCO, marco: 'inicio', documento: 'doc' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+0s ◐$/)
    await relogio.advance(segundos(1))
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+1s ◐$/)
    await relogio.advance(segundos(29))
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/^to-spec( !)?\s+30s ◐$/)
  })

  test('marco invalido volta como erro com o motivo e nao mexe no estado', async ($, on) => {
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    expect((await marco({ marco: 'fase', fase: 'spec' })).deny).toMatch(/nenhuma leva/)
    expect((await marco({ marco: 'inicio' })).deny).toMatch(/documento/)
    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    expect((await marco({ marco: 'sei-la' })).deny).toMatch(/marco/)
    expect((await marco({ marco: 'fase', fase: 'deploy' })).deny).toMatch(/fase/)
    expect((await marco({ marco: 'ticket', ticket: '99' })).deny).toMatch(/99/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'amarelo' })).deny).toMatch(/portao/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', reparos: 3 })).deny).toMatch(/reparos/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', testes: 'x'.repeat(21) })).deny).toMatch(/testes/)

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/pendente/)
  })

  test('fechada, o pane lembra o /cpv; um inicio novo substitui a leva', async ($, on) => {
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    await marco({ marco: 'inicio', documento: 'velha' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'fechamento' })
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /leva fechada, falta o \/cpv/ })).toBeDefined()
    await ui.unmount()

    // fechada, nem o mesmo documento retoma: comeca do zero
    expect((await marco({ marco: 'inicio', documento: 'velha' })).result).toMatch(/^marco registrado; fase spec\b/)
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^01 / })).toBeUndefined()
    await ui.unmount()

    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'inicio', documento: 'nova' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /velha/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^01 / })).toBeUndefined()
    expect(await ui.find({ text: /nova/ })).toBeDefined()
  })

  test('depois do /cpv, a leva fechada deixa de pedir o /cpv, e isso sobrevive ao store', async ($, on) => {
    mundo(on)
    on('skill.prompt', ($, e) => ({ text: e.text }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: undefined }))
    on('tool.register', () => ({ value: undefined }))
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    await marco({ marco: 'inicio', documento: 'doc' })
    // o /cpv com a leva aberta nao conta: ela ainda nao fechou
    await $.skill.prompt({ skill: 'macrex-skills:cpv', text: 'x' })
    await marco({ marco: 'fechamento' })
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /falta o \/cpv/ })).toBeDefined()
    await ui.unmount()

    await $.skill.prompt({ skill: 'macrex-skills:cpv', text: 'x' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /falta o \/cpv/ })).toBeUndefined()
    expect(await ui.find({ text: /\/cpv rodou/ })).toBeDefined()
    await ui.unmount()

    // uma sessao nova le a leva do store: o /cpv tem de estar gravado la
    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /\/cpv rodou/ })).toBeDefined()
  })

  test('um inicio com o mesmo documento retoma a leva aberta e devolve fase, tickets com notas e sujos', async ($, on) => {
    const { relogio } = mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

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

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.props.bold).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^to-spec( !)?\s+1m00s ✓/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/portão ✓/)
    expect(await ui.find({ type: 'Text', text: /^1m30s$/ })).toBeDefined()
  })

  test('sujos fora de lista de strings e notas longas voltam como erro', async ($, on) => {
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    expect((await marco({ marco: 'inicio', documento: 'doc', sujos: 'CONTEXT.md' })).deny).toMatch(/sujos/)
    expect((await marco({ marco: 'inicio', documento: 'doc', sujos: [1] })).deny).toMatch(/sujos/)
    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', notas: 'x'.repeat(501) })).deny).toMatch(/notas/)
    expect((await marco({ marco: 'portao', ticket: '01', portao: 'verde', notas: 'x'.repeat(500) })).deny).toBeUndefined()
  })

  test('a fase declarada sem a sua skill aparece com ! e o marco avisa', async ($, on) => {
    mundo(on)
    on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }) as never)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
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

    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^to-tickets\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^correções\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^qualidade\b/ }))?.text).not.toMatch(/!/)
    await ui.unmount()

    // skill fora das quatro nao conta: a fase implement segue sem a sua
    await skill('implementar')
    expect((await marco({ marco: 'fase', fase: 'implement' })).result).toBe('marco registrado; fase implement sem /implement invocada')

    await skill('mattpocock-skills:code-review')
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).not.toMatch(/!/)
    await ui.unmount()

    // o fechamento nunca tem !, e zera as skills: a leva seguinte confere do zero
    expect((await marco({ marco: 'fechamento' })).result).toBe('marco registrado; fase fechamento')
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^fechamento\b/ })).toBeUndefined()
    await ui.unmount()
    expect((await marco({ marco: 'inicio', documento: 'seguinte' })).result).toBe('marco registrado; fase spec sem /to-spec invocada')
    expect((await marco({ marco: 'fase', fase: 'revisao' })).result).toBe('marco registrado; fase revisao sem /code-review invocada')
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.text).toMatch(/!/)
  })

  test('na retomada numa sessao nova as skills invocadas recomecam vazias', async ($, on) => {
    sessaoNova(on, {
      'leva:D:/ws/b': { documento: 'doc', fase: 'tickets', fases: ['spec', 'tickets'], tickets: [], fechada: false },
    })
    await $.session.start({ cwd: 'D:/ws/b', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: MARCO, marco: 'inicio', documento: 'doc' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^to-spec\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^to-tickets\b/ }))?.text).toMatch(/!/)
  })

  test('o modo do implement vai no marco da fase implement e fora dele volta como erro', async ($, on) => {
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    await marco({ marco: 'inicio', documento: 'doc' })
    expect((await marco({ marco: 'fase', fase: 'tickets', modo: 'inline' })).deny).toMatch(/modo/)
    expect((await marco({ marco: 'fase', fase: 'implement', modo: 'paralelo' })).deny).toMatch(/modo/)
    expect((await marco({ marco: 'fase', fase: 'implement', modo: 'workflow' })).deny).toBeUndefined()
  })

  test('o fechamento guarda a leva no historico, que fica com as 10 ultimas e aparece abaixo da fechada', async ($, on) => {
    const { relogio } = mundo(on)
    on('tool.call', { tool: 'Agent' }, () => ({
      result: { status: 'completed', agentId: 'a1', resolvedModel: 'claude-opus-5-5', totalDurationMs: 1 },
    }) as never)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

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

    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /leva fechada, falta o \/cpv/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Hist/ })).toBeDefined()
    const linhas = (await ui.findAll({ type: 'Text', text: /^leva \d\d · / })).map(t => t.text)
    expect(linhas.length).toBe(10)
    expect(linhas[0]).toMatch(/^leva 11 · total 1m00s · inline · 1\/2 verdes · reparos 2 · claude-opus-5-5$/)
    expect(linhas.some(l => /^leva 01 /.test(l))).toBe(false)
    await ui.unmount()

    await marco({ marco: 'inicio', documento: 'aberta' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^Hist/ })).toBeUndefined()
  })

  test('o historico do workspace e carregado no inicio da sessao e aparece sob a leva fechada', async ($, on) => {
    const fechada = { documento: 'antiga', fase: 'fechamento', fases: ['spec'], tickets: [], fechada: true, inicio: 0, fim: segundos(30), modelos: [] }
    sessaoNova(on, { 'leva:D:/ws/b': fechada, 'levas:D:/ws/a': [{ ...fechada, documento: 'de outro workspace' }], 'levas:D:/ws/b': [fechada] })
    await $.session.start({ cwd: 'D:/ws/b', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^antiga · / }))?.text).toMatch(/total 30s/)
    expect(await ui.find({ text: /de outro workspace/ })).toBeUndefined()
  })

  test('o estado e por workspace e o inicio da sessao o carrega do store', async ($, on) => {
    sessaoNova(on, {
      'leva:D:/ws/a': { documento: 'de outro workspace', fase: 'spec', fases: ['spec'], tickets: [], fechada: false },
      'leva:D:/ws/b': { documento: 'gravada antes', fase: 'revisao', fases: ['spec', 'revisao'], tickets: [], fechada: false },
    })
    await $.session.start({ cwd: 'D:/ws/b', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /gravada antes/ })).toBeDefined()
    expect(await ui.find({ text: /de outro workspace/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^code-review\b/ }))?.props.bold).toBe(true)
  })

  test('o pane mostra o tempo de cada fase, de cada ticket e o total', async ($, on) => {
    const { relogio } = mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

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

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^to-spec( !)?\s+1m30s ✓/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^to-tickets( !)?\s+30s ✓/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^implement( !)?\s+1m15s ◐/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/1m05s$/)
    expect((await ui.find({ type: 'Text', text: /^02 / }))?.text).toMatch(/10s$/)
    expect(await ui.find({ type: 'Text', text: /^3m15s$/ })).toBeDefined()
    await ui.unmount()

    await marco({ marco: 'fechamento' })
    await relogio.advance(segundos(600))
    const fechada = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await fechada.find({ type: 'Text', text: /^3m15s$/ })).toBeDefined()
  })

  test('os agentes e workflows da leva aparecem com nome, modelo, estado e duracao', async ($, on) => {
    const { relogio } = mundo(on)
    on('tool.call', { tool: 'Agent' }, ($, e) => ({
      result: e.name === 'opus-sincrono'
        ? { status: 'completed', agentId: 'a1', resolvedModel: 'claude-opus-5-5', totalDurationMs: segundos(125) }
        : { status: 'async_launched', agentId: 'a2' },
    }) as never)
    on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched', taskId: 'w1', workflowName: 'tickets' } }) as never)
    on('turn.complete', () => ({ text: '' }))
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    const agente = (name: string, model?: string) =>
      $.tool.call({ tool: 'Agent', name, description: 'revisao', prompt: 'p', model } as never)

    await agente('fora-da-leva')
    await marco({ marco: 'inicio', documento: 'doc' })
    await agente('opus-sincrono')
    await agente('sonnet-fundo', 'sonnet')
    await $.tool.call({ tool: 'Workflow', script: 'x' } as never)
    await relogio.advance(segundos(40))

    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /fora-da-leva/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /opus-sincrono/ }))?.text).toMatch(/claude-opus-5-5\s+concluído\s+2m05s$/)
    expect((await ui.find({ type: 'Text', text: /sonnet-fundo/ }))?.text).toMatch(/sonnet\s+rodando\s+40s$/)
    expect((await ui.find({ type: 'Text', text: /workflow tickets/ }))?.text).toMatch(/rodando\s+40s$/)
    await ui.unmount()

    await $.turn.complete({
      answer: 'ok', durationMs: segundos(40), isAborted: false, turnId: 't1', agentId: 'a2', reason: 'answer',
      usage: { model: 'claude-sonnet-5-5' },
    } as never)
    // o fim do workflow chega pela notificacao da tarefa (session.append), que o kit nao deixa
    // um teste responder: esse caminho so se verifica numa sessao real
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /sonnet-fundo/ }))?.text).toMatch(/claude-sonnet-5-5\s+concluído\s+40s$/)
    expect(await ui.find({ type: 'Text', text: /Read|Bash/ })).toBeUndefined()
  })

  test('o teammate que fica ocioso sai de rodando para concluido', async ($, on) => {
    const { relogio } = mundo(on)
    // o Agent de um teammate so responde que o spawn deu certo: nao ha agentId nem status de fim
    on('tool.call', { tool: 'Agent' }, () => ({ result: 'Spawned successfully.' }) as never)
    on('classic.TeammateIdle', () => ({}) as never)
    await $.tool.call({ tool: MARCO, marco: 'inicio', documento: 'doc' } as never)
    await $.tool.call({ tool: 'Agent', name: 'haiku-conta-hooks', description: 'conta', prompt: 'p', model: 'haiku' } as never)
    await relogio.advance(segundos(25))
    await $.classic.TeammateIdle({ teammate_name: 'haiku-conta-hooks', team_name: '' } as never)
    await relogio.advance(segundos(60))

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /haiku-conta-hooks/ }))?.text).toMatch(/concluído\s+25s$/)
  })

  test('a aba Tickets mostra cada ticket com o portao, os testes, os reparos e as notas do que entregou', async ($, on) => {
    const { relogio } = mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    const montar = async () => {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      await $.ui.press({ plugin: 'macrex-skills', key: 'aba:tickets' })
      return ui
    }

    let ui = await montar()
    expect((await ui.find({ type: 'Text', text: /^Tickets$/ }))?.props.color).toBe('#d77757')
    expect(await ui.find({ type: 'Text', text: /^Nenhuma leva neste workspace$/ })).toBeDefined()
    await ui.unmount()

    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'ticket', ticket: '01' })
    await relogio.advance(segundos(30))
    await marco({ marco: 'portao', ticket: '01', portao: 'verde', reparos: 1, testes: '3/4', notas: 'Pane com abas; o Code desenha o diff.' })
    await marco({ marco: 'ticket', ticket: '02' })

    ui = await montar()
    expect(await ui.find({ type: 'Text', text: /^1\/2$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^01 / }))?.text).toMatch(/^01 +Mod do painel\s+portão 3\/4 ✓ · 1 reparo\s+30s$/)
    expect(await ui.find({ type: 'Text', text: /^Pane com abas; o Code desenha o diff\.$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^02 / }))?.text).toMatch(/^02 +Ferramenta faz_marco\s+em curso ◐/)
    expect(await ui.find({ type: 'Text', text: /^sem notas ainda$/ })).toBeDefined()
  })

  test('a aba Uso soma os tokens de cada turno por modelo e por agente, desde o inicio da leva', async ($, on) => {
    mundo(on)
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
    await $.tool.call({ tool: MARCO, marco: 'inicio', documento: 'doc' } as never)
    await turno('claude-opus-5-5', 1000, 200, 30000, 0)
    await turno('claude-opus-5-5', 500, 300, 0, 1500)
    await $.tool.call({ tool: 'Agent', name: 'sonnet-review', description: 'r', prompt: 'p', model: 'sonnet' } as never)
    await turno('claude-sonnet-5-5', 2500, 1000, 0, 0, 'ag1')

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await $.ui.press({ plugin: 'macrex-skills', key: 'aba:uso' })
    expect((await ui.find({ type: 'Text', text: /^Uso$/ }))?.props.color).toBe('#d77757')
    expect(await ui.find({ type: 'Text', text: /^doc$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^37,0k$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^claude-opus-5-5 / }))?.text).toMatch(/^claude-opus-5-5\s+1,5k\s+500\s+31,5k$/)
    expect((await ui.find({ type: 'Text', text: /^claude-sonnet-5-5 / }))?.text).toMatch(/^claude-sonnet-5-5\s+2,5k\s+1,0k\s+0$/)
    expect((await ui.find({ type: 'Text', text: /^sessão principal/ }))?.text).toMatch(/claude-opus-5-5\s+33,5k$/)
    expect((await ui.find({ type: 'Text', text: /^sonnet-review/ }))?.text).toMatch(/claude-sonnet-5-5\s+3,5k$/)
  })

  test('a aba Codigo lista o que a sessao mudou desde o inicio e abre o diff de cada arquivo', async ($, on) => {
    sessaoNova(on, {}, 'D:/ws/a')
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
    await $.session.start({ cwd: 'D:/ws/a', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Button', text: /Painel/ })).toBeDefined()
    await $.ui.press({ plugin: 'macrex-skills', key: 'aba:codigo' })
    expect(await ui.find({ text: /▐▛███▜▌/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^Diff$/ }))?.props.color).toBe('#d77757')
    expect(await ui.find({ type: 'Text', text: /^a$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1 arquivo alterado$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /› hooks\/register\.js/ })).toBeDefined()
    expect(await ui.find({ text: /velho/ })).toBeUndefined()
    expect(await ui.find({ type: 'Code' })).toBeUndefined()

    // clicar no arquivo abre o diff dele, no Code de diff, com o cabecalho do hunk
    await $.ui.press({ plugin: 'macrex-skills', key: 'arquivo:0' })
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
    await $.ui.press({ plugin: 'macrex-skills', key: 'arquivo:1' })
    const doNovo = (await ui.findAll({ type: 'Code' })).slice(1)
    expect(doNovo.length).toBeGreaterThan(1)
    expect(doNovo.every(c => String(c.props.source).length <= 10000)).toBe(true)
    expect(doNovo[0].props.source).toMatch(/^@@ -0,0 \+1,\d+ @@\n\+linha 0\n/)
    const [, n] = /^@@ -0,0 \+1,(\d+) @@/.exec(String(doNovo[0].props.source)) ?? []
    expect(doNovo[1].props.source).toMatch(new RegExp(`^@@ -0,0 \\+${Number(n) + 1},\\d+ @@\\n\\+linha ${n}\\n`))
  })
})
