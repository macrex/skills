// O contrato do $.state do painel da leva (hooks/register.js).
export type LevaTicket = {
  id: string
  titulo: string
  estado: 'pendente' | 'em-curso' | 'verde' | 'vermelho'
  reparos?: number
  testes?: string
  inicioEm?: number
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
  fechada: boolean
}

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
    'macrex-skills': { leva: Leva | null; agentes: LevaAgente[] }
  }
}
