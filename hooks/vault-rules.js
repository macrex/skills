#!/usr/bin/env node
// Injeta as regras do vault no contexto da sessao e dos sub-agentes, para que o
// cliente nao precise escrever nada no CLAUDE.md dele.
//
// Uso: node vault-rules.js <SessionStart|SubagentStart>
//
// O gate FALHA ABERTO. So fica calado quando da para VER que o cliente desligou o
// vault de proposito: a config do plugin existe e o valor esta vazio. Config que
// nao se consegue ler — arquivo ausente, corrompido, instalacao em escopo de
// projeto, settings.local.json, um caminho que esta lista nao previu — injeta
// assim mesmo.
//
// A leitura documentada do userConfig e a variavel de ambiente
// CLAUDE_PLUGIN_OPTION_<CHAVE> que o Claude Code exporta para os hooks do plugin
// (https://code.claude.com/docs/en/plugins-reference); e ela que decide primeiro.
// O parse dos settings.json abaixo e o fallback para versoes que nao a exportam.
//
// A primeira linha do texto manda ignorar quando as ferramentas nao estao na
// sessao, entao injetar demais custa algumas linhas; injetar de menos seria o
// plugin nao funcionar, em silencio, para quem acabou de instalar.

const fs = require('fs');
const os = require('os');
const path = require('path');

const REGRAS = `<vault-obsidian>
Este projeto documenta no vault Obsidian pelo MCP \`vault-docs\` (\`mcp__vault-docs__*\` ou \`mcp__plugin_<plugin>_vault-docs__*\`). **Sem nenhuma ferramenta do servidor vault-docs na sessao, seja qual for o prefixo, ignore este bloco.**

- **O vault e a memoria dos projetos, e nada dispara isto sozinho.** ANTES de codigo e git: \`contexto_projeto <pasta-do-repo>\` e \`mapa_codigo <projeto>\` se o projeto usa graphify. Projeto citado que nao e o do diretorio atual: \`contexto_projeto <projeto>\` primeiro (nome incerto: \`buscar\` ou \`visao_geral\`; MOCs tematicos em \`MOC/\`).
- **Todo artefato .md de documentacao nasce no vault**, pela skill \`obsidian-docs\`: spec, plano, design, bug, evolucao, ADR, arquitetura, analise, pesquisa, relatorio, inclusive os do superpowers (no lugar de \`docs/superpowers/specs|plans/\`). No repositorio ficam so os operacionais (\`README.md\`, \`CLAUDE.md\`, \`AGENTS.md\`, \`SKILL.md\`, configs).
- **Ao fechar uma leva ou versao**, registre a evolucao (\`salvar_nota tipo=evolucao\`) com as secoes O que mudou, Verificacao e Pendencias, e rode \`validar projeto=<projeto>\`. \`salvar_nota\` avisa o que sai do padrao: corrija na hora.
- **Migracao para o vault e CÓPIA, nunca recorte**: o original fica intocado no repositorio, inclusive o que so parece documentacao (\`LEIA.txt\`, \`HELP\`, notas em biblioteca vendorizada); nunca gere o commit \`docs: migrados para o vault Obsidian (obsidian-docs)\`.
- **Acesso ao vault so pelas ferramentas do MCP.** NUNCA Read/Grep/Glob/Write/Edit nos arquivos dele, nem git — o servidor ja commita e empurra.
- Duas fontes: o que foi decidido e por que, no vault; o que o codigo e agora, no grafo do graphify. Apos cada rodada do graphify, SEMPRE \`gerar_mapa <projeto>\` com a sua \`leitura\` curada; \`graphify-out/\` fica no repositorio, no \`.gitignore\` e fora do index.
</vault-obsidian>`;

// Todos os arquivos de configuracao em que o userConfig do plugin pode ter caido.
// O escopo da instalacao (user ou project) e a existencia do .local decidem qual e,
// e nenhum deles e garantido: por isso a lista, e por isso o gate falha aberto.
function arquivosDeConfig() {
  const casa = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const projeto = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return [
    path.join(casa, 'settings.json'),
    path.join(casa, 'settings.local.json'),
    path.join(projeto, '.claude', 'settings.json'),
    path.join(projeto, '.claude', 'settings.local.json'),
  ];
}

// options.<chave> de cada entrada macrex-skills@ dos settings.json, na ordem de arquivosDeConfig().
function opcoesNosSettings(chave) {
  const valores = [];
  for (const arquivo of arquivosDeConfig()) {
    let cfgs;
    try {
      cfgs = JSON.parse(fs.readFileSync(arquivo, 'utf8')).pluginConfigs;
    } catch (e) {
      continue; // ausente, ilegivel ou corrompido nao e resposta
    }
    // a chave carrega o marketplace de onde veio: <plugin>@<marketplace>
    for (const [nome, c] of Object.entries(cfgs || {})) {
      if (nome.startsWith('macrex-skills@')) valores.push(c && c.options && c.options[chave]);
    }
  }
  return valores;
}

// null = nao deu para saber (injeta); true/false = o cliente disse.
function vaultConfigurado() {
  // A opcao do plugin decide PRIMEIRO: ela e a resposta explicita deste cliente.
  // Chave presente e vazia = o cliente deixou a pasta em branco de proposito, e
  // um OBSIDIAN_VAULT esquecido no perfil (rota CLI antiga) nao pode desfazer isso.
  const opcao = process.env.CLAUDE_PLUGIN_OPTION_VAULT;
  if (opcao !== undefined) return opcao.trim() !== '';
  if ((process.env.OBSIDIAN_VAULT || '').trim()) return true;
  const valores = opcoesNosSettings('vault');
  if (valores.some((v) => String(v || '').trim())) return true;
  return valores.length ? false : null; // config existe e esta vazia: opt-out deliberado
}

// REGRAS tem um dono so: a extensao do Pi (extensions/vault-docs.ts) importa este
// modulo para injetar no Pi o mesmo texto que o hook injeta no Claude Code. Por isso
// o gate e a escrita em stdout so rodam quando este arquivo E o programa; importado,
// ele exporta o texto e nao faz mais nada. opcoesNosSettings serve tambem ao gate do
// hook do grill (grill-canal.js), que le a opcao dele nos mesmos settings.json.
module.exports = { REGRAS, opcoesNosSettings };

if (require.main === module) {
  if (vaultConfigurado() === false) process.exit(0);

  // SessionStart aceita stdout cru; SubagentStart descarta o que nao vier no envelope.
  const evento = process.argv[2];
  process.stdout.write(
    evento === 'SubagentStart'
      ? JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: REGRAS } })
      : REGRAS
  );
}
