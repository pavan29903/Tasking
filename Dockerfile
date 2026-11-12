# One container: builds the web app, then serves it and the API with uvicorn on port 8000.
# Set DATABASE_URL, SECRET_KEY, APP_ENV=production and APP_URL on your hosting platform.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
ENV APP_ENV=production PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uv run --no-dev uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT}"]
