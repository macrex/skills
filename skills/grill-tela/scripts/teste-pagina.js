#!/usr/bin/env node
'use strict';
// Checagem da pagina da grill-tela num Chromium de verdade, pelo Playwright, contra o servidor
// de verdade. O que um humano faria numa rodada, e o que o agente recebe no aguardar:
//   1. a pagina so pede 127.0.0.1: nenhuma fonte ou script de fora;
//   2. Panorama: clicar troca a opcao e marca a linha; j/k e 1–9 escolhem pelo teclado, e na
//      questao multipla o numero marca e desmarca; n abre a nota com o cursor nela;
//   3. "Outra…" fica invisivel fora da linha em uso e aparece ao passar o mouse;
//   4. o rascunho sobrevive a um F5;
//   5. Ctrl+Enter envia, e o aguardar devolve escolha, escolhas e comentario certos;
//   6. parada, a pagina nao consulta o estado a cada segundo;
//   7. com a aba em segundo plano, a rodada nova poe o aviso no titulo;
//   8. Uma por vez: o numero escolhe e Enter avanca;
//   9. a tela final e o sim chegam ao aguardar.
//
//   node skills/grill-tela/scripts/teste-pagina.js
//
// Precisa do pacote playwright e de um Chromium (`npx playwright install chromium`). Sem o
// pacote, fora da CI, o teste avisa e sai com 0; na CI (CI=true), falha.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  if (process.env.CI) throw e;
  console.log('teste da pagina pulado: instale o pacote playwright para roda-lo');
  process.exit(0);
}

const SCRIPT = path.join(__dirname, 'grill-tela.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grill-pagina-'));
process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));
const env = { ...process.env, GRILL_TELA_DIR: base, GRILL_TELA_ENCERRAR_MS: '1000' };
const g = (...a) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8', env });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const json = (nome, obj) => { const p = path.join(base, nome); fs.writeFileSync(p, JSON.stringify(obj)); return p; };
function aguardar(url) {
  return new Promise((ok) => {
    let s = '';
    const f = spawn(process.execPath, [SCRIPT, 'aguardar', url, '--ate', '20'], { env });
    f.stdout.on('data', (d) => (s += d));
    f.on('close', () => ok(JSON.parse(s.trim().split('\n').pop())));
  });
}

const RODADA = { rodada: 1, questoes: [
  { id: 'Q1', cabecalho: 'Escopo', titulo: 'Cobre as pagas?', contexto: 'Hoje **3%** saíram erradas.',
    opcoes: [{ rotulo: 'Só em aberto', descricao: 'Pagas pelo estorno.', recomendada: true }, { rotulo: 'Todas', descricao: 'Gera crédito.' }] },
  { id: 'Q2', cabecalho: 'Canais', titulo: 'Por onde avisar?', multipla: true,
    opcoes: [{ rotulo: 'E-mail', recomendada: true }, { rotulo: 'SMS' }, { rotulo: 'Portal', recomendada: true }] },
  { id: 'Q3', cabecalho: 'Registro', titulo: 'Onde fica o rastro?',
    opcoes: [{ rotulo: '`eventos_fatura`', recomendada: true }, { rotulo: 'Log' }] },
] };

(async () => {
  const url = g('iniciar', '--sem-navegador', '--projeto', 'teste');
  const nav = await chromium.launch(process.env.GRILL_TELA_CHROMIUM ? { executablePath: process.env.GRILL_TELA_CHROMIUM } : {});
  const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  const pedidos = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  pg.on('request', (r) => pedidos.push(r.url()));
  try {
    await pg.goto(url);
    g('rodada', url, json('r1.json', RODADA));
    await pg.waitForSelector('.lin[data-lin="2"]');

    // 1. so a maquina
    const fora = pedidos.filter((u) => !u.startsWith('http://127.0.0.1:') && !u.startsWith('data:'));
    assert.deepStrictEqual(fora, [], 'a pagina pediu algo fora da maquina');

    // 2. Panorama: clique e teclado
    await pg.click('[data-q="0"][data-o="1"]');
    assert.ok(await pg.$eval('[data-lin="0"]', (el) => el.classList.contains('troca')), 'linha trocada marcada');
    await pg.mouse.click(5, 880); // tira o foco dos botoes
    await pg.keyboard.press('j'); // linha 1, a multipla
    await pg.keyboard.press('2'); // marca SMS
    await pg.keyboard.press('1'); // desmarca E-mail
    const q2 = await pg.$$eval('[data-q="1"]', (bs) => bs.map((b) => b.getAttribute('aria-pressed')));
    assert.deepStrictEqual(q2, ['false', 'true', 'true', 'false'], 'multipla pelo teclado');
    await pg.keyboard.press('n');
    await pg.keyboard.type('só urgente');
    assert.strictEqual(await pg.evaluate(() => document.activeElement.dataset.campo), 'abreCom-1', 'o cursor fica na nota');
    assert.match(await pg.textContent('#resumo'), /1 aceita · 2 trocadas · 1 com nota/);

    // 3. Outra… so na linha em uso
    await pg.mouse.move(5, 880);
    const opacidade = () => pg.$eval('[data-q="2"][data-o="outra"]', (b) => getComputedStyle(b).opacity);
    await pg.waitForTimeout(200);
    assert.strictEqual(await opacidade(), '0', 'Outra… escondida fora da linha');
    await pg.hover('[data-lin="2"] .tit');
    await pg.waitForTimeout(200);
    assert.strictEqual(await opacidade(), '1', 'Outra… aparece com o mouse');

    // 4. rascunho
    await pg.reload();
    await pg.waitForSelector('.lin[data-lin="2"]');
    assert.strictEqual(await pg.getAttribute('[data-q="0"][data-o="1"]', 'aria-pressed'), 'true', 'a troca sobrevive ao F5');
    assert.strictEqual(await pg.inputValue('[data-campo="abreCom-1"]'), 'só urgente', 'a nota sobrevive ao F5');

    // 6. parada, sem consultar a cada segundo
    const antes = pedidos.filter((u) => u.includes('/api/estado')).length;
    await pg.waitForTimeout(3000);
    assert.ok(pedidos.filter((u) => u.includes('/api/estado')).length - antes <= 1, 'a pagina parada nao consulta a cada segundo');

    // 5. Ctrl+Enter envia
    const espera = aguardar(url);
    await pg.mouse.click(5, 880);
    await pg.keyboard.press('Control+Enter');
    const r1 = await espera;
    assert.deepStrictEqual(r1.respostas, [
      { id: 'Q1', marca: 'outra', escolha: 'Todas' },
      { id: 'Q2', marca: 'outra', escolha: 'SMS; Portal', escolhas: ['SMS', 'Portal'], comentario: 'só urgente' },
      { id: 'Q3', marca: 'aceito', escolha: '`eventos_fatura`' },
    ]);

    // 7. aviso no titulo com a aba em segundo plano
    await pg.waitForSelector('.spin');
    await pg.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
    g('rodada', url, json('r2.json', { ...RODADA, rodada: 2 }));
    await pg.waitForFunction(() => document.title.startsWith('● Rodada 2'));

    // 8. Uma por vez
    await pg.click('.seg button:nth-child(2)');
    await pg.mouse.click(5, 880);
    await pg.keyboard.press('2');
    assert.strictEqual(await pg.getAttribute('.opt[data-o="1"]', 'aria-pressed'), 'true');
    await pg.keyboard.press('Enter');
    assert.match(await pg.textContent('.cartao'), /2 de 3/);

    // 9. final e sim
    const espera2 = aguardar(url);
    await pg.keyboard.press('Control+Enter');
    assert.strictEqual((await espera2).tipo, 'rodada');
    g('final', url, json('f.json', { tabela: [{ decisao: 'Escopo', escolha: 'Todas' }] }));
    await pg.waitForSelector('text=Confirmo o entendimento');
    const espera3 = aguardar(url);
    await pg.click('text=Confirmo o entendimento');
    assert.deepStrictEqual(await espera3, { tipo: 'sim' });
    await pg.waitForSelector('text=Grill concluído');

    assert.deepStrictEqual(erros, [], 'erro de JavaScript na pagina');
  } finally {
    await nav.close();
  }
  console.log('pagina ok: so 127.0.0.1, clique e teclado, multipla, Outra… na linha em uso, rascunho no F5, sem consulta por segundo, Ctrl+Enter, aviso no titulo, Uma por vez e o sim');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
