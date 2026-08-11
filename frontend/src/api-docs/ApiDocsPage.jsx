import React, { useEffect, useState } from 'react';

const BASE = 'https://monvo.uz/api/v1';

const CODE_TABS = [
  {
    id: 'nodejs',
    label: 'Node.js',
    color: '#68A063',
    code: `import fetch from 'node-fetch';

const MONVO = '${BASE}';
const TOKEN = process.env.MONVO_API_TOKEN; // kar_live_...

async function earnPoints(phone, amount, receiptId) {
  const r = await fetch(\`\${MONVO}/transactions/earn\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${TOKEN}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone, amount,
      external_ref: receiptId,
      note: 'Order',
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const result = await earnPoints('+998901234567', 125000, 'tg-' + Date.now());
console.log(\`+\${result.transaction.points_delta} ball, balans: \${result.card.points}\`);`,
  },
  {
    id: 'python',
    label: 'Python',
    color: '#3572A5',
    code: `import os, httpx

MONVO = "${BASE}"
TOKEN = os.environ["MONVO_API_TOKEN"]

async def earn_points(phone: str, amount: float, receipt_id: str) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{MONVO}/transactions/earn",
            headers={"Authorization": f"Bearer {TOKEN}"},
            json={
                "phone": phone,
                "amount": amount,
                "external_ref": receipt_id,
            },
            timeout=10.0,
        )
        r.raise_for_status()
        return r.json()`,
  },
  {
    id: 'php',
    label: 'PHP',
    color: '#7A86B8',
    code: `<?php
$ch = curl_init('${BASE}/transactions/earn');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . getenv('MONVO_API_TOKEN'),
    'Content-Type: application/json',
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'phone'        => '+998901234567',
    'amount'       => 125000,
    'external_ref' => 'WEB-' . time(),
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$res = json_decode(curl_exec($ch), true);
curl_close($ch);
echo "Ball: " . $res['transaction']['points_delta'];`,
  },
  {
    id: 'curl',
    label: 'cURL',
    color: '#073551',
    code: `curl -X POST ${BASE}/transactions/earn \\
  -H "Authorization: Bearer $MONVO_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+998901234567",
    "amount": 125000,
    "external_ref": "CLI-001",
    "note": "Test order"
  }'`,
  },
  {
    id: 'csharp',
    label: 'C#',
    color: '#9B4F96',
    code: `using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", Environment.GetEnvironmentVariable("MONVO_API_TOKEN"));

var payload = JsonSerializer.Serialize(new {
    phone        = "+998901234567",
    amount       = 125000,
    external_ref = $"CS-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
    note         = "Order",
});

var response = await client.PostAsync(
    "${BASE}/transactions/earn",
    new StringContent(payload, Encoding.UTF8, "application/json")
);

response.EnsureSuccessStatusCode();

var json = await response.Content.ReadAsStringAsync();
using var doc = JsonDocument.Parse(json);
var delta  = doc.RootElement.GetProperty("transaction").GetProperty("points_delta").GetInt32();
var points = doc.RootElement.GetProperty("card").GetProperty("points").GetInt32();
Console.WriteLine($"+{delta} ball, balans: {points}");`,
  },
  {
    id: 'c',
    label: 'C',
    color: '#A8B9CC',
    code: `#include <stdio.h>
#include <string.h>
#include <curl/curl.h>

int main(void) {
    CURL *curl = curl_easy_init();
    if (!curl) return 1;

    const char *token = getenv("MONVO_API_TOKEN");
    char auth[256];
    snprintf(auth, sizeof(auth), "Authorization: Bearer %s", token);

    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, auth);
    headers = curl_slist_append(headers, "Content-Type: application/json");

    const char *body =
        "{"
        "  \\"phone\\": \\"+998901234567\\","
        "  \\"amount\\": 125000,"
        "  \\"external_ref\\": \\"C-001\\""
        "}";

    curl_easy_setopt(curl, CURLOPT_URL, "${BASE}/transactions/earn");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK)
        fprintf(stderr, "curl error: %s\\n", curl_easy_strerror(res));

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    return 0;
}`,
  },
  {
    id: 'ruby',
    label: 'Ruby',
    color: '#CC342D',
    code: `require 'net/http'
require 'json'
require 'uri'

TOKEN = ENV['MONVO_API_TOKEN']
BASE  = '${BASE}'

def earn_points(phone, amount, receipt_id)
  uri = URI("#{BASE}/transactions/earn")
  req = Net::HTTP::Post.new(uri)
  req['Authorization'] = "Bearer #{TOKEN}"
  req['Content-Type']  = 'application/json'
  req.body = {
    phone:        phone,
    amount:       amount,
    external_ref: receipt_id,
    note:         'Ruby order'
  }.to_json

  res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |h| h.request(req) }
  raise "API error: #{res.body}" unless res.is_a?(Net::HTTPSuccess)
  JSON.parse(res.body)
end

result = earn_points('+998901234567', 125000, "rb-#{Time.now.to_i}")
puts "+#{result['transaction']['points_delta']} ball, balans: #{result['card']['points']}"`,
  },
  {
    id: 'go',
    label: 'Go',
    color: '#00ADD8',
    code: `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
)

const monvo = "${BASE}"

func earnPoints(phone string, amount float64, receiptID string) error {
    body, _ := json.Marshal(map[string]any{
        "phone": phone, "amount": amount,
        "external_ref": receiptID,
    })
    req, _ := http.NewRequest("POST", monvo+"/transactions/earn", bytes.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+os.Getenv("MONVO_API_TOKEN"))
    req.Header.Set("Content-Type", "application/json")
    resp, err := http.DefaultClient.Do(req)
    if err != nil { return err }
    defer resp.Body.Close()
    fmt.Println("Status:", resp.Status)
    return nil
}`,
  },
];

function CodeTabs() {
  const [active, setActive] = useState('nodejs');
  const current = CODE_TABS.find(t => t.id === active);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: 'flex', gap: 2, padding: '4px 4px 0',
        background: '#0d0d14', borderRadius: '10px 10px 0 0',
        overflowX: 'auto',
      }}>
        {CODE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: '7px 16px',
              border: 'none',
              background: active === t.id ? '#1a1a2e' : 'transparent',
              color: active === t.id ? '#fff' : '#888',
              fontFamily: 'monospace',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              borderBottom: active === t.id ? `2px solid ${t.color}` : '2px solid transparent',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <pre style={{ margin: 0, borderRadius: '0 0 10px 10px', borderTop: 'none' }}>
        {current.code}
      </pre>
    </div>
  );
}

const STRINGS = {
  uz: {
    nav_brand_tag: 'API',
    nav_back: '← Asosiy sahifa',
    h1: 'Merchant API',
    lead:
      "Public REST API biznes egalari uchun — sayt, mobil ilova, Telegram bot va " +
      "boshqa tashqi tizimlarni Monvo loyalty platformasi bilan integratsiya qilish uchun.",
    toc_title: 'Mundarija',
    toc: [
      ['#auth', 'Autentifikatsiya'],
      ['#base', 'Base URL va format'],
      ['#endpoints', 'Endpointlar'],
      ['#errors', 'Xatolar'],
      ['#examples', 'Misollar (Node.js, Python, PHP)'],
      ['#security', 'Best practices va xavfsizlik'],
    ],

    h_auth: '1. Autentifikatsiya',
    auth_p1: 'Token olish:',
    auth_step1: (
      <>
        <a href="https://monvo.uz/merchant/login">monvo.uz/merchant/login</a> ga email + parol bilan kiring
      </>
    ),
    auth_step2: (
      <>
        Sidebar → <strong>API tokenlar</strong> → <strong>Yangi token</strong>
      </>
    ),
    auth_step3: (
      <>
        Tavsiya: amal qilish muddatini <strong>90 kun</strong> qilib belgilang
      </>
    ),
    auth_step4: (
      <>
        Token to'liq qiymati <strong>bir martagina</strong> ko'rinadi — xavfsiz joyda saqlang
      </>
    ),
    auth_request: (
      <>
        Har bir so'rov <code>Authorization: Bearer kar_live_…</code> headeri bilan yuboriladi.
      </>
    ),
    auth_security_note: (
      <>
        <strong>Xavfsizlik:</strong> tokenlar SHA-256 hash sifatida saqlanadi
        (oddiy ma'lumot bilan tiklab bo'lmaydi), <code>expires_at</code>{' '}
        o'tib ketsa avtomatik 401 qaytadi, va 10 ta ketma-ket xato urinishdan
        keyin token <strong>15 daqiqa</strong> qulflanadi.
      </>
    ),

    h_base: '2. Base URL',
    base_p: (
      <>
        POST/PATCH so'rovlar JSON formatida yuboriladi:{' '}
        <code>Content-Type: application/json</code>. Rate limit:{' '}
        <strong>60 so'rov / daqiqa har token uchun</strong> (Redis atomic counter,
        60s sliding window). Chegaradan oshib ketsa <code>429 Too Many Requests</code>.
      </>
    ),

    h_endpoints: '3. Endpointlar',

    body_label: 'BODY',
    response_label: 'RESPONSE',

    ep_me_title: 'Token tasdiqlash + merchant info',
    ep_lookup_title: 'Telefon orqali kartani topish',
    ep_lookup_note: '404 — bu telefon raqami bilan karta topilmadi.',
    ep_card_create_title: 'Yangi mijoz/karta yaratish (mijoz registratsiyasi)',
    ep_card_create_note:
      "Idempotent — agar shu telefon bilan karta mavjud bo'lsa, mavjud kartani qaytaradi.",
    ep_card_get_title: "Karta ma'lumotlari va balans",
    ep_card_get_response_comment: '// Format /cards/lookup bilan bir xil',
    ep_redeemcode_title: 'Vaqtinchalik promokod orqali kartani topish (QR muqobili)',
    ep_redeemcode_note: (
      <>
        Mijoz Monvo ilovasida yaratgan <b>180 soniyalik (3 daqiqa)</b> kodni kartaga
        aylantiradi (QR skanerlash imkoni bo'lmaganda). Qaytgan{' '}
        <code>card_uid</code> bilan keyin <code>/transactions/earn</code> yoki
        ball yechish amalini bajaring. Kod faqat 3 daqiqa amal qiladi.
      </>
    ),
    ep_earn_title: 'Chek qabul qilish — ball berish (asosiy endpoint)',
    ep_earn_note: (
      <>
        <strong>Idempotent:</strong> bir xil <code>external_ref</code> bilan qayta yuborilsa,
        mavjud tranzaksiyani qaytaradi (qayta ball bermaydi). Network retry xavfsiz.{' '}
        <strong>Lazy enrollment:</strong> telefon mavjud bo'lib, karta yo'q bo'lsa —
        avtomatik karta yaratiladi.
      </>
    ),
    ep_redeem_title: 'Mukofot olish — ball yechish',
    ep_redeem_note: (
      <>
        <strong>Idempotent:</strong> bir xil <code>external_ref</code> bilan qayta yuborilsa
        qayta yechilmaydi. <strong>400</strong> — yetarli ball yo'q,{' '}
        <strong>404</strong> — karta yoki mukofot topilmadi. Lazy enrollment <em>yo'q</em> —
        redeem mavjud kartani talab qiladi.
      </>
    ),
    ep_spend_title: 'Ballarni to\'g\'ridan-to\'g\'ri yechish (POS checkout)',
    ep_spend_note: (
      <>
        <strong>Idempotent:</strong> bir xil <code>external_ref</code> bilan qayta yuborilsa
        qayta yechilmaydi. <strong>400</strong> — yetarli ball yo'q.
        Reward katalogsiz erkin miqdorda ball yechish kerak bo'lganda ishlatiladi.
      </>
    ),
    ep_billz_title: 'Ballarni Billz sertifikatiga aylantirish',
    ep_billz_note: (
      <>
        Billz POS integratsiyasi ulangan merchantlar uchun. Balllar Billz gift
        certificate'ga aylantiriladi, mijoz kassada ishlatishi mumkin.{' '}
        <code>expire_date</code> ko'rsatilmasa — 90 kun amal qiladi.
      </>
    ),
    ep_tx_list_title: 'Tranzaksiyalar tarixi (pagination)',
    ep_tx_list_note: 'Filter: ?card_uid={uid} — bitta karta bo\'yicha.',
    ep_branches_title: "Filiallar ro'yxati",
    ep_rewards_title: 'Mukofotlar katalogi (faqat aktivlari)',

    h_errors: '4. Xatolar',
    errors_status: 'Status',
    errors_reason: 'Sabab',
    err_400: "Body validatsiyasidan o'tmadi",
    err_401: "Token noto'g'ri yoki o'chirilgan",
    err_403: 'Akkaunt bloklangan',
    err_404: 'Mavjud emas (karta, filial, ...)',
    err_429: "Rate limit — 60 so'rov/daqiqa",
    err_500: 'Ichki server xatoligi (kamdan-kam, retry qiling)',
    err_format: (
      <>
        Xato javob formati: <code>{'{ "detail": "..." }'}</code>
      </>
    ),

    h_examples: '5. Misollar',
    ex_telegram: 'Telegram bot (Node.js)',
    ex_backend: 'Backend (Python + httpx)',
    ex_php: 'Sayt (PHP)',

    h_security: '6. Best practices va xavfsizlik',
    sec_li: [
      <><strong>Tokenni serveringizda saqlang</strong> — hech qachon mijoz brauzeri yoki mobil ilovasiga yubormang.</>,
      <>Tokenni Git'ga commit qilmang. Environment variable yoki secret manager ishlating.</>,
      <>Har bir muhit (production, staging, lokal) uchun alohida token yarating.</>,
      <><code>external_ref</code> ni o'z POS/CRM tomondan unique qiling — network retry xavfsiz bo'lsin.</>,
      <>Token o'g'irlangan bo'lsa darhol panel'da o'chiring va yangisini yarating.</>,
      <>Production'ga chiqishdan oldin yangi token bilan <code>/me</code> endpointini sinab ko'ring.</>,
    ],
    security_box: (
      <>
        <strong>Xavfsizlik:</strong> Tokenlar SHA-256 hash bilan saqlanadi (DB'da plaintext yo'q).
        Har bir token uchun <code>last_used_at</code>, <code>last_used_ip</code> va{' '}
        <code>failed_attempts</code> kuzatiladi — shubhali aktivlikni darhol aniqlash uchun.
      </>
    ),

    footer_copy: '© Monvo OÜ 2026',
  },

  ru: {
    nav_brand_tag: 'API',
    nav_back: '← На главную',
    h1: 'Merchant API',
    lead:
      'Публичный REST API для бизнеса — для интеграции сайта, мобильного приложения, ' +
      'Telegram-бота и других внешних систем с платформой лояльности Monvo.',
    toc_title: 'Содержание',
    toc: [
      ['#auth', 'Аутентификация'],
      ['#base', 'Base URL и формат'],
      ['#endpoints', 'Эндпойнты'],
      ['#errors', 'Ошибки'],
      ['#examples', 'Примеры (Node.js, Python, PHP)'],
      ['#security', 'Best practices и безопасность'],
    ],

    h_auth: '1. Аутентификация',
    auth_p1: 'Получить токен:',
    auth_step1: (
      <>
        Войдите на <a href="https://monvo.uz/merchant/login">monvo.uz/merchant/login</a> по email + паролю
      </>
    ),
    auth_step2: (
      <>
        Sidebar → <strong>API токены</strong> → <strong>Новый токен</strong>
      </>
    ),
    auth_step3: (
      <>
        Рекомендуется: поставьте срок действия <strong>90 дней</strong>
      </>
    ),
    auth_step4: (
      <>
        Полное значение токена показывается <strong>один раз</strong> — сохраните в надёжном месте
      </>
    ),
    auth_request: (
      <>
        Каждый запрос отправляется с заголовком <code>Authorization: Bearer kar_live_…</code>
      </>
    ),
    auth_security_note: (
      <>
        <strong>Безопасность:</strong> токены хранятся в виде SHA-256 хэша
        (восстановить нельзя), при истечении <code>expires_at</code> возвращается
        401, а после 10 неудачных попыток токен блокируется на{' '}
        <strong>15 минут</strong>.
      </>
    ),

    h_base: '2. Base URL',
    base_p: (
      <>
        POST/PATCH запросы — в JSON: <code>Content-Type: application/json</code>.
        Rate limit: <strong>60 запросов / минуту на токен</strong> (Redis atomic
        counter, 60s sliding window). При превышении — <code>429 Too Many Requests</code>.
      </>
    ),

    h_endpoints: '3. Эндпойнты',

    body_label: 'BODY',
    response_label: 'RESPONSE',

    ep_me_title: 'Проверка токена + информация о бизнесе',
    ep_lookup_title: 'Поиск карты по телефону',
    ep_lookup_note: '404 — карта с этим телефоном не найдена.',
    ep_card_create_title: 'Создать карту/клиента (регистрация клиента)',
    ep_card_create_note:
      'Идемпотентно — если карта с этим телефоном уже есть, возвращает существующую.',
    ep_card_get_title: 'Информация о карте и баланс',
    ep_card_get_response_comment: '// Формат как у /cards/lookup',
    ep_redeemcode_title: 'Поиск карты по временному промокоду (альтернатива QR)',
    ep_redeemcode_note: (
      <>
        Преобразует <b>180-секундный (3 минуты)</b> код, сгенерированный клиентом в приложении
        Monvo, в карту (когда сканирование QR недоступно). С полученным{' '}
        <code>card_uid</code> вызовите <code>/transactions/earn</code> или списание
        баллов. Код действует только 3 минуты.
      </>
    ),
    ep_earn_title: 'Принять чек — начислить баллы (основной эндпойнт)',
    ep_earn_note: (
      <>
        <strong>Идемпотентно:</strong> повторный запрос с тем же <code>external_ref</code>{' '}
        вернёт существующую транзакцию (баллы повторно не начисляются). Network retry безопасен.{' '}
        <strong>Lazy enrollment:</strong> если телефон есть, а карты нет — карта создаётся автоматически.
      </>
    ),
    ep_redeem_title: 'Получение награды — списание баллов',
    ep_redeem_note: (
      <>
        <strong>Идемпотентно:</strong> повторный запрос с тем же <code>external_ref</code> не списывает баллы заново.{' '}
        <strong>400</strong> — недостаточно баллов, <strong>404</strong> — карта или награда не найдены.
        Lazy enrollment <em>не работает</em> — redeem требует существующую карту.
      </>
    ),
    ep_spend_title: 'Прямое списание баллов (POS checkout)',
    ep_spend_note: (
      <>
        <strong>Идемпотентно:</strong> повторный запрос с тем же <code>external_ref</code>{' '}
        не списывает баллы повторно. <strong>400</strong> — недостаточно баллов.
        Используется для произвольного списания без привязки к каталогу наград.
      </>
    ),
    ep_billz_title: 'Конвертация баллов в сертификат Billz',
    ep_billz_note: (
      <>
        Для мерчантов с подключённой интеграцией Billz. Баллы конвертируются
        в gift certificate, который клиент предъявляет на кассе.{' '}
        <code>expire_date</code> по умолчанию — 90 дней.
      </>
    ),
    ep_tx_list_title: 'История транзакций (с пагинацией)',
    ep_tx_list_note: 'Фильтр: ?card_uid={uid} — по одной карте.',
    ep_branches_title: 'Список филиалов',
    ep_rewards_title: 'Каталог наград (только активные)',

    h_errors: '4. Ошибки',
    errors_status: 'Статус',
    errors_reason: 'Причина',
    err_400: 'Тело запроса не прошло валидацию',
    err_401: 'Токен неверный или отозванный',
    err_403: 'Аккаунт заблокирован',
    err_404: 'Не найдено (карта, филиал, ...)',
    err_429: 'Rate limit — 60 запросов/мин',
    err_500: 'Внутренняя ошибка сервера (редко, попробуйте retry)',
    err_format: (
      <>
        Формат ответа об ошибке: <code>{'{ "detail": "..." }'}</code>
      </>
    ),

    h_examples: '5. Примеры',
    ex_telegram: 'Telegram-бот (Node.js)',
    ex_backend: 'Backend (Python + httpx)',
    ex_php: 'Сайт (PHP)',

    h_security: '6. Best practices и безопасность',
    sec_li: [
      <><strong>Храните токен на сервере</strong> — никогда не отправляйте на клиентский браузер или в мобильное приложение.</>,
      <>Не коммитьте токен в Git. Используйте environment variables или secret manager.</>,
      <>Создавайте отдельный токен для каждого окружения (production, staging, локальное).</>,
      <>Сделайте <code>external_ref</code> уникальным на стороне POS/CRM — чтобы network retry был безопасен.</>,
      <>Если токен украден — сразу отзовите его в панели и создайте новый.</>,
      <>Перед выкладкой в production — проверьте новый токен запросом к <code>/me</code>.</>,
    ],
    security_box: (
      <>
        <strong>Безопасность:</strong> токены хранятся в виде SHA-256 хэша (в БД нет plaintext).
        Для каждого токена отслеживаются <code>last_used_at</code>, <code>last_used_ip</code> и{' '}
        <code>failed_attempts</code> — для быстрого обнаружения подозрительной активности.
      </>
    ),

    footer_copy: '© Monvo OÜ 2026',
  },
};

function Endpoint({ method, path, title, body, response, note, T }) {
  return (
    <div className="card">
      <div className="endpoint">
        <span className={`method method-${method.toLowerCase()}`}>{method}</span>
        <code className="path">{path}</code>
      </div>
      <div style={{ color: 'var(--ink-soft)', marginBottom: 8 }}>{title}</div>
      {body && (
        <>
          <div className="label">{T.body_label}</div>
          <pre>{body}</pre>
        </>
      )}
      <div className="label">{T.response_label}</div>
      <pre>{response}</pre>
      {note && (
        <div className="note">
          <i className="bi bi-info-circle-fill" style={{ marginRight: 6 }} />
          {note}
        </div>
      )}
    </div>
  );
}

function LangToggle({ lang, setLang }) {
  const btn = (code, label) => (
    <button
      key={code}
      onClick={() => setLang(code)}
      aria-pressed={lang === code}
      style={{
        padding: '4px 12px',
        border: 'none',
        background: lang === code ? 'var(--brand)' : 'transparent',
        color: lang === code ? '#fff' : 'var(--ink-soft)',
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
        borderRadius: 999,
        transition: 'background .15s',
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        border: '1px solid var(--line)',
        borderRadius: 999,
        background: 'var(--surface)',
      }}
    >
      {btn('uz', "O'z")}
      {btn('ru', 'RU')}
    </div>
  );
}

export default function ApiDocsPage() {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'uz';
    return localStorage.getItem('monvo_apidocs_lang') || 'uz';
  });
  useEffect(() => {
    try {
      localStorage.setItem('monvo_apidocs_lang', lang);
      document.documentElement.lang = lang;
    } catch {
      /* noop */
    }
  }, [lang]);

  const T = STRINGS[lang];

  return (
    <>
      <nav className="api-nav">
        <div className="api-nav-inner" style={{ gap: 16 }}>
          <a href="/" style={{ color: 'inherit', textDecoration: 'none' }} className="api-brand">
            <span>Monvo</span>
            <span className="api-brand-tag">{T.nav_brand_tag}</span>
          </a>
          <div style={{ flex: 1 }} />
          <LangToggle lang={lang} setLang={setLang} />
          <a href="/" className="api-back">{T.nav_back}</a>
        </div>
      </nav>

      <div className="api-root">
        <h1>{T.h1}</h1>
        <p className="lead">{T.lead}</p>

        <div className="toc">
          <div className="toc-title">{T.toc_title}</div>
          <ol>
            {T.toc.map(([href, label]) => (
              <li key={href}><a href={href}>{label}</a></li>
            ))}
          </ol>
        </div>

        <h2 id="auth">{T.h_auth}</h2>
        <p>{T.auth_p1}</p>
        <ol>
          <li>{T.auth_step1}</li>
          <li>{T.auth_step2}</li>
          <li>{T.auth_step3}</li>
          <li>{T.auth_step4}</li>
        </ol>
        <p>{T.auth_request}</p>
        <pre>{`curl ${BASE}/me \\
     -H "Authorization: Bearer kar_live_..."`}</pre>
        <p style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <i className="bi bi-shield-lock-fill" style={{ color: 'var(--brand)', fontSize: 18, marginTop: 2 }} />
          <span>{T.auth_security_note}</span>
        </p>

        <h2 id="base">{T.h_base}</h2>
        <pre>{BASE}</pre>
        <p>{T.base_p}</p>

        <h2 id="endpoints">{T.h_endpoints}</h2>

        <Endpoint
          T={T}
          method="GET"
          path="/me"
          title={T.ep_me_title}
          response={`{
  "id": 12,
  "business_name": "Coffee Lab",
  "email": "owner@cafelab.uz",
  "phone": "+998901234567",
  "is_active": true
}`}
        />

        <Endpoint
          T={T}
          method="GET"
          path="/cards/lookup?phone=+998901234567"
          title={T.ep_lookup_title}
          response={`{
  "card_uid": "abc123def456",
  "merchant_id": 12,
  "holder_name": "Aziz Karimov",
  "holder_phone": "+998901234567",
  "points": 1450,
  "tier": "silver",
  "branch_id": 3,
  "is_active": true
}`}
          note={T.ep_lookup_note}
        />

        <Endpoint
          T={T}
          method="POST"
          path="/cards"
          title={T.ep_card_create_title}
          body={`{
  "phone": "+998901234567",
  "name": "Aziz Karimov",
  "branch_id": 3,
  "tags": ["VIP"]
}`}
          response={`// 201 Created
{
  "card_uid": "abc123def456",
  "merchant_id": 12,
  "holder_name": "Aziz Karimov",
  "holder_phone": "+998901234567",
  "points": 0,
  "tier": "bronze",
  "is_active": true
}`}
          note={T.ep_card_create_note}
        />

        <Endpoint
          T={T}
          method="GET"
          path="/cards/{card_uid}"
          title={T.ep_card_get_title}
          response={T.ep_card_get_response_comment}
        />

        <Endpoint
          T={T}
          method="POST"
          path="/redeem-code/resolve"
          title={T.ep_redeemcode_title}
          body={`{
  "code": "472915"
}`}
          response={`{
  "card_uid": "abc123def456",
  "holder_name": "Bunyod Xayitov",
  "holder_phone": "+998901234567",
  "points": 1575,
  "tier": "gold"
}`}
          note={T.ep_redeemcode_note}
        />

        <Endpoint
          T={T}
          method="POST"
          path="/transactions/earn"
          title={T.ep_earn_title}
          body={`{
  "amount": 125000,
  "phone": "+998901234567",
  "external_ref": "POS-2026-001234",
  "branch_id": 3,
  "note": "Latte + Croissant"
}`}
          response={`{
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
    "points": 1575
  }
}`}
          note={T.ep_earn_note}
        />

        <Endpoint
          T={T}
          method="POST"
          path="/transactions/redeem"
          title={T.ep_redeem_title}
          body={`{
  "reward_id": 1,
  "phone": "+998901234567",
  "external_ref": "POS-2026-001235",
  "branch_id": 3,
  "note": "Bepul kapuchino"
}`}
          response={`{
  "duplicate": false,
  "transaction": {
    "id": 9877,
    "tx_type": "redeem",
    "points_delta": -200,
    "external_ref": "POS-2026-001235",
    "provider": "api"
  },
  "card": {
    "card_uid": "abc123def456",
    "points": 1375
  },
  "reward": {
    "id": 1,
    "title": "Bepul kapuchino",
    "points_cost": 200
  }
}`}
          note={T.ep_redeem_note}
        />

        <Endpoint
          T={T}
          method="POST"
          path="/transactions/spend"
          title={T.ep_spend_title}
          body={`{
  "points": 300,
  "phone": "+998901234567",
  "external_ref": "POS-2026-001236",
  "branch_id": 3,
  "note": "Checkout discount"
}`}
          response={`{
  "duplicate": false,
  "transaction": {
    "id": 9878,
    "tx_type": "spend",
    "points_delta": -300,
    "external_ref": "POS-2026-001236",
    "provider": "api"
  },
  "card": {
    "card_uid": "abc123def456",
    "points": 1075
  }
}`}
          note={T.ep_spend_note}
        />

        <Endpoint
          T={T}
          method="POST"
          path="/transactions/billz-redeem"
          title={T.ep_billz_title}
          body={`{
  "points": 500,
  "phone": "+998901234567",
  "external_ref": "BILLZ-2026-0003",
  "expire_date": "10.03.2025",
  "branch_id": 3
}`}
          response={`{
  "duplicate": false,
  "transaction": {
    "id": 9879,
    "tx_type": "billz_redeem",
    "points_delta": -500,
    "external_ref": "BILLZ-2026-0003"
  },
  "card": {
    "card_uid": "abc123def456",
    "points": 575
  },
  "voucher": {
    "code": "BLZ-XXXXXXXX",
    "amount": 50000,
    "expire_date": "10.03.2025"
  }
}`}
          note={T.ep_billz_note}
        />

        <Endpoint
          T={T}
          method="GET"
          path="/transactions?limit=50&offset=0"
          title={T.ep_tx_list_title}
          response={`{
  "items": [...],
  "total": 1842,
  "limit": 50,
  "offset": 0
}`}
          note={T.ep_tx_list_note}
        />

        <Endpoint
          T={T}
          method="GET"
          path="/branches"
          title={T.ep_branches_title}
          response={`[
  {
    "id": 1,
    "name": "Markaziy filial",
    "address": "Toshkent, Amir Temur 12",
    "phone": "+998711234567",
    "is_active": true
  }
]`}
        />

        <Endpoint
          T={T}
          method="GET"
          path="/rewards"
          title={T.ep_rewards_title}
          response={`[
  {
    "id": 1,
    "title": "Bepul kapuchino",
    "description": "200 ball uchun",
    "points_cost": 200,
    "min_tier": "bronze",
    "is_active": true
  }
]`}
        />

        <h2 id="errors">{T.h_errors}</h2>
        <table>
          <thead>
            <tr><th>{T.errors_status}</th><th>{T.errors_reason}</th></tr>
          </thead>
          <tbody>
            <tr><td><code>400</code></td><td>{T.err_400}</td></tr>
            <tr><td><code>401</code></td><td>{T.err_401}</td></tr>
            <tr><td><code>403</code></td><td>{T.err_403}</td></tr>
            <tr><td><code>404</code></td><td>{T.err_404}</td></tr>
            <tr><td><code>429</code></td><td>{T.err_429}</td></tr>
            <tr><td><code>500</code></td><td>{T.err_500}</td></tr>
          </tbody>
        </table>
        <p>{T.err_format}</p>

        <h2 id="examples">{T.h_examples}</h2>

        <CodeTabs />

        <h2 id="security">{T.h_security}</h2>
        <ul>
          {T.sec_li.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <p
          style={{
            marginTop: 24,
            padding: '14px 18px',
            background: 'var(--brand-soft)',
            borderRadius: 10,
            color: 'var(--brand-deep)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <i className="bi bi-shield-lock-fill" style={{ fontSize: 20, marginTop: 1 }} />
          <span>{T.security_box}</span>
        </p>

        <footer className="api-footer">
          <div>{T.footer_copy}</div>
          <div>
            <a href="mailto:support@monvo.uz">
              <i className="bi bi-envelope-fill" style={{ marginRight: 4 }} />
              support@monvo.uz
            </a>
            {' · '}
            <a href="https://t.me/monvo_support">
              <i className="bi bi-telegram" style={{ marginRight: 4 }} />
              Telegram
            </a>
            {' · '}
            <a href="https://monvo.uz">
              <i className="bi bi-globe" style={{ marginRight: 4 }} />
              monvo.uz
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
