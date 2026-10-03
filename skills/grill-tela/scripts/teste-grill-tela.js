#!/usr/bin/env node
'use strict';
// Checagem do programa da grill-tela pelos subcomandos que o agente usa e pela API que a
// pagina usa, com as preferencias numa pasta temporaria:
//   1. iniciar sobe o servidor e imprime a URL; pedido sem o token e recusado;
//   2. rodada e final recusam o JSON malformado com codigo 1 e aceitam o valido;
//   3. aguardar devolve as respostas da pagina (tabela e JSON), o ajuste e o sim;
//   4. respostas com questao sem marca sao recusadas;
//   5. preferencias gravam na pasta e voltam na leitura;
//   6. o sim e o cli encerram o servidor, e o cli chega ao aguardar; depois do sim o cli e recusado;
//   7. sem a pagina consultar, o servidor encerra sozinho e o aguardar recebe o JSON encerrado;
//   8. um segundo aguardar substitui o primeiro, que sai com o JSON substituido;
//   9. resposta que nao e JSON (outro processo na porta) cai na mensagem de seguir no CLI.
//
//   node skills/grill-tela/scripts/teste-grill-tela.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'grill-tela.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grill-tela-'));
process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));
const env = { ...process.env, GRILL_TELA_DIR: base };

const roda = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
const arquivo = (nome, obj) => {
  const p = path.join(base, nome);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
};
function aguardar(url) {
  const filho = spawn(process.execPath, [SCRIPT, 'aguardar', url], { env });
  let saida = '';
  let erro = '';
  filho.stdout.on('data', (d) => (saida += d));
  filho.stderr.on('data', (d) => (erro += d));
  return new Promise((ok) => filho.on('close', (status) => ok({ status, saida, erro })));
}
const espere = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ultimaLinha = (s) => JSON.parse(s.trim().split('\n').pop());

function pedir(url, metodo = 'GET', corpo) {
  return new Promise((ok, falha) => {
    const req = http.request(url, { method: metodo, headers: { 'content-type': 'application/json' } }, (res) => {
      let txt = '';
      res.on('data', (d) => (txt += d));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(txt); } catch (e) { /* pagina HTML */ }
        ok({ status: res.statusCode, json, txt });
      });
    });
    req.on('error', falha);
    req.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
}
const api = (url, rota) => {
  const u = new URL(url);
  return `${u.origin}/api/${rota}?t=${u.searchParams.get('t')}`;
};
async function encerrou(url, ms = 8000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
    try { await pedir(api(url, 'estado')); } catch (e) { return true; }
  }
  return false;
}
function iniciar(extraEnv = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, 'iniciar', '--sem-navegador', '--projeto', 'teste'],
    { encoding: 'utf8', env: { ...env, ...extraEnv } });
  assert.strictEqual(r.status, 0, r.stderr);
  const url = r.stdout.trim().split('\n').pop();
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32}$/);
  return url;
}

const RODADA = {
  rodada: 1,
  questoes: [
    { id: 'Q1', cabecalho: 'Transporte', titulo: 'Como conversam?', contexto: 'Hoje é **CLI**.',
      opcoes: [{ rotulo: 'Servidor local', descricao: 'Node', recomendada: true }, { rotulo: 'Artifact', descricao: 'claude.ai' }] },
    { id: 'Q2', cabecalho: 'Nome', titulo: 'Qual o nome?',
      opcoes: [{ rotulo: 'grill-tela', descricao: '', recomendada: true }, { rotulo: 'grill-html' }] },
  ],
};

(async () => {
  // 1. iniciar e token
  const url = iniciar();
  assert.strictEqual((await pedir(url.replace(/\?t=.*/, ''))).status, 403, 'sem token: 403');
  assert.strictEqual((await pedir(url.replace(/t=.*/, 't=errado'))).status, 403, 'token errado: 403');
  const pagina = await pedir(url);
  assert.strictEqual(pagina.status, 200);
  assert.match(pagina.txt, /<html/);
  let estado = (await pedir(api(url, 'estado'))).json;
  assert.strictEqual(estado.fase, 'inicio');
  assert.strictEqual(estado.projeto, 'teste');

  // 2. rodada malformada e valida
  const ruim = { rodada: 0, questoes: [{ id: 'Q1', cabecalho: '', titulo: 'x',
    opcoes: [{ rotulo: 'a', recomendada: true }, { rotulo: 'b', recomendada: true }] }] };
  let r = roda('rodada', url, arquivo('ruim.json', ruim));
  assert.strictEqual(r.status, 1, 'rodada malformada sai com 1');
  assert.match(r.stderr, /rodada/);
  assert.match(r.stderr, /cabecalho/);
  assert.match(r.stderr, /recomendada/);
  assert.strictEqual(roda('rodada', url, arquivo('quebrado.json', '{nao e json')).status, 1, 'JSON invalido sai com 1');
  r = roda('rodada', url, arquivo('rodada.json', RODADA));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /Rodada 1 na tela, 2 questões/);
  estado = (await pedir(api(url, 'estado'))).json;
  assert.strictEqual(estado.fase, 'rodada');
  assert.strictEqual(estado.rodada.questoes.length, 2);

  // 8. o segundo aguardar substitui o primeiro
  const velha = aguardar(url);
  await espere(500);
  const espera = aguardar(url);
  assert.deepStrictEqual(ultimaLinha((await velha).saida), { tipo: 'substituido' });

  // 3 e 4. respostas incompletas recusadas; completas chegam ao aguardar
  let p = await pedir(api(url, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [{ id: 'Q1', opcao: 0 }] });
  assert.strictEqual(p.status, 400, 'questao sem marca: 400');
  p = await pedir(api(url, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [
    { id: 'Q1', opcao: 0, comentario: 'ok | com barra' }, { id: 'Q2', opcao: null, propria: 'grill-web' }] });
  assert.strictEqual(p.status, 200, p.txt);
  let fim = await espera;
  assert.strictEqual(fim.status, 0);
  assert.match(fim.saida, /\| Questão \| Marca \| Escolha \| Comentário \|/);
  assert.match(fim.saida, /ok \\\| com barra/, 'barra escapada na tabela');
  assert.deepStrictEqual(ultimaLinha(fim.saida), { tipo: 'rodada', rodada: 1, respostas: [
    { id: 'Q1', marca: 'aceito', escolha: 'Servidor local', comentario: 'ok | com barra' },
    { id: 'Q2', marca: 'outra', escolha: 'grill-web', comentario: null }] });
  estado = (await pedir(api(url, 'estado'))).json;
  assert.strictEqual(estado.fase, 'aguarde');
  assert.strictEqual(estado.historico.length, 1);

  // 5. preferencias
  p = await pedir(api(url, 'preferencias'), 'POST', { modo: 'B', tema: 'dark', intruso: 1 });
  assert.strictEqual(p.status, 200);
  assert.deepStrictEqual((await pedir(api(url, 'preferencias'))).json, { modo: 'B', tema: 'dark' });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(base, 'preferencias.json'), 'utf8')), { modo: 'B', tema: 'dark' });

  // final: malformada, ajuste e sim
  assert.strictEqual(roda('final', url, arquivo('final-ruim.json', { tabela: [] })).status, 1, 'final vazia sai com 1');
  assert.strictEqual(roda('final', url, arquivo('final.json', { tabela: [{ decisao: 'Nome', escolha: 'grill-tela' }] })).status, 0);
  let espera2 = aguardar(url);
  assert.strictEqual((await pedir(api(url, 'respostas'), 'POST', { tipo: 'ajuste', texto: '' })).status, 400, 'ajuste vazio: 400');
  assert.strictEqual((await pedir(api(url, 'respostas'), 'POST', { tipo: 'ajuste', texto: 'trocar nome' })).status, 200);
  assert.deepStrictEqual(ultimaLinha((await espera2).saida), { tipo: 'ajuste', texto: 'trocar nome' });
  assert.strictEqual(roda('final', url, arquivo('final.json', { tabela: [{ decisao: 'Nome', escolha: 'grill-tela' }] })).status, 0);
  espera2 = aguardar(url);
  assert.strictEqual((await pedir(api(url, 'respostas'), 'POST', { tipo: 'sim' })).status, 200);
  assert.deepStrictEqual(ultimaLinha((await espera2).saida), { tipo: 'sim' });
  assert.strictEqual(roda('cli', url).status, 1, 'cli depois do sim: recusado');
  assert.strictEqual((await pedir(api(url, 'estado'))).json.fase, 'concluido');
  assert.ok(await encerrou(url), 'o sim encerra o servidor');

  // 6. cli
  const url2 = iniciar();
  assert.strictEqual(roda('rodada', url2, arquivo('rodada.json', RODADA)).status, 0);
  const espera3 = aguardar(url2);
  await espere(300);
  r = roda('cli', url2);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(ultimaLinha((await espera3).saida), { tipo: 'cli' });
  assert.strictEqual((await pedir(api(url2, 'estado'))).json.fase, 'cli');
  assert.ok(await encerrou(url2), 'o cli encerra o servidor');

  // 7. ocioso
  const url3 = iniciar({ GRILL_TELA_OCIOSO_MS: '1000' });
  const ociosa = await aguardar(url3);
  assert.strictEqual(ociosa.status, 0, ociosa.erro);
  assert.strictEqual(ultimaLinha(ociosa.saida).tipo, 'encerrado');
  assert.ok(await encerrou(url3, 6000), 'ocioso encerra o servidor');

  // 9. outro processo na porta, respondendo HTML
  const intruso = http.createServer((req, res) => res.end('<html>outro</html>'));
  await new Promise((ok) => intruso.listen(0, '127.0.0.1', ok));
  const falsa = await aguardar(`http://127.0.0.1:${intruso.address().port}/?t=x`);
  intruso.close();
  assert.strictEqual(falsa.status, 1);
  assert.match(falsa.erro, /siga o grill no CLI/, falsa.erro);

  console.log('grill-tela ok: iniciar, token, validacao, aguardar, preferencias, final, cli, ocioso, aguardar substituido e resposta que nao e JSON');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
