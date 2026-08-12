# Monvo — Deployment Guide

VPS deploy va kelajakda o'zgartirish kiritish bo'yicha to'liq qo'llanma.

---

## Production muhit

| Komponent | Qiymat |
|-----------|--------|
| VPS | `169.58.50.8` (Ubuntu) |
| **Hardware** | **8 vCPU, 24 GB RAM, 200 GB NVMe, 600 Mbit/s** |
| Domen | `monvo.uz`, `www.monvo.uz`, `app.monvo.uz` |
| DNS | Cloudflare (DNS only — kulrang bulut) |
| Kod papka | `/opt/monvo/` |
| Compose papka | `/opt/monvo/backend/` |
| SSL | Let's Encrypt, avtomatik renew (certbot cron) |
| Tarmoq | Docker `monvo_net` |

### Resurs taqsimoti (24 GB RAM dan)

| Servis | RAM | CPU | Izoh |
|--------|-----|-----|------|
| postgres | 6–10 GB | 1–4 | `shared_buffers=6GB`, `effective_cache_size=16GB` |
| app | 1–4 GB | 1–4 | 6 worker (uvicorn) |
| redis | 2 GB | 0–1 | LRU eviction |
| nginx | 256 MB | 0–1 | 8 worker_processes |
| pgbouncer | 256 MB | 0–0.5 | hozir chetda |
| **OS reserve** | **~9 GB** | — | Boshqa jarayonlar uchun |

### Servislar ro'yxati

| Servis | Port (ichki) | Maqsad |
|--------|------|--------|
| `monvo_nginx` | 80, 443 | HTTPS, gzip, rate limit |
| `backend-app-1` | 8000 | FastAPI, 6 worker |
| `monvo_postgres` | 5432 | DB, performance tuned |
| `monvo_redis` | 6379 | Cache + rate limit |
| `monvo_pgbouncer` | 5432 | Connection pooler (hozir chetda) |

### Ishlayotgan servislar (6 ta)

| Servis | Port | Maqsad |
|--------|------|--------|
| `monvo_nginx` | 80, 443 | HTTPS, gzip, rate limit |
| `backend-app-1` | 8000 (ichki) | FastAPI, 2 worker |
| `monvo_postgres` | 5432 (ichki) | DB |
| `monvo_redis` | 6379 (ichki) | Cache + rate limit |
| `monvo_pgbouncer` | 5432 (ichki) | Connection pooler (hozir chetda) |

### Volumes (persistent ma'lumot)

- `backend_postgres_data` — DB
- `backend_redis_data` — Redis snapshot
- `backend_nginx_logs` — nginx loglar
- `backend_app_tmp` — voice fayllar (vaqtinchalik)

---

## Tezkor komandalar

VPS da SSH bilan ulan:
```bash
ssh root@169.58.50.8
cd /opt/monvo/backend
```

### Holat

```bash
docker compose ps                    # servislar ro'yxati
docker compose logs -f app           # app real-time log
docker compose logs nginx --tail 50  # nginx oxirgi 50 qator
docker stats                         # CPU/RAM
```

### Restart

```bash
# Bitta servisni
docker compose restart app
docker compose restart nginx

# Hammasini
docker compose restart
```

### To'liq qaytadan tushirish

```bash
docker compose down
docker compose up -d
```

### Backend qaytadan build qilish (kod yangilanganda)

```bash
docker compose build app
docker compose up -d --no-deps app
docker image prune -f
```

---

## Kodni yangilash (yangi push qilganda)

### Variant 1 — Qo'lda

VPS da:
```bash
cd /opt/monvo
git pull origin main
cd backend
docker compose build app
docker compose up -d --no-deps app
```

### Variant 2 — Avtomatik (GitHub Actions)

Lokal kompyuterdan `git push` qilganda VPS avtomatik yangilanadi.

Sozlanishi:
1. VPS da `/opt/deploy.sh` skript bor
2. GitHub repo → Settings → Secrets:
   - `VPS_HOST=169.58.50.8`
   - `VPS_USER=root`
   - `VPS_PORT=22`
   - `VPS_SSH_KEY` (private key)
3. `.github/workflows/deploy.yml` — push da ishga tushadi

---

## `.env` o'zgaruvchilarni yangilash

```bash
nano /opt/monvo/backend/.env
# o'zgartir, saqla
docker compose restart app
```

---

## SSL sertifikat

### Avtomatik yangilanish

Certbot cron orqali har 60 kunda yangilaydi. Nginx ga ham yangi sertifikat berish uchun hook:

```bash
# /etc/letsencrypt/renewal-hooks/deploy/monvo-nginx.sh
#!/bin/bash
cp /etc/letsencrypt/live/monvo.uz/fullchain.pem /opt/monvo/backend/deploy/nginx/ssl/monvo.uz/
cp /etc/letsencrypt/live/monvo.uz/privkey.pem   /opt/monvo/backend/deploy/nginx/ssl/monvo.uz/
docker exec monvo_nginx nginx -s reload 2>/dev/null || true
```

### Qo'lda yangilash

```bash
certbot renew
cp /etc/letsencrypt/live/monvo.uz/fullchain.pem /opt/monvo/backend/deploy/nginx/ssl/monvo.uz/
cp /etc/letsencrypt/live/monvo.uz/privkey.pem   /opt/monvo/backend/deploy/nginx/ssl/monvo.uz/
docker compose exec nginx nginx -s reload
```

---

## Backup va tiklash

### Backup yaratish (kunlik cron — ko'rsatma o'rnatilgan)

```bash
docker compose exec -T postgres pg_dump -U postgres monvo | \
    gzip > /opt/backups/monvo_$(date +%F).sql.gz
```

### Backup dan tiklash

```bash
gunzip < /opt/backups/monvo_2026-05-24.sql.gz | \
    docker compose exec -T postgres psql -U postgres monvo
```

---

## Birinchi sozlashda nima qilingan

Bu bo'lim — yangi serverga qaytadan o'tkazish yoki muammoni qaytadan ko'rib chiqish uchun.

### 1. VPS asosiy sozlash

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
ufw allow 22,80,443/tcp && ufw --force enable
apt install -y certbot git
```

### 2. GitHub deploy key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
# Yuqoridagi public key → GitHub repo → Settings → Deploy keys → Add (read-only)

cat > ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 ~/.ssh/config

mkdir -p /opt && cd /opt
git clone git@github.com:XayitovB/monvo.git
cd monvo/backend
```

### 3. `.env` to'ldirish

```bash
cp .env.example .env

# Random parollar yaratish:
openssl rand -hex 24   # POSTGRES_PASSWORD, REDIS_PASSWORD uchun
openssl rand -hex 32   # SECRET_KEY, ADMIN_SECRET_KEY uchun

nano .env              # qiymatlarni yopishtir
chmod 600 .env
```

**DIQQAT:** `DATABASE_URL` da `pgbouncer` o'rniga `postgres` ishlat:
```
DATABASE_URL=postgresql+asyncpg://postgres:PAROL@postgres:5432/monvo
```

**DIQQAT:** `GOOGLE_CLIENT_ID` ni `placeholder.apps.googleusercontent.com` qil — eski `584058790525-...` kompromis, validatsiya rad qiladi.

### 4. Firebase JSON ko'chirish

Lokal kompyuterdan (PowerShell):
```powershell
scp "monvo-f067e-firebase-adminsdk-*.json" root@169.58.50.8:/opt/monvo/backend/firebase-adminsdk.json
```

VPS da:
```bash
chmod 600 /opt/monvo/backend/firebase-adminsdk.json
```

### 5. SSL sertifikat olish

DNS to'g'ri tarqalganini tekshir:
```bash
dig +short monvo.uz
# 169.58.50.8 chiqishi kerak
```

Sertifikat ol:
```bash
certbot certonly --standalone \
    -d monvo.uz -d www.monvo.uz \
    --email xayitovb@gmail.com \
    --agree-tos --no-eff-email

mkdir -p /opt/monvo/backend/deploy/nginx/ssl/monvo.uz
cp /etc/letsencrypt/live/monvo.uz/fullchain.pem /opt/monvo/backend/deploy/nginx/ssl/monvo.uz/
cp /etc/letsencrypt/live/monvo.uz/privkey.pem   /opt/monvo/backend/deploy/nginx/ssl/monvo.uz/
```

### 6. Docker build va ishga tushirish

```bash
cd /opt/monvo/backend
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f app
```

`Application startup complete.` ko'rinsa — ishladi.

### 7. Sina

```bash
curl https://monvo.uz/health
```

`{"status":"ok","db":"ok","redis":"ok"}` qaytarishi kerak.

---

## Birinchi sozlashda yuzaga kelgan muammolar va yechimlari

### Muammo 1 — `edoburu/pgbouncer:1.22.1` image yo'q

Docker Hub dan o'chirilgan. **Yechim:** `edoburu/pgbouncer:latest` ga o'tkazildi.

### Muammo 2 — `glitchtip/glitchtip:v4` image yo'q

Tag o'zgargan. **Yechim:** GlitchTip butunlay o'chirildi (kerak emas).

### Muammo 3 — `GOOGLE_CLIENT_ID must be set via env`

`config.py` ichidagi validatsiya eski hardcoded client ID ni rad qiladi.
**Yechim:** `.env` da `GOOGLE_CLIENT_ID=placeholder.apps.googleusercontent.com` qo'yildi.
**Keyin:** Firebase Console dan yangi OAuth client ID olib qo'yiladi.

### Muammo 4 — Pgbouncer `wrong password type`

Yangi pgbouncer SCRAM-SHA-256, eski auth bilan mos kelmaydi.
**Yechim:** App `pgbouncer` o'rniga to'g'ridan-to'g'ri `postgres:5432` ga ulanadi.
**Keyin:** `AUTH_TYPE: scram-sha-256` env qo'shildi, lekin hozir ishlatilmayapti.

### Muammo 5 — Nginx `upstream directive not allowed`

Eski `nginx.conf` `events {}` va `http {}` o'rab olmagan edi.
**Yechim:** To'liq `nginx.conf` qaytadan yozildi.

### Muammo 6 — Nginx `proxy_params.conf not found`

`nginx.conf` da `include /etc/nginx/proxy_params.conf` bor edi, lekin fayl mount qilinmagan.
**Yechim:** `proxy_params.conf` ichidagi sozlamalar `nginx.conf` ga inline qilindi.

---

## O'chirilgan komponentlar

Hozir ishlatilmaydi (kelajakda qaytarish mumkin):

- **Prometheus** — metrika yig'uvchi
- **Grafana** — monitoring dashboard
- **GlitchTip + worker** — xato monitoring (Sentry alternativa)
- **postgres_replica** — DB read replica

Sabab: kichik VPS uchun keraksiz resurs sarflash. Foydalanuvchi soni oshganda qaytarish kerak.

---

## Bo'sh qiymatlar (keyin to'ldirish)

`.env` da quyidagilar bo'sh — paydo bo'lganda to'ldir va `docker compose restart app`:

| O'zgaruvchi | Qaerdan |
|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `GOOGLE_CLIENT_ID` | Firebase Console / Google Cloud Console |
| `SMTP_HOST/USER/PASSWORD` | Gmail App Password yoki Yandex |
| `ESKIZ_EMAIL/PASSWORD` | eskiz.uz (SMS) |
| `PAYME_MERCHANT_ID/KEY` | merchant.paycom.uz |
| `SENTRY_DSN` | sentry.io (xato monitoring) |
| `ADMIN_ALERT_EMAIL` | yangi qurilmadan login alert |

---

## Foydali troubleshooting

### App ishlamayapti

```bash
docker compose logs app --tail 100
docker compose restart app
```

Tipik xatolar:
- **Migration xato** — `docker compose exec app alembic current` va `alembic history`
- **DB ulanmayapti** — `docker compose logs postgres` va `.env` parolni tekshir
- **Firebase xato** — `firebase-adminsdk.json` mavjudligini va permissionni tekshir

### Nginx ishlamayapti

```bash
docker compose logs nginx --tail 50
docker run --rm -v /opt/monvo/backend/deploy/nginx/nginx.conf:/etc/nginx/nginx.conf:ro nginx:1.25-alpine nginx -t
```

SSL fayl yo'qmi tekshir:
```bash
ls /opt/monvo/backend/deploy/nginx/ssl/monvo.uz/
```

### DB ga to'g'ridan-to'g'ri kirish

```bash
docker compose exec postgres psql -U postgres monvo
```

### Foydalanuvchi soni

```bash
docker compose exec postgres psql -U postgres monvo -c "SELECT COUNT(*) FROM users;"
```

### Disk joy

```bash
df -h
docker system df
docker system prune -af  # foydalanilmagan image/cache o'chirish
```

---

## Maxfiy ma'lumotlar

**Asla GitHub ga push qilma:**
- `.env` (gitignored)
- `firebase-adminsdk.json` (gitignored)
- `deploy/nginx/ssl/` (gitignored)
- SSH private kalitlar

Bitwarden yoki shu kabi parol manager da saqla.

---

## Performance tuning (8 vCPU / 24 GB RAM uchun)

Hozirgi `docker-compose.yml` shu hardware uchun moslashtirilgan.

### Postgres tuning sozlamalari

`docker-compose.yml` da `postgres` servis `command:` orqali:

```
shared_buffers=6GB              # RAM ning 25% — eng katta cache
effective_cache_size=16GB       # RAM ning 66% — OS cache hisobida
maintenance_work_mem=1GB        # VACUUM, CREATE INDEX uchun
work_mem=32MB                   # Sort/Hash uchun (har connection)
max_connections=200             # Pgbouncer kelajakda yetadi
random_page_cost=1.1            # NVMe — random va sequential teng tez
effective_io_concurrency=200    # NVMe parallelism
max_parallel_workers=8          # Parallel queries 8 CPU dan
```

Tekshirish:
```bash
docker compose exec postgres psql -U postgres -c "SHOW shared_buffers;"
docker compose exec postgres psql -U postgres -c "SHOW effective_cache_size;"
```

### App workers (uvicorn)

`docker-compose.yml` da `WORKERS=6` env qo'yilgan. `start.sh` ishlatadi.

Qaytadan tushir:
```bash
docker compose up -d --no-deps app
```

Tekshirish:
```bash
docker compose exec app ps aux | grep uvicorn
# 6 ta worker + 1 ta master = 7 jarayon
```

### Nginx workers

`worker_processes auto;` — 8 CPU = 8 worker avtomatik. Maksimum 65k concurrent ulanish.

### Yuk testi (load test)

```bash
# Apache Bench
ab -n 10000 -c 100 https://monvo.uz/health

# wrk (yaxshiroq)
docker run --rm williamyeh/wrk -t8 -c200 -d30s https://monvo.uz/health
```

### Monitoring kerakmi?

Hozirgi 24 GB RAM dan 9 GB bo'sh — Prometheus + Grafana qo'shsangiz ham yetadi. Lekin **boshlanishida** kerak emas — `docker stats` yetadi.

Keyin foydalanuvchi 1000+ bo'lganda monitoring qaytaring (`docker-compose.yml` ga `prometheus:` va `grafana:` bloklarini qaytadan qo'shing).

---

## Versiya tarixi

| Sana | O'zgarish |
|------|-----------|
| 2026-05-24 | Birinchi production deploy. VPS: 84.247.182.138. 8 vCPU / 24 GB RAM uchun moslashtirilgan. |
| 2026-08-12 | VPS yangi manzilga ko'chirildi: `169.58.50.8`. Server `/opt/` ostida boshqa loyihalar bilan bo'lishiladi (kardly, turboads, websocket-games va h.k.) — faqat `/opt/monvo/` ichida ishlash kerak. |
