// Painel da leva: o mod do Claude Code que desenha, num pane ao lado da conversa, o estado da
// leva do workspace. Carregado por "modules" no hooks/hooks.json; os settings hooks seguem la.
// Sem JSX (o arquivo e .js): as arvores saem do `h` global.
//
// A leva grava o estado chamando a ferramenta faz_marco (skills/faz/references/harness.md diz
// quando); o estado fica no $.store do plugin, um por workspace, e sobrevive a reinicio. O
// desenho le do $.state (types/index.d.ts), que sobrevive a hot reload e redesenha sozinho.

import { atom, read, update } from 'claude-code'

const PANE = 'faz-painel'
const FERRAMENTA = 'faz_marco'
const MARCO = 'mcp__macrex-skills__faz_marco'
const MARCOS = ['inicio', 'fase', 'tickets', 'ticket', 'portao', 'fechamento']
const FASES = ['spec', 'tickets', 'implement', 'revisao', 'correcoes', 'qualidade', 'fechamento']
const PORTOES = ['verde', 'vermelho']

const ALVOS = ['file_path', 'command', 'pattern', 'skill', 'description']

const LEVA = atom({ plugin: 'macrex-skills', key: 'leva' }, null)
// O Agora: as ultimas 5 chamadas de ferramenta, so na sessao (nao vai ao $.store).
const AGORA = atom({ plugin: 'macrex-skills', key: 'agora' }, [])

const chave = cwd => `leva:${cwd}`

// Aplica um marco ao estado; devolve o estado novo ou { erro } sem tocar no antigo.
function aplicar(leva, m) {
  if (m.marco === 'inicio') {
    if (typeof m.documento !== 'string' || !m.documento.trim()) return { erro: 'inicio exige documento (titulo da nota ou caminho)' }
    return { documento: m.documento, fase: 'spec', fases: ['spec'], tickets: [], fechada: false }
  }
  if (!MARCOS.includes(m.marco)) return { erro: `marco desconhecido: ${m.marco}; use ${MARCOS.join(', ')}` }
  if (!leva) return { erro: 'nenhuma leva neste workspace: registre o marco inicio antes' }
  const fase = f => ({ ...leva, fase: f, fases: leva.fases.includes(f) ? leva.fases : [...leva.fases, f] })
  const achar = id => leva.tickets.find(t => t.id === String(id))
  switch (m.marco) {
    case 'fase':
      return FASES.includes(m.fase) ? fase(m.fase) : { erro: `fase fora do vocabulario: ${m.fase}; use ${FASES.join(', ')}` }
    case 'tickets':
      if (!Array.isArray(m.tickets) || !m.tickets.every(t => t && t.id != null && typeof t.titulo === 'string')) {
        return { erro: 'tickets exige uma lista de { id, titulo }' }
      }
      return { ...leva, tickets: m.tickets.map(t => ({ id: String(t.id), titulo: t.titulo, estado: 'pendente' })) }
    case 'ticket':
      if (!achar(m.ticket)) return { erro: `ticket inexistente: ${m.ticket}` }
      return { ...leva, tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, estado: 'em-curso' } : t)) }
    case 'portao': {
      if (!achar(m.ticket)) return { erro: `ticket inexistente: ${m.ticket}` }
      if (!PORTOES.includes(m.portao)) return { erro: `portao deve ser verde ou vermelho, veio ${m.portao}` }
      if (m.reparos != null && ![0, 1, 2].includes(m.reparos)) return { erro: `reparos vai de 0 a 2, veio ${m.reparos}` }
      if (m.testes != null && String(m.testes).length > 20) return { erro: `testes cabe em 20 caracteres, veio ${m.testes}` }
      const portao = { estado: m.portao, reparos: m.reparos, testes: m.testes == null ? undefined : String(m.testes) }
      return { ...leva, tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, ...portao } : t)) }
    }
    case 'fechamento':
      return { ...fase('fechamento'), fechada: true }
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const salva = await $.store.get(chave(e.cwd))
    if (salva) await update($, LEVA, () => salva)
    await $.command.register({
      name: PANE,
      description: 'Abre ou fecha o painel da leva ao lado da conversa',
      immediate: true,
    })
    await $.tool.register({
      name: FERRAMENTA,
      description:
        'Registra um marco da leva (/faz leva) no painel da leva do Claude Code. Chame em: inicio (com documento), ' +
        'cada fase, tickets publicados, inicio de cada ticket, resultado de cada portao e fechamento. ' +
        'Erro aqui nunca para a leva.',
      inputSchema: {
        type: 'object',
        properties: {
          marco: { type: 'string', enum: MARCOS },
          documento: { type: 'string', description: 'inicio: o documento da leva (titulo da nota ou caminho)' },
          fase: { type: 'string', enum: FASES },
          tickets: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'string' }, titulo: { type: 'string' } }, required: ['id', 'titulo'] },
          },
          ticket: { type: 'string', description: 'ticket e portao: o id do ticket' },
          portao: { type: 'string', enum: PORTOES },
          reparos: { type: 'integer', minimum: 0, maximum: 2 },
          testes: { type: 'string', maxLength: 20, description: 'portao: contagem de testes, ex. 3/4' },
        },
        required: ['marco'],
      },
    })
    return next(e)
  })

  on('tool.call', { tool: MARCO }, async ($, e) => {
    const leva = aplicar(await read($, LEVA), e)
    // deny e a forma de um hook devolver erro de ferramenta: o modelo recebe o texto como erro
    if (leva.erro) return { deny: leva.erro }
    await $.store.set(chave(await $.session.cwd()), leva)
    await update($, LEVA, () => leva)
    if (e.marco === 'inicio') {
      await update($, AGORA, () => [])
      $.ui.toast('Leva registrada: /faz-painel mostra o andamento')
    }
    return { result: `marco registrado; fase ${leva.fase}` }
  })

  on('tool.call', async ($, e, next) => {
    const leva = e.tool === MARCO ? null : await read($, LEVA)
    if (leva && !leva.fechada) {
      const alvo = ALVOS.map(campo => e[campo]).find(v => typeof v === 'string' && v.trim()) ?? ''
      await update($, AGORA, agora => [...agora, `${e.tool} ${alvo.replace(/\s+/g, ' ').slice(0, 60)}`.trim()].slice(-5))
    }
    return next(e)
  })

  on('command.run', { command: PANE }, async $ => {
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'Painel da leva fechado.' }
    }
    await $.ui.open({ id: PANE, title: 'Leva', closeOnEscape: true })
    return { text: 'Painel da leva aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const leva = await read($, LEVA)
    if (!leva) return h(Box, { flexDirection: 'column' }, h(Text, { dimColor: true }, 'nenhuma leva neste workspace'))
    const marca = { pendente: '·', 'em-curso': '▸', verde: '✓', vermelho: '✗' }
    const linha = t => {
      const extra = [t.reparos != null && `reparos: ${t.reparos}`, t.testes && `testes: ${t.testes}`].filter(Boolean).join(', ')
      return `${marca[t.estado]} ${t.id} ${t.titulo} — ${t.estado === 'em-curso' ? 'em curso' : t.estado}${extra ? ` (${extra})` : ''}`
    }
    return h(
      Box,
      { flexDirection: 'column' },
      h(Text, { bold: true }, leva.documento),
      h(
        Box,
        { flexWrap: 'wrap' },
        ...FASES.map(f =>
          h(Text, { bold: f === leva.fase, dimColor: f !== leva.fase && !leva.fases.includes(f) }, `${f} `),
        ),
      ),
      ...leva.tickets.map(t =>
        h(Text, { color: t.estado === 'verde' ? 'green' : t.estado === 'vermelho' ? 'red' : undefined }, linha(t)),
      ),
      leva.fechada
        ? h(Text, { dimColor: true }, 'leva fechada, falta o /cpv')
        : h(Box, { flexDirection: 'column', marginTop: 1 }, h(Text, { bold: true }, 'Agora'), ...(await read($, AGORA)).map(a => h(Text, { dimColor: true }, a))),
    )
  })
}
