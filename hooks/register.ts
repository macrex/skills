// Painel da leva: o mod do Claude Code que desenha a leva do workspace num pane ao lado da
// conversa. Carregado por "modules" no hooks/hooks.json; sem JSX (o arquivo e .ts), as arvores
// saem do `h` global.
//
// A leva grava o estado pela ferramenta faz_marco (quando, dizem skills/faz/references/painel.md
// e, para os marcos do grill, interrogatorio.md), no $.store do plugin, um por workspace; o
// desenho le do $.state (types/index.d.ts), que sobrevive a hot reload. Os agentes e workflows vem
// dos hooks do Agent, do Workflow, do fim de turno e da notificacao de tarefa, e os agentes se
// acertam pela lista oficial ($.agent.list) a cada segundo da leva. O grill do /faz
// (movimento 1) vem antes da leva: os marcos
// grill, entendimento e linha, as perguntas do AskUserQuestion pelo tema (o header) e as rodadas
// da grill-tela pelo estado da pagina dela. Com a opcao grill_canal = tela, o AskUserQuestion do
// grill vai a pagina da grill-tela (pelaTela).
//
// Esta e a raiz: cria o contexto e chama o registro de cada feature (painel/features/) numa ordem
// que e contrato: os on() se encadeiam na ordem de registro (ver o ADR do painel). So recebe o
// contexto o registro que le o estado compartilhado.

import type { On, PluginOptions } from 'claude-code'
import { soComPedido } from './so-com-pedido.ts'
import type { Contexto } from './painel/estado.ts'
import { registrarSessao, registrarMarcosEGrill, registrarPermissaoETurno, registrarFerramentas, registrarPane } from './painel/features/nucleo.ts'
import { registrarAgentes, registrarTeammate, registrarNotificacao } from './painel/features/agentes.ts'
import { registrarMedida, registrarCompactacao } from './painel/features/leva.ts'
import { registrarForaDoPane } from './painel/features/fora-do-pane.ts'

export function register(on: On, options: PluginOptions) {
  // o hooks.json aceita um modulo so: o so-com-pedido entra por aqui, quando a opcao o liga
  if (options?.so_com_pedido) soComPedido(on)
  const ctx: Contexto = { canalTela: options?.grill_canal === 'tela', tiques: [], herdado: null, limpo: false, noFaz: false }
  registrarSessao(on, ctx) // session.start, session.end, classic.SessionStart
  registrarMarcosEGrill(on, ctx) // tool.call do marco, skill.prompt, tool.call da Skill e do AskUserQuestion
  registrarAgentes(on) // tool.call do Agent e do Workflow
  registrarPermissaoETurno(on) // classic.PermissionRequest, turn.complete
  registrarMedida(on) // session.measure
  registrarTeammate(on) // classic.TeammateIdle
  registrarCompactacao(on) // session.compact
  registrarNotificacao(on) // session.append
  registrarFerramentas(on, ctx) // tool.call sem filtro
  registrarPane(on, ctx) // command.run, ui.render do Pane
  registrarForaDoPane(on) // ui.render do AbovePrompt, do Spinner e do ToolUse
}
