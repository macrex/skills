#!/usr/bin/env node
'use strict';
// Checagem do descobridor, em repos temporarios:
//   1. so ferramenta de ESCRITA marca o repo como alvo da leva — um repo apenas
//      lido (Read) nao entra; um editado (Edit) entra;
//   2. repo sem nenhum commit nao some da lista: entra marcado (semCommit), para
//      o comando pula-lo dizendo por que;
//   3. repo com a pasta .obsidian na raiz e' o vault (vault: true), que o comando
//      ignora;
//   4. o transcript do Pi (PI_SESSION_FILE, toolCall edit/write, caminho relativo
//      ao cwd do cabecalho) e o do Codex (rollout mais recente com este cwd, patch
//      `*** Update File:` escapado duas vezes) marcam os mesmos repos.
//
//   node scripts/teste-repos-da-leva.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cpv-teste-'));
process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));

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

// Roda o descobridor com a casa temporaria e sem herdar a sessao do harness que
// executa este teste; cada caso poe so a sua.
function roda(args, env) {
  const saida = execFileSync(process.execPath, [
    path.join(__dirname, 'repos-da-leva.js'), '--json', '--cwd', vazio, ...args,
  ], {
    encoding: 'utf8',
    env: { ...process.env, HOME: base, USERPROFILE: base, CLAUDECODE: '', CLAUDE_CODE_SESSION_ID: '', PI_SESSION_ID: '', PI_SESSION_FILE: '', ...env },
  });
  const { info, repos } = JSON.parse(saida);
  return { info, repos, raizes: repos.map((r) => r.raiz) };
}

// 1-3) transcript do Claude Code
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

const claude = roda(['--sessao', sessao], {});
assert.deepStrictEqual(claude.raizes, [cofre, editado, nascente], `so os repos editados entram na leva; veio: ${JSON.stringify(claude.raizes)}`);
assert.strictEqual(claude.repos[0].vault, true, 'repo com .obsidian na raiz e o vault');
assert.strictEqual(claude.repos[2].semCommit, true, 'repo sem commit entra marcado como semCommit');
assert.strictEqual(claude.info.transcript.harness, 'claude-code');

// 4a) transcript do Pi: cabecalho com o cwd da sessao, edit relativo a ele
const piSessao = path.join(base, 'pi.jsonl');
const chamada = (name, p) =>
  JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'toolCall', name, arguments: { path: p } }] } });
fs.writeFileSync(piSessao, [
  JSON.stringify({ type: 'session', version: 3, cwd: editado }),
  chamada('read', path.join(lido, 'a.txt')),
  chamada('edit', 'a.txt'),
  chamada('write', path.join(nascente, 'a.txt')),
].join('\n') + '\n');

const pi = roda([], { PI_SESSION_ID: 'x', PI_SESSION_FILE: piSessao });
assert.strictEqual(pi.info.transcript.harness, 'pi');
assert.deepStrictEqual(pi.raizes, [editado, nascente], `Pi: edit relativo resolve pelo cwd do cabecalho; veio: ${JSON.stringify(pi.raizes)}`);

// 4b) transcript do Codex: o rollout mais novo abriu noutro cwd e nao conta; o
//     deste cwd traz um apply_patch direto (caminho com segmentos que comecam em
//     n e r, que um corte no `\n` literal comeria) e um patch dentro do JS do
//     modo exec (escapado duas vezes)
const dia = path.join(base, '.codex', 'sessions', '2026', '01', '01');
fs.mkdirSync(dia, { recursive: true });
fs.mkdirSync(path.join(editado, 'novo'));
fs.writeFileSync(path.join(editado, 'novo', 'rel.txt'), 'r\n');
const meta = (cwd) => JSON.stringify({ type: 'session_meta', payload: { cwd, base_instructions: 'x'.repeat(2000) } });
const patch = (arquivo) => `*** Begin Patch\n*** Update File: ${arquivo}\n*** Add File: novo.txt\n@@\n+x\n*** End Patch`;
const direto = (arquivo) => JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: patch(arquivo) } });
const exec = (arquivo) => JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: `const r = await tools.exec_command(${JSON.stringify({ cmd: `apply_patch <<'EOF'\n${patch(arquivo)}\nEOF` })});` } });
const certo = path.join(dia, 'rollout-2026-01-01T00-00-00-certo.jsonl');
const outro = path.join(dia, 'rollout-2026-01-01T00-00-01-outro.jsonl');
fs.writeFileSync(certo, [meta(vazio), direto(path.join(editado, 'novo', 'rel.txt')), exec(path.join(nascente, 'a.txt'))].join('\n') + '\n');
fs.writeFileSync(outro, [meta(lido), direto(path.join(lido, 'a.txt'))].join('\n') + '\n');
fs.utimesSync(certo, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
fs.utimesSync(outro, new Date(), new Date());

const codex = roda([], {});
assert.strictEqual(codex.info.transcript.harness, 'codex');
assert.strictEqual(codex.info.transcript.arquivo, certo, 'Codex: vale o rollout mais novo com ESTE cwd, nao o mais novo de todos');
assert.deepStrictEqual(codex.raizes, [editado, nascente], `Codex: patch direto e patch no JS do exec marcam os repos; Add File relativo cai no cwd, que nao e repo; veio: ${JSON.stringify(codex.raizes)}`);

// 4c) rollout parado ha horas e sessao antiga, nao a corrente: sem transcript
//     (e o caso do Antigravity com um Codex usado antes no mesmo cwd)
const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
fs.utimesSync(certo, ontem, ontem);
const antigo = roda([], {});
assert.strictEqual(antigo.info.transcript.harness, 'outro', 'rollout velho nao vira transcript');
assert.strictEqual(antigo.info.transcript.arquivo, null);
assert.deepStrictEqual(antigo.raizes, [], 'sem transcript so a varredura conta, e o cwd nao e repo');

console.log('ok: Read nao marca o repo, Edit marca; repo sem commit aparece marcado; .obsidian marca o vault; Pi e Codex marcam pelo transcript deles');
