---
name: grill-tela
description: Canal tela do grilling do Matt Pocock — o mesmo grill, respondido numa página HTML local em vez do AskUserQuestion. Use quando o usuário escolheu fazer o grill na tela, ou pede "grill na tela", "grill no navegador", "grill em HTML". Só Claude Code.
---

# grill-tela — o grill do Matt numa tela HTML local

# Versao: 1.1

Esta skill só troca o canal do `grilling`: as regras dele continuam valendo (a fronteira, uma
rodada por vez, a resposta recomendada em cada questão, seguir até a fronteira esvaziar). Em vez
de perguntar pelo `AskUserQuestion`, você publica cada rodada numa página local e espera o usuário
responder lá. Só Claude Code.

O programa é `scripts/grill-tela.js`, relativo à pasta deste SKILL.md (a que o harness anunciou
como "Base directory for this skill"). Abaixo, `G` é `node "<pasta>/scripts/grill-tela.js"`.

## O ciclo

1. **Uma vez:** `G iniciar --projeto <nome do projeto>`. Sobe o servidor, abre o navegador e
   imprime a URL (`http://127.0.0.1:<porta>/?t=<token>`). Guarde a URL: todo comando seguinte a recebe.
2. **Cada rodada:** escreva o JSON da rodada (no scratchpad, ou por stdin com `-` e heredoc) e
   rode `G rodada <url> <arquivo.json>`. Saiu com código 1? Leia a lista de erros, corrija o JSON
   e repita antes de seguir — o usuário ainda não viu nada.
3. Escreva ao usuário a linha que o comando imprimiu: "Rodada N na tela, K questões."
4. Rode `G aguardar <url>` com `run_in_background: true` e **encerre o turno**. O Claude Code
   reacorda você quando ele terminar. Em sessão sem supervisão, passe `timeout` de até 2 h.
5. Na notificação, leia a saída. Mostre ao usuário a tabela das respostas (vem pronta, acima do
   JSON), para o histórico da sessão guardá-la. A última linha é o JSON: siga o `grilling` com
   ele. Comentários são informação do usuário e contam como tal.
6. Fronteira vazia: `G final <url> <arquivo.json>` com a tabela consolidada de decisões, depois
   `G aguardar <url>` em background de novo.
   - `{"tipo":"sim"}` vale como o sim do usuário ao entendimento (por exemplo o sim que a `/faz` pede). O servidor para sozinho.
   - `{"tipo":"ajuste","texto":"…"}`: reabra uma rodada a partir do texto e volte ao passo 2.

`aguardar` terminou sem JSON (morto por tempo)? Rode de novo: a resposta pendente não se perde.
Só um `aguardar` espera por vez: o anterior sai com `{"tipo":"substituido"}`, que você ignora.

## Voltar ao CLI

- O `aguardar` devolveu `{"tipo":"cli"}` (o botão da página) ou `{"tipo":"encerrado"}` (2 h sem
  a página), ou um comando disse que o servidor não respondeu: siga o grill no CLI pelo
  `AskUserQuestion`, a partir da rodada em aberto.
- O usuário digitou qualquer coisa no terminal com o `aguardar` rodando: pare o `aguardar`
  (`TaskStop` no id da tarefa em background), rode `G cli <url>` (a página mostra "O grill segue
  no terminal" e o servidor para), trate a mensagem dele e siga no CLI pelo `AskUserQuestion`.

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
```

`marca` é `aceito` (a recomendada) ou `outra` (outra opção ou resposta própria, em `escolha`).
