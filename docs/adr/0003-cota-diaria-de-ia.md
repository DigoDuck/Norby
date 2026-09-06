# ADR 0003 — Cota diária de IA

- **Status:** aceito
- **Data:** 2026-09-06
- **Issue:** [#21](https://github.com/DigoDuck/Norby/issues/21), parte do mapa da v2 ([#15](https://github.com/DigoDuck/Norby/issues/15)); pesquisa de custo em [#18](https://github.com/DigoDuck/Norby/issues/18).
- **Depende de:** [ADR 0002](0002-onde-o-paywall-e-aplicado.md), que define o portão de IA e o contrato da recusa.
- **Decide:** quanto de IA um usuário pode gastar por dia, como isso é contado, onde é guardado, e o que a API responde ao recusar.
- **Não decide:** os limites por minuto (continuam como estão), o tratamento do 429 do próprio Google, o medidor de uso na tela (#25).

## Contexto

O Gemini responde com `usage_metadata` nas duas chamadas (insight e chat), e cada chamada já tem teto de saída (`MAX_TOKENS_INSIGHT = 512`, `MAX_TOKENS_CHAT = 1024`, #40). Faltava um teto por dia: no 10/min da rota de chat, um script sozinho faz 14.400 chamadas por dia.

A chave de produção está no **tier gratuito** do Google AI Studio (projeto Lumea), por decisão do dono até haver clientes. Isso muda o que a cota protege:

| Limite do projeto (`gemini-3.5-flash-lite`, gratuito) | Valor | Pico real até 2026-09-06 |
|---|---|---|
| Requisições por minuto (RPM) | 15 | 4 |
| Tokens de entrada por minuto (TPM) | 250.000 | 564 |
| Requisições por dia (RPD) | 500 | 12 |

Os limites são do projeto, compartilhados por todos os usuários da chave, e o RPD zera à meia-noite do Pacífico (o painel usa UTC-8). No gratuito, o que apaga a luz de todo mundo é o RPD: um script no 10/min esvazia 500 requisições em 50 minutos e todo usuário fica sem IA até as 5h de Brasília. O custo em dinheiro é zero; no tier pago seria US$ 0,30 por milhão de tokens de entrada e US$ 2,50 por milhão de saída.

No gratuito o Google também pode usar o conteúdo enviado para aprimorar seus produtos (o pago é isento). A política de privacidade passou a dizer isso.

O #18 propôs duas faixas para o teto em tokens: 150k a 200k (cinco vezes um dia pesado de ~33k) ou 80k a 120k (o pior caso perto do ponto de equilíbrio contra os R$ 20/mês).

## Decisão

1. **Dois tetos por usuário por dia da cota:** 120.000 tokens **e** 100 chamadas. Estourou um, recusa. Constantes em `ai_service.py` (`DAILY_TOKEN_CAP`, `DAILY_CALL_CAP`); mudar é PR, não variável de ambiente, porque deixa rastro e no Railway trocar env também é redeploy.
   - 120k é a faixa de equilíbrio do #18, dimensionada para o tier pago de propósito: não muda quando o faturamento ligar.
   - 100 = RPD/5: um script sozinho gasta no máximo um quinto do dia compartilhado. Um dia pesado legítimo (30 trocas de chat + 20 regenerações de insight) cabe duas vezes.
2. **Contagem real, depois da chamada:** `total_token_count` do `usage_metadata` (já inclui tokens de raciocínio; sem total, soma dos componentes com `None` como zero). Sem `usage_metadata`, zero tokens e uma chamada: o teto de chamadas segura o dia mesmo assim. A leitura mora numa função só (`_tokens_usados`), porque o Google já rotula `generate_content` como "Legacy" e a API nova (Interactions) renomeia os campos.
3. **Dia da cota em UTC-8 fixo** (`QUOTA_TZ`), o dia do Google. Com dia UTC, um usuário ganharia dois tetos dentro de um dia do Google e a parcela dele viraria 200 de 500. Se o Google seguir o horário de verão do Pacífico, o reset dele cai às 4h de Brasília e o nosso às 5h: erro para o lado seguro. Sem tabela de fuso.
4. **Tabela `ai_usage_daily(user_id, day, tokens, calls)`**, chave primária composta, upsert `ON CONFLICT DO UPDATE` como o `login_throttles`, sem purga: uma linha por usuário por dia não pesa, e o histórico é o instrumento que calibra os tetos (o número de hoje é estimativa; o p99 real, depois de um mês, é medida). Some com o usuário pelo `ON DELETE CASCADE`. Não entra no export da LGPD: contadores, não conteúdo.
5. **Vale para todo mundo que passa por `require_ai_access`,** trial incluído, com o mesmo número, e **não depende de `paywall_enabled`**: a cota protege a produção a partir do merge, não a partir da virada. Conta de trial é a mais barata de criar por script.
6. **Insight e chat contam e são barrados.** Insight cacheado (fingerprint igual) continua servido: não chama o Gemini, não debita. Excluir o insight abriria um buraco: a 30/min, editar uma transação e recarregar o dashboard regenera 43 mil vezes por dia.
7. **Checagem e débito num helper do `ai_service` (`_com_cota`)** em volta das duas chamadas de rede, e não na dependency: a dependency roda antes do corpo e barraria também o insight cacheado e o score determinístico, que não custam nada. A cota não é regra de plano (essa fica na dependency); é uso do próprio serviço. Um terceiro ponto de chamada no futuro passa pelo mesmo helper e não tem como esquecer de contar.
8. **Recusa:** `PlanRefused("AI_DAILY_CAP_REACHED", ...)`, o quarto código do contrato do ADR 0002, pelo mesmo handler: `403` com `detail.code`, `detail.message` autossuficiente ("libera às 5h da manhã, horário de Brasília") e `detail.resets_at` em ISO/UTC para o medidor futuro (#25). O chat sobe a recusa antes do `except` genérico que vira 503. O insight sem cache cai no `200` degradado que já existe, com score real e a mensagem da cota em `error`. Uma linha de log em WARNING por recusa, com id e contadores, sem texto do usuário.
9. **Os limites por minuto continuam** (30/min insight, 10/min chat, em memória): freiam rajada, a cota freia o dia. Não dobrar um no outro.

## Consequências aceitas

- **Rajada no último token:** a checagem lê antes e o débito grava depois, então até 10 chamadas concorrentes passam juntas. Uma rajada por dia, no pior caso ~130k tokens; depois, bloqueio até virar o dia. Reservar antes seria um segundo UPDATE por chamada para proteger o último minuto, não as horas.
- **Os limites por minuto por usuário (10 + 30) passam do RPM 15 do projeto inteiro.** Um estouro por minuto se cura no minuto seguinte; o do dia trava o dia. Não mexer.
- **O 429 do próprio Google continua 503 genérico** ("tente novamente em instantes"), que mente por horas se o projeto esgotar o RPD. Com o teto de 100, esgotar exige cinco usuários no máximo ao mesmo tempo. Reabrir quando virar pago ou quando acontecer.
- **O insight regenera a cada mudança nos totais do mês.** Quem lança 30 transações num dia e olha o dashboard entre elas gasta 30 das 100 chamadas. Fora deste ADR.
- **Tier gratuito por decisão do dono,** até haver clientes; os primeiros serão pessoas conhecidas. Virar pago é um clique no console do AI Studio e não muda nenhum número deste ADR: os tetos ficam, e o RPD deixa de ser o gargalo.

## Quando rever

- Virar pago: nada cai. Rever o item do 429 e a frase da política de privacidade.
- Trocar por um modelo que pensa: `_tokens_usados` já soma `thoughts_token_count`; rever só os tetos.
- Migrar para a Interactions API: só `_tokens_usados` muda.
- Depois de um mês de linhas em `ai_usage_daily`: recalibrar os dois tetos pelo p99 real.
