#!/usr/bin/env node
'use strict';
// O grill do Matt numa tela HTML local. Um programa so, com os subcomandos que o agente usa:
//
//   node grill-tela.js iniciar [--projeto <nome>] [--pedido <texto>] [--sem-navegador]
//                                                                      cria o grill e imprime a URL dele
//   node grill-tela.js rodada <url> <arquivo.json | ->                 publica a rodada
//   node grill-tela.js final <url> <arquivo.json | ->                  publica a tela final
//   node grill-tela.js aguardar <url> [--ate <segundos>]              espera a pagina
//   node grill-tela.js cli <url>                                       o grill foi para o terminal
//   node grill-tela.js iniciar --projeto <nome> --retomar [--id <id>]  retoma a sessao (sem --id, a ultima)
//   node grill-tela.js sessoes [--projeto <nome>]                      lista as sessoes em disco
//   node grill-tela.js historico [--sem-navegador]                     imprime a URL do historico de grills
//   node grill-tela.js abrir <url> [--sem-navegador]                   reabre um grill ou o historico
//   node grill-tela.js registrar <url | --projeto <nome> [--pedido <texto>]> <arquivo.json | ->
//                                         grava no disco, sem servidor, a rodada do terminal ou o sim
//
// Um servidor por maquina (subcomando `servidor`, que o iniciar sobe destacado quando nenhum
// responde) atende todos os grills e fica no ar ate o reboot. Ele escuta so em 127.0.0.1, na
// porta fixa 47110 (GRILL_TELA_PORTA a troca; ocupada ou reservada, outra do sistema), recusa
// todo pedido sem o token da maquina (o arquivo `token` da pasta) e grava porta, pid e versao em
// `servidor.json`; o iniciar de outra versao troca o servidor quando nenhum grill esta ativo.
// Cada grill fica em /g/<projeto>/<id>, com a API debaixo do caminho dele; a
// raiz e o historico de grills.
// O aguardar sem prazo e para o harness que roda comando em background e reacorda o agente
// (Claude Code); com --ate, quem desiste e o servidor, que devolve {"tipo":"pendente"} e
// guarda a resposta para a proxima volta — o laco dos harnesses que esperam em primeiro plano.
// Preferencias da pagina ficam em ~/.grill-tela/preferencias.json (GRILL_TELA_DIR troca a pasta).
// Cada sessao e um ~/.grill-tela/sessoes/<projeto>/<AAAAMMDD-HHMMSS>.jsonl, uma linha por evento
// (inicio com o projeto, o pedido e o canal, rodada, respostas, final, ajuste, sim, cli, tela, terminal); o
// servidor refaz o grill por ele na primeira vez que alguem o pede, e a resposta que o agente nao
// recebeu volta no proximo aguardar; a sessao do sim devolve o sim no proprio --retomar, e a que
// voltou ao CLI volta a tela. O grill feito no terminal (canal cli) entra pelo registrar, que so
// escreve na sessao em fase cli, ou na que nenhum servidor no ar segura, que ele leva ao terminal.
// So biblioteca padrao.

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PASTA = process.env.GRILL_TELA_DIR || path.join(os.homedir(), '.grill-tela');
const PREFERENCIAS = path.join(PASTA, 'preferencias.json');
const CHAVES_PREF = ['modo', 'tema', 'voz', 'velocidade', 'volume', 'aviso'];
const SESSOES = path.join(PASTA, 'sessoes');
const TOKEN = path.join(PASTA, 'token');
const SERVIDOR = path.join(PASTA, 'servidor.json');
const PORTA = Number(process.env.GRILL_TELA_PORTA) || 47110;
// a versao do servidor e o hash deste arquivo: qualquer mudanca nele e outra versao
const VERSAO = crypto.createHash('sha1').update(fs.readFileSync(__filename)).digest('hex').slice(0, 12);
const ID = /^\d{8}-\d{6}$/;
// a URL de um grill: o projeto (ainda codificado) e o id
const URL_DO_GRILL = /^http:\/\/127\.0\.0\.1:\d+\/g\/([^/?\s]+)\/(\d{8}-\d{6})\?t=/;
// o grill aberto sem evento ha mais que isto, e sem aguardar pendurado, e um grill abandonado
const ATIVO_MS = 2 * 60 * 60 * 1000;
const ESTADO_DA_FASE = { inicio: 'lendo', rodada: 'rodada', aguarde: 'lendo', final: 'final', concluido: 'concluido', cli: 'cli' };
// os estados de um grill ativo, que o servidor nao larga
const ESTADOS_ATIVOS = ['rodada', 'lendo', 'final'];

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
      // o desenho da opcao (o preview do AskUserQuestion), que a pagina mostra como veio
      if (o && o.previa !== undefined && typeof o.previa !== 'string') erros.push(`${onde}.opcoes[${j}].previa: texto, se houver`);
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
    if (!l) return;
    // a proveniencia e opcional: o que o agente nao sabe, ele omite
    if (l.motivo !== undefined && typeof l.motivo !== 'string') erros.push(`tabela[${i}].motivo: texto, se houver`);
    if (l.alternativas !== undefined && !(Array.isArray(l.alternativas) && l.alternativas.every(texto))) {
      erros.push(`tabela[${i}].alternativas: lista de rótulos não vazios, se houver`);
    }
    if (l.origem !== undefined && !ORIGENS.includes(l.origem)) erros.push(`tabela[${i}].origem: ${ORIGENS.join(', ')}, se houver`);
    if (l.duravel !== undefined && typeof l.duravel !== 'boolean') erros.push(`tabela[${i}].duravel: true ou false, se houver`);
  });
  return erros;
}
const ORIGENS = ['ditou', 'aceitou', 'agente'];

// As nao-respostas: a questao vai sem escolha, so com a marca.
const SEM_ESCOLHA = ['delegado', 'esclarecer', 'adiado'];

// A rodada do terminal que o registrar grava: as questoes no contrato da rodada e as respostas ja na
// forma que o servidor grava ({id, marca, escolha, comentario}).
function errosDoTerminal(c) {
  const erros = errosDaRodada({ rodada: 1, questoes: c.questoes });
  if (!Array.isArray(c.respostas)) return erros.concat('respostas: lista');
  const ids = new Set((Array.isArray(c.questoes) ? c.questoes : []).map((q) => q && q.id));
  c.respostas.forEach((r, i) => {
    const onde = `respostas[${i}]`;
    if (!r || !ids.has(r.id)) return erros.push(`${onde}.id: o id de uma questão`);
    if (![...SEM_ESCOLHA, 'aceito', 'outra'].includes(r.marca)) erros.push(`${onde}.marca: aceito, outra, ${SEM_ESCOLHA.join(', ')}`);
    if (r.escolha !== null && !texto(r.escolha)) erros.push(`${onde}.escolha: texto ou null`);
    if (r.comentario != null && typeof r.comentario !== 'string') erros.push(`${onde}.comentario: texto ou null`);
  });
  return erros;
}

// A pagina manda {id, opcao, propria, marca, comentario}; quem decide a marca e a escolha e o servidor.
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
    } else if (SEM_ESCOLHA.includes(e.marca)) {
      respostas.push({ id: q.id, marca: e.marca, escolha: null, comentario });
    } else {
      return { erro: `${q.id} sem marca: escolha uma opção ou escreva a sua resposta` };
    }
  }
  return { respostas };
}

// ---------- sessao em disco ----------

// Anexa um evento a sessao, numa linha so.
const anotar = (arquivo, ev) => fs.appendFileSync(arquivo, JSON.stringify({ em: new Date().toISOString(), ...ev }) + '\n');

// o nome do projeto vira pasta: so saem os caracteres que o Windows recusa
const pastaDoProjeto = (projeto) => path.join(SESSOES, String(projeto).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'));
const sessoesDe = (pasta) => {
  try { return fs.readdirSync(pasta).filter((n) => n.endsWith('.jsonl')).sort().map((n) => path.join(pasta, n)); } catch (e) { return []; }
};

function lerSessao(arquivo) {
  return fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch (e) { return []; } // linha cortada por uma queda no meio da escrita
  });
}

// Refaz o estado na ordem em que o servidor gravou. A resposta sem rodada ou final publicada
// depois fica pendente: o agente pode nao a ter recebido.
function restaurar(eventos) {
  const R = { fase: 'inicio', rodada: null, final: null, historico: [], ultima: null, pendente: null, projeto: null, pedido: null, canal: null };
  for (const ev of eventos) {
    // a sessao antiga tem um inicio a cada subida do servidor: vale o primeiro; a do terminal nasce no CLI
    if (ev.tipo === 'inicio') {
      if (R.canal === null && ev.canal === 'cli') R.fase = 'cli';
      Object.assign(R, { projeto: R.projeto ?? ev.projeto ?? null, pedido: R.pedido ?? ev.pedido ?? null, canal: R.canal ?? ev.canal ?? 'tela' });
    }
    else if (ev.tipo === 'rodada') Object.assign(R, { fase: 'rodada', rodada: ev.rodada, final: null, pendente: null });
    else if (ev.tipo === 'final') Object.assign(R, { fase: 'final', final: ev.final, rodada: null, pendente: null });
    else if (ev.tipo === 'respostas' && R.rodada) {
      const msg = { tipo: 'rodada', rodada: R.rodada.rodada, respostas: ev.respostas };
      R.historico.push({ rodada: R.rodada, respostas: ev.respostas });
      Object.assign(R, { fase: 'aguarde', ultima: msg, pendente: msg });
    } else if (ev.tipo === 'ajuste') {
      const msg = { tipo: 'ajuste', texto: ev.texto };
      Object.assign(R, { fase: 'aguarde', ultima: msg, pendente: msg });
    } else if (ev.tipo === 'sim') Object.assign(R, { fase: 'concluido', ultima: { tipo: 'sim', adrs: ev.adrs || [], ...(ev.documento && { documento: ev.documento }) }, pendente: null });
    // a rodada respondida no terminal, que o registrar grava: entra no historico sem mexer na fase
    else if (ev.tipo === 'terminal') R.historico.push({ rodada: ev.rodada, respostas: ev.respostas, terminal: true });
    // o usuario (ou o agente) levou o grill ao terminal; o --retomar o traz de volta a tela (tela),
    // esperando a rodada seguinte
    else if (ev.tipo === 'cli') Object.assign(R, { fase: 'cli', pendente: null });
    else if (ev.tipo === 'tela' && R.fase === 'cli') Object.assign(R, { fase: 'aguarde' });
  }
  return R;
}

// ---------- servidor ----------

const lerJson = (arquivo) => {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { return null; }
};

// O token da maquina, criado na primeira vez; na corrida, fica o de quem gravou primeiro.
function tokenDaMaquina() {
  const lido = () => {
    try {
      const t = fs.readFileSync(TOKEN, 'utf8').trim();
      return /^[0-9a-f]{32}$/.test(t) ? t : null;
    } catch (e) { return null; }
  };
  if (lido()) return lido();
  fs.mkdirSync(PASTA, { recursive: true });
  const novo = crypto.randomBytes(16).toString('hex');
  try { fs.writeFileSync(TOKEN, novo, { flag: 'wx', mode: 0o600 }); } catch (e) { if (!lido()) fs.writeFileSync(TOKEN, novo, { mode: 0o600 }); }
  return lido();
}

// A versao e o pid da grill-tela que responde na porta com este token, ou null. Com prazo: outro
// processo na porta pode aceitar a conexao e nunca responder.
function sondar(porta, token) {
  return new Promise((ok) => {
    if (!porta) return ok(null);
    const req = http.get(`http://127.0.0.1:${porta}/api/versao?t=${token}`, { timeout: 1000 }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (txt += d));
      res.on('end', () => {
        try {
          const j = JSON.parse(txt);
          ok(res.statusCode === 200 && j && j.versao ? j : null);
        } catch (e) { ok(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => ok(null));
  });
}

function servidor() {
  const token = tokenDaMaquina();
  // os grills ja pedidos, por `<pasta do projeto>/<id>`; o resto fica em disco ate alguem pedir
  const grills = new Map();
  const tamanhoDe = (arquivo) => { try { return fs.statSync(arquivo).size; } catch (e) { return -1; } };
  function grill(pasta, id) {
    const chave = `${pasta}/${id}`;
    const velho = grills.get(chave);
    // o grill no CLI so cresce pelo registrar, por fora: o arquivo maior e relido, com a versao adiante
    if (velho && !(velho.S.fase === 'cli' && tamanhoDe(velho.arquivo) !== velho.tamanho)) return velho;
    const arquivo = path.join(pastaDoProjeto(pasta), `${id}.jsonl`);
    if (!ID.test(id) || ['.', '..'].includes(pasta) || !fs.existsSync(arquivo)) return null;
    const R = restaurar(lerSessao(arquivo));
    const G = {
      arquivo,
      tamanho: tamanhoDe(arquivo),
      S: { fase: R.fase, versao: velho ? velho.S.versao + 1 : 0, projeto: R.projeto || pasta, canal: R.canal, rodada: R.rodada, final: R.final, historico: R.historico, ultima: R.ultima, rascunho: null },
      // o que os proximos aguardar devolvem, na ordem: a mensagem livre nao fecha a rodada, e as
      // respostas que vem depois dela nao podem tomar o lugar dela
      pendentes: R.pendente ? [R.pendente] : [],
      espera: null, // o aguardar que esta pendurado
    };
    grills.set(chave, G);
    return G;
  }
  // disco cheio ou pasta sem permissao nao derrubam o grill: so a retomada se perde
  const registrar = (G, ev) => {
    try { anotar(G.arquivo, ev); } catch (e) { /* segue */ }
    G.tamanho = tamanhoDe(G.arquivo);
  };
  function entregar(G, msg) {
    G.pendentes.push(msg);
    if (G.espera) {
      responder(G.espera, 200, G.pendentes.shift());
      G.espera = null;
    }
  }
  // Todos os grills da maquina, do mais novo ao mais velho, lidos do disco a cada consulta: o estado
  // vem dos eventos, e o aguardar pendurado so o servidor conhece.
  // ponytail: le todas as sessoes por consulta; um indice entra se a maquina juntar milhares de grills
  function historicoDeGrills() {
    let pastas = [];
    try { pastas = fs.readdirSync(SESSOES); } catch (e) { /* nenhum grill ainda */ }
    return pastas.flatMap((p) => sessoesDe(path.join(SESSOES, p))).map((arquivo) => {
      const pasta = path.basename(path.dirname(arquivo));
      const id = path.basename(arquivo, '.jsonl');
      const eventos = lerSessao(arquivo);
      const R = restaurar(eventos);
      const em = eventos.map((e) => Date.parse(e.em)).filter(Number.isFinite);
      const inicio = em[0] ?? 0;
      const ultimo = em[em.length - 1] ?? 0;
      const pendurado = Boolean((grills.get(`${pasta}/${id}`) || {}).espera);
      let estado = ESTADO_DA_FASE[R.fase];
      if (ESTADOS_ATIVOS.includes(estado) && Date.now() - ultimo > ATIVO_MS && !pendurado) estado = 'abandonado';
      // a sessao sem pedido (de antes do --pedido) leva o nome da primeira questao
      const q = ((R.historico[0] || {}).rodada || R.rodada || { questoes: [] }).questoes[0];
      return {
        projeto: R.projeto || pasta, id, estado, canal: R.canal, inicio, ultimo,
        pedido: R.pedido || (q ? `${q.cabecalho}: ${q.titulo}` : ''),
        rodada: R.rodada ? R.rodada.rodada : R.historico.length ? R.historico[R.historico.length - 1].rodada.rodada : 0,
        respondidas: R.historico.length,
        decisoes: R.final ? R.final.tabela.length : 0,
        adrs: R.ultima && R.ultima.tipo === 'sim' ? R.ultima.adrs.length : 0,
        caminho: `/g/${encodeURIComponent(pasta)}/${id}`,
      };
    }).sort((a, b) => b.inicio - a.inicio);
  }
  const pagina = (res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(path.join(__dirname, 'pagina.html')));
  };

  // a API de um grill: `rota` e o metodo e o nome, como `GET estado`
  function doGrill(G, rota, url, corpo, res) {
    const S = G.S;
    const mudou = () => S.versao++;
    if (rota === 'GET estado') return responder(res, 200, S);
    if (rota === 'POST rodada' || rota === 'POST final') {
      if (S.fase === 'concluido' || S.fase === 'cli') return responder(res, 409, { erros: [`o grill já terminou (${S.fase})`] });
      const final = rota === 'POST final';
      const erros = final ? errosDaFinal(corpo) : errosDaRodada(corpo);
      if (erros.length) return responder(res, 400, { erros });
      Object.assign(S, { rascunho: null }, final ? { fase: 'final', final: corpo, rodada: null } : { fase: 'rodada', rodada: corpo, final: null });
      G.pendentes.length = 0; // publicar e a prova de que o agente recebeu a resposta anterior
      registrar(G, final ? { tipo: 'final', final: corpo } : { tipo: 'rodada', rodada: corpo });
      mudou();
      return responder(res, 200, { ok: true });
    }
    if (rota === 'POST respostas') {
      const tipo = corpo && corpo.tipo;
      if (tipo === 'rodada' && S.fase === 'rodada' && corpo.rodada === S.rodada.rodada) {
        const r = respostasDaRodada(S.rodada, corpo.respostas);
        if (r.erro) return responder(res, 400, { erro: r.erro });
        const msg = { tipo: 'rodada', rodada: S.rodada.rodada, respostas: r.respostas };
        S.historico.push({ rodada: S.rodada, respostas: r.respostas });
        Object.assign(S, { fase: 'aguarde', ultima: msg, rascunho: null });
        registrar(G, { tipo: 'respostas', rodada: msg.rodada, respostas: msg.respostas });
        mudou();
        entregar(G, msg);
        return responder(res, 200, { ok: true });
      }
      // a mensagem livre vai ao agente e a rodada segue aberta
      if (tipo === 'texto' && S.fase === 'rodada') {
        if (!texto(corpo.texto)) return responder(res, 400, { erro: 'escreva a mensagem' });
        entregar(G, { tipo, texto: corpo.texto.trim() });
        return responder(res, 200, { ok: true });
      }
      if ((tipo === 'sim' || tipo === 'ajuste') && S.fase === 'final') {
        if (tipo === 'ajuste' && !texto(corpo.texto)) return responder(res, 400, { erro: 'diga o que ajustar' });
        // a pagina manda os indices marcados; as linhas que voltam sao as da final publicada
        const marcadas = new Set(Array.isArray(corpo.adrs) ? corpo.adrs : []);
        const msg = tipo === 'sim' ? { tipo, adrs: S.final.tabela.filter((l, i) => marcadas.has(i)) } : { tipo, texto: corpo.texto.trim() };
        Object.assign(S, { fase: tipo === 'sim' ? 'concluido' : 'aguarde', ultima: msg });
        registrar(G, msg);
        mudou();
        entregar(G, msg);
        return responder(res, 200, { ok: true });
      }
      return responder(res, 409, { erro: `resposta '${tipo}' fora de hora (fase ${S.fase})` });
    }
    // As marcas ainda nao enviadas, para a pagina recarregada nao as perder. Nao muda a versao:
    // a pagina que grava nao deve se redesenhar com o proprio rascunho.
    if (rota === 'PUT rascunho') {
      if (S.fase !== 'rodada' || !corpo || corpo.rodada !== S.rodada.rodada) {
        return responder(res, 409, { erro: `rascunho fora da rodada atual (fase ${S.fase})` });
      }
      if (!corpo.resp || typeof corpo.resp !== 'object' || Array.isArray(corpo.resp)) return responder(res, 400, { erro: 'resp: objeto por questão' });
      S.rascunho = { rodada: corpo.rodada, resp: corpo.resp };
      return responder(res, 200, { ok: true });
    }
    // a volta do CLI a tela: a pagina espera a rodada seguinte, e o cli que nenhum aguardar levou sai
    // da fila; fora do CLI, nada muda
    if (rota === 'POST tela') {
      if (S.fase === 'concluido') return responder(res, 409, { erro: 'o grill já terminou com o sim' });
      if (S.fase !== 'cli') return responder(res, 200, { ok: true });
      S.fase = 'aguarde';
      G.pendentes.length = 0;
      registrar(G, { tipo: 'tela' });
      mudou();
      return responder(res, 200, { ok: true });
    }
    if (rota === 'POST cli') {
      if (S.fase === 'concluido') return responder(res, 409, { erro: 'o grill já terminou com o sim' });
      S.fase = 'cli';
      registrar(G, { tipo: 'cli' });
      mudou();
      entregar(G, { tipo: 'cli' });
      return responder(res, 200, { ok: true });
    }
    if (rota === 'GET aguardar') {
      if (G.pendentes.length) return responder(res, 200, G.pendentes.shift());
      if (G.espera) responder(G.espera, 200, { tipo: 'substituido' }); // um aguardar por vez: o velho nao fica pendurado
      G.espera = res;
      // O prazo corre aqui, e nao no cliente: so o servidor sabe se a resposta ja saiu.
      const ate = Number(url.searchParams.get('ate'));
      const relogio = ate > 0 ? setTimeout(() => {
        if (G.espera !== res) return;
        G.espera = null;
        responder(res, 200, { tipo: 'pendente' });
      }, ate * 1000) : null;
      res.on('close', () => {
        clearTimeout(relogio);
        if (G.espera === res) G.espera = null;
      });
      return;
    }
    responder(res, 404, { erro: 'rota desconhecida' });
  }

  const servidorHttp = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.searchParams.get('t') !== token) return responder(res, 403, { erro: 'token ausente ou errado' });
    lerCorpo(req).then((corpo) => {
      const caminho = /^\/g\/([^/]+)\/([^/]+)(?:\/api\/([a-z]+))?$/.exec(url.pathname);
      if (caminho) {
        let pasta = '';
        try { pasta = decodeURIComponent(caminho[1]); } catch (e) { /* abaixo, 404 */ }
        const G = grill(pasta, caminho[2]);
        if (!G) return responder(res, 404, { erro: 'grill não encontrado' });
        return caminho[3] ? doGrill(G, `${req.method} ${caminho[3]}`, url, corpo, res) : pagina(res);
      }
      const rota = `${req.method} ${url.pathname}`;
      if (rota === 'GET /') return pagina(res);
      if (rota === 'GET /api/versao') return responder(res, 200, { versao: VERSAO, pid: process.pid });
      if (rota === 'GET /api/historico') return responder(res, 200, historicoDeGrills());
      // o iniciar de outra versao pede a troca: so sai quem nao segura nenhum grill ativo
      if (rota === 'POST /api/parar') {
        const ativos = historicoDeGrills().filter((g) => ESTADOS_ATIVOS.includes(g.estado)).length;
        if (ativos) return responder(res, 409, { ativos });
        responder(res, 200, { ok: true });
        return setTimeout(() => process.exit(0), 100);
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

  // a porta fixa ocupada: se e uma grill-tela desta maquina, outro iniciar ganhou a corrida e esta
  // sai; senao (ou numa faixa reservada do Windows, que devolve EACCES), outra porta do sistema
  let outra = false;
  servidorHttp.on('error', async (e) => {
    if (outra || !['EADDRINUSE', 'EACCES'].includes(e.code)) throw e;
    if (await sondar(PORTA, token)) process.exit(0);
    outra = true;
    servidorHttp.listen(0, '127.0.0.1');
  });
  servidorHttp.once('listening', () => {
    fs.mkdirSync(PASTA, { recursive: true });
    // rename e atomico: quem le nunca pega o arquivo pela metade
    fs.writeFileSync(SERVIDOR + '.tmp', JSON.stringify({ porta: servidorHttp.address().port, pid: process.pid, versao: VERSAO }));
    fs.renameSync(SERVIDOR + '.tmp', SERVIDOR);
  });
  servidorHttp.listen(PORTA, '127.0.0.1');
}

// O servidor da maquina no ar: o vivo (pelo servidor.json, ou na porta fixa) ou um novo, destacado.
// O vivo de outra versao e trocado quando nao segura grill ativo; senao fica, e `aviso` diz por que.
// O servidor da maquina que responde, pelo servidor.json ou na porta fixa, ou null.
async function servidorNoAr(token) {
  for (const porta of new Set([(lerJson(SERVIDOR) || {}).porta, PORTA])) {
    const v = await sondar(porta, token);
    if (v) return { porta, ...v };
  }
  return null;
}

async function garantirServidor() {
  const token = tokenDaMaquina();
  const vivo = () => servidorNoAr(token);
  let s = await vivo();
  let aviso = '';
  if (s && s.versao !== VERSAO) {
    const r = await pedir(`http://127.0.0.1:${s.porta}/?t=${token}`, 'parar', 'POST', {}).catch(() => null);
    if (r && r.status === 409) {
      const n = r.json.ativos;
      aviso = `O servidor da grill-tela no ar é de outra versão e segue, porque ${n} ${n === 1 ? 'grill ativo depende' : 'grills ativos dependem'} dele; a versão nova entra quando nenhum estiver ativo.`;
    } else {
      for (const fim = Date.now() + 3000; Date.now() < fim && (await sondar(s.porta, token)); ) await new Promise((ok) => setTimeout(ok, 100));
      s = null;
    }
  }
  if (!s) {
    subirDestacado(process.execPath, [__filename, 'servidor']);
    for (const fim = Date.now() + 5000; !s && Date.now() < fim; s = await vivo()) await new Promise((r) => setTimeout(r, 50));
    if (!s) sai('o servidor não subiu em 5 segundos');
  }
  return { porta: s.porta, token, aviso };
}

// o arquivo da sessao nasce com o inicio, exclusivo: dois grills do mesmo projeto no mesmo
// segundo nao dividem o arquivo, o segundo anda um segundo
function criarSessao(projeto, pedido, canal) {
  const pasta = pastaDoProjeto(projeto);
  fs.mkdirSync(pasta, { recursive: true });
  const linha = JSON.stringify({ em: new Date().toISOString(), tipo: 'inicio', projeto, ...(texto(pedido) && { pedido: pedido.trim() }), ...(canal && { canal }) }) + '\n';
  for (let t = Date.now(); ; t += 1000) {
    // o carimbo na hora local: AAAAMMDD-HHMMSS
    const local = new Date(t - new Date().getTimezoneOffset() * 60000).toISOString();
    const arquivo = path.join(pasta, local.slice(0, 19).replace(/[-:]/g, '').replace('T', '-') + '.jsonl');
    try {
      fs.writeFileSync(arquivo, linha, { flag: 'wx' });
      return arquivo;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}
const urlDoGrill = (porta, token, sessao) =>
  `http://127.0.0.1:${porta}/g/${encodeURIComponent(path.basename(path.dirname(sessao)))}/${path.basename(sessao, '.jsonl')}?t=${token}`;

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

// a API de um grill fica debaixo do caminho dele: a mesma regra no painel (hooks/register.js)
const rotaDa = (url, rota) => url.replace(/\/?\?t=/, `/api/${rota}?t=`);

function pedir(url, rota, metodo = 'GET', corpo, consulta = '') {
  const alvo = rotaDa(url, rota) + consulta;
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
const GLIFO = { aceito: '✓', outra: '⇄', delegado: '→', esclarecer: '?', adiado: '…' };

function tabelaDasRespostas(msg) {
  const linhas = msg.respostas.map((r) =>
    `| ${celula(r.id)} | ${GLIFO[r.marca]} ${r.marca} | ${celula(r.escolha)} | ${celula(r.comentario)} |`);
  return [`Rodada ${msg.rodada} respondida na tela:`, '', '| Questão | Marca | Escolha | Comentário |', '|---|---|---|---|', ...linhas].join('\n');
}

// Sobe um processo que sobrevive ao comando que o lancou. No Windows o detached nao basta: o
// Antigravity roda cada comando num Job com KILL_ON_JOB_CLOSE e sem breakaway, e o Job leva o
// filho junto quando o comando termina. Quem cria pelo WMI e o servico dele, fora do Job; o
// ambiente e a pasta vao explicitos, porque o WMI nao os herda. Falhou, cai no detached. So vai
// entre aspas o argumento com espaco: o rundll32 nao abre o navegador com "url.dll,FileProtocolHandler".
function subirDestacado(cmd, args) {
  if (process.platform === 'win32') {
    const linha = [cmd, ...args].map((a) => String(a).replace(/"/g, '')).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
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

  if (cmd === 'servidor') return servidor();

  if (cmd === 'sessoes') {
    const pastas = opcao('--projeto') ? [pastaDoProjeto(opcao('--projeto'))]
      : (() => { try { return fs.readdirSync(SESSOES).sort().map((n) => path.join(SESSOES, n)); } catch (e) { return []; } })();
    const linhas = pastas.flatMap(sessoesDe).map((arquivo) => {
      const eventos = lerSessao(arquivo);
      const R = restaurar(eventos);
      const ultimo = eventos.length ? eventos[eventos.length - 1].tipo : 'vazia';
      return `${path.basename(path.dirname(arquivo))}  ${path.basename(arquivo, '.jsonl')}  ${R.historico.length} rodada(s) respondida(s), fase ${R.fase}, último evento ${ultimo}  ${arquivo}`;
    });
    return console.log(linhas.length ? linhas.join('\n') : `nenhuma sessão em ${SESSOES}`);
  }

  if (cmd === 'iniciar') {
    const projeto = opcao('--projeto') || path.basename(process.cwd());
    const retomar = args.includes('--retomar');
    let sessao;
    let R;
    if (retomar) {
      // com --id, a sessao dele: a ultima do projeto pode ser o grill de outra janela
      const id = opcao('--id');
      // sem --id, a ultima que nao nasceu no terminal: a do terminal e de uma janela que o mod segue
      sessao = id ? (ID.test(id) ? path.join(pastaDoProjeto(projeto), `${id}.jsonl`) : null)
        : sessoesDe(pastaDoProjeto(projeto)).reverse().find((a) => restaurar(lerSessao(a)).canal !== 'cli');
      if (!sessao || !fs.existsSync(sessao)) sai(`nenhuma sessão do projeto ${projeto}${id ? ` com o id ${id}` : ''} para retomar em ${SESSOES}`);
      R = restaurar(lerSessao(sessao));
      // o sim que o agente pode nao ter recebido volta como o aguardar o daria
      if (R.fase === 'concluido') {
        return console.log(`A sessão ${path.basename(sessao, '.jsonl')} do projeto ${projeto} já terminou com o sim, que segue abaixo; para outro grill, rode o iniciar sem --retomar.\n${JSON.stringify(R.ultima)}`);
      }
    }
    const { porta, token, aviso } = await garantirServidor();
    if (aviso) console.log(aviso);
    if (!retomar) sessao = criarSessao(projeto, opcao('--pedido'));
    const url = urlDoGrill(porta, token, sessao);
    // a sessao que voltou ao CLI volta a tela na mesma URL
    const daTela = R && R.fase === 'cli';
    if (daTela) {
      try {
        const r = await pedir(url, 'tela', 'POST', {});
        if (r.status !== 200) sai(`a volta à tela foi recusada: ${r.json.erro}`);
      } catch (e) {
        sai(`o servidor da grill-tela não respondeu (${e.code || e.message}); siga o grill no CLI`);
      }
    }
    if (!args.includes('--sem-navegador')) abrirNavegador(url);
    if (R) console.log(`Sessão ${path.basename(sessao, '.jsonl')} retomada na fase ${R.fase}, ${R.historico.length} rodada(s) respondida(s)${daTela ? ', de volta à tela' : ''}.`);
    return console.log(url);
  }

  if (cmd === 'historico') {
    const { porta, token, aviso } = await garantirServidor();
    if (aviso) console.log(aviso);
    const raiz = `http://127.0.0.1:${porta}/?t=${token}`;
    if (!args.includes('--sem-navegador')) abrirNavegador(raiz);
    return console.log(raiz);
  }

  // reabre um grill ou o historico, subindo o servidor se ele caiu; a porta segue a do servidor de agora
  if (cmd === 'abrir') {
    if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(args[0] || '')) sai('uso: grill-tela.js abrir <url de um grill ou do histórico> [--sem-navegador]');
    const { porta, aviso } = await garantirServidor();
    const alvo = args[0].replace(/^(http:\/\/127\.0\.0\.1:)\d+/, `$1${porta}`);
    if (aviso) console.log(aviso);
    if (!args.includes('--sem-navegador')) abrirNavegador(alvo);
    return console.log(alvo);
  }

  // o grill feito no terminal, gravado direto no disco: so na sessao em fase cli (a do terminal, ou a
  // da tela que voltou ao CLI), sem servidor; imprime a URL do grill. A da tela que o servidor caido
  // deixou fora do CLI (o cli do mod nao chegou a ele) vai ao terminal aqui: ninguem a segura na memoria
  if (cmd === 'registrar') {
    const projeto = opcao('--projeto');
    const fonte = projeto ? args[args.length - 1] : args[1];
    const m = projeto ? null : URL_DO_GRILL.exec(args[0] || '');
    if (!projeto && !m) sai('uso: grill-tela.js registrar <url | --projeto <nome> [--pedido <texto>]> <arquivo.json | ->');
    let corpo;
    try {
      corpo = JSON.parse(fs.readFileSync(fonte === '-' || !fonte ? 0 : fonte, 'utf8'));
    } catch (e) {
      sai(`registrar recusado: JSON ilegível (${e.message})`);
    }
    const erros = !corpo || !['terminal', 'sim'].includes(corpo.tipo) ? ['tipo: terminal ou sim']
      : corpo.tipo === 'sim' ? (corpo.documento === undefined || texto(corpo.documento) ? [] : ['documento: texto, se houver'])
        : errosDoTerminal(corpo);
    if (erros.length) sai(`registrar recusado:\n- ${erros.join('\n- ')}`);
    let sessao = null;
    try {
      if (m) sessao = path.join(pastaDoProjeto(decodeURIComponent(m[1])), `${m[2]}.jsonl`);
    } catch (e) {
      sai(`registrar recusado: URL ilegível (${e.message})`);
    }
    if (sessao && !fs.existsSync(sessao)) sai(`registrar recusado: nenhuma sessão em ${sessao}`);
    const R = sessao ? restaurar(lerSessao(sessao)) : { fase: 'cli', historico: [] };
    if (R.fase !== 'cli') {
      if (R.fase === 'concluido' || (await servidorNoAr(tokenDaMaquina()))) sai(`registrar recusado: a sessão está na fase ${R.fase}, não no terminal`);
      anotar(sessao, { tipo: 'cli' });
    }
    const arquivo = sessao || criarSessao(projeto, opcao('--pedido'), 'cli');
    if (corpo.tipo === 'sim') anotar(arquivo, { tipo: 'sim', adrs: [], ...(corpo.documento && { documento: corpo.documento.trim() }) });
    else {
      // o numero e o seguinte ao da ultima rodada respondida: a publicada que a pagina nao respondeu
      // fica fora da leitura, e a rodada seguinte da tela (o pelaTela do mod) vem depois das duas
      const n = 1 + Math.max(0, ...R.historico.map((x) => x.rodada.rodada));
      anotar(arquivo, { tipo: 'terminal', rodada: { rodada: n, questoes: corpo.questoes }, respostas: corpo.respostas });
    }
    const servidorVivo = lerJson(SERVIDOR);
    return console.log(urlDoGrill((servidorVivo && servidorVivo.porta) || PORTA, tokenDaMaquina(), arquivo));
  }

  const url = args[0];
  if (!url || !URL_DO_GRILL.test(url)) {
    sai('uso: grill-tela.js <iniciar|sessoes|historico|abrir|registrar|rodada|final|aguardar|cli> <url que o iniciar imprimiu> [arquivo.json | - | --ate <segundos>]');
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
