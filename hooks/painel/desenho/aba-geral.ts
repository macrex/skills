// A aba Geral: o grill na tela ou a leva, com a grade das fases, os tickets, os itens, os
// sub-agentes e o historico.

import type { Grill, Leva, LevaAgente, LevaHistorico } from '../../../types/index.d.ts'
import { LARANJA, FASES, FASES_COM_ITENS, CHIP, TEXTO, APAGADO, VERDE, AZUL, AMARELO, ROTULO, DO_AGENTE } from '../dominio/vocabulario.ts'
import { verdes, dolares, duracao } from '../dominio/formato.ts'
import { semSkill } from '../dominio/marcos.ts'
import { vivo, semSaida, textoSemSaida, idDeParar } from '../dominio/alertas.ts'
import type { Acoes, Desenho, Primitivas, Parte } from './primitivas.ts'
import { linhasDePortao } from './aba-tickets.ts'
import { daPaginaDoGrill } from './aba-grill.ts'

// a grade das fases, com o grill na frente: tres chips por linha onde cabem, senao dois, senao
// um. O chip e um tom acima do cartao, com o nome a esquerda e, a direita, o tempo com ◐ na
// fase em curso e com ✓ na que passou, ou — na que falta
function daGeral({ Box, Text, Button, cartao, negrito, linhaLarga, largura }: Primitivas, agora: number, acoes: Acoes) {
  const porLinha = largura >= 68 ? 3 : largura >= 37 ? 2 : 1
  const larguraDoChip = Math.floor((largura - (porLinha - 1)) / porLinha)
  const estadoDoChip = (tempo: string, atual: boolean, passou: boolean): [string, string] => (atual ? [`${tempo} ◐`, LARANJA] : passou ? [`${tempo} ✓`, VERDE] : ['—', APAGADO])
  const chip = (nome: Parte[], tempo: string, atual: boolean, passou: boolean) => {
    const [estado, cor] = estadoDoChip(tempo, atual, passou)
    return h(Box, { backgroundColor: CHIP, paddingX: 1, width: larguraDoChip }, linhaLarga(larguraDoChip - 2, nome, [[estado, { color: cor }]], { bold: atual, color: passou ? TEXTO : APAGADO }))
  }
  // o grill e a fase antes do spec, em curso ate o entendimento; o nome dele e um botao que leva
  // a aba Grill, onde estao as perguntas
  const chipDoGrill = (g: Grill | null) => {
    const [estado, cor] = estadoDoChip(g ? duracao((g.fim ?? agora) - g.inicio) : '', Boolean(g && g.documento == null), Boolean(g))
    return h(
      Box,
      { backgroundColor: CHIP, paddingX: 1, width: larguraDoChip, justifyContent: 'space-between' },
      h(Button, { key: 'fase:grill', label: 'grill', plain: true, onPress: () => acoes.trocarAba('grill') }),
      h(Text, { color: cor }, estado),
    )
  }
  // so as fases com rotulo: o ROTULO[f]! abaixo vale
  const fases = FASES.filter(f => ROTULO[f])
  const grade = (chips: Desenho[]) =>
    cartao('Fases', h(Box, { flexDirection: 'column', gap: 1 }, ...Array.from({ length: Math.ceil(chips.length / porLinha) }, (_, i) => h(Box, { gap: 1 }, ...chips.slice(i * porLinha, (i + 1) * porLinha)))))
  // o titulo da aba Geral com o botao Limpar ao lado, o unico que limpa o painel
  const comLimpar = (titulo: string) => h(Box, { gap: 2 }, negrito(titulo), h(Button, { key: 'painel:limpar', label: 'Limpar', dimColor: true, onPress: () => acoes.limpar() }))
  return { chip, chipDoGrill, fases, grade, comLimpar }
}

// o grill na tela e sempre mais novo que a leva: o inicio de uma leva o tira de la
export function geralDoGrill(kit: Primitivas, { grill, agora }: { grill: Grill; agora: number }, acoes: Acoes) {
  const { chip, chipDoGrill, fases, grade, comLimpar } = daGeral(kit, agora, acoes)
  const { andamento, cartaoDaTela } = daPaginaDoGrill(kit, agora, acoes)
  return kit.tela(comLimpar(`Grill · ${grill.pedido}`), ...andamento(grill), cartaoDaTela(grill), grade([chipDoGrill(grill), ...fases.map(f => chip([[ROTULO[f]!]], '', false, false))]))
}

export function geralDaLeva(
  kit: Primitivas,
  dados: { leva: Leva; ultimoGrill: Grill | null; skills: string[]; agentes: LevaAgente[]; historico: LevaHistorico[]; agora: number },
  acoes: Acoes,
) {
  const { leva, ultimoGrill, skills, historico, agora } = dados
  const { Box, Text, Button, tela, cartao, apagado, linhaLarga, largura } = kit
  const { chip, chipDoGrill, fases, grade, comLimpar } = daGeral(kit, agora, acoes)
  const { ticket, item } = linhasDePortao(kit, agora)
  const ate = leva.fim ?? agora
  // uma fase dura da sua entrada ate a entrada seguinte, ou ate agora (o fim, se fechada)
  const entradas = leva.entradas ?? {}
  const tempoDaFase = (f: string) => {
    const desde = entradas[f]
    if (desde == null) return ''
    return duracao(Math.min(ate, ...Object.values(entradas).filter(t => t > desde)) - desde)
  }
  const chipDaFase = (f: string) => {
    const passou = leva.fases.includes(f)
    const falta = passou && semSkill(f, skills)
    return chip([[ROTULO[f]!], ...(falta ? [[' !', { color: AMARELO, bold: true }] as Parte] : [])], tempoDaFase(f), f === leva.fase && !leva.fechada, passou)
  }
  // a leva que nasceu do grill guardado (o mesmo documento) mostra a fase dele
  const doGrill = ultimoGrill?.documento === leva.documento ? ultimoGrill : null
  const agentes = dados.agentes.filter(a => !a.foraDaLeva)
  const visiveis = [...agentes.filter(vivo), ...agentes.filter(a => !vivo(a)).slice(-5)]
  const agente = (a: LevaAgente) => {
    const [estado, cor] = DO_AGENTE[a.estado]
    const linhaDoAgente = linhaLarga(largura, [[a.nome]], [
      ...(a.modelo ? ([[a.modelo, { color: AZUL }], ['  ']] as Parte[]) : []),
      [estado.padEnd(10), { color: cor }],
      ['  '],
      [duracao(a.duracao ?? agora - a.inicio).padStart(6), { color: APAGADO }],
    ])
    if (!vivo(a)) return linhaDoAgente
    // o vivo ganha embaixo o Parar e, o agente rodando sem ferramenta ha mais de 2 min, ha quanto
    // tempo; o workflow nao: as ferramentas dele trazem o agentId dos sub-agentes de dentro
    const quieto = agora - (a.atividade ?? a.inicio)
    return h(
      Box,
      { flexDirection: 'column' },
      linhaDoAgente,
      h(
        Box,
        { gap: 2, paddingLeft: 2 },
        h(Button, { key: `agente:parar:${idDeParar(a)}`, label: 'Parar', dimColor: true, onPress: () => acoes.parar(a) }),
        semSaida(a, quieto) && h(Text, { color: AMARELO }, textoSemSaida(quieto)),
      ),
    )
  }
  const passada = (l: LevaHistorico) => {
    const reparos = l.tickets.reduce((soma, t) => soma + (t.reparos ?? 0), 0)
    const total = l.inicio != null && l.fim != null && `total ${duracao(l.fim - l.inicio)}`
    return [l.documento, total, l.custo != null && dolares(l.custo), l.modo,`${verdes(l)}/${l.tickets.length} verdes`, `reparos ${reparos}`, ...(l.modelos ?? [])].filter(Boolean).join(' · ')
  }
  return tela(
    comLimpar(`Leva · ${leva.documento}`),
    'total',
    leva.inicio != null ? duracao(ate - leva.inicio) : '—',
    leva.fechada && h(Text, { color: leva.cpv == null ? AMARELO : VERDE }, `leva fechada, ${leva.cpv == null ? 'falta o /cpv' : '/cpv rodou'}`),
    grade([chipDoGrill(doGrill), ...fases.map(chipDaFase)]),
    leva.tickets.length > 0 && cartao('Tickets', ...leva.tickets.map(ticket)),
    ...Object.entries(FASES_COM_ITENS).map(([f, titulo]) => {
      const itens = (leva.itens ?? []).filter(i => i.fase === f)
      return itens.length > 0 && cartao(titulo, ...itens.map(item))
    }),
    visiveis.length > 0 && cartao('Sub-agentes', ...visiveis.map(agente)),
    // o historico so aparece sob a leva fechada: com ela aberta, o espaco e do andamento
    leva.fechada && historico.length > 0 && cartao('Histórico', ...historico.map(l => apagado(passada(l)))),
  )
}
