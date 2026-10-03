#!/usr/bin/env node
// PreToolUse da ferramenta Skill: quando o agente invoca o grilling, injeta a
// instrucao de perguntar o canal (CLI ou tela) antes da primeira rodada.
// Qualquer outra skill, ou um stdin que nao e JSON, passa calada. Nao decide permissao.
//
// O gate FALHA FECHADO, ao contrario do hook do vault: a pergunta do canal so aparece com
// a opcao `grill_tela` do plugin ligada (/config ou /plugin). Desligada, ausente ou
// ilegivel, o hook fica calado e o grill segue o fluxo de sempre do usuario. A opcao
// chega como CLAUDE_PLUGIN_OPTION_GRILL_TELA; GRILL_TELA e o pluginConfigs dos
// settings.json sao os fallbacks, na mesma ordem do vault.
//
// Os outros harnesses nao tem o PreToolUse da Skill, entao recebem a mesma pergunta como
// regra permanente: a extensao do Pi (extensions/grill-canal.ts) importa REGRA para o
// system prompt quando GRILL_TELA esta ligada, e no Codex e no Antigravity
// `node grill-canal.js regra >> AGENTS.md` liga e apagar o bloco desliga.
//
// Uso: node grill-canal.js            (hook, com o evento no stdin)
//      node grill-canal.js regra      (imprime a regra para o AGENTS.md)

const fs = require('fs');
const { arquivosDeConfig } = require('./vault-rules.js');

const INSTRUCAO = `Antes da primeira rodada do grill, pergunte ao usuario pelo AskUserQuestion qual canal ele quer: CLI (as rodadas pelo AskUserQuestion, como de costume) ou tela (uma pagina HTML local). Se ele escolher tela, invoque a skill grill-tela e conduza o grill por ela, sem usar o AskUserQuestion nas rodadas.`;

const REGRA = `Quando for conduzir o grill da skill grilling (do Matt Pocock, tambem pela grill-with-docs ou pela /faz), antes da primeira rodada pergunte ao usuario, em texto, qual canal ele quer: CLI (as rodadas aqui no terminal, como de costume) ou tela (uma pagina HTML local), e encerre o turno. Se ele escolher tela, carregue a skill grill-tela e conduza o grill por ela, sem fazer as perguntas das rodadas no terminal.`;

// O boolean do userConfig pode chegar como true, "true" ou "1", conforme quem o escreveu.
const ligado = (v) => v === true || /^(true|1|sim|yes|on)$/i.test(String(v == null ? '' : v).trim());

function grillTelaLigada() {
  // A opcao do plugin decide primeiro: e a resposta explicita deste cliente.
  const opcao = process.env.CLAUDE_PLUGIN_OPTION_GRILL_TELA;
  if (opcao !== undefined) return ligado(opcao);
  if ((process.env.GRILL_TELA || '').trim()) return ligado(process.env.GRILL_TELA);
  for (const arquivo of arquivosDeConfig()) {
    let cfgs;
    try {
      cfgs = JSON.parse(fs.readFileSync(arquivo, 'utf8')).pluginConfigs;
    } catch (e) {
      continue; // ausente, ilegivel ou corrompido nao e resposta
    }
    for (const [nome, c] of Object.entries(cfgs || {})) {
      if (!nome.startsWith('macrex-skills@')) continue;
      const v = c && c.options && c.options.grill_tela;
      if (v !== undefined) return ligado(v);
    }
  }
  return false;
}

module.exports = { INSTRUCAO, REGRA, ligado, grillTelaLigada };

if (require.main === module) {
  if (process.argv[2] === 'regra') {
    process.stdout.write(`<grill-canal>\n${REGRA}\n</grill-canal>\n`);
  } else {
    let entrada = '';
    process.stdin.on('data', (d) => (entrada += d));
    process.stdin.on('end', () => {
      let skill;
      try {
        skill = JSON.parse(entrada).tool_input.skill;
      } catch (e) {
        return; // JSON invalido ou sem tool_input: calado
      }
      if (typeof skill !== 'string' || skill.replace(/^mattpocock-skills:/, '') !== 'grilling') return;
      if (!grillTelaLigada()) return; // desligada: o grill segue o fluxo do usuario
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: INSTRUCAO } })
      );
    });
  }
}
