#!/usr/bin/env node
'use strict';
// Checagem do programa da grill-tela pelos subcomandos que o agente usa e pela API que a
// pagina usa, com a pasta da grill-tela num diretorio temporario e a porta fixa numa livre:
//   1. iniciar sobe o servidor da maquina e imprime a URL do grill (/g/<projeto>/<id>), com o
//      token da maquina; pedido sem o token e recusado; o topo da pagina traz a logo e GRILL;
//      um segundo iniciar reaproveita o servidor vivo e cria outro grill, com rodada e resposta
//      proprias; dois iniciar na corrida, sem servidor, deixam um so na porta fixa;
//   2. rodada e final recusam o JSON malformado com codigo 1 e aceitam o valido; o desenho (previa)
//      da opcao e texto, vai ao estado e a pagina o mostra num bloco monoespacado;
//   3. aguardar devolve as respostas da pagina (tabela e JSON), o ajuste e o sim;
//   4. respostas com questao sem marca sao recusadas;
//   5. preferencias gravam na pasta e voltam na leitura;
//   6. depois do sim e do cli o servidor segue no ar e a URL do grill abre o estado dele; o cli
//      chega ao aguardar; depois do sim o cli e recusado; o --retomar devolve a sessao do CLI a
//      tela, na mesma URL, sem o cli que ficou na fila, e a rodada nova e aceita; a
//      pagina do concluido e a leitura (a final com as ADRs do sim e as rodadas abertas), e a do
//      CLI mostra as rodadas;
//   8. um segundo aguardar substitui o primeiro, que sai com o JSON substituido;
//   9. resposta que nao e JSON (outro processo na porta) cai na mensagem de seguir no CLI;
//  10. aguardar --ate sai com o JSON pendente no prazo, e a resposta dada depois chega na volta seguinte;
//      --ate fora de 1 a 7200 e recusado;
//  11. o rascunho das marcas volta no estado, so vale para a rodada atual, e o envio e a rodada nova o limpam;
//  12. a mensagem livre ({tipo: texto}) chega ao aguardar sem fechar a rodada, na ordem em que saiu;
//  13. delegado, esclarecer e adiado valem como resposta sem escolha, e a tabela mostra a marca;
//  14. a final valida motivo, alternativas, origem e duravel, e o sim devolve em adrs as linhas marcadas;
//  15. a sessao vai a disco linha a linha; com o servidor derrubado, o --retomar sobe outro e
//      devolve a mesma URL, o historico e a resposta que o agente nao recebeu; com a porta fixa
//      ocupada cai noutra, com o mesmo token; refaz a rodada aberta e a final; com o servidor
//      vivo devolve a URL; o --id escolhe a sessao; na sessao do sim devolve o sim gravado, com
//      as ADRs; recusa o projeto sem sessao; o sessoes lista;
//  16. o historico de grills traz o pedido do --pedido (ou o da primeira questao), os estados
//      rodada, lendo, final, concluido, cli e abandonado (o aguardar pendurado segura o ativo), do
//      mais novo ao mais velho; o subcomando historico imprime a raiz, que desenha o historico, e
//      o desenho separa os ativos e filtra pelo projeto e pela busca;
//  17. o iniciar troca o servidor vivo de outra versao quando nenhum grill esta ativo; com grill
//      ativo, segue com o velho e avisa;
//  18. o registrar grava o grill do terminal no disco, sem servidor: cria a sessao de canal cli,
//      anexa as rodadas numeradas depois da ultima respondida e o sim com o documento, recusa o
//      corpo fora do contrato, a URL ilegivel e a sessao fora do CLI com o servidor no ar (com ele
//      caido, leva a sessao ao terminal); o servidor rele o grill do CLI que cresceu, o historico o
//      lista como No terminal, a leitura mostra a pergunta e o --retomar sem --id o pula.
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
const env = { ...process.env, GRILL_TELA_DIR: base };
const servidorDe = (pasta) => {
  try { return JSON.parse(fs.readFileSync(path.join(pasta, 'servidor.json'), 'utf8')); } catch (e) { return null; }
};
const servidorDoTeste = () => servidorDe(base);
// o servidor nao para sozinho: o de cada pasta do teste sai junto com ele
const bases = [base];
process.on('exit', () => {
  for (const b of bases) {
    const s = servidorDe(b);
    try { if (s) process.kill(s.pid); } catch (e) { /* ja tinha caido */ }
    try { fs.rmSync(b, { recursive: true, force: true }); } catch (e) { /* o Windows ainda segura o arquivo */ }
  }
});

const roda = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
const arquivo = (nome, obj) => {
  const p = path.join(base, nome);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
};
function filho(...args) {
  const p = spawn(process.execPath, [SCRIPT, ...args], { env });
  let saida = '';
  let erro = '';
  p.stdout.on('data', (d) => (saida += d));
  p.stderr.on('data', (d) => (erro += d));
  return new Promise((ok) => p.on('close', (status) => ok({ status, saida, erro })));
}
const aguardar = (url, ...extra) => filho('aguardar', url, ...extra);
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
// a API de um grill fica debaixo do caminho dele
const api = (url, rota) => url.replace(/\/?\?t=/, `/api/${rota}?t=`);
const URL_DO_GRILL = (projeto) => new RegExp(`^http://127\\.0\\.0\\.1:(\\d+)/g/${projeto}/(\\d{8}-\\d{6})\\?t=([0-9a-f]{32})$`);
const idDe = (url) => /\/(\d{8}-\d{6})\?/.exec(url)[1];
function iniciar(...extra) {
  const r = roda('iniciar', '--sem-navegador', '--projeto', 'teste', ...extra);
  assert.strictEqual(r.status, 0, r.stderr);
  const url = r.stdout.trim().split('\n').pop();
  assert.match(url, URL_DO_GRILL('teste'));
  return url;
}
// derruba o servidor da maquina, como uma queda, e espera a porta soltar; os sockets keep-alive
// dele saem do agente, senao o proximo pedir pega um morto
async function derrubar() {
  const s = servidorDoTeste();
  process.kill(s.pid);
  http.globalAgent.destroy();
  for (let i = 0; i < 50; i++, await espere(100)) {
    if (await portaLivre(s.porta)) return;
  }
  throw new Error('o servidor nao caiu');
}
// a porta, se der para ocupa-la (a 0 pede uma ao sistema), ou null
const portaLivre = (porta = 0) => new Promise((ok) => {
  const s = http.createServer().once('error', () => ok(null)).listen(porta, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});

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
  const PORTA = await portaLivre();
  env.GRILL_TELA_PORTA = String(PORTA);

  // 1. iniciar, porta fixa e token da maquina
  const url = iniciar();
  const [, porta, , token] = URL_DO_GRILL('teste').exec(url);
  assert.strictEqual(Number(porta), PORTA, 'a porta fixa');
  assert.strictEqual(fs.readFileSync(path.join(base, 'token'), 'utf8').trim(), token, 'o token da maquina, em disco');
  assert.strictEqual(servidorDoTeste().porta, PORTA, 'o servidor.json com a porta');
  assert.strictEqual((await pedir(url.replace(/\?t=.*/, ''))).status, 403, 'sem token: 403');
  assert.strictEqual((await pedir(url.replace(/t=.*/, 't=errado'))).status, 403, 'token errado: 403');
  assert.strictEqual((await pedir(api(url, 'estado').replace(/t=.*/, 't=errado'))).status, 403, 'API com token errado: 403');
  const pagina = await pedir(url);
  assert.strictEqual(pagina.status, 200);
  assert.match(pagina.txt, /<html/);
  assert.match(pagina.txt, /class="marca">\s*<svg[^>]*aria-label="macrex skills"[\s\S]*?<\/svg>\s*GRILL\s*</, 'logo e GRILL no topo');
  assert.doesNotMatch(pagina.txt, /<span class="marca">grill</, 'sem o grill antigo no topo');
  for (const t of ['Decida você', 'Não entendi', 'Adiar', 'Escrever à parte']) assert.ok(pagina.txt.includes(t), `a pagina tem ${t}`);
  let estado = (await pedir(api(url, 'estado'))).json;
  assert.strictEqual(estado.fase, 'inicio');
  assert.strictEqual(estado.projeto, 'teste');
  assert.strictEqual((await pedir(url.replace(/\d{8}-\d{6}/, '19990101-000000'))).status, 404, 'grill inexistente: 404');

  // 1. o segundo iniciar reaproveita o servidor e cria outro grill, independente do primeiro
  const pid = servidorDoTeste().pid;
  const outro = iniciar();
  assert.notStrictEqual(outro, url, 'outro grill, outra URL');
  assert.strictEqual(new URL(outro).origin, new URL(url).origin, 'o mesmo servidor');
  assert.strictEqual(servidorDoTeste().pid, pid, 'nenhum servidor novo');
  assert.strictEqual(roda('rodada', outro, arquivo('outra.json', RODADA)).status, 0);
  assert.strictEqual((await pedir(api(url, 'estado'))).json.fase, 'inicio', 'a rodada do outro nao chega a este');
  const doPrimeiro = aguardar(url, '--ate', '2');
  const doOutro = aguardar(outro);
  await espere(300);
  assert.strictEqual((await pedir(api(outro, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [{ id: 'Q1', opcao: 0 }, { id: 'Q2', opcao: 0 }] })).status, 200);
  assert.strictEqual(ultimaLinha((await doOutro).saida).tipo, 'rodada', 'a resposta chega ao aguardar do proprio grill');
  assert.deepStrictEqual(ultimaLinha((await doPrimeiro).saida), { tipo: 'pendente' }, 'e nao ao do outro');

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
  // a pagina chega a API pelo caminho do grill; as preferencias, pela raiz
  const rotas = vm.runInNewContext([/const GRILL = .*\r?\n/, /const rotaDa = .*\r?\n/].map((re) => re.exec(pagina.txt)[0]).join('') + '({ rotaDa })',
    { location: { pathname: '/g/teste/20260101-000000' } });
  assert.strictEqual(rotas.rotaDa('estado'), '/g/teste/20260101-000000/api/estado');
  assert.strictEqual(rotas.rotaDa('preferencias'), '/api/preferencias');

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
  const fim = await espera;
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

  // 5. preferencias, da maquina, na raiz da API
  const prefs = `http://127.0.0.1:${PORTA}/api/preferencias?t=${token}`;
  p = await pedir(prefs, 'POST', { modo: 'B', tema: 'dark', intruso: 1 });
  assert.strictEqual(p.status, 200);
  assert.deepStrictEqual((await pedir(prefs)).json, { modo: 'B', tema: 'dark' });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(base, 'preferencias.json'), 'utf8')), { modo: 'B', tema: 'dark' });
  // o aviso de rodada nova com a aba em segundo plano grava junto, sem apagar as outras
  p = await pedir(prefs, 'POST', { aviso: 'sistema' });
  assert.deepStrictEqual(p.json, { modo: 'B', tema: 'dark', aviso: 'sistema' });
  assert.deepStrictEqual((await pedir(prefs)).json, { modo: 'B', tema: 'dark', aviso: 'sistema' });

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
  assert.strictEqual((await pedir(api(url, 'tela'), 'POST', {})).status, 409, 'a volta a tela depois do sim: recusada');
  // 6. o sim nao derruba o servidor: a URL do grill concluido segue abrindo o estado dele
  await espere(3500);
  estado = (await pedir(api(url, 'estado'))).json;
  assert.strictEqual(estado.fase, 'concluido');
  assert.deepStrictEqual(estado.final.tabela, TABELA, 'o concluido guarda a final');
  assert.strictEqual((await pedir(url)).status, 200, 'a pagina do grill concluido abre');
  assert.strictEqual(roda('rodada', url, arquivo('rodada.json', RODADA)).status, 1, 'rodada depois do sim: recusada');
  // 6. a leitura do concluido: a final com as ADRs que voltaram no sim, e as rodadas abaixo
  assert.deepStrictEqual(estado.ultima, { tipo: 'sim', adrs: [TABELA[0], TABELA[2]] }, 'o estado guarda as ADRs do sim');
  const leitura = vm.runInNewContext(/const marcadasNoSim = .*\r?\n/.exec(pagina.txt)[0] + '({ marcadasNoSim })');
  assert.deepStrictEqual(leitura.marcadasNoSim(TABELA, estado.ultima), [true, false, true], 'as linhas marcadas no sim');
  assert.deepStrictEqual(leitura.marcadasNoSim(TABELA, null), [false, false, false]);
  assert.match(pagina.txt, /concluido:\(\)=>S\.sucesso \? telaSucesso\(\) : telaLeitura\(\)/, 'logo apos o sim, a tela de sucesso; fora dela, a leitura');
  assert.match(pagina.txt, /const S = \{.*sucesso:false \};/, 'a URL reaberta comeca fora da tela de sucesso: mostra a leitura');
  // a tela de sucesso: as contagens da final e do sim, e as saidas para o historico e para a leitura
  const ctxSucesso = { E: estado, TOKEN: 'tk' };
  const telaSucesso = vm.runInNewContext([/const marcadasNoSim = .*\r?\n/, /function telaSucesso\(\)\{[\s\S]*?\n\}/]
    .map((re) => re.exec(pagina.txt)[0]).join('') + ' telaSucesso', ctxSucesso);
  const sucesso = telaSucesso();
  for (const trecho of ['<div class="glifo">✓</div>', 'Grill finalizado', '3 decisões confirmadas, 2 como ADR.',
    'O sim voltou ao terminal: o agente grava o entendimento e entrega o prompt da leva.',
    'Pode fechar esta aba; o grill fica no Histórico de grills e nesta URL.',
    '<a class="btn pri" href="/?t=tk">Ir para o histórico</a>', '<button class="btn sec" onclick="S.sucesso=false;render()">Ver o grill</button>'])
    assert.ok(sucesso.includes(trecho), `a tela de sucesso traz ${trecho}`);
  ctxSucesso.E = { final: { tabela: [TABELA[1]] }, ultima: { tipo: 'sim', adrs: [] } };
  assert.ok(telaSucesso().includes('1 decisão confirmada, nenhuma como ADR.'), 'singular e zero ADR');
  ctxSucesso.E = { final: { tabela: [TABELA[0], TABELA[1]] }, ultima: { tipo: 'sim', adrs: [TABELA[0]] } };
  assert.ok(telaSucesso().includes('2 decisões confirmadas, 1 como ADR.'), 'plural e uma ADR');
  // o confirmar liga a tela de sucesso so com o sim que o servidor aceita
  for (const ok of [false, true]) {
    const ctx = { S: {}, E: { final: { tabela: TABELA } }, adrMarcada: () => false, api: async () => ({ ok }), consultar: async () => {}, render: () => {} };
    await vm.runInNewContext(/async function confirmar\(\)\{[\s\S]*?\n\}/.exec(pagina.txt)[0] + ' confirmar', ctx)();
    assert.strictEqual(ctx.S.sucesso, ok, ok ? 'sim aceito: tela de sucesso' : 'sim recusado: sem tela de sucesso');
  }
  assert.match(pagina.txt, /function telaLeitura\(\)[\s\S]*?historico\(true\)/, 'a leitura traz as rodadas abertas');
  assert.match(pagina.txt, /cli:\(\)=>\(E\.canal==='cli' \? telaFim\([\s\S]*?\)\)\s*\+\s*historico\(true\)/, 'o grill do CLI, voltado ou feito no terminal, mostra as rodadas respondidas');
  assert.doesNotMatch(pagina.txt, /a página fecha sozinha/, 'a pagina nao fecha mais no sim');

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
  await espere(3500);
  assert.strictEqual((await pedir(api(url2, 'estado'))).json.fase, 'cli', 'o cli nao derruba o servidor');
  // a sessao que voltou ao CLI volta a tela pelo --retomar, na mesma URL, esperando a rodada seguinte
  const deVolta = () => roda('iniciar', '--sem-navegador', '--projeto', 'teste', '--retomar', '--id', idDe(url2));
  r = deVolta();
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim().split('\n').pop(), url2, 'a mesma URL');
  assert.match(r.stdout, /de volta à tela/);
  assert.strictEqual((await pedir(api(url2, 'estado'))).json.fase, 'aguarde', 'a pagina sai do "segue no terminal"');
  // o evento tela vai a disco: a leitura das sessoes (a mesma do historico) nao a ve mais no CLI
  assert.match(roda('sessoes', '--projeto', 'teste').stdout, new RegExp(`${idDe(url2)} .*fase aguarde, último evento tela`));
  // o cli que nenhum aguardar levou nao volta depois da volta a tela
  assert.strictEqual(roda('cli', url2).status, 0);
  assert.strictEqual(deVolta().status, 0);
  assert.deepStrictEqual(ultimaLinha((await aguardar(url2, '--ate', '1')).saida), { tipo: 'pendente' }, 'o cli velho saiu da fila');
  assert.strictEqual(roda('rodada', url2, arquivo('rodada4.json', { ...RODADA, rodada: 4 })).status, 0, 'a rodada nova e aceita');
  assert.strictEqual((await pedir(api(url2, 'tela'), 'POST', {})).status, 200, 'fora do CLI, a volta nao muda nada');
  assert.strictEqual((await pedir(api(url2, 'estado'))).json.fase, 'rodada');
  // de volta ao CLI, como o historico de grills abaixo espera
  assert.strictEqual(roda('cli', url2).status, 0);

  // 9. outro processo na porta, respondendo HTML
  const intruso = http.createServer((req, res) => res.end('<html>outro</html>'));
  await new Promise((ok) => intruso.listen(0, '127.0.0.1', ok));
  const falsa = await aguardar(`http://127.0.0.1:${intruso.address().port}/g/teste/20260101-000000?t=x`);
  intruso.close();
  assert.strictEqual(falsa.status, 1);
  assert.match(falsa.erro, /siga o grill no CLI/, falsa.erro);

  // 1. dois iniciar na corrida, sem servidor no ar: um servidor so, na porta fixa
  await derrubar();
  const corrida = await Promise.all([1, 2].map(() => filho('iniciar', '--sem-navegador', '--projeto', 'corrida')));
  for (const c of corrida) assert.strictEqual(c.status, 0, c.erro);
  const urlsDaCorrida = corrida.map((c) => c.saida.trim().split('\n').pop());
  assert.notStrictEqual(urlsDaCorrida[0], urlsDaCorrida[1], 'dois grills');
  for (const u of urlsDaCorrida) assert.strictEqual(Number(new URL(u).port), PORTA, 'os dois no servidor da porta fixa');
  assert.strictEqual((await pedir(api(urlsDaCorrida[1], 'estado'))).status, 200);

  // 15. sessao em disco e retomada; o servidor derrubado faz as vezes da queda
  const iniciarSessao = (...extra) => roda('iniciar', '--sem-navegador', '--projeto', 'sessao', ...extra);
  const urlDe = (s) => {
    assert.strictEqual(s.status, 0, s.stderr);
    return s.stdout.trim().split('\n').pop();
  };
  let s = iniciarSessao('--retomar');
  assert.strictEqual(s.status, 1, 'projeto sem sessao: recusado');
  assert.match(s.stderr, /nenhuma sessão/);
  const url4 = urlDe(iniciarSessao());
  assert.strictEqual(roda('rodada', url4, arquivo('rodada.json', RODADA)).status, 0);
  p = await pedir(api(url4, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [{ id: 'Q1', opcao: 0 }, { id: 'Q2', opcao: 1 }] });
  assert.strictEqual(p.status, 200, p.txt);
  await derrubar(); // com a resposta nao entregue
  const pastaSessao = path.join(base, 'sessoes', 'sessao');
  const [arqSessao] = fs.readdirSync(pastaSessao);
  assert.strictEqual(arqSessao, `${idDe(url4)}.jsonl`);
  const eventos = () => fs.readFileSync(path.join(pastaSessao, arqSessao), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepStrictEqual(eventos().map((e) => e.tipo), ['inicio', 'rodada', 'respostas']);
  assert.strictEqual(eventos()[0].projeto, 'sessao', 'o projeto na primeira linha');

  s = iniciarSessao('--retomar');
  const url5 = urlDe(s);
  assert.strictEqual(url5, url4, 'a mesma porta e o mesmo token');
  assert.match(s.stdout, /retomada na fase aguarde, 1 rodada/);
  estado = (await pedir(api(url5, 'estado'))).json;
  assert.strictEqual(estado.fase, 'aguarde');
  assert.strictEqual(estado.historico.length, 1);
  assert.strictEqual(urlDe(iniciarSessao('--retomar')), url4, 'servidor vivo: a mesma URL');
  const devolvida = await aguardar(url5, '--ate', '5');
  assert.deepStrictEqual(ultimaLinha(devolvida.saida).respostas.map((x) => x.escolha), ['Servidor local', 'grill-html'],
    'a resposta que o agente nao recebeu volta no aguardar');
  assert.strictEqual(roda('rodada', url5, arquivo('rodada2.json', { ...RODADA, rodada: 2 })).status, 0);
  await derrubar(); // com a rodada 2 aberta

  const ocupa = http.createServer((req, res) => res.end('ocupado'));
  await new Promise((ok) => ocupa.listen(PORTA, '127.0.0.1', ok));
  const url6 = urlDe(iniciarSessao('--retomar', '--id', idDe(url4)));
  assert.notStrictEqual(new URL(url6).port, String(PORTA), 'porta fixa ocupada: outra');
  assert.strictEqual(new URL(url6).searchParams.get('t'), token, 'o mesmo token');
  estado = (await pedir(api(url6, 'estado'))).json;
  assert.strictEqual(estado.fase, 'rodada', 'a rodada aberta volta');
  assert.strictEqual(estado.rodada.rodada, 2);
  assert.strictEqual(estado.historico.length, 1);
  const pendente = await aguardar(url6, '--ate', '1');
  assert.deepStrictEqual(ultimaLinha(pendente.saida), { tipo: 'pendente' }, 'resposta ja respondida nao volta');
  assert.strictEqual(roda('final', url6, arquivo('final.json', { tabela: [{ decisao: 'Nome', escolha: 'grill-tela' }] })).status, 0);
  await derrubar(); // com a final na tela
  await new Promise((ok) => ocupa.close(ok));

  const url7 = urlDe(iniciarSessao('--retomar'));
  assert.strictEqual(url7, url4, 'a porta fixa livre de novo: a URL de antes');
  estado = (await pedir(api(url7, 'estado'))).json;
  assert.strictEqual(estado.fase, 'final', 'a final volta');
  assert.strictEqual(estado.final.tabela[0].escolha, 'grill-tela');
  const fimSim = aguardar(url7);
  await espere(300);
  assert.strictEqual((await pedir(api(url7, 'respostas'), 'POST', { tipo: 'sim', adrs: [0] })).status, 200);
  const sim = { tipo: 'sim', adrs: [{ decisao: 'Nome', escolha: 'grill-tela' }] };
  assert.deepStrictEqual(ultimaLinha((await fimSim).saida), sim);
  assert.deepStrictEqual(eventos().map((e) => e.tipo), ['inicio', 'rodada', 'respostas', 'rodada', 'final', 'sim']);

  // o --id escolhe a sessao: sem ele, a ultima do projeto
  const url8 = urlDe(iniciarSessao());
  s = iniciarSessao('--retomar', '--id', idDe(url4));
  assert.strictEqual(s.status, 0, s.stderr);
  assert.match(s.stdout, /já terminou com o sim/);
  assert.deepStrictEqual(ultimaLinha(s.stdout), sim, 'sessao do sim: o --retomar devolve o sim, com as ADRs');
  assert.strictEqual(urlDe(iniciarSessao('--retomar')), url8, 'sem --id, a ultima sessao do projeto');
  s = iniciarSessao('--retomar', '--id', '19990101-000000');
  assert.strictEqual(s.status, 1, 'id sem sessao: recusado');

  // 16. historico de grills: o pedido, os seis estados, o abandonado e o aguardar pendurado
  const historico = async () => (await pedir(`http://127.0.0.1:${PORTA}/api/historico?t=${token}`)).json;
  const doHistorico = async (u) => (await historico()).find((g) => g.id === idDe(u) && u.includes(`/g/${g.projeto}/`));
  const urlH = urlDe(roda('iniciar', '--sem-navegador', '--projeto', 'hist', '--pedido', 'grill da busca'));
  let h = await doHistorico(urlH);
  assert.strictEqual(h.pedido, 'grill da busca', 'o pedido do iniciar');
  assert.strictEqual(h.estado, 'lendo', 'sem rodada: o agente prepara a primeira');
  assert.strictEqual(h.caminho, `/g/hist/${idDe(urlH)}`);
  assert.strictEqual(roda('rodada', urlH, arquivo('rodada.json', RODADA)).status, 0);
  h = await doHistorico(urlH);
  assert.deepStrictEqual([h.estado, h.rodada, h.respondidas], ['rodada', 1, 0], 'rodada aberta: aguardando voce');
  assert.strictEqual((await pedir(api(urlH, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [{ id: 'Q1', opcao: 0 }, { id: 'Q2', opcao: 0 }] })).status, 200);
  h = await doHistorico(urlH);
  assert.deepStrictEqual([h.estado, h.rodada, h.respondidas], ['lendo', 1, 1], 'respondida: o agente le');
  assert.strictEqual(roda('final', urlH, arquivo('final.json', { tabela: TABELA })).status, 0);
  assert.strictEqual((await doHistorico(urlH)).estado, 'final');
  assert.strictEqual((await pedir(api(urlH, 'respostas'), 'POST', { tipo: 'sim', adrs: [0, 2] })).status, 200);
  h = await doHistorico(urlH);
  assert.deepStrictEqual([h.estado, h.decisoes, h.adrs], ['concluido', 3, 2], 'o concluido com as decisoes e as ADRs');
  assert.ok(h.inicio <= h.ultimo, 'o primeiro e o ultimo evento');
  assert.strictEqual((await doHistorico(url2)).estado, 'cli');
  // a sessao antiga, sem pedido e parada ha mais de 2 h: abandonada, com o nome da primeira questao
  const pastaAntiga = path.join(base, 'sessoes', 'antigo');
  fs.mkdirSync(pastaAntiga, { recursive: true });
  const velhos = [{ em: '2020-01-01T10:00:00.000Z', tipo: 'inicio', projeto: 'antigo', porta: 1, token: 'x' }, { em: '2020-01-01T10:00:01.000Z', tipo: 'rodada', rodada: RODADA }];
  fs.writeFileSync(path.join(pastaAntiga, '20200101-100000.jsonl'), velhos.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const urlAntiga = `http://127.0.0.1:${PORTA}/g/antigo/20200101-100000?t=${token}`;
  h = await doHistorico(urlAntiga);
  assert.deepStrictEqual([h.estado, h.pedido, h.projeto], ['abandonado', 'Transporte: Como conversam?', 'antigo']);
  // com um aguardar pendurado, segue ativa
  const pendurado = aguardar(urlAntiga, '--ate', '2');
  await espere(500);
  assert.strictEqual((await doHistorico(urlAntiga)).estado, 'rodada', 'o aguardar pendurado mantem o grill ativo');
  await pendurado;
  assert.strictEqual((await doHistorico(urlAntiga)).estado, 'abandonado');
  const todos = await historico();
  assert.ok(todos.every((g, i) => i === 0 || todos[i - 1].inicio >= g.inicio), 'do mais novo ao mais velho');
  // o abrir de um grill com o servidor fora do ar sobe o servidor, e a URL volta a responder
  await derrubar();
  r = roda('abrir', urlH, '--sem-navegador');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim().split('\n').pop(), urlH);
  assert.strictEqual((await pedir(api(urlH, 'estado'))).json.fase, 'concluido', 'o abrir subiu o servidor');
  assert.strictEqual(roda('abrir', 'http://exemplo.com/', '--sem-navegador').status, 1, 'URL de fora da maquina: recusada');
  // o subcomando historico imprime a URL da raiz, que desenha o historico
  r = roda('historico', '--sem-navegador');
  assert.strictEqual(r.status, 0, r.stderr);
  const urlHist = r.stdout.trim().split('\n').pop();
  assert.strictEqual(urlHist, `http://127.0.0.1:${PORTA}/?t=${token}`);
  const raiz = await pedir(urlHist);
  assert.match(raiz.txt, /Histórico de grills/);
  // o topo: o Historico e um icone junto dos outros, e o Seguir no terminal nao esta mais la
  const doTopo = /function topo\(\)\{[\s\S]*?\n\}/.exec(pagina.txt)[0];
  assert.match(doTopo, /<a class="ico" href="\/\?t=\$\{TOKEN\}" aria-label="Histórico de grills" title="Histórico de grills">\$\{ICONE_RELOGIO\}<\/a>/, 'a pagina do grill leva ao historico pelo icone');
  assert.doesNotMatch(doTopo, /Seguir no terminal|paraCli/, 'o Seguir no terminal saiu do topo');
  // o Seguir no terminal no fim do conteudo, so com o grill ativo, abre a confirmacao
  assert.match(pagina.txt, /\$\{corpo\}\$\{ativo\?`<p class="seguir"><button class="sublink" onclick="document\.getElementById\('dlg-cli'\)\.showModal\(\)">Seguir no terminal<\/button><\/p>`:''\}<\/main>/);
  const dialogo = /<dialog id="dlg-cli"[\s\S]*?<\/dialog>/.exec(pagina.txt)[0];
  assert.match(dialogo, /<form method="dialog"/, 'Esc e os botoes fecham o dialogo');
  assert.match(dialogo, /<button class="btn sec" autofocus>Ficar na tela<\/button>/, 'o foco comeca no Ficar na tela');
  assert.match(dialogo, /<button class="btn pri" onclick="paraCli\(\)">Seguir no terminal<\/button>/);
  // o desenho do historico, rodado fora do navegador: os ativos no topo, a tabela pelo projeto e pela busca
  const hist = vm.runInNewContext([/const ATIVOS = .*\r?\n/, /const separar = .*\r?\n/].map((re) => re.exec(raiz.txt)[0]).join('') + '({ separar })');
  const GS = [{ projeto: 'a', pedido: 'Busca rápida', estado: 'rodada' }, { projeto: 'b', pedido: 'outra', estado: 'concluido' },
    { projeto: 'a', pedido: 'velho', estado: 'abandonado' }, { projeto: 'b', pedido: 'tela final', estado: 'final' }];
  const sep = hist.separar(GS, '', '');
  assert.deepStrictEqual(sep.ativos.map((g) => g.pedido), ['Busca rápida', 'tela final']);
  assert.strictEqual(sep.todos.length, 4);
  assert.deepStrictEqual(hist.separar(GS, 'a', '').todos.map((g) => g.pedido), ['Busca rápida', 'velho']);
  assert.deepStrictEqual(hist.separar(GS, '', 'BUSCA').todos.map((g) => g.pedido), ['Busca rápida']);

  // 17. o servidor de outra versao: sem grill ativo, o iniciar o troca; com grill ativo, ele fica
  const base2 = fs.mkdtempSync(path.join(os.tmpdir(), 'grill-tela-versao-'));
  bases.push(base2);
  const env2 = { ...env, GRILL_TELA_DIR: base2, GRILL_TELA_PORTA: String(await portaLivre()) };
  const outraVersao = path.join(base2, 'velha');
  fs.mkdirSync(outraVersao);
  fs.writeFileSync(path.join(outraVersao, 'grill-tela.js'), fs.readFileSync(SCRIPT, 'utf8') + '\n// outra versao\n');
  fs.copyFileSync(path.join(__dirname, 'pagina.html'), path.join(outraVersao, 'pagina.html'));
  const roda2 = (script, ...a) => spawnSync(process.execPath, [script, ...a], { encoding: 'utf8', env: env2 });
  const servidor2 = () => JSON.parse(fs.readFileSync(path.join(base2, 'servidor.json'), 'utf8'));
  const vivoPid = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
  assert.strictEqual(roda2(path.join(outraVersao, 'grill-tela.js'), 'historico', '--sem-navegador').status, 0);
  const antigo = servidor2();
  r = roda2(SCRIPT, 'iniciar', '--sem-navegador', '--projeto', 'v');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.notStrictEqual(servidor2().pid, antigo.pid, 'sem grill ativo: servidor novo');
  assert.notStrictEqual(servidor2().versao, antigo.versao);
  assert.strictEqual(new URL(r.stdout.trim().split('\n').pop()).port, env2.GRILL_TELA_PORTA, 'na mesma porta fixa');
  assert.ok(!vivoPid(antigo.pid), 'o velho saiu');
  process.kill(servidor2().pid);
  await espere(500);
  assert.strictEqual(roda2(path.join(outraVersao, 'grill-tela.js'), 'iniciar', '--sem-navegador', '--projeto', 'v2').status, 0);
  const comAtivo = servidor2();
  r = roda2(SCRIPT, 'iniciar', '--sem-navegador', '--projeto', 'v3');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(servidor2().pid, comAtivo.pid, 'com grill ativo: o velho fica');
  assert.match(r.stdout, /outra versão[\s\S]*2 grills ativos/, 'e o iniciar avisa');
  assert.strictEqual((await pedir(api(r.stdout.trim().split('\n').pop(), 'estado'))).status, 200, 'o grill novo funciona no velho');

  // 18. o grill do terminal: o registrar grava no disco, sem servidor, e o historico o lista e abre
  const questao = (id, rec = 0) => ({ id, cabecalho: `Tema ${id}`, titulo: `Pergunta ${id}?`, opcoes: [{ rotulo: 'A', recomendada: rec === 0 }, { rotulo: 'B', recomendada: rec === 1 }] });
  const doTerminal = (...ids) => ({ tipo: 'terminal', questoes: ids.map((i) => questao(i)), respostas: ids.map((i) => ({ id: i, marca: 'aceito', escolha: 'A', comentario: null })) });
  const eventosDe = (u) => fs.readFileSync(path.join(base, 'sessoes', new URL(u).pathname.split('/')[2], `${idDe(u)}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  await derrubar();
  r = roda('registrar', '--projeto', 'term', '--pedido', 'grill no terminal', arquivo('t1.json', doTerminal('Q1')));
  assert.strictEqual(r.status, 0, r.stderr);
  const urlT = r.stdout.trim().split('\n').pop();
  assert.match(urlT, URL_DO_GRILL('term'));
  await assert.rejects(pedir(api(urlT, 'estado')), 'o registrar nao sobe servidor');
  let evs = eventosDe(urlT);
  assert.deepStrictEqual([evs.map((e) => e.tipo), evs[0].canal, evs[0].pedido, evs[1].rodada.rodada], [['inicio', 'terminal'], 'cli', 'grill no terminal', 1]);
  assert.strictEqual(roda('historico', '--sem-navegador').status, 0);
  // o grill ja na memoria do servidor ve a rodada que o registrar grava depois
  const antes = (await pedir(api(urlT, 'estado'))).json;
  assert.deepStrictEqual([antes.fase, antes.historico.length], ['cli', 1]);
  assert.strictEqual(roda('registrar', urlT, arquivo('t2.json', doTerminal('Q1', 'Q2'))).status, 0);
  const depois = (await pedir(api(urlT, 'estado'))).json;
  assert.deepStrictEqual([depois.historico.length, depois.historico[1].rodada.rodada, depois.historico[1].terminal], [2, 2, true]);
  assert.notStrictEqual(depois.versao, antes.versao, 'a versao muda: a pagina aberta se redesenha');
  const doH = async (u) => (await pedir(`http://127.0.0.1:${PORTA}/api/historico?t=${token}`)).json.find((g) => g.id === idDe(u) && u.includes(`/g/${g.projeto}/`));
  h = await doH(urlT);
  assert.deepStrictEqual([h.estado, h.canal, h.respondidas, h.pedido], ['cli', 'cli', 2, 'grill no terminal']);
  // o corpo fora do contrato sai 1 sem escrever nada
  const tamanho = () => fs.readFileSync(path.join(base, 'sessoes', 'term', `${idDe(urlT)}.jsonl`), 'utf8').length;
  const t0 = tamanho();
  for (const ruim of ['{', { tipo: 'terminal', questoes: [{ ...questao('Q1'), opcoes: [] }], respostas: [] },
    { ...doTerminal('Q1'), respostas: [{ id: 'Q9', marca: 'aceito', escolha: 'A', comentario: null }] },
    { ...doTerminal('Q1'), respostas: [{ id: 'Q1', marca: 'talvez', escolha: 'A', comentario: null }] }, { tipo: 'outro' }]) {
    r = roda('registrar', urlT, arquivo('ruim.json', ruim));
    assert.strictEqual(r.status, 1, JSON.stringify(ruim));
    assert.match(r.stderr, /registrar recusado/);
  }
  assert.strictEqual(tamanho(), t0);
  // o sim conclui o grill com o documento; o segundo sai 1
  assert.strictEqual(roda('registrar', urlT, arquivo('sim.json', { tipo: 'sim', documento: 'Nota X' })).status, 0);
  assert.deepStrictEqual(eventosDe(urlT).pop(), { ...eventosDe(urlT).pop(), tipo: 'sim', documento: 'Nota X' });
  assert.strictEqual(roda('registrar', urlT, arquivo('sim.json', { tipo: 'sim', documento: 'Nota X' })).status, 1, 'o segundo sim');
  assert.strictEqual((await doH(urlT)).estado, 'concluido');
  // a sessao da tela com a rodada aberta recusa; a que voltou ao CLI recebe depois do cli, numerando em sequencia
  const urlR = iniciar();
  assert.strictEqual(roda('rodada', urlR, arquivo('rodada.json', RODADA)).status, 0);
  assert.strictEqual(roda('registrar', urlR, arquivo('t1.json', doTerminal('Q1'))).status, 1, 'grill ativo na pagina');
  assert.strictEqual((await pedir(api(urlR, 'respostas'), 'POST', { tipo: 'rodada', rodada: 1, respostas: [{ id: 'Q1', opcao: 0 }, { id: 'Q2', opcao: 0 }] })).status, 200);
  // a rodada 2 publicada que a pagina nao respondeu nao conta: a do terminal e a 2, depois da ultima respondida
  assert.strictEqual(roda('rodada', urlR, arquivo('rodada2.json', { ...RODADA, rodada: 2 })).status, 0);
  assert.strictEqual(roda('cli', urlR).status, 0);
  assert.strictEqual(roda('registrar', urlR, arquivo('t1.json', doTerminal('Q1'))).status, 0);
  const daTela = (await pedir(api(urlR, 'estado'))).json;
  assert.deepStrictEqual(daTela.historico.map((x) => [x.rodada.rodada, Boolean(x.terminal)]), [[1, false], [2, true]]);
  // com o servidor caido, a sessao com a rodada aberta vai ao terminal no disco e recebe a rodada
  const urlC = iniciar();
  assert.strictEqual(roda('rodada', urlC, arquivo('rodada.json', RODADA)).status, 0);
  await derrubar();
  r = roda('registrar', urlC, arquivo('t1.json', doTerminal('Q1')));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(eventosDe(urlC).map((e) => e.tipo), ['inicio', 'rodada', 'cli', 'terminal']);
  assert.strictEqual(eventosDe(urlC).pop().rodada.rodada, 1);
  // a URL com o projeto ilegivel sai 1 com o motivo, sem a pilha
  r = roda('registrar', urlC.replace('/g/teste/', '/g/%E0%A4%A/'), arquivo('t1.json', doTerminal('Q1')));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /^registrar recusado: URL ilegível/);
  // o --retomar sem --id pula o grill do terminal, que pode ser de outra janela
  assert.strictEqual(roda('registrar', '--projeto', 'sessao', arquivo('t1.json', doTerminal('Q1'))).status, 0);
  assert.strictEqual(urlDe(iniciarSessao('--retomar')), url8, 'a ultima sessao do projeto que nao e do terminal');
  // a pagina: o grill no terminal e "No terminal", a leitura mostra a pergunta e o grill no CLI segue consultando
  const estadoDaPagina = vm.runInNewContext(/const ESTADO = [\s\S]*?\[g\.estado\];/.exec(pagina.txt)[0] + ' ESTADO');
  assert.strictEqual(estadoDaPagina({ estado: 'cli', canal: 'cli' }), 'No terminal');
  assert.strictEqual(estadoDaPagina({ estado: 'cli', canal: 'tela' }), 'Voltou ao CLI');
  const rodadasLidas = vm.runInNewContext(/function historico\(aberto\)\{[\s\S]*?\n\}/.exec(pagina.txt)[0] + ' historico',
    { E: depois, esc: (s) => String(s), md: (s) => String(s), ROTULO: { aceito: 'aceito' } });
  assert.match(rodadasLidas(true), /Tema Q2[\s\S]*Pergunta Q2\?/, 'a leitura mostra o tema e a pergunta');
  assert.doesNotMatch(/async function consultar\(forcar\)\{\r?\n.*\r?\n/.exec(pagina.txt)[0], /'cli'/, 'o grill no CLI segue consultando');

  r = roda('sessoes', '--projeto', 'sessao');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^sessao {2}\d{8}-\d{6} {2}1 rodada\(s\) respondida\(s\), fase concluido, último evento sim {2}\S/);
  r = roda('sessoes');
  assert.match(r.stdout, /^teste {2}/m, 'sessoes sem projeto lista todos');
  assert.match(r.stdout, /^sessao {2}/m);

  console.log('grill-tela ok: servidor unico com porta fixa e token da maquina, URL por grill, iniciar, token, validacao, aguardar, preferencias, final, cli, sim sem derrubar o servidor, aguardar substituido, resposta que nao e JSON, aguardar com prazo, rascunho, mensagem livre, nao-resposta, proveniencia com ADR, corrida, sessao retomada e historico de grills');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
