---
name: grill-tela
description: Canal tela do grilling do Matt Pocock — o mesmo grill, respondido numa página HTML local. Use quando o usuário escolhe o grill na tela ou pede "grill na tela", "grill no navegador", "grill em HTML".
---

# grill-tela — o grill do Matt numa tela HTML local

# Versao: 2.8

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

- **Claude Code** — pasta: a "Base directory for this skill". No modo `tela`, as rodadas não
  passam por esta skill: faça cada uma pelo `AskUserQuestion`, e o plugin sobe a página, publica a
  rodada, espera a resposta e a devolve como a do diálogo, com a URL da página. A skill entra só
  na fronteira vazia, para o passo 6 nessa URL; nenhum resultado trouxe a URL? O usuário voltou ao
  CLI, e o grill termina nele. Pedida pelo usuário, escolhida no `perguntar` ou mandada pelo
  plugin (o grill de fora da `/faz`, cujo `AskUserQuestion` ele não leva à página), ela faz o
  ciclo inteiro. Esperar: `G aguardar <url>` com `run_in_background: true`, e **encerre o turno**; o
  Claude Code reacorda você quando ele terminar. Em sessão sem supervisão, passe `timeout` de até 2 h.
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
   resposta do usuário. A questão que voltou sem escolha segue a marca:
   - `delegado` (Decida você): decida você, diga ao usuário o que escolheu e por quê, e a linha
     dela na final leva `"origem": "agente"`.
   - `esclarecer` (Não entendi): reescreva a questão em termos mais simples na próxima rodada.
   - `adiado` (Adiar): a questão fica na fronteira, para uma rodada depois.

   `{"tipo":"texto","texto":"…"}` é uma mensagem que o usuário escreveu à parte na tela: trate-a
   como mensagem dele. A rodada segue aberta na tela, então espere de novo (passo 4) pelas
   respostas dela.
6. Fronteira vazia: `G final <url> <arquivo.json>` com a tabela consolidada de decisões, cada
   linha com a sua proveniência (em "Contratos"), depois espere de novo.
   - `{"tipo":"sim","adrs":[…]}` vale como o sim do usuário ao entendimento (por exemplo o sim que
     a `/faz` pede). O servidor para sozinho. `adrs` traz as linhas que o usuário marcou como ADR:
     com o vault na sessão (alguma ferramenta do servidor `vault-docs`, seja qual for o prefixo),
     registre cada uma como ADR pela skill `obsidian-docs` (`salvar_nota tipo=adr`), com o
     `motivo` e as `alternativas` rejeitadas no corpo; sem o vault, liste-as ao usuário.
   - `{"tipo":"ajuste","texto":"…"}`: reabra uma rodada a partir do texto e volte ao passo 2.

## Retomar

Cada sessão fica em disco, e `G sessoes [--projeto <nome>]` as lista. O `aguardar` devolveu
`{"tipo":"encerrado"}`, um comando disse que o servidor não respondeu, ou você voltou de uma
compactação: tente **uma vez** `G iniciar --projeto <nome> --retomar`. Ele traz de volta o
histórico, a rodada em aberto e a final, e imprime a URL (a mesma, se a porta estiver livre), que
substitui a antiga em todo comando seguinte. Repita o comando que falhou ou, com a rodada já na
tela, espere (passo 4): a resposta que você não recebeu volta no `aguardar`. A sessão já terminou
com o sim? O `--retomar` não sobe servidor e imprime o JSON do sim na última linha: siga o passo 6
com ele. Saiu com código 1 (a sessão voltou ao CLI, ou não há o que retomar)? Voltar ao CLI.

## Voltar ao CLI

- O `aguardar` devolveu `{"tipo":"cli"}`, ou o `--retomar` falhou: siga o grill no terminal, pelo
  "perguntar" do seu harness, a partir da rodada em aberto.
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

Final — só `decisao` e `escolha` são obrigatórios:

```json
{"tabela": [{"decisao": "Transporte", "escolha": "Servidor local", "motivo": "Só stdlib, sem dependência",
  "alternativas": ["Artifact"], "origem": "aceitou", "duravel": true}]}
```

A proveniência, que a tela mostra, sai das respostas:

- `origem`: `aceitou` quando a marca foi `aceito`; `ditou` quando foi `outra` (outra opção ou
  resposta própria); `agente` quando a marca foi `delegado`, quando o usuário delegou a escolha a
  você num comentário como "decida você", ou quando você a tirou do código sem perguntar.
- `motivo`: por que esta escolha, numa frase: o comentário do usuário, senão a `descricao` da
  opção escolhida.
- `alternativas`: os `rotulo` das outras opções da questão, as rejeitadas.
- `duravel`: `true` só quando valem os três critérios de ADR: difícil de reverter, surpreendente
  para quem não viu o contexto e fruto de um trade-off real. A caixa "Registrar como ADR" já abre
  marcada nessas linhas, e o usuário marca ou desmarca as outras.

Na resposta da rodada, `marca` é `aceito` (a recomendada), `outra` (outra opção ou resposta
própria, em `escolha`), ou uma das que vêm com `escolha: null`: `delegado`, `esclarecer` ou
`adiado`.
