#!/usr/bin/env node
// Autoteste da extensao grill-canal do Pi.
//
//   node --experimental-strip-types extensions/teste-grill-canal.mjs
//
// Como no teste da vault-docs, o seam e a factory default: um `pi` de mentira registra os
// handlers. Sem GRILL_CANAL, com cli ou com um valor desconhecido nada e registrado; com
// perguntar ou tela o before_agent_start poe a regra do modo na secao grill-canal, sem tags
// (o Pi as poe), e um evento sem systemPromptOptions passa sem erro.
// E `.mjs` de proposito: a pasta `extensions/` carrega `.ts` e `.js` como extensao.

import assert from 'node:assert';

import criarExtensao from './grill-canal.ts';
import grillCanal from '../hooks/grill-canal.js';

function carregar(valor) {
  if (valor === undefined) delete process.env.GRILL_CANAL;
  else process.env.GRILL_CANAL = valor;
  const handlers = new Map();
  criarExtensao({ on: (evento, handler) => handlers.set(evento, handler) });
  return handlers;
}

for (const valor of [undefined, 'cli', 'qualquer']) {
  assert.strictEqual(carregar(valor).size, 0, `GRILL_CANAL=${valor}: nada registrado`);
}

for (const [valor, modo] of [['perguntar', 'perguntar'], ['tela', 'tela'], [' Navegador ', 'tela']]) {
  const handlers = carregar(valor);
  assert.deepStrictEqual([...handlers.keys()], ['before_agent_start']);
  const evento = { systemPromptOptions: { sections: { outra: 'x' } } };
  await handlers.get('before_agent_start')(evento);
  const regra = evento.systemPromptOptions.sections['grill-canal'];
  assert.strictEqual(regra, grillCanal.REGRA[modo], `GRILL_CANAL=${valor}`);
  assert.match(regra, /grill-tela/);
  assert.ok(!regra.includes('<grill-canal>'), 'sem a tag: o Pi a poe');
  assert.strictEqual(evento.systemPromptOptions.sections.outra, 'x', 'as outras secoes ficam');
  await handlers.get('before_agent_start')({});
}
delete process.env.GRILL_CANAL;

console.log('extensao grill-canal ok: cli por padrao, e perguntar ou tela poem a regra do modo no system prompt do Pi');
