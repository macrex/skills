// A aba Uso: os tokens desde o inicio da leva (ou da sessao), por modelo e por agente.

import type { Leva, LevaAgente, LevaMedida, UsoDoLoop } from '../../../types/index.d.ts'
import { TEXTO, APAGADO, AZUL, TOKENS } from '../dominio/vocabulario.ts'
import type { Tokens } from '../dominio/vocabulario.ts'
import { somar, dolares, porcento, ateResetar, tokens } from '../dominio/formato.ts'
import type { Primitivas, Parte } from './primitivas.ts'

export function abaUso(
  { Text, tela, cartao, apagado, linhaLarga, largura }: Primitivas,
  { uso, agentes, medida, leva, agora }: { uso: [string, UsoDoLoop][]; agentes: LevaAgente[]; medida: LevaMedida | null; leva: Leva | null; agora: number },
) {
  const total = (u: Tokens) => TOKENS.reduce((n, k) => n + u[k], 0)
  const porModelo: Record<string, Tokens> = {}
  for (const [, u] of uso) porModelo[u.modelo] = somar(porModelo[u.modelo], u)
  const aDireita = (...valores: string[]) => valores.map((v): Parte => [v.padStart(9)])
  const modelo = ([nome, u]: [string, Tokens]) =>
    linhaLarga(largura, [[nome || 'modelo desconhecido']], aDireita(tokens(u.input_tokens), tokens(u.output_tokens), tokens(u.cache_read_input_tokens + u.cache_creation_input_tokens)))
  const nomeDo = (id: string) => (id === 'sessao' ? 'sessão principal' : (agentes.find(a => a.agentId === id)?.nome ?? `agente ${id.slice(0, 8)}`))
  const loop = ([id, u]: [string, UsoDoLoop]) => linhaLarga(largura, [[nomeDo(id)]], [[u.modelo, { color: AZUL }], ['  '], [tokens(total(u)).padStart(7)]])
  // o custo e os limites medidos: o da leva (o da sessao, sem ela), a janela de 5 h e o contexto
  const custo: [string, number] | null = leva?.custo != null ? ['custo da leva', leva.custo] : !leva && medida?.custo != null ? ['custo da sessão', medida.custo] : null
  const janela = medida?.janela && `5h ${porcento(medida.janela.percentUsed)}${medida.janela.resetsAt ? ` · reseta em ${ateResetar(Date.parse(medida.janela.resetsAt) - agora)}` : ''}`
  const limites = [janela, medida?.contexto != null && `contexto ${porcento(medida.contexto)}`].filter(Boolean).join(' · ')
  return tela(
    leva?.documento ?? 'Sessão',
    'tokens',
    tokens(uso.reduce((n, [, u]) => n + total(u), 0)),
    (custo || limites) && cartao(null, custo && linhaLarga(largura, [[custo[0]]], [[dolares(custo[1])]]), limites && h(Text, { color: TEXTO }, limites)),
    ...(uso.length === 0
      ? [cartao(null, apagado('nenhum turno terminou ainda'))]
      : [
          cartao('Por modelo', linhaLarga(largura, [['']], aDireita('entrada', 'saída', 'cache'), { color: APAGADO }), ...Object.entries(porModelo).map(modelo)),
          cartao('Por agente', ...uso.map(loop)),
        ]),
  )
}
