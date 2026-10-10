#!/usr/bin/env node
'use strict';
// Acha as seis skills do Matt Pocock que o /faz encadeia, nas raizes em que o
// harness corrente as carrega, e imprime por skill o caminho e o nome pelo qual o
// harness a chama. Roda igual em win/mac/linux, sem dependencia.
//
//   node skills-do-matt.js [--json]
//   node skills-do-matt.js --linha <documento>
//
// Com --linha imprime o prompt da leva pronto para colar.
//
// Sai 1 quando falta alguma: e o portao do movimento 1.
//
// Imprime tambem o nome pelo qual o harness chama a propria faz: instalada pelo
// plugin do Claude Code ela vira `<plugin>:faz`, e a abertura da leva tem de digitar
// esse nome, porque a skill reservada so e liberada quando o nome chamado bate com o
// token que o usuario digitou.
//
// O harness sai do ambiente que a ferramenta de shell dele exporta: CLAUDECODE no
// Claude Code, PI_SESSION_ID no Pi. Codex e Antigravity nao exportam nada que os
// distinga e caem em "outro", que olha as pastas privadas dos dois e as do padrao
// Agent Skills.

const fs = require('fs');
const os = require('os');
const path = require('path');

const SKILLS = ['grilling', 'domain-modeling', 'to-spec', 'to-tickets', 'implement', 'code-review'];

// Raizes por harness, na ordem em que ele mesmo resolve colisao (a primeira ganha),
// com o prefixo que o nome da skill leva quando vem dali. `*` casa um nivel de pasta
// (a versao do plugin, a categoria engineering/productivity do repositorio do Matt).
function raizes(harness, casa) {
  const h = (...p) => path.join(casa, ...p);
  return {
    'claude-code': [
      ['.claude/skills', ''],
      [h('.claude', 'skills'), ''],
      [h('.claude', 'plugins', 'cache', '*', 'mattpocock-skills', '*', 'skills', '*'), 'mattpocock-skills:'],
      ['.agents/skills', ''],
      [h('.agents', 'skills'), ''],
    ],
    pi: [
      [h('.pi', 'agent', 'skills'), ''],
      [h('.agents', 'skills'), ''],
      ['.pi/skills', ''],
      ['.agents/skills', ''],
      [h('.pi', 'agent', 'git', 'github.com', 'mattpocock', 'skills', 'skills', '*'), ''],
    ],
    // O Codex le SKILL.md em subpasta: o README manda clonar o repositorio do Matt em
    // ~/.codex/skills, e as skills ficam em <clone>/skills/<categoria>/. O CLI do
    // Antigravity so le skill direto na pasta dele, e o README manda copiar.
    outro: [
      ['.agents/skills', ''],
      [h('.agents', 'skills'), ''],
      [h('.codex', 'skills'), ''],
      [h('.codex', 'skills', '*', 'skills', '*'), ''],
      [h('.gemini', 'config', 'skills'), ''],
    ],
  }[harness];
}

// O Pi primeiro: aberto de dentro de uma sessao do Claude Code ele herda CLAUDECODE,
// e PI_SESSION_ID so existe no bash do proprio Pi.
function harnessCorrente(env) {
  if (env.PI_SESSION_ID) return 'pi';
  if (env.CLAUDECODE) return 'claude-code';
  return 'outro';
}

// Expande os `*` de um padrao em pastas existentes. Cada `*` vira as subpastas,
// em ordem decrescente: entre duas versoes do plugin em cache, a mais nova primeiro.
// ponytail: ordem lexica, nao semver; 1.10.0 perde de 1.9.0 ate alguem se importar.
function expandir(padrao) {
  const { root } = path.parse(padrao);
  let atuais = [root];
  for (const parte of padrao.slice(root.length).split(/[\\/]+/)) {
    const proximos = [];
    for (const dir of atuais) {
      if (parte !== '*') {
        proximos.push(path.join(dir, parte));
        continue;
      }
      let filhos;
      try {
        filhos = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      filhos
        .filter((f) => f.isDirectory())
        .map((f) => f.name)
        .sort()
        .reverse()
        .forEach((nome) => proximos.push(path.join(dir, nome)));
    }
    atuais = proximos;
  }
  return atuais.filter((dir) => fs.existsSync(dir));
}

function localizar(harness, casa, cwd) {
  const candidatas = raizes(harness, casa).flatMap(([padrao, prefixo]) =>
    expandir(path.isAbsolute(padrao) ? padrao : path.join(cwd, padrao)).map((dir) => [dir, prefixo]),
  );
  return SKILLS.map((skill) => {
    for (const [dir, prefixo] of candidatas) {
      const pasta = path.join(dir, skill);
      if (fs.existsSync(path.join(pasta, 'SKILL.md'))) return { skill, caminho: pasta, nome: prefixo + skill };
    }
    return { skill, caminho: null, nome: null };
  });
}

// O plugin que carrega esta skill da o prefixo: a raiz dele, acima de skills/, tem o
// .claude-plugin/plugin.json, no cache do Claude Code ou numa pasta de marketplace local.
// Instalada sem plugin, a faz se chama so `faz`.
function nomeDaFaz(pasta) {
  try {
    const { name } = JSON.parse(fs.readFileSync(path.join(pasta, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8'));
    if (name) return `${name}:${path.basename(pasta)}`;
  } catch {}
  return path.basename(pasta);
}

// A linha da leva pronta, para o agente imprimir como sai: modelo preenchido por um agente fraco
// troca a abertura e tira o prefixo dos nomes. Cada nome de skill abre uma linha, para a quebra
// que o terminal faz na linha longa nunca o partir na copia. So o Claude Code tem a abertura aqui;
// nos outros harnesses ela fica `<abertura>`, para o agente trocar pela da referencia dele. Os
// modelos dos agentes nao vao na linha: so o Claude Code aceita modelo por sub-agente, e la eles
// sao perguntados junto com o modo do implement, com os tickets na mesa.
function linhaDaLeva(harness, faz, nome, documento) {
  const claude = harness === 'claude-code';
  const abertura = claude ? `rode /${faz} leva ${documento}` : '<abertura>';
  return [
    `${abertura} até o fim.`,
    'O documento é o entendimento já fechado comigo e o insumo',
    'desta leva. Ela está fechada quando:',
    `/${nome['to-spec']} expandiu esse documento in-place;`,
    `/${nome['to-tickets']} publicou os tickets;`,
    `/${nome.implement} rodou no modo que eu escolhi;`,
    'antes de executá-lo, me proponha os modos que este harness',
    ...(claude
      ? ['tem (inline, sub-agents, workflow) e a sua recomendação,', 'e me pergunte junto os modelos dos agentes;']
      : ['tem (inline, sub-agents, workflow) e a sua recomendação;']),
    `/${nome['code-review']} revisou em dois eixos;`,
    'todas as correções foram aplicadas,',
    'o teste de qualidade passou e você me garantiu que está',
    'tudo funcionando, sem commitar nada.',
  ].join('\n');
}

function main() {
  const json = process.argv.includes('--json');
  const harness = harnessCorrente(process.env);
  const skills = localizar(harness, os.homedir(), process.cwd());
  const faltam = skills.filter((s) => !s.caminho).map((s) => s.skill);
  // o caminho como foi chamado, nao o real: a faz ligada por link fora de um plugin e so `faz`
  const pasta = path.dirname(path.dirname(process.argv[1]));
  const faz = nomeDaFaz(pasta);
  const pedeLinha = process.argv.indexOf('--linha');
  if (pedeLinha > 0) {
    const documento = process.argv[pedeLinha + 1];
    if (!documento || faltam.length) {
      process.stderr.write(faltam.length ? `faltam ${faltam.join(', ')}\n` : 'uso: --linha <documento>\n');
      process.exit(1);
    }
    const nome = Object.fromEntries(skills.map((s) => [s.skill, s.nome]));
    process.stdout.write(linhaDaLeva(harness, faz, nome, documento) + '\n');
    process.exit(0);
  }
  if (json) {
    process.stdout.write(JSON.stringify({ harness, faz, skills, faltam }, null, 2) + '\n');
  } else {
    // no Claude Code a skill se invoca pelo nome; o caminho so serve a quem cumpre o SKILL.md lendo-o
    const coluna = (nome, caminho) => (harness === 'claude-code' ? nome : `${nome.padEnd(34)} ${caminho}`);
    const linhas = [`harness: ${harness}`, `${'faz'.padEnd(16)} ${coluna(faz, pasta)}`];
    for (const s of skills) linhas.push(`${s.skill.padEnd(16)} ${s.caminho ? coluna(s.nome, s.caminho) : 'FALTA'}`);
    if (faltam.length) linhas.push(`faltam ${faltam.length}: ${faltam.join(', ')}`);
    process.stdout.write(linhas.join('\n') + '\n');
  }
  process.exit(faltam.length ? 1 : 0);
}

main();
