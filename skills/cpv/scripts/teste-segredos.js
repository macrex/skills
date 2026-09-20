#!/usr/bin/env node
'use strict';
// Checagem do varredor de segredos, num repo temporario:
//   1. segredo pelo NOME (.env, .pem) e pelo CONTEUDO (chave AWS, senha literal,
//      URL com senha, chave privada) e achado, com arquivo e linha;
//   2. o que parece segredo mas nao e — .env.example, senha lida de variavel,
//      comentario, valor vazio, input type=password — NAO e achado;
//   3. so o que entraria no commit e lido: arquivo ignorado pelo .gitignore e
//      arquivo apagado ficam de fora; untracked novo entra;
//   4. exit 1 com achado, 0 limpo.
//
//   node scripts/teste-segredos.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cpv-segredos-'));
const repo = path.join(base, 'repo');
fs.mkdirSync(repo);
const git = (...cmd) => execFileSync('git', ['-C', repo, ...cmd], { stdio: 'ignore' });
const escreve = (rel, txt) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), txt);
};
// As fixtures sao montadas em pedacos para este arquivo nao acender o proprio
// varredor quando o /cpv fecha o repositorio das skills.
const AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const PEM = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ');
const SENHA = ['pass', 'word'].join('') + ' = "' + 'hunter2' + 'segredo"';
const URL = 'url = "postgres://app:' + 's3nh4' + 'forte@db.local:5432/app"';

git('init', '-q', '-b', 'main');
escreve('.gitignore', 'ignorado.env\n');
escreve('apagado.txt', AWS + '\n');   // sera apagado: nao pode ser lido
escreve('limpo.js', 'const x = 1;\n');
git('add', '-A');
git('-c', 'user.name=t', '-c', 'user.email=t@l', 'commit', '-q', '-m', 'inicio');
fs.unlinkSync(path.join(repo, 'apagado.txt'));

// segredos de verdade
escreve('.env', 'DB=x\n');
escreve('certs/chave.pem', 'qualquer coisa\n');
escreve('config.py', [
  'import os',
  'DEBUG = True',
  SENHA,
  URL,
].join('\n'));
escreve('aws.txt', 'access ' + AWS + '\n');
escreve('id.txt', PEM + '\nMIIE...\n');
escreve('ignorado.env', ['SEC', 'RET=abcd'].join('') + '\n');       // no .gitignore: nao entraria no commit

// o que parece mas nao e
escreve('.env.example', 'PASSWORD=changeme\n');
escreve('ok.py', [
  'password = os.environ["DB_PASSWORD"]',
  'token = ${GITHUB_TOKEN}',
  '# ' + ['pass', 'word'].join('') + ' = "isto e um comentario"',
  'senha = ""',
  'api_key = None',
  '<input type="password" name="senha">',
  'password: <sua senha aqui>',
  'test_password = "abcdef"   # fixture de teste',
].join('\n'));
escreve('foto.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));

const r = spawnSync(process.execPath, [path.join(__dirname, 'segredos.js'), repo, '--json'], { encoding: 'utf8' });
const saida = JSON.parse(r.stdout);
const achados = saida.repos[0].achados;
const porArquivo = (a) => achados.filter((x) => x.arquivo === a);
fs.rmSync(base, { recursive: true, force: true });

assert.strictEqual(r.status, 1, 'exit 1 quando ha achado');
assert.strictEqual(porArquivo('.env').length, 1, '.env achado pelo nome');
assert.strictEqual(porArquivo('certs/chave.pem').length, 1, '.pem achado pelo nome');
assert.deepStrictEqual(porArquivo('config.py').map((a) => a.linha), [3, 4], 'senha literal e URL com senha, com a linha certa');
assert.strictEqual(porArquivo('aws.txt')[0].motivo, 'AWS access key');
assert.strictEqual(porArquivo('id.txt')[0].motivo, 'chave privada');
assert.ok(!achados.some((a) => a.trecho.includes('hunter2segredo')), 'o trecho sai mascarado');

assert.strictEqual(porArquivo('ignorado.env').length, 0, 'arquivo no .gitignore nao e lido');
assert.strictEqual(porArquivo('apagado.txt').length, 0, 'arquivo apagado nao e lido');
assert.strictEqual(porArquivo('.env.example').length, 0, '.env.example nao e segredo');
assert.deepStrictEqual(porArquivo('ok.py'), [], `falso positivo em ok.py: ${JSON.stringify(porArquivo('ok.py'))}`);
assert.strictEqual(porArquivo('foto.png').length, 0, 'binario e pulado');
assert.strictEqual(porArquivo('limpo.js').length, 0, 'arquivo limpo e sem mudanca nao aparece');

// repo limpo: exit 0
const base2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cpv-segredos-'));
execFileSync('git', ['-C', base2, 'init', '-q'], { stdio: 'ignore' });
const r2 = spawnSync(process.execPath, [path.join(__dirname, 'segredos.js'), base2], { encoding: 'utf8' });
fs.rmSync(base2, { recursive: true, force: true });
assert.strictEqual(r2.status, 0, 'exit 0 sem achado');
assert.ok(r2.stdout.includes('LIMPO'), 'saida diz LIMPO');

console.log('ok: segredos por nome e conteudo com a linha; falsos positivos fora; so o que entra no commit; exit 1/0');
