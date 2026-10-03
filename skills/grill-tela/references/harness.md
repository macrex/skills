# A grill-tela em cada harness

Leia só a seção do seu. **Esperar** é como rodar o passo 4 do ciclo; **perguntar** é o canal do
terminal, para onde o grill volta.

## Claude Code

- **Esperar:** `G aguardar <url>` com `run_in_background: true`, e **encerre o turno**; o Claude
  Code reacorda você quando ele terminar. Em sessão sem supervisão, passe `timeout` de até 2 h.
- **Parar de esperar:** `TaskStop` no id da tarefa em background.
- **Perguntar:** `AskUserQuestion`.

## Pi

- **Esperar:** o laço (abaixo), com o `timeout` do `bash` 30 s acima do `--ate` da volta.
- **Parar de esperar:** não rode a próxima volta.
- **Perguntar:** em texto, e encerre o turno.

## Codex

- **Sandbox:** com ele ligado, todo comando `G` roda fora, com a escalação pedida ao usuário: o
  sandbox bloqueia socket de rede, até em 127.0.0.1, e sem ela o `iniciar` não sobe.
- **Esperar:** o laço, com o timeout do comando 30 s acima do `--ate` da volta; voltou com o
  processo ainda rodando, espere-o até o fim.
- **Parar de esperar:** não rode a próxima volta.
- **Perguntar:** em texto, e encerre o turno.

## Antigravity (CLI `agy`)

- **Esperar:** o laço, em primeiro plano; se o comando for para segundo plano, acompanhe-o até o
  fim.
- **Parar de esperar:** não rode a próxima volta.
- **Perguntar:** em texto, e encerre o turno.

## O laço

Onde não há notificação de comando em background: `G aguardar <url> --ate <s>` em primeiro
plano. A primeira volta usa `--ate 120`; a cada `{"tipo":"pendente"}` (o prazo passou sem
resposta), rode de novo com o dobro, até `--ate 600`, sem escrever nada ao usuário. Duas horas de
página parada custam umas 15 voltas. Chegou mensagem do usuário entre duas voltas? É ele
escrevendo no terminal: "Voltar ao CLI", no SKILL.md.
