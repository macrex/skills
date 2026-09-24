# O harness em que a leva roda

Uma seção por harness, com as mesmas linhas; leia só a sua. O system prompt e as ferramentas
dizem qual é, e `scripts/skills-do-matt.js` imprime na primeira linha o que reconhece pelo
ambiente (`claude-code`, `pi` ou `outro`). O modo workflow e o modelo por chamada de sub-agente
existem só no Claude Code. Fora dele, ler o `SKILL.md` de uma skill no caminho do localizador e
cumpri-lo **é** invocá-la.

## Claude Code

- **Reconhecer:** ferramentas `Skill`, `AskUserQuestion` e `Agent`; a skill chegou com
  "Base directory for this skill".
- **Skills do Matt:** plugin `mattpocock-skills` (`/plugin install mattpocock-skills`), ou
  `~/.claude/skills` por `npx skills@latest add mattpocock/skills`. Pelo plugin o nome leva
  prefixo (`mattpocock-skills:grilling`). Sem prefixo, `code-review` colide com a skill nativa:
  instale pelo plugin.
- **Invocar uma skill:** ferramenta `Skill`, com o nome do localizador; ler o `SKILL.md` com
  `Read` não é invocar. Recusa numa das três reservadas é turno expirado: peça ao usuário que cole
  o nome de novo, sozinho numa linha, e espere.
- **Perguntar:** `AskUserQuestion`.
- **Sub-agente:** `Agent`, com `model` quando o modelo não é o da sessão.
- **Modo workflow:** ferramenta `Workflow`; esqueleto em `references/workflow-tickets.md`.
- **Segurar a sessão:** `/goal`, que só existe em workspace confiado (`~/.claude.json`,
  `projects["<cwd>"].hasTrustDialogAccepted` igual a `true`). Abertura:
  `/goal rode /faz leva <documento>`; não confiado, diga isso no aviso e a abertura é
  `/faz leva <documento>`. O kickoff da sessão nova é
  `A session-scoped Stop hook is now active with condition: "..."`, e a condição do `/goal` chega
  dentro dele, o que conta como mensagem do usuário.
- **Autorização das três reservadas:** só quando a linha as nomeia como **token isolado** —
  `/mattpocock-skills:to-spec` com espaço dos dois lados; pontuação colada cega a busca e a skill
  é recusada.

## Pi

- **Reconhecer:** ferramentas `read`, `bash`, `edit` e `write`; a skill chegou como
  `<skill name="..." location="...">`.
- **Skills do Matt:** `pi install https://github.com/mattpocock/skills` (fica em
  `~/.pi/agent/git/github.com/mattpocock/skills`), ou `~/.agents/skills` por
  `npx skills@latest add mattpocock/skills`.
- **Invocar uma skill:** as reservadas ficam fora da sua lista (`disable-model-invocation`); o
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

## Codex

- **Reconhecer:** `apply_patch` e `exec`; skills chegam por `$nome`, e o Codex prefixa o nome com
  o do plugin do clone (`$macrex-skills:faz`, `$mattpocock-skills:grilling`); na linha da leva os
  nomes vão com `/`, como nos demais. Texto sem caminho: a pasta desta skill está em
  `~/.codex/skills/` (no clone, `macrex/skills/faz`).
- **Skills do Matt:** `git clone https://github.com/mattpocock/skills ~/.codex/skills/mattpocock`.
- **Invocar uma skill:** o Codex ignora `disable-model-invocation`; esta skill e o `/cpv` ficam
  fora da lista pelo `agents/openai.yaml` de cada uma, e o arquivo está lá.
- **Perguntar:** em texto, e encerre o turno; se o `/goal` mandar continuar, repita a pergunta
  sem chamar ferramenta — é assim que ele devolve a vez ao usuário.
- **Sub-agente:** `spawn_agent` e `wait_agent`, com `[features] multi_agent = true` no
  `~/.codex/config.toml`, no modelo das roles do `config.toml`. Sem a feature, inline.
- **Segurar a sessão:** `/goal` nativo. Abertura:
  `/goal leia <caminho absoluto do SKILL.md desta skill> e cumpra leva <documento>`; se o seu
  Codex pedir o objetivo entre aspas, ponha-as.

## Antigravity (CLI `agy`)

- **Reconhecer:** system prompt do Antigravity; skills chegam por `/nome`, e o texto vem sem o
  caminho: a pasta desta skill é `~/.gemini/antigravity-cli/skills/faz`.
- **Skills do Matt:** o CLI só lê skill direto em `~/.gemini/antigravity-cli/skills/`:
  `git clone https://github.com/mattpocock/skills ~/.gemini/antigravity-cli/mattpocock` e
  `cp -r ~/.gemini/antigravity-cli/mattpocock/skills/*/*/ ~/.gemini/antigravity-cli/skills/`.
- **Invocar uma skill:** o Antigravity não documenta `disable-model-invocation`: as reservadas
  aparecem na sua lista, e continuam valendo só quando o usuário as nomeia.
- **Perguntar:** em texto, e encerre o turno.
- **Sub-agente:** nenhum; tudo roda na sessão.
- **Segurar a sessão:** não há loop. Abertura: `/faz leva <documento>`, e o aviso diz que, se a
  sessão parar antes de a leva fechar, o usuário responde `continue` e ela retoma de onde parou.
