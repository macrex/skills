// O time.md do projeto, puro: as linhas de cada leva fechada (os tickets, as fases e a leva
// inteira, previsto contra real) e a calibracao que a previsao da leva seguinte le. O tempo e o da
// maquina: o agente e as ferramentas, sem as esperas pelo usuario. Os tickets que rodam juntos
// dividem a maquina e o relogio: o Juntos de cada um e a calibracao por modo os separam do inline.

import type { Leva, LevaTicket } from '../../../types/index.d.ts'
import type { Marco } from './vocabulario.ts'
import { FASES, MODOS } from './vocabulario.ts'
import { duracao, prevista, esperado, daMaquina } from './formato.ts'

export const TIME_MD = 'time.md'
const CABECALHO = '| Data | Leva | Ticket | Perfil | Modo | Juntos | Reparos | Previsto | Real | Espera | Real/previsto | Fonte |'
// o Registro de antes da Fonte, que o proximo fechamento passa ao cabecalho novo
const CABECALHO_ANTIGO = '| Data | Leva | Ticket | Perfil | Modo | Juntos | Reparos | Previsto | Real | Espera | Real/previsto |'
const SEPARADOR = `|${'---|'.repeat(12)}`
const ABERTURA = [
  '# Tempos da leva',
  '',
  'Mantido pelo painel da leva do /faz (macrex-skills): cada fechamento acrescenta ao Registro as linhas',
  'da leva e refaz a Calibração; a previsão da leva seguinte parte dela. Real é o tempo da máquina (o',
  'agente e as ferramentas), sem a espera pelo usuário, que fica na coluna Espera. Juntos é quantos',
  'tickets rodavam ao mesmo tempo no pico do ticket, ele incluso. A Calibração usa as levas mais',
  'recentes e deixa de fora o real contaminado; linha acrescentada ou apagada à mão no Registro muda a',
  'Calibração no próximo fechamento. Fonte é de onde veio a previsão do ticket: a mediana do perfil',
  '(o painel), o motivo do agente que saiu dela, ou o julgamento do agente sem base.',
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
  // parado e o que o proprio item esperou (a conciliacao esperando o ticket seguinte), que o real nao conta
  const linha = (ticket: string, perfil: string, junto: number | undefined, reparos: string, previsto: number | undefined, inicio?: number, fim?: number, parado = 0, fonte = '—') => {
    const maquina = daMaquina(inicio, fim, esperas)
    const real = maquina == null ? undefined : maquina - parado
    const espera = inicio != null && fim != null ? esperado(inicio, fim, esperas) : 0
    const r = real != null && previsto != null ? razao(real / (previsto * 60000)) : '—'
    return `| ${dia(leva.inicio ?? 0)} | ${nomeDaLeva(leva.documento)} | ${celula(ticket)} | ${perfil} | ${leva.modo ?? '—'} | ${junto ?? '—'} | ${reparos} | ${previsto == null ? '—' : prevista(previsto)} | ${real == null ? '—' : duracao(real)} | ${espera ? duracao(espera) : '—'} | ${r} | ${fonte} |`
  }
  // a fase vai da entrada dela a entrada da seguinte que a leva teve (a ultima, ao fim); o fechamento nao tem duracao
  const entradas = FASES.filter(f => leva.entradas?.[f] != null).map(f => [f, leva.entradas![f]!] as const)
  const fases = entradas.filter(([f]) => f !== 'fechamento').map(([f, inicio], i) => linha(`fase ${f}`, '—', undefined, '—', undefined, inicio, entradas[i + 1]?.[1] ?? leva.fim))
  return [
    ...leva.tickets.map(t => linha(`${t.id} ${t.titulo}`, t.perfil ?? '—', juntos(t, leva.tickets), t.reparos == null ? '—' : String(t.reparos), t.previsao, t.inicioEm, fimDo(t), 0, t.previsao == null ? '—' : (t.fonte ?? 'agente'))),
    ...(leva.itens ?? []).filter(i => i.fase === 'implement' && CONCILIACAO.test(i.titulo) && i.fimEm != null).map(i => linha(i.titulo, '—', undefined, '—', undefined, i.inicioEm, i.fimEm, i.esperaMs)),
    ...fases,
    linha('Leva inteira', '—', undefined, '—', leva.previsao, leva.inicio, leva.fim),
  ]
}

const colunas = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
// as linhas do Registro de um time.md: as da tabela que vem depois do cabecalho dela. A linha do
// Registro antigo ganha a Fonte: toda previsao de antes dela era o julgamento do agente
function registro(md: string) {
  const linhas = md.split(/\r?\n/)
  const i = linhas.findIndex(l => l.trim() === CABECALHO || l.trim() === CABECALHO_ANTIGO)
  if (i < 0) return []
  const fim = linhas.findIndex((l, j) => j > i + 1 && !l.trim().startsWith('|'))
  const doRegistro = linhas.slice(i + 2, fim < 0 ? undefined : fim).filter(l => l.trim().startsWith('|'))
  return doRegistro.map(l => (colunas(l).length === 11 ? `${l.trim()} ${colunas(l)[7] === '—' ? '—' : 'agente'} |` : l))
}

// as levas que a calibracao usa, as mais recentes do Registro: elas acompanham a skill e o projeto como estao agora
const RECENTES = 5
// o real acima de 3× ou abaixo de 1/3 da mediana do grupo e contaminado (a sessao parada, a espera que nao se mediu)
const FORA = 3
const CONCILIACAO = /^Conciliação \d+$/

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const tempo = (min: number) => duracao(min * 60000)

// O grupo de cada linha do Registro na calibracao: o perfil do ticket, a fase, a conciliacao de uma
// onda ou a leva inteira, cada um no seu modo
const grupoDa = (l: { ticket: string; perfil: string; modo: string }) =>
  `${l.ticket.startsWith('fase ') || l.ticket === 'Leva inteira' ? l.ticket : CONCILIACAO.test(l.ticket) ? 'conciliação' : l.perfil}\t${l.modo}`

// As amostras da calibracao: as linhas com real das levas mais recentes, por grupo, sem as contaminadas
function amostras(md: string) {
  const linhas = registro(md)
    .map(colunas)
    .map(([data, leva, ticket = '', perfil = '—', modo = '—', junto = '—', , previsto = '', real = '', , , fonte = '—']) => ({ chave: `${data} ${leva}`, ticket, perfil: perfil === '—' ? 'sem perfil' : perfil, modo, junto: Number(junto), previsto: minutosDe(previsto), real: minutosDe(real), fonte }))
    .filter(l => !Number.isNaN(l.real))
  const levas = [...new Set(linhas.map(l => l.chave))]
  const recentes = new Set(levas.slice(-RECENTES))
  const grupos = new Map<string, typeof linhas>()
  for (const l of linhas.filter(l => recentes.has(l.chave))) grupos.set(grupoDa(l), [...(grupos.get(grupoDa(l)) ?? []), l])
  let fora = 0
  for (const [g, ls] of grupos) {
    if (ls.length < 3) continue
    const m = mediana(ls.map(l => l.real))
    const dentro = ls.filter(l => l.real <= m * FORA && l.real >= m / FORA)
    fora += ls.length - dentro.length
    grupos.set(g, dentro)
  }
  return { levas: levas.length, usadas: recentes.size, fora, grupos }
}

// o quantil q das amostras, pelo posto mais proximo
const quantil = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * xs.length) - 1)]!

// A Calibracao, por modo: por perfil dos tickets e da leva inteira, a mediana do Juntos e do real, a
// faixa do meio do real e o real sobre o previsto; o quanto acerta cada fonte da previsao dos
// tickets; o real de cada fase e o da conciliacao de cada onda.
export function calibracao(md: string) {
  const { levas, usadas, fora, grupos } = amostras(md)
  if (grupos.size === 0) return ''
  const doGrupo = (g: string) => g.split('\t') as [string, string]
  const chaves = [...grupos.keys()].sort()
  const porPerfil = chaves.filter(g => !doGrupo(g)[0].startsWith('fase ') && !['Leva inteira', 'conciliação'].includes(doGrupo(g)[0]))
  const linhaDe = (g: string) => {
    const [nome, modo] = doGrupo(g)
    const ls = grupos.get(g)!
    const reais = ls.map(l => l.real)
    const pares = ls.filter(l => !Number.isNaN(l.previsto))
    const com = ls.filter(l => !Number.isNaN(l.junto))
    const r = pares.length ? razao(mediana(pares.map(l => l.real / l.previsto))) : '—'
    return `| ${nome} | ${modo} | ${ls.length} | ${com.length ? numero(mediana(com.map(l => l.junto))) : '—'} | ${tempo(mediana(reais))} | ${tempo(quantil(reais, 0.25))} a ${tempo(quantil(reais, 0.75))} | ${r} |`
  }
  // as fases na ordem da leva, com a conciliacao de cada onda depois do implement
  const nomes = FASES.flatMap(f => (f === 'implement' ? [`fase ${f}`, 'conciliação'] : [`fase ${f}`]))
  const fases = nomes.flatMap(n => chaves.filter(g => doGrupo(g)[0] === n && grupos.get(g)!.length))
  // a fonte de cada previsao de ticket com previsto, no modo
  const comFonte = porPerfil.flatMap(g => grupos.get(g)!).filter(l => !Number.isNaN(l.previsto) && l.fonte !== '—')
  const fontes = [...new Set(comFonte.map(l => `${l.fonte}\t${l.modo}`))].sort()
  return [
    `${levas} ${levas === 1 ? 'leva' : 'levas'} no Registro; a calibração usa ${usadas === levas ? (levas === 1 ? 'ela' : 'todas') : `as ${usadas} mais recentes`}${fora ? ` e deixa de fora ${fora} ${fora === 1 ? 'real contaminado' : 'reais contaminados'} (acima de ${FORA}× ou abaixo de 1/${FORA} da mediana do grupo)` : ''}. Real/previsto abaixo de 1 é previsão acima do real. No modo paralelo, os tickets de uma onda dividem a máquina e o relógio: compare com o mesmo modo, e a onda dura o seu ticket mais longo, não a soma.`,
    '',
    '| Perfil | Modo | Tickets | Juntos (mediana) | Real (mediana) | Real (faixa do meio) | Real/previsto (mediana) |',
    '|---|---|---|---|---|---|---|',
    ...porPerfil.filter(g => grupos.get(g)!.length).map(linhaDe),
    ...chaves.filter(g => doGrupo(g)[0] === 'Leva inteira' && grupos.get(g)!.length).map(linhaDe),
    '',
    ...(fontes.length
      ? [
          '| Fonte da previsão | Modo | Tickets | Real/previsto (mediana) |',
          '|---|---|---|---|',
          ...fontes.map(f => {
            const [fonte, modo] = doGrupo(f)
            const ls = comFonte.filter(l => l.fonte === fonte && l.modo === modo)
            return `| ${fonte} | ${modo} | ${ls.length} | ${razao(mediana(ls.map(l => l.real / l.previsto)))} |`
          }),
          '',
        ]
      : []),
    '| Fase | Modo | Levas | Real (mediana) |',
    '|---|---|---|---|',
    ...fases.map(g => {
      const [nome, modo] = doGrupo(g)
      const ls = grupos.get(g)!
      return `| ${nome === 'conciliação' ? 'conciliação (por onda)' : nome.slice(5)} | ${modo} | ${ls.length} | ${tempo(mediana(ls.map(l => l.real)))} |`
    }),
  ].join('\n')
}

// A mediana do real de um grupo da calibracao (o perfil, a `fase <f>`, a conciliação ou a Leva
// inteira) no modo, em minutos, ou undefined sem amostra
export function medianas(md: string) {
  const { grupos } = amostras(md)
  return (nome: string, modo: string) => {
    const ls = grupos.get(`${nome}\t${modo}`)
    return ls?.length ? mediana(ls.map(l => l.real)) : undefined
  }
}
type Medianas = ReturnType<typeof medianas>

// O marco tickets com a base do time.md: o ticket enviado sem previsao recebe a mediana do perfil
// dele no modo, porque o ajuste por julgamento e o que mais erra; a previsao enviada sai da mediana
// so com o motivo. Devolve a recusa ou os tickets preenchidos.
export function pelaBase(tickets: LevaTicket[], enviados: NonNullable<Marco['tickets']>, modo: string, med: Medianas): { erro: string } | { tickets: LevaTicket[] } {
  const daBase = (id: string) => {
    const t = tickets.find(t => t.id === id)
    return t?.perfil ? med(t.perfil, modo) : undefined
  }
  const semMotivo = enviados.find(e => e.previsao != null && !e.motivo?.trim() && daBase(String(e.id)) != null)
  if (semMotivo) {
    const perfil = tickets.find(t => t.id === String(semMotivo.id))!.perfil
    return { erro: `previsao do ${semMotivo.id} sem motivo: o painel da a previsao do ticket pela mediana do ${perfil} em ${modo} no ${TIME_MD} (${tempo(daBase(String(semMotivo.id))!)}); mande a previsao so com o motivo, o fato do ticket que o tira dela` }
  }
  const novos = new Set(enviados.filter(e => e.previsao == null).map(e => String(e.id)))
  return { tickets: tickets.map(t => (novos.has(t.id) && t.previsao == null && daBase(t.id) != null ? { ...t, previsao: Math.max(1, Math.round(daBase(t.id)!)), fonte: 'mediana' as const } : t)) }
}

// A previsao da leva inteira pelas ondas, em minutos: cada onda dura o seu ticket mais longo (no
// inline, a soma) mais a conciliacao dela, e as outras fases a mediana delas no modo, ou em outro
// modo sem amostra nele. Undefined sem a previsao e a onda de todo ticket.
export function previsaoDaLeva(tickets: LevaTicket[], modo: string, med: Medianas) {
  if (!tickets.length || tickets.some(t => t.previsao == null || t.onda == null)) return undefined
  const outro = (nome: string) => med(nome, modo) ?? MODOS.map(m => med(nome, m)).find(v => v != null) ?? 0
  const ondas = [...new Set(tickets.map(t => t.onda!))]
  const daOnda = (o: number) => tickets.filter(t => t.onda === o).map(t => t.previsao!)
  const implement = ondas.reduce((s, o) => s + (modo === 'inline' ? daOnda(o).reduce((a, b) => a + b, 0) : Math.max(...daOnda(o))) + outro('conciliação'), 0)
  const fases = ['spec', 'tickets', 'revisao', 'correcoes', 'qualidade'].reduce((s, f) => s + outro(`fase ${f}`), 0)
  return Math.round(implement + fases)
}

// o que a entrada na fase tickets devolve ao agente, com a calibracao ou sem ela
export const comCalibracao = (tabela: string) =>
  tabela
    ? `Calibracao deste projeto (${TIME_MD} da raiz), para a previsao dos tickets em tempo da maquina ("A previsao de tempo", leva.md da /faz). De a cada ticket o perfil, a onda e a previsao a partir da mediana do perfil no modo da leva; fora de 1/2× a 2× dela, o marco tickets pede o motivo. A previsao da leva inteira o painel calcula pelas ondas:\n${tabela}`
    : `Sem calibracao neste projeto (${TIME_MD} da raiz ausente ou sem tempo real): preveja em tempo da maquina ("A previsao de tempo", leva.md da /faz); o fechamento comeca o ${TIME_MD}.`

// O time.md novo: o Registro de antes sem as linhas desta leva (o reenvio a substitui), mais as dela,
// e a Calibracao refeita sobre ele.
export function comLeva(md: string, leva: Leva) {
  const nome = nomeDaLeva(leva.documento)
  const linhas = [...registro(md).filter(l => colunas(l)[1] !== nome), ...linhasDaLeva(leva)]
  const corpo = [CABECALHO, SEPARADOR, ...linhas].join('\n')
  return [...ABERTURA, '', '## Calibração', '', calibracao(corpo), '', '## Registro', '', corpo, ''].join('\n')
}
