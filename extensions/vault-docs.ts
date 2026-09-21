// A rota Pi: esta extensao faz no Pi o que o plugin faz no Claude Code — sobe o
// servidor MCP do vault (skills/obsidian-docs/scripts/servidor_vault.py) e injeta as
// regras do vault no system prompt. O servidor Python continua sendo a unica
// implementacao do vault; aqui so ha transporte, e e isso que mantem as tres rotas
// identicas em comportamento.
//
// O gate e BINARIO, ao contrario do hook do Claude Code, que falha aberto: sem
// OBSIDIAN_VAULT nada e registrado, nem ferramenta nem regra. O hook injeta so texto,
// e injetar demais custa algumas linhas; aqui subir um processo Python sem vault
// seria custo sem funcao, e a primeira linha das regras ja manda ignora-las quando
// nao ha ferramenta de vault na sessao.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import regrasDoVault from '../hooks/vault-rules.js';

const PREFIXO = 'mcp__vault-docs__';
const SECAO = 'vault-obsidian';
const PROTOCOLO = '2025-06-18';
// ponytail: o teto do problema python3/python e o mesmo que o README documenta para a
// rota plugin — no pior caso custa uma tentativa a mais no inicio da sessao.
const PYTHONS = ['python3', 'python'];
const PRAZO_ABERTURA = 5_000;

// As tags saem: o Pi embrulha o valor de sections[tag] na propria tag, e o texto
// chegaria com <vault-obsidian> duplicado.
const REGRAS = regrasDoVault.REGRAS.replace(`<${SECAO}>\n`, '').replace(`\n</${SECAO}>`, '');

type Pendente = { resolver: (valor: any) => void; rejeitar: (erro: Error) => void };

// Cliente JSON-RPC 2.0 por linha, o protocolo que o servidor do vault fala no stdio.
function clienteJsonRpc(filho: any) {
  const pendentes = new Map<number, Pendente>();
  let proximoId = 1;
  let encerradoPor: string | null = null;

  function receber(linha: string) {
    let mensagem: any;
    try {
      mensagem = JSON.parse(linha);
    } catch {
      return; // linha que nao e protocolo nao derruba o cliente
    }
    const pendente = pendentes.get(mensagem.id);
    if (!pendente) return;
    pendentes.delete(mensagem.id);
    if (mensagem.error) pendente.rejeitar(new Error(mensagem.error.message || 'erro do servidor do vault'));
    else pendente.resolver(mensagem.result);
  }

  // Divisor manual, quebrando so em `\n`: o readline do Node tambem quebra em U+2028
  // e U+2029, que sao validos dentro de string JSON — uma nota com esse caractere
  // partiria a resposta em dois fragmentos invalidos, o JSON.parse falharia e o
  // pedido, que vai sem prazo, ficaria pendurado para sempre.
  let restante = '';
  filho.stdout.setEncoding('utf8');
  filho.stdout.on('data', (pedaco: string) => {
    restante += pedaco;
    let quebra = restante.indexOf('\n');
    while (quebra !== -1) {
      const linha = restante.slice(0, quebra);
      restante = restante.slice(quebra + 1);
      receber(linha.endsWith('\r') ? linha.slice(0, -1) : linha);
      quebra = restante.indexOf('\n');
    }
  });

  function encerrar(motivo: string) {
    encerradoPor = motivo;
    for (const pendente of pendentes.values()) pendente.rejeitar(new Error(motivo));
    pendentes.clear();
  }

  filho.stdin.on('error', () => {}); // EPIPE quando o candidato a python nao existe
  filho.on('exit', () => encerrar('o servidor do vault encerrou'));

  return {
    encerrar,
    notificar(metodo: string, params: unknown) {
      if (encerradoPor) return;
      filho.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: metodo, params }) + '\n');
    },
    // Sem prazo, o pedido so termina com a resposta ou com a morte do servidor: uma
    // ferramenta que empurra o vault pode demorar, e um relogio aqui a mataria no meio.
    pedir(metodo: string, params: unknown, prazoMs?: number) {
      if (encerradoPor) return Promise.reject(new Error(encerradoPor));
      const id = proximoId++;
      return new Promise((resolver, rejeitar) => {
        let relogio: any;
        const encerra = (fn: (valor: any) => void) => (valor: any) => {
          clearTimeout(relogio);
          fn(valor);
        };
        pendentes.set(id, { resolver: encerra(resolver), rejeitar: encerra(rejeitar) });
        if (prazoMs) {
          relogio = setTimeout(() => {
            pendentes.delete(id);
            rejeitar(new Error(`${metodo} nao respondeu em ${prazoMs}ms`));
          }, prazoMs);
          relogio.unref?.();
        }
        filho.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: metodo, params }) + '\n');
      });
    },
  };
}

// Sobe o servidor com o primeiro python que responder ao handshake; o candidato que
// nao responde e morto antes do proximo.
async function subirServidor(vault: string, script: string) {
  const erros: string[] = [];
  for (const python of PYTHONS) {
    const filho = spawn(python, [script, '--vault', vault], { stdio: ['pipe', 'pipe', 'pipe'] });
    let ruido = '';
    const acumularRuido = (pedaco: Buffer) => {
      ruido += pedaco.toString();
    };
    filho.stderr.on('data', acumularRuido);
    const rpc = clienteJsonRpc(filho);
    filho.on('error', (erro: Error) => rpc.encerrar(`${python} nao pode ser executado: ${erro.message}`));
    try {
      await rpc.pedir(
        'initialize',
        {
          protocolVersion: PROTOCOLO,
          capabilities: {},
          clientInfo: { name: 'pi-vault-docs', version: '1' },
        },
        PRAZO_ABERTURA,
      );
      rpc.notificar('notifications/initialized', {});
      // O ruido so serve ao handshake: daqui em diante nada mais e acumulado, mas o
      // fluxo continua drenado para o servidor nunca bloquear escrevendo em stderr.
      filho.stderr.off('data', acumularRuido);
      filho.stderr.resume();
      return { filho, rpc };
    } catch (erro) {
      erros.push(`${python}: ${(erro as Error).message}${ruido.trim() ? ` (${ruido.trim()})` : ''}`);
      rpc.encerrar('tentativa descartada');
      filho.kill();
    }
  }
  return { erro: erros.join('; ') };
}

export default async function (pi: any) {
  const avisarNaAbertura = (mensagem: string, tipo: string) =>
    pi.on('session_start', async (_evento: unknown, ctx: any) => ctx.ui.notify(mensagem, tipo));

  const vault = (process.env.OBSIDIAN_VAULT || '').trim();
  if (!vault) {
    avisarNaAbertura(
      'vault-docs: defina OBSIDIAN_VAULT com a pasta de projetos do seu vault Obsidian para as ferramentas do vault aparecerem.',
      'warning',
    );
    return;
  }

  // A pasta do pacote sai da localizacao deste arquivo, nunca do cwd: o pacote pode
  // estar instalado em qualquer lugar.
  const script = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'skills',
    'obsidian-docs',
    'scripts',
    'servidor_vault.py',
  );

  const servidor = await subirServidor(vault, script);
  if ('erro' in servidor) {
    avisarNaAbertura(`vault-docs: nenhum python respondeu ao servidor do vault — ${servidor.erro}`, 'error');
    return;
  }
  const { filho, rpc } = servidor;

  // Sem este try o Python ficaria orfao: a factory lancaria, o Pi descartaria a
  // extensao e o handler de session_shutdown, que mata o filho, nem chegaria a existir.
  let lista: any;
  try {
    lista = await rpc.pedir('tools/list', {}, PRAZO_ABERTURA);
  } catch (erro) {
    rpc.encerrar('a listagem de ferramentas falhou');
    filho.kill();
    avisarNaAbertura(
      `vault-docs: o servidor do vault nao listou as ferramentas — ${(erro as Error).message}`,
      'error',
    );
    return;
  }
  for (const ferramenta of lista.tools || []) {
    pi.registerTool({
      name: PREFIXO + ferramenta.name,
      label: ferramenta.name,
      description: ferramenta.description,
      parameters: ferramenta.inputSchema,
      // O signal de cancelamento nao e propagado: o servidor nao tem cancelamento, e o
      // resultado tardio morre junto com o pendente.
      async execute(_id: string, params: unknown) {
        const resposta: any = await rpc.pedir('tools/call', {
          name: ferramenta.name,
          arguments: params || {},
        });
        const texto = (resposta.content || [])
          .filter((parte: any) => parte.type === 'text')
          .map((parte: any) => parte.text)
          .join('\n');
        // Falha se sinaliza lancando: um retorno nunca marca erro para o Pi.
        if (resposta.isError) throw new Error(texto || `${ferramenta.name} falhou`);
        return { content: [{ type: 'text', text: texto }], details: {} };
      },
    });
  }

  // `sections` e o caminho barato: o Pi faz diff das secoes e so manda o que mudou.
  // Devolver systemPrompt substituiria o prompt inteiro da rodada.
  pi.on('before_agent_start', async (evento: any) => {
    const opcoes = evento.systemPromptOptions;
    if (!opcoes) return;
    (opcoes.sections ||= {})[SECAO] = REGRAS;
  });

  pi.on('session_shutdown', () => {
    rpc.encerrar('a sessao encerrou');
    filho.kill();
  });
}
