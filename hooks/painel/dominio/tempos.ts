// O time.md do projeto, puro: as linhas de cada leva fechada (os tickets, as fases e a leva
// inteira, previsto contra real) e a calibracao que a previsao da leva seguinte le. O tempo e o da
// maquina: o agente e as ferramentas, sem as esperas pelo usuario. Os tickets que rodam juntos
// dividem a maquina e o relogio: o Juntos de cada um e a calibracao por modo os separam do inline.

import type { Leva, LevaTicket } from '../../../types/index.d.ts'
import { FASES } from './vocabulario.ts'
import { duracao, prevista, esperado, daMaquina } from './formato.ts'

export const TIME_MD = 'time.md'
const CABECALHO = '| Data | Leva | Ticket | Perfil | Modo | Juntos | Reparos | Previsto | Real | Espera | Real/previsto |'
const SEPARADOR = `|${'---|'.repeat(11)}`
const ABERTURA = [
  '# Tempos da leva',
  '',
  'Mantido pelo painel da leva do /faz (macrex-skills): cada fechamento acrescenta ao Registro as linhas',
  'da leva e refaz a Calibração; a previsão da leva seguinte parte dela. Real é o tempo da máquina (o',
  'agente e as ferramentas), sem a espera pelo usuário, que fica na coluna Espera. Juntos é quantos',
  'tickets rodavam ao mesmo tempo no pico do ticket, ele incluso. Linha acrescentada à mão no Registro',
  'entra na Calibração do próximo fechamento.',
]

// os minutos de um tempo escrito pelo duracao ou pelo prevista (1h20m, 11m46s, 40m, 45s); — e NaN
export function minutosDe(texto: string) {
  const t = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(texto.trim())
  if (!t || !texto.trim()) return NaN
  return Number(t[1] ?? 0) * 60 + Number(t[2] ?? 0) + Number(t[3] ?? 0) / 60
}
const razao = (r: number) => `${r.toFixed(2).replace('.', ',')}×`
const numero = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const celula = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()
// o nome curto da leva: o documento sem a data da frente e sem o "— entendimento do grill"
export const nomeDaLeva = (documento: string) => celula(documento.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').replace(/\s+—\s+entendimento do grill$/, ''))
const dia = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// o fim do ticket que passou pelo portao; o que nao passou nao tem real
const fimDo = (t: LevaTicket) => (t.estado === 'verde' || t.estado === 'vermelho' ? t.fimEm : undefined)
// quantos tickets rodavam ao mesmo tempo no pico do intervalo do ticket, ele incluso: o pico cai no
// inicio dele ou no de outro que comecou durante ele
export function juntos(t: LevaTicket, todos: LevaTicket[]) {
  const inicio = t.inicioEm
  const fim = fimDo(t)
  if (inicio == null || fim == null) return undefined
  const ativos = (p: number) => todos.filter(o => o.inicioEm != null && o.inicioEm <= p && p < (fimDo(o) ?? Infinity)).length
  const pontos = [inicio, ...todos.flatMap(o => (o.inicioEm != null && o.inicioEm > inicio && o.inicioEm < fim ? [o.inicioEm] : []))]
  return Math.max(...pontos.map(ativos))
}

// As linhas da leva fechada no Registro: um ticket por linha, cada fase que passou e a leva inteira.
export function linhasDaLeva(leva: Leva) {
  const esperas = leva.esperas
  const linha = (ticket: string, perfil: string, junto: number | undefined, reparos: string, previsto: number | undefined, inicio?: number, fim?: number) => {
    const real = daMaquina(inicio, fim, esperas)
    const espera = inicio != null && fim != null ? esperado(inicio, fim, esperas) : 0
    const r = real != null && previsto != null ? razao(real / (previsto * 60000)) : '—'
    return `| ${dia(leva.inicio ?? 0)} | ${nomeDaLeva(leva.documento)} | ${celula(ticket)} | ${perfil} | ${leva.modo ?? '—'} | ${junto ?? '—'} | ${reparos} | ${previsto == null ? '—' : prevista(previsto)} | ${real == null ? '—' : duracao(real)} | ${espera ? duracao(espera) : '—'} | ${r} |`
  }
  // a fase vai da entrada dela a entrada da seguinte que a leva teve (a ultima, ao fim); o fechamento nao tem duracao
  const entradas = FASES.filter(f => leva.entradas?.[f] != null).map(f => [f, leva.entradas![f]!] as const)
  const fases = entradas.filter(([f]) => f !== 'fechamento').map(([f, inicio], i) => linha(`fase ${f}`, '—', undefined, '—', undefined, inicio, entradas[i + 1]?.[1] ?? leva.fim))
  return [
    ...leva.tickets.map(t => linha(`${t.id} ${t.titulo}`, t.perfil ?? '—', juntos(t, leva.tickets), t.reparos == null ? '—' : String(t.reparos), t.previsao, t.inicioEm, fimDo(t))),
    ...fases,
    linha('Leva inteira', '—', undefined, '—', leva.previsao, leva.inicio, leva.fim),
  ]
}

// as linhas do Registro de um time.md: as da tabela que vem depois do cabecalho dela
function registro(md: string) {
  const linhas = md.split(/\r?\n/)
  const i = linhas.findIndex(l => l.trim() === CABECALHO)
  if (i < 0) return []
  const fim = linhas.findIndex((l, j) => j > i + 1 && !l.trim().startsWith('|'))
  return linhas.slice(i + 2, fim < 0 ? undefined : fim).filter(l => l.trim().startsWith('|'))
}
const colunas = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const tempo = (min: number) => duracao(min * 60000)

// A Calibracao, por modo: a mediana do Juntos, do previsto, do real e do real sobre o previsto por
// perfil dos tickets e da leva inteira; o real de cada fase; e, por leva, a soma dos tickets sobre o
// implement, o quanto os tickets correram juntos. O que nao tem real nao entra.
export function calibracao(md: string) {
  const linhas = registro(md)
    .map(colunas)
    .map(([data, leva, ticket = '', perfil = '—', modo = '—', junto = '—', , previsto = '', real = '']) => ({ data, leva, ticket, perfil: perfil === '—' ? 'sem perfil' : perfil, modo, junto: Number(junto), previsto: minutosDe(previsto), real: minutosDe(real) }))
  const comReal = linhas.filter(l => !Number.isNaN(l.real))
  if (comReal.length === 0) return ''
  const levas = [...new Set(linhas.map(l => `${l.data} ${l.leva}`))]
  const unicos = (xs: string[]) => [...new Set(xs)].sort()
  const grupo = (nome: string, modo: string, ls: typeof comReal) => {
    const pares = ls.filter(l => !Number.isNaN(l.previsto))
    const com = ls.filter(l => !Number.isNaN(l.junto))
    const previsto = pares.length ? prevista(Math.round(mediana(pares.map(l => l.previsto)))) : '—'
    const r = pares.length ? razao(mediana(pares.map(l => l.real / l.previsto))) : '—'
    return `| ${nome} | ${modo} | ${ls.length} | ${com.length ? numero(mediana(com.map(l => l.junto))) : '—'} | ${previsto} | ${tempo(mediana(ls.map(l => l.real)))} | ${r} |`
  }
  const tickets = comReal.filter(l => !l.ticket.startsWith('fase ') && l.ticket !== 'Leva inteira')
  const inteiras = comReal.filter(l => l.ticket === 'Leva inteira')
  const porPerfil = unicos(tickets.map(l => `${l.perfil}\t${l.modo}`)).map(c => c.split('\t') as [string, string])
  const fases = FASES.flatMap(f => unicos(comReal.filter(l => l.ticket === `fase ${f}`).map(l => l.modo)).map(m => [f, m, comReal.filter(l => l.ticket === `fase ${f}` && l.modo === m)] as const))
  // por leva com implement medido: a soma do real dos tickets e o real do implement
  const somas = levas.flatMap(chave => {
    const daLeva = comReal.filter(l => `${l.data} ${l.leva}` === chave)
    const implement = daLeva.find(l => l.ticket === 'fase implement')
    const doTicket = tickets.filter(l => `${l.data} ${l.leva}` === chave)
    return implement && doTicket.length ? [{ modo: implement.modo, soma: doTicket.reduce((s, l) => s + l.real, 0), implement: implement.real }] : []
  })
  return [
    `${levas.length} ${levas.length === 1 ? 'leva' : 'levas'} no Registro. Real/previsto abaixo de 1 é previsão acima do real. No modo paralelo, os tickets de uma onda dividem a máquina e o relógio: compare com o mesmo modo, e a onda dura o seu ticket mais longo, não a soma.`,
    '',
    '| Perfil | Modo | Tickets | Juntos (mediana) | Previsto (mediana) | Real (mediana) | Real/previsto (mediana) |',
    '|---|---|---|---|---|---|---|',
    ...porPerfil.map(([p, m]) => grupo(p, m, tickets.filter(l => l.perfil === p && l.modo === m))),
    ...unicos(inteiras.map(l => l.modo)).map(m => grupo('Leva inteira', m, inteiras.filter(l => l.modo === m))),
    '',
    '| Modo | Levas | Tickets somados (mediana) | Implement (mediana) | Tickets/implement (mediana) |',
    '|---|---|---|---|---|',
    ...unicos(somas.map(s => s.modo)).map(m => {
      const ss = somas.filter(s => s.modo === m)
      return `| ${m} | ${ss.length} | ${tempo(mediana(ss.map(s => s.soma)))} | ${tempo(mediana(ss.map(s => s.implement)))} | ${razao(mediana(ss.map(s => s.soma / s.implement)))} |`
    }),
    '',
    '| Fase | Modo | Levas | Real (mediana) |',
    '|---|---|---|---|',
    ...fases.map(([f, m, ls]) => `| ${f} | ${m} | ${ls.length} | ${tempo(mediana(ls.map(l => l.real)))} |`),
  ].join('\n')
}

// o que a entrada na fase tickets devolve ao agente, com a calibracao ou sem ela
export const comCalibracao = (tabela: string) =>
  tabela
    ? `Calibracao deste projeto (${TIME_MD} da raiz), para a previsao dos tickets em tempo da maquina ("A previsao de tempo", leva.md da /faz):\n${tabela}`
    : `Sem calibracao neste projeto (${TIME_MD} da raiz ausente ou sem tempo real): preveja em tempo da maquina ("A previsao de tempo", leva.md da /faz); o fechamento comeca o ${TIME_MD}.`

// O time.md novo: o Registro de antes sem as linhas desta leva (o reenvio a substitui), mais as dela,
// e a Calibracao refeita sobre ele.
export function comLeva(md: string, leva: Leva) {
  const nome = nomeDaLeva(leva.documento)
  const linhas = [...registro(md).filter(l => colunas(l)[1] !== nome), ...linhasDaLeva(leva)]
  const corpo = [CABECALHO, SEPARADOR, ...linhas].join('\n')
  return [...ABERTURA, '', '## Calibração', '', calibracao(corpo), '', '## Registro', '', corpo, ''].join('\n')
}
