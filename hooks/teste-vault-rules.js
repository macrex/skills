#!/usr/bin/env node
'use strict';
// Checagem do contexto do projeto que o hook do vault anexa ao REGRAS, rodado pela linha de
// comando como o Claude Code faz, com o vault e a pasta do projeto numa pasta temporaria:
//   1. o REGRAS traz a linha de que o vault vale para a data em que foi escrito;
//   2. SessionStart com o hub apontando a pasta (Repo:) anexa o contexto_projeto depois do REGRAS;
//   3. SubagentStart nunca o anexa;
//   4. pasta sem hub no vault injeta so o REGRAS;
//   5. sem python no PATH, so o REGRAS;
//   6. python que falha, ou que passa do prazo, injeta so o REGRAS dentro do timeout do
//      hooks.json (so fora do Windows, onde um script serve de python falso).
//
//   node hooks/teste-vault-rules.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hook = path.join(__dirname, 'vault-rules.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-rules-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const vault = path.join(tmp, 'vault');
const repo = path.join(tmp, 'repo-com-outro-nome');
fs.mkdirSync(path.join(vault, 'demo'), { recursive: true });
fs.mkdirSync(repo);
fs.writeFileSync(
  path.join(vault, 'demo', 'demo.md'),
  `---\nprojeto: demo\ntipo: hub\nstatus: ativo\ndata: 2026-01-01\ntags: [hub]\n---\n\n# demo\n\nProjeto de demonstracao. Hub global: [[Home]].\nRepo: ${repo}\n`,
);

const base = { ...process.env, CLAUDE_CONFIG_DIR: tmp, OBSIDIAN_VAULT: vault };
delete base.CLAUDE_PLUGIN_OPTION_VAULT;
const rodar = (evento, pasta) =>
  spawnSync(process.execPath, [hook, evento], { encoding: 'utf8', env: { ...base, CLAUDE_PROJECT_DIR: pasta } });

const { REGRAS } = require('./vault-rules.js');
assert.match(REGRAS, /O que o vault diz vale para a data em que foi escrito/);
console.log('ok: o REGRAS traz a linha da memoria datada');

let r = rodar('SessionStart', repo);
assert.strictEqual(r.status, 0, r.stderr);
assert.ok(r.stdout.startsWith(REGRAS), 'o REGRAS vem primeiro');
assert.match(r.stdout.slice(REGRAS.length), /<vault-contexto>[\s\S]*Projeto: demo \(demo\/demo\.md\)[\s\S]*<\/vault-contexto>$/);
console.log('ok: SessionStart anexa o contexto_projeto do hub que aponta a pasta');

r = rodar('SubagentStart', repo);
assert.strictEqual(r.status, 0, r.stderr);
assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, REGRAS);
console.log('ok: SubagentStart injeta so o REGRAS');

r = rodar('SessionStart', path.join(tmp, 'sem-hub'));
assert.strictEqual(r.status, 0, r.stderr);
assert.strictEqual(r.stdout, REGRAS);
console.log('ok: pasta sem hub injeta so o REGRAS');

// PATH numa pasta vazia, nao ausente: no Windows o libuv repoe o PATH que falta no env do filho
const semPath = Object.fromEntries(Object.entries(base).filter(([k]) => k.toUpperCase() !== 'PATH'));
const vazia = path.join(tmp, 'vazia');
fs.mkdirSync(vazia);
r = spawnSync(process.execPath, [hook, 'SessionStart'], { encoding: 'utf8', env: { ...semPath, PATH: vazia, CLAUDE_PROJECT_DIR: repo } });
assert.strictEqual(r.status, 0, r.stderr);
assert.strictEqual(r.stdout, REGRAS);
console.log('ok: sem python no PATH, so o REGRAS');

if (process.platform !== 'win32') {
  const falsos = path.join(tmp, 'pythons');
  fs.mkdirSync(falsos);
  const pythonFalso = (corpo) => {
    for (const nome of ['python3', 'python']) fs.writeFileSync(path.join(falsos, nome), `#!/bin/sh\n${corpo}\n`, { mode: 0o755 });
  };
  const comFalsos = () =>
    spawnSync(process.execPath, [hook, 'SessionStart'], {
      encoding: 'utf8',
      env: { ...semPath, PATH: `${falsos}:/usr/bin:/bin`, CLAUDE_PROJECT_DIR: repo },
    });
  pythonFalso('exit 1');
  r = comFalsos();
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, REGRAS);
  console.log('ok: python que falha injeta so o REGRAS');

  pythonFalso('exec sleep 30'); // exec: o sleep e o processo que o prazo mata, sem neto segurando o stdout
  const timeout = require('./hooks.json').hooks.SessionStart[0].hooks[0].timeout * 1000;
  const inicio = Date.now();
  r = comFalsos();
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, REGRAS);
  assert.ok(Date.now() - inicio < timeout, `o hook passou do timeout de ${timeout} ms do hooks.json`);
  console.log('ok: python que passa do prazo injeta so o REGRAS, dentro do timeout do hooks.json');
}

console.log('\ntudo ok');
