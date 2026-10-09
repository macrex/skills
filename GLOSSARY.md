# Glossário

## Linguagem

**Leva**:
O trabalho que um `/faz <pedido>` interroga e um `/faz leva <documento>` cumpre, do entendimento até a validação, deixando tudo na working tree para o `/cpv` fechar.
_Evitar_: tarefa, feature, sprint

**Prompt**:
O texto que o `/faz <pedido>` imprime ao fim do grill para o usuário colar numa sessão nova: dispara o `/faz leva <documento>` e autoriza as skills reservadas ao usuário.
_Evitar_: linha da leva, comando

**Fase da leva**:
O ponto em que a leva está: grill, spec, tickets, implement, revisão, correções, qualidade, fechamento. No painel da leva, cada fase aparece pelo nome da skill que a cumpre (`to-spec`, `to-tickets`, `implement`, `code-review`), e o fechamento vira o aviso do `/cpv`.
_Evitar_: passo (quando se fala do estado observado), etapa

**Estado da leva**:
O que a própria leva grava dos seus marcos, lido por quem a acompanha.
_Evitar_: log, progresso

**Marco**:
Um registro que a leva acrescenta ao estado da leva quando algo muda: a fase, o ticket em curso, o resultado de um portão.
_Evitar_: evento, checkpoint

**Portão**:
A verificação que decide se um ticket fechou: verde ou vermelho, com até dois reparos antes de parar a cadeia.
_Evitar_: gate, check

**Painel da leva**:
O pane do Claude Code que o `/painel-macrex` abre ao lado da conversa, como o do `/diff`, com o grill e a leva do workspace, uma aba por assunto.
_Evitar_: dashboard, monitor, statusline, TUI

**Barra de abas**:
A fileira no topo do painel da leva que troca o assunto da tela (Geral, Diff, Grill, Tickets, Uso, Arquivos).
_Evitar_: menu, navegação

**Diff da sessão**:
O que a sessão mudou nos arquivos do repositório: o working tree comparado com a foto tirada quando a sessão começou, inclusive o que mudou por shell e sem o que já estava sujo antes.
_Evitar_: git status, alterações pendentes

**Árvore do projeto**:
Os arquivos e pastas da raiz do projeto, sem o que o git ignora, que o painel da leva mostra com o nome do arquivo novo em verde e o do alterado em amarelo; a lista muda quando surge arquivo novo, nunca pelo diff da sessão.
_Evitar_: explorer, files, navegador de arquivos

**Agentes da leva**:
Os sub-agentes, teammates e workflows que a leva abriu, que o próprio mod observa enquanto ela está ativa.
_Evitar_: Agora, atividade, feed

**Retomada**:
Uma sessão nova que continua a leva aberta do mesmo documento a partir do estado da leva, sem refazer os tickets que já fecharam.
_Evitar_: resume, recomeço

**Conferência das skills**:
O registro de quais skills da leva a sessão em curso invocou de fato, confrontado com as fases que a leva declarou.
_Evitar_: auditoria, checklist

**Histórico de levas**:
As levas já fechadas de um workspace, com tempos, portões, reparos, modo do implement e modelos observados.
_Evitar_: log, métricas

**Grill na tela**:
Um grill respondido na página da grill-tela, de qualquer projeto da máquina, com endereço próprio que segue valendo depois do sim.
_Evitar_: sessão da tela, página do grill

**Grill no terminal**:
Um grill respondido no diálogo do terminal, que o plugin registra no histórico de grills rodada a rodada e que lá aparece como No terminal; o grill na tela que voltou ao terminal aparece como Voltou ao CLI.
_Evitar_: grill do CLI, grill registrado

**Grill ativo**:
Um grill na tela sem o sim e sem a volta ao CLI, com algo acontecendo nele nas últimas 2 horas; o aberto mais velho que isso é um grill abandonado.
_Evitar_: grill em curso, grill aberto

**Histórico de grills**:
A tela inicial da grill-tela: os grills ativos num bloco no topo e, abaixo, todos os grills já feitos na máquina, na tela ou no terminal (os do terminal entram pelo plugin), com o projeto e o status de cada um.
_Evitar_: lista de sessões, histórico (sozinho, que também é o de levas)
