#!/usr/bin/env node
// Autoteste da extensao grill-canal do Pi.
//
//   node --experimental-strip-types extensions/teste-grill-canal.mjs
//
// Como no teste da vault-docs, o seam e a factory default: um `pi` de mentira dispara o
// before_agent_start e o teste afirma que a regra do hook entrou na secao grill-canal, sem
// tags (o Pi as poe), e que um evento sem systemPromptOptions passa sem erro.
// E `.mjs` de proposito: a pasta `extensions/` carrega `.ts` e `.js` como extensao.

import assert from 'node:assert';

import criarExtensao from './grill-canal.ts';
import grillCanal from '../hooks/grill-canal.js';

const handlers = new Map();
criarExtensao({ on: (evento, handler) => handlers.set(evento, handler) });
assert.deepStrictEqual([...handlers.keys()], ['before_agent_start']);

const evento = { systemPromptOptions: { sections: { outra: 'x' } } };
await handlers.get('before_agent_start')(evento);
const regra = evento.systemPromptOptions.sections['grill-canal'];
assert.strictEqual(regra, grillCanal.REGRA);
assert.match(regra, /grill-tela/);
assert.ok(!regra.includes('<grill-canal>'), 'sem a tag: o Pi a poe');
assert.strictEqual(evento.systemPromptOptions.sections.outra, 'x', 'as outras secoes ficam');

await handlers.get('before_agent_start')({});

console.log('extensao grill-canal ok: a regra do hook entra no system prompt do Pi');
