#!/usr/bin/env node
'use strict';
// Checagem do descobridor, em repos temporarios:
//   1. so ferramenta de ESCRITA marca o repo como alvo da leva — um repo apenas
//      lido (Read) nao entra; um editado (Edit) entra;
//   2. repo sem nenhum commit nao some da lista: entra marcado (semCommit), para
//      o comando pula-lo dizendo por que;
//   3. repo com a pasta .obsidian na raiz e' o vault (vault: true), que o comando
//      ignora.
//
//   node scripts/teste-repos-da-leva.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cpv-teste-'));

function repo(nome) {
  const dir = path.join(base, nome);
  fs.mkdirSync(dir);
  const git = (...cmd) => execFileSync('git', ['-C', dir, ...cmd], { stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git('add', '-A');
  git('-c', 'user.name=teste', '-c', 'user.email=teste@local', 'commit', '-q', '-m', 'inicio');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'b\n');   // pendente: sem isso o repo sairia como "parado"
  return dir;
}

const lido = repo('lido');
const editado = repo('editado');
const cofre = repo('cofre');                           // vault Obsidian: a pasta .obsidian marca
fs.mkdirSync(path.join(cofre, '.obsidian'));
const nascente = path.join(base, 'nascente');          // git init sem nenhum commit
fs.mkdirSync(nascente);
execFileSync('git', ['-C', nascente, 'init', '-q', '-b', 'main'], { stdio: 'ignore' });
fs.writeFileSync(path.join(nascente, 'a.txt'), 'a\n');
const vazio = path.join(base, 'vazio');
fs.mkdirSync(vazio);

// transcript da sessao, no formato jsonl do Claude Code (so o que o descobridor le)
const sessao = 'teste-cpv';
const projetos = path.join(base, '.claude', 'projects', 'x');
fs.mkdirSync(projetos, { recursive: true });
const uso = (name, file_path) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: { file_path } }] } });
fs.writeFileSync(path.join(projetos, `${sessao}.jsonl`), [
  uso('Read', path.join(lido, 'a.txt')),
  uso('Edit', path.join(editado, 'a.txt')),
  uso('Edit', path.join(cofre, 'a.txt')),
  uso('Edit', path.join(nascente, 'a.txt')),
].join('\n') + '\n');

const saida = execFileSync(process.execPath, [
  path.join(__dirname, 'repos-da-leva.js'), '--json', '--cwd', vazio, '--sessao', sessao,
], { encoding: 'utf8', env: { ...process.env, HOME: base, USERPROFILE: base } });

const repos = JSON.parse(saida).repos;
const raizes = repos.map((r) => r.raiz);
fs.rmSync(base, { recursive: true, force: true });
assert.deepStrictEqual(raizes, [cofre, editado, nascente], `so os repos editados entram na leva; veio: ${JSON.stringify(raizes)}`);
assert.strictEqual(repos[0].vault, true, 'repo com .obsidian na raiz e o vault');
assert.strictEqual(repos[2].semCommit, true, 'repo sem commit entra marcado como semCommit');
console.log('ok: Read nao marca o repo, Edit marca; repo sem commit aparece marcado; .obsidian marca o vault');
