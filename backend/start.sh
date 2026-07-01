#!/bin/sh
# Comando de start em produção (usado pelo Dockerfile).
# 1) Aplica as migrations pendentes; se falhar, o boot para aqui (set -e).
# 2) Sobe o uvicorn na porta injetada pelo provedor ($PORT); fallback 8000 p/ local.
# `exec` faz o uvicorn virar PID 1 e receber os sinais (SIGTERM) do container.
set -e

alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
