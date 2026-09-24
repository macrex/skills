# Migração do workspace inteiro — detalhe de cada passo

Orquestra a migração em massa: descobre os projetos do diretório atual, inventaria tudo,
confirma com o usuário UMA vez e migra projeto a projeto. As regras de classificação e
padronização são as do modo `migrar`; este modo só escala para N projetos.

## 1. Descobrir projetos

Subpastas de 1º nível da raiz do workspace que sejam projeto: têm `.git`, ou manifesto
(`package.json`, `pom.xml`, `pyproject.toml`, `go.mod`, `Cargo.toml`), ou `CLAUDE.md`/`AGENTS.md`.
Ignorar `node_modules`, `.git`, pastas de vault ou Obsidian, `tmp`, `dist`, `target`. Mostre a
lista antes de inventariar.

## 2. Inventário em paralelo (subagents, read-only)

Um subagent **`vault-migrador`** por projeto, em **modo inventário**; pode disparar todos de uma
vez (o runtime enfileira). Cada um devolve a tabela `arquivo → destino → tipo` pelas regras do
modo `migrar`; projeto sem nada a migrar volta "limpo".

**Regra de modelo.** Inventariar e copiar é trabalho mecânico: os subagents rodam num modelo
barato e fixo, nunca no da sessão. No Claude Code, `subagent_type: vault-migrador`, que já traz
`model: sonnet`; sem o agent instalado, copie `assets/vault-migrador.md` para `~/.claude/agents/`
ou use `general-purpose` com `model: sonnet` explícito. Noutras plataformas, o modelo rápido
equivalente. Modelo maior só se o Sonnet comprovadamente não der conta.

**Sem ferramenta de sub-agente** (Pi sem a extensão `pi-subagents`, Antigravity): o inventário
roda inline, em sequência, um projeto por vez, com as mesmas regras e a mesma tabela. O gate e a
migração sequencial não mudam.

## 3. GATE único (obrigatório)

Inventário agregado: por projeto, contagem por tipo e a tabela dos arquivos. Avise que TUDO
listado será **copiado** (os repos ficam intocados). O usuário confirma, exclui projetos ou itens.
Sem confirmação, nada é copiado.

## 4. Migrar (sequencial, um projeto por vez)

**NUNCA dois projetos em paralelo**: é um vault só, e dois lotes abertos viram um commit com notas
misturadas. Para cada projeto confirmado, na ordem: subagent `vault-migrador` em **modo
migração** com a lista confirmada (mesma regra de modelo), ou o próprio agente inline. O fluxo é
o do modo `migrar`: `visao_geral` (hub existente ganha), uma `salvar_nota` por arquivo com
`lote=true`, **um** `sincronizar` fechando o lote do projeto, `validar projeto=<projeto>` e a
checagem graphify. O agente só devolve depois do `sincronizar`; a linha `GIT:` do retorno é a saída
dele. Inline, só passe ao próximo projeto depois do `sincronizar` deste.

**O repo do projeto NUNCA é tocado**: migração é cópia, nunca recorte. Sem `git rm`, sem apagar,
sem commit no projeto.

## 5. Relatório final

Agregado: N projetos migrados, M arquivos por tipo, o que ficou e por quê, falhas e pendências.
Lembrete: daqui em diante doc nova é direto no vault (`obsidian-docs`).
