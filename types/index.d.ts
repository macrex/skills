// O contrato do $.state do painel da leva (hooks/register.ts).
export type LevaTicket = {
  id: string
  titulo: string
  estado: 'pendente' | 'em-curso' | 'verde' | 'vermelho'
  reparos?: number
  testes?: string
  notas?: string
  inicioEm?: number
  fimEm?: number
  // a previsao do ticket em minutos, que a leva da no marco tickets antes do implement, e o perfil
  // dele, que agrupa os tickets na calibracao do time.md
  previsao?: number
  perfil?: 'texto' | 'unidade' | 'tela' | 'pesado'
  // a onda do ticket (1, 2, ...), que a previsao da leva soma pelo ticket mais longo de cada uma
  onda?: number
  // de onde veio a previsao: a mediana do perfil no time.md (o painel), o motivo do agente que saiu
  // dela, ou o julgamento do agente sem base
  fonte?: 'mediana' | 'motivo' | 'agente'
  // no modo inline, o custo da sessao (US$) no primeiro marco ticket e o gasto ate o portao; nos
  // paralelos, a soma dos turnos dos agentes que marcaram o ticket, pelos tokens e o preco do modelo
  custoInicio?: number
  custo?: number
  agentes?: string[]
}

// Um item da implementacao (a Conciliacao), da revisao, das correcoes ou da qualidade (marco item).
export type LevaItem = {
  fase: 'implement' | 'revisao' | 'correcoes' | 'qualidade'
  titulo: string
  estado: 'em-curso' | 'verde' | 'vermelho'
  detalhe?: string
  inicioEm: number
  fimEm?: number
  // o tempo em que o item ficou parado esperando (a conciliacao esperando o ticket seguinte), que o
  // tempo dele nao conta, e a hora em que a espera aberta comecou
  esperaMs?: number
  esperaDesde?: number
  // o custo da sessao (US$) no primeiro marco do item e no marco com o portao. Os dois pontos, e nao
  // a diferenca como no ticket: o desenho cruza os itens da fase e soma a fase do primeiro ao ultimo
  custoInicio?: number
  custoFim?: number
}

export type Leva = {
  documento: string
  fase: string
  fases: string[]
  entradas?: Record<string, number>
  inicio?: number
  fim?: number
  // a previsao da leva inteira em minutos, do inicio ao fechamento (marco tickets)
  previsao?: number
  // os intervalos [inicio, fim] em que a leva esperou o usuario (permissao pendente, ou a sessao
  // parada ate ele digitar), que o tempo da maquina desconta
  esperas?: [number, number][]
  // a entrada na fase fechamento ja gravou a leva no time.md da raiz, que vai no commit squash
  noTimeMd?: boolean
  tickets: LevaTicket[]
  itens?: LevaItem[]
  sujos?: string[]
  modo?: 'inline' | 'sub-agents' | 'workflow'
  // o branch da leva (marco fase implement), que as abas Diff e Arquivos seguem enquanto o git o acha
  branch?: string
  fechada: boolean
  // a hora em que o /cpv rodou depois do fechamento
  cpv?: number
  // o custo da sessao (US$) no inicio, rebaseado na retomada, e o da leva medido desde ele
  // (session.measure e fechamento); ausentes onde a sessao nao tem custo
  custoInicio?: number
  custo?: number
  // o aviso da janela de 5 h em 90% ja saiu nesta leva
  avisoDaJanela?: boolean
  // a hora do ultimo marco aplicado; o hooks/so-com-pedido.ts libera o commit da leva por ela
  marcadaEm?: number
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
  // a chave do grill no $.store, ao lado da raiz do workspace
  id: string
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
  // a pagina voltou ao CLI ou terminou: a consulta dela para
  telaFim?: boolean
  // no canal tela, o grill que voltou ao CLI: o AskUserQuestion dele nao vai mais a pagina
  canal?: 'cli'
  // a URL da sessao que o registrar da grill-tela criou para o grill do terminal
  registro?: string
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
      // a permissao pendente, o loop que a pediu (sem agentId, o principal) e desde quando
      permissao: { ferramenta: string; agentId?: string; desde?: number } | null
      // a hora em que o laco principal parou com a leva aberta, ate o proximo prompt
      ocioso: number | null
    }
  }
}
