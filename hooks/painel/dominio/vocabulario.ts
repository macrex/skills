// O vocabulario do painel: os marcos, as fases, as abas, as cores e as regex, sem efeito.

import type { Leva, LevaAgente } from '../../../types/index.d.ts'

export const FERRAMENTA = 'faz_marco'
export const MARCOS = ['inicio', 'fase', 'tickets', 'ticket', 'portao', 'item', 'fechamento']
export const MARCOS_DO_GRILL = ['grill', 'entendimento', 'linha']
// O mascote do Claude Code, identico ao do cabecalho, parado; so os z se mexem: cada ronco solta um z que
// sobe uma linha e anda uma coluna por quadro. Linhas de mesma largura, para o desenho nao pular
// quando o pane o centraliza.
export const RONCO = 700
export const ZS = [
  ['          Z', '', ''],
  ['', '', '        z'],
  ['', '         z', '        z'],
  ['          Z', '         z', ''],
]
export const BONECO = [' ▐▛███▜▌', '▝▜█████▛▘', '  ▘▘ ▝▝']

// A frase do repouso: o terminal nao muda o tamanho da fonte, entao ela vai em maiusculas
// espacadas e em negrito, que leem maiores; so no pane que tem lugar para ela.
export const QUIETO_GRANDE = [...'TUDO QUIETO POR AQUI'].join(' ')
export const LARGURA_DO_GRANDE = QUIETO_GRANDE.length + 2
// as linhas do corpo do pane que cabem a frase (com a folga), o boneco e os z; e so o boneco e os z
export const LINHAS_DA_FRASE = 12
export const LINHAS_DO_BONECO = 7
export const LARANJA = '#d77757'
export const FASES = ['spec', 'tickets', 'implement', 'revisao', 'correcoes', 'qualidade', 'fechamento']
export const PORTOES = ['verde', 'vermelho']
export const MODOS = ['inline', 'sub-agents', 'workflow']
// as fases depois do implement, cujo andamento chega item a item, e o titulo do cartao de cada uma
export const FASES_COM_ITENS: Record<string, string> = { revisao: 'Revisão', correcoes: 'Correções', qualidade: 'Qualidade' }
export const NO_HISTORICO = 5
export const FUNDO = '#24283b'
// a paleta do video do README: cartoes um tom abaixo do fundo, chips um tom acima; as cores do
// texto vao explicitas, porque o fundo e escuro mesmo num terminal de tema claro
export const CARTAO = '#1f2335'
export const CHIP = '#292e42'
export const TEXTO = '#c0caf5'
export const APAGADO = '#8b93b8'
export const VERDE = '#9ece6a'
export const AZUL = '#7aa2f7'
export const VERMELHO = '#f7768e'
export const AMARELO = '#e0af68'
export const SKILL_DA_FASE: Record<string, string> = { spec: 'to-spec', tickets: 'to-tickets', implement: 'implement', revisao: 'code-review' }
// o nome de cada fase no chip, o da skill que a cumpre; o fechamento nao vira chip, vira o aviso do /cpv
export const ROTULO: Record<string, string> = { ...SKILL_DA_FASE, correcoes: 'correções', qualidade: 'qualidade' }
export const FIM_DE_TAREFA: Record<string, LevaAgente['estado']> = { completed: 'concluido', failed: 'falhou', killed: 'parado', stopped: 'parado' }
export const DO_AGENTE = { rodando: ['rodando', LARANJA], aguardando: ['aguardando', AMARELO], concluido: ['concluído', VERDE], falhou: ['falhou', VERMELHO], parado: ['parado', APAGADO] } as const
// o status da lista oficial ($.agent.list) no estado do painel; um status fora daqui nao mexe no agente
export const DA_LISTA: Record<string, LevaAgente['estado']> = { pending: 'rodando', running: 'rodando', waiting: 'aguardando', idle: 'aguardando', completed: 'concluido', failed: 'falhou', killed: 'parado' }
export const VIVOS = ['rodando', 'aguardando']
// o agente rodando sem ferramenta ha mais que isto mostra ha quanto tempo esta sem saida
export const SEM_SAIDA = 2 * 60 * 1000
export const ABAS = { painel: 'Geral', codigo: 'Diff', grill: 'Grill', tickets: 'Tickets', uso: 'Uso', arquivos: 'Arquivos' }
export type Aba = keyof typeof ABAS
export const TOKENS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const
export type Tokens = Record<(typeof TOKENS)[number], number>
// os caracteres de controle que um Code recusa: todos menos tab e quebra de linha
export const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/g
// a linha das abas, o sublinhado da ativa e a margem embaixo dela
export const LINHAS_DAS_ABAS = 3
// as ferramentas que mudam arquivo: depois de cada uma, a aba Diff ou a Arquivos aberta se refaz
export const MUDAM = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell']
// o maior source que um Code desenha e 10000; a folga e do cabecalho recontado
export const LIMITE_DO_CODE = 9900
// a pagina de um grill na grill-tela: todo comando `grill-tela.js <subcomando> <url>` leva a URL dela
export const URL_DA_TELA = /http:\/\/127\.0\.0\.1:\d+\/g\/[^/\s?]+\/\d{8}-\d{6}\?t=[0-9a-f]+/
// o --retomar da grill-tela, que imprime a URL do grill retomado
export const RETOMAR = /grill-tela\.js["']?\s+iniciar\b.*\s--retomar\b/

// a entrada do faz_marco, como o inputSchema dela a declara; o aplicar a confere de novo, porque o
// modelo pode mandar fora do esquema
export type Marco = {
  marco: string
  documento?: string
  pedido?: string
  linha?: string
  fase?: string
  modo?: Leva['modo']
  tickets?: { id: string; titulo: string }[]
  ticket?: string
  item?: string
  detalhe?: string
  portao?: 'verde' | 'vermelho'
  reparos?: number
  testes?: string
  notas?: string
  sujos?: string[]
}
