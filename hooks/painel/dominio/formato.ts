// O formato dos numeros e da leva no painel: tempo, tokens, dinheiro e a contagem dos tickets.

import type { Leva } from '../../../types/index.d.ts'
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
  const emCurso = leva.tickets.findIndex(t => t.estado === 'em-curso')
  return `ticket ${emCurso >= 0 ? emCurso + 1 : leva.tickets.filter(t => t.estado !== 'pendente').length}/${n}`
}
export const somar = (a: Partial<Tokens> = {}, b: Partial<Tokens>) => Object.fromEntries(TOKENS.map(k => [k, (a[k] ?? 0) + (b[k] ?? 0)])) as Tokens
// o custo medido da leva: o da sessao agora menos o do inicio; sem custo na sessao, nada
export const comCusto = (leva: Leva, usd: number | undefined): Leva => (usd == null || leva.custoInicio == null ? leva : { ...leva, custo: usd - leva.custoInicio })
export const dolares = (usd: number) => `US$ ${usd.toFixed(2).replace('.', ',')}`
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
