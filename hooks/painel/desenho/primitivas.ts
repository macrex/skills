// As primitivas do desenho do pane, comuns a todas as abas: a raiz, a barra de abas, o cabecalho, a
// tela, o cartao, a linha larga e o diff de um arquivo. Puras: os elementos vem do $.ui.resolve e os
// efeitos, ligados ao $, das acoes que o nucleo monta.

import type { ElementTable, RenderElement, UiPressArgument } from 'claude-code'
import type { CodigoArquivo, LevaAgente, LevaItem, LevaTicket } from '../../../types/index.d.ts'
import { ABAS, LARANJA, FUNDO, CARTAO, TEXTO, APAGADO } from '../dominio/vocabulario.ts'
import type { Aba } from '../dominio/vocabulario.ts'
import { pedacos } from '../dominio/diff.ts'

// o que o h devolve, e uma parte de linha larga: o texto e as props do Text dele
export type Desenho = ReturnType<typeof h>
export type Parte = [string, Record<string, unknown>?]
// a linha do ticket e a do item: o portao e o tempo
export type ComPortao = { estado: LevaTicket['estado'] | LevaItem['estado']; detalhe?: string; reparos?: number; inicioEm?: number; fimEm?: number; custo?: number }
// o mobile nao tem Input: a aba Arquivos o pede como sempre pediu
export type Elementos = ElementTable<'terminal' | 'desktop' | 'vscode'>
// os efeitos dos botoes e do campo, que o nucleo liga ao $
export type Acoes = {
  trocarAba: (aba: Aba) => unknown
  limpar: () => unknown
  alternarDiff: (caminho: string) => unknown
  alternarPasta: (caminho: string) => unknown
  filtrar: (texto: string) => unknown
  copiar: (a: CodigoArquivo, press?: UiPressArgument) => unknown
  descartar: (caminho: string) => unknown
  parar: (a: LevaAgente) => unknown
  abrirTela: (url: string) => unknown
  abrirHistorico: () => unknown
  clear: () => unknown
  executar: (texto: string) => unknown
}
export type Primitivas = ReturnType<typeof primitivas>

export function primitivas(elementos: Elementos, { aba, arquivos, linhas, colunas }: { aba: Aba; arquivos: CodigoArquivo[]; linhas?: number; colunas?: number }, acoes: Acoes) {
  const { Box, Text, Button, Code, Input } = elementos
  // a barra de abas: os nomes sem moldura e sem numero, as inativas apagadas e a ativa sublinhada em
  // laranja (o Button nao tem cor, a linha e um Text da largura do nome)
  const abas = h(
    Box,
    { gap: 2, marginBottom: 1, flexWrap: 'wrap' },
    ...Object.entries(ABAS).map(([qual, nome]) => {
      const label = qual === 'codigo' && arquivos.length > 0 ? `${nome} (${arquivos.length})` : nome
      return h(
        Box,
        { flexDirection: 'column' },
        h(Button, { key: `aba:${qual}`, label, plain: true, ...(qual !== aba && { dimColor: true }), onPress: () => acoes.trocarAba(qual as Aba) }),
        qual === aba && h(Text, { color: LARANJA }, '━'.repeat(label.length)),
      )
    }),
  )
  // o fundo pinta o pane inteiro, nao so as linhas com texto: a raiz ocupa a altura do corpo
  const raiz = { flexDirection: 'column', backgroundColor: FUNDO, minHeight: linhas, paddingX: 2, paddingY: 1 }
  // a largura de dentro de um cartao: o corpo menos a margem da raiz e a do cartao
  const largura = (colunas ?? 64) - 8
  const apagado = (texto: string) => h(Text, { color: APAGADO }, texto)
  // o nome da aba em laranja, com o titulo embaixo, a esquerda; o rotulo e o valor grande (o
  // total) a direita. A marca do repositorio fica so na pagina da grill-tela
  const negrito = (texto: string) => h(Text, { bold: true, color: TEXTO }, texto)
  const cabecalho = (titulo: string | Desenho, rotulo: string, valor: string) =>
    h(
      Box,
      { justifyContent: 'space-between', alignItems: 'flex-end' },
      h(Box, { flexDirection: 'column', flexShrink: 1 }, h(Text, { color: LARANJA }, ABAS[aba]), typeof titulo === 'string' ? negrito(titulo) : titulo),
      h(Box, { flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 2 }, apagado(rotulo), negrito(valor)),
    )
  // a aba desenhada: as abas, o cabecalho e as secoes
  // o h devolve RenderNode ou null, e o Box e sempre o elemento
  const tela = (titulo: string | Desenho, rotulo: string, valor: string, ...secoes: unknown[]) => h(Box, raiz, abas, cabecalho(titulo, rotulo, valor), ...secoes) as RenderElement
  // cada secao e um cartao preenchido um tom abaixo do fundo, com o titulo apagado (ou o elemento dado)
  const cartao = (titulo: string | Desenho, ...filhos: unknown[]) =>
    h(Box, { flexDirection: 'column', backgroundColor: CARTAO, paddingX: 2, paddingY: 1, marginTop: 1 }, typeof titulo === 'string' ? apagado(titulo) : titulo, ...filhos)
  // uma linha de `larg` colunas: as partes da esquerda, espaco, as da direita; cada parte e
  // [texto, props]; sem lugar, a ultima parte da esquerda encolhe com …
  const linhaLarga = (larg: number, esquerda: Parte[], direita: Parte[], props: Record<string, unknown> = {}) => {
    const tam = (partes: Parte[]) => partes.reduce((n, [t]) => n + t.length, 0)
    const falta = tam(esquerda) + tam(direita) + 1 - larg
    const esq = falta > 0 ? esquerda.map(([t, p], i): Parte => (i === esquerda.length - 1 ? [`${t.slice(0, Math.max(1, t.length - falta - 1))}…`, p] : [t, p])) : esquerda
    const parte = ([t, p]: Parte) => h(Text, p ?? {}, t)
    return h(Text, { color: TEXTO, ...props }, ...esq.map(parte), h(Text, {}, ' '.repeat(Math.max(1, larg - tam(esq) - tam(direita)))), ...direita.map(parte))
  }
  // o diff de um arquivo da aba Diff, aberto na aba Diff ou na Arquivos; o cabecalho do diff aberto:
  // Copiar diff, com o patch inteiro, e Descartar
  const botoesDoDiff = (a: CodigoArquivo) =>
    h(
      Box,
      { gap: 2, paddingX: 1 },
      h(Button, { key: `diff:copiar:${a.caminho}`, label: 'Copiar diff', dimColor: true, onPress: (press: UiPressArgument) => acoes.copiar(a, press) }),
      h(Button, { key: `diff:descartar:${a.caminho}`, label: 'Descartar', dimColor: true, onPress: () => acoes.descartar(a.caminho) }),
    )
  const diffDe = (a: CodigoArquivo) => [botoesDoDiff(a), ...(a.diff ? pedacos(a.diff).map(source => h(Code, { source, format: 'diff', path: a.caminho })) : [apagado('  binário, sem diff de texto')])]
  return { Box, Text, Button, Code, Input, abas, raiz, largura, linhas, colunas, apagado, negrito, cabecalho, tela, cartao, linhaLarga, diffDe }
}
