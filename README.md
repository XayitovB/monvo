# Monvo

B2B/B2C loyalty platform — QR loyalty cards, reward catalogs, merchant CRM, and a Telegram Mini App, for businesses in Uzbekistan.

## Tech stack

**Backend** (`backend/`)
- [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12, async) + [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (async ORM) + [Alembic](https://alembic.sqlalchemy.org/) migrations
- PostgreSQL 16, Redis 7 (cache + rate limiting)
- JWT auth ([python-jose](https://github.com/mpdavis/python-jose)) — separate tokens for users, admins, merchants, and staff
- [aiogram](https://docs.aiogram.dev/) — Telegram bot (customer + merchant bots, webhook mode)
- [httpx](https://www.python-httpx.org/) — outbound integrations (Payme, Eskiz SMS, POS providers, GigaChat)
- POS integrations: Billz, iiko, Poster, RKeeper, Alipos, YClients
- Payme payment gateway
- Firebase Admin SDK — push notifications (FCM)
- GigaChat (Sber) — AI chat widget on the landing page
- [slowapi](https://github.com/laurentS/slowapi) — rate limiting, [Sentry](https://sentry.io/) — error tracking, Prometheus metrics
- [Fernet](https://cryptography.io/) — at-rest encryption for POS credentials
- [pytest](https://docs.pytest.org/) + `pytest-asyncio` — test suite

**Frontend** (`frontend/`)
- React 18 + [Vite](https://vitejs.dev/) — 4 bundles from one project: landing page, admin panel, merchant panel, API docs
- Plain JS/JSX (no TypeScript)
- `recharts` (analytics), `leaflet` (branch maps), `qrcode`/`jspdf` (QR posters)

**Telegram Mini App** (`tg-app/`)
- React 18 + Vite, Telegram Web App SDK
- Loyalty cards, rewards, transactions, gamification (mini-games, leaderboards, contests), QR scan/show

**Mobile apps** (separate repos)
- Flutter — customer app and merchant/business app, sharing the same backend API

## Structure

```
monvo/
├── backend/          FastAPI API (Python) — auth, merchants, cards, transactions, bots
├── frontend/          React SPA — landing page, admin panel, merchant panel, API docs (Vite build)
├── tg-app/            Telegram Mini App (React + Vite)
├── assets/            Brand assets (logo, etc.)
└── Dockerfile          Multi-stage build: frontend + tg-app + backend into one image
```

## Local development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in DB/Redis/secrets
uvicorn main:app --reload --port 8181
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Telegram Mini App:**
```bash
cd tg-app
npm install
npm run dev
```

## Deployment

Single Docker image (multi-stage `Dockerfile`) built and run via `docker-compose.shared-server.yml` on a VPS behind nginx. See `DEPLOYMENT.md` for the full VPS setup and update procedure.

```bash
git push origin main
# on the VPS:
cd /opt/monvo && git pull
cd backend && docker compose -p monvo -f docker-compose.shared-server.yml --env-file .env build app
docker compose -p monvo -f docker-compose.shared-server.yml --env-file .env up -d --no-deps app
```
