#!/bin/bash
###############################################################################
#  Monvo — Production Deploy Script
#  Ishlatish: bash deploy/deploy.sh
###############################################################################
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[X]${NC} $1"; exit 1; }

echo ""
echo "================================================="
echo "   MONVO — Production Deploy"
echo "================================================="
echo ""

cd "$(dirname "$0")/.."  # backend/ papkasiga o'tish

# ── 1. Talablar tekshirish ──────────────────────────────────────────────────
log "Talablar tekshirilmoqda..."
command -v docker >/dev/null || err "Docker o'rnatilmagan: https://docs.docker.com/get-docker/"
[ -f ".env" ] || err ".env fayl topilmadi! .env.example dan nusxa oling"
[ -f "firebase-adminsdk.json" ] || warn "firebase-adminsdk.json yo'q — Firebase FCM ishlamaydi"
[ -f "deploy/nginx/ssl/monvo.uz/fullchain.pem" ] || err "SSL sertifikat yo'q! certbot ishlatib oling"

# ── 2. .env tekshirish ─────────────────────────────────────────────────────
warn "Muhim .env o'zgaruvchilar tekshirilmoqda..."
source .env 2>/dev/null || true

[ -z "$DATABASE_URL" ] && err "DATABASE_URL .env da yo'q!"
[ -z "$SECRET_KEY" ]   && err "SECRET_KEY .env da yo'q!"
[ -z "$POSTGRES_PASSWORD" ] && err "POSTGRES_PASSWORD .env da yo'q!"

# ── 3. Docker image yaratish ───────────────────────────────────────────────
log "Docker image yaratilmoqda..."
docker compose build app
log "Docker image tayyor"

# ── 4. Eski konteynerlarni to'xtatish ─────────────────────────────────────
log "Eski konteynerlar to'xtatilmoqda..."
docker compose down --remove-orphans 2>/dev/null || true

# ── 5. Barcha xizmatlar ishga tushirish ────────────────────────────────────
log "Barcha xizmatlar ishga tushirilmoqda..."
docker compose up -d

# ── 6. Holat tekshirish ───────────────────────────────────────────────────
log "20 soniya kutilmoqda (konteynerlar ishga tushishi uchun)..."
sleep 20

echo ""
echo "================================================="
log "Deploy yakunlandi!"
echo ""
echo "  API:      http://$(hostname -I | awk '{print $1}')"
echo ""
echo "  Konteynerlar holati:"
docker compose ps
echo "================================================="

# ── 7. Health check ───────────────────────────────────────────────────────
echo ""
log "API Health check..."
curl -sf http://localhost/health | python3 -m json.tool 2>/dev/null \
    || warn "Health check muvaffaqiyatsiz — docker compose logs app"
