// Tashkent vaqti uchun markaziy formatter (Asia/Tashkent, UTC+5).
// Backend ISO8601 + UTC qaytaradi, hamma joyda shu helper'lar ishlatiladi.

const TZ = 'Asia/Tashkent';

function _toDate(input) {
  if (input == null) return null;
  if (input instanceof Date) return isNaN(input) ? null : input;
  const d = new Date(input);
  return isNaN(d) ? null : d;
}

// 21:50
export function fmtTime(input, locale = 'ru-RU') {
  const d = _toDate(input);
  if (!d) return '—';
  return d.toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  });
}

// 06.05.2026
export function fmtDate(input, locale = 'ru-RU') {
  const d = _toDate(input);
  if (!d) return '—';
  return d.toLocaleDateString(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ,
  });
}

// O'zbekcha qisqa oy nomlari — JS Intl 'uz-UZ' "M06" beradi (CLDR), shuning
// uchun qo'lda beramiz.
const _UZ_MONTHS_SHORT = [
  'yanv', 'fevr', 'mart', 'apr', 'may', 'iyun',
  'iyul', 'avg', 'sent', 'okt', 'noyab', 'dek',
];

// 06 may
export function fmtDateShort(input, locale = 'ru-RU') {
  const d = _toDate(input);
  if (!d) return '—';
  if (String(locale).startsWith('uz')) {
    // TZ (Asia/Tashkent) bo'yicha kun/oy, o'zbekcha oy nomi bilan: "26 iyun".
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit', month: 'numeric', timeZone: TZ,
    }).formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    const mNum =
        parseInt(parts.find((p) => p.type === 'month')?.value ?? '1', 10);
    return `${day} ${_UZ_MONTHS_SHORT[mNum - 1] ?? ''}`.trim();
  }
  return d.toLocaleDateString(locale, {
    day: '2-digit', month: 'short', timeZone: TZ,
  });
}

// 21:50 · 06 may
export function fmtTimeAndDate(input, locale = 'ru-RU') {
  const d = _toDate(input);
  if (!d) return '—';
  return `${fmtTime(d, locale)} · ${fmtDateShort(d, locale)}`;
}

// 06.05.2026 21:50
export function fmtDateTime(input, locale = 'ru-RU') {
  const d = _toDate(input);
  if (!d) return '—';
  return d.toLocaleString(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  });
}

// May 2026 / Май 2026 — month picker badge
export function fmtMonthLabel(input, lang = 'uz') {
  const d = _toDate(input) || new Date();
  // Brauzerning `uz-UZ` lokali oy nomlarini "M05" ko'rinishida beradi
  // (ICU CLDR'da uzbek `month: long` qisqartirilgan). Qo'lda yozamiz.
  const UZ_MONTHS = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
  ];
  if (lang === 'uz') {
    // Tashkent timezone'dagi yil/oyni ajratamiz
    const y = d.toLocaleString('en-US', { year: 'numeric', timeZone: TZ });
    const mNum = Number(d.toLocaleString('en-US', { month: 'numeric', timeZone: TZ }));
    return `${UZ_MONTHS[mNum - 1]} ${y}`;
  }
  const s = d.toLocaleDateString('ru-RU', {
    month: 'long', year: 'numeric', timeZone: TZ,
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "2026-05" -> {from: ISO start of month in Tashkent, to: ISO end of month}
export function monthRangeIso(yyyymm) {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm || '');
  if (!m) return { from: null, to: null };
  const y = Number(m[1]), mo = Number(m[2]);
  // Tashkent UTC+5 — local midnight = UTC 19:00 of previous day
  const fromUtc = new Date(Date.UTC(y, mo - 1, 1, -5, 0, 0));
  const toUtc = new Date(Date.UTC(y, mo, 1, -5, 0, 0));
  return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
}

// Current YYYY-MM in Tashkent timezone
export function currentMonthYYYYMM() {
  const d = new Date();
  const y = d.toLocaleString('en-US', { year: 'numeric', timeZone: TZ });
  const m = d.toLocaleString('en-US', { month: '2-digit', timeZone: TZ });
  return `${y}-${m}`;
}
