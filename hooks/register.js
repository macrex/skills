// Painel da leva: o mod do Claude Code que desenha, num pane ao lado da conversa, o estado da
// leva do workspace. Carregado por "modules" no hooks/hooks.json; os settings hooks seguem la.
// Sem JSX (o arquivo e .js): as arvores saem do `h` global.
//
// A leva grava o estado chamando a ferramenta faz_marco (skills/faz/references/harness.md diz
// quando); o estado fica no $.store do plugin, um por workspace, e sobrevive a reinicio. O
// desenho le do $.state (types/index.d.ts), que sobrevive a hot reload e redesenha sozinho.
// O tempo sai da hora de cada marco; os agentes e workflows, dos hooks do Agent, do Workflow,
// do fim de turno do sub-agente e da notificacao de fim de tarefa.

import { atom, read, update } from 'claude-code'

const PANE = 'faz-painel'
const FERRAMENTA = 'faz_marco'
const MARCO = 'mcp__macrex-skills__faz_marco'
const MARCOS = ['inicio', 'fase', 'tickets', 'ticket', 'portao', 'fechamento']
const FASES = ['spec', 'tickets', 'implement', 'revisao', 'correcoes', 'qualidade', 'fechamento']
const PORTOES = ['verde', 'vermelho']
const FIM_DE_TAREFA = { completed: 'concluido', failed: 'falhou', killed: 'parado', stopped: 'parado' }
const MARCA = { pendente: '·', 'em-curso': '▸', verde: '✓', vermelho: '✗', rodando: '▸', concluido: '✓', falhou: '✗', parado: '■' }

const LEVA = atom({ plugin: 'macrex-skills', key: 'leva' }, null)
// Os agentes e workflows da leva, so na sessao (nao vao ao $.store).
const AGENTES = atom({ plugin: 'macrex-skills', key: 'agentes' }, [])

const chave = cwd => `leva:${cwd}`
const dois = n => String(n).padStart(2, '0')

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
    return { documento: m.documento, fase: 'spec', fases: ['spec'], entradas: { spec: agora }, inicio: agora, tickets: [], fechada: false }
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
      return FASES.includes(m.fase) ? fase(m.fase) : { erro: `fase fora do vocabulario: ${m.fase}; use ${FASES.join(', ')}` }
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
      const portao = { estado: m.portao, reparos: m.reparos, testes: m.testes == null ? undefined : String(m.testes), fimEm: agora }
      return { ...leva, tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, ...portao } : t)) }
    }
    case 'fechamento':
      return { ...fase('fechamento'), fechada: true, fim: agora }
  }
}

// Muda os agentes que `qual` escolhe com o que `como` devolve.
const mexer = ($, qual, como) => update($, AGENTES, lista => lista.map(a => (qual(a) ? { ...a, ...como(a) } : a)))

const ativa = async $ => {
  const leva = await read($, LEVA)
  return Boolean(leva && !leva.fechada)
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const salva = await $.store.get(chave(e.cwd))
    if (salva) await update($, LEVA, () => salva)
    // o tempo da fase e dos agentes em curso anda sozinho no pane
    $.clock.every(10000, () => void ativa($).then(sim => sim && $.ui.invalidate('ui.render')))
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
    const leva = aplicar(await read($, LEVA), e, await $.clock.now())
    // deny e a forma de um hook devolver erro de ferramenta: o modelo recebe o texto como erro
    if (leva.erro) return { deny: leva.erro }
    await $.store.set(chave(await $.session.cwd()), leva)
    await update($, LEVA, () => leva)
    if (e.marco === 'inicio') {
      await update($, AGENTES, () => [])
      $.ui.toast('Leva registrada: /faz-painel mostra o andamento')
    }
    return { result: `marco registrado; fase ${leva.fase}` }
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
    const agora = await $.clock.now()
    const ate = leva.fim ?? agora
    // uma fase dura da sua entrada ate a entrada seguinte, ou ate agora (o fim, se fechada)
    const entradas = leva.entradas ?? {}
    const tempoDaFase = f => {
      const desde = entradas[f]
      if (desde == null || f === 'fechamento') return ''
      return ` ${duracao(Math.min(ate, ...Object.values(entradas).filter(t => t > desde)) - desde)}`
    }
    const linha = t => {
      const tempo = t.inicioEm != null && (t.fimEm != null || t.estado === 'em-curso') ? duracao((t.fimEm ?? agora) - t.inicioEm) : ''
      const extra = [t.reparos != null && `reparos: ${t.reparos}`, t.testes && `testes: ${t.testes}`, tempo].filter(Boolean).join(', ')
      return `${MARCA[t.estado]} ${t.id} ${t.titulo} — ${t.estado === 'em-curso' ? 'em curso' : t.estado}${extra ? ` (${extra})` : ''}`
    }
    const agentes = await read($, AGENTES)
    const visiveis = [...agentes.filter(a => a.estado === 'rodando'), ...agentes.filter(a => a.estado !== 'rodando').slice(-5)]
    const agente = a =>
      [`${MARCA[a.estado]} ${a.nome}`, a.modelo, a.estado, duracao(a.duracao ?? agora - a.inicio)].filter(Boolean).join(' · ')
    return h(
      Box,
      { flexDirection: 'column' },
      h(Text, { bold: true }, leva.documento),
      leva.inicio != null && h(Text, { dimColor: true }, `total ${duracao(ate - leva.inicio)}`),
      h(
        Box,
        { flexWrap: 'wrap' },
        ...FASES.map(f =>
          h(Text, { bold: f === leva.fase, dimColor: f !== leva.fase && !leva.fases.includes(f) }, `${f}${tempoDaFase(f)} `),
        ),
      ),
      ...leva.tickets.map(t =>
        h(Text, { color: t.estado === 'verde' ? 'green' : t.estado === 'vermelho' ? 'red' : undefined }, linha(t)),
      ),
      visiveis.length > 0 &&
        h(
          Box,
          { flexDirection: 'column', marginTop: 1 },
          h(Text, { bold: true }, 'Agentes'),
          ...visiveis.map(a => h(Text, { dimColor: a.estado !== 'rodando' }, agente(a))),
        ),
      leva.fechada && h(Text, { dimColor: true }, 'leva fechada, falta o /cpv'),
    )
  })
}
