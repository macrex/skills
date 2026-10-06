# Codex

- **Skills do Matt:** `git clone https://github.com/mattpocock/skills ~/.codex/skills/mattpocock`.
- **Invocar uma skill:** ler o `SKILL.md` de uma skill no caminho do localizador e cumpri-lo **é**
  invocá-la. As reservadas ficam fora da sua lista pelo `agents/openai.yaml` de cada uma (o Codex
  ignora `disable-model-invocation`); o arquivo está lá. O Codex prefixa o nome com o do plugin do
  clone (`$macrex-skills:faz`, `$mattpocock-skills:grilling`); na linha da leva os nomes vão com
  `/`, como nos demais.
- **Perguntar:** em texto, e encerre o turno; se o `/goal` mandar continuar, repita a pergunta
  sem chamar ferramenta — é assim que ele devolve a vez ao usuário.
- **Sub-agente:** `spawn_agent` e `wait_agent`, com `[features] multi_agent = true` no
  `~/.codex/config.toml`, no modelo das roles do `config.toml`. Sem a feature, inline.
- **Segurar a sessão:** `/goal` nativo. Abertura:
  `/goal leia <caminho absoluto do SKILL.md desta skill> e cumpra leva <documento>`; se o seu
  Codex pedir o objetivo entre aspas, ponha-as.
