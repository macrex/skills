# Tempos da leva

Mantido pelo painel da leva do /faz (macrex-skills): cada fechamento acrescenta ao Registro as linhas
da leva e refaz a Calibração; a previsão da leva seguinte parte dela. Real é o tempo da máquina (o
agente e as ferramentas), sem a espera pelo usuário, que fica na coluna Espera. Juntos é quantos
tickets rodavam ao mesmo tempo no pico do ticket, ele incluso. A Calibração usa as levas mais
recentes e deixa de fora o real contaminado; linha acrescentada ou apagada à mão no Registro muda a
Calibração no próximo fechamento. Fonte é de onde veio a previsão do ticket: a mediana do perfil
(o painel), o motivo do agente que saiu dela, ou o julgamento do agente sem base.

## Calibração

1 leva no Registro; a calibração usa ela. Real/previsto abaixo de 1 é previsão acima do real. No modo paralelo, os tickets de uma onda dividem a máquina e o relógio: compare com o mesmo modo, e a onda dura o seu ticket mais longo, não a soma.

| Perfil | Modo | Tickets | Juntos (mediana) | Real (mediana) | Real (faixa do meio) | Real/previsto (mediana) |
|---|---|---|---|---|---|---|
| unidade | inline | 6 | 1 | 1m54s | 1m15s a 2m42s | 0,26× |
| Leva inteira | inline | 1 | — | 36m24s | 36m24s a 36m24s | 0,43× |

| Fonte da previsão | Modo | Tickets | Real/previsto (mediana) |
|---|---|---|---|
| agente | inline | 6 | 0,26× |

| Fase | Modo | Levas | Real (mediana) |
|---|---|---|---|
| spec | inline | 1 | 1m58s |
| tickets | inline | 1 | 1m04s |
| implement | inline | 1 | 14m36s |
| conciliação (por onda) | inline | 2 | 55s |
| revisao | inline | 1 | 3m03s |
| correcoes | inline | 1 | 11m16s |
| qualidade | inline | 1 | 4m27s |

## Registro

| Data | Leva | Ticket | Perfil | Modo | Juntos | Reparos | Previsto | Real | Espera | Real/previsto | Fonte |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | 01 Aviso de remendo e teto de 12 mil | unidade | inline | 1 | 0 | 10m | 2m42s | — | 0,27× | agente |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | 02 Busca sem prêmio à repetição e obsoleta no fim | unidade | inline | 1 | 0 | 5m | 1m10s | — | 0,23× | agente |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | 03 Tickets listados pela spec de origem e migração | unidade | inline | 1 | 0 | 14m | 3m47s | — | 0,27× | agente |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | 05 Contexto do projeto no SessionStart e linha de memória | unidade | inline | 1 | 0 | 10m | 2m25s | — | 0,24× | agente |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | 04 Lint de ciclo de vida | unidade | inline | 1 | 0 | 5m | 1m22s | — | 0,27× | agente |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | 06 atualizar_nota por seção | unidade | inline | 1 | 0 | 7m | 1m15s | — | 0,18× | agente |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | Conciliação 1 | — | inline | — | — | — | 1m22s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | Conciliação 2 | — | inline | — | — | — | 27s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | fase spec | — | inline | — | — | — | 1m58s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | fase tickets | — | inline | — | — | — | 1m04s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | fase implement | — | inline | — | — | — | 14m36s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | fase revisao | — | inline | — | — | — | 3m03s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | fase correcoes | — | inline | — | — | — | 11m16s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | fase qualidade | — | inline | — | — | — | 4m27s | — | — | — |
| 2026-10-30 | vault-docs contra o inchaço das notas - entendimento do grill | Leva inteira | — | inline | — | — | 1h25m | 36m24s | — | 0,43× | — |
