#!/usr/bin/env node
// PreToolUse da ferramenta Skill: quando o agente invoca o grilling, injeta a
// instrucao de perguntar o canal (CLI ou tela) antes da primeira rodada.
// Qualquer outra skill, ou um stdin que nao e JSON, passa calada. Nao decide permissao.

const INSTRUCAO = `Antes da primeira rodada do grill, pergunte ao usuario pelo AskUserQuestion qual canal ele quer: CLI (as rodadas pelo AskUserQuestion, como de costume) ou tela (uma pagina HTML local). Se ele escolher tela, invoque a skill grill-tela e conduza o grill por ela, sem usar o AskUserQuestion nas rodadas.`;

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
