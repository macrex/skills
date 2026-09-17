#!/usr/bin/env node
'use strict';
// Descobre QUAIS repositorios git esta leva mexeu, para o /cpv fechar todos e
// nao so o do cwd. Roda igual em win/mac/linux, sem dependencia.
//
// Duas fontes, com pesos DIFERENTES:
//   1. o TRANSCRIPT da sessao — todo file_path de Edit/Write/NotebookEdit. E a
//      unica fonte que sabe o que ESTA leva tocou, inclusive repo fora do cwd
//      (o caso que motivou isto: sessao aberta na pasta-pai). Vira ALVO;
//   2. a VARREDURA do cwd — repos sujos ate 2 niveis abaixo. Vira alvo SO o
//      repo que contem o cwd; o resto sai como vizinho, para o comando ver e
//      nao tocar.
//
// A separacao nao e detalhe. Numa sessao aberta em D:\workspace a varredura
// acha 18 repos sujos de trabalho antigo — tratar todos como leva seria um
// `git add -A` em cada um deles.
//
// Uso:
//   node repos-da-leva.js [--cwd <dir>] [--sessao <id>] [--json]
//
// Sem --sessao usa CLAUDE_CODE_SESSION_ID. Sem transcript, so a varredura.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PROFUNDIDADE = 2;        // niveis abaixo do cwd na varredura
const TETO_DIRS = 400;         // diretorios visitados, para nao varrer um HD
const PULAR = new Set([
  'node_modules', '.git', '.pio', '.venv', 'venv', '__pycache__', 'dist',
  'build', 'target', 'vendor', '.next', '.cache',
]);

// ---------------------------------------------------------------- argumentos

function args(argv) {
  const out = { cwd: process.cwd(), sessao: process.env.CLAUDE_CODE_SESSION_ID, json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--cwd') out.cwd = argv[++i];
    else if (argv[i] === '--sessao') out.sessao = argv[++i];
    else if (argv[i] === '--json') out.json = true;
  }
  return out;
}

// ------------------------------------------------------------------ git puro

function git(raiz, ...cmd) {
  try {
    return execFileSync('git', ['-C', raiz, ...cmd], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// A raiz do repo que contem `alvo`, ou null. Sobe procurando `.git` em vez de
// chamar `git rev-parse` por arquivo: um transcript traz centenas de caminhos e
// quase todos caem no mesmo repo.
function raizDe(alvo) {
  let dir = alvo;
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  } catch {
    dir = path.dirname(dir);
  }
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const acima = path.dirname(dir);
    if (acima === dir) return null;
    dir = acima;
  }
  return null;
}

// ------------------------------------------------------------- o transcript

// O jsonl da sessao mora em ~/.claude/projects/<slug do cwd>/<id>.jsonl, e o
// slug depende de onde a sessao abriu — entao procura pelo NOME do arquivo em
// todos os projetos, que e o que nao muda.
function acharTranscript(sessao) {
  if (!sessao) return null;
  const base = path.join(os.homedir(), '.claude', 'projects');
  let projetos;
  try {
    projetos = fs.readdirSync(base);
  } catch {
    return null;
  }
  for (const p of projetos) {
    const arq = path.join(base, p, `${sessao}.jsonl`);
    if (fs.existsSync(arq)) return arq;
  }
  return null;
}

// Todo caminho de arquivo que a sessao ESCREVEU: so o `input` das ferramentas
// de escrita conta. `Read` usa o mesmo campo `file_path`, e um repo apenas lido
// nao pode virar alvo de `git add -A`. Sao megabytes, entao so as linhas que
// citam o campo passam pelo JSON.parse.
const ESCREVEM = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

function caminhosEscritos(transcript) {
  let texto;
  try {
    texto = fs.readFileSync(transcript, 'utf8');
  } catch {
    return [];
  }
  const achados = new Set();
  for (const linha of texto.split('\n')) {
    if (!linha.includes('"file_path"') && !linha.includes('"notebook_path"')) continue;
    let registro;
    try {
      registro = JSON.parse(linha);
    } catch {
      continue;                       // linha truncada: ignora
    }
    const blocos = registro.message && Array.isArray(registro.message.content) ? registro.message.content : [];
    for (const b of blocos) {
      if (b.type !== 'tool_use' || !ESCREVEM.has(b.name) || !b.input) continue;
      const alvo = b.input.file_path || b.input.notebook_path;
      if (alvo) achados.add(alvo);
    }
  }
  return [...achados];
}

// -------------------------------------------------------------- a varredura

function varrer(cwd) {
  const repos = new Set();
  let visitados = 0;
  const fila = [[cwd, 0]];
  while (fila.length) {
    const [dir, nivel] = fila.shift();
    if (++visitados > TETO_DIRS) break;
    if (fs.existsSync(path.join(dir, '.git'))) {
      repos.add(dir);
      continue;                       // repo achado: nao desce (submodulo e outro assunto)
    }
    if (nivel >= PROFUNDIDADE) continue;
    let filhos;
    try {
      filhos = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of filhos) {
      if (!f.isDirectory() || PULAR.has(f.name) || f.name.startsWith('.')) continue;
      fila.push([path.join(dir, f.name), nivel + 1]);
    }
  }
  return [...repos];
}

// ------------------------------------------------------------------ o estado

// O vault Obsidian nunca entra na leva: a skill obsidian-docs ja o commita
// sozinha. Marcadores: a pasta .obsidian na raiz, a variavel OBSIDIAN_VAULT da
// skill, ou o sufixo obsidian/projetos do layout original.
function ehVault(raiz) {
  const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  return fs.existsSync(path.join(raiz, '.obsidian'))
    || (!!process.env.OBSIDIAN_VAULT && norm(process.env.OBSIDIAN_VAULT) === norm(raiz))
    || norm(raiz).endsWith('obsidian/projetos');
}

function estado(raiz, origens, raizDoCwd) {
  const porcelain = git(raiz, 'status', '--porcelain') ?? '';
  const pendentes = porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [];
  // `rev-parse` diz "HEAD" quando destacado (o comando precisa disso), mas
  // falha em repo sem nenhum commit; ai `branch --show-current` ainda responde,
  // e o repo entra na lista marcado em vez de sumir dela.
  const branch = git(raiz, 'rev-parse', '--abbrev-ref', 'HEAD') ?? git(raiz, 'branch', '--show-current');
  const upstream = git(raiz, 'rev-parse', '--abbrev-ref', '@{u}');
  const ahead = upstream ? Number(git(raiz, 'rev-list', '--count', '@{u}..HEAD') ?? 0) : null;
  const remoto = git(raiz, 'remote', 'get-url', 'origin');
  return {
    raiz, origens: [...origens].sort(), branch, upstream, ahead, remoto, pendentes,
    vault: ehVault(raiz),
    doCwd: raiz === raizDoCwd,
    semCommit: git(raiz, 'rev-parse', '--verify', 'HEAD') === null,
    // "Nada a fazer" e limpo E em dia. Limpo mas adiantado ainda pede push, que
    // e metade do que o /cpv promete.
    parado: pendentes.length === 0 && (ahead === 0 || ahead === null && !remoto),
  };
}

// -------------------------------------------------------------------- saida

function texto(repos, info) {
  const linhas = [];
  // Alvo: o que a sessao tocou — mesmo limpo e em dia, porque a leva pode ter
  // sido commitada antes (por outra sessao, ou por um /cpv que parou no meio) e
  // a nota do vault continua faltando —, mais o repo do proprio cwd quando tem
  // o que fechar.
  const fazer = repos.filter((r) => !r.vault && (r.origens.includes('sessao') || (r.doCwd && !r.parado)));
  const vizinhos = repos.filter((r) => !fazer.includes(r) && !r.vault && !r.parado);
  const pular = repos.filter((r) => !fazer.includes(r) && !vizinhos.includes(r));

  linhas.push(`Sessao: ${info.sessao || '(sem id)'} | transcript: ${info.transcript || 'nao encontrado'}`);
  linhas.push(`cwd: ${info.cwd}`);
  linhas.push('');
  linhas.push(`REPOSITORIOS DA LEVA (${fazer.length})`);
  if (!fazer.length) linhas.push('  (nenhum com mudanca pendente)');

  fazer.forEach((r, i) => {
    const ahead = r.ahead === null ? 'sem upstream' : `ahead ${r.ahead}`;
    linhas.push('');
    linhas.push(`[${i + 1}] ${r.raiz}   (${r.origens.join('+')})`);
    linhas.push(`    branch ${r.branch} | ${ahead} | ${r.pendentes.length} pendente(s)` +
                (r.semCommit ? ' | SEM NENHUM COMMIT' : '') +
                (r.parado ? ' | NADA A COMMITAR (so o vault)' : ''));
    linhas.push(`    origin: ${r.remoto || '(sem remoto)'}`);
    for (const p of r.pendentes.slice(0, 40)) linhas.push(`      ${p}`);
    if (r.pendentes.length > 40) linhas.push(`      ... e mais ${r.pendentes.length - 40}`);
  });

  if (vizinhos.length) {
    linhas.push('');
    linhas.push(`NAO INCLUIDOS — tem mudanca pendente, mas esta sessao nao os tocou (${vizinhos.length})`);
    for (const r of vizinhos) {
      const adiantado = r.ahead ? `, ${r.ahead} commit(s) sem push` : '';
      linhas.push(`  ${r.raiz} — ${r.pendentes.length} pendente(s)${adiantado}, branch ${r.branch}`);
    }
    linhas.push('  Nao commite nenhum destes. E trabalho de outra leva; so entra por ordem expressa.');
  }

  if (pular.length) {
    linhas.push('');
    linhas.push('IGNORADOS');
    for (const r of pular) {
      const motivo = r.vault ? 'vault Obsidian (a skill obsidian-docs ja commita sozinha)'
                             : 'sem mudanca pendente e em dia com o remoto';
      linhas.push(`  ${r.raiz} — ${motivo}`);
    }
  }
  return linhas.join('\n');
}

// --------------------------------------------------------------------- main

function main() {
  const a = args(process.argv);
  const cwd = path.resolve(a.cwd);
  const transcript = acharTranscript(a.sessao);

  const origens = new Map();          // raiz -> Set('sessao' | 'varredura')
  const marcar = (raiz, origem) => {
    if (!raiz) return;
    const chave = path.resolve(raiz);
    if (!origens.has(chave)) origens.set(chave, new Set());
    origens.get(chave).add(origem);
  };

  if (transcript) {
    const jaVisto = new Map();        // dir -> raiz, para nao subir a arvore duas vezes
    for (const alvo of caminhosEscritos(transcript)) {
      const dir = path.dirname(alvo);
      if (!jaVisto.has(dir)) jaVisto.set(dir, raizDe(alvo));
      marcar(jaVisto.get(dir), 'sessao');
    }
  }
  for (const raiz of varrer(cwd)) marcar(raiz, 'varredura');

  const raizDoCwd = raizDe(cwd);
  const repos = [...origens.entries()]
    .map(([raiz, o]) => estado(raiz, o, raizDoCwd && path.resolve(raizDoCwd)))
    .filter((r) => r.branch !== null)   // .git existe mas nao e repo utilizavel
    .sort((x, y) => {
      const peso = (r) => (r.origens.includes('sessao') ? 0 : 1);
      return peso(x) - peso(y) || x.raiz.localeCompare(y.raiz);
    });

  const info = { sessao: a.sessao, transcript, cwd };
  process.stdout.write(a.json ? JSON.stringify({ info, repos }, null, 2) : texto(repos, info));
  process.stdout.write('\n');
}

main();
