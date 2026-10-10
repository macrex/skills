// A aba Grill: cada pergunta inteira com a resposta embaixo, o entendimento e a linha da leva.

import type { Grill, GrillPergunta } from '../../../types/index.d.ts'
import { LARANJA, APAGADO, VERDE } from '../dominio/vocabulario.ts'
import { duracao } from '../dominio/formato.ts'
import type { Acoes, Primitivas } from './primitivas.ts'

// o andamento do grill e o grill na tela: a URL dele, que segue la depois do sim e do CLI, e o Abrir
export function daPaginaDoGrill({ Box, Button, Code, cartao, apagado }: Primitivas, agora: number, acoes: Acoes) {
  const andamento = (g: Grill): [string, string] => [g.documento ? 'concluído' : 'em curso', duracao((g.fim ?? agora) - g.inicio)]
  const cartaoDaTela = (g: Grill | null) =>
    g?.tela &&
    cartao(h(Box, { gap: 2 }, apagado('Grill na tela'), h(Button, { key: 'tela:abrir', label: 'Abrir', dimColor: true, onPress: () => acoes.abrirTela(g.tela!) })), h(Code, { source: g.tela }))
  return { andamento, cartaoDaTela }
}

export function abaGrill(kit: Primitivas, { ultimoGrill, agora }: { ultimoGrill: Grill | null; agora: number }, acoes: Acoes) {
  const { Box, Text, Button, Code, tela, cartao, apagado, negrito } = kit
  const { andamento, cartaoDaTela } = daPaginaDoGrill(kit, agora, acoes)
  const g = ultimoGrill
  const historicoDeGrills = h(Button, { key: 'grill:historico', label: 'Histórico', dimColor: true, onPress: () => acoes.abrirHistorico() })
  const comHistorico = (titulo: string) => h(Box, { gap: 2 }, negrito(titulo), historicoDeGrills)
  if (!g) return tela(comHistorico('Nenhum grill neste workspace'), 'perguntas', '0', cartao(null, apagado('o /faz <pedido> abre um')))
  const resposta = (p: GrillPergunta) =>
    p.resposta == null
      ? h(Text, { color: LARANJA }, '▸ aguardando')
      : h(Text, { color: p.resposta === 'sem resposta' ? APAGADO : VERDE }, `${p.resposta === 'sem resposta' ? '·' : '✓'} ${p.resposta}`)
  const par = (p: GrillPergunta, i: number) =>
    h(Box, { flexDirection: 'column', marginTop: i > 0 ? 1 : 0 }, apagado(p.tema), negrito(p.pergunta), resposta(p))
  const respondidas = g.perguntas.filter(p => p.resposta != null).length
  return tela(
    comHistorico(g.pedido),
    ...andamento(g),
    cartaoDaTela(g),
    cartao(`Perguntas e respostas · ${respondidas}/${g.perguntas.length}`, ...(g.perguntas.length > 0 ? g.perguntas.map(par) : [apagado('nenhuma pergunta ainda')])),
    g.documento && cartao('Entendimento', h(Text, { color: VERDE }, g.documento)),
    // o Executar leva o texto exato a caixa de envio: copiado da tela, o terminal parte a linha
    // longa e um nome de skill partido nao autoriza a skill. O grill volta do store depois do
    // /clear do Clear, entao o Executar segue valendo na sessao nova
    // a key e o alvo do scroll do fim do grill
    g.linha &&
      h(
        Box,
        { key: 'grill:prompt', flexDirection: 'column' },
        cartao(
          h(
            Box,
            { gap: 2 },
            apagado('Prompt'),
            h(Button, { key: 'grill:clear', label: 'Clear', dimColor: true, onPress: () => acoes.clear() }),
            h(Button, { key: 'grill:colar', label: 'Executar', dimColor: true, onPress: () => acoes.executar(g.linha!) }),
          ),
          h(Code, { source: g.linha }),
        ),
      ),
  )
}
