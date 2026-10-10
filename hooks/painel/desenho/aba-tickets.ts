// A aba Tickets: a linha do ticket, como na aba Geral, e embaixo as notas do que ele entregou.

import type { Leva, LevaItem, LevaTicket } from '../../../types/index.d.ts'
import { LARANJA, TEXTO, APAGADO, VERDE, VERMELHO } from '../dominio/vocabulario.ts'
import { verdes, dolares, duracao } from '../dominio/formato.ts'
import type { ComPortao, Primitivas, Parte } from './primitivas.ts'

// ticket e item: o portao (verde ✓, vermelho ✗, em curso ◐) e o tempo, alinhados a direita
export function linhasDePortao({ linhaLarga, largura }: Primitivas, agora: number) {
  const tempoDe = (t: ComPortao) => (t.inicioEm != null && (t.fimEm != null || t.estado === 'em-curso') ? duracao((t.fimEm ?? agora) - t.inicioEm) : '')
  const portao = (t: ComPortao, rotulo: string): [string, string] => {
    if (t.estado === 'pendente') return ['pendente', APAGADO]
    if (t.estado === 'em-curso') return [`${t.detalhe ? `${t.detalhe} ` : ''}em curso ◐`, LARANJA]
    const reparos = t.reparos ? ` · ${t.reparos} ${t.reparos === 1 ? 'reparo' : 'reparos'}` : ''
    return [`${rotulo}${t.estado === 'verde' ? '✓' : '✗'}${reparos}`, t.estado === 'verde' ? VERDE : VERMELHO]
  }
  const linha = (t: ComPortao, esquerda: Parte[], rotulo: string) => {
    const [texto, cor] = portao(t, rotulo)
    const custo: Parte[] = t.custo != null ? [[dolares(t.custo), { color: APAGADO }], ['  ']] : []
    return linhaLarga(largura, esquerda, [[texto, { color: cor }], ['  '], ...custo, [tempoDe(t).padStart(6), { color: APAGADO }]])
  }
  const ticket = (t: LevaTicket) => linha(t, [[t.id.padEnd(Math.max(4, t.id.length + 2)), { color: APAGADO }], [t.titulo]], `portão ${t.testes ? `${t.testes} ` : ''}`)
  const item = (i: LevaItem) => linha(i, [[i.titulo]], i.detalhe ? `${i.detalhe} ` : '')
  return { ticket, item }
}

export function abaTickets(kit: Primitivas, { leva, agora }: { leva: Leva | null; agora: number }) {
  const { Box, Text, tela, cartao, apagado } = kit
  if (!leva) return tela('Nenhuma leva neste workspace', 'verdes', '—', cartao(null, apagado('os tickets aparecem quando o to-tickets publica')))
  const { ticket } = linhasDePortao(kit, agora)
  const comNotas = (t: LevaTicket, i: number) =>
    h(
      Box,
      { flexDirection: 'column', marginTop: i > 0 ? 1 : 0 },
      ticket(t),
      h(Box, { paddingLeft: 4 }, h(Text, { color: t.notas ? TEXTO : APAGADO }, t.notas ?? 'sem notas ainda')),
    )
  return tela(
    leva.documento,
    'verdes',
    `${verdes(leva)}/${leva.tickets.length}`,
    cartao(null, ...(leva.tickets.length > 0 ? leva.tickets.map(comNotas) : [apagado('nenhum ticket publicado ainda')])),
  )
}
