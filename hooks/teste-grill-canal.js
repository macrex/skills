#!/usr/bin/env node
'use strict';
// Checagem do hook do grill, rodado por stdin como o Claude Code faz, com CLAUDE_CONFIG_DIR e
// CLAUDE_PROJECT_DIR numa pasta temporaria, para os settings.json da maquina nao contarem:
//   1. sem opcao nenhuma, ou com cli ou um valor desconhecido, o grilling passa calado: o
//      padrao e o fluxo de sempre do usuario;
//   2. perguntar: o grilling com e sem o prefixo `mattpocock-skills:` recebe a instrucao de
//      perguntar o canal (cita o AskUserQuestion e a grill-tela), sem decidir permissao;
//   3. tela: recebe a instrucao de fazer as rodadas pelo AskUserQuestion, que o plugin leva a
//      grill-tela, e a tela final pela skill, sem perguntar;
//   4. a opcao do plugin ganha de GRILL_CANAL; sem a opcao, GRILL_CANAL decide;
//   5. sem env, o pluginConfigs do settings.json decide; corrompido vale cli;
//   6. ligado, outra skill, JSON invalido, stdin vazio e `{}` passam calados, com status 0;
//   7. `regra` imprime a regra do modo para o AGENTS.md entre tags (perguntar por padrao),
//      recusa cli, e importado o modulo so exporta.
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
delete base.CLAUDE_PLUGIN_OPTION_GRILL_CANAL;
delete base.GRILL_CANAL;

const { INSTRUCAO, REGRA, canal } = require('./grill-canal.js');
const rodar = (entrada, env = {}, args = []) =>
  spawnSync(process.execPath, [hook, ...args], { input: entrada, encoding: 'utf8', env: { ...base, ...env } });
const skill = (nome) => JSON.stringify({ tool_name: 'Skill', tool_input: { skill: nome } });
const injeta = (r, modo) => {
  assert.strictEqual(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  assert.strictEqual(o.hookEventName, 'PreToolUse');
  assert.strictEqual(o.additionalContext, INSTRUCAO[modo]);
  assert.ok(!('permissionDecision' in o), 'o hook nao decide permissao');
};
const calado = (r, porque) => {
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, '', `deveria calar: ${porque}`);
};
const settings = (valor) =>
  fs.writeFileSync(path.join(casa, 'settings.json'),
    JSON.stringify({ pluginConfigs: { 'macrex-skills@macrex': { options: { vault: '', grill_canal: valor } } } }));
const opcao = (v) => ({ CLAUDE_PLUGIN_OPTION_GRILL_CANAL: v });

// os textos de cada modo
assert.match(INSTRUCAO.perguntar, /AskUserQuestion/);
assert.match(INSTRUCAO.perguntar, /grill-tela/);
assert.match(INSTRUCAO.tela, /grill-tela/);
assert.match(INSTRUCAO.tela, /sem perguntar/);
assert.match(INSTRUCAO.tela, /rodada pelo AskUserQuestion/);
assert.match(INSTRUCAO.tela, /tela final/);

// 1. cli por padrao
calado(rodar(skill('grilling')), 'sem opcao nenhuma');
calado(rodar(skill('mattpocock-skills:grilling')), 'sem opcao nenhuma, com prefixo');
for (const v of ['cli', '', 'qualquer', 'true']) calado(rodar(skill('grilling'), opcao(v)), `opcao ${v}`);

// 2 e 3. perguntar e tela
for (const nome of ['grilling', 'mattpocock-skills:grilling']) {
  injeta(rodar(skill(nome), opcao('perguntar')), 'perguntar');
  injeta(rodar(skill(nome), opcao('tela')), 'tela');
}
injeta(rodar(skill('grilling'), opcao(' Tela ')), 'tela');

// 4. opcao e GRILL_CANAL
calado(rodar(skill('grilling'), { ...opcao('cli'), GRILL_CANAL: 'tela' }), 'a opcao cli ganha da variavel');
injeta(rodar(skill('grilling'), { ...opcao('perguntar'), GRILL_CANAL: 'tela' }), 'perguntar');
injeta(rodar(skill('grilling'), { GRILL_CANAL: 'tela' }), 'tela');
calado(rodar(skill('grilling'), { GRILL_CANAL: 'cli' }), 'GRILL_CANAL=cli');

// 5. settings.json
settings('perguntar');
injeta(rodar(skill('grilling')), 'perguntar');
settings('tela');
injeta(rodar(skill('grilling')), 'tela');
settings('cli');
calado(rodar(skill('grilling')), 'settings.json com cli');
injeta(rodar(skill('grilling'), opcao('perguntar')), 'perguntar');
fs.writeFileSync(path.join(casa, 'settings.json'), '{corrompido');
calado(rodar(skill('grilling')), 'settings.json corrompido');

// 6. ligado, o resto passa calado
for (const entrada of [skill('tdd'), skill('mattpocock-skills:tdd'), skill('grill-tela'), 'isso nao e json', '', '{}']) {
  calado(rodar(entrada, opcao('tela')), entrada);
}

// 7. regra para o AGENTS.md
let r = rodar('', {}, ['regra']);
assert.strictEqual(r.status, 0);
assert.strictEqual(r.stdout, `<grill-canal>\n${REGRA.perguntar}\n</grill-canal>\n`);
r = rodar('', {}, ['regra', 'tela']);
assert.strictEqual(r.stdout, `<grill-canal>\n${REGRA.tela}\n</grill-canal>\n`);
r = rodar('', {}, ['regra', 'cli']);
assert.strictEqual(r.status, 1, 'regra cli e recusada: cli e nao ter a regra');
for (const modo of ['perguntar', 'tela']) {
  assert.match(REGRA[modo], /grill-tela/);
  assert.ok(!REGRA[modo].includes('AskUserQuestion'), 'a regra vale para harness sem AskUserQuestion');
}
assert.deepStrictEqual(['perguntar', 'pergunta', 'tela', 'navegador', 'browser', 'cli', '', null, 'x'].map(canal),
  ['perguntar', 'perguntar', 'tela', 'tela', 'tela', 'cli', 'cli', 'cli', 'cli']);

console.log('hook do grill ok: cli por padrao, perguntar e tela injetam a instrucao do modo, opcao, GRILL_CANAL e settings.json decidem, e a regra sai para o AGENTS.md');
