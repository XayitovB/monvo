import React from 'react';

// mono=true → oq logo (qora/to'q fon uchun, masalan Login dark header)
// mono=false → yashil logo (yon panel, onboarding)
export const MonvoLogo = ({ size = 22, mono = false }) => (
  <img
    src={mono ? '/branding/monvo-logo-white.png' : '/branding/monvo-logo-green.png'}
    alt="Monvo"
    style={{ height: size * 1.4, width: 'auto', display: 'block' }}
  />
);

// Mobil app'dagi LoyaltyCardWidget bilan piksel-darajada mos:
//   - aspect-ratio 1.55, border-radius 22, padding 22
//   - Yuqori chap: "{TIER} CARD" + masklangan UID (•••• •••• 1234)
//   - Yuqori o'ng: 40x40 logo (logo URL bo'lsa rasm, aks holda harf)
//   - Pastki chap: biznes nomi (uppercase) + "Доступный баланс" + katta balans "{n} so'm"
//   - Dekorativ pastki-o'ng oq doiraviy blob (160px, 8% opacity)
function _maskUid(uid = 'POS_DEMO_1234') {
  const s = String(uid || '');
  if (s.length < 4) return s;
  return '•••• •••• ' + s.slice(-4);
}
function _formatPoints(n) {
  return Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ');
}

export const LoyaltyCardMini = ({
  brand = 'Coffee Lab',
  balance = 248,
  bg,
  fg = '#fff',
  scale = 1,
  full = false,
  cardUid = '',
  logoUrl = '',
}) => {
  const initial = (brand || '?').trim().charAt(0).toUpperCase();
  return (
    <div style={{
      width: full ? '100%' : 360 * scale,
      aspectRatio: '1.55 / 1',
      background: bg || 'linear-gradient(135deg, #2F6B3F 0%, #1F4D2C 100%)',
      color: fg, borderRadius: 22 * scale,
      padding: 22 * scale,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      fontFamily: 'var(--m-sans)',
      boxShadow: '0 12px 32px rgba(31, 77, 44, 0.40), 0 4px 8px rgba(0, 0, 0, 0.10)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Dekorativ blob — pastki-o'ng */}
      <div style={{
        position: 'absolute', right: -20 * scale, bottom: -20 * scale,
        width: 160 * scale, height: 160 * scale, borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)',
      }}/>

      {/* ── Yuqori qator ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        position: 'relative',
      }}>
        <div>
          <div style={{
            fontSize: 10 * scale, fontWeight: 600,
            color: fg, opacity: 0.75, letterSpacing: 1.2, textTransform: 'uppercase',
          }}>LOYALTY CARD</div>
          <div style={{
            fontSize: 12 * scale, marginTop: 4 * scale,
            color: fg, opacity: 0.65,
            fontFamily: 'var(--m-mono)', letterSpacing: 0.5,
          }}>{_maskUid(cardUid)}</div>
        </div>

        {/* Logo / Initial */}
        <div style={{
          width: 40 * scale, height: 40 * scale, borderRadius: 10 * scale,
          background: 'rgba(255,255,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {logoUrl ? (
            <img
              src={logoUrl} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <span style={{
              color: fg, fontSize: 16 * scale, fontWeight: 800,
            }}>{initial}</span>
          )}
        </div>
      </div>

      {/* ── Pastki qator ── */}
      <div style={{ position: 'relative' }}>
        <div style={{
          fontSize: 14 * scale, fontWeight: 700, color: fg,
          letterSpacing: 0.2, textTransform: 'uppercase',
        }}>{brand}</div>
        <div style={{
          fontSize: 11 * scale, color: fg, opacity: 0.75,
          marginTop: 8 * scale,
        }}>Доступный баланс</div>
        <div style={{
          fontSize: 32 * scale, fontWeight: 700, color: fg,
          letterSpacing: -1, lineHeight: 1, marginTop: 2 * scale,
        }}>{_formatPoints(balance)} so'm</div>
      </div>
    </div>
  );
};
