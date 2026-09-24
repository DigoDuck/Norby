#!/bin/bash
# SessionStart do Claude Code na web: deixa o container da nuvem pronto para
# rodar pytest, vitest e eslint, espelhando o job de CI (.github/workflows/ci.yml).
#
# Na máquina local não faz nada: lá a infra é o docker-compose (ver AGENTS.md).
# Idempotente: roda a cada início/retomada de sessão, e o container pode vir do
# cache com tudo instalado mas com os serviços parados.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOG_DIR="${TMPDIR:-/tmp}/norby-session"
mkdir -p "$LOG_DIR"

# --- .env de teste -----------------------------------------------------------
# Só cria se não existir: nunca sobrescreve um .env que alguém ajustou. Valores
# iguais aos da CI. Sem DOCS_ENABLED (a CI não define, e o teste de exposição
# de /docs espera o default fechado) e com o STRIPE_WEBHOOK_SECRET de fixture
# (sem ele o webhook responde 503 e a suíte de billing reprova).
if [ ! -f "$ROOT/.env" ]; then
  sed \
    -e 's/^SECRET_KEY=.*/SECRET_KEY=cloud-session-only-secret-key-not-used-in-production/' \
    -e 's/^STRIPE_WEBHOOK_SECRET=.*/STRIPE_WEBHOOK_SECRET=whsec_ci_only_fixture_signing_secret/' \
    -e 's/^GEMINI_API_KEY=.*/GEMINI_API_KEY=ci-only-dummy-key-not-called-in-tests/' \
    -e '/^DOCS_ENABLED=/d' \
    "$ROOT/.env.example" > "$ROOT/.env"
fi

# --- Postgres 16 (instalado no container, sem Docker) ------------------------
if command -v pg_ctlcluster >/dev/null 2>&1; then
  pg_ctlcluster 16 main start 2>/dev/null || true
  for _ in $(seq 20); do
    pg_isready -q && break
    sleep 0.5
  done
  sudo -u postgres psql -qtAc "SELECT 1 FROM pg_roles WHERE rolname='norby_user'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE USER norby_user WITH PASSWORD 'norby_pass' CREATEDB;"
  for db in norby_db norby_test; do
    sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
      || sudo -u postgres psql -qc "CREATE DATABASE $db OWNER norby_user;"
  done
fi

# --- MongoDB 7 via Docker ----------------------------------------------------
# Imagem pelo mirror do Google: o Docker Hub devolve 429 (rate limit) para o
# IP compartilhado da nuvem. Falha aqui não derruba o hook: só os testes que
# usam Mongo ficam indisponíveis, e o resto da sessão segue.
if command -v dockerd >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    nohup dockerd >"$LOG_DIR/dockerd.log" 2>&1 &
    for _ in $(seq 30); do
      docker info >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  if docker info >/dev/null 2>&1; then
    if docker ps -a --format '{{.Names}}' | grep -qx norby_mongo; then
      docker start norby_mongo >/dev/null || echo "aviso: norby_mongo não subiu" >&2
    else
      docker run -d --name norby_mongo -p 27017:27017 \
        -e MONGO_INITDB_ROOT_USERNAME=norby_user \
        -e MONGO_INITDB_ROOT_PASSWORD=norby_pass \
        mirror.gcr.io/library/mongo:7 >/dev/null \
        || echo "aviso: não foi possível criar o norby_mongo" >&2
    fi
  else
    echo "aviso: dockerd não respondeu; testes que usam Mongo vão falhar" >&2
  fi
fi

# --- Backend: venv Python 3.12 (a versão da CI) com o lock de dev ------------
cd "$ROOT/backend"
if [ ! -x .venv/bin/python ] || ! .venv/bin/python -c 'import sys; sys.exit(sys.version_info[:2] != (3, 12))'; then
  rm -rf .venv
  uv venv -q -p python3.12 .venv
fi
uv pip install -q -p .venv -r requirements-dev.lock

# --- Frontend ----------------------------------------------------------------
# `npm install`, não `npm ci`: reaproveita o node_modules do container em cache.
cd "$ROOT/frontend"
npm install --no-audit --no-fund --loglevel=error

# pytest/alembic/uvicorn do venv direto no PATH da sessão.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$ROOT/backend/.venv/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi
