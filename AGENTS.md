# AGENTS.md — Norby

> Fonte da verdade das instruções deste projeto. Curto e operacional — não é
> documentação. Leia antes de agir e siga tudo.

## Stack & layout (monorepo)

- **Backend:** FastAPI 0.115 + SQLAlchemy 2.0 async + Alembic · PostgreSQL 16
  (relacional) + MongoDB 7 via Motor (blocos de texto da IA) · Auth JWT
  (python-jose) · IA Gemini 1.5 Flash · gerenciador de pacotes **uv**.
- **Frontend:** React 19 + Vite 8 · TailwindCSS + shadcn/ui · Zustand ·
  React Router v7 · React Hook Form + Zod · axios.

```
Norby/
├── backend/app/         # main.py, routers/, services/, schemas/, models/, dependencies.py
├── backend/alembic/     # versions/ (migrations)
├── backend/tests/       # pytest
├── frontend/src/        # pages/, components/, api/, store/, lib/
└── docker-compose.yml   # postgres + mongodb + backend
```

> Minha stack pessoal default é Django, mas **este projeto é FastAPI**. Não
> aplicar convenções/comandos de Django aqui. Contexto de referência (marca,
> modelo de dados, páginas) vive no brief do Second Brain: `02 - Projetos/Ativos/Norby.md`.

## Comandos

Infra completa (Postgres + Mongo + backend):
```
docker-compose up
```

Backend (rodar de `backend/`):
```
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # dev server :8000
pytest                                                      # testes (pytest-asyncio)
alembic upgrade head                                        # aplica migrations
alembic revision -m "descricao"                             # nova migration (preencher upgrade/downgrade)
uv pip install -r requirements.txt                          # instala deps
```
Banco de teste (uma vez): `docker exec -it norby_postgres createdb -U $POSTGRES_USER norby_test`

Frontend (rodar de `frontend/`):
```
npm run dev      # dev server :5173
npm run build    # build de produção
npm run lint     # ESLint
npm run test     # Vitest
```
> Backend ainda **não** tem linter configurado (sem ruff/flake8). Adicionar se necessário.

## Convenções

- Backend organizado **por responsabilidade**: cada domínio tem `routers/x.py`
  + `schemas/x.py` + `services/x_service.py` (quando há lógica). Models todos em
  `models/sql_models.py`.
- **Todo** acesso a dado é escopado por `user_id` via `Depends(get_current_user)`.
  Nunca confiar em id vindo do corpo sem checar ownership (→ 404 se não for do usuário).
- Dinheiro = `Numeric(15,2)` / `Decimal`; `amount` de transação sempre `> 0`
  (o sinal vem do `type` INCOME/EXPENSE).
- **Revisar a migration gerada antes de commitar** — conferir `upgrade`/`downgrade`
  e reuso de enums existentes (`create_type=False`).
- Frontend: **API client centralizado** em `src/api/` (axios em `axios.js`, um
  módulo fino por recurso). Componentes/páginas não chamam `axios` direto.
- UI em **inglês**; tema teal "Petróleo Confiável" (classes `norby-*`).
- Specs e planos vivem no Second Brain (Obsidian), **não** no repo (`docs/` está
  no `.gitignore`).

## NÃO faça

- **Nunca** commitar direto na `main` — trabalhe em branch e abra PR.
- **Nunca** rodar migration destrutiva (drop de tabela/coluna, alteração que
  perde dado) sem confirmar antes.
- **Nunca** commitar segredos. `.env` (JWT secret, `GOOGLE_API_KEY`, credenciais
  de DB) fica fora do git.

## Git commits

- **Mensagens de commit em inglês** (comentários de código e docs do vault podem ser PT).
- **NUNCA** adicione "Co-authored-by: Claude" ou qualquer trailer de coautoria em mensagens de commit. Comandos `git commit` devem conter apenas a mensagem solicitada, sem assinatura ou atribuição ao Claude.

## Escopo congelado — v1 (2026-06-23)

Entregue na v1: core financeiro, metas (SAVINGS/BUDGET), transações recorrentes
(weekly/monthly, materialização preguiçosa), auth + CRUD testados.

**Fora da v1 (congelado):** frequências de recorrência custom (anual, quinzenal,
intervalo livre), data-fim e scheduler no servidor; histórico de aportes de metas;
orçamento não-mensal; metas compartilhadas; notificações/push; multi-moeda; Open
Finance; anexos/recibos; export CSV/PDF; CRUD de categorias.

**Adiado p/ próximas semanas (não é "nunca"):** deploy (Vercel + VPS/Docker);
auditoria de segurança profunda; i18n. UI permanece em inglês.
