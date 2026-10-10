// A grill-tela vista pelo mod: a rota da API, o id do grill e as rodadas nas duas formas.

import type { BuiltinToolInputs } from 'claude-code'

// a API de um grill fica debaixo do caminho dele: a mesma regra do cliente da grill-tela
export const rotaDa = (url: string, rota: string) => url.replace(/\/?\?t=/, `/api/${rota}?t=`)
// o carimbo da sessao do grill na URL, o --id do --retomar
export const idDaTela = (url: string | undefined) => /\/(\d{8}-\d{6})\?/.exec(url ?? '')?.[1]

// O estado da pagina da grill-tela (a rota estado), no que o mod le dele.
type RodadaDaTela = { rodada: number; questoes: { id: string; titulo: string; cabecalho: string }[] }
export type RespostaDaTela = { id: string; marca?: string; escolha?: string | null; comentario?: string | null }
export type EstadoDaTela = {
  fase?: string
  rodada?: RodadaDaTela
  historico?: { rodada: RodadaDaTela; respostas?: RespostaDaTela[]; terminal?: boolean }[]
}
// a linha que o aguardar da grill-tela imprime por ultimo
export type AvisoDaTela = { tipo: 'pendente' | 'cli' } | { tipo: 'texto'; texto: string } | { tipo: 'rodada'; rodada: number; respostas: RespostaDaTela[] }

const RECOMENDADA = /\s*\(Recommended\)$/
// a resposta sem escolha volta com o rotulo do botao que o usuario apertou na pagina
export const NAO_RESPOSTA: Record<string, string> = { delegado: 'Decida você', esclarecer: 'Não entendi', adiado: 'Adiar' }
export type Perguntas = BuiltinToolInputs['AskUserQuestion']['questions']
export type QuestaoDaTela = ReturnType<typeof questoesDaTela>[number]
// A rodada do dialogo na forma da grill-tela: a recomendada e a do (Recommended), sem ela a primeira.
export function questoesDaTela(questions: Perguntas) {
  return questions.map((q, i) => {
    const marcada = Math.max(0, q.options.findIndex(o => RECOMENDADA.test(o.label)))
    return {
      id: `Q${i + 1}`,
      cabecalho: q.header || q.question,
      titulo: q.question,
      opcoes: q.options.map((o, j) => ({ rotulo: o.label.replace(RECOMENDADA, ''), descricao: o.description, recomendada: j === marcada, ...(o.preview && { previa: o.preview }) })),
    }
  })
}
// As respostas do dialogo na forma que a grill-tela grava: a opcao recomendada e aceito, outra opcao
// ou o texto livre e outra; a questao sem resposta fica de fora.
export function respostasDaTela(questions: Perguntas, questoes: QuestaoDaTela[], answers: Record<string, string>) {
  return questions.flatMap((q, i) => {
    const dada = String(answers[q.question] ?? '').trim()
    if (!dada) return []
    // questoes e a rodada que o questoesDaTela fez destas questions, uma por uma
    const opcao = questoes[i]!.opcoes.find(o => o.rotulo === dada.replace(RECOMENDADA, ''))
    return [{ id: questoes[i]!.id, marca: opcao?.recomendada ? 'aceito' : 'outra', escolha: opcao?.rotulo ?? dada, comentario: null }]
  })
}
