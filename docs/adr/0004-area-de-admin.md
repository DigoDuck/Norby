# ADR 0004 — Área de admin

- **Status:** aceito
- **Data:** 2026-09-06
- **Issue:** [#23](https://github.com/DigoDuck/Norby/issues/23), parte do mapa da v2 ([#15](https://github.com/DigoDuck/Norby/issues/15))
- **Depende de:** [ADR 0001](0001-modelo-de-assinatura.md) (`premium_until` como portão, `cancel_subscription`), [ADR 0003](0003-cota-diaria-de-ia.md) (RPD do projeto, `dia_da_cota`)
- **Decide:** quem é admin e como isso é escrito, o que a área alcança, o step-up das três ações, o formato da auditoria, e o que as métricas mostram.
- **Não decide:** a tela de admin no frontend (task separada), 2FA, paginação de usuários.

## Contexto

O #23 pede uma superfície de suporte: ver a base em números, listar usuários,
e agir em nome de alguém que pede ajuda (cancelar assinatura por chargeback ou
fraude, excluir conta a pedido, reenviar o link de recuperação de senha para
quem não recebeu). Hoje isso só é possível com acesso direto ao banco.

Não existe conceito de admin no schema. A área inteira nasce nesta task:
coluna, tabela de auditoria, dependency de portão, router, service.

## Decisão

**`users.is_admin`, coluna e não lista de e-mails em config.** A coluna morre
com a linha: um e-mail recadastrado depois de excluir a conta não herda
privilégio nenhum. Uma lista em variável de ambiente sobreviveria à exclusão e
recriação da conta, e ninguém lembraria de tirá-lo de lá. Nenhum endpoint
escreve nesta coluna — o primeiro e único admin nasce por `UPDATE` manual no
console do banco, depois da migration (procedimento no AGENTS.md). **Um admin
só** nesta v2: promover um segundo é decisão de quem já é admin, e essa
decisão não tem tela nem endpoint ainda.

**`require_admin` devolve 404, com o corpo literal do FastAPI para rota
inexistente (`{"detail": "Not Found"}`), nunca 403.** Um 403 confirmaria que
`/admin/*` existe e convidaria a insistir (senha errada, força bruta no id).
404 faz a área inteira parecer não-existente para quem não é admin — o mesmo
raciocínio do `WalletNotFound` em `main.py`, aplicado à existência da própria
rota. O disfarce vale para quem está autenticado e não é admin; uma
requisição anônima leva 401 como qualquer rota autenticada (não passa nem de
`get_current_user`), e `/openapi.json` lista `/admin/*` normalmente quando
`docs_enabled` está ligado — a ocultação depende de docs continuarem
desligados em produção.

**As três ações exigem a senha atual (step-up), não só o access token.** A
conta de admin é protegida só por senha — não há 2FA nesta v2, porque exigir
um segundo fator faz sentido a partir do dia em que houver mais de um admin
para coordenar. Com um admin só, a senha é a barreira toda, e as três ações
(cancelar assinatura, excluir conta, disparar recuperação) mudam a vida de
OUTRA pessoa: o mesmo contrato do `DeleteAccountRequest` que já protege
`DELETE /auth/me`. A ordem de checagem é fixa — senha, depois "é você mesmo",
depois "o alvo existe" — para que nenhuma resposta escape antes do step-up.

**`AdminUserOut` é um schema fechado, e essa é a garantia central do ADR.**
Ele não tem foto (dado pessoal que o admin não precisa ver) nem ids do Stripe
(no Dashboard a busca é por e-mail). O teste que serializa um usuário com
carteira e transação prova, por construção, que a lista de campos é só a que
o schema declara — nenhum admin lê saldo, categoria ou descrição de terceiro.

**A auditoria (`admin_actions`) é só-insert, sem FK, com `target_email` de
snapshot.** `admin_id` e `target_user_id` são UUIDs sem chave estrangeira de
propósito: excluir a conta é uma das três ações auditadas, e uma FK com
cascade apagaria justamente o registro de que ela foi excluída.
`target_email` existe para a linha continuar identificando o alvo depois que
a conta dele já não existe. É PII numa tabela sem purga, e é isso mesmo: o
registro das operações do controlador é obrigação da LGPD (art. 37), não
entra no export do próprio usuário (é operação do admin, não dado dele) e não
some com a exclusão da conta. `detail` guarda só identificadores — o id da
assinatura cancelada — nunca conteúdo. Não há tela de auditoria nesta v2;
quem precisar consultar, consulta o banco.

**A linha é gravada DEPOIS da ação, em commit próprio.** Ação que falhou
(senha errada, Stripe recusou, alvo é você mesmo) não deixa rastro — só o que
de fato aconteceu é auditado.

**Cancelamento é imediato, e aplicado na hora pelo `aplicar_assinatura`, não
pelo webhook.** O caminho normal de quem quer cancelar é o Customer Portal; a
ação do admin é o excepcional (fraude, chargeback, pessoa que não consegue
usar o Portal), e o acesso pago tem que parar já, sem esperar o Stripe
entregar o evento. `aplicar_assinatura` é a extração do fim de
`reconcile_subscription` (mesmo `_aplicar` do webhook): duas rotas escrevendo
as mesmas colunas por caminhos diferentes divergem, e a divergência aqui é
acesso pago errado.

**Exclusão de conta reusa `delete_account` inteiro**, sem reimplementar a
ordem Stripe-primeiro-depois-Mongo-depois-Postgres. **Recuperação de senha
reusa a cadeia inteira do "esqueci minha senha"**: `create_password_reset`
para o token e `mandar_link_de_recuperacao` (renomeado de `_mandar_link`,
agora público) para o envio em background — o admin dispara o mesmo link que
`/auth/forgot-password` manda, só que sem a pessoa precisar pedir.

**Métricas são uma consulta ao vivo, sem cache.** A base é pequena; uma
`count(*) filter` por faixa de plano custa pouco. `ai_calls_project_limit` é o
RPD 500 do ADR 0003 exposto como constante (`PROJECT_RPD`), só para a tela
comparar "quantos hoje" com "quantos no total do projeto" — não é aplicado em
lugar nenhum, quem aplica por usuário é a cota diária do `ai_service`.

## Consequências aceitas

- **Ação que falhou não deixa rastro nenhum**, nem de tentativa. Aceito
  porque o objetivo da auditoria é registrar o que o admin FEZ, não o que
  tentou — e senha errada já é bloqueada no 401 antes de chegar perto de
  qualquer ação.
- **Sem paginação em `/admin/users`** até a base passar de `LIMITE_LISTA`
  (500) usuários. Hoje a lista inteira cabe numa resposta e o filtro é no
  cliente.
- **Sem 2FA.** Aceito enquanto houver um admin só; a senha é a barreira
  inteira até esse dia.
- **`detail` da auditoria nunca guarda conteúdo**, só identificador. Uma
  investigação futura que precise de mais contexto (por que cancelou, a
  conversa de suporte) não encontra isso aqui — fica em outra ferramenta.

## Quando rever

- **Segundo admin:** decidir quem promove quem (endpoint? SQL de novo?) e
  ligar 2FA antes de multiplicar quem tem esse poder.
- **Base acima de 500 usuários:** paginação e busca no servidor em
  `/admin/users`.
- **Tela de auditoria:** hoje `admin_actions` só existe para quem consulta o
  banco direto.
