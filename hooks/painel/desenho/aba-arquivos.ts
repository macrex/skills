// A aba Arquivos: a arvore do projeto, com a pasta que abre e fecha no clique; o nome do arquivo
// novo vai em verde, o do alterado em amarelo, e a pasta fechada com algum deles leva o ponto. O
// arquivo com diff na aba Diff vira o botao › nome, que abre o diff embaixo dele; o Button nao tem
// cor, entao o ponto a esquerda, pendurado no recuo, marca novo ou alterado. Com o filtro, a
// arvore da lugar a lista plana dos caminhos que casam

import type { Arvore, CodigoArquivo } from '../../../types/index.d.ts'
import { TEXTO, VERDE, AMARELO } from '../dominio/vocabulario.ts'
import { nomeDa } from '../dominio/formato.ts'
import { linhasDaArvore } from '../dominio/arvore.ts'
import type { LinhaDaArvore } from '../dominio/arvore.ts'
import type { Acoes, Primitivas } from './primitivas.ts'

export function abaArquivos(
  { Box, Text, Button, Input, tela, cartao, apagado, diffDe }: Primitivas,
  { arvore, abertas, filtro, arquivos, abertos, raiz }: { arvore: Arvore | null; abertas: string[]; filtro: string; arquivos: CodigoArquivo[]; abertos: string[]; raiz: string },
  acoes: Acoes,
) {
  const todos = arvore?.arquivos ?? []
  const campo = h(Input, { key: 'arvore:filtro', placeholder: 'filtrar pelo caminho', value: filtro, onInput: acoes.filtrar, onSubmit: acoes.filtrar })
  // ponytail: a lista plana desenha todos os que casam; um teto entra se um repositorio grande pesar no pane
  const termo = filtro.trim().toLowerCase()
  const linhas = termo
    ? todos.filter(c => c.toLowerCase().includes(termo)).map(caminho => ({ caminho, nome: caminho, nivel: 0, pasta: false, doFiltro: true }))
    : linhasDaArvore(todos, abertas)
  const vazio = arvore ? (termo ? 'nenhum caminho casa com o filtro' : 'nenhum arquivo no projeto') : 'lendo a árvore…'
  // a arvore comeca 2 colunas para dentro: e onde cabe o ponto do arquivo com diff na raiz
  const recuo = (nivel: number) => '  '.repeat(nivel + 1)
  // so desenha com linhas, e elas so vem com a arvore lida
  const noDaArvore = ({ caminho, nome, nivel, pasta, doFiltro }: LinhaDaArvore) => {
    if (!pasta) {
      const cor = arvore!.novos.includes(caminho) ? VERDE : arvore!.mudados.includes(caminho) ? AMARELO : TEXTO
      const comDiff = arquivos.find(a => a.caminho === caminho)
      if (!comDiff) return h(Text, { color: cor }, `${doFiltro ? '' : `${recuo(nivel)}  `}${nome}`)
      const aberto = abertos.includes(caminho)
      return h(
        Box,
        { flexDirection: 'column' },
        h(
          Box,
          {},
          h(Text, {}, recuo(nivel).slice(2)),
          h(Text, { color: cor }, cor === TEXTO ? '  ' : '• '),
          h(Button, { key: `no:${caminho}`, plain: true, label: `${aberto ? '⌄' : '›'} ${nome}`, onPress: () => acoes.alternarDiff(caminho) }),
        ),
        ...(aberto ? diffDe(comDiff) : []),
      )
    }
    const aberta = abertas.includes(caminho)
    const alternar = () => acoes.alternarPasta(caminho)
    const mexida = !aberta && [...arvore!.novos, ...arvore!.mudados].some(c => c.startsWith(caminho))
    return h(
      Box,
      { gap: 2 },
      // o no da pasta com prefixo proprio, para nao se confundir com o campo do filtro
      h(Button, { key: `no:${caminho}`, plain: true, label: `${recuo(nivel)}${aberta ? '▾' : '▸'} ${nome}`, onPress: alternar }),
      mexida && h(Text, { color: AMARELO }, '•'),
    )
  }
  return tela(
    nomeDa(raiz),
    'arquivos',
    String(todos.length),
    arvore?.semGit
      ? cartao(null, apagado('a sessão não está num repositório git, ou o git não rodou: não há árvore para listar'))
      : cartao(null, campo, ...(linhas.length > 0 ? linhas.map(noDaArvore) : [apagado(vazio)])),
  )
}
