# Contexto

## Linguagem

**Leva**:
O trabalho que um `/faz <pedido>` interroga e um `/faz leva <documento>` cumpre, do entendimento até a validação, deixando tudo na working tree para o `/cpv` fechar.
_Evitar_: tarefa, feature, sprint

**Fase da leva**:
Cada etapa em que a leva está: grill, spec, tickets, implement, revisão, correções, qualidade, fechamento. No painel da leva, cada fase aparece pelo nome da skill que a cumpre (`to-spec`, `to-tickets`, `implement`, `code-review`), e o fechamento vira o aviso do `/cpv`.
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
O pane que um mod do Claude Code abre ao lado da conversa, como o do `/diff`, e que mostra o grill do `/faz <pedido>` e depois o estado da leva enquanto ela roda; sem nenhum dos dois, o repouso. Só existe no Claude Code.
_Evitar_: dashboard, monitor, statusline, TUI

**Agentes da leva**:
Os sub-agentes e workflows que a leva abriu, com nome, modelo, estado e duração, que o próprio mod observa enquanto há leva ativa e mostra no painel.
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
