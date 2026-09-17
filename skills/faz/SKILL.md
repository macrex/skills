---
name: faz
description: Faz uma leva inteira a partir de um pedido — do interrogatório à validação — quando o usuário digita /faz <pedido>. Só por invocação do usuário.
argument-hint: <o que fazer>
disable-model-invocation: true
---

# /faz — do pedido à leva verificada

# Versao: 3

Esta skill **simplifica um fluxo que já existe**, o SDD/TDD do
[Matt Pocock](https://github.com/mattpocock/skills): as skills dele fazem o
trabalho, esta só encadeia e para três vezes para o usuário decidir. São dois
movimentos porque metade das skills dele é reservada ao usuário: este arquivo é
o primeiro, do comando ao fim do interrogatório; `references/movimento-2.md` é
o segundo, disparado numa sessão nova pela linha de `/goal` que o primeiro
entrega pronta.

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
`mattpocock-skills:` dos quatro nomes da linha do `/goal`. Sem prefixo,
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

Dado o sim, o entendimento vira **um documento**, antes da pergunta do modelo e
antes da linha. A leva roda noutra sessão, que não terá este histórico: o que não
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
linha do `/goal` cita isso.

### Pergunte o modelo, e entregue a linha

Uma pergunta só (`AskUserQuestion`): **o modelo dos agentes desta leva** — o da
sessão (recomendado) ou outro, que o usuário nomeia. Ele vale para os agentes de
sub-agents, de workflow, do `code-review` e das correções; se a implementação
acabar rodando inline, quem executa ali é a própria sessão.

Então imprima o aviso e a linha para ele colar, com três coisas substituídas, e
pare. `<movimento-2>` é o caminho absoluto de `references/movimento-2.md` desta
skill, na forma que a ferramenta `Read` aceita (no Windows, `C:\...`): a base
está no cabeçalho "Base directory for this skill" que veio com esta skill; sem
ele, `ls -d ~/.claude/skills/faz ./.claude/skills/faz`. `<documento>` é como a
nota é endereçável; `<modelo>`, a resposta da pergunta — literalmente
`da sessão` quando for essa, que na outra ponta significa `model` omitido nos
agentes, e o nome do modelo quando o usuário nomeou outro. O pedido original não
vai na linha: já está no documento.

> Cole numa **sessão nova** (`/clear` ou outra janela). O entendimento está todo
> no documento, e a leva é longa: começar com o contexto limpo é o que dá
> desempenho a ela.

```
/goal leia <movimento-2> com a ferramenta Read e siga-o: é o movimento 2 da
skill faz, que não está na sua lista de skills. Leia <documento> — é o
entendimento já fechado comigo, e o insumo desta leva. Faça um
/mattpocock-skills:to-spec expandindo esse documento in-place, depois um
/mattpocock-skills:to-tickets e então /mattpocock-skills:implement — e antes de
executá-lo me proponha os três modos (inline, sub-agents, workflow) e a sua
recomendação —, valide com
/mattpocock-skills:code-review em dois eixos com agentes no modelo <modelo>,
aplique todas as correções com o mesmo modelo, faça um teste de qualidade e me
garanta que está tudo funcionando — sem commitar nada.
```

É essa linha que autoriza as três reservadas ao usuário — `to-spec`,
`to-tickets` e `implement` —, e o que as destrava é ele nomeá-las **como token
isolado**: o Claude Code procura `/<skill>` precedido e seguido de espaço (ou
fim de linha) nas mensagens do usuário do turno corrente. Pontuação colada ao
nome (`/mattpocock-skills:to-tickets,`) cega a busca e a skill é recusada — ao
imprimir a linha, cada um dos três nomes fica seguido de espaço. O
`code-review`, que a linha também nomeia, você invoca sozinho. Não tente
contornar — não replique o que essas skills fazem, não pergunte ao usuário como
seguir sem ter entregado a linha.
