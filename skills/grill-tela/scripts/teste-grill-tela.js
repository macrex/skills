#!/usr/bin/env node
'use strict';
// Checagem do programa da grill-tela pelos subcomandos que o agente usa e pela API que a
// pagina usa, com as preferencias numa pasta temporaria:
//   1. iniciar sobe o servidor e imprime a URL; pedido sem o token e recusado; o topo da pagina
//      traz a logo do repositorio e GRILL;
//   2. rodada e final recusam o JSON malformado com codigo 1 e aceitam o valido; o desenho (previa)
//      da opcao e texto, vai ao estado e a pagina o mostra num bloco monoespacado;
//   3. aguardar devolve as respostas da pagina (tabela e JSON), o ajuste e o sim;
//   4. respostas com questao sem marca sao recusadas;
//   5. preferencias gravam na pasta e voltam na leitura;
//   6. o sim e o cli encerram o servidor, e o cli chega ao aguardar; depois do sim o cli e recusado;
//      o --retomar recusa a sessao que voltou ao CLI;
//   7. sem a pagina consultar, o servidor encerra sozinho e o aguardar recebe o JSON encerrado;
//   8. um segundo aguardar substitui o primeiro, que sai com o JSON substituido;
//   9. resposta que nao e JSON (outro processo na porta) cai na mensagem de seguir no CLI;
//  10. aguardar --ate sai com o JSON pendente no prazo, e a resposta dada depois chega na volta seguinte;
//      --ate fora de 1 a 7200 e recusado;
//  11. o rascunho das marcas volta no estado, so vale para a rodada atual, e o envio e a rodada nova o limpam;
//  12. a mensagem livre ({tipo: texto}) chega ao aguardar sem fechar a rodada, na ordem em que saiu;
//  13. delegado, esclarecer e adiado valem como resposta sem escolha, e a tabela mostra a marca;
//  14. a final valida motivo, alternativas, origem e duravel, e o sim devolve em adrs as linhas marcadas;
//  15. a sessao vai a disco linha a linha; o --retomar depois da queda devolve a mesma URL, o
//      historico e a resposta que o agente nao recebeu; com a porta ocupada cai noutra; refaz a
//      rodada aberta e a final; com o servidor vivo devolve a URL dele; na sessao do sim devolve o
//      sim gravado, com as ADRs; recusa o projeto sem sessao; o sessoes lista.
//
//   node skills/grill-tela/scripts/teste-grill-tela.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');
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
function aguardar(url, ...extra) {
  const filho = spawn(process.execPath, [SCRIPT, 'aguardar', url, ...extra], { env });
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
    try { await pedir(url.replace(/\?t=.*/, '')); } catch (e) { return true; } // sem token: nao conta como visita
  }
  return false;
}
function iniciar(extraEnv = {}, ...extra) {
  const r = spawnSync(process.execPath, [SCRIPT, 'iniciar', '--sem-navegador', '--projeto', 'teste', ...extra],
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
      opcoes: [{ rotulo: 'Servidor local', descricao: 'Node', recomendada: true }, { rotulo: 'Artifact', descricao: 'claude.ai', previa: '+---+\n| A |\n+---+' }] },
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
  assert.match(pagina.txt, /class="marca">\s*<svg[^>]*aria-label="macrex skills"[\s\S]*?<\/svg>\s*GRILL\s*</, 'logo e GRILL no topo');
  assert.doesNotMatch(pagina.txt, /<span class="marca">grill</, 'sem o grill antigo no topo');
  for (const t of ['Decida você', 'Não entendi', 'Adiar', 'Escrever à parte']) assert.ok(pagina.txt.includes(t), `a pagina tem ${t}`);
  let estado = (await pedir(api(url, 'estado'))).json;
  assert.strictEqual(estado.fase, 'inicio');
  assert.strictEqual(estado.projeto, 'teste');

  // 2. rodada malformada e valida
  const ruim = { rodada: 0, questoes: [{ id: 'Q1', cabecalho: '', titulo: 'x',
    opcoes: [{ rotulo: 'a', recomendada: true }, { rotulo: 'b', recomendada: true, previa: 3 }] }] };
  let r = roda('rodada', url, arquivo('ruim.json', ruim));
  assert.strictEqual(r.status, 1, 'rodada malformada sai com 1');
  assert.match(r.stderr, /rodada/);
  assert.match(r.stderr, /cabecalho/);
  assert.match(r.stderr, /recomendada/);
  assert.match(r.stderr, /questoes\[0\]\.opcoes\[1\]\.previa: texto/);
  assert.strictEqual(roda('rodada', url, arquivo('quebrado.json', '{nao e json')).status, 1, 'JSON invalido sai com 1');
  r = roda('rodada', url, arquivo('rodada.json', RODADA));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /Rodada 1 na tela, 2 questões/);
  estado = (await pedir(api(url, 'estado'))).json;
  assert.strictEqual(estado.fase, 'rodada');
  assert.strictEqual(estado.rodada.questoes.length, 2);
  assert.strictEqual(estado.rodada.questoes[0].opcoes[1].previa, '+---+\n| A |\n+---+');
  // o desenho da pagina, rodado fora do navegador: escapado, sem o markdown curto, com espacos e
  // quebras; no Panorama, o de cada opcao que tem, lado a lado; no Uma por vez, dentro da opcao
  const desenho = vm.runInNewContext([/const esc = .*\r?\n/, /function md\(s\)\{[\s\S]*?\r?\n\}\r?\n/, /const previa = .*\r?\n/, /const previas = [\s\S]*?: '';\r?\n/]
    .map((re) => re.exec(pagina.txt)[0]).join('') + '({ previas })');
  const comPrevias = desenho.previas({ opcoes: [{ rotulo: 'A', previa: '<b>**x**</b>\n  y' }, { rotulo: 'B' }, { rotulo: 'C', previa: 'c' }] });
  assert.ok(comPrevias.includes('<pre class="previa">&lt;b&gt;**x**&lt;/b&gt;\n  y</pre>'), 'a previa vai escapada e sem markdown');
  assert.strictEqual(comPrevias.match(/<pre class="previa">/g).length, 2, 'no Panorama, a previa de cada opcao que tem');
  assert.strictEqual(desenho.previas({ opcoes: [{ rotulo: 'B' }] }), '', 'sem previa, nada');
  assert.match(pagina.txt, /function modoPanorama\(\)[\s\S]*?\$\{previas\(q\)\}/, 'o Panorama desenha as previas');
  assert.match(pagina.txt, /function modoFoco\(\)[\s\S]*?\$\{previa\(o\)\}/, 'o Uma por vez desenha a previa na opcao');

  // 11. rascunho: so da rodada atual, volta no estado sem mexer na versao
  assert.strictEqual(estado.rascunho, null, 'rodada nova sem rascunho');
  const RASCUNHO = { rodada: 1, resp: { Q1: { opcao: 1, propria: '', com: 'nota' }, Q2: { opcao: null, propria: 'meu', com: '' } } };
  assert.strictEqual((await pedir(api(url, 'rascunho'), 'PUT', { ...RASCUNHO, rodada: 2 })).status, 409, 'rascunho de outra rodada: 409');
  assert.strictEqual((await pedir(api(url, 'rascunho'), 'PUT', { rodada: 1, resp: 'x' })).status, 400, 'rascunho sem resp: 400');
  const salvo = await pedir(api(url, 'rascunho'), 'PUT', RASCUNHO);
  assert.strictEqual(salvo.status, 200, salvo.txt);
  const comRascunho = (await pedir(api(url, 'estado'))).json;
  assert.deepStrictEqual(comRascunho.rascunho, RASCUNHO);
  assert.strictEqual(comRascunho.versao, estado.versao, 'o rascunho nao redesenha a pagina');

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
  assert.strictEqual(estado.rascunho, null, 'o envio limpa o rascunho');
  assert.strictEqual((await pedir(api(url, 'rascunho'), 'PUT', RASCUNHO)).status, 409, 'rascunho fora da rodada: 409');

  // 5. preferencias
  p = await pedir(api(url, 'preferencias'), 'POST', { modo: 'B', tema: 'dark', intruso: 1 });
  assert.strictEqual(p.status, 200);
  assert.deepStrictEqual((await pedir(api(url, 'preferencias'))).json, { modo: 'B', tema: 'dark' });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(base, 'preferencias.json'), 'utf8')), { modo: 'B', tema: 'dark' });
  // o aviso de rodada nova com a aba em segundo plano grava junto, sem apagar as outras
  p = await pedir(api(url, 'preferencias'), 'POST', { aviso: 'sistema' });
  assert.deepStrictEqual(p.json, { modo: 'B', tema: 'dark', aviso: 'sistema' });
  assert.deepStrictEqual((await pedir(api(url, 'preferencias'))).json, { modo: 'B', tema: 'dark', aviso: 'sistema' });

  // final: malformada, ajuste e sim
  assert.strictEqual(roda('final', url, arquivo('final-ruim.json', { tabela: [] })).status, 1, 'final vazia sai com 1');
  assert.strictEqual(roda('final', url, arquivo('final.json', { tabela: [{ decisao: 'Nome', escolha: 'grill-tela' }] })).status, 0);
  let espera2 = aguardar(url);
  assert.strictEqual((await pedir(api(url, 'respostas'), 'POST', { tipo: 'ajuste', texto: '' })).status, 400, 'ajuste vazio: 400');
  assert.strictEqual((await pedir(api(url, 'respostas'), 'POST', { tipo: 'ajuste', texto: 'trocar nome' })).status, 200);
  assert.deepStrictEqual(ultimaLinha((await espera2).saida), { tipo: 'ajuste', texto: 'trocar nome' });
  // 14. proveniencia: campos opcionais validados, e o sim devolve as linhas marcadas como ADR
  r = roda('final', url, arquivo('final-prov-ruim.json', { tabela: [
    { decisao: 'Nome', escolha: 'grill-tela', motivo: 1, alternativas: 'grill-html', origem: 'eu', duravel: 'sim' }] }));
  assert.strictEqual(r.status, 1, 'proveniencia malformada sai com 1');
  for (const campo of ['motivo', 'alternativas', 'origem', 'duravel']) assert.match(r.stderr, new RegExp(`tabela\\[0\\]\\.${campo}`));
  assert.strictEqual(roda('final', url, arquivo('final-alt-ruim.json', { tabela: [
    { decisao: 'Nome', escolha: 'grill-tela', alternativas: ['ok', ''] }] })).status, 1, 'alternativa vazia sai com 1');
  const TABELA = [
    { decisao: 'Transporte', escolha: 'Servidor local', motivo: 'Só stdlib', alternativas: ['Artifact'], origem: 'aceitou', duravel: true },
    { decisao: 'Nome', escolha: 'grill-web', alternativas: ['grill-tela', 'grill-html'], origem: 'ditou', duravel: false },
    { decisao: 'Porta', escolha: 'A do sistema', origem: 'agente' }];
  assert.strictEqual(roda('final', url, arquivo('final.json', { tabela: TABELA })).status, 0);
  assert.deepStrictEqual((await pedir(api(url, 'estado'))).json.final.tabela, TABELA, 'a final guarda a proveniencia');
  assert.match(pagina.txt, /Registrar como ADR/, 'a tela final tem a caixa de ADR');
  espera2 = aguardar(url);
  assert.strictEqual((await pedir(api(url, 'respostas'), 'POST', { tipo: 'sim', adrs: [2, 0, 0, 9, 'x', -1] })).status, 200);
  assert.deepStrictEqual(ultimaLinha((await espera2).saida), { tipo: 'sim', adrs: [TABELA[0], TABELA[2]] },
    'adrs: as linhas marcadas, na ordem da tabela, sem repetidas nem indices invalidos');
  assert.strictEqual(roda('cli', url).status, 1, 'cli depois do sim: recusado');
  assert.strictEqual((await pedir(api(url, 'estado'))).json.fase, 'concluido');
  assert.ok(await encerrou(url), 'o sim encerra o servidor');

  // 6. cli
  const url2 = iniciar();
  assert.strictEqual(roda('rodada', url2, arquivo('rodada.json', RODADA)).status, 0);
  assert.strictEqual((await pedir(api(url2, 'rascunho'), 'PUT', RASCUNHO)).status, 200);
  assert.strictEqual(roda('rodada', url2, arquivo('rodada.json', RODADA)).status, 0);
  assert.strictEqual((await pedir(api(url2, 'estado'))).json.rascunho, null, 'rodada publicada limpa o rascunho');

  // 10. aguardar com prazo, o laco dos harnesses que esperam em primeiro plano
  for (const ruimAte of ['0', 'x', '7201']) {
    r = roda('aguardar', url2, '--ate', ruimAte);
    assert.strictEqual(r.status, 1, `--ate ${ruimAte} sai com 1`);
    assert.match(r.stderr, /--ate/);
  }
  const inicioPrazo = Date.now();
  const comPrazo = await aguardar(url2, '--ate', '1');
  assert.strictEqual(comPrazo.status, 0, comPrazo.erro);
  assert.deepStrictEqual(ultimaLinha(comPrazo.saida), { tipo: 'pendente' });
  assert.ok(Date.now() - inicioPrazo < 5000, 'o prazo vale');
  p = await pedir(api(url2, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [
    { id: 'Q1', opcao: 1 }, { id: 'Q2', opcao: 0 }] });
  assert.strictEqual(p.status, 200, p.txt);
  const volta = await aguardar(url2, '--ate', '5');
  assert.deepStrictEqual(ultimaLinha(volta.saida).respostas.map((x) => x.marca), ['outra', 'aceito'],
    'a resposta dada entre duas voltas nao se perde');
  assert.strictEqual(roda('rodada', url2, arquivo('rodada2.json', { ...RODADA, rodada: 2 })).status, 0);

  // 12. mensagem livre: chega ao aguardar sem fechar a rodada, e na ordem, antes das respostas
  assert.strictEqual((await pedir(api(url2, 'respostas'), 'POST', { tipo: 'texto', texto: ' ' })).status, 400, 'texto vazio: 400');
  assert.strictEqual((await pedir(api(url2, 'respostas'), 'POST', { tipo: 'texto', texto: ' e o prazo? ' })).status, 200);
  assert.strictEqual((await pedir(api(url2, 'estado'))).json.fase, 'rodada', 'o texto nao fecha a rodada');
  // 13. nao-resposta: delegado, esclarecer e adiado valem sem escolha; marca desconhecida, nao
  p = await pedir(api(url2, 'respostas'), 'POST', { tipo: 'rodada', rodada: 2, respostas: [
    { id: 'Q1', opcao: null, marca: 'inventada' }, { id: 'Q2', opcao: 0 }] });
  assert.strictEqual(p.status, 400, 'marca desconhecida: 400');
  p = await pedir(api(url2, 'respostas'), 'POST', { tipo: 'rodada', rodada: 2, respostas: [
    { id: 'Q1', opcao: null, propria: '', marca: 'delegado' }, { id: 'Q2', opcao: null, marca: 'esclarecer', comentario: 'o que e?' }] });
  assert.strictEqual(p.status, 200, p.txt);
  assert.deepStrictEqual(ultimaLinha((await aguardar(url2)).saida), { tipo: 'texto', texto: 'e o prazo?' });
  const naoResp = await aguardar(url2);
  assert.match(naoResp.saida, /\| Q1 \| → delegado \|  \| {2}\|/, 'a tabela mostra a marca sem escolha');
  assert.match(naoResp.saida, /\| Q2 \| \? esclarecer \|  \| o que e\? \|/);
  assert.deepStrictEqual(ultimaLinha(naoResp.saida).respostas, [
    { id: 'Q1', marca: 'delegado', escolha: null, comentario: null },
    { id: 'Q2', marca: 'esclarecer', escolha: null, comentario: 'o que e?' }]);
  assert.strictEqual(roda('rodada', url2, arquivo('rodada3.json', { ...RODADA, rodada: 3 })).status, 0);
  p = await pedir(api(url2, 'respostas'), 'POST', { tipo: 'rodada', rodada: 3, respostas: [
    { id: 'Q1', opcao: null, marca: 'adiado' }, { id: 'Q2', opcao: 1 }] });
  assert.strictEqual(p.status, 200, p.txt);
  assert.match((await aguardar(url2)).saida, /\| Q1 \| … adiado \|/);
  assert.strictEqual((await pedir(api(url2, 'respostas'), 'POST', { tipo: 'texto', texto: 'fora de hora' })).status, 409, 'texto fora da rodada: 409');
  const espera3 = aguardar(url2);
  await espere(300);
  r = roda('cli', url2);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(ultimaLinha((await espera3).saida), { tipo: 'cli' });
  assert.strictEqual((await pedir(api(url2, 'estado'))).json.fase, 'cli');
  assert.ok(await encerrou(url2), 'o cli encerra o servidor');
  r = spawnSync(process.execPath, [SCRIPT, 'iniciar', '--sem-navegador', '--projeto', 'teste', '--retomar'], { encoding: 'utf8', env });
  assert.strictEqual(r.status, 1, 'sessao que voltou ao CLI: o --retomar nao a traz de volta a tela');
  assert.match(r.stderr, /voltou ao CLI/);

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

  // 15. sessao em disco e retomada; o ocioso curto faz as vezes da queda
  const OCIOSO = { GRILL_TELA_OCIOSO_MS: '2000' };
  const iniciarSessao = (extraEnv, ...extra) => spawnSync(process.execPath,
    [SCRIPT, 'iniciar', '--sem-navegador', '--projeto', 'sessao', ...extra], { encoding: 'utf8', env: { ...env, ...extraEnv } });
  const urlDe = (s) => {
    assert.strictEqual(s.status, 0, s.stderr);
    return s.stdout.trim().split('\n').pop();
  };
  let s = iniciarSessao({}, '--retomar');
  assert.strictEqual(s.status, 1, 'projeto sem sessao: recusado');
  assert.match(s.stderr, /nenhuma sessão/);
  const url4 = urlDe(iniciarSessao(OCIOSO));
  assert.strictEqual(roda('rodada', url4, arquivo('rodada.json', RODADA)).status, 0);
  p = await pedir(api(url4, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [{ id: 'Q1', opcao: 0 }, { id: 'Q2', opcao: 1 }] });
  assert.strictEqual(p.status, 200, p.txt);
  assert.ok(await encerrou(url4), 'o servidor cai com a resposta nao entregue');
  const pastaSessao = path.join(base, 'sessoes', 'sessao');
  const [arqSessao] = fs.readdirSync(pastaSessao);
  assert.match(arqSessao, /^\d{8}-\d{6}\.jsonl$/);
  const eventos = () => fs.readFileSync(path.join(pastaSessao, arqSessao), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepStrictEqual(eventos().map((e) => e.tipo), ['inicio', 'rodada', 'respostas']);
  assert.strictEqual(eventos()[0].porta, Number(new URL(url4).port), 'a porta na primeira linha');

  s = iniciarSessao(OCIOSO, '--retomar');
  const url5 = urlDe(s);
  assert.strictEqual(url5, url4, 'a mesma porta e o mesmo token');
  assert.match(s.stdout, /retomada na fase aguarde, 1 rodada/);
  estado = (await pedir(api(url5, 'estado'))).json;
  assert.strictEqual(estado.fase, 'aguarde');
  assert.strictEqual(estado.historico.length, 1);
  s = iniciarSessao({}, '--retomar');
  assert.strictEqual(urlDe(s), url4, 'servidor vivo: a URL dele');
  assert.match(s.stdout, /segue vivo/);
  const devolvida = await aguardar(url5, '--ate', '5');
  assert.deepStrictEqual(ultimaLinha(devolvida.saida).respostas.map((x) => x.escolha), ['Servidor local', 'grill-html'],
    'a resposta que o agente nao recebeu volta no aguardar');
  assert.strictEqual(roda('rodada', url5, arquivo('rodada2.json', { ...RODADA, rodada: 2 })).status, 0);
  assert.ok(await encerrou(url5), 'cai com a rodada 2 aberta');

  const ocupa = http.createServer((req, res) => res.end('ocupado'));
  await new Promise((ok) => ocupa.listen(Number(new URL(url4).port), '127.0.0.1', ok));
  const url6 = urlDe(iniciarSessao(OCIOSO, '--retomar'));
  ocupa.close();
  assert.notStrictEqual(new URL(url6).port, new URL(url4).port, 'porta ocupada: outra');
  assert.strictEqual(new URL(url6).searchParams.get('t'), new URL(url4).searchParams.get('t'));
  estado = (await pedir(api(url6, 'estado'))).json;
  assert.strictEqual(estado.fase, 'rodada', 'a rodada aberta volta');
  assert.strictEqual(estado.rodada.rodada, 2);
  assert.strictEqual(estado.historico.length, 1);
  const pendente = await aguardar(url6, '--ate', '1');
  assert.deepStrictEqual(ultimaLinha(pendente.saida), { tipo: 'pendente' }, 'resposta ja respondida nao volta');
  assert.strictEqual(roda('final', url6, arquivo('final.json', { tabela: [{ decisao: 'Nome', escolha: 'grill-tela' }] })).status, 0);
  assert.ok(await encerrou(url6), 'cai com a final na tela');

  const url7 = urlDe(iniciarSessao({}, '--retomar'));
  estado = (await pedir(api(url7, 'estado'))).json;
  assert.strictEqual(estado.fase, 'final', 'a final volta');
  assert.strictEqual(estado.final.tabela[0].escolha, 'grill-tela');
  const fimSim = aguardar(url7);
  await espere(300);
  assert.strictEqual((await pedir(api(url7, 'respostas'), 'POST', { tipo: 'sim', adrs: [0] })).status, 200);
  const sim = { tipo: 'sim', adrs: [{ decisao: 'Nome', escolha: 'grill-tela' }] };
  assert.deepStrictEqual(ultimaLinha((await fimSim).saida), sim);
  assert.ok(await encerrou(url7), 'o sim encerra o retomado');
  assert.deepStrictEqual(eventos().map((e) => e.tipo),
    ['inicio', 'rodada', 'respostas', 'inicio', 'rodada', 'inicio', 'final', 'inicio', 'sim']);
  s = iniciarSessao({}, '--retomar');
  assert.strictEqual(s.status, 0, s.stderr);
  assert.match(s.stdout, /já terminou com o sim/);
  assert.deepStrictEqual(ultimaLinha(s.stdout), sim, 'sessao do sim: o --retomar devolve o sim, com as ADRs, sem subir servidor');

  r = roda('sessoes', '--projeto', 'sessao');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^sessao {2}\d{8}-\d{6} {2}1 rodada\(s\) respondida\(s\), fase concluido, último evento sim {2}\S/);
  r = roda('sessoes');
  assert.match(r.stdout, /^teste {2}/m, 'sessoes sem projeto lista todos');
  assert.match(r.stdout, /^sessao {2}/m);

  console.log('grill-tela ok: iniciar, token, validacao, aguardar, preferencias, final, cli, ocioso, aguardar substituido, resposta que nao e JSON, aguardar com prazo, rascunho, mensagem livre, nao-resposta, proveniencia com ADR e sessao retomada');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
