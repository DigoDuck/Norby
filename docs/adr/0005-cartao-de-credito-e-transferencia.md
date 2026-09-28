# ADR 0005: cartão de crédito como tipo de carteira, e transferência em tabela própria

- Status: aceito
- Data: 2026-09-27

## Contexto

Compra no cartão e pagamento da fatura eram lançados como duas despesas, e o
gasto do mês aparecia dobrado. O app não tinha como registrar dinheiro indo da
conta para o cartão sem chamar isso de despesa.

## Decisão

1. `wallets.kind` (`ACCOUNT | CREDIT_CARD`) é só apresentação. A regra de saldo
   não muda: despesa no cartão deixa o saldo negativo, e esse negativo é a
   fatura atual. A soma das carteiras passa a significar patrimônio.
2. Sem ciclo de fatura: nada de fechamento, vencimento, parcelamento ou limite.
3. Pagar a fatura é uma **transferência**, numa tabela `transfers` própria.
   Não é um terceiro `TransactionType`, porque toda agregação de receita e
   despesa lê `transactions` e teria de lembrar de excluí-lo.
4. Paywall: destino da transferência é escrita e respeita o teto (ADR 0002);
   origem bloqueada é permitida (drenar); excluir é sempre permitido.
5. Excluir uma carteira apaga as transferências dela em cascata; a outra ponta
   mantém o saldo, porque o dinheiro de fato se moveu.
6. Cartão conta no teto de carteiras do free, sem regra nova.

## Consequências

- O dashboard e a IA não mudam uma linha e já contam o gasto uma vez só.
- Ciclo de fatura, se vier, é aditivo: datas na carteira, sem mexer em saldo.
- O export LGPD inclui `transfers`.
