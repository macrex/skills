// O contrato do $.state do painel da leva (hooks/register.js).
export type LevaTicket = {
  id: string
  titulo: string
  estado: 'pendente' | 'em-curso' | 'verde' | 'vermelho'
  reparos?: number
  testes?: string
}

export type Leva = {
  documento: string
  fase: string
  fases: string[]
  tickets: LevaTicket[]
  fechada: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'macrex-skills': { leva: Leva | null; agora: string[] }
  }
}
