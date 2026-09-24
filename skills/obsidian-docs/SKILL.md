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

# Versao: 15.0

Todo acesso ao vault é pelo MCP `vault-docs` (`scripts/servidor_vault.py` desta skill). Ele sabe
onde o vault fica e aplica as convenções (pasta por tipo, nome com data, frontmatter, link e
entrada no hub, `Home.md`, commit → `pull --rebase` → push). Você decide **o quê** documentar e
escreve o conteúdo; ele cuida do **como**. Estrutura: `Home.md` → `<projeto>/<projeto>.md` (hub)
→ pastas por tipo; toda nota linka o hub e está listada nele.

**NUNCA** Read/Grep/Glob/Write/Edit nos arquivos do vault, nem `git` nele: as convenções vivem no
servidor, e por fora dele nascem notas órfãs.

## Se as ferramentas do vault não estão na sessão

O prefixo depende da rota: `mcp__vault-docs__*` (`npx skills add` e Pi) ou
`mcp__plugin_macrex-skills_vault-docs__*` (plugin). Só faltam de verdade quando **nenhum** dos dois
está lá. Então:

- **Claude Code**: confira com `claude mcp list`. Skill vinda do plugin (está sob
  `~/.claude/plugins/cache/`): o plugin já declara o servidor; **não** rode `--instalar` (criaria um
  segundo `vault-docs`) — falta o reinício, ou a pasta do vault, que o cliente preenche em
  `/plugin`. Vinda do `npx skills add`: registre com
  `python <pasta desta skill>/scripts/servidor_vault.py --instalar --vault <pasta de projetos do vault>`.
  O reinício do Claude Code é do usuário (sessão aberta antes do registro não carrega o servidor).
- **Pi**: as ferramentas vêm da extensão `vault-docs` do pacote; não há MCP para registrar, e
  `claude mcp list` e `--instalar` não existem aqui. Faltam por `OBSIDIAN_VAULT` vazia ou pacote
  fora do `pi list`; diga qual.

Nos dois casos: faça tudo que não depende do vault, diga que a gravação ficou pendente e encerre o
turno com isso claro.

## Quando usar cada ferramenta

- Nome do projeto incerto → `visao_geral`.
- Entrar num projeto → `contexto_projeto X`: descrição, contagens, última evolução (abertura e
  pendências) e notas recentes por seção com resumo, com teto fixo. O hub inteiro (`ler_nota X`)
  só para o índice completo.
- Achar → `buscar` (cada resultado traz o resumo do hub) → `conexoes` na nota certa (vizinhas com
  resumo, sem hub e Home) → `ler_nota`, com `secao=<título>` quando basta uma parte (seção
  inexistente devolve a lista) ou `max_chars` para cortar. Nota grande devolve o esboço;
  `integral=true` lê mesmo assim.
- Nota nova → `salvar_nota`; existente → `atualizar_nota`. Última evolução →
  `listar_notas projeto=X tipo=evolucao limite=1`.
- Código → `mapa_codigo` antes de mexer, `consultar_codigo` para arquitetura, `gerar_mapa` após o
  graphify.

Cada leitura entra no contexto de tudo que vem depois: `contexto_projeto` → nota certa → `secao=`.
O que cada ferramenta aceita está na descrição dela no MCP.

## Regra dura

- Todo artefato `.md` de documentação vai para o vault via `salvar_nota`. NUNCA criar nem commitar
  doc no repo do projeto. Ficam no repo só os operacionais que ferramentas leem em lugar fixo:
  `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `README.md`, configs.
- Doc existente que muda → `atualizar_nota` in-place. Nunca recriar no repo, nunca cópia local.
- Projeto = nome da pasta do repo git, minúsculo, sem acento. **Hub existente sempre ganha**: na
  primeira gravação da sessão num projeto, `contexto_projeto` (ou `visao_geral`) para não duplicar
  — repo `pagamentos-repo` pertence ao hub `pagamentos` que já existe. Projeto novo de verdade →
  `salvar_nota` com `descricao_projeto` (1 linha) e `repo` (caminho local).

## Salvar: o que você passa

`salvar_nota(projeto, tipo, titulo, corpo, resumo, …)`:

- `tipo` → pasta: `spec`/`plano` → `Specs/`; `bug` → `Bugs/`; `evolucao` → `Evolucoes/`;
  `arquitetura`/`adr` → `Arquitetura/`; `analise` (pesquisa, estudo, relatório, review) →
  `Analises/`; `mapa` → `Mapa do Codigo <projeto>.md` na raiz do projeto (regrava).
- `titulo`: curto, acento permitido; a nota vira `YYYY-MM-DD <titulo>.md` (hoje, ou `data`).
- `corpo`: markdown para quem não viu esta sessão — frases completas, um parágrafo por ideia,
  termos por extenso; sem cadeias de setas, abreviações inventadas ou rótulos desta conversa. Não
  repita título nem link do hub (o servidor põe `# titulo` e `Projeto: [[projeto]]`). Linke notas
  relacionadas por `[[nome da nota]]` (só o nome, nunca a pasta): spec que originou o bug,
  evolução que resolveu, nota anterior — o grafo nasce daí.
- `resumo`: 1 linha, vira a entrada no hub (e o que `buscar` e `contexto_projeto` mostram).
- `status`: `rascunho` | `ativo` (padrão) | `resolvido` | `obsoleto`. `tags`: 1-3, kebab-case sem
  acento, opcional.
- `arquivos`: caminhos tocados pela leva (`git diff --name-only`), relativos ao repo; o servidor
  anexa `## Componentes tocados` a partir do grafo do graphify. Sempre em evolução, bug e spec de
  mudança.
- **Ticket** de um artefato (quebra de spec/plano em tarefas, inclusive por `to-tickets`):
  `tipo=plano` + `artefato=<nome da nota de origem>` → `Specs/Tickets - <artefato>/`, nunca
  solto em `Specs/`.
- **Lote** (`lote=true`): várias notas de uma vez (tickets, migração) gravam só em disco e
  `sincronizar mensagem=<...>` fecha tudo num commit. **Obrigatório fechar**: sem `sincronizar` a
  nota fica só na máquina local. Nota avulsa não usa lote.

## Validar

`validar` é o linter do vault (o mesmo de `scripts/validar_vault.py`): frontmatter (E1–E3),
wikilink quebrado (E4), nota fora do hub (E5), órfã e sem link (A1, A2), projeto sem hub (A3).
Rode `validar projeto=<projeto>` ao fechar uma leva e após migração; erro se corrige na hora
(`atualizar_nota`, ou criar a nota que o link espera), não se relata.

## Lifecycle (`atualizar_nota`)

- Concluiu o que a nota descreve (plano executado, bug corrigido) → `status=resolvido` na hora.
- Doc substituída por outra → `sucessora=<nome da nova nota>` (fica `obsoleto`, link no topo).
- `rascunho` → `status=ativo` quando aprovada.

## Evolução (fechar leva/versão)

Uma nota `tipo=evolucao` por leva e por projeto: abre com uma frase do que a leva entregou e segue
nas seções `## O que mudou` (e por quê, tentativas que falharam), `## Verificação`,
`## Pendências`. Os títulos fixos importam: `contexto_projeto` mostra a abertura e as pendências da
última evolução, e `ler_nota secao=Pendências` chega nelas sem carregar a nota. Mesmo tema e
arquivos da última evolução → `atualizar_nota` nela, não nota nova.

## Duas fontes, cada pergunta na sua

O vault sabe o que foi **decidido e escrito**; o grafo do graphify sabe o que o código **é agora**.

| A pergunta é sobre | Fonte | Como |
|---|---|---|
| por que é assim, o que foi descartado, o que a leva mudou | vault | `buscar` → `conexoes` → `ler_nota` (`secao=`) |
| estrutura do código: quem chama X, caminho de A a B, gargalo | grafo | `consultar_codigo`, `mapa_codigo` |
| onde mexer num projeto desconhecido | as duas | `contexto_projeto` + `mapa_codigo` |

Sem grafo no projeto as ferramentas de código dizem isso e o vault segue sozinho: graphify é
opcional.

## Mapa do Codigo (só se o projeto usa graphify)

`graphify-out/` fica no repo, no `.gitignore` e fora do index (`git ls-files graphify-out` vazio;
se rastreado, `git rm -r --cached graphify-out`) — nunca no vault. O servidor chega nele pela
linha `Repo:` do hub; hub sem ela → passe `repo=` uma vez e o servidor registra.

Após cada rodada do graphify, sem o usuário pedir (e sob demanda): `gerar_mapa(projeto,
leitura=<sua prosa>)`. O servidor põe comunidades, god nodes e destaques do GRAPH_REPORT; a
`leitura` é a parte curada (domínios, o que vale saber, lacunas) e é preservada quando você não a
passa. PROIBIDO: dump bruto, nota por arquivo de código.

## Migração de docs existentes

### `migrar` (um projeto)

Dispara com `/obsidian-docs migrar` ou "migrar docs". Roda DENTRO do projeto, uma vez (ou quando
acumular sujeira). Sem projeto no diretório atual (sem `.git`, manifesto ou `CLAUDE.md`/`AGENTS.md`)
→ avise e sugira `/obsidian-docs migrar tudo`, em vez de falhar em silêncio.

**REGRA DURA — migração é CÓPIA, nunca recorte.** PROIBIDO apagar qualquer arquivo do repo: a nota
nasce no vault e o original fica. Nada de `git rm`, de mover, nem do commit `docs: migrados para o
vault Obsidian` — ele não pode ser gerado em projeto nenhum. Achou um
(`git log --all --oneline --grep "migrados para o vault Obsidian"`)? Não empurrado, `git reset
HEAD~1` (mixed: o conteúdo, inclusive a mudança útil que ele carregava, como `graphify-out/` no
`.gitignore`, fica na working tree); já empurrado, avise o usuário e pare — reescrever histórico
publicado é decisão dele. Motivo: remoção automática já apagou centenas de arquivos em dezenas de
repos, inclusive arquivos que só pareciam documentação e eram parte funcional do código
(`LEIA-MODIFICADO.txt` numa lib vendorizada, registros de modificação de dependência, instruções
de build). Única exceção, só com `graphify-out/` rastreado: `git rm -r --cached graphify-out`
(tira do index, mantém em disco) + `.gitignore`.

**Fluxo** (detalhe em `references/procedimento-migrar.md`):

1. Inventário — varrer o repo atrás de doc; nunca arquivo operacional (`README`, `CLAUDE.md`,
   `SKILL.md`, configs).
2. Plano — GATE OBRIGATÓRIO: tabela `arquivo → destino → tipo` ao usuário; aguarde confirmação,
   ele pode excluir itens.
3. Projeto no vault — `visao_geral`: hub existente ganha; projeto novo → `descricao_projeto` e
   `repo` na primeira `salvar_nota`.
4. Copiar — uma `salvar_nota` por arquivo confirmado, **com `lote=true`**: `data` do 1º commit,
   conteúdo original como `corpo`, `resumo` de 1 linha, wikilinks entre notas relacionadas. Ao fim,
   `sincronizar mensagem="<projeto>: migração de N notas"` e `validar projeto=<projeto>`.
5. Checagem graphify (só se o projeto usa) — `graphify-out/` no `.gitignore` e fora do index.
6. Repo do projeto — NÃO TOCAR.
7. Relatório — o que foi copiado, o que ficou de fora e por quê.

### `migrar tudo` (workspace inteiro)

Dispara com `/obsidian-docs migrar tudo` ou "migrar todos os projetos". Rode na raiz do workspace.
Descobre os projetos, inventaria em paralelo (subagent `vault-migrador`, modelo fixo `sonnet`,
nunca o da sessão), confirma com um GATE único e migra projeto a projeto, sempre sequencial
(**nunca dois em paralelo**: um vault, um `sincronizar` por projeto), com as regras do modo `migrar`.
Detalhe em `references/procedimento-migrar-tudo.md`.
