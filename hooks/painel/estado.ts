// O estado do painel: o tipo do $.state, o contexto das features e as chaves do $.store. Os atoms ficam no arquivo que os le: o validate so
// segue o atom declarado no mesmo arquivo do read e do update.

import type { EngineInterface, PluginState } from 'claude-code'

export type Estado = PluginState['macrex-skills']

// O estado que cruza os hooks, fora do $.state: a raiz cria um a cada register e o passa as
// features; o hot reload roda o register de novo e o recomeca.
export type Contexto = {
  // o canal do grill na opcao do plugin (/config); no tela, o AskUserQuestion do grill vai a pagina
  readonly canalTela: boolean
  // os tiques do session.start, que o session.start seguinte cancela antes de ligar os dele: sem
  // isso, cada um somava mais um tique por segundo
  tiques: ReturnType<EngineInterface['clock']['every']>[]
  // o que so a sessao guarda, da que acaba pelo /clear ou pelo /resume para a nova
  herdado: (Pick<Estado, 'aba' | 'base' | 'codigo' | 'abertos' | 'arvore' | 'pastas' | 'filtro' | 'uso' | 'agentes'> & { grill: string | undefined }) | null
  // o Limpar apertado: os marcos da leva ou do grill que saiu seguem sem recusa
  limpo: boolean
  // a /faz invocada, que o grilling seguinte consome
  noFaz: boolean
}

export const chave = (cwd: string) => `leva:${cwd}`
export const chaveDoHistorico = (cwd: string) => `levas:${cwd}`
export const chaveDoGrill = (cwd: string, id: string) => `grill:${cwd}:${id}`
// a chave de quando o grill era um por workspace, lida uma vez e trocada pela do id
export const chaveAntigaDoGrill = (cwd: string) => `grill:${cwd}`
export const GRILLS_POR_WORKSPACE = 10
