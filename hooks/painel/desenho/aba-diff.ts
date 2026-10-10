// A aba Diff: um chip por arquivo, o caminho que abre e fecha o diff, e as linhas somadas e tiradas.

import type { CodigoArquivo, CodigoBase } from '../../../types/index.d.ts'
import { CHIP, VERDE, VERMELHO } from '../dominio/vocabulario.ts'
import { nomeDa } from '../dominio/formato.ts'
import type { Acoes, Primitivas } from './primitivas.ts'

export function abaDiff(
  { Box, Text, Button, tela, cartao, apagado, diffDe }: Primitivas,
  { arquivos, abertos, base }: { arquivos: CodigoArquivo[]; abertos: string[]; base: CodigoBase | null },
  acoes: Acoes,
) {
  const arquivo = (a: CodigoArquivo, i: number) => {
    const aberto = abertos.includes(a.caminho)
    const alternar = () => acoes.alternarDiff(a.caminho)
    return h(
      Box,
      { flexDirection: 'column', backgroundColor: CHIP, marginTop: 1 },
      h(
        Box,
        { justifyContent: 'space-between', paddingX: 1 },
        h(Button, { key: `arquivo:${i}`, plain: true, label: `${aberto ? '⌄' : '›'} ${a.caminho}`, onPress: alternar }),
        h(Text, { wrap: 'truncate-end' }, h(Text, { color: VERDE }, `+${a.mais}`), ' ', h(Text, { color: VERMELHO }, `-${a.menos}`)),
      ),
      ...(aberto ? diffDe(a) : []),
    )
  }
  const mais = arquivos.reduce((n, a) => n + a.mais, 0)
  const menos = arquivos.reduce((n, a) => n + a.menos, 0)
  return tela(
    base ? nomeDa(base.raiz) : 'Fora de um repositório git',
    `${arquivos.length} ${arquivos.length === 1 ? 'arquivo alterado' : 'arquivos alterados'}`,
    `+${mais} -${menos}`,
    !base
      ? cartao(null, apagado('a sessão não começou num repositório git: não há com o que comparar'))
      : cartao(null, ...(arquivos.length > 0 ? arquivos.map(arquivo) : [apagado('nenhum arquivo alterado nesta sessão')])),
  )
}
