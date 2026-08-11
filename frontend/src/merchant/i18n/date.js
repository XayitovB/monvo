// Sana formatlash — uz-UZ locale oy nomini "M06" (oy raqami) qilib chiqaradi,
// shuning uchun o'zbekcha oy nomlari bilan qo'lda formatlaymiz. RU uchun
// standart Intl ishlatiladi.
const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param value  Date | string | number
 * @param lang   'uz' | 'ru'
 * @param opts   { year?: boolean, time?: boolean }  (default: year=true, time=false)
 */
export function fmtDate(value, lang = 'uz', { year = true, time = false } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  if (lang === 'ru') {
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
      ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  }
  let s = `${d.getDate()} ${UZ_MONTHS[d.getMonth()]}`;
  if (year) s += ` ${d.getFullYear()}`;
  if (time) s += `, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return s;
}
