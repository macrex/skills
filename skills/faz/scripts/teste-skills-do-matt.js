#!/usr/bin/env node
'use strict';
// Checagem do localizador, numa casa temporaria com as raizes de cada harness:
//   1. no Claude Code, `~/.claude/skills` ganha do plugin em cache, e so a skill que
//      veio do plugin leva o prefixo `mattpocock-skills:`;
//   2. no Pi, o pacote instalado por `pi install` e `~/.agents/skills` contam, e
//      `~/.claude/skills` nao;
//   3. em "outro" (Codex, Antigravity), `~/.codex/skills` conta, inclusive o clone do
//      repositorio do Matt dentro dela, e a pasta global do Antigravity tambem;
//   4. exit 1 enquanto falta alguma, 0 com as seis;
//   5. o nome da propria faz leva o prefixo do plugin que a carrega, do cache ou de uma pasta local;
//   6. --linha imprime o prompt da leva pronto, cada nome de skill abrindo uma linha.
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
const codexClone = skill('.codex', 'skills', 'mattpocock', 'skills', 'engineering', 'to-tickets');
const agyToSpec = skill('.gemini', 'config', 'skills', 'to-spec');

function roda(env, script = path.join(__dirname, 'skills-do-matt.js')) {
  const r = spawnSync(process.execPath, [script, '--json'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: base, USERPROFILE: base, CLAUDECODE: '', PI_SESSION_ID: '', ...env },
  });
  const saida = JSON.parse(r.stdout);
  const por = Object.fromEntries(saida.skills.map((s) => [s.skill, s]));
  return { status: r.status, harness: saida.harness, faz: saida.faz, por, faltam: saida.faltam };
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
assert.strictEqual(outro.por['to-tickets'].caminho, codexClone, 'clone do Matt dentro de ~/.codex/skills conta');
assert.strictEqual(outro.por['to-spec'].caminho, agyToSpec, 'pasta global do Antigravity conta');
assert.strictEqual(outro.por['domain-modeling'].caminho, null, 'Codex nao le o cache do plugin');

for (const s of ['grilling', 'domain-modeling', 'code-review']) skill('.agents', 'skills', s);
const completo = roda({});
assert.strictEqual(completo.status, 0, 'com as seis, exit 0');
assert.deepStrictEqual(completo.faltam, []);

// --linha: o prompt pronto, com a abertura do Claude Code e os nomes do localizador, cada um abrindo
// uma linha; fora do Claude Code a abertura fica para o agente
skill('.agents', 'skills', 'to-tickets');
const linha = (env) =>
  spawnSync(process.execPath, [path.join(__dirname, 'skills-do-matt.js'), '--linha', 'Spec do CSV', 'da sessão', 'sonnet'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: base, USERPROFILE: base, CLAUDECODE: '', PI_SESSION_ID: '', ...env },
  });
const noClaude = linha({ CLAUDECODE: '1' });
assert.strictEqual(noClaude.status, 0, noClaude.stderr);
const linhas = noClaude.stdout.trimEnd().split('\n');
assert.match(linhas[0], /^rode \/\S*faz leva Spec do CSV até o fim\.$/);
assert.strictEqual(linhas.length, 14);
assert.ok(linhas.includes('/mattpocock-skills:to-spec expandiu esse documento in-place;'), noClaude.stdout);
for (const s of ['to-tickets', 'implement', 'code-review']) assert.ok(linhas.some((l) => new RegExp(`^/\\S*${s} `).test(l)), s);
assert.ok(linhas.includes('com os agentes dele (se houver) no modelo da sessão;'));
assert.ok(linhas.includes('com agentes no modelo sonnet;'));
assert.ok(linhas.every((l) => l.length <= 62 || l === linhas[0]), 'linhas curtas');
assert.match(linha({}).stdout, /^<abertura> até o fim\.\n/);
assert.strictEqual(spawnSync(process.execPath, [path.join(__dirname, 'skills-do-matt.js'), '--linha'], { cwd, encoding: 'utf8' }).status, 1, 'sem argumentos, exit 1');

// A faz copiada para `<raiz>/skills/faz`; com `comPlugin`, a raiz e a de um plugin.
function fazEm(comPlugin, ...raiz) {
  const scripts = path.join(base, ...raiz, 'skills', 'faz', 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'skills-do-matt.js'), path.join(scripts, 'skills-do-matt.js'));
  if (comPlugin) {
    fs.mkdirSync(path.join(base, ...raiz, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(base, ...raiz, '.claude-plugin', 'plugin.json'), '{ "name": "macrex-skills" }');
  }
  return roda({}, path.join(scripts, 'skills-do-matt.js')).faz;
}
assert.strictEqual(fazEm(false, '.claude'), 'faz', 'instalada sem plugin, a faz se chama so faz');
assert.strictEqual(fazEm(true, '.claude', 'plugins', 'cache', 'macrex', 'macrex-skills', '1.0.0'), 'macrex-skills:faz', 'no cache do plugin a faz leva o prefixo dele');
assert.strictEqual(fazEm(true, 'clones', 'skills-publico'), 'macrex-skills:faz', 'no plugin carregado de uma pasta local tambem');
// a faz de um clone ligada por link em ~/.claude/skills: o harness a chama `faz`
const ligada = path.join(base, 'casa', '.claude', 'skills', 'faz');
fs.mkdirSync(path.dirname(ligada), { recursive: true });
fs.symlinkSync(path.join(base, 'clones', 'skills-publico', 'skills', 'faz'), ligada, 'junction');
assert.strictEqual(roda({}, path.join(ligada, 'scripts', 'skills-do-matt.js')).faz, 'faz', 'ligada por link fora de um plugin, a faz se chama so faz');

console.log('ok: raizes por harness, prefixo so no plugin do Claude Code, exit 1 enquanto falta alguma, nome da faz');
