#!/usr/bin/env node
'use strict';
// Acha as seis skills do Matt Pocock que o /faz encadeia, nas raizes em que o
// harness corrente as carrega, e imprime por skill o caminho e o nome pelo qual o
// harness a chama. Roda igual em win/mac/linux, sem dependencia.
//
//   node skills-do-matt.js [--json]
//
// Sai 1 quando falta alguma: e o portao do movimento 1.
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
      [h('.gemini', 'antigravity-cli', 'skills'), ''],
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
  const partes = padrao.split(/[\\/]+/);
  let atuais = [partes[0] === '' ? path.sep : partes[0] + (partes[0].endsWith(':') ? path.sep : '')];
  for (const parte of partes.slice(1)) {
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

function main() {
  const json = process.argv.includes('--json');
  const harness = harnessCorrente(process.env);
  const skills = localizar(harness, os.homedir(), process.cwd());
  const faltam = skills.filter((s) => !s.caminho).map((s) => s.skill);
  if (json) {
    process.stdout.write(JSON.stringify({ harness, skills, faltam }, null, 2) + '\n');
  } else {
    const linhas = [`harness: ${harness}`];
    for (const s of skills) {
      linhas.push(s.caminho ? `${s.skill.padEnd(16)} ${s.nome.padEnd(34)} ${s.caminho}` : `${s.skill.padEnd(16)} FALTA`);
    }
    if (faltam.length) linhas.push(`faltam ${faltam.length}: ${faltam.join(', ')}`);
    process.stdout.write(linhas.join('\n') + '\n');
  }
  process.exit(faltam.length ? 1 : 0);
}

main();
