#!/usr/bin/env node
'use strict';
// Grill simulado para validar a tela a olho: sobe a grill-tela de verdade, abre o navegador e faz
// o papel do agente — rodada 1, rodada 2 (que cita o que você respondeu na 1) e a tela final, que
// reabre a cada ajuste até o sim. Usa as suas preferências reais (modo, tema, voz).
//
//   node skills/grill-tela/scripts/demo-grill-tela.js [--projeto <nome>]

const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'grill-tela.js');
const args = process.argv.slice(2);
const projeto = (args.includes('--projeto') && args[args.indexOf('--projeto') + 1]) || 'demo-grill';

function g(...a) {
  const r = spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  return r.stdout.trim();
}
const publica = (cmd, url, corpo) => {
  const r = spawnSync(process.execPath, [SCRIPT, cmd, url, '-'], { encoding: 'utf8', input: JSON.stringify(corpo) });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  console.log(r.stdout.trim());
};
function espera(url) {
  const saida = g('aguardar', url);
  console.log(saida, '\n');
  const msg = JSON.parse(saida.split('\n').pop());
  if (['cli', 'encerrado'].includes(msg.tipo)) { console.log('O grill foi para o terminal; fim da demo.'); process.exit(0); }
  return msg;
}

const RODADA_1 = { rodada: 1, questoes: [
  { id: 'Q1', cabecalho: 'Gatilho', titulo: 'Quando o painel da leva avisa que um portão abriu?',
    contexto: 'Hoje o aviso só aparece na aba **Painel**, e quem está em outra aba não vê. O evento vem de `faz_marco`.',
    opcoes: [
      { rotulo: 'Toast em qualquer aba', descricao: 'Um aviso curto no canto, que some em 6 s e leva ao portão num clique. Não rouba o foco do que você está digitando.', recomendada: true },
      { rotulo: 'Só na aba Painel', descricao: 'Como hoje: nada muda, e o portão continua esperando até alguém abrir a aba.' },
      { rotulo: 'Notificação do sistema', descricao: 'Aparece até com o terminal minimizado, mas pede permissão e cada sistema operacional a mostra de um jeito.' } ] },
  { id: 'Q2', cabecalho: 'Som', titulo: 'O aviso faz barulho?',
    opcoes: [
      { rotulo: 'Não', descricao: 'Silencioso: o toast já chama a atenção.', recomendada: true },
      { rotulo: 'Um bipe curto', descricao: 'Ajuda quem está em outra janela.' } ] },
  { id: 'Q3', cabecalho: 'Repetição', titulo: 'E se o portão seguir aberto por muito tempo?',
    contexto: 'Uma leva longa pode deixar um portão esperando por **horas** enquanto você faz outra coisa.',
    opcoes: [
      { rotulo: 'Lembra de novo a cada 10 min', descricao: 'No máximo 3 lembretes; depois fica só o selo na aba.', recomendada: true },
      { rotulo: 'Avisa uma vez só', descricao: 'Menos ruído, mas fácil de esquecer.' },
      { rotulo: 'Lembra até ser atendido', descricao: 'Garante a resposta, mas vira barulho numa leva de várias horas.' } ] },
  { id: 'Q4', cabecalho: 'Registro', titulo: 'O aviso fica registrado em algum lugar?',
    contexto: 'O store da leva já guarda os marcos; veja o [README](https://github.com/macrex/skills).',
    opcoes: [
      { rotulo: 'Na aba Uso, com a hora', descricao: 'Dá para medir quanto tempo cada portão esperou.', recomendada: true },
      { rotulo: 'Em lugar nenhum', descricao: 'O aviso é efêmero.' } ] } ] };

(() => {
  const url = g('iniciar', '--projeto', projeto);
  console.log(`Tela: ${url}\n`);

  publica('rodada', url, RODADA_1);
  const r1 = espera(url);
  const escolha = (id) => (r1.respostas.find((r) => r.id === id) || {}).escolha || '—';

  const RODADA_2 = { rodada: 2, questoes: [
    { id: 'Q5', cabecalho: 'Posição', titulo: 'Onde o aviso aparece na tela?',
      contexto: `Na rodada 1 você escolheu **${escolha('Q1')}** para o gatilho.`,
      opcoes: [
        { rotulo: 'Canto inferior direito', descricao: 'Longe do prompt, que fica embaixo à esquerda.', recomendada: true },
        { rotulo: 'Topo, centralizado', descricao: 'Mais visível, mas cobre o cabeçalho das abas.' } ] },
    { id: 'Q6', cabecalho: 'Atalho', titulo: 'Que tecla leva direto ao portão?',
      contexto: `E **${escolha('Q3')}** para a repetição.`,
      opcoes: [
        { rotulo: 'Ctrl+G', descricao: 'G de grill e de gate; livre no Claude Code.', recomendada: true },
        { rotulo: 'Nenhuma', descricao: 'Só o clique no aviso.' },
        { rotulo: 'Ctrl+P', descricao: 'P de portão, mas o terminal já usa para o histórico.' } ] } ] };
  publica('rodada', url, RODADA_2);
  const r2 = espera(url);

  const tabela = [...r1.respostas, ...r2.respostas].map((r) => ({
    decisao: [...RODADA_1.questoes, ...RODADA_2.questoes].find((q) => q.id === r.id).cabecalho,
    escolha: r.comentario ? `${r.escolha} (nota: ${r.comentario})` : r.escolha }));
  for (;;) {
    publica('final', url, { tabela });
    const f = espera(url);
    if (f.tipo === 'sim') return console.log('Sim recebido: o servidor encerra sozinho. Fim da demo.');
    if (f.tipo === 'ajuste') tabela.push({ decisao: 'Ajuste', escolha: f.texto });
  }
})();
