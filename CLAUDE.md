# CLAUDE.md

> Convenções pessoais de Diogo. Fonte canônica: `01 - Contexto IA/Preferencias-Codigo.md`
> no Second Brain (Google Drive). Atualize lá primeiro, depois sincronize aqui.

## Quem está codando

Desenvolvedor Full Stack júnior, formado em ADS, em transição ativa para o mercado como Júnior. Localização: Salvador, BA.

## Stack preferida (geral)

- **Backend:** Django (Python) — padrão pessoal; neste projeto usa FastAPI
- **Frontend:** React.js
- **Banco relacional:** PostgreSQL
- **Banco NoSQL:** MongoDB
- **Editor:** VS Code

## Ambiente de terminal

- **Máquina local (Windows):** usar comandos nativos do Windows (PowerShell ou cmd).
- **VPS (Linux):** comandos Unix são bem-vindos normalmente.
- Identifique em qual ambiente está rodando antes de sugerir comandos de terminal.

## Princípios de trabalho

- Código limpo e arquitetura eficiente.
- Priorizar soluções práticas e diretas que resolvam o problema imediatamente.
- Se uma tarefa repetitiva pode virar script (Python ou script de shell do ambiente), **criar o script**.
- **Sempre explicar** assuntos complexos e partes do código junto com a implementação — o objetivo é também aprender, não só entregar.
- Automatizar sempre que possível para liberar tempo intelectual.

## Específico deste projeto — Norby (ex-Lumea)

Organizador financeiro pessoal inteligente. Centraliza todos os gastos em um só
lugar, propõe formas de economizar/investir melhor e classifica a saúde
financeira do usuário com um **Score** visual. A IA (Gemini) analisa gastos,
categoriza transações e dá conselhos via chat e resumos.

> **Rebranding em andamento — Lumea → Norby.** O repositório, a pasta raiz e boa
> parte do código ainda usam o nome "Lumea"; a marca nova é **Norby** ("seu
> norte financeiro"). Ao mexer no frontend, prefira o nome/identidade Norby. Não
> renomeie pasta/repo em massa sem combinar antes — a migração é gradual.
> Brief canônico: `01 - Contexto IA/Projetos-Brief/Norby.md` (Second Brain),
> com notas detalhadas em `02 - Projetos/Ativos/Norby.md`.

### Identidade visual — "Petróleo Confiável" (v3)

> A paleta **substitui a versão anterior "Âmbar Noturno"** (âmbar `#F5A623`). A
> identidade definitiva é a v3 teal/petróleo. Onde encontrar referência a âmbar
> no código ou em docs, considerar legado.

A UI é **toda em inglês**. Tema escuro petróleo (dark-first), com pegada
glassmorphism/minimalista premium. Tipografia: **Inter**. Logo: monograma
**N + ponto-norte** (a letra N coroada pela estrela-norte) sobre fundo petróleo.
Tagline: "seu norte financeiro". Tom de voz: orientador, acolhedor, claro e
confiável — guia, não julga; sempre aponta o próximo passo.

Tokens de cor (refletir no `tailwind.config`):

| Token | Hex | Uso |
|---|---|---|
| Night | `#07100F` | Fundo dark |
| Surface | `#0E1B19` | Cards dark |
| Surface 2 | `#152624` | Superfície elevada |
| Teal | `#2DB5A3` | Acento principal |
| Teal Soft | `#6FD4C6` | Acento suave |
| Ivory | `#EFFAF8` | Fundo light |
| Income | `#5FBF7E` | Receitas (verde distinto do teal de propósito) |
| Expense | `#8A8580` | Despesas |
| Danger | `#E06A4A` | Alertas |

### Páginas (escopo — 6)

1. **Welcome / Auth** — login e registro na mesma tela.
2. **Dashboard** — KPI cards (Balance, Income, Expenses, AI Score), gráfico de
   fluxo de caixa, gráfico de categorias, widget de insights da IA e transações
   recentes.
3. **Accounts (Wallets)** — CRUD de contas/cartões.
4. **Transactions** — data table com filtros (busca, mês, categoria).
5. **Norby AI** — chat estilo ChatGPT; o Gemini lê os dados e responde em
   linguagem natural.
6. **Settings** — perfil e logout.

### Estado atual & próximos passos

A lógica core já funciona. Em aberto, em ordem de prioridade (do brief):

1. Aplicar as alterações de frontend do rebranding (Norby + paleta Petróleo Confiável).
2. Listar e corrigir os bugs do frontend.
3. Revisão de **segurança** (auth JWT, CRUD de transações).

Features ainda a implementar: **metas financeiras** (financial goals) e
**despesas recorrentes** (recurring expenses). Faltam testes e o app ainda não
está deployado (alvo: Vercel no front, VPS própria + Docker / Railway no back).

### Stack real

| Camada | Tecnologia |
|---|---|
| Backend | FastAPI 0.115 + Uvicorn (ASGI) |
| ORM / migrations | SQLAlchemy 2.0 async + Alembic |
| Banco relacional | PostgreSQL 16 |
| Banco NoSQL | MongoDB 7.0 (driver: Motor async) |
| IA | Google Generative AI (Gemini 1.5 Flash) |
| Auth | JWT (python-jose) |
| Frontend | React 19 + Vite 8 |
| Estilo | TailwindCSS 3.4 + shadcn/ui |
| Gráficos | Recharts |
| Roteamento | React Router v7 |
| Estado global | Zustand |
| Forms | React Hook Form + Zod |
| Gerenciador de pacotes Python | uv |

### Estrutura de pastas (resumo)

```
Lumea/
├── backend/
│   └── app/
│       ├── main.py          # entry point FastAPI
│       ├── routers/         # auth, wallets, transactions, ai
│       ├── models/          # SQLAlchemy models
│       ├── schemas/         # Pydantic schemas
│       ├── services/        # lógica de negócio
│       └── dependencies/    # injeção de dependências (auth, DB)
├── frontend/
│   ├── src/
│   └── package.json
├── docker-compose.yml
└── .env                     # JWT secret, Gemini API key, credenciais DB
```

### Comandos principais

```powershell
# Subir toda a infra (PostgreSQL, MongoDB, backend) via Docker
docker-compose up

# Backend isolado (desenvolvimento)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Migrations Alembic
alembic upgrade head
alembic revision --autogenerate -m "descricao"

# Frontend
cd frontend
npm run dev      # dev server em http://localhost:5173
npm run build    # build de produção
npm run lint     # ESLint
```

### Portas

| Serviço | Porta |
|---|---|
| FastAPI backend | 8000 |
| React (Vite) frontend | 5173 |
| PostgreSQL | 5432 |
| MongoDB | 27017 |

### Modelo de dados (polyglot persistence)

Postgres guarda só dados relacionais/numéricos (cálculos rápidos, ACID); Mongo
guarda os blocos de texto pesado da IA. Assim o Postgres fica "leve" e os somatórios
financeiros não pesam.

**PostgreSQL (SQLAlchemy):**
- `users` (id, name, email, password_hash, created_at)
- `wallets` (id, user_id, name, balance, created_at)
- `transactions` (id, user_id, wallet_id, type [INCOME/EXPENSE], amount, category, description, date, created_at)

**MongoDB (Motor):**
- `ai_insights` (user_id, reference_month, score, summary_text, suggested_action, generated_at) — **cache** do Dashboard p/ não chamar a IA toda hora.
- `chat_history` (user_id, session_id, messages[role, content, timestamp], updated_at)

### Testes

Nenhum setup de testes configurado ainda. Ao criar testes, usar **pytest** + **pytest-asyncio** no backend e **Vitest** no frontend.

### Variáveis de ambiente (`.env`)

Necessárias para rodar o projeto: `DATABASE_URL`, `MONGO_URI`, credenciais do PostgreSQL/MongoDB, `SECRET_KEY` (JWT), `GOOGLE_API_KEY` (Gemini).
