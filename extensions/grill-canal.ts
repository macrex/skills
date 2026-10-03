// A rota Pi do hook do grill: no Claude Code, hooks/grill-canal.js pega a invocacao do
// grilling pela ferramenta Skill e pede a pergunta do canal (CLI ou tela). O Pi nao invoca
// skill por ferramenta — o agente le o SKILL.md —, entao a mesma pergunta entra como regra
// no system prompt. O texto tem um dono so: o hook, que esta extensao importa.

import grillCanal from '../hooks/grill-canal.js';

const SECAO = 'grill-canal';

export default function (pi: any) {
  // `sections`, como na vault-docs: o Pi embrulha o texto na tag da secao e so manda o que mudou.
  pi.on('before_agent_start', async (evento: any) => {
    const opcoes = evento.systemPromptOptions;
    if (!opcoes) return;
    (opcoes.sections ||= {})[SECAO] = grillCanal.REGRA;
  });
}
