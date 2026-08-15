# AGENTS.md — Norby

> Fonte da verdade das instruções deste projeto. Curto e operacional — não é
> documentação. Leia antes de agir e siga tudo.

## Stack & layout (monorepo)

- **Backend:** FastAPI 0.139 + SQLAlchemy 2.0 async + Alembic · PostgreSQL 16
  (relacional) + MongoDB 7 via Motor (blocos de texto da IA) · Auth JWT
  (python-jose) · IA **Gemini 3.5 Flash Lite** (`models/gemini-3.5-flash-lite`,
  ver `services/ai_service.py`) · gerenciador de pacotes **uv**.
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
uv pip compile --universal --python-version 3.12 requirements.txt -o requirements.lock
uv pip compile --universal --python-version 3.12 requirements-dev.txt -o requirements-dev.lock
uv pip install -r requirements-dev.lock                     # deps + ferramentas de dev/CI
pip-audit -r requirements.lock --ignore-vuln PYSEC-2026-1325 # audit; exceção abaixo
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
- UI em **português** (pt-BR); tema "Vidro Iridescente", escuro e claro, via
  `data-theme` no `<html>`. Cor **só** por token semântico (`bg-surface`,
  `text-content-2`, `--glass-bg`…) — hex fixo em componente e o namespace
  `norby-*` não existem mais. Ver [DESIGN.md](DESIGN.md).
- Specs e planos vivem no Second Brain (Obsidian), **não** no repo (`docs/` está
  no `.gitignore`).
- Dependências: `requirements.txt` é **só produção**; pytest e afins vivem em
  `requirements-dev.txt`. Os arquivos `.lock` fixam também as transitivas usadas
  pelo Docker; regenerá-los após alterar os arquivos-fonte. Rodar o comando de
  audit acima antes de cada release.
- Exceção do audit: `python-jose` traz `ecdsa`, afetado por
  `PYSEC-2026-1325` sem versão corrigida. `Settings.algorithm` aceita somente
  `HS256`, então o caminho vulnerável de assinatura ECDSA/ECDH não é alcançável.

## Skills neste repo

Roteamento geral em `~/.claude/SKILLS.md`. Aqui só o que é específico do Norby:

- **Design = `impeccable`, sempre.** Este repo tem `PRODUCT.md` + `DESIGN.md` +
  tokens fechados, então a skill lê a fonte em vez de inventar estética.
  **Não** usar `taste-skill` nem `ui-ux-pro-max`: as duas trazem paleta e
  tipografia próprias e brigariam com os tokens amostrados das referências.
  Register do projeto é **product** (design serve a tarefa).
- **Referências visuais são obrigatórias.** Abrir os PNGs de
  `design-references/` (não rastreados) antes de implementar e a cada revisão
  visual. Contraste se mede **no pixel renderizado sobre o vidro**, nunca no
  valor do token.
- **`graphify-out/` existe** → pergunta sobre arquitetura vira `graphify query`
  antes de varrer arquivo.
- **Verificação visual** usa a skill de projeto `run-app` (sobe a stack e
  dirige o Edge via Playwright). Frame branco é falha de launch, não sucesso.
- **Fluxos de tracker do mattpocock** (`triage`, `to-spec`, `to-tickets`,
  `wayfinder`) estão configurados desde 2026-08-15: ver "## Agent skills"
  abaixo. As specs de produto seguem no Obsidian; o que vive no repo é o
  ticket acionável e a decisão de arquitetura.
- **`pytest` e `alembic` rodam dentro do container** `norby_backend`; o host não
  conecta no Postgres do Docker.

## Agent skills

### Issue tracker

Issues e specs vivem nas GitHub Issues de `DigoDuck/Norby`, via `gh` CLI.
Ver `docs/agents/issue-tracker.md`.

### Triage labels

Os cinco papéis canônicos, cada rótulo igual ao próprio nome.
Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context: um `CONTEXT.md` na raiz mais `docs/adr/`.
Ver `docs/agents/domain.md`.

## NÃO faça

- **Nunca** commitar direto na `main` — trabalhe em branch e abra PR.
- **Nunca** rodar migration destrutiva (drop de tabela/coluna, alteração que
  perde dado) sem confirmar antes.
- **Nunca** commitar segredos. Variáveis de API, autenticação e banco ficam fora
  do git, apenas em `.env` (gitignored).

## Git commits e PRs

- **Mensagens de commit em inglês** (comentários de código e docs do vault podem ser PT).
- **Título e corpo de PR também em inglês.** Vale para descrição de issue e
  qualquer texto que fique no GitHub. O que continua em PT: UI, comentários de
  código, e os docs deste repo (`AGENTS.md`, `DESIGN.md`, `LGPD.md`, `README.md`).
- **NUNCA** adicione "Co-authored-by: Claude" ou qualquer trailer de coautoria em mensagens de commit. Comandos `git commit` devem conter apenas a mensagem solicitada, sem assinatura ou atribuição ao Claude.
- **NUNCA** adicione assinatura, atribuição ou selo de IA em corpo de PR,
  descrição de issue ou qualquer texto gerado — nada de "Generated with", link
  para claude.com ou similar.

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

**Sessão:** access token de 15 min (`ACCESS_TOKEN_EXPIRE_MINUTES`), refresh de 7
dias com rotação e detecção de reuso. O logout revoga só o refresh — um access
token roubado vale até 15 min. Revogação imediata exigiria denylist de `jti`
(consulta extra em toda request); adiada por custo/benefício.

**Logout apresentando token já rotacionado = reuso (2026-08-15):** o
`/auth/logout` trata isso igual ao `/auth/refresh` e revoga **todas** as sessões
do usuário. Antes ele respondia 204 sem revogar nada: quem roubasse `R0`,
rotacionasse para `R1` e deixasse a vítima deslogar com `R0` mantinha `R1` vivo
por 7 dias. Como o logout passou a ter o mesmo poder do refresh, ganhou o mesmo
teto (20/min); sem ele, um refresh antigo viraria um botão de derrubar sessão
replicável para sempre.

**Hash de senha — migração em andamento (2026-08-15):** `bcrypt_sha256` para
hashes novos, `bcrypt` mantido no `CryptContext` só para verificar os antigos,
que são regravados no próximo login de cada usuário (`verify_and_upgrade`).
Motivo: o bcrypt cru trunca em 72 **bytes** em silêncio, então qualquer sufixo
depois disso autenticava igual. O cadastro agora recusa senha acima de 72 bytes.
⚠️ **Esta mudança não é revertível sozinha.** Depois que um usuário loga, o hash
dele vira `$bcrypt-sha256$`, formato que o código anterior (`schemes=["bcrypt"]`)
não sabe verificar — reverter o commit tranca esses usuários para fora com a
senha correta. Em rollback, manter `bcrypt_sha256` na lista de schemes.

**Tokens no navegador — decisão consciente (2026-07-21):** access e refresh
ficam no `localStorage` (Zustand persist). A correção canônica seria refresh em
cookie `HttpOnly` + access só em memória, mas o frontend (`vercel.app`) e a API
(`railway.app`) são *sites* diferentes: o cookie exigiria `SameSite=None` e
seria bloqueado pelo Safari ITP e pelo Chrome, deslogando o usuário a cada
recarga. Mitigações no lugar: CSP restritiva no `vercel.json`, access token de
15 min e revogação de todas as sessões quando um refresh token é reusado.
**Pré-requisito para migrar:** domínio próprio com API e frontend no mesmo site
registrável (`norby.app` + `api.norby.app`) — aí o cookie vira `SameSite=Lax`.

**Rate limit atrás do proxy — decisão consciente (2026-07-21):** o uvicorn só
honra `X-Forwarded-For` quando o peer é `127.0.0.1` (default de
`forwarded_allow_ips`), e o proxy do Railway não é loopback; `FORWARDED_ALLOW_IPS`
não existe naquele ambiente, então `request.client.host` devolve o IP do proxy
para todo mundo. **Não** ligar `--forwarded-allow-ips="*"`: nessa versão do
uvicorn o `always_trust` faz o middleware usar o *primeiro* item do
`X-Forwarded-For`, que é o que o cliente controla, e o rate limit de login
viraria spoofável. Em vez disso, as rotas **autenticadas** usam `user_key` em
`app/limiter.py`, chaveando pelo id do usuário: `/ai/*` e, desde 2026-08-15,
`DELETE /auth/me` (antes um atacante podia encher o balde por IP e impedir
qualquer usuário de excluir a própria conta).

Login e cadastro são anônimos e seguem por IP, com o balde compartilhado como
dívida aceita. **Revisado em 2026-08-15, e o custo é maior do que "colateral"
como este texto dizia antes:** como o `get_remote_address` devolve o mesmo proxy
para todo mundo e os limites são pequenos (10/min e 5/min), um atacante mantém
os dois baldes cheios a custo quase zero e produz negação **global** de
autenticação. A defesa contra força bruta vira um interruptor público de
disponibilidade. Continua aceito porque a alternativa é desenho novo, não
correção: limite por identificador de conta protegido por HMAC no login, mais
teto global, e verificação de e-mail ou desafio antiabuso no cadastro. Se o
cadastro for divulgado, isso deixa de ser dívida e vira bloqueante.

**Outras dívidas assumidas** (decisões, não pendências esquecidas):
- `POST /auth/register` responde "Email já cadastrado" (enumeração por essa via
  é possível, limitada a 5/min). Mensagem genérica destruiria a usabilidade; o
  login já tem tempo constante, que era o vetor medível.
- Exclusão de conta apaga o Mongo antes do Postgres, sem transação distribuída.
  Falha no commit do SQL deixaria a conta viva sem os dados de IA.
- `/docs` fica público: todos os endpoints por trás dele exigem autenticação, e
  a documentação navegável é um ativo para o portfólio.
- Usuários criados antes da migration `b2c3d4e5f6a7` têm `privacy_accepted_at`
  nulo. NULL significa "aceite não registrado", nunca "aceitou".

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
