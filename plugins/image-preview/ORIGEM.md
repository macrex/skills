# Origem

Cópia do mod Image Preview do [better-claude](https://github.com/midudev/better-claude), de
Miguel Ángel Durán (midudev), sob a licença MIT (`LICENSE`), tirada da pasta `plugins/image-preview`
no commit `c2eb914`, de 2026-10-15. O código só muda na correção abaixo; o marketplace `macrex` o
distribui como o plugin `image-preview@macrex`.

## O que difere do upstream

- **Correção no Windows**, no `sessionFolder` de `hooks/register.tsx`: o upstream procura as imagens
  em `/tmp/claude-0/<projeto>/<sessão>`, mas o Claude Code no Windows as guarda em
  `%TEMP%\claude\<projeto>\<sessão>`, sem o uid, e `/tmp` lá não é a pasta temporária. Sem a
  correção, nenhum `[Image #N]` acha a imagem. A base passou a ser o `CLAUDE_CODE_TMPDIR` ou, no
  Windows, o `TEMP` (ou o `TMP`), e a pasta, `claude`. Visto no motor real em 2026-10-16, com uma
  sessão `claude -p --plugin-dir` e a imagem posta na pasta da sessão.

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
mudou e troque o commit acima pelo novo. Reaplique a correção do Windows se o upstream ainda não a
tiver. A versão do `plugin.json` é a do upstream com a patch subida por correção local (0.1.0 virou
0.1.1).
