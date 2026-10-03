#!/usr/bin/env node
// PreToolUse da ferramenta Skill: quando o agente invoca o grilling, injeta a
// instrucao de perguntar o canal (CLI ou tela) antes da primeira rodada.
// Qualquer outra skill, ou um stdin que nao e JSON, passa calada. Nao decide permissao.
//
// Os outros harnesses nao tem o PreToolUse da Skill, entao recebem a mesma pergunta como
// regra permanente: a extensao do Pi (extensions/grill-canal.ts) importa REGRA para o
// system prompt, e no Codex e no Antigravity `node grill-canal.js regra >> AGENTS.md`.
//
// Uso: node grill-canal.js            (hook, com o evento no stdin)
//      node grill-canal.js regra      (imprime a regra para o AGENTS.md)

const INSTRUCAO = `Antes da primeira rodada do grill, pergunte ao usuario pelo AskUserQuestion qual canal ele quer: CLI (as rodadas pelo AskUserQuestion, como de costume) ou tela (uma pagina HTML local). Se ele escolher tela, invoque a skill grill-tela e conduza o grill por ela, sem usar o AskUserQuestion nas rodadas.`;

const REGRA = `Quando for conduzir o grill da skill grilling (do Matt Pocock, tambem pela grill-with-docs ou pela /faz), antes da primeira rodada pergunte ao usuario, em texto, qual canal ele quer: CLI (as rodadas aqui no terminal, como de costume) ou tela (uma pagina HTML local), e encerre o turno. Se ele escolher tela, carregue a skill grill-tela e conduza o grill por ela, sem fazer as perguntas das rodadas no terminal.`;

module.exports = { INSTRUCAO, REGRA };

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
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: INSTRUCAO } })
      );
    });
  }
}
