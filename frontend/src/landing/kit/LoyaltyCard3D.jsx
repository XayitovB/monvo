import React, { useState, useEffect, useRef } from 'react';
import { BRAND, BRAND_DEEP } from './index.jsx';
import { Tag } from './index.jsx';

export default function LoyaltyCard3D({ flipping = true, brand = 'Coffee Lab', tier = 'Gold', balance = 248, T }) {
  const m = T?.mock || {};
  const [rotY, setRotY] = useState(0);
  const [tiltX, setTiltX] = useState(8);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef(null);
  const isDragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    if (!flipping) return;
    let timer;
    const tick = () => {
      if (document.visibilityState === 'visible' && !isDragging.current) {
        setRotY(r => r + 180);
      }
      timer = setTimeout(tick, 4200);
    };
    timer = setTimeout(tick, 4200);
    return () => clearTimeout(timer);
  }, [flipping]);

  // Rect'ni hover boshida bir marta keshlaymiz — har mousemove'da
  // getBoundingClientRect o'qish forced reflow (layout thrashing) berardi.
  const rectRef = useRef(null);
  const cacheRect = () => {
    if (wrapRef.current) rectRef.current = wrapRef.current.getBoundingClientRect();
  };

  const onMouseDown = (e) => {
    isDragging.current = true;
    setDragging(true);
    lastX.current = e.clientX;
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    const r = rectRef.current;
    if (!r) return;
    const cy = r.top + r.height / 2;
    const dy = (e.clientY - cy) / (r.height / 2);
    setTiltX(8 - dy * 14);

    if (isDragging.current) {
      const delta = e.clientX - lastX.current;
      setRotY(prev => prev + delta * 0.55);
      lastX.current = e.clientX;
    }
  };

  const onMouseUp = () => {
    isDragging.current = false;
    setDragging(false);
  };

  const onLeave = () => {
    isDragging.current = false;
    setDragging(false);
    setTiltX(8);
  };

  return (
    <div
      ref={wrapRef}
      onMouseEnter={cacheRect}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onLeave}
      style={{
        width: 380, height: 240, perspective: 1600, position: 'relative',
        transformStyle: 'preserve-3d',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      <div style={{
        width: '100%', height: '100%', position: 'relative',
        transformStyle: 'preserve-3d',
        transform: `rotateY(${rotY}deg) rotateX(${tiltX}deg)`,
        transition: dragging ? 'none' : 'transform 1.1s cubic-bezier(.7,-0.05,.3,1.05)',
      }}>
        {/* FRONT */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 22, padding: 22,
          backfaceVisibility: 'hidden',
          background: `linear-gradient(135deg, #143822 0%, ${BRAND_DEEP} 50%, ${BRAND} 100%)`,
          color: '#fff', overflow: 'hidden',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 80% 0%, rgba(212,175,55,.45) 0%, transparent 50%)',
            pointerEvents: 'none',
          }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 500, letterSpacing: 0.6, textTransform: 'uppercase' }}>{brand}</div>
              <div style={{ fontFamily: 'var(--k-display)', fontSize: 22, fontWeight: 600, marginTop: 2, letterSpacing: -0.4 }}>{m.club_card || 'Клубная карта'}</div>
            </div>
            <div style={{
              padding: '5px 11px', borderRadius: 999, background: '#D4AF37', color: '#1A1100',
              fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
              boxShadow: '0 4px 12px rgba(212,175,55,.35)',
            }}>{tier.toUpperCase()}</div>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 500, marginBottom: 4 }}>{m.balance || 'БАЛАНС'}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 38, fontWeight: 600, letterSpacing: -1, lineHeight: 1 }}>
              {balance} <span style={{ fontSize: 22, color: '#D4AF37' }}>★</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 }}>
              <div style={{ fontSize: 11, opacity: 0.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
                **** **** **** 4821
              </div>
              <div style={{
                width: 32, height: 24, borderRadius: 4,
                background: 'linear-gradient(135deg, #E8D89A 0%, #B8A165 50%, #8C7544 100%)',
                position: 'relative',
              }}>
                <div style={{ position: 'absolute', inset: '4px 6px', border: '0.5px solid rgba(0,0,0,.25)', borderRadius: 2 }}/>
              </div>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 22, padding: 22,
          backfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
          background: '#0F1115', color: '#fff',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.5, fontWeight: 500, letterSpacing: 0.6, textTransform: 'uppercase' }}>{m.qr_code || 'QR-код'}</div>
              <div style={{ fontFamily: 'var(--k-display)', fontSize: 16, marginTop: 2 }}>{m.show_at_pos || 'Покажите на кассе'}</div>
            </div>
            <Tag tone="onDark">{m.active || 'Активна'}</Tag>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            <div style={{
              width: 110, height: 110, background: '#fff', borderRadius: 8, padding: 8,
              display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 1.2,
            }}>
              {Array.from({ length: 121 }).map((_, i) => (
                <div key={i} style={{
                  background: ((i * 17 + i / 11) % 3) > 1.4 ? '#0F1115' : 'transparent',
                  borderRadius: 1,
                }}/>
              ))}
            </div>
            <div style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,.65)', lineHeight: 1.5 }}>
              <div style={{ marginBottom: 8 }}>{m.client_card || 'Карта клиента'} <span style={{ color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>·{balance}★</span></div>
              <div>{m.next_reward_in || 'Следующая награда через'} <span style={{ color: '#D4AF37', fontWeight: 600 }}>52★</span></div>
              <div style={{ height: 4, background: 'rgba(255,255,255,.1)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: '83%', height: '100%', background: '#D4AF37' }}/>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1.5 }}>
            MONVO · UZ · ID 4821
          </div>
        </div>
      </div>
    </div>
  );
}
