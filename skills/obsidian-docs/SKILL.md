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

# Versao: 14.2

Todo acesso ao vault é pelo MCP `vault-docs` (`scripts/servidor_vault.py` desta skill). Ele sabe
onde o vault fica e aplica as convenções — pasta por tipo, nome com data, frontmatter, link e
entrada no hub, `Home.md`, commit → `pull --rebase` → push. Você decide **o quê** documentar
e escreve o conteúdo; ele cuida do **como**. Estrutura: `Home.md` → `<projeto>/<projeto>.md`
(hub) → pastas por tipo; toda nota linka o hub e está listada nele.

**NUNCA** Read/Grep/Glob/Write/Edit direto nos arquivos do vault, nem `git` nele: as
convenções vivem no servidor, e por fora dele nascem notas órfãs. Sem as ferramentas
do vault na sessão, confira com `claude mcp list` — e o nome delas depende da rota: pela rota
`npx skills add` elas são `mcp__vault-docs__*`; pelo plugin, `mcp__plugin_macrex-skills_vault-docs__*`.
Só faltam de verdade quando **nenhum** dos dois prefixos está lá, e aí o que fazer também depende
da rota. **Veio do plugin** (esta skill está sob `~/.claude/plugins/cache/`): o plugin já
declara o servidor, e registrar de novo criaria um segundo `vault-docs` ao lado dele —
**não** rode `--instalar`; o que falta é o reinício, ou a pasta do vault, que o cliente
preenche em `/plugin`. **Veio do `npx skills add`**: registre você mesmo com
`python <pasta desta skill>/scripts/servidor_vault.py --instalar --vault
<pasta de projetos do vault>`. Só o reinício do Claude Code
é do usuário (sessão aberta antes do registro não carrega o servidor): faça tudo que não
depende do vault, diga que a gravação ficou pendente do reinício e encerre o turno com isso claro.

## Quando usar cada ferramenta

Não sabe o nome do projeto → `visao_geral`. Nota nova → `salvar_nota`; nota existente →
`atualizar_nota`. Última evolução → `listar_notas projeto=X tipo=evolucao limite=1`. Código →
`mapa_codigo` antes de mexer, `consultar_codigo` para arquitetura, `gerar_mapa` após o graphify.
O que cada ferramenta faz e aceita está na descrição dela no próprio MCP.

## Regra dura

- Todo artefato `.md` de documentação vai para o vault via `salvar_nota`. NUNCA criar doc no
  repo do projeto, NUNCA commitar doc lá. Ficam no repo: `CLAUDE.md`, `AGENTS.md`, `SKILL.md`,
  `README.md`, configs — arquivos operacionais que ferramentas leem em lugar fixo.
- Doc existente que muda → `atualizar_nota` na própria nota (in-place). Nunca recriar no repo,
  nunca cópia local.
- Projeto = nome da pasta do repo git, minúsculo, sem acento. **Hub existente sempre ganha**:
  na primeira gravação da sessão num projeto, `visao_geral` (ou `ler_nota <projeto>`) para não
  duplicar — repo `pagamentos-repo` pertence ao hub `pagamentos` que já existe. Projeto novo de
  verdade → `salvar_nota` com `descricao_projeto` (1 linha) e `repo` (caminho local).

## Salvar: o que você passa

`salvar_nota(projeto, tipo, titulo, corpo, resumo, …)`:

- `tipo` → pasta: `spec`/`plano` → `Specs/`; `bug` → `Bugs/`; `evolucao` → `Evolucoes/`;
  `arquitetura`/`adr` → `Arquitetura/`; `analise` (pesquisa, estudo, relatório, review) →
  `Analises/`; `mapa` → `Mapa do Codigo <projeto>.md` na raiz do projeto (regrava).
- `titulo`: curto, acento permitido. A nota vira `YYYY-MM-DD <titulo>.md` (hoje, ou `data`).
- `corpo`: markdown escrito para quem não viu esta sessão — frases completas, um parágrafo por
  ideia, termos por extenso; sem cadeias de setas, abreviações inventadas ou rótulos que só
  fazem sentido nesta conversa. Não repita o título nem o link do hub: o servidor põe
  `# titulo` e `Projeto: [[projeto]]` se faltarem. Linke notas relacionadas por
  `[[nome da nota]]` (só o nome, nunca a pasta): spec que originou o bug, evolução que
  resolveu, nota anterior. O grafo do Obsidian nasce daí.
- `resumo`: 1 linha — é a entrada da nota no hub.
- `status`: `rascunho` (proposta) | `ativo` (padrão) | `resolvido` | `obsoleto`.
  `tags`: 1-3, kebab-case sem acento, opcional.
- `arquivos`: caminhos tocados pela leva (`git diff --name-only`), relativos ao repo. O servidor
  anexa `## Componentes tocados` (nós por comunidade, link ao Mapa) a partir do grafo do
  graphify. Passe sempre em evolução, bug e spec de mudança.
- **Ticket** de um artefato (quebra de spec/plano em tarefas, inclusive por skills externas como
  `to-tickets`): `tipo=plano` + `artefato=<nome da nota de origem>`. Vai para
  `Specs/Tickets - <artefato>/`, nunca solto em `Specs/` — muitas notas de uma vez afogam o
  artefato que as gerou.
- **Lote** (`lote=true`): várias notas de uma vez — tickets de uma spec, migração — gravam só
  em disco, sem pull/commit/push a cada uma, e `sincronizar mensagem=<...>` fecha tudo num
  commit só. **Obrigatório fechar**: nota em lote sem `sincronizar` fica só na máquina local.
  Uma nota avulsa não usa lote.

## Validar (`validar`)

`validar` é o linter do vault, o mesmo de `scripts/validar_vault.py`: frontmatter (E1–E3),
wikilink quebrado (E4), nota fora do hub (E5), órfã e sem link (A1, A2), projeto sem hub (A3).
Rode `validar projeto=<projeto>` ao fechar uma leva e depois de qualquer migração; erro é para
corrigir na hora (`atualizar_nota`, ou criar a nota que o link espera), não para relatar.

## Lifecycle (`atualizar_nota`)

- Concluiu o que a nota descreve (plano executado, bug corrigido) → `status=resolvido` na hora.
- Doc substituída por outra → `sucessora=<nome da nova nota>` (fica `obsoleto`, link no topo).
- `rascunho` → `status=ativo` quando aprovada.

## Evolução (fechar leva/versão)

Uma nota `tipo=evolucao` por leva e por projeto, abrindo com uma frase do que a leva entregou;
depois: o que mudou, por quê, tentativas que falharam, como foi verificado, pendências. Mesmo tema e arquivos da última evolução
(`listar_notas projeto=X tipo=evolucao limite=1`) → `atualizar_nota` nela, não nota nova.

## Ler / achar: duas fontes, cada pergunta tem a sua

O vault sabe o que foi **decidido e escrito**; o grafo do graphify sabe o que o código **é
agora**. Vá primeiro na fonte da coluna da esquerda:

| A pergunta é sobre | Fonte primária | Como |
|---|---|---|
| por que é assim, o que já foi descartado, o que a leva mudou | vault | `ler_nota`, `buscar`, `listar_notas`, `conexoes` |
| estrutura do código: quem chama X, caminho de A a B, o que é gargalo | grafo | `consultar_codigo`, `mapa_codigo` |
| onde mexer num projeto que você não conhece | as duas | hub + última evolução + `mapa_codigo` |

Sem grafo no projeto, as ferramentas de código dizem isso e o vault segue sozinho — graphify é
opcional, nada depende dele. Não carregue o vault inteiro no contexto — hub → nota certa, só o
necessário: cada leitura entra no contexto de tudo que vem depois.

## Mapa do Codigo (só se o projeto usa graphify)

`graphify-out/` fica no repo, no `.gitignore` e fora do index (`git ls-files graphify-out`
vazio; se rastreado, `git rm -r --cached graphify-out`) — nunca no vault. O servidor chega nele
pela linha `Repo:` do hub; hub sem ela → passe `repo=` uma vez e o servidor registra.

Após cada rodada do graphify, sem o usuário pedir (e sob demanda):
`gerar_mapa(projeto, leitura=<sua prosa>)`. O servidor põe comunidades, god nodes e destaques
do GRAPH_REPORT; a `leitura` é a parte curada — domínios, o que vale saber, lacunas — e é
preservada quando você não a passa. Continua PROIBIDO: dump bruto, nota por arquivo de código.

## Migração de docs existentes

### Modo `migrar` (um projeto)

Dispara com `/obsidian-docs migrar` ou "migrar docs". Roda DENTRO do projeto, uma vez (ou
quando acumular sujeira). Sem projeto no diretório atual (sem `.git`, manifesto ou
`CLAUDE.md`/`AGENTS.md`) → avise e sugira `/obsidian-docs migrar tudo` em vez de falhar
silenciosamente.

**REGRA DURA — migração é CÓPIA, nunca recorte.** PROIBIDO apagar qualquer arquivo do repo do
projeto. A nota nasce no vault e o original fica onde está. Nada de `git rm`, nada de mover,
nada de commit `docs: migrados para o vault Obsidian` — esse commit não pode ser gerado em
projeto nenhum.

Motivo: remoção automática já apagou centenas de arquivos em dezenas de repos, incluindo
arquivos que só pareciam documentação mas eram parte funcional do código — um
`LEIA-MODIFICADO.txt` dentro de uma lib vendorizada, registros de modificação de dependência,
instruções de build. Um `.md` no repo pode ser código operacional; o classificador não sabe.

Única exceção, e só quando `graphify-out/` estiver rastreado: `git rm -r --cached
graphify-out` (tira do index, mantém em disco) + `.gitignore`. Nunca apaga do disco, nunca
toca em outro arquivo.

**Fluxo.** Detalhe de cada passo (o que varrer, o que nunca migrar, formato do plano,
padronização): `references/procedimento-migrar.md`.

1. Inventário — varrer o repo atrás de doc; nunca incluir arquivo operacional (`README`,
   `CLAUDE.md`, `SKILL.md`, configs).
2. Plano de migração — GATE OBRIGATÓRIO: tabela `arquivo → destino → tipo` ao usuário. Aguarde
   confirmação; ele pode excluir itens.
3. Projeto no vault — `visao_geral`: hub existente ganha; projeto novo de verdade →
   `descricao_projeto` e `repo` na primeira `salvar_nota`.
4. Copiar — uma `salvar_nota` por arquivo confirmado, **com `lote=true`**: `data` do 1º
   commit, conteúdo original como `corpo`, `resumo` de 1 linha, wikilinks entre notas
   relacionadas. Ao fim, `sincronizar mensagem="<projeto>: migração de N notas"` e
   `validar projeto=<projeto>`.
5. Checagem graphify (só se o projeto usa) — `graphify-out/` no `.gitignore` e fora do index;
   nunca vai pro vault.
6. Repo do projeto — NÃO TOCAR (regra dura acima).
7. Relatório final — o que foi copiado, o que ficou de fora e por quê.

### Modo `migrar tudo` (workspace inteiro)

Dispara com `/obsidian-docs migrar tudo` ou "migrar todos os projetos". Rode na raiz do
workspace, a pasta que contém os projetos. Orquestra a migração em massa: descobre os
projetos, inventaria em paralelo (subagent `vault-migrador`, modelo fixo `sonnet` — nunca
herdado da sessão), confirma com um GATE único e migra projeto a projeto, sempre sequencial
(**nunca dois projetos em paralelo** — um único vault, um único `sincronizar` por projeto).
Cada projeto segue as mesmas regras do modo `migrar` (cópia, nunca recorte, lote fechado com
`sincronizar` e conferido com `validar`).

Detalhe completo (descoberta de projetos, regra de modelo, GATE, migração sequencial,
relatório): `references/procedimento-migrar-tudo.md`.
