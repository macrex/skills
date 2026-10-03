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

declare module 'claude-code' {
  interface PluginState {
    'macrex-skills': { leva: Leva | null; agentes: LevaAgente[]; skills: string[]; historico: LevaHistorico[] }
  }
}
