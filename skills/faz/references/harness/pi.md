# Pi

- **Skills do Matt:** `pi install https://github.com/mattpocock/skills`, ou `~/.agents/skills` por
  `npx skills@latest add mattpocock/skills`.
- **Invocar uma skill:** ler o `SKILL.md` de uma skill no caminho do localizador e cumpri-lo **é**
  invocá-la. As reservadas ficam fora da sua lista (`disable-model-invocation`); o
  arquivo está lá.
- **Perguntar:** em texto, e encerre o turno. Sob `/goal`, chame `goal_wait` antes, senão o loop
  continua sem a resposta; a resposta do usuário (ou `/goal resume`) retoma.
- **Sub-agente:** só com a extensão `pi-subagents` (ferramenta `subagent`, no modelo do agente
  configurado). Sem ela, tudo roda na sessão.
- **Segurar a sessão:** `/goal <objetivo>` da extensão `@narumitw/pi-goal`
  (`pi install npm:@narumitw/pi-goal`). `/skill:` só expande no começo da mensagem e esta skill
  está fora da lista, então a abertura cita o caminho:
  `/goal leia <caminho absoluto do SKILL.md desta skill> e cumpra leva <documento>`. Sem a
  extensão, a abertura é `/skill:faz leva <documento>` e o aviso diz que o usuário reenvia
  `continue` quando a sessão parar antes do fim. O aviso também pede para subir
  `continuationLimits.automaticTurns` (25 por padrão, em `~/.pi/agent/pi-goal.json`): o loop
  pausa ao chegar lá.
