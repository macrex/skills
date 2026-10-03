#!/usr/bin/env node
'use strict';
// Checagem do hook do grill, rodado por stdin como o Claude Code faz:
//   1. `grilling`, com e sem o prefixo `mattpocock-skills:`, recebe o additionalContext do
//      PreToolUse, que cita o AskUserQuestion e a grill-tela, sem decidir permissao;
//   2. outra skill, JSON invalido, stdin vazio e `{}` passam calados, com status 0;
//   3. `regra` imprime a regra para o AGENTS.md entre tags, e importado o modulo so exporta.
//
//   node hooks/teste-grill-canal.js

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const hook = path.join(__dirname, 'grill-canal.js');
const rodar = (entrada) => spawnSync(process.execPath, [hook], { input: entrada, encoding: 'utf8' });
const skill = (nome) => JSON.stringify({ tool_name: 'Skill', tool_input: { skill: nome } });

for (const nome of ['grilling', 'mattpocock-skills:grilling']) {
  const r = rodar(skill(nome));
  assert.strictEqual(r.status, 0);
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  assert.strictEqual(o.hookEventName, 'PreToolUse');
  assert.match(o.additionalContext, /AskUserQuestion/);
  assert.match(o.additionalContext, /grill-tela/);
  assert.ok(!('permissionDecision' in o), 'o hook nao decide permissao');
}

for (const entrada of [skill('tdd'), skill('mattpocock-skills:tdd'), skill('grill-tela'), 'isso nao e json', '', '{}']) {
  const r = rodar(entrada);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '', `deveria calar para: ${entrada}`);
}

const r = spawnSync(process.execPath, [hook, 'regra'], { input: '', encoding: 'utf8' });
assert.strictEqual(r.status, 0);
const { INSTRUCAO, REGRA } = require('./grill-canal.js');
assert.strictEqual(r.stdout, `<grill-canal>\n${REGRA}\n</grill-canal>\n`);
assert.match(REGRA, /grill-tela/);
assert.ok(!REGRA.includes('AskUserQuestion'), 'a regra vale para harness sem AskUserQuestion');
assert.match(INSTRUCAO, /AskUserQuestion/);

console.log('hook do grill ok: grilling com e sem prefixo injeta o canal, o resto passa calado, e a regra sai para o AGENTS.md');
