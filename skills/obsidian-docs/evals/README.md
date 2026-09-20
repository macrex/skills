# Eval de disparo da `obsidian-docs`

`trigger-eval.json` tem vinte pedidos realistas: dez que devem disparar a skill sem nomeá-la e
dez vizinhos que não devem (README, CLAUDE.md, docstring, Swagger, commit, plugin do Obsidian,
export do Notion, comentário de PR). Roda com o `skill-creator` da Anthropic, que usa `claude -p`:

```bash
cd <skill-creator>
python -m scripts.run_eval --eval-set <este diretório>/trigger-eval.json \
  --skill-path <pasta da skill obsidian-docs> --model <modelo da sua sessão> --runs-per-query 3 --verbose
```

Rode **na sua máquina**, num diretório com o MCP `vault-docs` conectado e os repositórios que os
pedidos citam. O avaliador só conta como disparo quando a primeira ferramenta chamada é `Skill`;
num ambiente sem esses repositórios o modelo começa por `Glob`/`Bash` e toda consulta sai como
"não disparou", seja qual for a descrição. Foi o que aconteceu no ambiente remoto onde a
descrição atual foi escrita: recall perto de zero tanto para a descrição antiga quanto para a
nova, precisão 100% nas duas. A descrição atual segue o critério do `skill-creator` para
combater subdisparo (contexto explícito, exclusões nomeadas); a medida de verdade fica para a
primeira rodada local.
