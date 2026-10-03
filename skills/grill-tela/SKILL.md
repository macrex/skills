---
name: grill-tela
description: Canal tela do grilling do Matt Pocock — o mesmo grill, respondido numa página HTML local em vez de no terminal. Use quando o usuário escolheu fazer o grill na tela, ou pede "grill na tela", "grill no navegador", "grill em HTML". Claude Code, Pi, Codex e Antigravity.
---

# grill-tela — o grill do Matt numa tela HTML local

# Versao: 3.0

Esta skill só troca o canal do `grilling`: as regras dele continuam valendo (a fronteira, uma
rodada por vez, a resposta recomendada em cada questão, seguir até a fronteira esvaziar). Em vez
de perguntar no terminal, você publica cada rodada numa página local e espera o usuário responder
lá. O `grilling` ainda não está carregado nesta sessão? Carregue-o antes, como o seu harness
carrega uma skill.

O canal do grill tem três modos: `cli` (o padrão: o grill segue no terminal), `perguntar` (o
agente pergunta CLI ou tela quando o `grilling` começa) e `tela` (esta skill entra direto, sem
perguntar). No Claude Code é a opção **Canal do grill** do plugin (`/config`); no Pi, `GRILL_CANAL`;
no Codex e no Antigravity, o bloco `<grill-canal>` no `AGENTS.md`. Em `cli`, esta skill só entra
quando o usuário a pede pelo nome ou pede o grill na tela.

## Antes da primeira rodada

A pasta desta skill: no Claude Code, a que ele anunciou como "Base directory for this skill"; no
Pi, a do `location` com que a skill chegou; no Codex, `~/.codex/skills/macrex/skills/grill-tela`;
no Antigravity, `~/.gemini/antigravity-cli/skills/grill-tela`. Abaixo, `G` é
`node "<pasta>/scripts/grill-tela.js"`. Leia em `references/harness.md` só a seção do seu harness:
como esperar a página e por onde perguntar no terminal.

## O ciclo

1. **Uma vez:** `G iniciar --projeto <nome do projeto>`. Sobe o servidor, abre o navegador e
   imprime a URL (`http://127.0.0.1:<porta>/?t=<token>`). Guarde a URL: todo comando seguinte a
   recebe. Escreva-a ao usuário também: o navegador pode não abrir (SSH, contêiner, sandbox), e
   `G abrir <url>` reabre a página se ele fechou a aba.
2. **Cada rodada:** escreva o JSON da rodada (num arquivo temporário, ou por stdin com `-` e
   heredoc) e rode `G rodada <url> <arquivo.json>`. Saiu com código 1? Leia a lista de erros,
   corrija o JSON e repita antes de seguir — o usuário ainda não viu nada.
3. Escreva ao usuário a linha que o comando imprimiu: "Rodada N na tela, K questões."
4. Espere com `G aguardar <url>`, do jeito do seu harness.
5. Mostre ao usuário a tabela das respostas (vem pronta, acima do JSON), para o histórico da
   sessão guardá-la. A última linha é o JSON: siga o `grilling` com ele. Comentários são
   informação do usuário e contam como tal.
6. Fronteira vazia: `G final <url> <arquivo.json>` com a tabela consolidada de decisões, depois
   espere de novo.
   - `{"tipo":"sim"}` vale como o sim do usuário ao entendimento (por exemplo o sim que a `/faz` pede). O servidor para sozinho.
   - `{"tipo":"ajuste","texto":"…"}`: reabra uma rodada a partir do texto e volte ao passo 2.

A última resposta fica guardada até você publicar a próxima rodada ou a tela final: o `aguardar`
morreu sem JSON (timeout, interrupção)? Rode de novo e ela volta. Por isso, recebida uma resposta,
não espere outra antes de publicar. Só um `aguardar` espera por vez: o anterior sai com
`{"tipo":"substituido"}`, que você ignora.

## Voltar ao CLI

- O `aguardar` devolveu `{"tipo":"cli"}` (o botão da página) ou `{"tipo":"encerrado"}` (2 h sem
  a página), ou um comando disse que o servidor não respondeu: siga o grill no terminal, pelo
  "perguntar" do seu harness, a partir da rodada em aberto.
- O usuário escreveu no terminal enquanto você esperava: pare de esperar, rode `G cli <url>` (a
  página mostra "O grill segue no terminal" e o servidor para), trate a mensagem dele e siga o
  grill no terminal.

## Contratos

Rodada — 2 a 4 opções por questão, ids únicos, exatamente uma `"recomendada": true`; com
`"multipla": true` o usuário marca quantas quiser, e as recomendadas (ao menos uma) vêm todas
marcadas. `contexto` e `descricao` são opcionais e aceitam markdown curto (negrito, itálico,
código, link):

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
{"tipo":"rodada","rodada":1,"respostas":[{"id":"Q1","marca":"aceito","escolha":"Servidor local"},{"id":"Q2","marca":"outra","escolha":"SMS; Portal","escolhas":["SMS","Portal"],"comentario":"só urgente"}]}
{"tipo":"sim"}
{"tipo":"ajuste","texto":"…"}
{"tipo":"cli"}
{"tipo":"encerrado","motivo":"…"}
{"tipo":"substituido"}
{"tipo":"pendente"}
```

`marca` é `aceito` (a recomendada; na múltipla, exatamente as recomendadas) ou `outra` (outra
opção ou resposta própria, em `escolha`). `escolhas` só vem na múltipla, `comentario` só quando
há, `pendente` só com `--ate`.
