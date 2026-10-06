---
name: faz
description: Uma leva inteira, do interrogatório à validação — /faz <pedido> a abre e a linha que nomeia /faz leva <documento> a cumpre. Só por invocação do usuário.
argument-hint: <o que fazer>
disable-model-invocation: true
---

# /faz — do pedido à leva verificada

# Versao: 3.17

Esta skill **simplifica um fluxo que já existe**, o SDD/TDD do Matt Pocock: as skills dele fazem
o trabalho, esta só encadeia e para três vezes para o usuário decidir. São dois movimentos:
`/faz <pedido>`, do comando ao fim do interrogatório, e `/faz leva <documento>`, disparado numa
sessão nova pela linha que o primeiro entrega pronta.

## O harness, antes de tudo

Leia só a referência do seu harness — a mecânica de invocar skill, perguntar, abrir sub-agente e
segurar a sessão é a de lá:

- ferramentas `Skill`, `AskUserQuestion` e `Agent`, e a skill chegou com "Base directory for this
  skill" → `references/harness/claude-code.md`;
- ferramentas `read`, `bash`, `edit` e `write`, e a skill chegou como
  `<skill name="..." location="...">` → `references/harness/pi.md`;
- `apply_patch` e `exec`, skills por `$nome` → `references/harness/codex.md`;
- system prompt do Antigravity, skills por `/nome` → `references/harness/antigravity.md`.

`references/` e `scripts/` saem da pasta deste SKILL.md — a que o harness anunciou ao carregá-lo, a
do caminho que a linha citou ou, com o texto sem caminho, `~/.codex/skills/` no Codex (no clone,
`macrex/skills/faz`) e `~/.gemini/config/skills/faz` no Antigravity.

## Qual dos dois você está cumprindo

O pedido traz o token `leva` seguido de um documento (título de nota ou caminho), ou nomeia
`to-spec`? Então é a linha que o movimento 1 imprimiu: leia `references/leva.md` e cumpra-o.
Qualquer outro pedido é o movimento 1: leia `references/interrogatorio.md` e cumpra-o.
