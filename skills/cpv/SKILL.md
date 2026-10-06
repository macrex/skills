---
name: cpv
description: Fecha a leva — commit no estilo de cada repositório que ela mexeu, push e a nota no vault Obsidian. Só quando o usuário digita /cpv ou pede expressamente para fechar a leva.
argument-hint: [sem-vault]
disable-model-invocation: true
allowed-tools: Bash(git:*) Bash(node:*) Read Write Edit Glob Grep Skill mcp__vault-docs mcp__plugin_macrex-skills_vault-docs
---

# /cpv — fecha a leva

# Versao: 1.5

**Só vale digitado pelo usuário**: invocar `/cpv` é o pedido expresso de commit e push desta
leva, e só dela; nenhum agente, skill ou workflow o dispara.

## Contexto

Antes de tudo, rode o descobridor, com `<pasta desta skill>` trocada pela pasta que o harness
anunciou ao carregá-la (no Codex, `~/.codex/skills/cpv` ou, no clone do README,
`~/.codex/skills/macrex/skills/cpv`; no Antigravity, `~/.gemini/config/skills/cpv`), e use a saída
como o Contexto que o resto cita:

```bash
node "<pasta desta skill>/scripts/repos-da-leva.js"
```

Sem o script (`Cannot find module`): feche só o repo de `git rev-parse --show-toplevel` no `cwd`,
avise no relatório que a descoberta não rodou e confira à mão as paradas que o script detecta:
branch `HEAD`, `.git/MERGE_HEAD`, `.git/rebase-merge` ou `.git/rebase-apply` existente, e
`git submodule status` com `+`.

A leva é o que a sessão mexeu, não o `cwd`: **processe todos os de `REPOSITORIOS DA LEVA`**, um
por vez, na ordem; fechar só o do `cwd` deixaria sem commit e sem nota o que ela mudou noutro
repositório. Lista vazia → **pare** e diga isso; é o único caso que para o comando inteiro.

**`NAO INCLUIDOS` só se lê**: são repositórios sujos que a sessão não tocou. Ficam sem `add`,
commit ou push, mesmo que a mudança pareça relacionada, até o usuário mandar por escrito, nesta
conversa.

## Quando pular um repositório

A linha do repo no Contexto traz `HEAD DESTACADO`, `MERGE OU REBASE EM ANDAMENTO` ou
`SUBMODULO SUJO`, ou o passo 1 acha segredo → **pule aquele repositório**: reporte e siga para o
próximo. Nunca `pull --rebase` para resolver, nunca `--no-verify`, nunca inicializar repositório.
`(sem remoto)` não pula: o commit fica local, sem push, e o relatório diz isso.

## Passos (repita para cada repositório da lista)

Todo comando de git leva `-C <raiz do repo>`: o `cwd` pode não estar dentro dele.

**Repo limpo** (`0 pendente(s)`): a leva pode ter sido commitada antes e ainda faltar a nota.
Pule os passos 1 a 3, sem commit vazio; `ahead` maior que zero → push (o pedido expresso cobre
empurrar a leva); depois o passo 5, e o relatório diz que o commit já existia, com o hash.

### 1. Segredos

Antes de estagiar, rode o varredor; ele lê o que o `add -A` levaria:

```bash
node "<pasta desta skill>/scripts/segredos.js" <raiz>
```

**Só siga se a última linha começar com `LIMPO`.** Senão:

- `SEGREDO` → **pule o repositório** e mostre as linhas `arquivo:linha  motivo`. O trecho sai
  mascarado de propósito; falso positivo é o usuário quem decide.
- `NAO VERIFICADO` → o git não respondeu e nenhum arquivo foi lido. Pule o repositório e diga
  por quê.
- `Cannot find module` → varra à mão os pendentes, pelo nome (`.env`, `*.pem`, `id_rsa`,
  `credentials.json`) e pelo conteúdo (chave privada, chave AWS, tokens GitHub/Slack/Anthropic,
  URL com senha, `password`/`senha`/`api_key`/`token` com valor literal), e diga no relatório que
  o script não rodou.

### 2. Estagiar

Confira os pendentes daquele repo no Contexto: arquivo que não é da leva (sujeira anterior, outro
assunto) → mostre ao usuário e pergunte antes de estagiar. Depois, `git -C <raiz> add -A`: leva o
index já preparado e os arquivos novos, que `commit -a` deixaria de fora.

### 3. A mensagem

Leia `git -C <raiz> log --format='%s' -20` e escreva no estilo daquele repositório (idioma,
prefixo convencional ou a falta dele, tamanho, tom). `SEM NENHUM COMMIT` não tem log e não pula o
repositório: o primeiro commit segue só as regras abaixo, no idioma da conversa.

- Assunto no imperativo, uma linha, sem ponto final.
- Corpo só quando explica o que o diff não mostra (o porquê, a armadilha evitada, o que foi
  tentado antes).
- **Zero trailers.** Nada de `Co-Authored-By`, `Generated with`, menção a
  Claude/Anthropic/assistente. A autoria é só do usuário: não passe `--author`.

### 4. Commit e push

```bash
git -C <raiz> commit -m "<mensagem>"
git -C <raiz> push            # sem upstream: git -C <raiz> push -u origin <branch>
```

Hook de pre-commit falhou → **pule o repositório** e mostre a saída. Push rejeitado
(non-fast-forward) → **pule**: o commit está feito, e como integrar é decisão do usuário.

### 5. O vault

Pule com `sem-vault`. Senão, invoque a skill **`obsidian-docs`** e registre a leva como evolução
pelas regras dela (hub, nota, gravação); em dúvida sobre o hub, pergunte. O git do vault é do
servidor do MCP, nunca seu. Passe `arquivos` com os pendentes daquele repo no Contexto. Uma nota
por leva e por projeto: dois repositórios são duas notas, cada uma no seu hub, uma linkando a
outra quando a mudança de um explica a do outro. A nota desta leva já existe (escrita antes do
`/cpv`)? Não crie outra: confira no `contexto_projeto` que ela está no hub e diga no relatório que
já existia, com o caminho. Feche com `validar projeto=<projeto>`.

### 6. Relatório

A linha `transcript:` do Contexto diz `nao encontrado`? Abra com uma linha dizendo isso: repo
tocado fora do `cwd` pode ter ficado de fora. Depois, três linhas **por repositório**:

- o que foi commitado (hash curto e assunto), ou o commit que **já existia**
- push: para onde, ou por que não
- vault: nota criada, atualizada ou já existente, com o caminho, ou "pulado"; erro do `validar`
  entra aqui (é o vault que ficou inconsistente, não a leva)

Feche com uma linha só se houve repositório pulado ou `NAO INCLUIDOS` não vazio, e então ela é
obrigatória, com motivo e contagem: silêncio sobre um repo que a descoberta viu lê como "não havia
mais nada".
