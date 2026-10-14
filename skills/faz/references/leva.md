# /faz leva — a leva que a linha dispara

A linha colada autoriza as três skills reservadas ao usuário — `to-spec`, `to-tickets` e
`implement-spec` —, porque é ele quem as nomeia; o `code-review` você invoca sozinho. Onde o harness
tem laço (o `/goal` do Pi e do Codex), a condição dele é a leva inteira; se a sessão não o
confirmou, diga isso ao usuário em uma linha e siga assim mesmo: a linha vale como pedido dele.

**As quatro se cumprem como o seu harness invoca skills** ("Invocar uma skill" na
referência do seu harness); seguir de memória o que a skill faria não é invocá-la, e ainda faz o
relatório dizer que ela rodou. Antes do primeiro passo, nesta ordem:

1. o localizador, `node "<pasta desta skill>/scripts/skills-do-matt.js"`;
2. onde a autorização das reservadas vale só no turno da linha ("Autorização" na
   referência do seu harness), as três em sequência — depois você as cumpre na ordem dos passos,
   com as instruções já carregadas, sem invocá-las de novo;
3. `git status --porcelain`: o que já estiver sujo não é da leva; a revisão o exclui, e ele fica
   fora do commit squash;
4. onde o harness tem painel da leva, os marcos de `references/painel.md`, a começar pelo
   `inicio`.

Para-se **uma vez**, com os tickets na mesa, para o usuário escolher o modo do implement (e, no
Claude Code, os modelos); harness com só o inline não para. Nada mais é perguntado — o conteúdo
já foi confirmado no interrogatório.

## Onde as notas vivem

O tracker é o do projeto, e é onde o documento citado na linha está: a spec cresce no mesmo
lugar, in-place, e os tickets e o fechamento ficam ao lado dela. Esta seção é a configuração de
tracker que `to-spec`, `to-tickets` e `code-review` esperam ter recebido:
`docs/agents/issue-tracker.md` ausente não pede o `/setup-matt-pocock-skills`.

- Documento no vault Obsidian (MCP `vault-docs` na sessão) → pela `/obsidian-docs`: a spec com
  `atualizar_nota`; os tickets, um por nota, com `salvar_nota tipo=plano artefato=<nota da spec>`;
  o fechamento com `salvar_nota tipo=evolucao`.
- Documento em arquivo → o tracker que `/setup-matt-pocock-skills` configurou ou, sem ele, os
  arquivos locais que `to-spec` e `to-tickets` já escrevem por padrão (`.scratch/<feature>/`), ao
  lado do documento.

## Os passos, e o que cada um produz

| Passo | Faz | Produz |
|---|---|---|
| to-spec | `to-spec <documento>`, expandindo o documento in-place; os seams vão na spec, mostrados, não perguntados | a spec com histórias, decisões de implementação e de teste, seams |
| to-tickets | `to-tickets <spec>`; a tabela é mostrada, não perguntada. Instrua o corte: `bloqueadoPor` só quando um ticket usa código que outro cria; arquivo em comum não bloqueia; o contrato compartilhado (tipo, assinatura) vira um ticket pequeno na primeira onda, para os outros partirem juntos depois | um ticket por fatia vertical, em ondas largas |
| implement | `implement-spec`, cumprida **no modo que o usuário escolheu na terceira parada** (logo abaixo): cada ticket na sua worktree, com commit no branch dele, e a conciliação de cada onda no branch da leva, que é o branch de integração dela. O `code-review`, as correções e o fechamento dela são os passos seguintes desta tabela, e o PR fica de fora: o commit vai só nesses branches, nunca na working tree principal | o branch da leva conciliado, suíte verde por ticket |
| squash | sem skill: `git merge --squash leva/<slug>` na working tree principal ("Worktrees, conciliação e squash", abaixo) | tudo da leva staged, sem commit |
| code-review | `code-review`. Com o squash staged e sem commit, o que ela ancora em `<fixo>...HEAD` é vazio por desenho: o diff é `git diff HEAD` mais os arquivos de `git ls-files --others --exclude-standard`, lidos inteiros, menos o que já estava sujo antes da leva; a lista de commits é vazia, e a checagem de diff não-vazio se faz sobre esses dois. Passe a spec como argumento (o conteúdo, via `ler_nota`, quando está no vault). Os dois sub-agentes que ela manda abrir (Standards e Spec) você mesmo abre ("Sub-agente" na referência do seu harness), no modelo da revisão escolhido na terceira parada; sem sub-agente no harness, os dois eixos rodam na sessão, um de cada vez, cada um com o seu relatório | dois relatórios, lado a lado |
| correções | sem skill: um sub-agente (ou a sessão, onde não há), no mesmo modelo da revisão, recebe os dois relatórios e aplica tudo; achado que se revela errado é recusado com o motivo. O que elas mudam entra no índice só pelos caminhos da leva (`git add <caminho>`, nunca `git add -A`) | working tree corrigida e staged, suíte verde |
| qualidade | sem skill: os verificadores do projeto; depois um script no scratchpad sobe o que der para subir (no Claude Code a skill `run` ajuda) e exercita os caminhos reais | contagem de verificações; falha causada pelo script conserta o script e reexecuta |
| fechamento | só com a qualidade verde, a ordem de "O fechamento", abaixo: versão, segredos, commit squash local, limpeza dos branches, nota de evolução no tracker | um commit local só; na nota, o que mudou, o que a revisão pegou, o que não foi verificado |

## A terceira parada: o modo do implement e os modelos

Com a tabela de tickets na mesa, pare. Pergunte, pelo mecanismo do seu harness, o **modo do
implement**: os que o harness oferece ("Os modos", abaixo), o que você recomenda pelos critérios
dali marcado como recomendado, e a razão de cada um na descrição dele. Harness com só o inline
não tem o que perguntar: diga que o modo é esse e siga.

**Os modelos vão na mesma pergunta**, só no Claude Code, o único harness que aceita modelo por
sub-agente; nos outros, todo agente roda no modelo que o harness configura. Cada um é respondido
por **o da sessão** (recomendado) ou outro, que o usuário nomeia:

- **o modelo do implement** — os agentes por ticket, os reparos deles e a conciliação; só quando
  o modo recomendado é sub-agents ou workflow. O usuário escolheu um desses no lugar do inline?
  Pergunte esse modelo logo em seguida;
- **o modelo da revisão** — os dois sub-agentes do `code-review` (Standards e Spec) e o agente
  das correções.

## Os modos: o paralelismo que compensa

Os modos que o seu harness oferece estão em "Modo do implement", na referência dele: workflow,
sub-agents e inline no Claude Code; sub-agents no Codex com `multi_agent` e no Pi com
`pi-subagents`; inline em todos. Em todos, cada ticket nasce numa worktree e só o `bloqueadoPor`
separa ondas: os tickets de uma onda podem rodar juntos mesmo mexendo nos mesmos arquivos, e a
conciliação resolve o encontro deles.

Paralelismo não é o padrão: recomende o modo pela tabela de tickets, pesando o ganho de tempo contra
o que ele custa.

- **Quanto paraleliza de fato.** Ondas de um ticket só, ou uma cadeia em que cada ticket espera o
  anterior, não ganham nada com agentes: inline. Dois ou três tickets por onda já pagam
  sub-agentes. O workflow compensa com muitas ondas largas, em que a orquestração determinística e
  a sessão livre durante a execução valem mais do que ler cada retorno.
- **O que ele custa.** Cada agente lê de novo o código que toca, e os tokens se multiplicam pelos
  agentes; cada onda paralela traz a sua conciliação; e os sub-agentes dividem a janela de 5 h com
  a sessão. Tickets pequenos (um arquivo, minutos de trabalho) custam mais em agentes do que em
  série.
- **O que ele pode quebrar.** Tickets da mesma onda que reescrevem o mesmo trecho (o mesmo tipo
  central, a mesma função, o mesmo arquivo de configuração) chegam à conciliação em conflito, e
  resolvê-lo pode custar mais do que rodá-los em série. Nesse caso, só esse par vai em ondas
  seguidas, e o resto da onda segue junto; se isso vale para a maior parte dos tickets, rode a
  leva inline, mesmo que o harness permita mais.
- **O que você precisa ver no caminho.** Sub-agents deixa você ler o retorno de cada ticket e
  ajustar o prompt do seguinte antes da próxima onda; o workflow só devolve no fim. Spec com
  pontos em aberto pede sub-agents ou inline.

Em dúvida entre dois, recomende o menos paralelo.

**Escolhido sub-agents ou workflow, paralelize o máximo.** O paralelismo não é imposto, mas,
escolhido, ele só se paga com ondas largas, e o objetivo passa a ser o menor tempo até o fim:

- só o `bloqueadoPor` real separa ondas, o de um ticket que usa código que outro cria; bloqueio
  por precaução ou por arquivo em comum sai, e a conciliação resolve o encontro;
- a onda inteira dispara de uma vez, nunca um agente esperando outro da mesma onda;
- o contrato que prenderia vários tickets (um tipo, uma assinatura) vira um ticket pequeno na
  primeira onda, para os outros partirem juntos na seguinte;
- ticket grande que segura a onda seguinte sozinho se divide, onde a spec permite, em partes que
  rodam juntas.

**O que cada modo cumpre igual.** O preâmbulo — o `PREAMBULO` de
`workflow-tickets.md`, ao lado deste arquivo: TDD nos seams acordados,
verificação frequente, a suíte inteira no fim, commit só no branch do ticket, nunca na working
tree principal, e nenhum ticket sobe a `# Versao` do `SKILL.md` nem o `plugin.json` —, o portão
booleano e as notas que passam de um ticket ao seguinte são os mesmos nos três;
muda quem os executa:

- **workflow** (só no Claude Code): o esqueleto de `workflow-tickets.md`, sem
  mudanças: em ondas, os tickets de cada onda juntos, um agente por worktree, e a conciliação ao
  fim de cada onda.
- **sub-agents**: a onda inteira dispara junta, um sub-agente por ticket ("Sub-agente" na
  referência do seu harness), no modelo do implement, cada um na sua worktree. O prompt de cada
  um é o preâmbulo mais as notas dos tickets já conciliados e, onde há painel, as linhas dos
  marcos do próprio ticket (`marcos` de `workflow-tickets.md`), e o portão é você lendo o que ele
  devolve. Fechada a onda, um sub-agente no modelo do implement concilia.
- **inline**: você, um ticket por vez, cada um na sua worktree. O portão roda antes de passar
  ao próximo, e fechada a onda você mesmo concilia.

## Worktrees, conciliação e squash

- **Branches.** No começo do implement, o branch da leva `leva/<slug>` nasce do `HEAD`
  (`git branch leva/<slug> HEAD`), com o `<slug>` tirado do título do documento; a working tree
  principal fica no branch de onde a leva partiu. Cada ticket ganha `leva/<slug>-<n>` a partir da
  ponta do branch da leva: `git worktree add -b leva/<slug>-<n> <pasta> leva/<slug>`, com a pasta
  fora da working tree principal (o scratchpad, onde há). Dependência que o `.gitignore` deixa de
  fora (`node_modules`, venv) e a verificação pede se instala em cada worktree.
- **Conciliação**, ao fim de cada onda, automática e sem perguntar nada: numa worktree do branch
  da leva (`git worktree add <pasta> leva/<slug>`), um `git merge --no-ff leva/<slug>-<n>` por
  ticket verde da onda, os conflitos resolvidos ali, e a verificação inteira depois de cada merge,
  com até dois reparos commitados no branch da leva. A onda seguinte parte da ponta conciliada;
  ticket nunca é refeito porque a base mudou.
- **Squash**, depois do implement, na working tree principal: antes, compare
  `git diff --name-only HEAD leva/<slug>` com os sujos de antes da leva. Sujo que o squash
  sobrescreveria interrompe a leva ali, sem squash, e o relatório diz qual é. Sem colisão,
  `git merge --squash leva/<slug>`: tudo da leva fica staged, sem commit, e a revisão, as
  correções e a qualidade rodam sobre isso.
- **Sem git ou sem commit no repositório**, a worktree não nasce: os tickets rodam em cadeia na
  working tree principal, sem commit, sem conciliação e sem squash, e o fechamento não commita.
  Diga isso ao usuário e sugira iniciar o git e fazer o primeiro commit (o commit é dele).
- **Retomada:** a leva interrompida continua da ponta do branch da leva; o que já foi conciliado
  não se refaz.

## O fechamento

Só com a qualidade verde, nesta ordem, na working tree principal:

1. a versão sobe **uma vez**, aqui, onde o projeto versiona — neste repositório, a `# Versao` do
   `SKILL.md` de cada skill mexida e a patch ou a minor do `.claude-plugin/plugin.json`,
   conferidas por `python scripts/validar_repo.py` —, e entra no índice;
2. o varredor de segredos do `/cpv`: `node skills/cpv/scripts/segredos.js <raiz>` neste
   repositório; em outro, o `scripts/segredos.js` da skill `cpv` instalada. Só segue com a última
   linha começando com `LIMPO`;
3. o commit squash, local: `git commit -m "<mensagem>" -- <caminhos da leva>` (os do
   `git diff --cached --name-only HEAD`, fora os sujos de antes dela, que o pathspec deixa de
   fora), com a mensagem no estilo do `git log` do repositório e a autoria do usuário (o
   `user.name` e o `user.email` do git), sem `Co-Authored-By` nem trailer de assistente. **Nunca
   push**: enviar à origem é do `/cpv`, que o usuário digita;
4. a limpeza: `git worktree remove --force` de cada worktree da leva, `git worktree prune` e
   `git branch -D` do branch da leva e dos `leva/<slug>-<n>`. No Windows a remoção falha com
   arquivo preso por processo: apague a pasta, rode o `git worktree prune` de novo e apague o
   branch; worktree ou branch `leva/*` órfão de leva já fechada sai junto;
5. a nota de evolução no tracker;
6. onde há painel, o marco `fechamento` — depois do commit, que o hook `so_com_pedido` só libera
   com a leva aberta.

Qualidade vermelha, segredo achado ou validação reprovada: o commit squash não acontece; tudo
fica staged, o branch da leva fica (o trabalho está commitado nele), a nota segue, e o relatório diz
por quê.

## Quando algo trava

- Ticket vermelho depois dos dois reparos para **só ele e os que dependem dele**, em qualquer
  modo: o branch dele não entra na conciliação, e os independentes seguem. O relatório diz qual
  ficou, e os passos seguintes rodam sobre os tickets que fecharam.
- Conciliação vermelha depois dos dois reparos desfaz o merge daquele ticket
  (`git reset --hard` para a ponta de antes dele) e o para, com os que dependem dele; os outros da
  onda seguem conciliando.
- A conciliação que acha o branch da leva já vermelho, antes de qualquer merge, para o implement
  inteiro, com `entregues`, `parados` e `pendentes` no retorno. Rode a verificação você mesmo,
  conserte o que for do portão ou do código, e retome do próximo (fim de `workflow-tickets.md`) —
  **uma vez**. Vermelho de novo: o implement para ali, os passos seguintes rodam sobre os tickets
  conciliados, e o relatório diz qual ficou.
- Passo bloqueado por causa externa (túnel, credencial, rede) é relatado com o
  motivo; os seguintes continuam sobre o que está pronto.
- Verificado é o que você viu na saída. O relatório final separa o que foi
  exercitado do que não foi (a interface que ninguém abriu no navegador).
