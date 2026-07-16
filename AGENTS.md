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
Banco de teste (uma vez, apenas em dev): criar um banco `norby_test` no Postgres local usando um usuário com permissão de criar bancos. Essa permissão é específica do ambiente de desenvolvimento — não replicar em produção.

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
- UI em **português** (pt-BR); tema teal "Petróleo Confiável" (classes `norby-*`).
- Specs e planos vivem no Second Brain (Obsidian), **não** no repo (`docs/` está
  no `.gitignore`).

## NÃO faça

- **Nunca** commitar direto na `main` — trabalhe em branch e abra PR.
- **Nunca** rodar migration destrutiva (drop de tabela/coluna, alteração que
  perde dado) sem confirmar antes.
- **Nunca** commitar segredos. Variáveis de API, autenticação e banco ficam fora
  do git, apenas em `.env` (gitignored).

## Git commits

- **Mensagens de commit em inglês** (comentários de código e docs do vault podem ser PT).
- **NUNCA** adicione "Co-authored-by: Claude" ou qualquer trailer de coautoria em mensagens de commit. Comandos `git commit` devem conter apenas a mensagem solicitada, sem assinatura ou atribuição ao Claude.

## Deploy (produção)

App no ar, deploy a partir da branch `main`:
- **Backend:** Railway (Docker, Hobby) — `https://norby-production.up.railway.app`.
  Não dorme (sem cold start). **Root Directory = `backend`** (faz achar o
  `backend/Dockerfile`); **Healthcheck Path = `/health`**. Env vars no painel do
  Railway. (Migrado do Render em 2026-07-16 — só config, zero código.)
- **Postgres:** Neon (serverless, free). **Mongo:** Atlas M0 (free). Ficam fora do
  Railway — **não** anexar banco do próprio Railway (zeraria os dados).
- **Frontend:** Vercel — `https://norby-finance.vercel.app`. `VITE_API_URL`
  aponta pro Railway (**embutida no build** → mudou, tem que rebuildar).

Start em produção: `backend/start.sh` roda `alembic upgrade head` + uvicorn na
`$PORT` do provedor (o `CMD` do `backend/Dockerfile`; o `docker-compose.yml` de
dev sobrescreve com `--reload`).

**Armadilhas já resolvidas (não reintroduzir):**
- `VITE_API_URL` na Vercel **tem que ser `https://`**. Com `http://`, o Railway
  responde 301 → https e o redirect rebaixa **POST→GET** → todo POST (login,
  `/recurring/run`) vira 405, mesmo com `/health` e o backend ok.
- `asyncpg` rejeita params libpq (`sslmode`, `channel_binding`) que o Neon manda
  na URL. `app/config.py` (`async_database_url` + `database_ssl_required`) e
  `alembic/env.py` removem esses params e ligam SSL via `connect_args`.
- `CORS_ORIGINS` deve ter a URL da Vercel **sem barra final** (o `Origin` do
  navegador nunca tem barra), separada por vírgula do `localhost`.

**`docker-compose.prod.yml` + `Caddyfile`:** rota **alternativa self-hosted (VPS)**,
**não usada** pelo deploy atual no Railway. Sobem backend + Postgres + Mongo num
único servidor, com Caddy fazendo HTTPS automático (Let's Encrypt). Mantidos como
caminho documentado para uma futura migração pra VPS — se um dia sair do Railway,
começar por eles.

## Escopo congelado — v1 (2026-06-23)

Entregue na v1: core financeiro, metas (SAVINGS/BUDGET), transações recorrentes
(weekly/monthly, materialização preguiçosa), auth + CRUD testados.

**Fora da v1 (congelado):** frequências de recorrência custom (anual, quinzenal,
intervalo livre), data-fim e scheduler no servidor; histórico de aportes de metas;
orçamento não-mensal; metas compartilhadas; notificações/push; multi-moeda; Open
Finance; anexos/recibos; export CSV/PDF; CRUD de categorias.

**Adiado p/ próximas semanas (não é "nunca"):** auditoria de segurança profunda;
i18n. UI permanece em português. (Deploy: **feito** — ver seção "Deploy".)
