#!/usr/bin/env node
'use strict';
// Checagem do localizador, numa casa temporaria com as raizes de cada harness:
//   1. no Claude Code, `~/.claude/skills` ganha do plugin em cache, e so a skill que
//      veio do plugin leva o prefixo `mattpocock-skills:`;
//   2. no Pi, o pacote instalado por `pi install` e `~/.agents/skills` contam, e
//      `~/.claude/skills` nao;
//   3. em "outro" (Codex, Antigravity), `~/.codex/skills` conta;
//   4. exit 1 enquanto falta alguma, 0 com as seis.
//
//   node scripts/teste-skills-do-matt.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'faz-matt-'));
process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));
const cwd = path.join(base, 'projeto');
fs.mkdirSync(cwd);

const skill = (...rel) => {
  const pasta = path.join(base, ...rel);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'SKILL.md'), '---\nname: x\ndescription: x\n---\n');
  return pasta;
};

const claudeGrilling = skill('.claude', 'skills', 'grilling');
skill('.claude', 'plugins', 'cache', 'oficial', 'mattpocock-skills', '1.0.0', 'skills', 'productivity', 'grilling');
const pluginToSpec = skill('.claude', 'plugins', 'cache', 'oficial', 'mattpocock-skills', '1.0.0', 'skills', 'engineering', 'to-spec');
const piCodeReview = skill('.pi', 'agent', 'git', 'github.com', 'mattpocock', 'skills', 'skills', 'engineering', 'code-review');
const agentsImplement = skill('.agents', 'skills', 'implement');
const codexGrilling = skill('.codex', 'skills', 'grilling');

function roda(env) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'skills-do-matt.js'), '--json'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: base, USERPROFILE: base, CLAUDECODE: '', PI_SESSION_ID: '', ...env },
  });
  const saida = JSON.parse(r.stdout);
  const por = Object.fromEntries(saida.skills.map((s) => [s.skill, s]));
  return { status: r.status, harness: saida.harness, por, faltam: saida.faltam };
}

const claude = roda({ CLAUDECODE: '1' });
assert.strictEqual(claude.harness, 'claude-code');
assert.strictEqual(claude.por.grilling.caminho, claudeGrilling, '~/.claude/skills ganha do plugin');
assert.strictEqual(claude.por.grilling.nome, 'grilling');
assert.strictEqual(claude.por['to-spec'].caminho, pluginToSpec);
assert.strictEqual(claude.por['to-spec'].nome, 'mattpocock-skills:to-spec', 'skill do plugin leva prefixo');
assert.strictEqual(claude.por.implement.caminho, agentsImplement, '~/.agents/skills tambem vale no Claude Code, depois das raizes dele');
assert.strictEqual(claude.por.implement.nome, 'implement');
assert.strictEqual(claude.status, 1);

const pi = roda({ PI_SESSION_ID: 'x' });
assert.strictEqual(pi.harness, 'pi');
assert.strictEqual(pi.por['code-review'].caminho, piCodeReview, 'pacote do pi install conta');
assert.strictEqual(pi.por['code-review'].nome, 'code-review', 'no Pi o nome nao leva prefixo');
assert.strictEqual(pi.por.implement.caminho, agentsImplement);
assert.strictEqual(pi.por.grilling.caminho, null, 'Pi nao le ~/.claude/skills');
assert.deepStrictEqual(pi.faltam, ['grilling', 'domain-modeling', 'to-spec', 'to-tickets']);

const outro = roda({});
assert.strictEqual(outro.harness, 'outro');
assert.strictEqual(outro.por.grilling.caminho, codexGrilling);
assert.strictEqual(outro.por['to-spec'].caminho, null, 'Codex nao le o cache do plugin');

for (const s of ['grilling', 'domain-modeling', 'to-spec', 'to-tickets', 'code-review']) skill('.agents', 'skills', s);
const completo = roda({});
assert.strictEqual(completo.status, 0, 'com as seis, exit 0');
assert.deepStrictEqual(completo.faltam, []);

console.log('ok: raizes por harness, prefixo so no plugin do Claude Code, exit 1 enquanto falta alguma');
