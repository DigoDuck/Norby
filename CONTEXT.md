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

Os dois portões, escritos por extenso:

- **IA:** `ai_trial_ends_at > now OR premium_until > now`
- **Teto de carteiras aplica:** `premium_until IS NULL OR now >= premium_until + 72h`

### Termos que este glossário evita de propósito

| Não usar | Usar | Por quê |
|---|---|---|
| `is_paid`, `is_premium` como coluna | `premium_until` | Booleano guardado desincroniza do relógio; a data é auto-suficiente e falha fechado |
| `plan`, "plano do usuário" | premium / free | Existe **um** plano pago. Coluna com um valor possível é decoração |
| `subscription_status` para decidir acesso | `premium_until` | O status existe **só para exibição**. Autorizar por ele move a decisão para um vocabulário que o Stripe pode estender sem avisar |
| "assinante" para quem já pagou um dia | premium (ativo) ou vencido | "Assinante" apaga a diferença que o teto de carteiras depende de enxergar |
| "trial" para período pago | trial de IA | O trial nunca concede carteira. Confundir os dois inverte o teto |
