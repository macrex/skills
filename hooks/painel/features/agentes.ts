// Os agentes e workflows da leva: o Agent e o Workflow que os abrem, o teammate ocioso e a
// notificacao de tarefa que os fecham. O fim de turno e o Parar, que tambem os fecham, moram no
// nucleo, com a permissao e o pane.

import { atom, read, update } from 'claude-code'
import type { BuiltinToolResults, EngineInterface, On } from 'claude-code'
import type { LevaAgente } from '../../../types/index.d.ts'
import { FIM_DE_TAREFA } from '../dominio/vocabulario.ts'
import { vivo } from '../dominio/alertas.ts'

const LEVA = atom({ plugin: 'macrex-skills', key: 'leva' }, null)
// Os agentes e workflows da leva, so na sessao (nao vao ao $.store).
const AGENTES = atom({ plugin: 'macrex-skills', key: 'agentes' }, [])

// o mexer e o ativa sao copias dos do nucleo: o validate nao segue o $ por um import
const mexer = ($: EngineInterface, qual: (a: LevaAgente) => boolean, como: (a: LevaAgente) => Partial<LevaAgente>) => update($, AGENTES, lista => lista.map(a => (qual(a) ? { ...a, ...como(a) } : a)))

const ativa = async ($: EngineInterface) => {
  const leva = await read($, LEVA)
  return Boolean(leva && !leva.fechada)
}

// o Agent e o Workflow abrem os agentes e workflows
export function registrarAgentes(on: On) {
  // os agentes e workflows entram com ou sem leva, para o alerta; o aberto fora da leva nao vai ao
  // cartao Sub-agentes dela
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const id = e.tool_use_id
    const inicio = await $.clock.now()
    const nome = e.name || e.description || e.subagent_type || 'agente'
    const foraDaLeva = !(await ativa($))
    await update($, AGENTES, (lista): LevaAgente[] => [...lista, { id, tipo: 'agente', nome, modelo: e.model ?? '', estado: 'rodando', inicio, foraDaLeva }])
    const r = await next(e)
    const fim = await $.clock.now()
    // o result tipado e o do respondido; o do erro e unknown, e o if abaixo o separa antes; o
    // remote_launched nao traz o agentId
    const feito = r.result as (BuiltinToolResults['Agent'] & { agentId?: string }) | undefined
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
    const id = e.tool_use_id
    const inicio = await $.clock.now()
    const foraDaLeva = !(await ativa($))
    await update($, AGENTES, (lista): LevaAgente[] => [...lista, { id, tipo: 'workflow', nome: 'workflow', modelo: '', estado: 'rodando', inicio, foraDaLeva }])
    const r = await next(e)
    // o result tipado e o do respondido; o do erro e unknown, e a condicao abaixo o separa antes
    const feito = r.result as BuiltinToolResults['Workflow'] | undefined
    await mexer($, a => a.id === id, () =>
      r.deny !== undefined || r.isError || feito?.error
        ? { estado: 'falhou', duracao: 0 }
        : { nome: `workflow ${feito?.workflowName ?? ''}`.trim(), taskId: feito?.taskId },
    )
    return r
  })
}

export function registrarTeammate(on: On) {
  // um teammate nao termina: fica ocioso quando entrega, e e ai que o trabalho dele acabou
  on('classic.TeammateIdle', async ($, e, next) => {
    const fim = await $.clock.now()
    await mexer($, a => a.tipo === 'agente' && a.nome === e.teammate_name && vivo(a), a => ({
      estado: 'concluido',
      duracao: fim - a.inicio,
    }))
    return next(e)
  })
}

export function registrarNotificacao(on: On) {
  // fim de um workflow (ou agente) em background: a notificacao da tarefa chega como mensagem
  on('session.append', async ($, e, next) => {
    const blocos = e.message.content
    const texto = typeof blocos === 'string' ? blocos : (blocos ?? []).map(b => b.text ?? '').join('\n')
    const aviso = /<task-notification>[\s\S]*?<task-id>([^<]+)<\/task-id>[\s\S]*?<status>([^<]+)<\/status>/.exec(texto)
    if (aviso) {
      const [, tarefa, status] = aviso
      const fim = await $.clock.now()
      await mexer($, a => (a.taskId === tarefa || a.agentId === tarefa) && vivo(a), a => ({
        estado: FIM_DE_TAREFA[status!] ?? 'concluido',
        duracao: fim - a.inicio,
      }))
    }
    return next(e)
  })
}
