---
name: grill-tela
description: Canal tela do grilling do Matt Pocock — o mesmo grill, respondido numa página HTML local em vez de no terminal. Use quando o usuário escolheu fazer o grill na tela, ou pede "grill na tela", "grill no navegador", "grill em HTML". Claude Code, Pi, Codex e Antigravity.
---

# grill-tela — o grill do Matt numa tela HTML local

# Versao: 2.2

Esta skill só troca o canal do `grilling`: as regras dele continuam valendo (a fronteira, uma
rodada por vez, a resposta recomendada em cada questão, seguir até a fronteira esvaziar). Em vez
de perguntar no terminal, você publica cada rodada numa página local e espera o usuário responder
lá. O `grilling` ainda não está carregado nesta sessão? Carregue-o antes, como o seu harness
carrega uma skill.

A pergunta do canal (CLI ou tela) quando o `grilling` começa é opcional e desligada por padrão:
no Claude Code, a opção **Grill na tela** do plugin (`/config`); no Pi, `GRILL_TELA=1`; no Codex e
no Antigravity, o bloco `<grill-canal>` no `AGENTS.md`. Desligada, o grill segue no terminal, e
esta skill só entra quando o usuário a pede pelo nome ou pede o grill na tela.

O programa é `scripts/grill-tela.js`, relativo à pasta deste SKILL.md. Abaixo, `G` é
`node "<pasta>/scripts/grill-tela.js"`.

## O harness

Leia só o seu. **Pasta** é onde este SKILL.md está; **esperar** é como rodar o passo 4 do ciclo;
**perguntar** é o canal do terminal, para onde o grill volta.

- **Claude Code** — pasta: a que o harness anunciou como "Base directory for this skill".
  Esperar: `G aguardar <url>` com `run_in_background: true`, e **encerre o turno**; o Claude
  Code reacorda você quando ele terminar. Em sessão sem supervisão, passe `timeout` de até 2 h.
  Perguntar: `AskUserQuestion`.
- **Pi** — pasta: a do `location` com que a skill chegou (`<skill name="grill-tela" location="…">`).
  Esperar: o laço, com o `timeout` do `bash` acima de 150 s. Perguntar: em texto, e encerre o turno.
- **Codex** — pasta: `~/.codex/skills/macrex/skills/grill-tela` (o texto chega sem caminho). Com o
  sandbox ligado, todo comando `G` roda fora dele, com a escalação pedida ao usuário: o sandbox
  bloqueia socket de rede, até em 127.0.0.1, e sem ela o `iniciar` não sobe. Esperar: o laço,
  com o timeout do comando acima de 150 s; voltou com o processo ainda rodando, espere-o até o
  fim. Perguntar: em texto, e encerre o turno.
- **Antigravity (CLI `agy`)** — pasta: `~/.gemini/antigravity-cli/skills/grill-tela`. Esperar: o
  laço, em primeiro plano; se o comando for para segundo plano, acompanhe-o até o fim.
  Perguntar: em texto, e encerre o turno.

**O laço**, onde não há notificação de comando em background: `G aguardar <url> --ate 120` em
primeiro plano. Saiu `{"tipo":"pendente"}` (120 s sem resposta)? Rode de novo, sem escrever nada
ao usuário; a resposta dada entre duas voltas espera a seguinte. Chegou mensagem do usuário entre
duas voltas? É ele escrevendo no terminal: "Voltar ao CLI", abaixo.

## O ciclo

1. **Uma vez:** `G iniciar --projeto <nome do projeto>`. Sobe o servidor, abre o navegador e
   imprime a URL (`http://127.0.0.1:<porta>/?t=<token>`). Guarde a URL: todo comando seguinte a
   recebe. Escreva-a ao usuário também: o navegador pode não abrir (SSH, contêiner, sandbox).
2. **Cada rodada:** escreva o JSON da rodada (num arquivo temporário, ou por stdin com `-` e
   heredoc) e rode `G rodada <url> <arquivo.json>`. Saiu com código 1? Leia a lista de erros,
   corrija o JSON e repita antes de seguir — o usuário ainda não viu nada.
3. Escreva ao usuário a linha que o comando imprimiu: "Rodada N na tela, K questões."
4. Espere com `G aguardar <url>`, do jeito do seu harness.
5. Com a saída em mãos, mostre ao usuário a tabela das respostas (vem pronta, acima do JSON),
   para o histórico da sessão guardá-la. A última linha é o JSON: siga o `grilling` com ele.
   Comentários são informação do usuário e contam como tal.
6. Fronteira vazia: `G final <url> <arquivo.json>` com a tabela consolidada de decisões, depois
   espere de novo.
   - `{"tipo":"sim"}` vale como o sim do usuário ao entendimento (por exemplo o sim que a `/faz` pede). O servidor para sozinho.
   - `{"tipo":"ajuste","texto":"…"}`: reabra uma rodada a partir do texto e volte ao passo 2.

`aguardar` terminou sem JSON (morto por tempo)? Rode de novo: a resposta pendente não se perde.
Só um `aguardar` espera por vez: o anterior sai com `{"tipo":"substituido"}`, que você ignora.

## Voltar ao CLI

- O `aguardar` devolveu `{"tipo":"cli"}` (o botão da página) ou `{"tipo":"encerrado"}` (2 h sem
  a página), ou um comando disse que o servidor não respondeu: siga o grill no terminal, pelo
  "perguntar" do seu harness, a partir da rodada em aberto.
- O usuário escreveu no terminal enquanto você esperava: pare de esperar (no Claude Code,
  `TaskStop` no id da tarefa em background; no laço, não rode a próxima volta), rode
  `G cli <url>` (a página mostra "O grill segue no terminal" e o servidor para), trate a
  mensagem dele e siga o grill no terminal.

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

Última linha do `aguardar`, um destes:

```json
{"tipo":"rodada","rodada":1,"respostas":[{"id":"Q1","marca":"aceito","escolha":"Servidor local","comentario":null}]}
{"tipo":"sim"}
{"tipo":"ajuste","texto":"…"}
{"tipo":"cli"}
{"tipo":"encerrado","motivo":"…"}
{"tipo":"substituido"}
{"tipo":"pendente"}
```

`marca` é `aceito` (a recomendada) ou `outra` (outra opção ou resposta própria, em `escolha`).
`pendente` só sai com `--ate`.
