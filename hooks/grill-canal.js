#!/usr/bin/env node
// PreToolUse da ferramenta Skill: quando o agente invoca o grilling, injeta a instrucao
// do canal configurado. Qualquer outra skill, ou um stdin que nao e JSON, passa calada.
// Nao decide permissao.
//
// O canal tem tres modos, na opcao `grill_canal` do plugin (/config):
//   cli        o padrao: o hook fica calado e o grill segue o fluxo de sempre do usuario;
//   perguntar  antes da primeira rodada o agente pergunta CLI ou tela;
//   tela       o grill vai direto para a grill-tela, sem perguntar.
// A opcao chega como CLAUDE_PLUGIN_OPTION_GRILL_CANAL; GRILL_CANAL e o pluginConfigs dos
// settings.json sao os fallbacks, na mesma ordem do vault. O gate FALHA FECHADO, ao
// contrario do hook do vault: valor ausente, ilegivel ou desconhecido vale cli.
//
// Os outros harnesses nao tem o PreToolUse da Skill, entao recebem a mesma instrucao como
// regra permanente: a extensao do Pi (extensions/grill-canal.ts) a poe no system prompt
// conforme GRILL_CANAL, e no Codex e no Antigravity `node grill-canal.js regra [tela]
// >> AGENTS.md` liga e apagar o bloco volta ao cli.
//
// Uso: node grill-canal.js                       (hook, com o evento no stdin)
//      node grill-canal.js regra [perguntar|tela] (imprime a regra para o AGENTS.md)

const fs = require('fs');
const { arquivosDeConfig } = require('./vault-rules.js');

// O que o hook injeta no Claude Code, por modo.
const INSTRUCAO = {
  perguntar: `Antes da primeira rodada do grill, pergunte ao usuario pelo AskUserQuestion qual canal ele quer: CLI (as rodadas pelo AskUserQuestion, como de costume) ou tela (uma pagina HTML local). Se ele escolher tela, invoque a skill grill-tela e conduza o grill por ela, sem usar o AskUserQuestion nas rodadas.`,
  tela: `O usuario configurou o grill para a tela: sem perguntar o canal, invoque a skill grill-tela e conduza o grill por ela desde a primeira rodada, sem usar o AskUserQuestion nas rodadas.`,
};

// A regra permanente dos harnesses sem o hook, por modo.
const REGRA = {
  perguntar: `Quando for conduzir o grill da skill grilling (do Matt Pocock, tambem pela grill-with-docs ou pela /faz), antes da primeira rodada pergunte ao usuario, em texto, qual canal ele quer: CLI (as rodadas aqui no terminal, como de costume) ou tela (uma pagina HTML local), e encerre o turno. Se ele escolher tela, carregue a skill grill-tela e conduza o grill por ela, sem fazer as perguntas das rodadas no terminal.`,
  tela: `Quando for conduzir o grill da skill grilling (do Matt Pocock, tambem pela grill-with-docs ou pela /faz), sem perguntar o canal, carregue a skill grill-tela e conduza o grill por ela desde a primeira rodada, sem fazer as perguntas das rodadas no terminal.`,
};

const SINONIMOS = { perguntar: 'perguntar', pergunta: 'perguntar', tela: 'tela', navegador: 'tela', browser: 'tela', cli: 'cli' };
// Normaliza um valor de opcao ou variavel; o que nao reconhece vale cli.
const canal = (v) => SINONIMOS[String(v == null ? '' : v).trim().toLowerCase()] || 'cli';

function canalConfigurado() {
  // A opcao do plugin decide primeiro: e a resposta explicita deste cliente.
  const opcao = process.env.CLAUDE_PLUGIN_OPTION_GRILL_CANAL;
  if (opcao !== undefined) return canal(opcao);
  if ((process.env.GRILL_CANAL || '').trim()) return canal(process.env.GRILL_CANAL);
  for (const arquivo of arquivosDeConfig()) {
    let cfgs;
    try {
      cfgs = JSON.parse(fs.readFileSync(arquivo, 'utf8')).pluginConfigs;
    } catch (e) {
      continue; // ausente, ilegivel ou corrompido nao e resposta
    }
    for (const [nome, c] of Object.entries(cfgs || {})) {
      if (!nome.startsWith('macrex-skills@')) continue;
      const v = c && c.options && c.options.grill_canal;
      if (v !== undefined) return canal(v);
    }
  }
  return 'cli';
}

module.exports = { INSTRUCAO, REGRA, canal, canalConfigurado };

if (require.main === module) {
  if (process.argv[2] === 'regra') {
    const modo = canal(process.argv[3] || 'perguntar');
    if (modo === 'cli') {
      console.error('uso: grill-canal.js regra [perguntar|tela] (cli e nao ter a regra)');
      process.exit(1);
    }
    process.stdout.write(`<grill-canal>\n${REGRA[modo]}\n</grill-canal>\n`);
  } else {
    let entrada = '';
    process.stdin.on('data', (d) => (entrada += d));
    process.stdin.on('end', () => {
      let skill;
      try {
        skill = JSON.parse(entrada).tool_input.skill;
      } catch (e) {
        return; // JSON invalido ou sem tool_input: calado
      }
      if (typeof skill !== 'string' || skill.replace(/^mattpocock-skills:/, '') !== 'grilling') return;
      const modo = canalConfigurado();
      if (modo === 'cli') return; // o grill segue o fluxo do usuario
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: INSTRUCAO[modo] } })
      );
    });
  }
}
