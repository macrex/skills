// So com pedido: git commit, git push, gh pr create e gh pr merge so rodam no turno em que o
// usuario pediu, digitando commit, push ou publica/publish na mensagem, ou no turno do /cpv. Vale
// para o turno inteiro, sub-agentes inclusive, e cai no proximo prompt (a resposta a um
// AskUserQuestion nao e prompt, por isso a /cpv pergunta por ele). Ligado pela opcao
// so_com_pedido do plugin.

import type { EngineInterface, Hook, On } from 'claude-code'

// a palavra do pedido: commit, commita, commitar, push, publica, publicar, publish
const PEDIDO = /\b(commit\w*|push\w*|publi(ca|sh)\w*)\b/i
// as opcoes entre o git (ou o gh) e o subcomando, com ou sem valor, por = ou espaco, e o valor
// com aspas no meio: -C <dir>, -c user.name="A B", --no-pager, --repo=x, -R o/r. O valor por
// espaco nao comeca com -, para a opcao seguinte nao poder ser lida como valor (sem isso, o
// backtracking cresce exponencial com o numero de opcoes)
const OPCOES = String.raw`(?:\s+--?[\w-]+(?:(?:=|\s(?!-))(?:[^\s"']|"[^"]*"|'[^']*')+)?)*`
// em qualquer ponto do comando, para pegar o encadeado por ;, &&, | e o que vem dentro de $( ); a
// aspa depois do executavel e a do caminho com espaco do PowerShell (& "C:\...\git.exe" commit)
const GRAVA = new RegExp(String.raw`\bgit(?:\.exe)?["']?${OPCOES}\s+(?:commit|push)\b|\bgh(?:\.exe)?["']?${OPCOES}\s+pr\s+(?:create|merge)\b`, 'i')
// o /cpv digitado: o prompt.submit dele pode vir depois do skill.prompt, e nao pode desfaze-lo
const CPV = /^\s*\/(?:macrex-skills:)?cpv\b/
const DO_USUARIO = ['composer', 'bridge']
const MOTIVO = 'o usuario nao pediu commit/push nesta mensagem; deixe na working tree e diga o que esta pronto'

// o pedido do turno corrente, do modulo: um hot reload o derruba, e o commit volta a pedir
let pediu = false

// a mensagem digitada decide o turno; a de plugin, de notificacao ou de outra sessao abre um
// turno sem pedido. A que chega dentro de um turno rodando (turnId) entra nele: a digitada so
// acrescenta o pedido, nunca o tira, e a de outra origem nao mexe
type DoPrompt = Parameters<Hook<'prompt.submit'>>
async function aoPrompt($: EngineInterface, e: DoPrompt[1], next: DoPrompt[2]) {
  if (DO_USUARIO.includes(e.origin.kind)) {
    const pede = PEDIDO.test(e.text) || CPV.test(e.text)
    pediu = e.turnId == null ? pede : pediu || pede
  } else if (e.turnId == null) pediu = false
  return next(e)
}

// o /cpv e o pedido: a skill cpv, com ou sem o prefixo do plugin (o matcher a escolhe, porque o
// hooks/painel/features/nucleo.ts ja tem o skill.prompt sem matcher)
// generico: serve aos dois matchers, cada um com o evento e o next dele
async function aoCpv<E, R>($: EngineInterface, e: E, next: (e: E) => Promise<R>) {
  pediu = true
  return next(e)
}

// generico: serve ao Bash e ao PowerShell, cada um com o evento e o next dele
async function barra<E extends { readonly command?: unknown }, R>($: EngineInterface, e: E, next: (e: E) => Promise<R>) {
  return !pediu && GRAVA.test(String(e.command ?? '')) ? { deny: MOTIVO } : next(e)
}

export function soComPedido(on: On) {
  on('prompt.submit', aoPrompt)
  on('skill.prompt', { skill: 'cpv' }, aoCpv)
  on('skill.prompt', { skill: 'macrex-skills:cpv' }, aoCpv)
  on('tool.call', { tool: 'Bash' }, barra)
  on('tool.call', { tool: 'PowerShell' }, barra)
}
