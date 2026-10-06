# Antigravity (CLI `agy`)

- **Skills do Matt:** o CLI só lê skill direto em `~/.gemini/config/skills/`:
  `git clone https://github.com/mattpocock/skills ~/.gemini/antigravity-cli/mattpocock` e
  `cp -r ~/.gemini/antigravity-cli/mattpocock/skills/*/*/ ~/.gemini/config/skills/`.
- **Invocar uma skill:** ler o `SKILL.md` de uma skill no caminho do localizador e cumpri-lo **é**
  invocá-la. O Antigravity não documenta `disable-model-invocation`: as reservadas aparecem na sua
  lista, e continuam valendo só quando o usuário as nomeia.
- **Perguntar:** em texto, e encerre o turno.
- **Sub-agente:** nenhum; tudo roda na sessão.
- **Segurar a sessão:** não há loop. Abertura: `/faz leva <documento>`, e o aviso diz que, se a
  sessão parar antes de a leva fechar, o usuário responde `continue` e ela retoma de onde parou.
