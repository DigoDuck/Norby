# CONTEXT.md — vocabulário do domínio

> Glossário do Norby. **Cresce por decisão**, não de uma vez: um termo entra
> aqui quando uma decisão o resolve, e as decisões ficam em [`docs/adr/`](docs/adr/).
> Se um conceito não está aqui, ou a linguagem é nova (reconsidere) ou é lacuna
> real (registre).
>
> Regra de uso: quando um título de issue, um nome de teste, um comentário ou um
> identificador nomeia um destes conceitos, usar **o termo desta tabela**. Não
> derivar para sinônimo.

## Plano e assinatura

Resolvido pelo [ADR 0001](docs/adr/0001-modelo-de-assinatura.md) (issue #19).

| Termo | Significa | Como se mede |
|---|---|---|
| **`premium_until`** | O portão. Instante em que o período pago termina (`current_period_end` do Stripe) | A **única** coluna que a autorização lê |
| **premium** / **ativo** | Tem acesso pago agora | `now < premium_until` |
| **free** | Nunca assinou | `premium_until IS NULL` |
| **trial de IA** | 7 dias de IA sem cartão, concedidos no cadastro. Concede **só IA**, nunca carteira | `ai_trial_ends_at > now` |
| **vencido** | Assinou e o período pago acabou | `premium_until <= now` |
| **carência** (`GRACE`) | 72 horas exatas depois de `premium_until` em que o vencido ainda escapa do teto de carteiras. A IA já parou | `premium_until <= now < premium_until + 72h` |
| **teto de carteiras** | Limite de 2 carteiras ativas. Vale para free e para vencido fora da carência | `premium_until IS NULL OR now >= premium_until + 72h` |
| **carteira excedente** | Carteira acima do teto: fica somente-leitura, mas **continua contando em todo total** | as 2 mais antigas nunca são excedentes |
| **cota diária de IA** | 120k tokens **ou** 100 chamadas por dia da cota, para quem pode gerar. Vale com o paywall desligado | linha de `ai_usage_daily` do dia abaixo dos dois tetos |
| **dia da cota** | Dia em UTC-8, o dia em que o Google zera o RPD do projeto. Nem UTC nem Brasília | `dia_da_cota()` em `ai_service.py` |

Os dois portões, escritos por extenso:

- **IA:** `ai_trial_ends_at > now OR premium_until > now`
- **Teto de carteiras aplica:** `premium_until IS NULL OR now >= premium_until + 72h`

## Aplicação do paywall

Resolvido pelo [ADR 0002](docs/adr/0002-onde-o-paywall-e-aplicado.md) (issue #20).

| Termo | Significa |
|---|---|
| **carteira bloqueada** | Carteira acima do teto. Visível e legível, mas não recebe escrita. As 2 mais antigas (`order by created_at, id`) nunca são bloqueadas |
| **drenar** | Tirar valor de uma carteira bloqueada — mover transação para fora, ou excluí-la. **Permitido**, porque a alternativa seria escolher entre pagar e destruir histórico |
| **gerar** (IA) | `GET /ai/insight` e `POST /ai/chat`, as duas rotas que custam token. São as únicas bloqueadas; ler histórico não é |
| **`paywall_enabled`** | Flag de rollout. Desligado, o app se comporta como antes da v2 **e os booleanos do `plan` reportam liberado** |
| **`plan`** | Objeto aninhado no `UserResponse`. `ai_allowed` e `wallet_cap_applies` são a autoridade; o resto é exibição |

Códigos de recusa, `403` com `detail` em objeto. **`code` é contrato e nunca é
reescrito; `message` é livre.**

| código | quando |
|---|---|
| `WALLET_LIMIT_REACHED` | criar carteira além do teto |
| `WALLET_READ_ONLY` | qualquer escrita numa carteira bloqueada, inclusive como destino |
| `AI_REQUIRES_PREMIUM` | gerar IA sem trial e sem assinatura |
| `AI_DAILY_CAP_REACHED` | gerar IA depois de estourar a cota diária (ADR 0003); traz `resets_at` |

### Termos que este glossário evita de propósito

| Não usar | Usar | Por quê |
|---|---|---|
| `is_paid`, `is_premium` como coluna | `premium_until` | Booleano guardado desincroniza do relógio; a data é auto-suficiente e falha fechado |
| `plan`, "plano do usuário" | premium / free | Existe **um** plano pago. Coluna com um valor possível é decoração |
| `subscription_status` para decidir acesso | `premium_until` | O status existe **só para exibição**. Autorizar por ele move a decisão para um vocabulário que o Stripe pode estender sem avisar |
| "assinante" para quem já pagou um dia | premium (ativo) ou vencido | "Assinante" apaga a diferença que o teto de carteiras depende de enxergar |
| "trial" para período pago | trial de IA | O trial nunca concede carteira. Confundir os dois inverte o teto |
| "carteira desativada" ou "arquivada" | carteira bloqueada | Ela não some nem para de contar nos totais: só não recebe escrita |
| mensagem de erro como identificador | o `code` da recusa | `message` muda quando o texto melhora; quem o frontend testa é o `code` |
