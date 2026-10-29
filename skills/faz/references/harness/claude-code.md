# Claude Code

- **Skills do Matt:** plugin `mattpocock-skills` (`/plugin install mattpocock-skills`), ou
  `~/.claude/skills` por `npx skills@latest add mattpocock/skills`. Prefira o plugin: sem o
  prefixo, `code-review` colide com a skill nativa.
- **Invocar uma skill:** ferramenta `Skill`, com o nome do localizador; ler o `SKILL.md` com
  `Read` não é invocar. Recusa numa das três reservadas é turno expirado, nome partido ou
  mensagem que virou comando: peça ao usuário que cole o nome de novo, sozinho numa linha, e espere.
- **Perguntar:** `AskUserQuestion`.
- **Sub-agente:** `Agent`, com `model` quando o modelo não é o da sessão. Com `name`, ele roda
  como teammate: a resposta final não volta como resultado da ferramenta, chega na
  `idle_notification`, cortada perto de 16 mil caracteres, e repete o que ele já mandou por
  `SendMessage`. Por isso o prompt de cada um (ticket e conciliação) leva a linha "Entregue o
  retorno inteiro uma vez, por `SendMessage` ao team-lead; a resposta final é só
  `entregue: <ticket ou item>`".
- **Mensagem a um sub-agente:** `SendMessage`, com o `name` dele; o que já devolveu retoma com o
  contexto.
- **Modo do implement:** workflow, pela ferramenta `Workflow`, com o esqueleto em
  `references/workflow-tickets.md`; sub-agents, pelo `Agent`, a onda inteira junta, um ticket por
  worktree, e um sub-agente concilia; ou inline. O usuário escolhe na rodada da execução, no fim do interrogatório, com a sua
  recomendação pela seção "O modo" de `leva.md`, e a leva o lê no documento.
- **Segurar a sessão:** não há laço; a notificação de cada trabalho em background (workflow,
  sub-agente) retoma a sessão sozinha. Abertura: `rode /<faz> leva <documento>`, com `<faz>` o
  nome da linha `faz` do localizador: a skill reservada só é liberada quando o nome chamado bate
  com o token digitado, e com `/faz` o modelo chama `macrex-skills:faz` e leva recusa.
- **Autorização das três reservadas:** só quando a linha as nomeia como **token isolado** —
  `/mattpocock-skills:to-spec` com espaço ou quebra de linha dos dois lados; pontuação colada e
  nome partido cegam a busca. A cópia do terminal leva junto a quebra da linha longa, por isso
  cada nome abre uma linha do bloco (o Executar da aba Grill do painel leva o texto exato). Só em
  **texto**: a mensagem que começa com `/` vira comando, e nome nos argumentos de comando não
  autoriza; por isso a abertura começa com `rode`. E só **no turno que a linha abriu**: toda
  mensagem de usuário que não é meta nem resultado de ferramenta abre turno novo — a resposta em
  texto, a notificação de um trabalho em background, a mensagem de um sub-agente.
- **Painel da leva:** ferramenta `mcp__macrex-skills__faz_marco`, carregada pelo `ToolSearch`
  quando vem listada só pelo nome; ausente de todo, siga sem o marco;
  recusado, corrija o campo que a recusa aponta e chame de novo. Na sessão da leva, os marcos estão em `references/painel.md`.
