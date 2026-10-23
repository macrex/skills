// A aba Tickets: a linha do ticket, como na aba Geral, e embaixo as notas do que ele entregou.

import type { Leva, LevaItem, LevaTicket } from '../../../types/index.d.ts'
import { LARANJA, TEXTO, APAGADO, VERDE, VERMELHO, AMARELO } from '../dominio/vocabulario.ts'
import { verdes, dolares, duracao, prevista, daMaquina } from '../dominio/formato.ts'
import type { ComPortao, Primitivas, Parte } from './primitivas.ts'

// a previsao contra o real, por extenso: o previsto, o real e quanto do previsto ele ja gastou,
// verde ate 100% e amarelo acima; sem o real, so o previsto
export function contraPrevisto(previsao: number, real: number | undefined): Parte[] {
  const pct = real == null ? null : Math.round((real / (previsao * 60000)) * 100)
  const doPrevisto: Parte[] = pct == null ? [] : [['   real ', { color: APAGADO }], [duracao(real!), { bold: true }], ['   '], [`${pct}% do previsto`, { color: pct <= 100 ? VERDE : AMARELO, bold: true }]]
  return [['previsto ', { color: APAGADO }], [prevista(previsao), { bold: true }], ...doPrevisto]
}

// ticket e item: o portao (verde ✓, vermelho ✗, em curso ◐), a previsao do ticket (≈) e o tempo,
// alinhados a direita
export function linhasDePortao({ Text, linhaLarga, largura }: Primitivas, agora: number, esperas?: [number, number][]) {
  // o tempo do item nao conta o que ele passou esperando, nem a espera aberta; o de todos, a espera
  // pelo usuario (esperas da leva)
  // ponytail: o item parado esperando no mesmo instante em que o usuario e esperado desconta os dois
  const esperou = (t: ComPortao) => (t.esperaMs ?? 0) + (t.esperaDesde != null ? agora - t.esperaDesde : 0)
  const realDe = (t: ComPortao) => (t.inicioEm != null && (t.fimEm != null || t.estado === 'em-curso') ? daMaquina(t.inicioEm, t.fimEm ?? agora, esperas)! - esperou(t) : undefined)
  const tempoDe = (t: ComPortao) => {
    const real = realDe(t)
    return real == null ? '' : duracao(real)
  }
  // a linha das partes do contraPrevisto
  const previsto = (partes: Parte[]) => h(Text, { color: TEXTO }, ...partes.map(([t, p]) => h(Text, p ?? {}, t)))
  const portao = (t: ComPortao, rotulo: string): [string, string] => {
    if (t.estado === 'pendente') return ['pendente', APAGADO]
    if (t.estado === 'em-curso' && t.esperaDesde != null) return [`${t.detalhe ? `${t.detalhe} ` : ''}aguardando ◌`, AMARELO]
    if (t.estado === 'em-curso') return [`${t.detalhe ? `${t.detalhe} ` : ''}em curso ◐`, LARANJA]
    const reparos = t.reparos ? ` · ${t.reparos} ${t.reparos === 1 ? 'reparo' : 'reparos'}` : ''
    return [`${rotulo}${t.estado === 'verde' ? '✓' : '✗'}${reparos}`, t.estado === 'verde' ? VERDE : VERMELHO]
  }
  const linha = (t: ComPortao, esquerda: Parte[], rotulo: string, previsao?: number) => {
    const [texto, cor] = portao(t, rotulo)
    const custo: Parte[] = t.custo != null ? [[dolares(t.custo), { color: APAGADO }], ['  ']] : []
    const previsto: Parte[] = previsao != null ? [[`≈${prevista(previsao)}`, { color: APAGADO }], ['  ']] : []
    return linhaLarga(largura, esquerda, [[texto, { color: cor }], ['  '], ...custo, ...previsto, [tempoDe(t).padStart(6), { color: APAGADO }]])
  }
  const ticket = (t: LevaTicket) => linha(t, [[t.id.padEnd(Math.max(4, t.id.length + 2)), { color: APAGADO }], [t.titulo]], `portão ${t.testes ? `${t.testes} ` : ''}`, t.previsao)
  const item = (i: LevaItem & Pick<ComPortao, 'custo'>) => linha(i, [[i.titulo]], i.detalhe ? `${i.detalhe} ` : '')
  return { ticket, item, previsto, realDe }
}

export function abaTickets(kit: Primitivas, { leva, agora }: { leva: Leva | null; agora: number }) {
  const { Box, Text, tela, cartao, apagado } = kit
  if (!leva) return tela('Nenhuma leva neste workspace', 'verdes', '—', cartao(null, apagado('os tickets aparecem quando o to-tickets publica')))
  const { ticket, item, previsto, realDe } = linhasDePortao(kit, agora, leva.esperas)
  const comNotas = (t: LevaTicket, i: number) =>
    h(
      Box,
      { flexDirection: 'column', marginTop: i > 0 ? 1 : 0 },
      ticket(t),
      t.previsao != null && h(Box, { paddingLeft: 4 }, previsto(contraPrevisto(t.previsao, realDe(t)))),
      h(Box, { paddingLeft: 4 }, h(Text, { color: t.notas ? TEXTO : APAGADO }, t.notas ?? 'sem notas ainda')),
    )
  return tela(
    leva.documento,
    'verdes',
    `${verdes(leva)}/${leva.tickets.length}`,
    cartao(
      null,
      ...(leva.tickets.length > 0 ? leva.tickets.map(comNotas) : [apagado('nenhum ticket publicado ainda')]),
      // a Conciliacao de cada onda, embaixo dos tickets que ela juntou
      ...(leva.itens ?? []).filter(i => i.fase === 'implement').map(i => h(Box, { marginTop: 1 }, item(i))),
    ),
  )
}
