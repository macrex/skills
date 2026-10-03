#!/usr/bin/env node
// Autoteste da extensao grill-canal do Pi.
//
//   node --experimental-strip-types extensions/teste-grill-canal.mjs
//
// Como no teste da vault-docs, o seam e a factory default: um `pi` de mentira registra os
// handlers. Sem GRILL_TELA (ou com 0) nada e registrado; com GRILL_TELA=1 o before_agent_start
// poe a regra do hook na secao grill-canal, sem tags (o Pi as poe), e um evento sem
// systemPromptOptions passa sem erro.
// E `.mjs` de proposito: a pasta `extensions/` carrega `.ts` e `.js` como extensao.

import assert from 'node:assert';

import criarExtensao from './grill-canal.ts';
import grillCanal from '../hooks/grill-canal.js';

function carregar(valor) {
  if (valor === undefined) delete process.env.GRILL_TELA;
  else process.env.GRILL_TELA = valor;
  const handlers = new Map();
  criarExtensao({ on: (evento, handler) => handlers.set(evento, handler) });
  return handlers;
}

assert.strictEqual(carregar(undefined).size, 0, 'sem GRILL_TELA, nada registrado');
assert.strictEqual(carregar('0').size, 0, 'GRILL_TELA=0, nada registrado');

const handlers = carregar('1');
assert.deepStrictEqual([...handlers.keys()], ['before_agent_start']);
const evento = { systemPromptOptions: { sections: { outra: 'x' } } };
await handlers.get('before_agent_start')(evento);
const regra = evento.systemPromptOptions.sections['grill-canal'];
assert.strictEqual(regra, grillCanal.REGRA);
assert.match(regra, /grill-tela/);
assert.ok(!regra.includes('<grill-canal>'), 'sem a tag: o Pi a poe');
assert.strictEqual(evento.systemPromptOptions.sections.outra, 'x', 'as outras secoes ficam');
await handlers.get('before_agent_start')({});

console.log('extensao grill-canal ok: desligada sem GRILL_TELA, e com ela a regra do hook entra no system prompt do Pi');
