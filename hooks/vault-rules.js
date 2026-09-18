#!/usr/bin/env node
// Injeta as regras do vault no contexto da sessao e dos sub-agentes, para que o
// cliente nao precise escrever nada no CLAUDE.md dele.
//
// Uso: node vault-rules.js <SessionStart|SubagentStart>
//
// Só injeta quando o vault esta configurado: le o valor que o userConfig do plugin
// gravou em <CLAUDE_CONFIG_DIR>/settings.json, ou a variavel OBSIDIAN_VAULT da rota
// `npx skills add`. Sem nenhum dos dois, sai calado — quem instalou o plugin sem
// usar Obsidian nao ganha regra nenhuma.

const fs = require('fs');
const os = require('os');
const path = require('path');

const REGRAS = `<vault-obsidian>
Este projeto documenta no vault Obsidian, pelo MCP \`vault-docs\` que a skill \`obsidian-docs\` traz. As ferramentas aparecem com um de dois prefixos, conforme a rota de instalacao: \`mcp__vault-docs__*\` (CLI \`npx skills add\`) ou \`mcp__plugin_macrex-skills_vault-docs__*\` (plugin). Se nenhum dos dois estiver na sessao, ignore este bloco.

- **O vault e a memoria dos projetos, e nada dispara isto sozinho.** ANTES de mexer em codigo, leia o hub (\`ler_nota <nome-da-pasta-do-repo>\`) e a evolucao mais recente (\`listar_notas projeto=<projeto> tipo=evolucao limite=1\`, depois \`ler_nota\`). Projeto citado que nao e o do diretorio atual: resolva la primeiro (\`ler_nota <projeto>\`; nome incerto, \`buscar\` ou \`visao_geral\`). Codigo e git vem depois do vault.
- **Todo artefato .md de documentacao nasce no vault**, pela skill \`obsidian-docs\` — spec, plano, design, bug, evolucao, ADR, arquitetura, analise, pesquisa, relatorio. NUNCA no repositorio do projeto. Ficam no repo so os operacionais: \`README.md\`, \`CLAUDE.md\`, \`AGENTS.md\`, \`SKILL.md\`, configs.
- **Ao fechar uma leva ou versao**, registre a evolucao (\`salvar_nota tipo=evolucao\`) e indexe no hub.
- **Migracao para o vault e CÓPIA, nunca recorte.** PROIBIDO apagar ou mover arquivo do repositorio do projeto, inclusive o que so parece documentacao (\`LEIA.txt\`, \`HELP\`, notas dentro de biblioteca vendorizada).
- **O acesso ao vault e so pelas ferramentas do MCP.** NUNCA Read/Grep/Glob/Write/Edit nos arquivos do vault, e nunca rode git nele — o servidor ja commita e empurra sozinho.
- Duas fontes, cada pergunta na sua: o que foi decidido e por que, vault (\`ler_nota\`, \`buscar\`); o que o codigo E agora, grafo (\`consultar_codigo\`, \`mapa_codigo\`), quando o projeto usa graphify.
</vault-obsidian>`;

// o vault esta configurado nesta maquina?
function vaultConfigurado() {
  if ((process.env.OBSIDIAN_VAULT || '').trim()) return true;
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).pluginConfigs;
  } catch (e) {
    return false; // ausente, ilegivel ou corrompido: nao e motivo para falhar
  }
  // a chave carrega o marketplace de onde veio (macrex-skills@<marketplace>)
  return Object.entries(cfg || {}).some(
    ([nome, c]) => nome.startsWith('macrex-skills@') && String(c?.options?.vault || '').trim()
  );
}

if (!vaultConfigurado()) process.exit(0);

// SessionStart aceita stdout cru; SubagentStart descarta o que nao vier no envelope.
const evento = process.argv[2];
process.stdout.write(
  evento === 'SubagentStart'
    ? JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: REGRAS } })
    : REGRAS
);
