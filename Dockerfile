# ── Stage 1: Frontend build ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Stage 2: Telegram Mini App build ─────────────────────────────────────────
FROM node:20-alpine AS tg-builder

WORKDIR /tg
COPY tg-app/package*.json ./
RUN npm install
COPY tg-app/ .
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 3: Python backend ───────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq-dev \
    postgresql-client \
    gcc \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Copy frontend + tg-app builds
COPY --from=frontend-builder /frontend/dist ./landing
COPY --from=tg-builder       /tg/dist       ./tg-static

RUN sed -i 's/\r//' start.sh && chmod +x start.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

CMD ["sh", "start.sh"]
