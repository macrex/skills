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

**A leva não para.** O conteúdo foi confirmado no interrogatório, e o modo do implement e os
modelos estão na seção `## Execução` do documento ("A execução", abaixo): nada é perguntado.

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
| to-tickets | `to-tickets <spec>`; a tabela é mostrada, não perguntada. Instrua o corte: `bloqueadoPor` quando um ticket usa código que outro cria ou reescreve o mesmo trecho que ele; arquivo em comum, em trechos diferentes, não bloqueia. No modo paralelo, as ondas o mais largas que esse acoplamento deixa ("O modo", abaixo) | um ticket por fatia vertical, em ondas separadas só pelo acoplamento real |
| implement | `implement-spec`, cumprida **no modo da seção `## Execução` do documento** ("A execução", logo abaixo): cada ticket na sua worktree, com commit no branch dele, e a conciliação de cada onda no branch da leva, que é o branch de integração dela. O `code-review`, as correções e o fechamento dela são os passos seguintes desta tabela, e o PR fica de fora: o commit vai só nesses branches, nunca na working tree principal | o branch da leva conciliado, suíte verde por ticket |
| squash | sem skill: `git merge --squash leva/<slug>` na working tree principal ("Worktrees, conciliação e squash", abaixo) | tudo da leva staged, sem commit |
| code-review | `code-review`. Com o squash staged e sem commit, o que ela ancora em `<fixo>...HEAD` é vazio por desenho: o diff é `git diff HEAD` mais os arquivos de `git ls-files --others --exclude-standard`, lidos inteiros, menos o que já estava sujo antes da leva; a lista de commits é vazia, e a checagem de diff não-vazio se faz sobre esses dois. Passe a spec como argumento (o conteúdo, via `ler_nota`, quando está no vault). Os dois sub-agentes que ela manda abrir (Standards e Spec) você mesmo abre ("Sub-agente" na referência do seu harness), no modelo da revisão do documento; sem sub-agente no harness, os dois eixos rodam na sessão, um de cada vez, cada um com o seu relatório | dois relatórios, lado a lado |
| correções | sem skill: um sub-agente (ou a sessão, onde não há), no mesmo modelo da revisão, recebe os dois relatórios e aplica tudo; achado que se revela errado é recusado com o motivo. O que elas mudam entra no índice só pelos caminhos da leva (`git add <caminho>`, nunca `git add -A`) | working tree corrigida e staged, suíte verde |
| qualidade | sem skill: os verificadores do projeto; depois um script no scratchpad sobe o que der para subir (no Claude Code a skill `run` ajuda) e exercita os caminhos reais | contagem de verificações; falha causada pelo script conserta o script e reexecuta |
| fechamento | só com a qualidade verde, a ordem de "O fechamento", abaixo: versão, segredos, commit squash local, limpeza dos branches, nota de evolução no tracker | um commit local só; na nota, o que mudou, o que a revisão pegou, o que não foi verificado e os tempos, previsto contra real |

## A execução: o modo e os modelos, já no documento

O fim do interrogatório gravou no documento a seção `## Execução`: o **modo do implement**, a
previsão de tickets que o sustentou e, no Claude Code, o **modelo do implement** (os agentes por
ticket, os reparos deles e a conciliação; só nos modos sub-agents e workflow) e o **modelo da
revisão** (os dois sub-agentes do `code-review` e o agente das correções). "O da sessão" é
`model` omitido; nos outros harnesses, todo agente roda no modelo que o harness configura.

Siga o modo do documento mesmo que a tabela de tickets saia diferente da previsão: diga em uma
linha, antes do implement, o modo e se a tabela confirmou a previsão, e a nota de evolução
registra a diferença. Documento sem a seção (entendimento anterior a ela): escolha o modo por "O
modo", abaixo, com os modelos da sessão, e diga qual e por quê em uma linha. Nos dois casos, siga
sem perguntar.

## A previsão de tempo

Publicada a tabela do `to-tickets`, antes do implement, preveja em minutos inteiros quanto cada
ticket vai levar e quanto a leva inteira vai levar, do `inicio` ao `fechamento` (o que já passou
conta). **O tempo é o da máquina**: o seu, com as ferramentas, os sub-agentes e os verificadores
rodando — nunca o de um desenvolvedor humano escrevendo o código, a âncora que mais erra: nas
primeiras levas medidas, ela previu de 2 a 5 vezes o real dos tickets de código e ficou abaixo do
real dos que rodam e2e ou bateria. A espera pelo usuário (permissão pendente, a sessão parada até
ele digitar) não entra; o painel a mede à parte.

Antes de prever, leia a calibração do projeto: no Claude Code, ela vem no resultado do marco `fase`
`tickets`; nos outros harnesses, na seção `## Calibração` do `time.md` da raiz, quando ele existe.
Para cada ticket:

1. dê o **perfil**, pelo mais pesado que o portão dele vai rodar: `texto` (só .md ou
   configuração), `unidade` (a suíte de unidade), `tela` (interface conferida no navegador) ou
   `pesado` (e2e, bateria ou build de minutos);
2. parta do Real (mediana) do perfil **no modo da leva** e ajuste pela profundidade e pelo
   acoplamento do ticket contra os do Registro do `time.md`; o Real/previsto diz para que lado as
   previsões anteriores erraram. Os tickets de uma onda paralela dividem a máquina — o e2e e a
   bateria de um atrasam os outros —, então o real de cada um é o que ele leva com a onda inteira
   rodando (o Juntos da calibração diz com quantos); sem linha do perfil no modo, parta da de outro
   modo e diga que o fez;
3. no `pesado`, conte os verificadores que o portão roda pela duração que eles têm no projeto e uma
   repetição da parte instável: é ali que o real passa do previsto.

A leva inteira **nunca é a soma dos tickets no modo paralelo**: os de uma onda correm no mesmo
relógio, e cada onda dura o seu ticket mais longo, mais a conciliação que espera por ele. Some as
ondas, confira o implement contra o Tickets/implement do modo na calibração (quanto de ticket cabe
em cada minuto de implement) e acrescente o Real das fases `revisao`, `correcoes` e `qualidade`. No
inline, a soma dos tickets e das conciliações é o implement. Sem calibração, o
julgamento segue o mesmo princípio: minutos de máquina, com o portão pesando mais que o código. A
previsão e o perfil vão no marco `tickets` (`references/painel.md`), e o painel os mostra contra o
tempo da máquina, que ele mesmo mede; diga a previsão ao usuário na linha do modo. No fechamento, o
painel grava a leva no `time.md` da raiz, de onde a previsão seguinte parte, e a nota de evolução
leva a tabela ao vault ("O fechamento", abaixo).

## O modo: o paralelismo que o acoplamento deixa

Os modos que o seu harness oferece estão em "Modo do implement", na referência dele: workflow,
sub-agents e inline no Claude Code; sub-agents no Codex com `multi_agent` e no Pi com
`pi-subagents`; inline em todos. Em todos, cada ticket nasce numa worktree e só o `bloqueadoPor`
separa ondas.

O objetivo é o **máximo de paralelismo que a complexidade e o acoplamento dos tickets permitem**,
não o máximo que o harness oferece. Pese três coisas na tabela de tickets (no interrogatório, na
previsão dela):

- **Acoplamento.** Tickets que reescrevem o mesmo trecho (o mesmo tipo central, a mesma função, o
  mesmo arquivo de configuração), ou que dependem de uma decisão que o anterior toma no código,
  chegam à conciliação em conflito, e resolvê-lo custa mais do que rodá-los em série. Tocar o
  mesmo arquivo em trechos diferentes não é acoplamento: a conciliação resolve. Acoplado só um
  par? Ele vai em ondas seguidas, e o resto da onda segue junto. A maior parte dos tickets
  acoplada? Inline: a continuidade vê o conflito antes de ele acontecer, o que nenhum repasse
  conta.
- **Complexidade por ticket.** Ticket fundo (explora o código sozinho, mexe em vários arquivos,
  leva mais que minutos) ganha com um agente que chega limpo e com atenção cheia. Ticket raso (a
  spec já diz onde mexer, um arquivo, minutos) custa mais em agente do que em série: cada agente
  lê de novo o código que toca, os tokens se multiplicam pelos agentes, cada onda paralela traz a
  sua conciliação, e os sub-agentes dividem a janela de 5 h com a sessão.
- **Volume.** A soma dos tickets não cabe numa sessão? Sai do inline: a qualidade cai no fim da
  leva.

Daí o modo:

- **inline** — tickets acoplados, rasos, ou em cadeia (ondas de um ticket só), com o volume
  cabendo na sessão.
- **sub-agents** — ondas com tickets fundos e independentes entre si, ou spec com pontos em
  aberto: você lê o retorno de cada ticket e ajusta o prompt do seguinte antes da próxima onda.
- **workflow** (só no Claude Code) — muitas ondas largas de tickets independentes, com portão
  forte (suíte e tipos que reprovam de verdade): a orquestração determinística e a sessão livre
  valem mais do que ler cada retorno, que ele só devolve no fim.

Em dúvida entre dois, o menos paralelo.

**No modo paralelo, as ondas o mais largas que o acoplamento deixa**, porque o paralelismo só se
paga com elas:

- só o `bloqueadoPor` real separa ondas: o ticket que usa código que outro cria ou reescreve o
  mesmo trecho que ele; bloqueio por precaução sai;
- a onda inteira dispara de uma vez, nunca um agente esperando outro da mesma onda;
- o contrato que prenderia vários tickets (um tipo, uma assinatura) vira um ticket pequeno na
  primeira onda, para os outros partirem juntos na seguinte;
- ticket grande que segura a onda seguinte sozinho se divide, onde a spec permite, em partes que
  rodam juntas.

**O que cada modo cumpre igual.** O preâmbulo — o `PREAMBULO` de
`workflow-tickets.md`, ao lado deste arquivo: TDD nos seams acordados,
verificação frequente, o portão do ticket no fim (a suíte e os verificadores de minutos, e do pesado —
o e2e no navegador, as baterias — só a parte que cobre o que ele mudou: o pesado inteiro roda na
conciliação, com a máquina livre, porque rodado por tickets paralelos ao mesmo tempo ele disputa a
máquina e falha à toa), uma repetição só, sozinha, da parte que falha, relatada como instável quando
passa, commit só no branch do ticket, nunca na working
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
  devolve. A conciliação não espera a onda fechar, onde o harness manda mensagem a um sub-agente
  ("Mensagem a um sub-agente" na referência dele): o primeiro ticket verde abre o sub-agente que
  concilia, no modelo do implement, com o prompt de `conciliar` só com ele e a linha "outros
  tickets da onda chegam por mensagem: depois do merge e da rápida de cada um, devolva o que fez e
  espere, com o item em espera no painel; a inteira e a remoção, só quando a mensagem disser que a onda fechou". Cada verde
  seguinte vai a ele por mensagem, na ordem em que chega; a última, depois que o último ticket da
  onda voltou, diz que ela fechou e traz as worktrees e os branches a remover. Assim só a rápida
  roda enquanto os outros tickets trabalham, e a inteira, com a máquina livre. Sem mensagem a
  sub-agente, fechada a onda, um sub-agente no modelo do implement concilia.
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
  ticket verde da onda, os conflitos resolvidos ali, a verificação rápida (os comandos de
  segundos e os testes dos arquivos que o merge trouxe, nunca a suíte que leva minutos) depois de
  cada merge e a inteira (a suíte, o e2e, as baterias) uma vez, depois do último, um comando por
  vez, com até dois reparos commitados no branch da leva. A ponta de antes da onda não se
  reverifica: a conciliação anterior já rodou a inteira sobre ela, e na primeira onda o portão de
  cada ticket rodou sobre ela; nem a árvore que acabou de
  passar, só porque ganhou um commit. A onda seguinte parte da ponta conciliada; ticket nunca é
  refeito porque a base mudou.
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
5. onde há painel, o marco `fechamento` — depois do commit, que o hook `so_com_pedido` só libera
   com a leva aberta. O resultado dele traz a tabela dos tempos, previsto contra real, e o painel
   grava a leva no `time.md` da raiz, que fica na working tree, fora do commit da leva: nunca o
   commite nem o descarte;
6. a nota de evolução no tracker, com a seção `## Tempos`: a tabela do resultado do `fechamento`
   como veio, e uma frase sobre o maior desvio. Sem painel, a seção leva só as previsões. As
   falhas instáveis que os portões e as conciliações relataram vão nas Pendências, com o texto
   literal e o que rodava junto, para o projeto corrigir.

Qualidade vermelha, segredo achado ou validação reprovada: o commit squash e o `fechamento` não
acontecem; tudo fica staged, o branch da leva fica (o trabalho está commitado nele), a nota segue
com as previsões em `## Tempos`, e o relatório diz por quê.

## Quando algo trava

- Ticket vermelho depois dos dois reparos para **só ele e os que dependem dele**, em qualquer
  modo: o branch dele não entra na conciliação, e os independentes seguem. O relatório diz qual
  ficou, e os passos seguintes rodam sobre os tickets que fecharam.
- Conciliação vermelha depois dos dois reparos desfaz o merge do ticket culpado — o da rápida
  vermelha ou, na inteira do fim, o que a falha toca ou o `git bisect` aponta — (`git reset --hard`
  para a ponta de antes dele) e o para, com os que dependem dele; os outros da onda seguem
  conciliando.
- A conciliação cuja falha já está na ponta de antes da onda desfaz todos os merges e para o implement
  inteiro, com `entregues`, `parados` e `pendentes` no retorno. Rode a verificação você mesmo,
  conserte o que for do portão ou do código, e retome do próximo (fim de `workflow-tickets.md`) —
  **uma vez**. Vermelho de novo: o implement para ali, os passos seguintes rodam sobre os tickets
  conciliados, e o relatório diz qual ficou.
- Passo bloqueado por causa externa (túnel, credencial, rede) é relatado com o
  motivo; os seguintes continuam sobre o que está pronto.
- Verificado é o que você viu na saída. O relatório final separa o que foi
  exercitado do que não foi (a interface que ninguém abriu no navegador).
