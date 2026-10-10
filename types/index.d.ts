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
  // no modo inline, o custo da sessao (US$) no primeiro marco ticket e o gasto ate o portao
  custoInicio?: number
  custo?: number
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
  // o custo da sessao (US$) no inicio, rebaseado na retomada, e o da leva medido desde ele
  // (session.measure e fechamento); ausentes onde a sessao nao tem custo
  custoInicio?: number
  custo?: number
  // o aviso da janela de 5 h em 90% ja saiu nesta leva
  avisoDaJanela?: boolean
}

// A ultima medida da sessao (session.measure); a janela de 5 h so vem na assinatura.
export type LevaMedida = {
  custo?: number
  contexto?: number
  janela?: { kind: string; percentUsed: number; resetsAt?: string }
}

// Uma leva fechada no historico do workspace, com os modelos distintos dos agentes dela.
export type LevaHistorico = Leva & { modelos: string[] }

export type LevaAgente = {
  id: string
  tipo: 'agente' | 'workflow'
  nome: string
  modelo: string
  // aguardando: waiting ou idle na lista oficial ($.agent.list)
  estado: 'rodando' | 'aguardando' | 'concluido' | 'falhou' | 'parado'
  inicio: number
  duracao?: number
  agentId?: string
  taskId?: string
  // a hora da ultima ferramenta que o sub-agente chamou
  atividade?: number
  // veio da sessao de antes do /clear ou do /resume
  herdado?: boolean
  // aberto sem leva aberta: so alimenta o alerta, fora do cartao Sub-agentes
  foraDaLeva?: boolean
}

// Uma pergunta do grill pelo tema (o header do AskUserQuestion); sem resposta ainda, aguardando.
export type GrillPergunta = {
  id: string
  pergunta: string
  tema: string
  resposta?: string
}

// O grill do movimento 1 do /faz (marcos grill, entendimento e linha).
export type Grill = {
  pedido: string
  inicio: number
  perguntas: GrillPergunta[]
  // o documento do entendimento gravado, e a hora em que o grill terminou
  documento?: string
  fim?: number
  // a linha da leva que o /faz imprimiu ao fim do grill (marco linha)
  linha?: string
  // fora da aba Painel (o inicio da leva); a aba Grill o guarda ate o Limpar do Painel
  fora?: boolean
  // a URL da pagina da grill-tela que o grill consulta, enquanto ela esta aberta
  tela?: string
  // no canal tela, o grill que voltou ao CLI: o AskUserQuestion dele nao vai mais a pagina
  canal?: 'cli'
}

// A base da aba Diff, tirada no inicio da sessao.
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
  // o bloco inteiro do arquivo no diff do git, que o Copiar diff leva
  patch: string
}

// A arvore do projeto da aba Arquivos: os caminhos que o git nao ignora, e os criados na sessao;
// semGit, a raiz nao esta num repositorio git ou o git nao rodou.
export type Arvore = {
  arquivos: string[]
  novos: string[]
  // os que mudaram desde a base da sessao (o diff contra o commit dela)
  mudados: string[]
  semGit?: boolean
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
      // o grill foi aberto nesta sessao: so ele leva o AskUserQuestion a pagina
      grillDaSessao: boolean
      aba: 'painel' | 'codigo' | 'grill' | 'tickets' | 'uso' | 'arquivos'
      // por loop: 'sessao' para o principal, o agentId para cada sub-agente
      uso: Record<string, UsoDoLoop>
      medida: LevaMedida | null
      base: CodigoBase | null
      codigo: CodigoArquivo[]
      abertos: string[]
      arvore: Arvore | null
      // as pastas abertas da arvore, com / no fim
      pastas: string[]
      filtro: string
      // as chaves dos alertas ja avisados num toast
      alertados: string[]
      // a permissao pendente e o loop que a pediu (sem agentId, o principal)
      permissao: { ferramenta: string; agentId?: string } | null
    }
  }
}
