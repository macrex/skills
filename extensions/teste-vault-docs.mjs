#!/usr/bin/env node
// Autoteste da extensao vault-docs do Pi.
//
//   node --experimental-strip-types extensions/teste-vault-docs.mjs
//
// O Pi nao e instalado nem executado aqui: o seam e a factory default da extensao,
// que e tudo que o Pi usa dela. Este arquivo monta um `pi` de mentira com a mesma
// superficie (registerTool, on, ctx.ui.notify) e um vault temporario de verdade, e
// afirma o que o Pi veria — quantas ferramentas foram registradas e com que nome, o
// que uma chamada devolve, o que ficou no system prompt e se o Python morreu.
//
// E `.mjs` de proposito: a pasta `extensions/` carrega `.ts` e `.js` como extensao,
// e o teste nao pode virar uma.

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import criarExtensao from './vault-docs.ts';

const PREFIXO = 'mcp__vault-docs__';
const FERRAMENTAS = [
  'visao_geral', 'contexto_projeto', 'buscar', 'listar_notas', 'ler_nota', 'conexoes', 'salvar_nota',
  'atualizar_nota', 'renomear_nota', 'dividir_nota', 'sincronizar', 'validar', 'mapa_codigo',
  'consultar_codigo', 'gerar_mapa',
];

function piDeMentira() {
  const ferramentas = new Map();
  const handlers = new Map();
  const avisos = [];
  return {
    ferramentas,
    avisos,
    registerTool(definicao) {
      ferramentas.set(definicao.name, definicao);
    },
    on(evento, handler) {
      handlers.set(evento, [...(handlers.get(evento) || []), handler]);
    },
    // devolve o evento (que os handlers podem ter mutado) e o que cada um retornou
    async disparar(evento, corpo = {}) {
      const ctx = { ui: { notify: (mensagem, tipo) => avisos.push({ mensagem, tipo }) } };
      const retornos = [];
      for (const handler of handlers.get(evento) || []) retornos.push(await handler(corpo, ctx));
      return { evento: corpo, retornos };
    },
  };
}

// Orfao de servidor so se checa onde ha `ps`; no Windows a checagem seria outra
// ferramenta e outro parser, e o que ela provaria ja esta coberto pela chamada que
// falha depois do shutdown.
function pidsDoServidor() {
  if (process.platform === 'win32') return null;
  try {
    const saida = execFileSync('ps', ['-A', '-o', 'pid=,args='], { encoding: 'utf8' });
    return saida
      .split('\n')
      .filter((linha) => linha.includes('servidor_vault.py'))
      .map((linha) => Number(linha.trim().split(/\s+/)[0]));
  } catch {
    return null;
  }
}

async function esperar(condicao, limiteMs = 3000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (condicao()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return condicao();
}

// ---------- 1. sem OBSIDIAN_VAULT: silencio completo ----------

delete process.env.OBSIDIAN_VAULT;
const semVault = piDeMentira();
await criarExtensao(semVault);

assert.equal(semVault.ferramentas.size, 0, 'sem OBSIDIAN_VAULT nenhuma ferramenta pode ser registrada');
await semVault.disparar('session_start');
assert.equal(semVault.avisos.length, 1, 'o aviso e unico');
assert.equal(semVault.avisos[0].tipo, 'warning');
assert.match(semVault.avisos[0].mensagem, /OBSIDIAN_VAULT/);

const semSecao = await semVault.disparar('before_agent_start', { systemPromptOptions: { sections: {} } });
assert.deepEqual(semSecao.evento.systemPromptOptions.sections, {}, 'sem vault, nenhuma secao entra no system prompt');
console.log('ok: sem OBSIDIAN_VAULT, zero ferramentas, um aviso e nenhuma secao');

// ---------- 2. com vault: as 12 ferramentas ----------

const vault = mkdtempSync(join(tmpdir(), 'vault-docs-teste-'));
const pidsAntes = pidsDoServidor();
process.env.OBSIDIAN_VAULT = vault;

const pi = piDeMentira();
await criarExtensao(pi);

assert.deepEqual(
  [...pi.ferramentas.keys()].sort(),
  FERRAMENTAS.map((nome) => PREFIXO + nome).sort(),
  'as 15 ferramentas do servidor entram com o prefixo da rota CLI',
);
assert.equal(pi.avisos.length, 0, 'com vault valido a extensao nao avisa nada');
const salvar = pi.ferramentas.get(PREFIXO + 'salvar_nota');
assert.equal(salvar.label, 'salvar_nota', 'o label e o nome nu da ferramenta');
assert.ok(salvar.description.length > 0, 'a descricao vem do servidor');
assert.equal(salvar.parameters.type, 'object', 'o esquema vem do servidor, cru');
assert.ok(salvar.parameters.properties.projeto, 'o esquema do servidor chega inteiro');
console.log('ok: 15 ferramentas mcp__vault-docs__*, com descricao e esquema do servidor');

// ---------- 3. chamada com argumentos, ida e volta ----------

const resultado = await salvar.execute('chamada-1', {
  projeto: 'projeto-teste',
  tipo: 'spec',
  titulo: 'Nota de teste',
  corpo: 'Conteudo gravado pelo autoteste da extensao.',
  resumo: 'nota criada pelo autoteste',
  data: '2026-01-01',
  descricao_projeto: 'projeto temporario do autoteste',
});
assert.match(resultado.content[0].text, /Salva/, 'salvar_nota responde com a confirmacao do servidor');

const ler = pi.ferramentas.get(PREFIXO + 'ler_nota');
const lida = await ler.execute('chamada-2', { nota: '2026-01-01 Nota de teste' });
assert.match(lida.content[0].text, /Conteudo gravado pelo autoteste da extensao\./, 'ler_nota devolve o que salvar_nota gravou');
console.log('ok: tools/call com argumentos — salvar_nota grava e ler_nota le de volta');

// ---------- 4. falha do servidor vira erro de ferramenta ----------

// `ler_nota` numa nota ausente devolve orientacao, nao falha — de proposito. O que o
// servidor marca com isError e a recusa: aqui, editar uma nota que nao existe.
const atualizar = pi.ferramentas.get(PREFIXO + 'atualizar_nota');
await assert.rejects(
  () => atualizar.execute('chamada-3', { nota: 'nota que nao existe', corpo: 'x' }),
  /nota nao encontrada/i,
  'o que o servidor marca como falha e lancado, nao devolvido como resultado valido',
);
console.log('ok: isError do servidor vira erro de ferramenta para o modelo');

// ---------- 5. as regras entram como secao do system prompt ----------

const comSecao = await pi.disparar('before_agent_start', { systemPromptOptions: { sections: {} } });
const secao = comSecao.evento.systemPromptOptions.sections['vault-obsidian'];
assert.ok(secao, 'a secao vault-obsidian entra pelo systemPromptOptions');
assert.ok(!secao.includes('<vault-obsidian>'), 'a tag de abertura sai: o Pi embrulha a secao');
assert.ok(!secao.includes('</vault-obsidian>'), 'a tag de fechamento sai');
assert.match(secao, /O vault e a memoria dos projetos/, 'o texto e o mesmo do hook do Claude Code');
assert.match(secao, /mcp__vault-docs__\*/, 'os prefixos de ferramenta continuam no texto');
for (const retorno of comSecao.retornos) {
  assert.ok(!retorno || retorno.systemPrompt === undefined, 'a extensao nao substitui o system prompt da rodada');
  assert.ok(!retorno || retorno.forceSystemPrompt === undefined, 'nem forca um prompt inteiro');
}
console.log('ok: before_agent_start grava a secao vault-obsidian sem tocar no resto do prompt');

// ---------- 6. o shutdown encerra o Python ----------

await pi.disparar('session_shutdown');
await assert.rejects(
  () => ler.execute('chamada-4', { nota: '2026-01-01 Nota de teste' }),
  'depois do session_shutdown nenhuma chamada e atendida',
);

const pidsDepois = pidsDoServidor();
if (pidsAntes && pidsDepois) {
  const orfaos = () => (pidsDoServidor() || []).filter((pid) => !pidsAntes.includes(pid));
  await esperar(() => orfaos().length === 0);
  assert.deepEqual(orfaos(), [], 'nenhum servidor do vault fica orfao depois do shutdown');
}
console.log('ok: session_shutdown encerra o servidor e nao deixa processo orfao');

rmSync(vault, { recursive: true, force: true });
console.log('\ntudo ok');
