// O formato dos numeros e da leva no painel: tempo, tokens, dinheiro, a contagem dos tickets e o
// custo medido da leva e dos itens das fases.

import type { Leva, LevaItem } from '../../../types/index.d.ts'
import { TOKENS } from './vocabulario.ts'
import type { Tokens } from './vocabulario.ts'

const dois = (n: number) => String(n).padStart(2, '0')
// a ultima parte de um caminho, com / ou \: o nome do projeto pela raiz
export const nomeDa = (caminho: string) => caminho.split(/[\\/]/).pop() as string
export const verdes = (leva: Leva) => leva.tickets.filter(t => t.estado === 'verde').length
// a contagem da faixa e do spinner, uma so: o ticket em curso sobre o total (sem um em curso, o
// ultimo que comecou); os verdes ficam no painel
export function ticketDaLeva(leva: Leva) {
  const n = leva.tickets.length
  if (n === 0) return ''
  // os que o workflow roda juntos saem todos: tickets 2 e 3/4
  const emCurso = leva.tickets.flatMap((t, i) => (t.estado === 'em-curso' ? [i + 1] : []))
  if (emCurso.length > 1) return `tickets ${emCurso.slice(0, -1).join(', ')} e ${emCurso.at(-1)}/${n}`
  return `ticket ${emCurso[0] ?? leva.tickets.filter(t => t.estado !== 'pendente').length}/${n}`
}
export const somar = (a: Partial<Tokens> = {}, b: Partial<Tokens>) => Object.fromEntries(TOKENS.map(k => [k, (a[k] ?? 0) + (b[k] ?? 0)])) as Tokens
// o custo medido da leva: o da sessao agora menos o do inicio; sem custo na sessao, nada
export const comCusto = (leva: Leva, usd: number | undefined): Leva => (usd == null || leva.custoInicio == null ? leva : { ...leva, custo: usd - leva.custoInicio })
// US$ por milhao de tokens de entrada, saida e leitura do cache, do mais especifico ao mais geral (o
// claude-opus-5-5 antes do claude-opus-5); a escrita do cache e 1,25 vez a entrada
// ponytail: a escrita conta toda como a de 5 min (a de 1 h e 2 vezes) e a tabela e a de 2026-10;
// modelo novo ou preco mudado entra aqui
const PRECOS: [string, number, number, number][] = [
  ['claude-fable-5-1', 10, 50, 0.25],
  ['claude-mythos-5-1', 10, 50, 0.25],
  ['claude-fable-5', 10, 50, 1],
  ['claude-mythos-5', 10, 50, 1],
  ['claude-opus-5-5', 4, 20, 0.2],
  ['claude-opus-5', 5, 25, 0.5],
  ['claude-opus-4', 5, 25, 0.5],
  ['claude-sonnet-5', 2, 10, 0.2],
  ['claude-sonnet-4', 3, 15, 0.3],
  ['claude-haiku-5-5', 0.1, 0.5, 0.01],
  ['claude-haiku-4', 1, 5, 0.1],
]
// o custo de um turno pelos tokens e o modelo; o modelo fora da tabela nao tem custo
export function custoDosTokens(u: Tokens & { model: string }) {
  const preco = PRECOS.find(([id]) => u.model.includes(id))
  if (!preco) return undefined
  const [, entrada, saida, lido] = preco
  return (u.input_tokens * entrada + u.cache_creation_input_tokens * entrada * 1.25 + u.output_tokens * saida + u.cache_read_input_tokens * lido) / 1e6
}
export const dolares = (usd: number) => `US$ ${usd.toFixed(2).replace('.', ',')}`
// o custo do item da revisao, das correcoes ou da qualidade entre o marco que o abriu e o do
// portao; o que se cruzou com outro da fase fica sem: o custo da sessao mede os dois juntos
const comCustoMedido = (i: LevaItem): i is LevaItem & { custoInicio: number; custoFim: number } => i.custoInicio != null && i.custoFim != null
const cruzam = (a: LevaItem, b: LevaItem) => a.inicioEm < (b.fimEm ?? Infinity) && b.inicioEm < (a.fimEm ?? Infinity)
export const custoDoItem = (i: LevaItem, daFase: LevaItem[]) => (comCustoMedido(i) && !daFase.some(j => j !== i && cruzam(i, j)) ? i.custoFim - i.custoInicio : undefined)
// o total da fase, do primeiro inicio ao ultimo portao dos itens que tem os dois; os que rodaram juntos entram aqui
export function custoDaFase(daFase: LevaItem[]) {
  const medidos = daFase.filter(comCustoMedido)
  return medidos.length ? Math.max(...medidos.map(i => i.custoFim)) - Math.min(...medidos.map(i => i.custoInicio)) : undefined
}
export const porcento = (p: number) => `${String(p).replace('.', ',')}%`
// o tempo ate a janela resetar, sem os segundos: 1h40, 25min
export function ateResetar(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${dois(m % 60)}`
}

// a contagem de tokens curta, com a virgula do portugues: 999, 1,5k, 2,3M
export function tokens(n: number) {
  if (n < 1000) return String(n)
  return (n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`).replace('.', ',')
}

export function duracao(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${dois(s % 60)}s` : `${Math.floor(m / 60)}h${dois(m % 60)}m`
}
// a previsao, que vem em minutos inteiros
export const prevista = (min: number) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${dois(min % 60)}m`)

// o quanto de [inicio, fim] caiu em espera pelo usuario
export const esperado = (inicio: number, fim: number, esperas: [number, number][] = []) =>
  esperas.reduce((soma, [a, b]) => soma + Math.max(0, Math.min(b, fim) - Math.max(a, inicio)), 0)
// o tempo da maquina entre dois marcos, sem as esperas pelo usuario, ou undefined sem um deles
export const daMaquina = (inicio: number | undefined, fim: number | undefined, esperas?: [number, number][]) =>
  inicio == null || fim == null ? undefined : fim - inicio - esperado(inicio, fim, esperas)

// A tabela dos tempos da leva, previsto contra real, por ticket e da leva inteira: o resultado do
// fechamento a entrega para a secao ## Tempos da nota de evolucao, onde as levas se comparam depois.
// O real e o da maquina; a espera pelo usuario, quando houve, vai numa linha propria. O desvio e o
// real sobre o previsto, em %; sem um dos dois, —.
export function tabelaDeTempos(leva: Leva) {
  const desvio = (previsto?: number, real?: number) => (previsto == null || real == null ? '—' : `${real >= previsto * 60000 ? '+' : '-'}${Math.round((Math.abs(real - previsto * 60000) / (previsto * 60000)) * 100)}%`)
  const linha = (nome: string, estado: string, previsto?: number, real?: number) => `| ${nome} | ${estado} | ${previsto == null ? '—' : prevista(previsto)} | ${real == null ? '—' : duracao(real)} | ${desvio(previsto, real)} |`
  const espera = leva.inicio != null && leva.fim != null ? esperado(leva.inicio, leva.fim, leva.esperas) : 0
  return [
    '| Ticket | Portão | Previsto | Real | Desvio |',
    '|---|---|---|---|---|',
    ...leva.tickets.map(t => linha(`${t.id} ${t.titulo}`, t.estado, t.previsao, daMaquina(t.inicioEm, t.fimEm, leva.esperas))),
    linha('Leva inteira', leva.fechada ? 'fechada' : 'aberta', leva.previsao, daMaquina(leva.inicio, leva.fim, leva.esperas)),
    ...(espera ? [linha('Espera do usuário', '—', undefined, espera)] : []),
  ].join('\n')
}
