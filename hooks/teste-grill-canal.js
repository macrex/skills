#!/usr/bin/env node
'use strict';
// Checagem do hook do grill, rodado por stdin como o Claude Code faz, com CLAUDE_CONFIG_DIR e
// CLAUDE_PROJECT_DIR numa pasta temporaria, para os settings.json da maquina nao contarem:
//   1. sem opcao nenhuma, o grilling passa calado: o padrao e o fluxo de sempre do usuario;
//   2. com a opcao grill_tela ligada (true ou "1"), o grilling com e sem o prefixo
//      `mattpocock-skills:` recebe o additionalContext do PreToolUse, que cita o
//      AskUserQuestion e a grill-tela, sem decidir permissao;
//   3. a opcao desligada ganha de GRILL_TELA=1; sem a opcao, GRILL_TELA=1 liga;
//   4. sem env, o pluginConfigs do settings.json decide (true liga, false desliga);
//   5. ligada, outra skill, JSON invalido, stdin vazio e `{}` passam calados, com status 0;
//   6. `regra` imprime a regra para o AGENTS.md entre tags, ligada ou nao, e importado o
//      modulo so exporta.
//
//   node hooks/teste-grill-canal.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hook = path.join(__dirname, 'grill-canal.js');
const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'grill-canal-'));
process.on('exit', () => fs.rmSync(casa, { recursive: true, force: true }));
const base = { ...process.env, CLAUDE_CONFIG_DIR: casa, CLAUDE_PROJECT_DIR: casa };
delete base.CLAUDE_PLUGIN_OPTION_GRILL_TELA;
delete base.GRILL_TELA;

const rodar = (entrada, env = {}, args = []) =>
  spawnSync(process.execPath, [hook, ...args], { input: entrada, encoding: 'utf8', env: { ...base, ...env } });
const skill = (nome) => JSON.stringify({ tool_name: 'Skill', tool_input: { skill: nome } });
const injeta = (r) => {
  assert.strictEqual(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  assert.strictEqual(o.hookEventName, 'PreToolUse');
  assert.match(o.additionalContext, /AskUserQuestion/);
  assert.match(o.additionalContext, /grill-tela/);
  assert.ok(!('permissionDecision' in o), 'o hook nao decide permissao');
};
const calado = (r, porque) => {
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, '', `deveria calar: ${porque}`);
};
const settings = (valor) =>
  fs.writeFileSync(path.join(casa, 'settings.json'),
    JSON.stringify({ pluginConfigs: { 'macrex-skills@macrex': { options: { vault: '', grill_tela: valor } } } }));

// 1. desligada por padrao
calado(rodar(skill('grilling')), 'sem opcao nenhuma');
calado(rodar(skill('mattpocock-skills:grilling')), 'sem opcao nenhuma, com prefixo');

// 2. opcao ligada
for (const v of ['true', '1']) {
  for (const nome of ['grilling', 'mattpocock-skills:grilling']) injeta(rodar(skill(nome), { CLAUDE_PLUGIN_OPTION_GRILL_TELA: v }));
}

// 3. opcao e GRILL_TELA
calado(rodar(skill('grilling'), { CLAUDE_PLUGIN_OPTION_GRILL_TELA: 'false', GRILL_TELA: '1' }), 'opcao desligada ganha da variavel');
calado(rodar(skill('grilling'), { CLAUDE_PLUGIN_OPTION_GRILL_TELA: '' , GRILL_TELA: '1' }), 'opcao vazia e desligada');
injeta(rodar(skill('grilling'), { GRILL_TELA: '1' }));
calado(rodar(skill('grilling'), { GRILL_TELA: '0' }), 'GRILL_TELA=0');

// 4. settings.json
settings(true);
injeta(rodar(skill('grilling')));
settings(false);
calado(rodar(skill('grilling')), 'settings.json com grill_tela false');
injeta(rodar(skill('grilling'), { CLAUDE_PLUGIN_OPTION_GRILL_TELA: 'true' }));
fs.writeFileSync(path.join(casa, 'settings.json'), '{corrompido');
calado(rodar(skill('grilling')), 'settings.json corrompido');

// 5. ligada, o resto passa calado
for (const entrada of [skill('tdd'), skill('mattpocock-skills:tdd'), skill('grill-tela'), 'isso nao e json', '', '{}']) {
  calado(rodar(entrada, { CLAUDE_PLUGIN_OPTION_GRILL_TELA: 'true' }), entrada);
}

// 6. regra para o AGENTS.md
const r = rodar('', {}, ['regra']);
assert.strictEqual(r.status, 0);
const { INSTRUCAO, REGRA, ligado } = require('./grill-canal.js');
assert.strictEqual(r.stdout, `<grill-canal>\n${REGRA}\n</grill-canal>\n`);
assert.match(REGRA, /grill-tela/);
assert.ok(!REGRA.includes('AskUserQuestion'), 'a regra vale para harness sem AskUserQuestion');
assert.match(INSTRUCAO, /AskUserQuestion/);
assert.deepStrictEqual([true, 'true', '1', 'sim', ' TRUE '].map(ligado), [true, true, true, true, true]);
assert.deepStrictEqual([false, 'false', '0', '', undefined, null].map(ligado), [false, false, false, false, false, false]);

console.log('hook do grill ok: desligado por padrao, opcao, GRILL_TELA e settings.json decidem, o resto passa calado, e a regra sai para o AGENTS.md');
