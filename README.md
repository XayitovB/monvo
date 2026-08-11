# Monvo

B2B/B2C loyalty platform — QR loyalty cards, reward catalogs, and a mobile finance AI assistant.

## Structure

```
monvo/
├── backend/          FastAPI API (Python) — auth, merchants, cards, transactions
├── frontend/         React SPA — landing page + admin panel (Vite build)
├── mobile/           Flutter mobile app (package: monvo)
├── bot/              Telegram bot (python-telegram-bot)
├── assets/           Brand assets (logo, etc.)
├── Dockerfile        Main service: builds frontend + backend together
└── railway.toml      Railway config for main service
```

## Services on Railway

| Service | Source | Serves |
|---|---|---|
| **main** (API + Web) | root `Dockerfile` | `monvo.uz` — API at `/*`, landing at `/`, admin SPA at `/panel/*` |
| **bot** | `bot/Dockerfile` | Telegram bot (long-polling) |
| **frontend (legacy)** | `frontend/Dockerfile` | Standalone nginx serving just static files (optional) |

## Local development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8181
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Mobile:**
```bash
cd mobile
flutter run
```

**Bot:**
```bash
cd bot
pip install -r requirements.txt
python bot.py
```

## Deployment

```bash
git push origin main
```

Railway auto-deploys from the `main` branch for each configured service.
