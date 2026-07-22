FROM python:3.12-slim AS base

# Puxa os patches de segurança mais novos por cima da base (reduz CVEs de SO
# que já têm fix). CVEs "no fix available" do Debian permanecem — dívida aceita.
RUN apt-get update && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Instala uma versão reproduzível do uv. Evita que a tag latest altere o build
# sem mudança no repositório.
COPY --from=ghcr.io/astral-sh/uv:0.11.30 /uv /uvx /bin/

WORKDIR /app

COPY requirements.txt ./

# Atualiza o pip fornecido pela imagem base e instala apenas dependências de
# produção. O target development acrescenta pytest em uma camada separada.
RUN uv pip install --system --no-cache pip==26.1.2 \
    && uv pip install --system --no-cache -r requirements.txt

# Cria o usuário que executará ambos os targets.
RUN useradd --create-home --uid 10001 norby

EXPOSE 8000


FROM base AS development

# Dependências de teste entram apenas na imagem usada pelo docker-compose/CI.
COPY requirements-dev.txt ./

RUN uv pip install --system --no-cache -r requirements-dev.txt

COPY . .

RUN chmod +x start.sh

USER norby

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


FROM base AS production

# A imagem final recebe somente os arquivos necessários em runtime. Testes,
# ambientes virtuais e caches locais não entram nesta camada.
COPY alembic ./alembic
COPY app ./app
COPY alembic.ini start.sh ./

RUN chmod +x start.sh

# Produção executa sem privilégios e não consegue modificar os arquivos do app.
USER norby

# Produção: aplica migrations e sobe o uvicorn na porta do provedor ($PORT).
# Em dev, o docker-compose sobrescreve este CMD com o modo --reload.
CMD ["sh", "start.sh"]
