# ADR 0002 — Onde o paywall é aplicado

- **Status:** aceito
- **Data:** 2026-08-25
- **Issue:** [#20](https://github.com/DigoDuck/Norby/issues/20), parte do mapa da v2 ([#15](https://github.com/DigoDuck/Norby/issues/15))
- **Depende de:** [ADR 0001](0001-modelo-de-assinatura.md), que define `premium_until` como portão e as quatro faixas.
- **Decide:** onde as regras de plano são aplicadas, o que a API responde ao recusar, e como o frontend descobre o plano.
- **Não decide:** teto diário de IA (#21), área de admin (#23), a tela da `/perfil` (#25), Checkout e Portal (#46).

## Contexto

O ADR 0001 fechou o **modelo**: `premium_until` é o portão e as quatro faixas
são comparações de data. Ele deliberadamente não disse **onde** os portões são
aplicados — os predicados `ai_allowed` e `wallet_cap_applies`
(`app/services/plan_service.py`) existem desde a issue #44 sem nenhum chamador.
Este ADR dá chamador a eles.

### Uma correção de fato no ticket

O #20 lista "transactions, recurring transactions, **goals**" como as escritas
que carregam `wallet_id`. **`goals` não tem carteira** — só `transactions` e
`recurring_transactions` referenciam `wallets.id`. A superfície a proteger é
menor do que o ticket supõe.

### O que o código já tinha

Existe um `_get_owned_wallet`, e ele está **duplicado em três routers**
(`wallets.py`, `transactions.py`, `recurring.py`), com assinaturas diferentes —
o de transações tem `for_update` e `required`. O gargalo natural existe, em três
cópias.

## Decisão

### O teto mora no helper que resolve a carteira, unificado

As três cópias viram **um helper de service**, e o teto vive dentro dele.

Dependency do FastAPI foi **recusada para carteira**, e o motivo é concreto: em
`POST /transactions` e `POST /recurring` o `wallet_id` chega no **corpo**, e
dependency lê path e query, não campo de corpo já validado pelo Pydantic. Uma
dependency cobriria só as rotas `/{wallet_id}` e deixaria justamente as escritas
de fora — o oposto do que o ticket pede.

Filtro de query também foi recusado: "somente-leitura" não é "invisível". A
decisão travada do #15 diz que carteira excedente **continua contando em todo
total**, então ela precisa aparecer nas leituras.

A razão de fundo para unificar: a duplicação de hoje **é** o mecanismo pelo qual
alguém esquece a regra — são três lugares para lembrar. Um só, que já é
obrigatório para resolver a carteira, torna esquecer impossível sem sumir com a
carteira junto.

### A posição sai da mesma consulta

A posição sai da consulta que já resolve a carteira. Custo: zero viagem a mais.

> **Correção de 2026-08-26 (issue #86), era `row_number()`.** O Postgres recusa
> `FOR UPDATE` junto de window function — "FOR UPDATE is not allowed with window
> functions", verificado no banco — e a carteira **precisa** de lock quando o
> saldo vai mudar. A intenção (posição na mesma consulta, mesmo desempate)
> continua; o mecanismo virou uma **subquery escalar correlacionada** contando
> quantas carteiras do mesmo dono são mais antigas, que convive com o lock e
> entrega a mesma informação. `anteriores < 2` significa "está entre as 2 mais
> antigas".

O `, id` no desempate não é enfeite. `wallets.created_at` **empata** — o seed de
demo cria carteiras na mesma transação — e ordem instável faria o conjunto
bloqueado mudar entre requisições: a pessoa escreveria numa carteira e levaria
403 na seguinte, sem nada ter mudado.

Booleano `blocked` guardado na carteira foi recusado: precisaria de invalidação
em toda mudança de plano, toda criação e toda exclusão de carteira, e flag
desatualizada aqui significa enforcement errado nos dois sentidos.

### Carteira bloqueada: a matriz de verbos

| ação | permitido | código |
|---|---|---|
| ver a carteira e suas transações | **sim** | |
| criar transação ou recorrência nela | não | `WALLET_READ_ONLY` |
| mover uma transação **para** ela | não | `WALLET_READ_ONLY` |
| editar uma transação que mora nela | não | `WALLET_READ_ONLY` |
| editar nome ou saldo da carteira | não | `WALLET_READ_ONLY` |
| criar uma 3ª carteira | não | `WALLET_LIMIT_REACHED` |
| mover uma transação **para fora** dela | **sim** | |
| excluir uma transação de dentro dela | **sim** | |
| excluir a carteira | **sim** | |

**Excluir a carteira é sempre permitido** porque é a única saída de quem tem 5
carteiras e virou free sem pagar. Recusar prenderia a pessoa numa conta que ela
não consegue nem encolher, e o teto viraria armadilha em vez de limite.
"Somente-leitura" lido ao pé da letra incluiria o delete; aqui está escrito que
não inclui, para ninguém "consertar" isso depois.

**Drenar é permitido** (mover para fora, excluir de dentro) porque excluir
carteira **apaga as transações junto**, por cascade. Sem a saída de drenagem, a
escolha vira pagar ou destruir histórico. E não vaza paywall: o teto limita
carteira ativa, não congela saldo — não dá para *adicionar* valor a uma carteira
bloqueada, só tirar. O custo é honesto: a regra deixa de ser plana e vira
direcional, um `if` a mais no helper.

### IA: só a geração

Dependency nas **duas rotas que geram**: `GET /ai/insight` e `POST /ai/chat`.

`/ai/chat/sessions` e `/ai/chat/sessions/{id}` só **leem** conversas que a
pessoa já teve, e ficam abertas. Impedir alguém de ler o que ele mesmo produziu
é hostil e não economiza um centavo de Gemini — o custo já foi pago. Além disso
o app tem exportação por LGPD que devolve exatamente esse histórico: bloquear a
leitura na tela enquanto o export entrega o mesmo conteúdo seria incoerente.

Repare no **contraste com a carteira**: aqui dependency é a resposta certa
justamente porque a checagem só precisa do usuário, que é o que dependency faz
bem, e é onde este app já coloca autorização (`get_current_user`). Dentro do
`ai_service` seria pior por dois motivos: o service passaria a conhecer plano, e
qualquer chamador futuro que não passe por aquela função fura o portão sem
ninguém notar.

### Recorrência apontando para carteira bloqueada: pula e **diz**

`materialize_due_recurring` cria transações e mexe em saldo **sozinho**, em toda
navegação (o `AppLayout` chama `/recurring/run` no mount de toda rota
protegida). Uma recorrência apontando para carteira bloqueada é escrita
automática numa carteira bloqueada.

Ela é pulada, e o `/recurring/run` passa a devolver `skipped` ao lado de
`generated`. Continuar materializando vazaria o paywall para sempre; parar em
silêncio seria a pessoa descobrindo em março que o aluguel não é lançado desde
janeiro — que é exatamente a classe de defeito que as Ondas 1 e 2 existiram para
matar.

### Contrato da recusa

`403` com `detail` em objeto:

```json
{"detail": {"code": "WALLET_READ_ONLY", "message": "..."}}
```

**Três códigos, e só:** `WALLET_LIMIT_REACHED`, `WALLET_READ_ONLY`,
`AI_REQUIRES_PREMIUM`.

**Emenda (ADR 0003, 2026-09-06):** quarto código, `AI_DAILY_CAP_REACHED`, para
a cota diária de IA. O contrato do objeto não muda; esse código é o único que
também traz `resets_at`.

Não existe código separado para "trial acabou" versus "nunca teve": a mensagem
na tela difere, mas o frontend deriva isso do `plan.ai_trial_ends_at` estar
preenchido e no passado. Código novo para um fato que já viaja no `plan` seria
duplicar estado.

**`code` é contrato e nunca é reescrito. `message` é livre.**

O `apiErrorMessage` (`frontend/src/lib/utils.js`) ganha um ramo para objeto, com
teste: hoje ele entende `detail` como string (erro de negócio) ou array (422), e
objeto cairia no fallback, sumindo com a mensagem na tela.

Header próprio (`X-Norby-Reason`) foi recusado: header de resposta exige
`expose_headers` no CORS, que é a armadilha que este repo já pisou com o
`X-Total-Count` na Onda 1.

### O frontend lê um objeto `plan`

Aninhado no `UserResponse`, que já viaja no `/auth/me`, no login e no cadastro:

```
plan: {ai_allowed, wallet_cap_applies, premium_until,
       ai_trial_ends_at, subscription_status, cancel_at_period_end}
```

Os **dois booleanos são a autoridade**. Sem eles o frontend reimplementa a
carência de 72h e erra, e a tela passa a discordar do backend sobre quem é
premium. O resto existe só para o que booleano não conta: "termina em 12/09"
precisa do `premium_until` **e** do `cancel_at_period_end` para não dizer
"renova" quando é "acaba", e "pagamento recusado" só existe no
`subscription_status`.

Claim no JWT foi recusado (fica velho no instante em que a pessoa paga, e o
access token dura 15 minutos). Endpoint `/me/plan` dedicado foi recusado: viagem
de rede a mais para um dado que já anda junto do usuário.

**`TokenPair` fica como está.** Adicionar o usuário lá faria o plano se
auto-corrigir a cada refresh e resolveria de brinde o caso de quem tem o cartão
recusado com a aba aberta — mas o backend é a autoridade e recusa de qualquer
jeito, então UI desatualizada custa **um 403 com mensagem clara**, não um
resultado errado. Quem vai conseguir julgar se isso incomoda é o #25, com a tela
na mão.

### Feature flag

`Settings.paywall_enabled: bool = False`, lido **só dentro dos dois helpers de
enforcement** e em nenhum outro lugar — mesma lógica do teto: um `if` num lugar
não dá para esquecer, oito dão. Default `False` significa que o merge não muda
nada em produção; o paywall acende por variável de ambiente.

**Com o flag desligado os booleanos reportam liberado**, não a faixa real.
`ai_allowed` é sempre `true` e `wallet_cap_applies` é sempre `false`. Se eles
reportassem a faixa real, a tela bloquearia IA e carteiras que o backend aceita
normalmente — um paywall que atrapalha o usuário sem cobrar de ninguém, que é o
pior dos dois mundos. O resto do objeto `plan` (datas, status) continua
verdadeiro, porque é exibição e não portão.

## Lacuna registrada

**Corrida na primeira compra.** O redirect do Checkout pode chegar antes do
webhook, e a reconciliação preguiçosa (#48) não cobre esse instante porque exige
`stripe_subscription_id` já preenchido — que é justamente o que ainda não
chegou. Pertence ao **#46**, dono da URL de retorno.

## Consequências aceitas

- **Unificar os três helpers mexe em código que hoje funciona.** É refactor de
  caminho quente (toda escrita de transação passa por ali) dentro de um ticket
  de paywall. Mitigado pelo fato de as três cópias já terem testes de ownership.
- **A regra de drenagem é direcional**, então o helper precisa saber se a
  carteira é origem ou destino. Um `if` a mais, em troca de não obrigar ninguém
  a escolher entre pagar e destruir histórico.
- **UI pode mostrar afordância que o backend recusa** enquanto o `plan` do
  frontend está velho. Custo: um 403 com mensagem clara.
- **Renomear carteira bloqueada é recusado**, o que é chato para quem só quer
  corrigir um typo. Aceito em nome de "somente-leitura" continuar significando
  uma coisa só.
