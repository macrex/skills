---
name: obsidian-docs
description: >
  Documentação de projeto no vault Obsidian, pelo MCP vault-docs: a nota nasce no
  vault, nunca como .md no repositório. Use SEMPRE que o usuário quiser registrar,
  escrever, guardar ou consultar qualquer decisão ou documento de um projeto de
  software, mesmo sem dizer "vault", "Obsidian" ou "documentar": spec ou plano de
  feature, ADR e decisão de arquitetura, relatório de bug com reprodução e
  hipótese, evolução ou fechamento de leva, plano de migração, pesquisa
  comparativa, análise, "anota isso pra depois", "onde decidimos X", "por que
  fizemos assim", marcar plano como concluído, migrar docs antigas de docs/ para o
  vault (migrar, migrar tudo), e atualizar o Mapa do Código depois do graphify.
  Dispara com /obsidian-docs. Não é para README, CLAUDE.md, docstrings, Swagger,
  comentário de PR ou commit.
argument-hint: [migrar|migrar tudo]
---

# obsidian-docs — documentação de projetos no Obsidian

# Versao: 15.4

Todo acesso ao vault é pelo MCP `vault-docs`, que aplica as convenções (pasta por tipo, nome
datado, frontmatter, entrada no hub e no `Home.md`, commit → `pull --rebase` → push). Você decide
**o quê** documentar e escreve o conteúdo; ele cuida do **como**. **NUNCA** Read/Grep/Glob/Write/Edit
nos arquivos do vault, nem `git` nele: por fora do servidor nascem notas órfãs.

## Se as ferramentas do vault não estão na sessão

Qualquer ferramenta do servidor `vault-docs` conta, seja qual for o prefixo do harness. Sem
nenhuma, leia `references/registrar-mcp.md` (o que conferir e como registrar no Claude Code, no Pi,
no Codex e no Antigravity), faça tudo que não depende do vault, diga que a gravação ficou pendente
e encerre o turno com isso claro.

## Quando usar cada ferramenta

Leia em funil, porque cada leitura entra no contexto de tudo que vem depois: `contexto_projeto`
para entrar num projeto (`visao_geral` se o nome é incerto; o hub inteiro só para o índice
completo), `buscar` e `conexoes` para achar, e só então `ler_nota` na nota certa, com `secao=`
quando basta uma parte. O porquê de uma decisão está no vault; o que o código é agora, no grafo do
graphify, que é opcional (`mapa_codigo` antes de mexer, `consultar_codigo` para arquitetura).

## Regra dura

- Todo artefato `.md` de documentação nasce no vault via `salvar_nota`, e o que já existe muda
  in-place com `atualizar_nota`. No repo do projeto ficam só os operacionais que ferramentas leem
  em lugar fixo: `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `README.md`, configs.
- Projeto = nome da pasta do repo git, minúsculo, sem acento. **Hub existente sempre ganha**: na
  primeira gravação da sessão num projeto, `contexto_projeto` (ou `visao_geral`) para não duplicar
  — repo `pagamentos-repo` pertence ao hub `pagamentos` que já existe. Projeto novo de verdade →
  `salvar_nota` com `descricao_projeto` (1 linha) e `repo` (caminho local).

## Escrever uma nota

O servidor avisa o que foge do padrão (nunca recusa), e `validar tipo=padrao` o lista no vault.

- `tipo` → pasta: `spec`/`plano` → `Specs/`; `bug` → `Bugs/`; `evolucao` → `Evolucoes/`;
  `arquitetura`/`adr` → `Arquitetura/`; `analise` (pesquisa, estudo, relatório, review) →
  `Analises/`; `mapa` → `Mapa do Codigo <projeto>.md` na raiz do projeto (regrava).
- `titulo` até 80 caracteres, acento permitido, sem data nem sufixo de tipo: a nota vira
  `YYYY-MM-DD <titulo>.md` (hoje, ou `data`). `resumo`: uma frase de até 200 caracteres com o que a
  nota decide ou entrega; vira a entrada no hub, e hash de commit vai no corpo. `tags`: 1 a 3.
- `corpo` para quem não viu esta sessão: frases completas, um parágrafo por ideia, termos por
  extenso; sem cadeias de setas, abreviações inventadas ou rótulos desta conversa. Abre em prosa e segue nas seções do tipo — `evolucao`: `## O que mudou`,
  `## Verificação`, `## Pendências`; `bug`: `## Sintoma`, `## Causa`, `## Correção`;
  `spec`/`plano`: `## Objetivo`, `## Fora de escopo`; `adr`: `## Contexto`, `## Decisão`,
  `## Consequências`; `analise`: `## Achados`, `## Recomendação`; tickets, `arquitetura`, `mapa` e anexos ficam
  de fora. Título e
  link do hub o servidor põe. Toda nota linka por `[[nome da nota]]` (só o nome) as relacionadas
  que existem: a spec que originou o bug, a evolução que o resolveu, a nota anterior — o grafo
  nasce daí.
- `arquivos`: caminhos tocados pela leva (`git diff --name-only`), relativos ao repo; o servidor
  anexa `## Componentes tocados` pelo grafo. Sempre em evolução, bug e spec de mudança.
- **Ticket** de um artefato (quebra de spec/plano em tarefas, inclusive por `to-tickets`):
  `tipo=plano` + `artefato=<nome da nota de origem>`, que o grava em `Specs/Tickets - <artefato>/`.
- **Lote**: várias notas de uma vez (tickets, migração) levam `lote=true`, e um
  `sincronizar mensagem=<...>` fecha tudo num commit — sem ele a nota fica só na máquina local.
  Nota avulsa não usa lote.
- **Tamanho**: acima de 40.000 caracteres `ler_nota` devolve só o esboço; prefira spec curta mais
  tickets, ou `dividir_nota`. Nome errado → `renomear_nota`.

## Ciclo de vida

- Concluiu o que a nota descreve (plano executado, bug corrigido) → `status=resolvido` na hora;
  `rascunho` → `status=ativo` quando aprovada; substituída → `sucessora=<nome da nova nota>`.
- **Evolução**, ao fechar uma leva ou versão: uma nota `tipo=evolucao` por leva e por projeto. Abre
  com uma frase do que a leva entregou, e `## O que mudou` diz também por quê e o que falhou. Ela
  linka a spec, o plano ou o bug que fechou, e eles vão a `status=resolvido` na mesma leva (o
  servidor lista os que seguem ativos). Os títulos fixos importam: `contexto_projeto` mostra a
  abertura e as pendências da última evolução. Mesmo tema e arquivos da última evolução →
  `atualizar_nota` nela, não nota nova.
- Ao fechar a leva e após migração, `validar projeto=<projeto>`: erro se corrige na hora
  (`atualizar_nota`, ou criar a nota que o link espera), não se relata.

## Mapa do Codigo (só se o projeto usa graphify)

Após cada rodada do graphify, sem o usuário pedir (e sob demanda): `gerar_mapa(projeto,
leitura=<sua prosa>)`. O mapa é essa nota curada, uma por projeto, nunca dump bruto nem nota por
arquivo de código. `graphify-out/` fica no repo, no `.gitignore` e fora do index — nunca no vault.

## Migração de docs existentes

**Migração é CÓPIA, nunca recorte**: a nota nasce no vault e o original fica. PROIBIDO apagar,
mover ou dar `git rm` em arquivo do repo, e gerar o commit `docs: migrados para o vault Obsidian`
em qualquer projeto: remoção automática já apagou arquivos funcionais que só pareciam documentação
(`LEIA-MODIFICADO.txt` de uma lib vendorizada, instruções de build). Achou esse commit
(`git log --all --oneline --grep "migrados para o vault Obsidian"`)? Não empurrado, `git reset
HEAD~1` (mixed: o conteúdo, inclusive a mudança útil que ele carregava, como `graphify-out/` no
`.gitignore`, fica na working tree); já empurrado, avise o usuário e pare — reescrever histórico
publicado é decisão dele. Única exceção, só com `graphify-out/` rastreado:
`git rm -r --cached graphify-out` (tira do index, mantém em disco) + `.gitignore`.

- **`migrar`** (`/obsidian-docs migrar` ou "migrar docs"): rode DENTRO do projeto; sem projeto no
  diretório atual (sem `.git`, manifesto ou `CLAUDE.md`/`AGENTS.md`), avise e sugira
  `/obsidian-docs migrar tudo`. Antes de varrer o repo, leia `references/procedimento-migrar.md` e
  siga os passos; o plano é um GATE: nada é copiado sem o sim do usuário.
- **`migrar tudo`** (`/obsidian-docs migrar tudo` ou "migrar todos os projetos"): rode na raiz do
  workspace e siga `references/procedimento-migrar-tudo.md`.
