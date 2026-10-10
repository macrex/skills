// O diff do git em arquivos e em pedacos que um Code desenha.

import type { CodigoArquivo } from '../../../types/index.d.ts'
import { CONTROLE, LIMITE_DO_CODE } from './vocabulario.ts'

// O diff do git em arquivos: o caminho, as linhas somadas e tiradas, os hunks sem CONTROLE (o \r
// inclusive) e o patch cru do arquivo, que o Copiar diff leva (o git apply pede o \r do CRLF).
export function arquivosDoDiff(texto: string): CodigoArquivo[] {
  return texto.split(/^diff --git /m).slice(1).map(bloco => {
    const limpo = bloco.replace(CONTROLE, '')
    const caminho = (/^\+\+\+ b\/(.+?)\t?$/m.exec(limpo) ?? /^--- a\/(.+?)\t?$/m.exec(limpo) ?? /^a\/.* b\/(.+)$/m.exec(limpo))![1]!
    const inicio = limpo.search(/^@@ /m)
    const diff = inicio < 0 ? '' : limpo.slice(inicio).replace(/\n+$/, '')
    const linhas = diff.split('\n')
    return { caminho, mais: linhas.filter(l => l[0] === '+').length, menos: linhas.filter(l => l[0] === '-').length, diff, patch: `diff --git ${bloco}` }
  })
}

// Os hunks em pedacos que um Code desenha: o hunk maior que o limite vira varios, cada um com o
// cabecalho recontado. ponytail: a linha acima de 2000 caracteres e cortada
export function pedacos(diff: string) {
  const fora: string[] = []
  for (const hunk of diff.split(/\n(?=@@ )/)) {
    if (hunk.length <= LIMITE_DO_CODE) {
      fora.push(hunk)
      continue
    }
    const [cabecalho, ...linhas] = hunk.split('\n')
    // o hunk maior que o limite sempre abre com o cabecalho @@ e as duas contagens
    let [velha, nova] = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(cabecalho!)!.slice(1).map(Number) as [number, number]
    let parte: string[] = []
    let tamanho = 0
    const fecha = () => {
      const velhas = parte.filter(l => l[0] !== '+' && l[0] !== '\\').length
      const novas = parte.filter(l => l[0] !== '-' && l[0] !== '\\').length
      fora.push(`@@ -${velha},${velhas} +${nova},${novas} @@\n${parte.join('\n')}`)
      velha += velhas
      nova += novas
      parte = []
      tamanho = 0
    }
    for (const linha of linhas.map(l => l.slice(0, 2000))) {
      if (parte.length > 0 && tamanho + linha.length + 1 > LIMITE_DO_CODE - 40) fecha()
      parte.push(linha)
      tamanho += linha.length + 1
    }
    if (parte.length > 0) fecha()
  }
  return fora
}
