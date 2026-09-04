# ADR 0001 — Modelo de dados de assinatura

- **Status:** aceito
- **Data:** 2026-08-25
- **Issue:** [#19](https://github.com/DigoDuck/Norby/issues/19), parte do mapa da v2 ([#15](https://github.com/DigoDuck/Norby/issues/15))
- **Decide:** onde mora o estado de plano, como o webhook o alimenta e o que o
  app lê para autorizar.
- **Não decide:** onde os portões são aplicados (#20), teto diário de IA (#21),
  papéis e área de admin (#23), layout da `/perfil` (#25).

> Primeiro ADR do repositório. Escrito em português, como os demais documentos
> daqui (`AGENTS.md`, `DESIGN.md`, `LGPD.md`); o que vai para issue e PR no
> GitHub continua em inglês.

## Contexto

A v2 cobra uma assinatura mensal de BRL 20,00 via Stripe, com dinheiro recebido
como pessoa física (CPF). O schema de hoje — `users`, `refresh_tokens`,
`login_throttles`, `wallets`, `transactions`, `recurring_transactions`,
`goals` — não tem nada de plano, assinatura ou papel. Nenhuma linha de código de
billing pode ser escrita antes desta decisão.

As regras de negócio já estavam travadas no #15 e **não** são decididas aqui:
free são 2 carteiras e nenhuma IA; conta nova ganha 7 dias de IA sem cartão;
carteira excedente fica somente-leitura mas continua contando em todo total;
usuário pré-v2 vira free no dia do deploy, sem grandfathering; assinatura
vencida para só a IA. Uma decisão foi refinada durante a sessão de grilling:
o vencido perde a IA imediatamente e mantém as carteiras extras por **72 horas**
antes de voltar ao teto de 2.

A pesquisa do #16 confirmou que o Stripe aceita conta individual com CPF, com
repasse doméstico em 30 dias e custo efetivo de ~6,6% sobre os BRL 20,00. Restou
um item não confirmado por fonte primária — se conta `individual` pode rodar
Billing — que o #26 fecha abrindo a conta real. Este ADR foi escrito assumindo
que sim, e a seção "Acoplamento" abaixo diz exatamente o que muda se não for.

## Decisão

### O portão é uma data, não um enum de status

`users.premium_until` guarda o `current_period_end` do Stripe e é **a única
coluna que a autorização lê**.

> **Correção de 2026-09-04 (issue #48): o campo mudou de lugar no Stripe.**
> Na versão de API que o SDK 15 fixa (`2026-07-29.dahlia`) `current_period_end`
> **não existe mais no topo da assinatura** — ele mora em cada item
> (`items.data[].current_period_end`). O código lia só o topo, então uma conta
> com versão moderna devolveria `None` e **apagaria o `premium_until` de quem
> paga**: o portão nunca abriria. Isso estava em `main` desde o #45 e passou
> despercebido porque as fixtures de teste foram escritas na forma antiga.
> A leitura agora tenta o topo primeiro (conta com versão antiga fixada no
> endpoint ainda manda ali) e cai para os itens. Fica num helper só, o mesmo
> que o webhook e a reconciliação usam.

O Stripe não move `current_period_end` quando o cartão falha — ele continua
tentando cobrar dentro do período já pago. Logo a data, sozinha, já responde
"essa pessoa tem acesso agora". Três consequências caem de graça:

- `cancel_at_period_end` deixa de ser estado. No Stripe é `status=active` mais
  uma flag, e o app não faz nada diferente: o acesso vai até o fim do período
  pago de qualquer forma.
- A carência de `past_due` deixa de ser política nossa. É o cronograma de retry
  do Stripe, acontecendo dentro de um período que já foi pago.
- **Webhook perdido falha fechado.** A pior coisa que a perda de um evento
  consegue fazer é deixar o acesso expirar. Nunca conceder acesso indevido.

Um enum de status como portão faria o contrário: um status novo que o Stripe
invente cai no `else` de algum gate e vira concessão ou negação silenciosa.

### As quatro faixas são comparações de data

Com `GRACE = 72h` — 72 horas exatas a partir de `premium_until`, não dias de
calendário: `premium_until` é um instante vindo do Stripe, e dia de calendário
exigiria um fuso que este modelo não precisa ter.

| condição | carteiras | IA |
|---|---|---|
| `premium_until IS NULL` | teto de 2 | só se `ai_trial_ends_at > now` |
| `now < premium_until` | ilimitadas | sim |
| `premium_until <= now < premium_until + GRACE` | ilimitadas | não |
| `now >= premium_until + GRACE` | teto de 2 | não |

- Portão de IA: `ai_trial_ends_at > now OR premium_until > now`
- Teto de carteira aplica quando: `premium_until IS NULL OR now >= premium_until + GRACE`

O trial concede **só IA**. Quem está em trial continua com teto de 2 carteiras,
que é o que a decisão travada diz.

### Colunas em `users`, não tabela `subscriptions`

Sete colunas novas, todas alimentadas direto do payload do webhook, sem tradução
para vocabulário próprio.

| coluna | tipo | papel |
|---|---|---|
| `premium_until` | `timestamptz`, indexada | o portão |
| `ai_trial_ends_at` | `timestamptz` | trial de 7 dias, gravado no `POST /auth/register` |
| `stripe_customer_id` | `varchar(255)`, único | reabrir Checkout e Customer Portal de quem volta |
| `stripe_subscription_id` | `varchar(255)` | cancelar na exclusão de conta e no admin |
| `subscription_status` | `varchar(32)` | string crua do Stripe, **só exibição** |
| `cancel_at_period_end` | `boolean`, default `false` | exibição: "sua assinatura termina em X" |
| `stripe_event_at` | `timestamptz` | `created` do último evento aplicado, guarda contra chegada fora de ordem |

O critério: **uma coluna só entra se afirmar um fato que `premium_until` não
consegue afirmar.** Por esse corte ficaram de fora `plan` (um plano só, sem
tiers — coluna com um valor possível é decoração) e qualquer marca de "já foi
premium alguma vez". `subscription_status` e `cancel_at_period_end` entraram
porque a data não consegue dizer que a pessoa já cancelou mas ainda está dentro
do período pago, nem que o pagamento falhou e o Stripe está retentando — sem
elas o `/perfil` mente para quem acabou de cancelar e cala para quem está com o
cartão recusado.

O ganho concreto de colunas sobre tabela dedicada: `get_current_user` já carrega
o objeto `User` em toda rota autenticada, então **o portão custa zero query
extra**. Uma tabela `subscriptions` exigiria um JOIN ou uma segunda query em
cada requisição protegida, e o histórico que ela carregaria já está no Stripe,
que é o sistema de registro do dinheiro. Duplicar o relatório dele numa tabela
nossa é manter um segundo livro-caixa que pode divergir do primeiro.

### O trial é conceito do Norby, não do Stripe

`ai_trial_ends_at` gravado no cadastro. A alternativa — Subscription do Stripe
com `trial_period_days` sem método de pagamento — obrigaria a criar Customer e
Subscription **no cadastro de todo mundo**, inclusive de quem nunca vai pagar, e
acoplaria o registro a uma chamada de terceiro que pode falhar.

Efeito colateral desejado: a migration deixa a coluna `NULL` para todo usuário
existente, e `NULL` significa "sem trial". O requisito "usuário pré-v2 não ganha
trial retroativo" sai de graça. Derivar o trial de `created_at` faria exatamente
o oposto.

### `stripe_webhook_events`: projeção, não payload cru

Colunas: `event_id` (PK), `type`, `stripe_created`, `customer_id`,
`subscription_id`, `current_period_end`, `status`, `cancel_at_period_end`,
`received_at`, `processed_at`.

Guardar o evento inteiro em JSONB colocaria PII fora do alcance do
`delete_account` — `checkout.session.completed` traz `customer_details.email`, e
o [LGPD.md](../../LGPD.md) trata exclusão como direito, não cortesia. Guardando
só os campos que o handler usa, não existe nada a apagar depois: o problema
morre na origem em vez de virar rotina de limpeza.

Nada de real se perde. A capacidade de *replay* que o payload cru daria é
redundante com a reconciliação preguiçosa (abaixo), que consulta o Stripe ao
vivo — recuperação melhor do que reprocessar uma cópia velha. Para depuração, o
painel do Stripe guarda todo evento por 30 dias com botão de reenviar; manter
uma segunda cópia duplica um sistema que já faz isso melhor. A idempotência só
precisa do `event_id` único.

### Webhook

`POST /billing/webhook`.

- **Corpo cru obrigatório.** A verificação de assinatura exige os bytes
  originais (`await request.body()`), então este handler **não pode** receber um
  modelo Pydantic — deixar o FastAPI parsear o JSON invalida a assinatura.
- Assinatura por `stripe.Webhook.construct_event` com `STRIPE_WEBHOOK_SECRET`.
- Corpo acima de **64 KB é recusado antes do HMAC**, para ninguém pagar CPU de
  HMAC sobre lixo. Essa é a proteção certa para endpoint anônimo que roda HMAC.
- **Sem rate limit por IP, por decisão.** Atrás do proxy do Railway todos os IPs
  são o mesmo (ver "Rate limit atrás do proxy" no `AGENTS.md`), então um teto
  por IP aqui deixaria qualquer pessoa derrubar as entregas do Stripe. É o bug
  que a Onda 2 inteira existiu para matar; não reintroduzir numa rota nova.

Quatro eventos consumidos:

| evento | por quê |
|---|---|
| `checkout.session.completed` | primeira compra; amarra customer e subscription ao usuário via `client_reference_id`. **Não traz período nenhum** |
| `customer.subscription.created` | é ele que abre o portão na primeira compra |
| `customer.subscription.updated` | renovação, cancelamento agendado e pagamento falhado — o cavalo de batalha |
| `customer.subscription.deleted` | fim da assinatura |

> **Correção de 2026-08-25 (issue #45), eram três.** A lista original tinha
> `checkout.session.completed`, `updated` e `deleted`, e não cobria a primeira
> assinatura: o payload de `checkout.session.completed` em modo subscription
> traz `client_reference_id`, `customer` e `subscription`, mas **não**
> `current_period_end` — quem carrega o período de uma assinatura nova é o
> `customer.subscription.created`, não o `updated`. Com a lista antiga, o
> `premium_until` da primeira compra só apareceria na primeira renovação, um mês
> depois. O conserto custa zero lógica: `created` e `updated` caem no mesmo
> handler, porque os dois trazem o objeto completo da assinatura.

`invoice.paid` e `invoice.payment_failed` **não** são consumidos: renovação paga
já dispara `subscription.updated` com o `current_period_end` novo, e cartão
recusado já dispara `subscription.updated` com `status=past_due`. São o mesmo
fato chegando por outra porta.

**No `customer.subscription.deleted`, o portão vai para `ended_at`, não para
`current_period_end`.** Num cancelamento imediato o Stripe manda `ended_at`
agora e o `current_period_end` ainda apontando para o futuro; usar o período ali
deixaria acesso pago em pé depois do fim da assinatura. Cai para o período
quando o Stripe omite o `ended_at`.

Fluxo, inline e sem fila:

1. verifica assinatura
2. insere a linha em `stripe_webhook_events`; conflito no `event_id` responde
   200 **sem reprocessar** (idempotência)
3. descarta sem aplicar se `stripe_created < users.stripe_event_at` (chegada
   fora de ordem — o Stripe não garante ordem)
4. aplica nas colunas, commita, responde 200

Falha da aplicação responde 500 e o Stripe reentrega por até 3 dias, que é o
comportamento de uma fila com retry sem infra de fila. Este projeto não tem
scheduler nem worker e esta decisão não introduz um.

A guarda de ordem é `stripe_event_at`, não "nunca deixar `premium_until` andar
para trás": a segunda quebraria o cancelamento de verdade, que precisa andar
para trás.

### Chamadas de saída ao Stripe — três

> **Correção de 2026-09-04 (issue #48): a chave nunca chegava ao SDK.**
> Nada no app atribuía `stripe.api_key`, que ficava `None` — a primeira chamada
> real de saída falharia por autenticação. O `stripe_secret_key` existia no
> `Settings` e não era usado por ninguém. O efeito mais grave não era nesta
> feature: **quem tivesse assinatura não conseguiria excluir a conta**, porque
> a recusa do gateway aborta a exclusão de propósito (ver a seção abaixo). As
> saídas passam a receber `api_key` explicitamente, por chamada.

- criar sessão de **Checkout hospedado** (`client_reference_id = user.id`)
- criar sessão de **Customer Portal**
- cancelar assinatura — só a área de admin (#23)

**Checkout hospedado, não Payment Element.** O argumento decisivo é a CSP: o
Payment Element exige abrir `script-src` para `js.stripe.com` mais frames, ou
seja, afrouxar a CSP na mesma release que começa a processar pagamento. O #15 já
trata a CSP como intocável a ponto de recusar API externa de logo de banco por
causa dela. O Checkout ainda resolve 3DS/SCA e recibo sem código nosso. O preço,
que é real: a pessoa sai do app na hora de pagar. Mitigado com locale pt-BR,
logo e cor configurados no próprio Checkout.

**Customer Portal para cancelamento, troca de cartão e histórico de faturas.** Um
endpoint próprio só de cancelar entregaria um terço da feature: cartão recusado
precisa de tela de atualizar cartão, e o #25 já pede histórico de cobrança na
`/perfil`. Isso **não** zera o cliente Stripe do lado do servidor — o admin
precisa cancelar a assinatura de outra pessoa e não pode usar a sessão de portal
dela.

### Exclusão de conta cancela no Stripe primeiro

Havendo `stripe_subscription_id`, cancela no Stripe **antes** de qualquer
exclusão; recusa do Stripe **aborta a exclusão inteira** com erro claro. Depois
segue o fluxo Mongo → Postgres atual.

A ordem vem da assimetria dos modos de falha: exclusão que falhou é recuperável,
basta tentar de novo; cartão sendo cobrado por uma conta que não existe mais não
é — vira chargeback e a pessoa não tem nem onde clicar para cancelar. A LGPD dá
direito à exclusão, e uma falha temporária com mensagem honesta não fere isso;
continuar cobrando em silêncio, sim.

Sem `stripe_subscription_id`, a chamada não acontece.

### Reconciliação preguiçosa de webhook perdido

Dispara **só** quando `premium_until <= now` **e** `stripe_subscription_id IS
NOT NULL`: uma leitura no Stripe para atualizar as colunas. Usuário free nunca
paga essa chamada.

Não existe scheduler neste projeto; o padrão é o mesmo do
`materialize_due_recurring`, que já roda de carona em requisição. E como o
desenho já falha fechado, a reconciliação não existe para proteger receita —
existe para consertar a única direção que machuca cliente pagante: pagou, o
webhook se perdeu, e o app diz que ele não é premium.

> **Ajustes de 2026-09-04, na implementação (issue #48).** Três, todos com
> teste:
>
> 1. **`premium_until` NULO entra no gatilho**, não só o vencido. É o caso do
>    `customer.subscription.created` perdido: o checkout amarrou os ids e o
>    período nunca chegou. Sem isso, quem pagou ficaria travado para sempre —
>    exatamente a dor que a reconciliação existe para curar.
> 2. **Status terminal não é consultado de novo.** `canceled` e
>    `incomplete_expired` casariam com o gatilho para sempre (vencido, com
>    `subscription_id` preenchido) e fariam uma chamada de rede em **toda**
>    requisição daquela pessoa. A própria reconciliação grava o status que a
>    desliga, então ela se auto-limita.
> 3. **Uma janela de 15 minutos por usuário**, porque `past_due` com período
>    vencido não é terminal e cairia na mesma repetição durante todo o
>    cronograma de retry do Stripe. É cache em processo, o que basta para um
>    worker de uvicorn; vira coluna `plan_synced_at` no dia em que rodar com
>    mais de um.
>
> Onde ela dispara: no `get_current_user`, e não nos leitores de plano. Eles
> (`ai_gate_open`, `wallet_cap_active`, o objeto `plan`) são funções puras sem
> sessão, e o `get_current_user` é o único ponto por onde a linha do usuário
> entra numa requisição autenticada.
>
> A marca d'água `stripe_event_at` **não se move** na reconciliação: carimbá-la
> com o nosso relógio faria um webhook legítimo chegando logo depois entrar
> como atrasado por diferença de relógio.

### Testes de billing sem falar com o Stripe

Fixtures JSON dos 3 eventos, assinadas em teste com um segredo de teste. Cobrem
assinatura válida, assinatura inválida recusada, evento duplicado sem efeito,
evento com `stripe_created` mais antigo ignorado, e cada transição de
`premium_until`.

Toda a superfície que é nossa se resume a "dado este payload, as colunas
terminam assim" — função pura do payload, sem chamada ao Stripe no meio.
`stripe-mock` testaria o formato da API do Stripe, que é a parte que quase não
chamamos; a CLI do Stripe exigiria chave real e rede em CI, que é o mesmo motivo
pelo qual este repo recusou o Snyk. As chamadas de saída ficam stubadas na
fronteira do serviço, no padrão que o Gemini já usa.

## Acoplamento — o que muda se o #26 derrubar o Stripe

Se conta individual não puder rodar Billing, o fallback é o Asaas (o Pagar.me
está fora: exige CNPJ ou MEI). Quatro pontos mudam:

1. os 3 nomes de evento e os caminhos de campo que alimentam as colunas
2. o nome das duas colunas de id externo
3. o helper de verificação de assinatura
4. as 3 chamadas de saída

O resto é agnóstico de gateway: data-como-portão, as quatro faixas, idempotência
por id de evento, ordenação por timestamp de evento e a reconciliação preguiçosa.

## Consequências aceitas

- **Webhook perdido bloqueia cliente pagante** até a reconciliação disparar.
  Mitigado, não eliminado.
- **Duas saídas do app na jornada de dinheiro** (Checkout e Portal). Custo
  consciente de não afrouxar a CSP e de não construir UI de billing.
- **`subscription_status` guarda vocabulário estrangeiro.** Status novo do Stripe
  aparece na tela sem ser entendido — mas não autoriza nada, então não vira
  falha de segurança.
- **Repasse em 30 dias** no cartão doméstico. É fato do Stripe e atinge fluxo de
  caixa, não o modelo.

## Alternativas consideradas e recusadas

| Alternativa | Por que não |
|---|---|
| Consultar o Stripe ao vivo a cada requisição | Chamada de rede a terceiro no caminho de toda rota protegida; instabilidade do Stripe viraria paywall na cara de quem paga |
| Tabela `subscriptions` dedicada | JOIN ou segunda query por requisição, e o histórico que ela guardaria já vive no Stripe. A tabela de eventos, que é obrigatória para idempotência, já carrega o que sobraria de útil |
| Enum próprio de status como portão | Move a autorização para um vocabulário que o Stripe pode estender sem avisar; a data já responde a pergunta e falha fechado |
| Trial como Subscription do Stripe | Criaria Customer e Subscription para todo cadastro, inclusive de quem nunca paga, e acoplaria o registro a uma chamada externa |
| Payload cru em JSONB | PII (`customer_details.email`) fora do alcance do `delete_account`, e o replay que ele daria é redundante com a reconciliação |
| Payment Element embutido | Exigiria afrouxar a CSP na mesma release que começa a cobrar |
| `stripe-mock` ou Stripe CLI em CI | Testariam a API do Stripe, não o nosso handler; a CLI ainda exigiria chave real e rede |
