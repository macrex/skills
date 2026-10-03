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
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', () => ({ value: undefined }))
}

const segundos = (n: number) => n * 1000

const TICKETS = [{ id: '01', titulo: 'Mod do painel' }, { id: '02', titulo: 'Ferramenta faz_marco' }]

describe('painel da leva', () => {
  test('/faz-painel abre o pane e, aberto, fecha', async ($, on) => {
    const abertos = new Set<string>()
    on('ui.open', ($, e) => { if (e.closeOnEscape) abertos.add(e.id); return { value: { isPlaced: true } } })
    on('ui.close', ($, e) => { abertos.delete(e.id); return { value: undefined } })
    on('ui.panes', () => ({
      value: [...abertos].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
    }))

    await $.command.run({ command: 'faz-painel' })
    expect([...abertos]).toEqual(['faz-painel'])
    await $.command.run({ command: 'faz-painel' })
    expect([...abertos]).toEqual([])
  })

  test('sem leva, o pane diz que nao ha leva neste workspace', async ($, on) => {
    mundo(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ text: /nenhuma leva neste workspace/ })).toBeDefined()
      await ui.unmount()
    }
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
      expect((await ui.find({ type: 'Text', text: /^tickets\b/ }))?.props.dimColor).toBe(false)
      expect((await ui.find({ type: 'Text', text: /^revisao\b/ }))?.props.dimColor).toBe(true)
      expect((await ui.find({ type: 'Text', text: /^. 01 / }))?.text).toMatch(/verde.*reparos: 1.*testes: 3\/4/)
      expect((await ui.find({ type: 'Text', text: /^. 02 / }))?.text).toMatch(/em curso/)
      await ui.unmount()
    }
  })

  test('as fases passadas ficam verdes com ✓, separadas por ›, e o titulo diz a etapa x/7', async ($, on) => {
    mundo(on)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)

    await marco({ marco: 'inicio', documento: 'doc' })
    await marco({ marco: 'fase', fase: 'tickets' })
    await marco({ marco: 'fase', fase: 'implement' })
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^Fases · etapa 3\/7$/ })).toBeDefined()
    const spec = await ui.find({ type: 'Text', text: /^spec\b/ })
    expect(spec?.text).toMatch(/^spec 0s ✓.* › $/)
    expect(spec?.props.color).toBe('green')
    const atual = await ui.find({ type: 'Text', text: /^implement\b/ })
    expect(atual?.text).not.toMatch(/✓/)
    expect(atual?.props.color).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^revisao\b/ }))?.text).not.toMatch(/✓/)
    expect((await ui.find({ type: 'Text', text: /^fechamento\b/ }))?.text).not.toMatch(/›/)
    await ui.unmount()

    await marco({ marco: 'fechamento' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^Fases · etapa 7\/7$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^fechamento\b/ }))?.text).toMatch(/✓/)
    expect((await ui.find({ type: 'Text', text: /^fechamento\b/ }))?.props.color).toBe('green')
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
    await marco({ marco: 'item', item: 'claude plugin test .', portao: 'vermelho', detalhe: '15/16' })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^Revisão$/ })).toBeDefined()
    const standards = await ui.find({ type: 'Text', text: /Standards/ })
    expect(standards?.text).toMatch(/^✓ Standards — verde \(1 achado, 1m20s\)$/)
    expect(standards?.props.color).toBe('green')
    expect((await ui.find({ type: 'Text', text: /Spec/ }))?.text).toMatch(/^▸ Spec — em curso/)
    expect(await ui.find({ type: 'Text', text: /^Correções$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Qualidade$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /claude plugin test/ }))?.props.color).toBe('red')

    expect((await marco({ marco: 'item' })).deny).toMatch(/item/)
    expect((await marco({ marco: 'item', item: 'x', fase: 'implement' })).deny).toMatch(/fase/)
    expect((await marco({ marco: 'item', item: 'x', detalhe: 'y'.repeat(61) })).deny).toMatch(/detalhe/)
    expect((await marco({ marco: 'item', item: 'x', portao: 'amarelo' })).deny).toMatch(/portao/)
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
    expect((await ui.find({ type: 'Text', text: /^spec\b/ }))?.text).toMatch(/^spec 0s/)
    await relogio.advance(segundos(30))
    expect((await ui.find({ type: 'Text', text: /^spec\b/ }))?.text).toMatch(/^spec 30s/)
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
    expect((await ui.find({ type: 'Text', text: /^spec\b/ }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^. 01 / }))?.text).toMatch(/pendente/)
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
    expect(await ui.find({ type: 'Text', text: /^. 01 / })).toBeUndefined()
    await ui.unmount()

    await marco({ marco: 'tickets', tickets: TICKETS })
    await marco({ marco: 'inicio', documento: 'nova' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /velha/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^. 01 / })).toBeUndefined()
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
    expect(await ui.find({ type: 'Text', text: /^spec 1m00s/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^. 01 / }))?.text).toMatch(/verde/)
    expect(await ui.find({ type: 'Text', text: /total 1m30s/ })).toBeDefined()
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
    expect((await ui.find({ type: 'Text', text: /^spec\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^tickets\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^implement\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^revisao\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^correcoes\b/ }))?.text).not.toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^qualidade\b/ }))?.text).not.toMatch(/!/)
    await ui.unmount()

    // skill fora das quatro nao conta: a fase implement segue sem a sua
    await skill('implementar')
    expect((await marco({ marco: 'fase', fase: 'implement' })).result).toBe('marco registrado; fase implement sem /implement invocada')

    await skill('mattpocock-skills:code-review')
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^revisao\b/ }))?.text).not.toMatch(/!/)
    await ui.unmount()

    // o fechamento nunca tem !, e zera as skills: a leva seguinte confere do zero
    expect((await marco({ marco: 'fechamento' })).result).toBe('marco registrado; fase fechamento')
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^fechamento\b/ }))?.text).not.toMatch(/!/)
    await ui.unmount()
    expect((await marco({ marco: 'inicio', documento: 'seguinte' })).result).toBe('marco registrado; fase spec sem /to-spec invocada')
    expect((await marco({ marco: 'fase', fase: 'revisao' })).result).toBe('marco registrado; fase revisao sem /code-review invocada')
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^spec\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^revisao\b/ }))?.text).toMatch(/!/)
  })

  test('na retomada numa sessao nova as skills invocadas recomecam vazias', async ($, on) => {
    sessaoNova(on, {
      'leva:D:/ws/b': { documento: 'doc', fase: 'tickets', fases: ['spec', 'tickets'], tickets: [], fechada: false },
    })
    await $.session.start({ cwd: 'D:/ws/b', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: MARCO, marco: 'inicio', documento: 'doc' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^spec\b/ }))?.text).toMatch(/!/)
    expect((await ui.find({ type: 'Text', text: /^tickets\b/ }))?.text).toMatch(/!/)
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

  test('sem leva, o historico do workspace aparece sozinho, carregado no inicio da sessao', async ($, on) => {
    const fechada = { documento: 'antiga', fase: 'fechamento', fases: ['spec'], tickets: [], fechada: true, inicio: 0, fim: segundos(30), modelos: [] }
    sessaoNova(on, { 'levas:D:/ws/a': [{ ...fechada, documento: 'de outro workspace' }], 'levas:D:/ws/b': [fechada] })
    await $.session.start({ cwd: 'D:/ws/b', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /nenhuma leva neste workspace/ })).toBeDefined()
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
    expect((await ui.find({ type: 'Text', text: /^revisao\b/ }))?.props.bold).toBe(true)
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
    expect(await ui.find({ type: 'Text', text: /^spec 1m30s/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^tickets 30s/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^implement 1m15s/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^. 01 / }))?.text).toMatch(/1m05s/)
    expect((await ui.find({ type: 'Text', text: /^. 02 / }))?.text).toMatch(/10s/)
    expect(await ui.find({ type: 'Text', text: /total 3m15s/ })).toBeDefined()
    await ui.unmount()

    await marco({ marco: 'fechamento' })
    await relogio.advance(segundos(600))
    const fechada = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await fechada.find({ type: 'Text', text: /total 3m15s/ })).toBeDefined()
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
    expect((await ui.find({ type: 'Text', text: /opus-sincrono/ }))?.text).toMatch(/claude-opus-5-5.*concluido.*2m05s/)
    expect((await ui.find({ type: 'Text', text: /sonnet-fundo/ }))?.text).toMatch(/sonnet.*rodando.*40s/)
    expect((await ui.find({ type: 'Text', text: /workflow tickets/ }))?.text).toMatch(/rodando.*40s/)
    await ui.unmount()

    await $.turn.complete({
      answer: 'ok', durationMs: segundos(40), isAborted: false, turnId: 't1', agentId: 'a2', reason: 'answer',
      usage: { model: 'claude-sonnet-5-5' },
    } as never)
    // o fim do workflow chega pela notificacao da tarefa (session.append), que o kit nao deixa
    // um teste responder: esse caminho so se verifica numa sessao real
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /sonnet-fundo/ }))?.text).toMatch(/claude-sonnet-5-5.*concluido.*40s/)
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
    expect((await ui.find({ type: 'Text', text: /haiku-conta-hooks/ }))?.text).toMatch(/concluido.*25s/)
  })
})
