FROM python:3.12-slim

# Puxa os patches de segurança mais novos por cima da base (reduz CVEs de SO
# que já têm fix). CVEs "no fix available" do Debian permanecem — dívida aceita.
RUN apt-get update && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Instala o uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY requirements.txt .

# Executa o comande dentro do container para instalar as dependências usando o uv
RUN uv pip install --system --no-cache -r requirements.txt

COPY . .

# Garante que o script de start seja executável (o bit +x pode se perder no Windows)
RUN chmod +x start.sh

EXPOSE 8000

# Produção: aplica migrations e sobe o uvicorn na porta do provedor ($PORT).
# Em dev, o docker-compose sobrescreve este CMD com o modo --reload.
CMD ["sh", "start.sh"]