import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { I } from '../kit';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import api from '../api';

/**
 * Doimiy ogohlantirish — merchant hali loyalty tizimini sozlamagan bo'lsa
 * (faol cashback qoidasi yo'q) har sahifada ko'rinadi. Qoida yaratilgach
 * o'z-o'zidan yo'qoladi. Loyalty sahifasining o'zida ko'rsatilmaydi.
 */
export default function LoyaltySetupBanner() {
  const { isAuthed } = useAuth();
  const { lang } = useLang();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [configured, setConfigured] = useState(null); // null=noma'lum, true/false
  const configuredRef = useRef(false);

  useEffect(() => {
    if (!isAuthed || configuredRef.current) return;
    let alive = true;
    // Loyalty "sozlangan" hisoblanadi, agar:
    //  • model stamp (N+1) yoki spend (xarid maqsadi) bo'lsa — qoida shart emas, YOKI
    //  • model cashback bo'lsa va kamida bitta faol qoida bo'lsa.
    Promise.all([
      api.me().catch(() => null),
      api.loyaltyRules().catch(() => []),
    ])
      .then(([me, rules]) => {
        if (!alive) return;
        const type = (me && me.loyalty_type) || 'cashback';
        let ok;
        if (type === 'stamp' || type === 'spend') {
          ok = true;
        } else {
          const list = Array.isArray(rules) ? rules : [];
          ok = list.some((r) => r.is_active);
        }
        configuredRef.current = ok;
        setConfigured(ok);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAuthed, pathname]);

  if (configured !== false) return null;
  if (pathname.startsWith('/loyalty')) return null;

  const txt = lang === 'ru'
    ? {
        msg: 'Программа лояльности ещё не настроена — клиенты не получают кэшбэк.',
        cta: 'Настроить',
      }
    : {
        msg: "Loyalty tizimi hali sozlanmagan — mijozlar cashback olmayapti.",
        cta: 'Sozlash',
      };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 28px',
      background: 'var(--m-warn-soft, #FEF3E2)',
      borderBottom: '1px solid color-mix(in oklab, var(--m-warn, #C77700) 25%, transparent)',
      color: 'var(--m-warn-ink, #9A5B00)',
      fontSize: 13,
    }}>
      <I.sparkles size={17} style={{ flexShrink: 0, color: 'var(--m-warn, #C77700)' }} />
      <span style={{ flex: 1, fontWeight: 500 }}>{txt.msg}</span>
      <button
        onClick={() => navigate('/loyalty')}
        style={{
          flexShrink: 0,
          background: 'var(--m-warn, #C77700)', color: '#fff', border: 'none',
          padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
          cursor: 'pointer',
        }}
      >{txt.cta}</button>
    </div>
  );
}
