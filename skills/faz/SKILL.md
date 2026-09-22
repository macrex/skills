---
name: faz
description: Faz uma leva inteira a partir de um pedido — do interrogatório à validação — quando o usuário digita /faz <pedido>, e cumpre a leva quando ele cola a linha de /goal que nomeia /faz leva <documento>. Só por invocação do usuário.
argument-hint: <o que fazer>
disable-model-invocation: true
---

# /faz — do pedido à leva verificada

# Versao: 3.4

Esta skill **simplifica um fluxo que já existe**, o SDD/TDD do
[Matt Pocock](https://github.com/mattpocock/skills): as skills dele fazem o
trabalho, esta só encadeia e para três vezes para o usuário decidir. São dois
movimentos porque metade das skills dele é reservada ao usuário: `/faz <pedido>`
é o primeiro, do comando ao fim do interrogatório; `/faz leva <documento>` é o
segundo, disparado numa sessão nova pela linha de `/goal` que o primeiro entrega
pronta — o `/goal` é o que segura a sessão até a leva fechar, com todas as
chamadas dentro do laço dele.

## Qual dos dois você está cumprindo

O pedido começa com o token `leva` e cita um documento (título de nota ou
caminho), ou nomeia `/mattpocock-skills:to-spec` (ou `/to-spec`)? Então ele é a
linha que o movimento 1 imprimiu, e o que vale é `references/leva.md`: leia-o
com a ferramenta `Read` e cumpra aquele arquivo, porque nada desta página se
aplica ali. O caminho sai da base desta skill (o cabeçalho "Base directory for this
skill" que veio com ela); sem ele,
`ls -d "${CLAUDE_PLUGIN_ROOT}/skills/faz" ~/.claude/skills/faz ./.claude/skills/faz 2>/dev/null`. Qualquer outro pedido é o
movimento 1, abaixo.

## Movimento 1: o interrogatório, que começa no comando

### Confira as seis em disco

Não procure na sua lista de skills: `disable-model-invocation` tira a skill da
sua vista, e três destas apareceriam como ausentes mesmo instaladas. Procure os
arquivos, nas três rotas de instalação — plugin do Claude Code, `npx skills add`
no perfil e `npx skills add` no projeto:

```bash
ls -d ~/.claude/skills/{grilling,domain-modeling,to-spec,to-tickets,implement,code-review} \
      ./.claude/skills/{grilling,domain-modeling,to-spec,to-tickets,implement,code-review} \
      ~/.claude/plugins/cache/*/mattpocock-skills/*/skills/*/{grilling,domain-modeling,to-spec,to-tickets,implement,code-review} \
      2>/dev/null | sort
```

Cada linha é uma skill achada, e o caminho diz a rota. Faltou alguma das seis,
nomeie as que faltaram, ofereça as duas formas de instalar e **pare aqui**:

```
/plugin install mattpocock-skills          # Claude Code
npx skills@latest add mattpocock/skills    # qualquer agente
```

O prefixo dos nomes vem da rota: achadas em `plugins/cache`, as skills chamam-se
`mattpocock-skills:<skill>`, como esta skill as escreve; achadas em `skills/`,
chamam-se só `<skill>` — invoque `grilling` e `domain-modeling` assim, e tire o
`mattpocock-skills:` dos quatro nomes da linha que você entrega. Sem prefixo,
`code-review` colide com a skill nativa do Claude Code de mesmo nome: no Claude
Code, instale pelo plugin.

### Interrogue

Invoque as duas **de uma vez, antes da primeira pergunta**: `grilling` e
`domain-modeling`, na mesma leva de chamadas. É literalmente o que o
`grill-with-docs` faz — um roteador de duas linhas que chama essas duas —, e o
resultado tem de ser indistinguível de o usuário ter digitado
`/mattpocock-skills:grill-with-docs` ele mesmo. Ele está bloqueado para agentes;
as duas peças, não.

As duas valem **ao mesmo tempo**, nunca em sequência: o `grilling` conduz as
rodadas e o `domain-modeling` afia o vocabulário dentro delas — termo vago vira
termo canônico na hora em que aparece, não num passo depois. Não tente invocar o
`grill-with-docs`, nem substituir as duas por perguntas suas: as skills dele é
que conduzem.

Rodadas de perguntas numeradas, cada uma com sua resposta recomendada, até a
fronteira esvaziar. Então consolide o entendimento numa tabela e peça o **sim do
usuário** — é a única confirmação de conteúdo da leva inteira.

### Grave o entendimento, que é o único insumo da sessão seguinte

Dado o sim, o entendimento vira **um documento**, antes da pergunta dos modelos
e antes da linha. A leva roda noutra sessão, que não terá este histórico: o que não
estiver escrito não chega lá.

O tracker é o do projeto, não desta skill, e a nota nasce onde as notas dele
vivem — é ela que o `to-spec` expande in-place depois, não uma nova:

- MCP `vault-docs` na sessão → vault Obsidian pela `/obsidian-docs`,
  `salvar_nota tipo=spec`.
- Sem ele → o tracker que `/setup-matt-pocock-skills` configurou. Sem nenhum,
  os arquivos locais que `to-spec` e `to-tickets` já escrevem por padrão
  (`.scratch/<feature>/`).

O documento leva o pedido original, o vocabulário canônico que o
`domain-modeling` firmou, a tabela de decisões inteira do interrogatório e os
fatos do código que as sustentam (com caminho e linha).

Guarde como ela é endereçável — o título da nota, ou o caminho do arquivo: a
linha que você entrega cita isso.

### Pergunte os dois modelos, e entregue a linha

Uma chamada só de `AskUserQuestion`, com duas perguntas, cada uma respondida por
**o da sessão** (recomendado) ou outro, que o usuário nomeia:

1. **o modelo do implement** — os agentes de sub-agents e de workflow, um por
   ticket, e os reparos deles; se a implementação acabar rodando inline, quem
   executa ali é a própria sessão e a resposta não se aplica;
2. **o modelo da revisão** — os dois sub-agentes do `code-review` (Standards e
   Spec) e o agente das correções.

Os dois podem ser diferentes; é para isso que são duas perguntas. `to-spec` e
`to-tickets` não abrem agentes: rodam na sessão, no modelo dela.

Então imprima o aviso e a linha para ele colar, com três coisas substituídas, e
pare. `<documento>` é como a nota é endereçável; `<modelo do implement>` e
`<modelo da revisão>`, as duas respostas — literalmente `da sessão` quando for
essa, que na outra ponta significa `model` omitido nos agentes, e o nome do
modelo quando o usuário nomeou outro. O pedido original não vai na linha: já
está no documento.

A linha é um `/goal`: a condição dele é a leva inteira, e o Claude Code segura a
sessão até ela valer — é o laço que leva a leva até o fim sem o usuário empurrar.
O `/goal` só existe em workspace **confiado** (diálogo de confiança aceito);
noutro, o Claude Code nem o despacha e a linha vira pedido comum, sem o laço.
Confira antes de imprimir: em `~/.claude.json`,
`projects["<cwd>"].hasTrustDialogAccepted` é `true`. Não é — diga isso no aviso.

> Cole numa **sessão nova** (`/clear` ou outra janela), neste mesmo workspace. O
> entendimento está todo no documento, e a leva é longa: começar com o contexto
> limpo é o que dá desempenho a ela.

```
/goal rode /faz leva <documento> até o fim — o documento é o entendimento já
fechado comigo, e o insumo desta leva. A leva está fechada quando
/mattpocock-skills:to-spec expandiu esse documento in-place,
/mattpocock-skills:to-tickets publicou os tickets, /mattpocock-skills:implement
rodou no modo que eu escolhi, com os agentes dele (se houver) no modelo
<modelo do implement> — antes de executá-lo me proponha os três modos (inline,
sub-agents, workflow) e a sua recomendação —, /mattpocock-skills:code-review
revisou em dois eixos com agentes no modelo <modelo da revisão>, todas as
correções foram aplicadas com esse mesmo modelo, o teste de qualidade passou e
você me garantiu que está tudo funcionando — sem commitar nada.
```

É essa linha que autoriza esta skill e as três reservadas ao usuário —
`to-spec`, `to-tickets` e `implement` —, e o que as destrava é ele nomeá-las
**como token isolado**: o Claude Code procura `/<skill>` precedido e seguido de
espaço (ou fim de linha) nas mensagens do usuário do turno corrente, e a
condição do `/goal` chega ao modelo dentro do kickoff dele (`A session-scoped
Stop hook is now active with condition: "..."`), que conta como tal. Pontuação
colada ao nome (`/mattpocock-skills:to-tickets,`) cega a busca e a skill é
recusada — ao imprimir a linha, `/faz` e cada um dos três nomes ficam seguidos
de espaço. O `code-review`, que a linha também nomeia, você invoca sozinho.

**As quatro se cumprem pela ferramenta `Skill`, nunca lendo o `SKILL.md` delas.**
Dar `cat` no arquivo de uma skill e seguir o texto à mão não é invocá-la: perde
os sub-agentes que ela abre e o rigor que ela cobra, e ainda faz o relatório
dizer que ela rodou. Recusa da ferramenta `Skill` numa das três é turno expirado
— peça ao usuário que cole o nome de novo, sozinho numa linha, e espere. Não
tente contornar — não replique o que essas skills fazem, não pergunte ao
usuário como seguir sem ter entregado a linha.
