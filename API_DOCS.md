# Monvo Merchant API

Public REST API biznes egalari uchun — sayt, mobil ilova, Telegram bot va boshqa
tashqi tizimlarni Monvo loyalty platformasi bilan integratsiya qilish uchun.

- **Base URL:** `https://monvo.uz/api/v1`
- **Format:** JSON (request va response)
- **Auth:** `Authorization: Bearer kar_live_...`
- **Versiya:** v1
- **Rate limit:** 60 so'rov / daqiqa (har token uchun)

---

## 🔑 1. Token olish

1. **Monvo Business** ilovasiga yoki [https://monvo.uz/merchant/login](https://monvo.uz/merchant/login) saytiga email + parol bilan kiring
2. Sidebar'dan **API tokenlar** → **Yangi token**
3. Tokenni nomlang (masalan, "Production server")
4. **Yaratish** bossangiz, token to'liq qiymati **bir martagina** ko'rinadi
5. Tokenni xavfsiz joyda saqlang (ENV variable, secret manager)

```
kar_live_aBcD1234EfGh5678IjKlMnOpQrStUvWxYz...
```

⚠️ Yo'qolsa qayta ko'rsatilmaydi — yangi token yarating va eskini o'chiring.

---

## 📡 2. Endpointlar

### `GET /me`
Token tasdiqlash + merchant info.

```bash
curl https://monvo.uz/api/v1/me \
     -H "Authorization: Bearer kar_live_..."
```

**Response:**
```json
{
  "id": 12,
  "business_name": "Coffee Lab",
  "email": "owner@cafelab.uz",
  "phone": "+998901234567",
  "is_active": true
}
```

---

### `GET /cards/lookup?phone=+998...`
Telefon orqali kartani topish.

```bash
curl "https://monvo.uz/api/v1/cards/lookup?phone=%2B998901234567" \
     -H "Authorization: Bearer kar_live_..."
```

**Response:**
```json
{
  "card_uid": "abc123def456",
  "merchant_id": 12,
  "holder_name": "Aziz Karimov",
  "holder_phone": "+998901234567",
  "points": 1450,
  "tier": "silver",
  "branch_id": 3,
  "tags": ["VIP"],
  "is_active": true,
  "issued_at": "2026-01-15T10:30:00+00:00",
  "last_used_at": "2026-05-05T18:42:00+00:00"
}
```

`404` — karta topilmadi.

---

### `GET /cards/{card_uid}`
Karta ma'lumotlari (formati `lookup` bilan bir xil).

---

### `POST /cards`
Yangi mijoz/karta yaratish.

```bash
curl -X POST https://monvo.uz/api/v1/cards \
     -H "Authorization: Bearer kar_live_..." \
     -H "Content-Type: application/json" \
     -d '{
       "phone": "+998901234567",
       "name": "Aziz Karimov",
       "branch_id": 3,
       "tags": ["VIP"]
     }'
```

**Response:** `201 Created` — yaratilgan karta ob'ekti.

> 💡 **Idempotent:** agar shu telefon bilan karta mavjud bo'lsa, mavjud kartani qaytaradi.

---

### `POST /transactions/earn`
Chek qabul qilish va ball berish (eng asosiy endpoint).

```bash
curl -X POST https://monvo.uz/api/v1/transactions/earn \
     -H "Authorization: Bearer kar_live_..." \
     -H "Content-Type: application/json" \
     -d '{
       "amount": 125000,
       "phone": "+998901234567",
       "external_ref": "POS-2026-001234",
       "branch_id": 3,
       "note": "Latte + Croissant"
     }'
```

**Response:**
```json
{
  "duplicate": false,
  "transaction": {
    "id": 9876,
    "tx_type": "earn",
    "points_delta": 125,
    "amount": 125000,
    "external_ref": "POS-2026-001234",
    "provider": "api"
  },
  "card": {
    "card_uid": "abc123def456",
    "points": 1575,
    "holder_phone": "+998901234567"
  }
}
```

> 💡 **Idempotent:** bir xil `external_ref` bilan qayta yuborilsa, mavjud tranzaksiyani qaytaradi (qayta ball bermaydi). Network retry xavfsiz.
>
> 💡 **Lazy enrollment:** telefon mavjud bo'lib, karta yo'q bo'lsa — avtomatik karta yaratiladi.
>
> 💡 `card_uid` yoki `phone` dan kamida bittasi bo'lishi shart.

---

### `POST /transactions/redeem`
Mijozdan mukofot olish uchun ball yechish (`reward_id` asosida).

```bash
curl -X POST https://monvo.uz/api/v1/transactions/redeem \
     -H "Authorization: Bearer kar_live_..." \
     -H "Content-Type: application/json" \
     -d '{
       "reward_id": 5,
       "phone": "+998901234567",
       "external_ref": "REDEEM-2026-001",
       "branch_id": 3
     }'
```

**Response:**
```json
{
  "duplicate": false,
  "transaction": { "id": 9877, "tx_type": "redeem", "points_delta": -200, ... },
  "card": { "card_uid": "...", "points": 1250, ... },
  "reward": { "id": 5, "title": "Bepul kapuchino", "points_cost": 200 }
}
```

> 💡 **Idempotent:** bir xil `external_ref` qayta yuborilsa dublikat qaytariladi.
> `card_uid` yoki `phone` dan biri shart.

---

### `POST /transactions/spend`
Erkin miqdorda ball yechish — POS checkout uchun (1 ball = 1 so'm chegirma).

```bash
curl -X POST https://monvo.uz/api/v1/transactions/spend \
     -H "Authorization: Bearer kar_live_..." \
     -H "Content-Type: application/json" \
     -d '{
       "points": 500,
       "phone": "+998901234567",
       "external_ref": "POS-CHECKOUT-2026-001"
     }'
```

**Response:**
```json
{
  "duplicate": false,
  "spent_points": 500,
  "transaction": { "id": 9878, "tx_type": "redeem", "points_delta": -500, ... },
  "card": { "card_uid": "...", "points": 750, ... }
}
```

> 💡 Balans yetmasa `400` qaytariladi — POS to'lovni rad etishi kerak.

---

### `POST /transactions/billz-redeem`
Monvo balansini Billz gift sertifikatiga aylantirish (faqat Billz integratsiyasi ulangan merchantlar uchun).

```bash
curl -X POST https://monvo.uz/api/v1/transactions/billz-redeem \
     -H "Authorization: Bearer kar_live_..." \
     -H "Content-Type: application/json" \
     -d '{
       "points": 1000,
       "phone": "+998901234567",
       "external_ref": "BILLZ-CERT-2026-001",
       "expire_date": "31.12.2026"
     }'
```

**Response:**
```json
{
  "duplicate": false,
  "certificate_code": "A1B2C3D4E5F6",
  "amount": 1000,
  "expire_date": "31.12.2026",
  "transaction": { ... },
  "card": { "points": 1450, ... }
}
```

> 💡 `certificate_code` — Billz terminalida to'lov sifatida ishlatiladi.
> `expire_date` bo'sh qoldirilsa, default 365 kun.

---

### `GET /transactions`
Tranzaksiyalar tarixi (pagination).

```bash
curl "https://monvo.uz/api/v1/transactions?limit=50&offset=0" \
     -H "Authorization: Bearer kar_live_..."
```

Filterlar:
- `?card_uid=abc123` — bitta karta bo'yicha
- `?date_from=2026-01-01` — shu sanadan boshlab (ISO 8601)
- `?date_to=2026-03-31` — shu sanagacha (ISO 8601)

**Response:**
```json
{
  "items": [...],
  "total": 1842,
  "limit": 50,
  "offset": 0
}
```

---

### `GET /branches`
Filiallar ro'yxati.

```json
[
  {
    "id": 1,
    "name": "Markaziy filial",
    "address": "Toshkent, Amir Temur 12",
    "phone": "+998711234567",
    "is_active": true
  }
]
```

---

### `GET /rewards`
Mukofotlar katalogi (faqat aktivlari).

```json
[
  {
    "id": 1,
    "title": "Bepul kapuchino",
    "description": "200 ball uchun",
    "points_cost": 200,
    "min_tier": "bronze",
    "is_active": true
  }
]
```

---

## ⚠️ 3. Xatolar

| Status | Sabab |
|--------|-------|
| `400` | Body validatsiyasidan o'tmadi (yetishmagan maydon, noto'g'ri format) |
| `401` | Token noto'g'ri yoki o'chirilgan |
| `403` | Akkaunt bloklangan |
| `404` | Mavjud emas (karta, filial, mukofot) |
| `429` | Rate limit oshirildi (60 so'rov/daqiqa) |
| `500` | Ichki server xatoligi (kamdan-kam, retry qiling) |

Xato javob formati:
```json
{ "detail": "Email yoki parol noto'g'ri" }
```

---

## 🤖 4. Telegram bot misoli (Node.js)

Mijoz boti orqali chek summasi va telefon yuborganda ball berish:

```javascript
import fetch from 'node-fetch';

const MONVO = 'https://monvo.uz/api/v1';
const TOKEN = process.env.MONVO_API_TOKEN;  // kar_live_...

async function earnPoints(phone, amount, receiptId) {
  const r = await fetch(`${MONVO}/transactions/earn`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone,
      amount,
      external_ref: receiptId,
      note: 'Telegram bot order',
    }),
  });
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

const result = await earnPoints('+998901234567', 125000, 'tg-' + Date.now());
console.log(`+${result.transaction.points_delta} ball, balans: ${result.card.points}`);
```

---

## 🐍 5. Python misoli

```python
import os
import httpx

MONVO = "https://monvo.uz/api/v1"
TOKEN = os.environ["MONVO_API_TOKEN"]

async def earn_points(phone: str, amount: float, receipt_id: str) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{MONVO}/transactions/earn",
            headers={"Authorization": f"Bearer {TOKEN}"},
            json={"phone": phone, "amount": amount, "external_ref": receipt_id},
            timeout=10.0,
        )
        r.raise_for_status()
        return r.json()
```

---

## 💡 6. Best practices

1. **Tokenni serveringizda saqlang** — hech qachon mijoz brauzeri yoki mobil ilovasiga yubormang.
2. **Git'ga commit qilmang.** Environment variable yoki secret manager (AWS Secrets, Doppler, ...) ishlating.
3. **Har bir muhit uchun alohida token** — production, staging, lokal.
4. **`external_ref`** ni o'z POS/CRM tomondan unique qiling. Network retry yoki webhook qayta yuborish xavfsiz bo'lsin.
5. **Token o'g'irlangan bo'lsa** darhol panel'da o'chiring va yangisini yarating. Eski tokenlar bilan API'ga kirish ishlamaydi.
6. **Production'ga chiqishdan oldin** yangi token bilan `/me` ni sinab ko'ring.
7. **Rate limit** — 60 so'rov/daqiqa. Yuqori yuklamali integratsiya kerak bo'lsa, yozing: support@monvo.uz

---

## 🔐 7. Xavfsizlik

- Tokenlar SHA-256 hash bilan saqlanadi (DB'da plaintext yo'q).
- `last_used_at` va `last_used_ip` har chaqiruvda yangilanadi — shubhali aktivlikni kuzatish uchun.
- Admin/merchant login uchun brute-force himoya: per-account lockout, audit log, yangi qurilma alerti.
- `https://` faqat — `http://` o'chirilgan.

---

## 📞 Yordam

- **Email:** support@monvo.uz
- **Telegram:** @monvo_support
- **Bug yoki feature so'rov:** [github.com/XayitovB/monvo/issues](https://github.com/XayitovB/monvo/issues)

---

© Monvo OÜ 2026
