---
name: faz
description: Faz uma leva inteira a partir de um pedido — do interrogatório à validação — quando o usuário digita /faz <pedido>, e cumpre a leva quando ele cola a linha que nomeia /faz leva <documento>. Só por invocação do usuário.
argument-hint: <o que fazer>
disable-model-invocation: true
---

# /faz — do pedido à leva verificada

# Versao: 3.7

Esta skill **simplifica um fluxo que já existe**, o SDD/TDD do
[Matt Pocock](https://github.com/mattpocock/skills): as skills dele fazem o trabalho, esta só
encadeia e para três vezes para o usuário decidir. São dois movimentos porque metade das skills
dele é reservada ao usuário: `/faz <pedido>` é o primeiro, do comando ao fim do interrogatório;
`/faz leva <documento>` é o segundo, disparado numa sessão nova pela linha que o primeiro
entrega pronta — no Claude Code, no Pi e no Codex uma linha de `/goal`, que segura a sessão até
a leva fechar, com todas as chamadas dentro do laço dele.

## O harness, antes de tudo

Leia `references/harness.md` e fique com a seção do seu harness (Claude Code, Pi, Codex ou
Antigravity): a skill é a mesma, e a mecânica de invocar skill, perguntar, abrir sub-agente e
segurar a sessão é a de lá. `references/` e `scripts/` saem da pasta deste SKILL.md — a que o
harness anunciou ao carregá-lo, ou a do caminho que a linha citou.

## Qual dos dois você está cumprindo

O pedido traz o token `leva` seguido de um documento (título de nota ou caminho), ou nomeia
`to-spec`? Então é a linha que o movimento 1 imprimiu, e o que vale é `references/leva.md`:
leia-o e cumpra aquele arquivo; nada desta página se aplica ali. Qualquer outro pedido é o
movimento 1, abaixo.

## Movimento 1: o interrogatório, que começa no comando

### Confira as seis em disco

Não procure na sua lista de skills: `disable-model-invocation` tira a skill da sua vista, e três
destas apareceriam como ausentes mesmo instaladas. Rode o localizador; ele imprime, por skill, o
nome pelo qual o seu harness a chama e o caminho:

```bash
node "<pasta desta skill>/scripts/skills-do-matt.js"
```

Saiu 1: faltam as marcadas `FALTA`. Nomeie-as, dê o comando de instalação do seu harness
(`references/harness.md`, "Skills do Matt") e **pare aqui**.

### Interrogue

Invoque `grilling` e `domain-modeling` **de uma vez, antes da primeira pergunta**, na mesma leva
de chamadas — é o que o `grill-with-docs` faz (um roteador de duas linhas), e o resultado tem de
ser indistinguível de o usuário ter digitado `/grill-with-docs`. Ele está bloqueado para agentes;
as duas peças, não.

As duas valem **ao mesmo tempo**, nunca em sequência: o `grilling` conduz as rodadas e o
`domain-modeling` afia o vocabulário dentro delas — termo vago vira canônico na hora em que
aparece. Não invoque o `grill-with-docs` nem substitua as duas por perguntas suas: as skills dele
conduzem.

Rodadas de perguntas numeradas, cada uma com resposta recomendada, até a fronteira esvaziar.
Então consolide o entendimento numa tabela e peça o **sim do usuário** — a única confirmação de
conteúdo da leva inteira.

### Grave o entendimento, que é o único insumo da sessão seguinte

Dado o sim, o entendimento vira **um documento**, antes da pergunta dos modelos e da linha: a leva
roda noutra sessão, sem este histórico, e o que não estiver escrito não chega lá.

O tracker é o do projeto, e a nota nasce onde as notas dele vivem — é ela que o `to-spec` expande
in-place depois, não uma nova:

- MCP `vault-docs` na sessão → vault Obsidian pela `/obsidian-docs`, `salvar_nota tipo=spec`.
- Sem ele → o tracker que `/setup-matt-pocock-skills` configurou. Sem nenhum, os arquivos locais
  que `to-spec` e `to-tickets` já escrevem por padrão (`.scratch/<feature>/`).

O documento leva o pedido original, o vocabulário canônico do `domain-modeling`, a tabela de
decisões inteira do interrogatório e os fatos do código que as sustentam (caminho e linha).
Guarde como ela é endereçável (título da nota ou caminho do arquivo): a linha cita isso.

### Pergunte os dois modelos, e entregue a linha

Uma pergunta só, pelo mecanismo do seu harness, com duas partes, cada uma respondida por **o da
sessão** (recomendado) ou outro, que o usuário nomeia:

1. **o modelo do implement** — os agentes de sub-agents e de workflow, um por ticket, e os
   reparos deles; se a implementação rodar inline, quem executa é a própria sessão e a resposta
   não se aplica;
2. **o modelo da revisão** — os dois sub-agentes do `code-review` (Standards e Spec) e o agente
   das correções.

Podem ser diferentes; por isso são duas. `to-spec` e `to-tickets` não abrem agentes: rodam na
sessão, no modelo dela. Só o Claude Code aceita modelo por chamada de sub-agente; nos outros
harnesses (`references/harness.md`) as duas respostas são "da sessão", e a pergunta não se faz.

Então imprima o aviso e a linha para ele colar, com as lacunas preenchidas, e pare.
`<abertura>` é como o seu harness segura a sessão e nomeia esta skill ("Segurar a sessão" em
`references/harness.md`, que também diz o que o aviso acrescenta quando falta o pré-requisito);
`<documento>` é como a nota é endereçável; `<modelo do implement>` e `<modelo da revisão>` são as
duas respostas — literalmente `da sessão` quando for essa, e o nome do modelo quando o usuário
nomeou outro; os quatro nomes de skill são os do localizador, com `/` na frente. O pedido
original não vai na linha: já está no documento.

> Cole numa **sessão nova** (`/clear` ou outra janela), neste mesmo workspace. O entendimento
> está todo no documento, e a leva é longa: começar com o contexto limpo é o que dá desempenho a
> ela.

```
<abertura> até o fim — o documento é o entendimento já fechado comigo, e o
insumo desta leva. A leva está fechada quando /<to-spec> expandiu esse documento
in-place, /<to-tickets> publicou os tickets, /<implement> rodou no modo que eu
escolhi, com os agentes dele (se houver) no modelo <modelo do implement> — antes
de executá-lo me proponha os modos que este harness tem (inline, sub-agents,
workflow) e a sua recomendação —, /<code-review> revisou em dois eixos com
agentes no modelo <modelo da revisão>, todas as correções foram aplicadas com
esse mesmo modelo, o teste de qualidade passou e você me garantiu que está tudo
funcionando — sem commitar nada.
```

É essa linha que autoriza as três reservadas ao usuário (`to-spec`, `to-tickets` e `implement`):
no Claude Code, cada nome como token isolado ("Autorização" em `references/harness.md`). E
perguntar ao usuário como seguir sem ter entregado a linha não é parar.
