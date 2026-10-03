// A rota Pi do hook do grill: no Claude Code, hooks/grill-canal.js pega a invocacao do
// grilling pela ferramenta Skill e injeta a instrucao do canal. O Pi nao invoca skill por
// ferramenta — o agente le o SKILL.md —, entao a mesma instrucao entra como regra no
// system prompt. O texto tem um dono so: o hook, que esta extensao importa.
//
// Os tres modos da opcao do plugin vem de GRILL_CANAL: perguntar, tela ou cli (o padrao,
// e o valor de qualquer coisa que nao reconhece). Em cli nada e registrado e o grill segue
// no terminal. So a variavel conta aqui: os settings.json do Claude Code nao decidem pelo Pi.

import grillCanal from '../hooks/grill-canal.js';

const SECAO = 'grill-canal';

export default function (pi: any) {
  const modo = grillCanal.canal(process.env.GRILL_CANAL);
  if (modo === 'cli') return;
  // `sections`, como na vault-docs: o Pi embrulha o texto na tag da secao e so manda o que mudou.
  pi.on('before_agent_start', async (evento: any) => {
    const opcoes = evento.systemPromptOptions;
    if (!opcoes) return;
    (opcoes.sections ||= {})[SECAO] = grillCanal.REGRA[modo];
  });
}
