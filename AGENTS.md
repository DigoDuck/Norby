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
- Specs e planos vivem no Second Brain (Obsidian), **não** no repo (`docs/*`
  está no `.gitignore`). Duas exceções, essas versionadas: `docs/agents/`
  (config das engineering skills) e `docs/adr/` (decisões de arquitetura). O
  vocabulário de domínio fica no [CONTEXT.md](CONTEXT.md) da raiz e cresce por
  decisão, não de uma vez.
- Dependências: `requirements.txt` é **só produção**; pytest e afins vivem em
  `requirements-dev.txt`. Os arquivos `.lock` fixam também as transitivas usadas
  pelo Docker; regenerá-los após alterar os arquivos-fonte. Rodar o comando de
  audit acima antes de cada release. **A CI barra a deriva**: o passo "Locks
  match the requirement files" roda `backend/scripts/check_locks.py`, que
  reprova quando um pin do `requirements*.txt` não está refletido no `.lock`.
  Existe porque quem instala é o `.lock` — bumpar só o `.txt` deixa o container
  na versão antiga com a CI verde. É exatamente o que os PRs de pip do
  Dependabot fazem: eles não sabem regenerar lock de `uv`.
- Exceção do audit: `python-jose` traz `ecdsa`, afetado por
  `PYSEC-2026-1325` sem versão corrigida. `Settings.algorithm` aceita somente
  `HS256`, então o caminho vulnerável de assinatura ECDSA/ECDH não é alcançável.
- `pip-audit` não tem filtro de severidade: o gate do backend reprova em
  qualquer advisory, mais estrito que o "só high" da issue #37 (`npm audit
  --audit-level=high` é quem casa com aquele critério). O job de Lighthouse só
  roda em push para `main` contra o site já implantado — é alarme pós-deploy,
  não gate de merge, e disputa corrida com o redeploy da Vercel (documentado
  no próprio workflow).

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
- **Backend:** Railway (Docker, Hobby) — `https://api.norby.com.br`
  (a antiga `https://norby-production.up.railway.app` continua respondendo).
  Não dorme (sem cold start). **Root Directory = `backend`** (faz achar o
  `backend/Dockerfile`); **Healthcheck Path = `/health`**. Env vars no painel do
  Railway. (Migrado do Render em 2026-07-16 — só config, zero código.)
- **Postgres:** Neon (serverless, free). **Mongo:** Atlas M0 (free). Ficam fora do
  Railway — **não** anexar banco do próprio Railway (zeraria os dados).
- **Frontend:** Vercel — `https://norby.com.br` (apex canônico; o `www` **e** a
  antiga `norby-finance.vercel.app` fazem 308 para ele na borda, então nenhuma
  requisição nasce mais naquela origem e ela saiu do `CORS_ORIGINS`).
  `VITE_API_URL` aponta pra API (**embutida no build** → mudou, tem que
  rebuildar).

⚠️ **Trocar o host da API é DUAS mudanças, e a ordem importa.** O
`connect-src` da CSP em `frontend/vercel.json` lista os hosts permitidos na
unha. Apontar a `VITE_API_URL` para um host que não está lá faz o navegador
**bloquear toda chamada**, e isso não aparece como erro de build nem de deploy:
a tela sobe e as requisições morrem. Primeiro o host entra na CSP e vai para
produção, depois a variável muda. Durante a transição os dois hosts ficam
listados; o antigo só sai quando ninguém mais o usa.

Start em produção: `backend/start.sh` roda `alembic upgrade head` + uvicorn na
`$PORT` do provedor (o `CMD` do `backend/Dockerfile`; o `docker-compose.yml` de
dev sobrescreve com `--reload`).

**O endpoint do Stripe assina QUATRO eventos, e o quarto é fácil de esquecer
(2026-09-06):**

```
checkout.session.completed
customer.subscription.created   <- o que move o premium_until na PRIMEIRA compra
customer.subscription.updated
customer.subscription.deleted
```

O `checkout.session.completed` **não traz período nenhum**: ele só amarra
`stripe_customer_id` e `stripe_subscription_id`. Quem escreve o `premium_until`
da primeira assinatura é o `created`. Assinar só três eventos, omitindo ele,
NÃO derruba nada de forma visível: o retorno do Checkout chama
`/billing/confirm-checkout` (#46), que busca a assinatura pela API e preenche o
portão. O caminho principal fica desligado e ninguém percebe, porque a rede de
segurança segura a primeira compra.

Quebra de verdade para quem fecha a aba antes de voltar do Stripe. Aí só a
reconciliação preguiçosa (#48) salva, e só no próximo request autenticado.
Conferir a lista de eventos no painel é mais rápido do que diagnosticar isso
depois.

**Ciclo de cobrança validado em produção com dinheiro real (2026-09-06):**
compra de R$ 20,00 em modo live, premium ativado, Portal do cliente aberto,
cancelamento imediato via `DELETE /v1/subscriptions` e estorno integral. Cobre
o art. 49 do CDC (arrependimento com devolução integral) e a exigência do
Decreto 7.962/2013 de cancelar ser tão fácil quanto contratar. Taxa do Stripe
na operação: R$ 1,19 sobre R$ 20,00, **não devolvida no estorno**.

**Reembolso são DUAS ações, sempre (2026-09-05):** estornar a cobrança no
painel do Stripe **não cancela a assinatura**. Os quatro eventos que o webhook
assina não incluem nada de estorno, então só devolver o dinheiro deixa
`premium_until` intacto, o acesso pago em pé até o fim do período **e a
renovação cobrando de novo no mês seguinte** — a pessoa que exerceu o direito de
arrependimento leva uma segunda cobrança, o oposto exato do que os Termos de Uso
prometem. O procedimento é: **(1)** cancelar a assinatura no painel, o que
dispara `customer.subscription.deleted` e fecha o portão pelo `ended_at`, e
**(2)** estornar a cobrança. Nessa ordem, porque o cancelamento é o que a
aplicação enxerga. Achado na revisão do #29, sem ocorrência real até aqui.

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

**Hash de senha (2026-08-15, reescrito sem passlib em 2026-09-05):**
`bcrypt_sha256` para hashes novos, `bcrypt` cru ainda verificado para os
antigos, que são regravados no próximo login (`verify_and_upgrade`). Motivo da
migração: o bcrypt cru trunca em 72 **bytes** em silêncio, então qualquer sufixo
depois disso autenticava igual. O cadastro recusa senha acima de 72 bytes.

O `passlib` **não existe mais aqui** (#102): ele parou em 2020, quebrava no
import com bcrypt 5 e importava o `crypt`, removido no Python 3.13. Os dois
esquemas são implementados em `app/services/password_service.py`, e os testes
carregam hashes-testemunha gerados pelo passlib antes da troca — são eles que
provam que ninguém precisa redefinir senha.

⚠️ **Esta mudança não é revertível sozinha.** Depois que um usuário loga, o hash
dele vira `$bcrypt-sha256$`, formato que o código anterior a 2026-08-15 não sabe
verificar — reverter tranca esses usuários para fora com a senha correta. Em
qualquer rollback, `bcrypt_sha256` tem de continuar sendo verificado.

**Tokens no navegador — decisão consciente (2026-07-21):** access e refresh
ficam no `localStorage` (Zustand persist). A correção canônica seria refresh em
cookie `HttpOnly` + access só em memória, mas o frontend (`vercel.app`) e a API
(`railway.app`) são *sites* diferentes: o cookie exigiria `SameSite=None` e
seria bloqueado pelo Safari ITP e pelo Chrome, deslogando o usuário a cada
recarga. Mitigações no lugar: CSP restritiva no `vercel.json`, access token de
15 min e revogação de todas as sessões quando um refresh token é reusado.
**Pré-requisito para migrar: CUMPRIDO em 2026-09-05.** `norby.com.br` foi
adquirido, então API e frontend podem passar a viver no mesmo site registrável
(`norby.com.br` + `api.norby.com.br`) e o cookie vira `SameSite=Lax`. Os dois
domínios já estão no ar, então não sobrou passo de infraestrutura: falta só o
código, rastreado no #110.

**Rate limit atrás do proxy — reescrito em 2026-08-16 (issue #22, fix round 1
incluído):** o uvicorn só honra `X-Forwarded-For` quando o peer é
`127.0.0.1` (default de `forwarded_allow_ips`), e o proxy do Railway não é
loopback; `FORWARDED_ALLOW_IPS` não existe naquele ambiente, então
`request.client.host` devolve o IP do proxy para todo mundo. **Não** ligar
`--forwarded-allow-ips="*"`: nessa versão do uvicorn o `always_trust` faz o
middleware usar o *primeiro* item do `X-Forwarded-For`, que é o que o
cliente controla — o rate limit viraria spoofável. Railway também não
documenta onde fica o IP real nesse header (o próprio suporte deles se
contradiz), então `app/routers/auth.py` loga o header cru (`_log_xff`) nas 4
rotas de auth pra decidir com dado — temporário, remover depois de ler os
logs de produção por algumas semanas.

Rotas **autenticadas** usam `user_key` em `app/limiter.py`, chaveando pelo id
do usuário: `/ai/*` e, desde 2026-08-15, `DELETE /auth/me`.

Login e cadastro (anônimos) **não seguem mais por IP.** Desde 2026-08-16 usam
atraso progressivo **por conta**: a chave é o HMAC-SHA256 do email
normalizado (lower + trim) com o `secret_key` do servidor — o email cru nunca
é gravado (`app/services/throttle_service.py`, tabela `login_throttles`,
migrations `1c1a72a15b9e` + `764bc1132df0`). Curva: as 3 primeiras falhas não
esperam nada; da 3a falha acumulada em diante, a próxima tentativa exige
`min(2**(n-3), 60)` segundos desde a última falha (1s, 2s, 4s, 8s, 16s, 32s,
60s, 60s...). Sucesso reseta o contador. O contador incrementa IDÊNTICO
exista ou não o email — preserva o tempo constante do login (`_DUMMY_HASH`)
e impede que o próprio rate limit vire oráculo de enumeração. `check_throttle`
nunca segura a requisição com `sleep` nem bloqueia pra sempre: responde 429
com `Retry-After`. O incremento é um upsert atômico do Postgres (`ON CONFLICT
DO UPDATE`), não um read-modify-write em Python — a versão anterior perdia
incremento sob concorrência e podia estourar 500 na primeira falha simultânea
de uma chave nova (fix round 1).

Cadastro compartilha o balde do login (mesma chave, o email). Tentativas
repetidas de "email já cadastrado" (dívida aceita abaixo) também encostam na
curva. As comparações de email em `/auth/login`, `/auth/register` e
`PUT /auth/me` são por `func.lower(User.email)`, com índice único funcional
em `lower(email)` no banco (fix round 1: a comparação sensível a caixa
permitia criar uma conta-sombra — `Joao@x.com` ao lado de `joao@x.com` — que,
ao logar com sucesso, resetava o balde da vítima, já que a chave HMAC do
throttle normaliza a caixa mas a checagem de duplicidade não normalizava).

Tetos globais (só flood protection, bem acima do pico legítimo, não são mais
a defesa principal): login 200/min, cadastro 60/min, refresh 600/min, logout
120/min. `/auth/refresh` só tinha teto (20/min) por ser CAPACIDADE, não
defesa: com access token de 15min, ~100 usuários ativos já geram ~20/min no
pico, e o teto antigo derrubava sessão sem nenhum atacante — o que protege o
refresh é o token opaco de 256 bits com rotação e detecção de reuso, não o
contador. `/auth/logout` derruba TODAS as sessões ao receber um token já
rotacionado, então tem DOIS limites empilhados: por hash do token
apresentado (não IP — um token velho da vítima não esgota o balde de outra
sessão) **e** por IP (fix round 1: chavear só pelo token deixava o teto sem
efeito nenhum contra flood, já que um token aleatório novo a cada chamada
nunca esgota o próprio balde). `/auth/forgot-password` soma 200/min por IP
(mesma dívida aceita do login, balde único do proxy) com 3/hora por e-mail
(HMAC, `reset_email_key`) — este último é quem de fato protege a caixa de
entrada do alvo. `/auth/reset-password` tem só o teto de 200/min por IP: quem
protege o token é a entropia dos 48 bytes, não o contador.

**Duas dívidas aceitas nesta reescrita, não pendências esquecidas:**
- **A vítima pode levar 429 mesmo digitando a senha certa.** `check_throttle`
  roda ANTES de verificar a credencial — é isso que faz o atraso bloquear de
  verdade (checar a senha primeiro e só depois atrasar não defende contra
  força bruta, só atrasa a resposta depois que o custo real já foi pago).
  Consequência: um atacante que erra a senha da vítima 1x por minuto nega o
  login dela indefinidamente. A saída da vítima existe desde a PR #116: ao
  redefinir a senha, `reset_password` chama `record_success` e zera o
  contador da conta, então a vítima recupera o acesso mesmo sob ataque.
- **O teto global de login continua chaveado no IP do proxy**, o mesmo balde
  pra todo mundo atrás do Railway. Ficou 20x mais caro que antes
  (10/min → 200/min), não foi eliminado: ~3,3 req/s sustentados ainda negam
  login pra base inteira. A defesa de verdade é o atraso por conta; o teto
  global é só o freio de flood que sobrou de antes. **O teto por IP do
  `/auth/logout` tem exatamente a mesma limitação**: é o balde do proxy, então
  ele freia flood mas também pode negar logout pra base inteira. Aceito pelo
  mesmo motivo — o que protege o logout é a chave por token, não o teto.

**Outras dívidas assumidas** (decisões, não pendências esquecidas):
- `POST /auth/register` responde "Email já cadastrado" (enumeração por essa
  via é possível). Mensagem genérica destruiria a usabilidade; o login já tem
  tempo constante, que era o vetor medível. Desde 2026-08-16 essa enumeração
  também esbarra na curva de atraso por conta (teto global subiu de 5/min
  para 60/min, mas cada tentativa repetida no mesmo email entra na fila).
- Exclusão de conta apaga o Mongo antes do Postgres, sem transação distribuída.
  Falha no commit do SQL deixaria a conta viva sem os dados de IA. Desde a
  issue #47 são **três** sistemas: o Stripe vem primeiro e recusa dele **aborta
  a exclusão inteira** (502, nada apagado). A ordem vem da assimetria das
  falhas — exclusão que falhou é recuperável, cartão cobrado por conta que não
  existe mais vira chargeback sem botão de cancelar. A janela entre Mongo e
  Postgres continua aberta e continua aceita.
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
- `CORS_ORIGINS` deve ter a origem do frontend **sem barra final** (o `Origin`
  do navegador nunca tem barra), separada por vírgula do `localhost`. Hoje vale
  `https://norby.com.br,http://localhost:5173`.
- **IP blocking ligado no Brevo quebra a recuperação de senha em produção, e
  quebra em silêncio.** O Railway Hobby não tem IP de egresso fixo (é recurso do
  plano Pro), então autorizar IPs no Brevo recusa todo envio vindo de produção.
  E como `/auth/forgot-password` responde 202 exista ou não a conta, a falha não
  aparece para quem pediu o link: some no log do servidor. Manter DESLIGADO
  enquanto o egresso não for estático. Teto do plano gratuito: 300 e-mails/dia.
- **`DOCS_ENABLED` não existe em produção, e é assim de propósito.** O default
  do código é `false`, então esquecer a variável mantém `/docs`, `/redoc` e
  `/openapi.json` FECHADOS (issue #29). Criá-la com `true` no Railway publica
  todas as rotas, todos os campos e todos os formatos de erro da API. Em
  desenvolvimento ela vem ligada pelo `.env.example`, que é onde ela serve.
- **Ligar `PAYWALL_ENABLED` sem `VITE_FORNECEDOR_NOME` e `VITE_FORNECEDOR_CPF`
  na Vercel é cobrar com Termos incompletos.** O Decreto 7.962/2013, art. 2º, I
  exige nome e CPF/CNPJ do vendedor no site; sem as variáveis, a seção 2 dos
  Termos mostra só o e-mail. Elas ficam fora do código porque o repositório é
  público e histórico de git não se apaga, mas são **embutidas no build**: mudar
  exige REDEPLOY, igual à `VITE_API_URL`.

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
