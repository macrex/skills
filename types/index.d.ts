// O contrato do $.state do painel da leva (hooks/register.js).
export type LevaTicket = {
  id: string
  titulo: string
  estado: 'pendente' | 'em-curso' | 'verde' | 'vermelho'
  reparos?: number
  testes?: string
  notas?: string
  inicioEm?: number
  fimEm?: number
}

// Um item da revisao, das correcoes ou da qualidade (marco item).
export type LevaItem = {
  fase: 'revisao' | 'correcoes' | 'qualidade'
  titulo: string
  estado: 'em-curso' | 'verde' | 'vermelho'
  detalhe?: string
  inicioEm: number
  fimEm?: number
}

export type Leva = {
  documento: string
  fase: string
  fases: string[]
  entradas?: Record<string, number>
  inicio?: number
  fim?: number
  tickets: LevaTicket[]
  itens?: LevaItem[]
  sujos?: string[]
  modo?: 'inline' | 'sub-agents' | 'workflow'
  fechada: boolean
  // a hora em que o /cpv rodou depois do fechamento
  cpv?: number
}

// Uma leva fechada no historico do workspace, com os modelos distintos dos agentes dela.
export type LevaHistorico = Leva & { modelos: string[] }

export type LevaAgente = {
  id: string
  tipo: 'agente' | 'workflow'
  nome: string
  modelo: string
  estado: 'rodando' | 'concluido' | 'falhou' | 'parado'
  inicio: number
  duracao?: number
  agentId?: string
  taskId?: string
}

// Uma pergunta do grill pelo tema (o header do AskUserQuestion); sem resposta ainda, aguardando.
export type GrillPergunta = {
  id: string
  pergunta: string
  tema: string
  resposta?: string
}

// O grill do movimento 1 do /faz (marcos grill e entendimento).
export type Grill = {
  pedido: string
  inicio: number
  perguntas: GrillPergunta[]
  // o documento do entendimento gravado, e a hora em que o grill terminou
  documento?: string
  fim?: number
  // a linha da leva que o /faz imprimiu ao fim do grill (marco linha)
  linha?: string
  // fora da aba Painel (o inicio da leva ou o /clear); a aba Grill o guarda
  fora?: boolean
}

// A base da aba Codigo, tirada no inicio da sessao.
export type CodigoBase = {
  raiz: string
  // o commit do working tree de entao (git stash create), ou o HEAD se estava limpo
  commit: string
  // os nao rastreados de entao, que ficam fora da lista
  soltos: string[]
}

// Um arquivo que a sessao mudou: os hunks do diff contra a base.
export type CodigoArquivo = {
  caminho: string
  mais: number
  menos: number
  diff: string
}

// Os tokens de um loop (o principal ou um sub-agente) somados turno a turno, e o modelo do ultimo.
export type UsoDoLoop = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  modelo: string
}

declare module 'claude-code' {
  interface PluginState {
    'macrex-skills': {
      leva: Leva | null
      agentes: LevaAgente[]
      skills: string[]
      historico: LevaHistorico[]
      grill: Grill | null
      aba: 'painel' | 'codigo' | 'grill' | 'tickets' | 'uso'
      // por loop: 'sessao' para o principal, o agentId para cada sub-agente
      uso: Record<string, UsoDoLoop>
      base: CodigoBase | null
      codigo: CodigoArquivo[]
      abertos: string[]
    }
  }
}
