# Migração em lote — detalhe de cada passo

## 1. Inventário

`Glob **/*.md` e `**/*.txt` de anotação (`notas.txt`, `todo.txt`). Alvos típicos: `docs/`,
`doc/`, `documentation/`, `docs/superpowers/specs|plans/`, `docs/history/` (iteration-N),
specs, planos e análises soltos na raiz, `ADR*/`, `arquitetura*`, relatórios, pesquisas,
`*.draft.md`.

**Fica no repo** (operacional): `README*`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `SKILL.md`,
`LICENSE*`, `CHANGELOG*`, `CONTRIBUTING*`, `CODE_OF_CONDUCT*`, templates de `.github/`, configs,
qualquer `.md` que ferramenta leia em path fixo. Na dúvida, pergunte.

## 2. Plano de migração (gate)

Tabela ao usuário, avisando que vai copiar tudo para o vault; aguarde a confirmação, ele pode
excluir itens:

```
| arquivo no repo | → destino no vault | tipo |
|---|---|---|
| docs/history/iteration-1.md | <projeto>/Evolucoes/2026-01-15 Iteration 1.md | evolucao |
| docs/design-x.md            | <projeto>/Specs/2026-03-02 Design X.md       | spec |
```

## 3. Projeto no vault

`visao_geral` e a regra de hub da skill: hub existente ganha; projeto novo leva
`descricao_projeto` e `repo` na primeira `salvar_nota`. Tickets de um mesmo artefato levam
`artefato=<nota de origem>`.

## 4. Copiar

Uma `salvar_nota` por arquivo confirmado, todas com `lote=true`:

1. `data` = primeiro commit do arquivo
   (`git log --follow --format=%ad --date=short -- <arquivo> | tail -1`); sem git, omita.
2. `titulo` = título do documento, no padrão da skill; `tipo` da tabela.
3. `corpo` = conteúdo original preservado, com `[[wikilinks]]` entre notas da mesma migração
   (bug → spec que originou, evolução → bug que resolveu).
4. `resumo` = 1 linha para o hub.
5. Ao fim da lista, `sincronizar mensagem="<projeto>: migração de N notas"`, o único commit da
   migração.
6. `validar projeto=<projeto>`: E4 (link para nota que não veio) e E5 (fora do hub) se corrigem
   na hora, antes do relatório.

## 5. Checagem graphify (só se o projeto usa)

- `graphify-out/` no `.gitignore` e fora do index (`git ls-files graphify-out` vazio).
- Lixo antigo de graphify para Obsidian (nota por arquivo de código, dump `.md` de AST) no repo
  ou no vault: listar e propor exclusão.
- O mapa curado do código é o fluxo "Mapa do Codigo" da skill, sob demanda, fora da migração.

## 6. Relatório final

N arquivos copiados por tipo, hub criado ou reusado, o que ficou de fora e por quê, pendências
(itens excluídos pelo usuário, gravações que o servidor recusou). Lembrete: daqui em diante doc
nova ou atualizada é direto no vault (`obsidian-docs`).
