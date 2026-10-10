// Os alertas e o estado dos agentes da leva, derivados do estado, sem efeito.

import type { Leva, LevaAgente } from '../../../types/index.d.ts'
import { VIVOS, SEM_SAIDA } from './vocabulario.ts'

export const vivo = (a: LevaAgente) => VIVOS.includes(a.estado)
// o agente rodando sem ferramenta ha mais de SEM_SAIDA; o workflow nao: as ferramentas dele trazem
// o agentId dos sub-agentes de dentro
export const semSaida = (a: LevaAgente, quieto: number) => a.tipo === 'agente' && a.estado === 'rodando' && quieto > SEM_SAIDA
export const textoSemSaida = (quieto: number) => `sem saída há ${Math.floor(quieto / 60000)} min`
export const idDeParar = (a: LevaAgente) => a.taskId ?? a.agentId ?? a.nome

// Os alertas de agora, o que faz a sessao esperar pelo usuario, derivados do estado: cada um com
// a chave (o toast sai uma vez por chave nova), o texto da faixa e se e vermelho. O alerta some
// sozinho quando a causa deixa de valer: o ticket que recomeca nao esta mais vermelho.
export function alertas({ leva, agentes, permissao, agora }: { leva: Leva | null; agentes: LevaAgente[]; permissao: { ferramenta: string; agentId?: string } | null; agora: number }) {
  const lista: { chave: string; texto: string; vermelho?: boolean }[] = []
  if (leva && !leva.fechada) {
    for (const t of leva.tickets) if (t.estado === 'vermelho') lista.push({ chave: `portao:${t.id}`, texto: `ticket ${t.id} com portão vermelho`, vermelho: true })
  }
  if (permissao) lista.push({ chave: 'permissao', texto: `permissão pendente: ${permissao.ferramenta}` })
  for (const a of agentes) {
    if (a.estado === 'aguardando') lista.push({ chave: `aguardando:${a.id}`, texto: `${a.nome} aguardando` })
    const quieto = agora - (a.atividade ?? a.inicio)
    if (semSaida(a, quieto)) lista.push({ chave: `semsaida:${a.id}`, texto: `${a.nome} ${textoSemSaida(quieto)}` })
  }
  return lista
}
