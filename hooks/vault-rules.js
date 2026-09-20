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
Este projeto documenta no vault Obsidian, pelo MCP \`vault-docs\` que a skill \`obsidian-docs\` traz. As ferramentas aparecem com um de dois prefixos, conforme a rota de instalacao: \`mcp__vault-docs__*\` (CLI \`npx skills add\`) ou \`mcp__plugin_macrex-skills_vault-docs__*\` (plugin; se voce renomeou o plugin, o nome dele entra no lugar). **Se nenhuma ferramenta de vault estiver na sessao, ignore este bloco inteiro.**

- **O vault e a memoria dos projetos, e nada dispara isto sozinho.** ANTES de mexer em codigo, leia o hub (\`ler_nota <nome-da-pasta-do-repo>\`) e a evolucao mais recente (\`listar_notas projeto=<projeto> tipo=evolucao limite=1\`, depois \`ler_nota\`), mais \`mapa_codigo <projeto>\` quando o projeto usa graphify. Projeto citado que nao e o do diretorio atual: resolva la primeiro (\`ler_nota <projeto>\`; nome incerto, \`buscar\` ou \`visao_geral\` — um hub por projeto, MOCs tematicos em \`MOC/\`). Codigo e git vem depois do vault.
- **Todo artefato .md de documentacao nasce no vault**, pela skill \`obsidian-docs\` — spec, plano, design, bug, evolucao, ADR, arquitetura, analise, pesquisa, relatorio, incluindo as specs e planos de brainstorming do superpowers, que vao para o vault no lugar de \`docs/superpowers/specs|plans/\`. NUNCA no repositorio do projeto. Ficam no repo so os operacionais: \`README.md\`, \`CLAUDE.md\`, \`AGENTS.md\`, \`SKILL.md\`, configs.
- **Ao fechar uma leva ou versao**, registre a evolucao (\`salvar_nota tipo=evolucao\`) e indexe no hub.
- **Migracao para o vault e CÓPIA, nunca recorte.** PROIBIDO apagar ou mover arquivo do repositorio do projeto, inclusive o que so parece documentacao (\`LEIA.txt\`, \`HELP\`, notas dentro de biblioteca vendorizada). O commit \`docs: migrados para o vault Obsidian (obsidian-docs)\` e entulho de um bug antigo e nao pode ser gerado de novo; achou um (\`git log --all --oneline --grep "migrados para o vault Obsidian"\`)? Nao empurrado, \`git reset HEAD~1\` (mixed, o conteudo fica na working tree); ja empurrado, avise o usuario e pare — reescrever historico publicado e decisao dele. Mantenha a mudanca util que ele carregava (ex.: \`graphify-out/\` no \`.gitignore\`).
- **O acesso ao vault e so pelas ferramentas do MCP.** NUNCA Read/Grep/Glob/Write/Edit nos arquivos do vault, e nunca rode git nele — o servidor ja commita e empurra sozinho.
- Duas fontes, cada pergunta na sua: o que foi decidido e por que, vault (\`ler_nota\`, \`buscar\`); o que o codigo E agora, grafo (\`consultar_codigo\`, \`mapa_codigo\`). graphify e opcional; depois de qualquer rodada dele, SEMPRE \`gerar_mapa <projeto>\` com a sua \`leitura\` curada. \`graphify-out/\` fica no repositorio, no \`.gitignore\` e fora do index — nunca no vault.
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

// null = nao deu para saber (injeta); true/false = o cliente disse.
function vaultConfigurado() {
  if ((process.env.OBSIDIAN_VAULT || '').trim()) return true;
  // Chave presente e vazia = o cliente deixou a pasta em branco de proposito.
  const opcao = process.env.CLAUDE_PLUGIN_OPTION_VAULT;
  if (opcao !== undefined) return opcao.trim() !== '';
  let resposta = null;
  for (const arquivo of arquivosDeConfig()) {
    let cfgs;
    try {
      cfgs = JSON.parse(fs.readFileSync(arquivo, 'utf8')).pluginConfigs;
    } catch (e) {
      continue; // ausente, ilegivel ou corrompido nao e resposta
    }
    // a chave carrega o marketplace de onde veio: <plugin>@<marketplace>
    for (const [nome, c] of Object.entries(cfgs || {})) {
      if (!nome.startsWith('macrex-skills@')) continue;
      if (String(c && c.options && c.options.vault || '').trim()) return true;
      resposta = false; // config existe e esta vazia: opt-out deliberado
    }
  }
  return resposta;
}

if (vaultConfigurado() === false) process.exit(0);

// SessionStart aceita stdout cru; SubagentStart descarta o que nao vier no envelope.
const evento = process.argv[2];
process.stdout.write(
  evento === 'SubagentStart'
    ? JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: REGRAS } })
    : REGRAS
);
