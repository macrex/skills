# Contexto

## Linguagem

**Leva**:
O trabalho que um `/faz <pedido>` interroga e um `/faz leva <documento>` cumpre, do entendimento até a validação, deixando tudo na working tree para o `/cpv` fechar.
_Evitar_: tarefa, feature, sprint

**Fase da leva**:
Cada etapa em que a leva está: grill, spec, tickets, implement, revisão, correções, qualidade, fechamento.
_Evitar_: passo (quando se fala do estado observado), etapa

**Estado da leva**:
O registro que a própria leva grava dos seus marcos (fase, tickets e portão), lido por quem quiser acompanhá-la.
_Evitar_: log, progresso

**Marco**:
Um registro que a leva acrescenta ao estado da leva quando algo muda: a fase, o ticket em curso, o resultado de um portão.
_Evitar_: evento, checkpoint

**Portão**:
A verificação que decide se um ticket fechou: verde ou vermelho, com até dois reparos antes de parar a cadeia.
_Evitar_: gate, check

**Painel da leva**:
O pane que um mod do Claude Code abre ao lado da conversa, como o do `/diff`, e que mostra o estado da leva enquanto ela roda. Só existe no Claude Code.
_Evitar_: dashboard, monitor, statusline, TUI

**Agora**:
As últimas ações do agente (ferramenta e alvo), que o próprio mod observa enquanto há leva ativa e mostra no painel.
_Evitar_: atividade, feed
