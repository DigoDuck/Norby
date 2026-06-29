# LGPD — Base legal e tratamento de dados (Norby)

> Documentação técnica de conformidade. Rascunho de projeto de portfólio — **não
> substitui revisão jurídica**. Mantido versionado no repo porque `docs/` é
> ignorado pelo git (ver `.gitignore`).

Controlador: **Norby** · Contato do titular: `privacidade@norby.app`

## 1. Inventário de dados e base legal

| Dado | Onde fica | Finalidade | Base legal (LGPD art. 7º) |
|------|-----------|------------|---------------------------|
| Nome, e-mail | PostgreSQL `users` | Identificação e contato | Execução de contrato (V) |
| Senha (hash bcrypt) | PostgreSQL `users.password_hash` | Autenticação | Execução de contrato (V) |
| Refresh tokens (hash) | PostgreSQL `refresh_tokens` | Manter sessão / segurança | Execução de contrato (V) + legítimo interesse na segurança (IX) |
| Carteiras, transações, recorrentes, metas | PostgreSQL | Funcionalidade do organizador | Execução de contrato (V) |
| Mensagens do chat e insights de IA | MongoDB `chat_history`, `ai_insights` | Gerar análises e responder no assistente | **Consentimento** (I) |

Nenhum dado sensível (art. 5º, II) é tratado intencionalmente. O usuário não deve
inserir dados de saúde, biometria etc. nos campos livres.

## 2. Compartilhamento com terceiros (operadores)

- **Google Gemini (IA):** recebe o contexto financeiro e a mensagem do usuário
  para gerar respostas/insights. Acionado apenas nos recursos de IA — base de
  **consentimento**.
- **Infraestrutura de hospedagem** (banco e backend): processamento necessário à
  prestação do serviço.

Não há venda de dados nem uso para publicidade.

## 3. Direitos do titular e como são atendidos no produto

| Direito (art. 18) | Como o usuário exerce | Implementação |
|-------------------|------------------------|---------------|
| Acesso / portabilidade | Configurações → "Exportar meus dados" | `GET /auth/me/export` → JSON com todos os dados (PG + Mongo) |
| Eliminação | Configurações → "Excluir minha conta" (digitar EXCLUIR) | `DELETE /auth/me` → remove Mongo (`delete_many`) + `User` no PG (cascade) |
| Correção | Configurações → Perfil | `PUT /auth/me` |
| Revogação de consentimento | Deixar de usar os recursos de IA | Dados de IA podem ser apagados via exclusão da conta |

A exclusão é **definitiva e real**: apaga de `ai_insights` e `chat_history` no
MongoDB e do PostgreSQL (o `ondelete=CASCADE` em wallets/transactions/recurring/
goals/refresh_tokens garante que nada fica órfão). Ver
`backend/app/services/account_service.py`.

## 4. Retenção

Dados retidos enquanto a conta existir. Após a exclusão, não há backup de
recuperação no escopo atual do projeto.

## 5. Pendências conhecidas (futuro)

- Registro de consentimento com timestamp/versão dos termos no banco (hoje o
  aceite é validado no front no cadastro, mas não persistido).
- Política formal de retenção de logs.
- DPO/encarregado nomeado (art. 41) — não aplicável a um projeto de portfólio.
