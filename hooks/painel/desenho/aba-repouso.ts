// O repouso: so o Claude dormindo, no meio do pane; a caixa de dentro mantem o desenho alinhado.

import type { RenderElement } from 'claude-code'
import { RONCO, ZS, BONECO, QUIETO_GRANDE, LARGURA_DO_GRANDE, LINHAS_DA_FRASE, LINHAS_DO_BONECO, LARANJA, LINHAS_DAS_ABAS } from '../dominio/vocabulario.ts'
import type { Primitivas } from './primitivas.ts'

export function abaRepouso({ Box, Text, raiz, abas, linhas, colunas }: Primitivas, { agora }: { agora: number }) {
  // o indice e o resto do tamanho: sempre um quadro
  const zs = ZS[Math.floor(agora / RONCO) % ZS.length]!
  // as linhas abaixo das abas
  const livres = linhas == null ? LINHAS_DA_FRASE : linhas - LINHAS_DAS_ABAS
  const alto = livres >= LINHAS_DO_BONECO
  const comFrase = livres >= LINHAS_DA_FRASE && (colunas ?? LARGURA_DO_GRANDE) >= LARGURA_DO_GRANDE
  // no pane baixo, so os dois z de baixo e o boneco sem as pernas: o corpo fica, e e ele que
  // fecha os olhos por baixo
  const desenho = (alto ? [...zs, ...BONECO] : [...zs.slice(1), ...BONECO.slice(0, 2)]).map(l => l.padEnd(11))
  const dosZs = alto ? 3 : 2
  return h(
    Box,
    raiz,
    abas,
    h(
      Box,
      { flexDirection: 'column', flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
      comFrase && h(Box, { marginBottom: 2 }, h(Text, { bold: true, color: 'gray' }, QUIETO_GRANDE)),
      h(Box, { flexDirection: 'column' }, ...desenho.map((l, i) => h(Text, { color: LARANJA, dimColor: i < dosZs }, l))),
    ),
  ) as RenderElement
}
