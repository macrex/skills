#!/usr/bin/env node
'use strict';
// Varre o que ENTRARIA no commit de um repositorio atras de segredo, antes do
// `git add -A` do /cpv. E a unica barreira quando o modo e bypassPermissions e
// os guards do harness nao estao instalados — por isso e script, deterministico,
// e nao um paragrafo pedindo ao modelo que "procure por senhas".
//
// O que conta como pendente: `git status --porcelain` (modificado, novo,
// renomeado, untracked fora do .gitignore). Apagado nao e lido. Binario e pulado
// pelo conteudo (mas o NOME ainda e conferido: um .pfx e segredo pelo nome).
//
// Uso:
//   node segredos.js <raiz do repo> [<raiz> ...] [--json]
//
// Saida: uma linha por achado (`arquivo:linha  motivo  trecho mascarado`) e
// exit 1 se houve algum; exit 0 limpo. --json: {"achados": [...]}.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// -------------------------------------------------------------- os padroes

// Pelo nome: o arquivo inteiro e segredo, seja qual for o conteudo.
const NOMES = [
  [/^\.env(\..+)?$/i, 'arquivo .env'],
  [/^id_(rsa|dsa|ecdsa|ed25519)$/i, 'chave privada SSH'],
  [/\.(pem|key|pfx|p12|keystore|jks)$/i, 'chave ou keystore'],
  [/^credentials\.json$/i, 'credentials.json'],
  [/^secrets?\.(json|ya?ml|toml|env|txt)$/i, 'arquivo de segredos'],
  [/^\.npmrc$/i, '.npmrc (pode carregar token)'],
  [/^\.netrc$/i, '.netrc'],
];
const NOMES_OK = [/\.env\.(example|sample|template|dist)$/i];

// Pelo conteudo: padroes com formato fixo (baixo falso-positivo) e as
// atribuicoes de senha/token com valor literal.
const CONTEUDO = [
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/, 'chave privada'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, 'GitHub fine-grained token'],
  [/\bgh[ousr]_[A-Za-z0-9]{36}\b/, 'GitHub token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/, 'Anthropic API key'],
  [/\bsk-(proj-|live_|test_)?[A-Za-z0-9]{20,}\b/, 'API key (sk-)'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, 'GitLab token'],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, 'SendGrid key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, 'JWT'],
  [/\b(postgres|postgresql|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^:\s/]+:[^@\s]+@/i, 'URL com senha'],
];

// Atribuicao com valor literal — o unico padrao que depende do contexto da
// linha, e por isso o unico que LINHA_OK desliga. Os de formato fixo acima
// valem em qualquer linha: uma chave privada num comentario continua sendo
// uma chave privada no repositorio.
const ATRIBUICAO = [
  // password = "algo", senha: 'algo', api_key=algo, token: "algo" — valor literal nao vazio
  [/\b(password|passwd|pwd|senha|api[_-]?key|apikey|secret|token|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*["'`]?(?!\s*["'`]?\s*$)(?!\$\{?)(?!<)(?!%)(?!\{\{)(?!process\.env)(?!os\.environ)(?!env\()(?!getenv)(?!None\b)(?!null\b)(?!nil\b)(?!true\b)(?!false\b)(?!\*{3,})(?!x{3,})(?!your[_-])(?!changeme)(?!example)(?!placeholder)(?!\.\.\.)[^\s"'`,;)]{4,}/i,
    'atribuicao de senha/token com valor literal'],
];

// Linhas onde uma atribuicao com valor literal e normal (nao um segredo).
const LINHA_OK = [
  /^\s*(#|\/\/|\*|--|<!--)/,                 // comentario
  /\b(example|sample|dummy|fake|test(e|s)?|mock|fixture|placeholder|redacted|xxx+|todo)\b/i,
  /\b(password|senha|token|secret|api[_-]?key)\b\s*[:=]\s*["'`]?(\$\{?[A-Z_]+\}?|\{\{.*\}\}|<[^>]+>|%[^%]+%)/i,
  /\btype\s*[:=]\s*["']?password\b/i,        // <input type="password">, schema type: password
  /\b(password|senha|token|secret)\s*[:=]\s*["'`]?\s*["'`]?\s*$/i, // valor vazio
];

const MAX_BYTES = 2 * 1024 * 1024;  // arquivo maior que isto nao e fonte: pula o conteudo
const PULAR_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz',
  '.tgz', '.jar', '.class', '.so', '.dll', '.exe', '.bin', '.woff', '.woff2', '.ttf', '.mp3',
  '.mp4', '.lock']);

// ------------------------------------------------------------- utilidades

function git(raiz, ...cmd) {
  try {
    return execFileSync('git', ['-C', raiz, ...cmd], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

// Caminhos (relativos a raiz) que `git add -A` levaria: tudo do porcelain menos
// os apagados. Renomeado `R a -> b` vira `b`. Untracked ignorado pelo .gitignore
// nao aparece, e e isso mesmo: ele nao entraria no commit.
function pendentes(raiz) {
  const saida = git(raiz, 'status', '--porcelain', '-z', '--untracked-files=all');
  if (saida === null) return null;
  const itens = saida.split('\0');
  const lista = [];
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    if (!it) continue;
    const xy = it.slice(0, 2), caminho = it.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') { lista.push(caminho); i++; continue; }  // -z: origem vem a seguir
    if (xy.includes('D') && !xy.includes('M') && !xy.includes('A')) continue;
    lista.push(caminho);
  }
  return lista;
}

function ehBinario(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function mascarar(trecho) {
  const t = trecho.trim().replace(/\s+/g, ' ');
  if (t.length <= 12) return t.slice(0, 4) + '…';
  return t.slice(0, 8) + '…' + t.slice(-4);
}

// --------------------------------------------------------------- a varredura

function varrerArquivo(raiz, rel) {
  const achados = [];
  const nome = path.basename(rel);
  if (!NOMES_OK.some((re) => re.test(nome))) {
    for (const [re, motivo] of NOMES) {
      if (re.test(nome)) { achados.push({ arquivo: rel, linha: 0, motivo, trecho: nome }); break; }
    }
  }
  if (PULAR_EXT.has(path.extname(nome).toLowerCase())) return achados;
  const abs = path.join(raiz, rel);
  let buf;
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > MAX_BYTES) return achados;
    buf = fs.readFileSync(abs);
  } catch {
    return achados;
  }
  if (ehBinario(buf)) return achados;
  const linhas = buf.toString('utf8').split(/\r?\n/);
  linhas.forEach((linha, i) => {
    const padroes = LINHA_OK.some((re) => re.test(linha)) ? CONTEUDO : CONTEUDO.concat(ATRIBUICAO);
    for (const [re, motivo] of padroes) {
      const m = re.exec(linha);
      if (m) { achados.push({ arquivo: rel, linha: i + 1, motivo, trecho: mascarar(m[0]) }); break; }
    }
  });
  return achados;
}

function varrerRepo(raiz) {
  const lista = pendentes(raiz);
  if (lista === null) return { raiz, erro: 'nao e um repositorio git (ou git ausente)', achados: [] };
  const achados = [];
  for (const rel of lista) achados.push(...varrerArquivo(raiz, rel));
  return { raiz, arquivos: lista.length, achados };
}

// --------------------------------------------------------------------- main

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const raizes = argv.filter((a) => a !== '--json').map((a) => path.resolve(a));
  if (!raizes.length) {
    process.stderr.write('uso: node segredos.js <raiz do repo> [...] [--json]\n');
    process.exit(2);
  }
  const repos = raizes.map(varrerRepo);
  const total = repos.reduce((n, r) => n + r.achados.length, 0);
  if (json) {
    process.stdout.write(JSON.stringify({ repos, total }, null, 2) + '\n');
  } else {
    for (const r of repos) {
      if (r.erro) { process.stdout.write(`${r.raiz}: ${r.erro}\n`); continue; }
      process.stdout.write(`${r.raiz}: ${r.arquivos} arquivo(s) pendente(s), ${r.achados.length} achado(s)\n`);
      for (const a of r.achados) {
        process.stdout.write(`  ${a.arquivo}:${a.linha || '-'}  ${a.motivo}  ${a.trecho}\n`);
      }
    }
    process.stdout.write(total ? `\nSEGREDO: ${total} achado(s). Nao commite antes de resolver.\n`
                               : '\nLIMPO: nenhum segredo no que entraria no commit.\n');
  }
  process.exit(total ? 1 : 0);
}

if (require.main === module) main();
module.exports = { varrerArquivo, pendentes, CONTEUDO, ATRIBUICAO, NOMES };
