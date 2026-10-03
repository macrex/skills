// A rota Pi do hook do grill: no Claude Code, hooks/grill-canal.js pega a invocacao do
// grilling pela ferramenta Skill e pede a pergunta do canal (CLI ou tela). O Pi nao invoca
// skill por ferramenta — o agente le o SKILL.md —, entao a mesma pergunta entra como regra
// no system prompt. O texto tem um dono so: o hook, que esta extensao importa.
//
// Como a opcao do plugin no Claude Code, o gate fica desligado por padrao: so GRILL_TELA
// ligada (1, true, sim) registra a regra. Sem ela, nada entra e o grill segue no terminal.
// So a variavel conta aqui: os settings.json do Claude Code nao decidem pelo Pi.

import grillCanal from '../hooks/grill-canal.js';

const SECAO = 'grill-canal';

export default function (pi: any) {
  if (!grillCanal.ligado(process.env.GRILL_TELA)) return;
  // `sections`, como na vault-docs: o Pi embrulha o texto na tag da secao e so manda o que mudou.
  pi.on('before_agent_start', async (evento: any) => {
    const opcoes = evento.systemPromptOptions;
    if (!opcoes) return;
    (opcoes.sections ||= {})[SECAO] = grillCanal.REGRA;
  });
}
