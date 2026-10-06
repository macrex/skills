---
name: grill-tela
description: Canal tela do grilling do Matt Pocock — o mesmo grill, respondido numa página HTML local. Use quando o usuário escolhe o grill na tela ou pede "grill na tela", "grill no navegador", "grill em HTML".
---

# grill-tela — o grill do Matt numa tela HTML local

# Versao: 2.5

Esta skill só troca o canal do `grilling`, cujas regras continuam valendo: em vez de perguntar no
terminal, você publica cada rodada numa página local e espera o usuário responder lá. O
`grilling` ainda não está carregado nesta sessão? Carregue-o antes, como o seu harness carrega uma
skill.

O canal do grill tem três modos: `cli` (o padrão), `perguntar` e `tela`. No Claude Code é a opção
**Canal do grill** do plugin (`/config`); no Pi, `GRILL_CANAL`; no Codex e no Antigravity, o bloco
`<grill-canal>` no `AGENTS.md`. Em `cli`, esta skill só entra quando o usuário a pede.

O programa é `scripts/grill-tela.js`, relativo à pasta deste SKILL.md. Abaixo, `G` é
`node "<pasta>/scripts/grill-tela.js"`.

## O harness

Leia só o seu. **Esperar** é como rodar o passo 4 do ciclo.

- **Claude Code** — pasta: a "Base directory for this skill". Esperar: `G aguardar <url>` com
  `run_in_background: true`, e **encerre o turno**; o Claude Code reacorda você quando ele
  terminar. Em sessão sem supervisão, passe `timeout` de até 2 h.
- **Pi** — pasta: o `location` da skill. Esperar: o laço, com o `timeout` do `bash` acima de 150 s.
- **Codex** — pasta: `~/.codex/skills/grill-tela` ou, no clone do README,
  `~/.codex/skills/macrex/skills/grill-tela`. Com o sandbox ligado, todo comando `G` roda fora
  dele, com a escalação pedida ao usuário: o sandbox bloqueia rede até em 127.0.0.1, e sem ela o
  `iniciar` não sobe. Esperar: o laço, com o timeout do comando acima de 150 s; voltou com o
  processo ainda rodando, espere-o até o fim.
- **Antigravity (CLI `agy`)** — pasta: `~/.gemini/config/skills/grill-tela`. Esperar: o laço, em
  primeiro plano; se o comando for para segundo plano, acompanhe-o até o fim.

**Perguntar**, o canal do terminal para onde o grill volta: `AskUserQuestion` no Claude Code; nos
demais, em texto, e encerre o turno.

**O laço**: `G aguardar <url> --ate 120` em primeiro plano. Saiu `{"tipo":"pendente"}`? Rode de
novo, sem escrever nada ao usuário. Chegou mensagem do usuário entre duas voltas? É ele escrevendo
no terminal: "Voltar ao CLI", abaixo.

## O ciclo

1. **Uma vez:** `G iniciar --projeto <nome do projeto>`. Ele abre o navegador e imprime a URL, que
   todo comando seguinte recebe. Escreva-a ao usuário: o navegador pode não abrir (SSH, contêiner,
   sandbox).
2. **Cada rodada:** escreva o JSON da rodada (num arquivo temporário, ou por stdin com `-`) e rode
   `G rodada <url> <arquivo.json>`. Saiu com código 1? Corrija o JSON pela lista de erros e repita
   antes de seguir: o usuário ainda não viu nada.
3. Escreva ao usuário a linha que o comando imprimiu.
4. Espere com `G aguardar <url>`, do jeito do seu harness. Terminou sem JSON (morto por tempo)?
   Rode de novo: a resposta não se perde. `{"tipo":"substituido"}` é um `aguardar` anterior que
   outro substituiu: ignore-o.
5. Mostre ao usuário a tabela das respostas (vem pronta, acima do JSON), para o histórico da
   sessão guardá-la, e siga o `grilling` com o JSON da última linha; os comentários contam como
   resposta do usuário.
6. Fronteira vazia: `G final <url> <arquivo.json>` com a tabela consolidada de decisões, depois
   espere de novo.
   - `{"tipo":"sim"}` vale como o sim do usuário ao entendimento (por exemplo o sim que a `/faz`
     pede). O servidor para sozinho.
   - `{"tipo":"ajuste","texto":"…"}`: reabra uma rodada a partir do texto e volte ao passo 2.

## Voltar ao CLI

- O `aguardar` devolveu `{"tipo":"cli"}` ou `{"tipo":"encerrado"}`, ou um comando disse que o
  servidor não respondeu: siga o grill no terminal, pelo "perguntar" do seu harness, a partir da
  rodada em aberto.
- O usuário escreveu no terminal enquanto você esperava: pare de esperar (no Claude Code,
  `TaskStop` no id da tarefa em background; no laço, não rode a próxima volta), rode
  `G cli <url>`, trate a mensagem dele e siga o grill no terminal.

## Contratos

Rodada — 2 a 4 opções por questão, exatamente uma `"recomendada": true`, ids únicos; `contexto` e
`descricao` são opcionais e aceitam markdown curto (negrito, itálico, código, link):

```json
{"rodada": 1, "questoes": [
  {"id": "Q1", "cabecalho": "Transporte", "titulo": "Como o agente e a tela conversam?",
   "contexto": "Hoje o grill é **todo no CLI**.",
   "opcoes": [{"rotulo": "Servidor local", "descricao": "Node, só stdlib", "recomendada": true},
              {"rotulo": "Artifact", "descricao": "Página no claude.ai"}]}]}
```

Final: `{"tabela": [{"decisao": "Transporte", "escolha": "Servidor local"}]}`.

Na resposta da rodada, `marca` é `aceito` (a recomendada) ou `outra` (outra opção ou resposta
própria, em `escolha`).
