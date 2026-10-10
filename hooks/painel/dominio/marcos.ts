// O reducer dos marcos da leva e do grill, puro: o estado novo ou a recusa, sem tocar no antigo.

import type { Grill, Leva, LevaItem, LevaTicket } from '../../../types/index.d.ts'
import { MARCOS, FASES, PORTOES, MODOS, FASES_COM_ITENS, SKILL_DA_FASE, CONTROLE } from './vocabulario.ts'
import type { Marco } from './vocabulario.ts'
import { comCusto } from './formato.ts'

// a recusa de um marco; o estado aplicado a contrasta pelo erro ausente. Toda recusa e uma frase
// (tem espaco), nunca vazia: e o que deixa o if (x.erro) separar uma do outro
type Erro = { erro: `${string} ${string}` }
type Aplicado<T> = T & { erro?: undefined }

export const novoId = (agora: number) => `${Number(agora).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
// a skill da fase que esta sessao ainda nao invocou, ou undefined
export const semSkill = (fase: string, skills: string[]) => (skills.includes(SKILL_DA_FASE[fase] as string) ? undefined : SKILL_DA_FASE[fase])
// o documento do inicio sem o "até o fim" que fecha a abertura da linha da leva (`leva <documento>
// até o fim.`): colado nele, o documento nao casa com o do grill, e a leva perde o tempo dele
const doInicio = (documento: string) => documento.replace(/\s+até o fim\.?\s*$/, '')
// um inicio com o mesmo documento sobre a leva aberta e a retomada dela
export const retoma = (leva: Leva | null, m: Marco) => m.marco === 'inicio' && Boolean(leva) && !leva!.fechada && typeof m.documento === 'string' && leva!.documento === doInicio(m.documento)

// O estado da leva que a compactacao pede ao resumo, no teto de ~600 tokens (~4 caracteres cada);
// a nota so dos verdes, cortada, e o que passa do teto sai do fim (os ultimos tickets)
const TETO_DA_COMPACTACAO = 2300
const NOTA_NA_COMPACTACAO = 200
export function levaNaCompactacao(leva: Leva) {
  const nota = (n: string) => (n.length > NOTA_NA_COMPACTACAO ? `${n.slice(0, NOTA_NA_COMPACTACAO - 1)}…` : n)
  const linhas = [
    'Preserve literalmente no resumo este estado da leva do /faz, que segue depois da compactacao:',
    `documento: ${leva.documento}`,
    `fase: ${leva.fase}${leva.modo ? ` · modo: ${leva.modo}` : ''}`,
    `sujos: ${(leva.sujos ?? []).join(', ') || 'nenhum'}`,
    ...leva.tickets.map(t => {
      const reparos = t.reparos ? `, ${t.reparos} ${t.reparos === 1 ? 'reparo' : 'reparos'}` : ''
      return `${t.id} ${t.titulo}: ${t.estado}${reparos}${t.estado === 'verde' && t.notas ? ` — ${nota(t.notas)}` : ''}`
    }),
  ]
  const bloco = linhas.join('\n')
  return bloco.length > TETO_DA_COMPACTACAO ? `${bloco.slice(0, TETO_DA_COMPACTACAO - 1)}…` : bloco
}

// Aplica um marco ao estado na hora `agora`, com o custo da sessao `usd` (no inicio, no
// fechamento e, no modo inline, no ticket e no portao); devolve o estado novo ou { erro } sem
// tocar no antigo. O switch nao tem default: o MARCOS.includes ja recusou o marco de fora dele, e o
// undefined do tipo nunca sai.
export function aplicar(leva: Leva | null, m: Marco, agora: number, usd: number | undefined): Aplicado<Leva> | Erro | undefined {
  if (m.marco === 'inicio') {
    if (typeof m.documento !== 'string' || !m.documento.trim()) return { erro: 'inicio exige documento (titulo da nota ou caminho)' }
    if (m.sujos != null && !(Array.isArray(m.sujos) && m.sujos.every(s => typeof s === 'string'))) {
      return { erro: 'sujos exige uma lista de caminhos (o git status --porcelain de antes da leva)' }
    }
    // a retomada guarda tudo, inclusive os sujos do inicio original e o custo, que o carregar ja
    // rebaseou na sessao nova
    if (retoma(leva, m)) return leva!
    const sujos = m.sujos ?? []
    return { documento: doInicio(m.documento), fase: 'spec', fases: ['spec'], entradas: { spec: agora }, inicio: agora, tickets: [], sujos, fechada: false, custoInicio: usd }
  }
  if (!MARCOS.includes(m.marco)) return { erro: `marco desconhecido: ${m.marco}; use ${MARCOS.join(', ')}` }
  if (!leva) return { erro: 'nenhuma leva neste workspace: registre o marco inicio antes' }
  if (['ticket', 'portao'].includes(m.marco) && !leva.tickets.some(t => t.id === String(m.ticket))) return { erro: `ticket inexistente: ${m.ticket}` }
  // a fase guarda a hora da primeira entrada; voltar a ela nao zera o tempo
  const fase = (f: string) => ({
    ...leva,
    fase: f,
    fases: leva.fases.includes(f) ? leva.fases : [...leva.fases, f],
    entradas: { [f]: agora, ...leva.entradas },
  })
  switch (m.marco) {
    case 'fase':
      // o includes nao estreita: a fase de fora do vocabulario, undefined inclusive, sai na recusa
      if (!FASES.includes(m.fase as string)) return { erro: `fase fora do vocabulario: ${m.fase}; use ${FASES.join(', ')}` }
      if (m.modo == null) return fase(m.fase as string)
      if (m.fase !== 'implement' || !MODOS.includes(m.modo)) return { erro: `modo vai so com fase implement e e um de ${MODOS.join(', ')}` }
      return { ...fase(m.fase), modo: m.modo }
    case 'tickets':
      if (!Array.isArray(m.tickets) || !m.tickets.every(t => t && t.id != null && typeof t.titulo === 'string')) {
        return { erro: 'tickets exige uma lista de { id, titulo }' }
      }
      // a lista reenviada no meio da leva (tickets novos no fim) guarda o andamento dos que ja tem
      return { ...leva, tickets: m.tickets.map(t => ({ ...(leva.tickets.find(v => v.id === String(t.id)) ?? { estado: 'pendente' as const }), id: String(t.id), titulo: t.titulo })) }
    case 'ticket':
      return {
        ...leva,
        // o custo do ticket conta do primeiro inicio, como o tempo, e so no inline
        tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, estado: 'em-curso', inicioEm: t.inicioEm ?? agora, custoInicio: t.custoInicio ?? usd } : t)),
      }
    case 'portao': {
      if (!PORTOES.includes(m.portao as string)) return { erro: `portao deve ser verde ou vermelho, veio ${m.portao}` }
      if (m.reparos != null && ![0, 1, 2].includes(m.reparos)) return { erro: `reparos vai de 0 a 2, veio ${m.reparos}` }
      if (m.testes != null && String(m.testes).length > 20) return { erro: `testes cabe em 20 caracteres, veio ${m.testes}` }
      if (m.notas != null && (typeof m.notas !== 'string' || m.notas.length > 500)) return { erro: 'notas e um texto de ate 500 caracteres' }
      // o PORTOES.includes acima garante o portao
      const portao = { estado: m.portao as 'verde' | 'vermelho', reparos: m.reparos, testes: m.testes == null ? undefined : String(m.testes), notas: m.notas, fimEm: agora }
      const custo = (t: LevaTicket) => (usd == null || t.custoInicio == null ? {} : { custo: usd - t.custoInicio })
      return { ...leva, tickets: leva.tickets.map(t => (t.id === String(m.ticket) ? { ...t, ...portao, ...custo(t) } : t)) }
    }
    case 'item': {
      const f = m.fase ?? leva.fase
      if (typeof m.item !== 'string' || !m.item.trim() || m.item.length > 60) return { erro: 'item exige o nome do item, ate 60 caracteres' }
      if (!FASES_COM_ITENS[f]) return { erro: `item vai so nas fases ${Object.keys(FASES_COM_ITENS).join(', ')}; veio fase ${f}` }
      if (m.portao != null && !PORTOES.includes(m.portao)) return { erro: `portao deve ser verde ou vermelho, veio ${m.portao}` }
      if (m.detalhe != null && (typeof m.detalhe !== 'string' || m.detalhe.length > 60)) return { erro: 'detalhe e um texto de ate 60 caracteres' }
      if (m.item.trim() === FASES_COM_ITENS[f]) return { erro: `item repete o titulo do cartao (${m.item}): nomeie o passo, ex. Achados da revisao, Testes, Build` }
      // o mesmo item da mesma fase e atualizado, e guarda a hora em que comecou; o que ja
      // chega com o portao, sem ter aberto em curso, conta da entrada na fase
      const itens = leva.itens ?? []
      const velho = itens.find(i => i.fase === f && i.titulo === m.item)
      // a fase vale: o FASES_COM_ITENS acima a conferiu
      const novo: LevaItem = {
        fase: f as LevaItem['fase'],
        titulo: m.item,
        estado: m.portao ?? 'em-curso',
        detalhe: m.detalhe ?? velho?.detalhe,
        inicioEm: velho?.inicioEm ?? (m.portao && leva.entradas?.[f]) ?? agora,
        fimEm: m.portao ? agora : undefined,
      }
      return { ...leva, itens: velho ? itens.map(i => (i === velho ? novo : i)) : [...itens, novo] }
    }
    case 'fechamento':
      return { ...comCusto(fase('fechamento'), usd), fechada: true, fim: agora }
  }
}

// Aplica um marco do grill; devolve o grill novo ou { erro } sem tocar no antigo.
export function aplicarNoGrill(grill: Grill | null, m: Marco, agora: number): Aplicado<Grill> | Erro {
  if (m.marco === 'grill') {
    if (typeof m.pedido !== 'string' || !m.pedido.trim()) return { erro: 'grill exige o pedido em poucas palavras' }
    return { id: novoId(agora), pedido: m.pedido, inicio: agora, perguntas: [] }
  }
  if (!grill) return { erro: 'nenhum grill neste workspace: registre o marco grill antes' }
  if (m.marco === 'linha') {
    if (typeof m.linha !== 'string' || !m.linha.trim() || m.linha.length > 4000) return { erro: 'linha exige a linha da leva inteira, ate 4000 caracteres' }
    return { ...grill, linha: m.linha.replace(CONTROLE, '') }
  }
  if (typeof m.documento !== 'string' || !m.documento.trim()) return { erro: 'entendimento exige documento (titulo da nota ou caminho)' }
  return { ...grill, documento: m.documento, fim: agora }
}

// o grill que a aba Geral mostra: o que o inicio da leva nao tirou de la
export const naTela = (grill: Grill | null) => (grill && !grill.fora ? grill : null)
