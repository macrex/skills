# Origem

Cópia do mod Image Preview do [better-claude](https://github.com/midudev/better-claude), de
Miguel Ángel Durán (midudev), sob a licença MIT (`LICENSE`), tirada da pasta `plugins/image-preview`
no commit `c2eb914`, de 2026-10-15. O código não muda; o marketplace `macrex` o distribui como o
plugin `image-preview@macrex`.

## O que difere do upstream

- O `hooks/register.test.tsx` fica de fora. O `claude plugin test .` da raiz do repositório roda
  todo `*.test.ts(x)` abaixo dela contra o módulo do `macrex-skills`, e a suíte do mod falha 23 de 36
  no Windows já no upstream intocado: os testes esperam caminhos POSIX.
- No `.claude-plugin/plugin.json`, o `title` e a `description` da opção `window` estão em português.
  O `README.md` segue o do upstream e a chama de **Preview in a window**.
- O `LICENSE` vem da raiz do upstream.
- O `README.md` é o do upstream, sem mudar: aqui a instalação é `/plugin install image-preview@macrex`,
  não a do `better-claude`, e o `claude plugin test ./plugins/image-preview` da seção Development
  não tem o que rodar. A suíte do mod roda a partir de uma cópia da pasta do upstream:
  `claude plugin test <pasta do upstream>/plugins/image-preview`.

## Como atualizar

Recopie a pasta `plugins/image-preview` do upstream por cima desta, apague o
`hooks/register.test.tsx`, devolva o rótulo em português da opção `window`, traga o `LICENSE` se ele
mudou e troque o commit acima pelo novo. A versão do `plugin.json` fica a do upstream.
