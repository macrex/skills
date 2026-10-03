// Testes do painel da leva (hooks/register.js), pela porta da sessao: o comando, a ferramenta
// da leva e o desenho do Pane. Rode com `claude plugin test .` na raiz do repositorio.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = { plugin: 'macrex-skills', component: 'Pane', requestId: 'faz-painel', props: {} } as const
const SURFACES = ['terminal', 'desktop'] as const
const MARCO = 'mcp__macrex-skills__faz_marco'

// O mundo sob o mod: um workspace, o store em memoria e a tela que aceita toast.
function mundo(on: On, cwd = 'D:/ws/a') {
  const toasts: string[] = []
  mock.store(on)
  on('session.cwd', () => ({ value: cwd }))
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  return { toasts }
}

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
      expect((await ui.find({ type: 'Text', text: /^implement $/ }))?.props.bold).toBe(true)
      expect((await ui.find({ type: 'Text', text: /^tickets $/ }))?.props.dimColor).toBe(false)
      expect((await ui.find({ type: 'Text', text: /^revisao $/ }))?.props.dimColor).toBe(true)
      expect((await ui.find({ type: 'Text', text: /^. 01 / }))?.text).toMatch(/verde.*reparos: 1.*testes: 3\/4/)
      expect((await ui.find({ type: 'Text', text: /^. 02 / }))?.text).toMatch(/em curso/)
      await ui.unmount()
    }
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
    expect((await ui.find({ type: 'Text', text: /^spec $/ }))?.props.bold).toBe(true)
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

    await marco({ marco: 'inicio', documento: 'nova' })
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /velha/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^. 01 / })).toBeUndefined()
    expect(await ui.find({ text: /nova/ })).toBeDefined()
  })

  test('o estado e por workspace e o inicio da sessao o carrega do store', async ($, on) => {
    mock.store(on, {
      'leva:D:/ws/a': { documento: 'de outro workspace', fase: 'spec', fases: ['spec'], tickets: [], fechada: false },
      'leva:D:/ws/b': { documento: 'gravada antes', fase: 'revisao', fases: ['spec', 'revisao'], tickets: [], fechada: false },
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: undefined }))
    on('tool.register', () => ({ value: undefined }))
    await $.session.start({ cwd: 'D:/ws/b', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: /gravada antes/ })).toBeDefined()
    expect(await ui.find({ text: /de outro workspace/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^revisao $/ }))?.props.bold).toBe(true)
  })

  test('o Agora mostra as 5 ultimas acoes, so com leva ativa e sem a faz_marco', async ($, on) => {
    mundo(on)
    on('tool.call', { tool: 'Read' }, () => ({ result: 'ok' }) as never)
    const marco = (input: Record<string, unknown>) => $.tool.call({ tool: MARCO, ...input } as never)
    const ler = (arquivo: string) => $.tool.call({ tool: 'Read', file_path: arquivo } as never)
    const agora = async () => {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      const achados = []
      for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) achados.push(await ui.find({ type: 'Text', text: new RegExp(`Read .*arq${n}`) }))
      await ui.unmount()
      return achados.map(a => a !== undefined)
    }

    await ler('arq0')
    await marco({ marco: 'inicio', documento: 'doc' })
    for (const n of [1, 2, 3, 4, 5, 6]) await ler(`arq${n}`)
    expect(await agora()).toEqual([false, false, true, true, true, true, true, false])

    await marco({ marco: 'fechamento' })
    await ler('arq7')
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /arq7/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /faz_marco/ })).toBeUndefined()
  })
})
