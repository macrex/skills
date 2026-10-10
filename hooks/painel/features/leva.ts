// A leva fora dos marcos: a medida da sessao grava o custo da leva aberta, e a compactacao leva o
// estado dela ao resumo.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { comCusto } from '../dominio/formato.ts'
import { levaNaCompactacao } from '../dominio/marcos.ts'
import { chave } from '../estado.ts'

const LEVA = atom({ plugin: 'macrex-skills', key: 'leva' }, null)
// A ultima medida da sessao (session.measure): o custo, o contexto e a janela de 5 h, so na sessao.
const MEDIDA = atom({ plugin: 'macrex-skills', key: 'medida' }, null)

// o ativa e copia do do nucleo: o validate nao segue o $ por um import
const ativa = async ($: EngineInterface) => {
  const leva = await read($, LEVA)
  return Boolean(leva && !leva.fechada)
}

export function registrarMedida(on: On) {
  // a medida da sessao, a cada turno e a cada ponto da janela: o custo, o contexto e a janela de
  // 5 h (so na assinatura; numa chave de API nao vem) para a aba Uso; a leva aberta grava o custo dela
  on('session.measure', async ($, e, next) => {
    await update($, MEDIDA, () => ({ custo: e.cost?.usd, contexto: e.context.percent, janela: e.rateLimits.find(r => r.kind === 'five_hour') }))
    let mudou = false
    const leva = await update($, LEVA, l => {
      const medida = l && !l.fechada ? comCusto(l, e.cost?.usd) : l
      // mudou so com a leva aberta: medida e l nao sao null
      mudou = medida !== l && medida!.custo !== l!.custo
      return mudou ? medida : l
    })
    if (mudou) await $.store.set(chave(await $.session.root()), leva)
    return next(e)
  })
}

export function registrarCompactacao(on: On) {
  // a leva atravessa a compactacao do loop principal: o resumo recebe o estado dela. O precompute
  // (o resumo adiantado, que a compactacao seguinte reaproveita sem passar as instructions dela ao
  // resumidor) fica vetado com a leva aberta, para o resumo ser feito com o estado de agora; o
  // sub-agente passa intacto, e a compactacao de verdade nunca e cancelada aqui
  on('session.compact', async ($, e, next) => {
    if (e.agentId || !(await ativa($))) return next(e)
    if (e.trigger === 'precompute') return { skip: 'leva aberta: o resumo leva o estado dela' }
    const bloco = levaNaCompactacao((await read($, LEVA))!)
    return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${bloco}` : bloco })
  })
}
