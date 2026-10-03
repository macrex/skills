#!/usr/bin/env node
'use strict';
// O grill do Matt numa tela HTML local. Um programa so, com os subcomandos que o agente usa:
//
//   node grill-tela.js iniciar [--projeto <nome>] [--sem-navegador]   imprime a URL
//   node grill-tela.js rodada <url> <arquivo.json | ->                 publica a rodada
//   node grill-tela.js final <url> <arquivo.json | ->                  publica a tela final
//   node grill-tela.js aguardar <url> [--ate <segundos>]              espera a pagina
//   node grill-tela.js cli <url>                                       o grill foi para o terminal
//
// O servidor (subcomando `servidor`, que o `iniciar` sobe destacado) escuta so em 127.0.0.1,
// numa porta que o sistema escolhe, e recusa todo pedido sem o token da URL. Ele para alguns
// segundos depois do sim ou do CLI e depois de 2 horas sem a pagina consultar o estado.
// O aguardar sem prazo e para o harness que roda comando em background e reacorda o agente
// (Claude Code); com --ate, quem desiste e o servidor, que devolve {"tipo":"pendente"} e
// guarda a resposta para a proxima volta — o laco dos harnesses que esperam em primeiro plano.
// Preferencias da pagina ficam em ~/.grill-tela/preferencias.json (GRILL_TELA_DIR troca a pasta).
// So biblioteca padrao.

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PASTA = process.env.GRILL_TELA_DIR || path.join(os.homedir(), '.grill-tela');
const PREFERENCIAS = path.join(PASTA, 'preferencias.json');
const CHAVES_PREF = ['modo', 'tema', 'voz', 'velocidade', 'volume'];
const OCIOSO_MS = Number(process.env.GRILL_TELA_OCIOSO_MS) || 2 * 60 * 60 * 1000;
const ENCERRAR_MS = 3000; // tempo para a pagina, que consulta a cada segundo, ver a fase final

// ---------- contratos ----------

const texto = (v) => typeof v === 'string' && v.trim() !== '';

function errosDaRodada(r) {
  const erros = [];
  if (!r || typeof r !== 'object') return ['a rodada precisa ser um objeto JSON'];
  if (!Number.isInteger(r.rodada) || r.rodada < 1) erros.push('rodada: inteiro a partir de 1');
  if (!Array.isArray(r.questoes) || !r.questoes.length) return erros.concat('questoes: lista com ao menos uma questão');
  const ids = new Set();
  r.questoes.forEach((q, i) => {
    const onde = `questoes[${i}]`;
    if (!q || typeof q !== 'object') return erros.push(`${onde}: precisa ser um objeto`);
    if (!texto(q.id)) erros.push(`${onde}.id: texto não vazio`);
    else if (ids.has(q.id)) erros.push(`${onde}.id: '${q.id}' repetido`);
    else ids.add(q.id);
    if (!texto(q.cabecalho)) erros.push(`${onde}.cabecalho: texto não vazio`);
    if (!texto(q.titulo)) erros.push(`${onde}.titulo: texto não vazio`);
    if (q.contexto !== undefined && typeof q.contexto !== 'string') erros.push(`${onde}.contexto: texto, se houver`);
    if (!Array.isArray(q.opcoes) || q.opcoes.length < 2 || q.opcoes.length > 4) {
      return erros.push(`${onde}.opcoes: de 2 a 4 opções`);
    }
    q.opcoes.forEach((o, j) => {
      if (!o || !texto(o.rotulo)) erros.push(`${onde}.opcoes[${j}].rotulo: texto não vazio`);
      else if (o.descricao !== undefined && typeof o.descricao !== 'string') erros.push(`${onde}.opcoes[${j}].descricao: texto, se houver`);
    });
    const recs = q.opcoes.filter((o) => o && o.recomendada === true).length;
    if (recs !== 1) erros.push(`${onde}.opcoes: exatamente uma com "recomendada": true (tem ${recs})`);
  });
  return erros;
}

function errosDaFinal(f) {
  if (!f || !Array.isArray(f.tabela) || !f.tabela.length) return ['tabela: lista com ao menos uma linha {decisao, escolha}'];
  const erros = [];
  f.tabela.forEach((l, i) => {
    if (!l || !texto(l.decisao)) erros.push(`tabela[${i}].decisao: texto não vazio`);
    if (!l || !texto(l.escolha)) erros.push(`tabela[${i}].escolha: texto não vazio`);
  });
  return erros;
}

// A pagina manda {id, opcao, propria, comentario}; quem decide a marca e a escolha e o servidor.
function respostasDaRodada(rodada, enviadas) {
  const porId = new Map((Array.isArray(enviadas) ? enviadas : []).map((e) => [e && e.id, e]));
  const respostas = [];
  for (const q of rodada.questoes) {
    const e = porId.get(q.id) || {};
    const comentario = texto(e.comentario) ? e.comentario.trim() : null;
    if (Number.isInteger(e.opcao) && q.opcoes[e.opcao]) {
      const o = q.opcoes[e.opcao];
      respostas.push({ id: q.id, marca: o.recomendada ? 'aceito' : 'outra', escolha: o.rotulo, comentario });
    } else if (texto(e.propria)) {
      respostas.push({ id: q.id, marca: 'outra', escolha: e.propria.trim(), comentario });
    } else {
      return { erro: `${q.id} sem marca: escolha uma opção ou escreva a sua resposta` };
    }
  }
  return { respostas };
}

// ---------- servidor ----------

function servidor(projeto, saida) {
  const token = crypto.randomBytes(16).toString('hex');
  const S = { fase: 'inicio', versao: 0, projeto, rodada: null, final: null, historico: [], ultima: null };
  let pendente = null; // o que o proximo aguardar devolve
  let espera = null; // o aguardar que esta pendurado
  let ultimaVisita = Date.now();
  const mudou = () => S.versao++;

  function entregar(msg) {
    pendente = msg;
    if (espera) {
      responder(espera, 200, pendente);
      espera = pendente = null;
    }
  }
  function encerrar(ms) {
    setTimeout(() => process.exit(0), ms).unref();
  }

  const servidorHttp = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.searchParams.get('t') !== token) return responder(res, 403, { erro: 'token ausente ou errado' });
    lerCorpo(req).then((corpo) => {
      const rota = `${req.method} ${url.pathname}`;
      if (rota === 'GET /') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(fs.readFileSync(path.join(__dirname, 'pagina.html')));
      }
      if (rota === 'GET /api/estado') {
        ultimaVisita = Date.now();
        return responder(res, 200, S);
      }
      if (rota === 'POST /api/rodada' || rota === 'POST /api/final') {
        if (S.fase === 'concluido' || S.fase === 'cli') return responder(res, 409, { erros: [`o grill já terminou (${S.fase})`] });
        const final = rota === 'POST /api/final';
        const erros = final ? errosDaFinal(corpo) : errosDaRodada(corpo);
        if (erros.length) return responder(res, 400, { erros });
        Object.assign(S, final ? { fase: 'final', final: corpo, rodada: null } : { fase: 'rodada', rodada: corpo, final: null });
        mudou();
        return responder(res, 200, { ok: true });
      }
      if (rota === 'POST /api/respostas') {
        const tipo = corpo && corpo.tipo;
        if (tipo === 'rodada' && S.fase === 'rodada' && corpo.rodada === S.rodada.rodada) {
          const r = respostasDaRodada(S.rodada, corpo.respostas);
          if (r.erro) return responder(res, 400, { erro: r.erro });
          const msg = { tipo: 'rodada', rodada: S.rodada.rodada, respostas: r.respostas };
          S.historico.push({ rodada: S.rodada, respostas: r.respostas });
          Object.assign(S, { fase: 'aguarde', ultima: msg });
          mudou();
          entregar(msg);
          return responder(res, 200, { ok: true });
        }
        if ((tipo === 'sim' || tipo === 'ajuste') && S.fase === 'final') {
          if (tipo === 'ajuste' && !texto(corpo.texto)) return responder(res, 400, { erro: 'diga o que ajustar' });
          const msg = tipo === 'sim' ? { tipo } : { tipo, texto: corpo.texto.trim() };
          Object.assign(S, { fase: tipo === 'sim' ? 'concluido' : 'aguarde', ultima: msg });
          mudou();
          entregar(msg);
          if (tipo === 'sim') encerrar(ENCERRAR_MS);
          return responder(res, 200, { ok: true });
        }
        return responder(res, 409, { erro: `resposta '${tipo}' fora de hora (fase ${S.fase})` });
      }
      if (rota === 'POST /api/cli') {
        if (S.fase === 'concluido') return responder(res, 409, { erro: 'o grill já terminou com o sim' });
        S.fase = 'cli';
        mudou();
        entregar({ tipo: 'cli' });
        encerrar(ENCERRAR_MS);
        return responder(res, 200, { ok: true });
      }
      if (rota === 'GET /api/aguardar') {
        if (pendente) {
          responder(res, 200, pendente);
          pendente = null;
          return;
        }
        if (espera) responder(espera, 200, { tipo: 'substituido' }); // um aguardar por vez: o velho nao fica pendurado
        espera = res;
        // O prazo corre aqui, e nao no cliente: so o servidor sabe se a resposta ja saiu.
        const ate = Number(url.searchParams.get('ate'));
        const relogio = ate > 0 ? setTimeout(() => {
          if (espera !== res) return;
          espera = null;
          responder(res, 200, { tipo: 'pendente' });
        }, ate * 1000) : null;
        res.on('close', () => {
          clearTimeout(relogio);
          if (espera === res) espera = null;
        });
        return;
      }
      if (rota === 'GET /api/preferencias') return responder(res, 200, lerPreferencias());
      if (rota === 'POST /api/preferencias') {
        const prefs = lerPreferencias();
        for (const k of CHAVES_PREF) if (corpo && corpo[k] !== undefined) prefs[k] = corpo[k];
        fs.mkdirSync(PASTA, { recursive: true });
        fs.writeFileSync(PREFERENCIAS, JSON.stringify(prefs, null, 2));
        return responder(res, 200, prefs);
      }
      responder(res, 404, { erro: 'rota desconhecida' });
    }, () => responder(res, 400, { erro: 'corpo não é JSON' }));
  });

  servidorHttp.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${servidorHttp.address().port}/?t=${token}`;
    fs.writeFileSync(saida + '.tmp', url); // rename e atomico: o iniciar nunca le o arquivo vazio
    fs.renameSync(saida + '.tmp', saida);
  });
  setInterval(() => {
    if (Date.now() - ultimaVisita <= OCIOSO_MS) return;
    if (espera) responder(espera, 200, { tipo: 'encerrado', motivo: 'a página ficou fechada por tempo demais' });
    encerrar(500); // depois de a resposta sair pelo socket
  }, Math.min(60000, OCIOSO_MS / 2));
}

function lerPreferencias() {
  try {
    return JSON.parse(fs.readFileSync(PREFERENCIAS, 'utf8'));
  } catch (e) {
    return {};
  }
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let txt = '';
    req.on('data', (d) => (txt += d));
    req.on('end', () => {
      if (!txt) return ok(null);
      try { ok(JSON.parse(txt)); } catch (e) { falha(e); }
    });
  });
}

function responder(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// ---------- cliente: os subcomandos do agente ----------

function pedir(url, rota, metodo = 'GET', corpo, consulta = '') {
  const u = new URL(url);
  const alvo = `${u.origin}/api/${rota}?t=${u.searchParams.get('t')}${consulta}`;
  return new Promise((ok, falha) => {
    const req = http.request(alvo, { method: metodo, headers: { 'content-type': 'application/json' } }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (txt += d));
      res.on('end', () => {
        try { ok({ status: res.statusCode, json: JSON.parse(txt || 'null') }); } catch (e) { falha(e); }
      });
    });
    req.on('error', falha);
    req.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
}

function sai(msg, codigo = 1) {
  (codigo ? console.error : console.log)(msg);
  process.exit(codigo);
}

const celula = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function tabelaDasRespostas(msg) {
  const linhas = msg.respostas.map((r) =>
    `| ${celula(r.id)} | ${r.marca === 'aceito' ? '✓ aceito' : '⇄ outra'} | ${celula(r.escolha)} | ${celula(r.comentario)} |`);
  return [`Rodada ${msg.rodada} respondida na tela:`, '', '| Questão | Marca | Escolha | Comentário |', '|---|---|---|---|', ...linhas].join('\n');
}

// Sobe um processo que sobrevive ao comando que o lancou. No Windows o detached nao basta: o
// Antigravity roda cada comando num Job com KILL_ON_JOB_CLOSE e sem breakaway, e o Job leva o
// filho junto quando o comando termina. Quem cria pelo WMI e o servico dele, fora do Job; o
// ambiente e a pasta vao explicitos, porque o WMI nao os herda. Falhou, cai no detached.
function subirDestacado(cmd, args) {
  if (process.platform === 'win32') {
    const linha = [cmd, ...args].map((a) => `"${String(a).replace(/"/g, '')}"`).join(' ');
    const ps = '$s = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0; EnvironmentVariables=[string[]]($env:GT_AMBIENTE -split "`n")}; ' +
      '(Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:GT_LINHA; CurrentDirectory=$env:GT_PASTA; ProcessStartupInformation=$s}).ReturnValue';
    const ambiente = Object.entries(process.env).map(([k, v]) => `${k}=${v}`).join('\n');
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GT_LINHA: linha, GT_AMBIENTE: ambiente, GT_PASTA: process.cwd() },
    });
    if (String(r.stdout).trim() === '0') return;
  }
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
}

function abrirNavegador(url) {
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  subirDestacado(cmd, args);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const opcao = (nome) => { const i = args.indexOf(nome); return i === -1 ? undefined : args[i + 1]; };

  if (cmd === 'servidor') return servidor(opcao('--projeto'), opcao('--saida'));

  if (cmd === 'iniciar') {
    const projeto = opcao('--projeto') || path.basename(process.cwd());
    const saida = path.join(os.tmpdir(), `grill-tela-${process.pid}-${Date.now()}.url`);
    subirDestacado(process.execPath, [__filename, 'servidor', '--projeto', projeto, '--saida', saida]);
    for (let i = 0; i < 100 && !fs.existsSync(saida); i++) await new Promise((r) => setTimeout(r, 50));
    let url = '';
    try { url = fs.readFileSync(saida, 'utf8'); fs.unlinkSync(saida); } catch (e) { /* abaixo */ }
    if (!url) sai('o servidor não subiu em 5 segundos');
    if (!args.includes('--sem-navegador')) abrirNavegador(url);
    return console.log(url);
  }

  const url = args[0];
  if (!url || !/^http:\/\/127\.0\.0\.1:\d+\/\?t=/.test(url)) {
    sai('uso: grill-tela.js <iniciar|rodada|final|aguardar|cli> <url que o iniciar imprimiu> [arquivo.json | - | --ate <segundos>]');
  }
  const ate = opcao('--ate');
  if (ate !== undefined && !(/^\d+$/.test(ate) && ate >= 1 && ate <= 7200)) sai('--ate: segundos, inteiro de 1 a 7200');
  try {
    if (cmd === 'rodada' || cmd === 'final') {
      let corpo;
      try {
        corpo = JSON.parse(fs.readFileSync(args[1] === '-' || !args[1] ? 0 : args[1], 'utf8'));
      } catch (e) {
        sai(`${cmd} recusada: JSON ilegível (${e.message})`);
      }
      const r = await pedir(url, cmd, 'POST', corpo);
      if (r.status !== 200) sai(`${cmd} recusada:\n- ${(r.json.erros || [r.json.erro]).join('\n- ')}`);
      return console.log(cmd === 'final' ? `Tela final na tela, ${corpo.tabela.length} ${corpo.tabela.length === 1 ? 'decisão' : 'decisões'}.`
        : `Rodada ${corpo.rodada} na tela, ${corpo.questoes.length} ${corpo.questoes.length === 1 ? 'questão' : 'questões'}.`);
    }
    if (cmd === 'aguardar') {
      const r = await pedir(url, 'aguardar', 'GET', undefined, ate ? `&ate=${ate}` : '');
      if (r.json.tipo === 'rodada') console.log(tabelaDasRespostas(r.json) + '\n');
      return console.log(JSON.stringify(r.json));
    }
    if (cmd === 'cli') {
      const r = await pedir(url, 'cli', 'POST', {});
      if (r.status !== 200) sai(`cli recusado: ${r.json.erro}`);
      return console.log('A tela foi avisada: o grill segue no terminal.');
    }
  } catch (e) {
    sai(`o servidor da grill-tela não respondeu (${e.code || e.message}); siga o grill no CLI`);
  }
  sai(`subcomando desconhecido: ${cmd}`);
}

main();
