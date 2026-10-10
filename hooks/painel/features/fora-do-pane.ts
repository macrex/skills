// O painel fora do pane: a faixa acima do prompt, o spinner e a linha do marco na conversa.

import { atom, read } from 'claude-code'
import type { EngineInterface, On, RenderElement } from 'claude-code'
import { AMARELO, VERMELHO, ROTULO } from '../dominio/vocabulario.ts'
import type { Marco } from '../dominio/vocabulario.ts'
import { ticketDaLeva, duracao } from '../dominio/formato.ts'
import { alertas } from '../dominio/alertas.ts'

// os matchers dos on() moram neste arquivo: o validate so le o valor de um const declarado nele
const PANE = 'painel-macrex'
const MARCO = 'mcp__macrex-skills__faz_marco'

const LEVA = atom({ plugin: 'macrex-skills', key: 'leva' }, null)
// Os agentes e workflows da leva, so na sessao (nao vao ao $.store).
const AGENTES = atom({ plugin: 'macrex-skills', key: 'agentes' }, [])
// A permissao que o Claude Code pediu e ainda espera o usuario, com o loop que a pediu, so na sessao.
// ponytail: uma por vez; duas pendentes juntas mostram a ultima
const PERMISSAO = atom({ plugin: 'macrex-skills', key: 'permissao' }, null)

// o alertasDe e copia do do nucleo: o validate nao segue o $ por um import
const alertasDe = async ($: EngineInterface) => alertas({ leva: await read($, LEVA), agentes: await read($, AGENTES), permissao: await read($, PERMISSAO), agora: await $.clock.now() })

export function registrarForaDoPane(on: On) {
  // a faixa acima do prompt: a leva aberta numa linha, sem abrir o pane, e embaixo a linha do
  // alerta, que vale com ou sem leva; durante o turno a linha da leva sai, porque o spinner ja leva
  // a fase e o ticket. O que outro mod desenha na faixa segue embaixo
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const leva = await read($, LEVA)
    const comLeva = Boolean(leva && !leva.fechada) && !e.props.isWorking
    const lista = await alertasDe($)
    if (e.props.hasSurvey || (!comLeva && lista.length === 0)) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const doAlerta = lista.length > 0 && h(Text, { color: lista.some(a => a.vermelho) ? VERMELHO : AMARELO, wrap: 'truncate-end' }, lista.map(a => a.texto).join(' · '))
    // o h devolve RenderNode ou null, e o Box e sempre o elemento
    if (!comLeva) return h(Box, { flexDirection: 'column' }, doAlerta, await next(e)) as RenderElement
    const aberto = (await $.ui.panes()).some(pane => pane.id === PANE)
    // comLeva so com a leva aberta, que tem inicio
    const contagem = ticketDaLeva(leva!)
    const partes = ['Leva', ROTULO[leva!.fase] ?? leva!.fase, ...(contagem ? [contagem] : []), duracao((await $.clock.now()) - leva!.inicio!)]
    // o botao no terminal e [ Abrir painel ], mais o espaco antes dele; sem lugar nem para Leva, sai
    const doBotao = aberto ? 0 : 'Abrir painel'.length + 5
    const cabe = (larg: number) => partes.join(' · ').length <= larg
    while (partes.length > 1 && !cabe(e.props.bodyColumns - doBotao)) partes.pop()
    const comBotao = !aberto && cabe(e.props.bodyColumns - doBotao)
    const abrir = async () => {
      await $.ui.open({ id: PANE, title: 'Leva' })
      $.ui.invalidate('ui.render')
    }
    return h(
      Box,
      { flexDirection: 'column' },
      h(Box, { gap: 1 }, h(Text, { wrap: 'truncate-end' }, partes.join(' · ')), comBotao && h(Button, { key: 'faixa:abrir', label: 'Abrir painel', dimColor: true, onPress: abrir })),
      doAlerta,
      await next(e),
    ) as RenderElement
  })

  // a linha que anima durante o turno leva a fase e o ticket da leva aberta, antes da reticencia
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const leva = await read($, LEVA)
    if (!leva || leva.fechada) return next(e)
    const contagem = ticketDaLeva(leva)
    return next({ ...e, props: { ...e.props, suffix: ` · ${ROTULO[leva.fase] ?? leva.fase}${contagem ? ` · ${contagem}` : ''}${e.props.suffix}` } })
  })

  // o marco na conversa: uma linha apagada no lugar da linha generica da ferramenta
  on('ui.render', { component: 'ToolUse', props: { tool: MARCO } }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    // a entrada da ferramenta do proprio plugin chega sem tipo: e a do inputSchema
    const m = (e.props.input ?? {}) as Partial<Marco>
    const resumo = [m.fase, m.ticket != null && `ticket ${m.ticket}`, m.portao].filter(Boolean).join(' · ')
    return h(Text, { dimColor: true, ...(e.props.isErrored && { color: VERMELHO }) }, `◆ marco ${m.marco}${resumo ? ` · ${resumo}` : ''}`) as RenderElement
  })
}
