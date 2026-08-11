import React, { useEffect, useMemo, useState } from 'react';
import { I, T, Button, Surface, Field, Input, LoyaltyCardMini } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useAuth } from '../auth/AuthContext';
import api from '../api';

const COLOR_PRESETS = [
  { hex: '#1F4A2A', name: 'Forest' },
  { hex: '#2F6B3F', name: 'Monvo' },
  { hex: '#0B2545', name: 'Midnight' },
  { hex: '#7C4A8C', name: 'Mauve' },
  { hex: '#A65A3D', name: 'Terracotta' },
  { hex: '#1F3A5F', name: 'Steel' },
  { hex: '#9F1239', name: 'Cherry' },
  { hex: '#0F766E', name: 'Teal' },
  { hex: '#111111', name: 'Obsidian' },
];

const ACCENT_PRESETS = ['#D4AF37', '#FFFFFF', '#10B981', '#F59E0B', '#EF4444'];

// Tayyor karta shablonlari (4 ta preset). Flutter ro'yxati bilan sinxron
// bo'lishi kerak (Monvo-app/.../card_design_screen.dart _kCardPresets).
const CARD_PRESETS = [
  { id: 'classic', name: 'Klassik',  bgType: 'gradient', c1: '#0B2545', c2: '#1E40AF', accent: '#D4AF37' },
  { id: 'emerald', name: 'Zumrad',   bgType: 'gradient', c1: '#1F4A2A', c2: '#2F6B3F', accent: '#8AD79B' },
  { id: 'sunset',  name: 'Quyobot',  bgType: 'gradient', c1: '#7C2D12', c2: '#F59E0B', accent: '#FDE68A' },
  { id: 'minimal', name: 'Minimal',  bgType: 'solid',    c1: '#111111', c2: '#111111', accent: '#9CA3AF' },
];

function buildBackground(style, color1, color2) {
  if (style === 'gradient') {
    return `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`;
  }
  return color1;
}

function colorPresetName(hex) {
  return COLOR_PRESETS.find((p) => p.hex.toLowerCase() === (hex || '').toLowerCase())?.name || 'Custom';
}

export default function CardDesign() {
  const { t } = useLang();
  const { user } = useAuth();

  const [fillStyle, setFillStyle] = useState('gradient');
  const [color1, setColor1] = useState('#1F4A2A');
  const [color2, setColor2] = useState('#2F6B3F');
  const [accent, setAccent] = useState('#D4AF37');
  const [businessName, setBusinessName] = useState('');

  const [walletTab, setWalletTab] = useState('monvo');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  // Load existing design from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.cardDesign().catch(() => null);
        if (cancelled) return;
        // Kanonik maydonlar (background_type/bg_color_1...) ustuvor — save
        // shularni saqlaydi; legacy (fill_style/color1) backend filtridan
        // o'tmaydi, shuning uchun fallback sifatida.
        const canonStyle = data?.background_type
          ? (data.background_type === 'solid' ? 'solid' : 'gradient')
          : (data?.fill_style || 'gradient');
        const initial = {
          fill_style: canonStyle,
          color1: data?.bg_color_1 || data?.color1 || data?.primary_color || '#1F4A2A',
          color2: data?.bg_color_2 || data?.color2 || data?.secondary_color || '#2F6B3F',
          accent: data?.accent_color || '#D4AF37',
          business_name: data?.business_name || user?.business_name || '',
        };
        setFillStyle(initial.fill_style);
        setColor1(initial.color1);
        setColor2(initial.color2);
        setAccent(initial.accent);
        setBusinessName(initial.business_name);
        setSavedSnapshot(initial);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.business_name]);

  const previewBg = useMemo(
    () => buildBackground(fillStyle, color1, color2),
    [fillStyle, color1, color2]
  );

  // Joriy ranglar qaysi presetga mos kelishini aniqlaydi (yoki 'custom').
  const activePreset = useMemo(() => {
    const bt = fillStyle === 'solid' ? 'solid' : 'gradient';
    const found = CARD_PRESETS.find((p) =>
      p.bgType === bt &&
      p.c1.toLowerCase() === (color1 || '').toLowerCase() &&
      p.c2.toLowerCase() === (color2 || '').toLowerCase()
    );
    return found?.id || 'custom';
  }, [fillStyle, color1, color2]);

  function applyPreset(p) {
    setFillStyle(p.bgType === 'solid' ? 'solid' : 'gradient');
    setColor1(p.c1);
    setColor2(p.c2);
    setAccent(p.accent);
  }

  const dirty = useMemo(() => {
    if (!savedSnapshot) return true;
    return savedSnapshot.fill_style !== fillStyle
      || savedSnapshot.color1.toLowerCase() !== color1.toLowerCase()
      || savedSnapshot.color2.toLowerCase() !== color2.toLowerCase()
      || savedSnapshot.accent.toLowerCase() !== accent.toLowerCase()
      || savedSnapshot.business_name !== businessName;
  }, [savedSnapshot, fillStyle, color1, color2, accent, businessName]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        fill_style: fillStyle,
        color1, color2,
        primary_color: color1,
        secondary_color: color2,
        accent_color: accent,
        business_name: businessName,
        // Kanonik maydonlar — Flutter karta widget'i va public/card-design
        // aynan shularni o'qiydi. Preset ham shu yerda saqlanadi.
        preset: activePreset,
        background_type: fillStyle === 'solid' ? 'solid' : 'gradient',
        bg_color_1: color1,
        bg_color_2: color2,
        text_color: '#FFFFFF',
      };
      await api.saveCardDesign(payload);
      setSavedSnapshot({ ...payload, fill_style: payload.fill_style, accent: payload.accent_color });
      setSavedAt(new Date());
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!savedSnapshot) return;
    setFillStyle(savedSnapshot.fill_style);
    setColor1(savedSnapshot.color1);
    setColor2(savedSnapshot.color2);
    setAccent(savedSnapshot.accent);
    setBusinessName(savedSnapshot.business_name);
    setError(null);
  }

  return (
    <>
      <Topbar
        title={t('cd2.title')}
        subtitle={savedAt
          ? `${t('cd2.subtitle')} · ${t('common.now')}`
          : t('cd2.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={handleReset} disabled={!dirty || saving}>
              {t('cd2.reset')}
            </Button>
            <Button variant="primary" icon={<I.check/>} onClick={handleSave} disabled={!dirty || saving || !loaded}>
              {saving ? t('common.loading') : t('cd2.save')}
            </Button>
          </>
        }
      />

      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── Tayyor shablonlar (4 ta preset) ──────────────────────── */}
          <Surface padding={20}>
            <div style={{ ...T.h2, fontSize: 14, marginBottom: 12 }}>{t('cd2.preset.title')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {CARD_PRESETS.map((p) => {
                const selected = activePreset === p.id;
                const bg = p.bgType === 'gradient'
                  ? `linear-gradient(135deg, ${p.c1} 0%, ${p.c2} 100%)`
                  : p.c1;
                return (
                  <div
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    style={{
                      cursor: 'pointer', borderRadius: 12, overflow: 'hidden',
                      border: `2px solid ${selected ? 'var(--m-brand)' : 'var(--m-line)'}`,
                      boxShadow: selected ? '0 0 0 3px var(--m-brand-soft)' : 'none',
                      transition: 'border-color .15s, box-shadow .15s',
                    }}
                  >
                    <div style={{
                      height: 54, background: bg, position: 'relative',
                      display: 'flex', alignItems: 'flex-end', padding: 8,
                    }}>
                      {selected && (
                        <span style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 18, height: 18, borderRadius: '50%',
                          background: '#fff', color: 'var(--m-brand)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>✓</span>
                      )}
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, background: p.accent,
                        border: '1.5px solid rgba(255,255,255,.5)',
                      }}/>
                    </div>
                    <div style={{
                      padding: '7px 10px', fontSize: 12.5,
                      fontWeight: selected ? 600 : 500,
                      color: selected ? 'var(--m-brand-ink)' : 'var(--m-ink)',
                      background: selected ? 'var(--m-brand-soft)' : 'var(--m-surface)',
                    }}>{p.name}</div>
                  </div>
                );
              })}
            </div>
          </Surface>

          {/* ── Color & fill ─────────────────────────────────────────── */}
          <Surface padding={20}>
            <div style={{ ...T.h2, fontSize: 14, marginBottom: 12 }}>{t('cd2.color.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label={t('cd2.color.style')}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { id: 'solid', label: t('cd2.color.style.solid') },
                    { id: 'gradient', label: t('cd2.color.style.gradient') },
                  ].map((opt) => {
                    const active = fillStyle === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setFillStyle(opt.id)}
                        style={{
                          flex: 1, padding: '8px 10px', textAlign: 'center', fontSize: 12,
                          border: '1px solid var(--m-line-strong)', borderRadius: 8,
                          background: active ? 'var(--m-brand-soft)' : 'transparent',
                          color: active ? 'var(--m-brand-ink)' : 'var(--m-ink-soft)',
                          fontWeight: active ? 500 : 400, cursor: 'pointer',
                        }}
                      >{opt.label}</div>
                    );
                  })}
                </div>
              </Field>

              <Field label={t('cd2.color.primary')}>
                <ColorPickerRow value={color1} onChange={setColor1}/>
              </Field>

              {fillStyle === 'gradient' && (
                <Field label={t('cd2.color.secondary')}>
                  <ColorPickerRow value={color2} onChange={setColor2}/>
                </Field>
              )}

              <Field label={t('cd2.color.accent')}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ACCENT_PRESETS.map((c) => (
                    <div
                      key={c}
                      onClick={() => setAccent(c)}
                      style={{
                        width: 30, height: 30, background: c, borderRadius: 7,
                        border: c.toLowerCase() === accent.toLowerCase()
                          ? '2px solid var(--m-brand)'
                          : '1px solid var(--m-line-strong)',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </Surface>

          {/* ── Branding ─────────────────────────────────────────────── */}
          <Surface padding={20}>
            <div style={{ ...T.h2, fontSize: 14, marginBottom: 12 }}>{t('cd2.brand.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label={t('cd2.brand.businessName')}>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)}/>
              </Field>
            </div>
          </Surface>

          {error && (
            <div style={{
              padding: '10px 12px', background: 'var(--m-bad-soft)',
              color: 'var(--m-bad)', borderRadius: 9, fontSize: 12.5,
            }}>{error}</div>
          )}
        </div>

        {/* ── Preview ──────────────────────────────────────────────── */}
        <Surface padding={28} style={{
          background: 'linear-gradient(180deg, var(--m-surface-alt) 0%, var(--m-surface) 100%)',
          display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--m-surface)', borderRadius: 8, border: '1px solid var(--m-line)' }}>
            {[
              { id: 'monvo', label: 'Monvo app' },
            ].map((tab) => (
              <div
                key={tab.id}
                onClick={() => setWalletTab(tab.id)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: walletTab === tab.id ? 500 : 400,
                  background: walletTab === tab.id ? 'var(--m-brand-soft)' : 'transparent',
                  borderRadius: 5,
                  color: walletTab === tab.id ? 'var(--m-brand-ink)' : 'var(--m-ink-mute)',
                  cursor: 'pointer',
                }}
              >{tab.label}</div>
            ))}
          </div>

          <div>
            <LoyaltyCardMini
              brand={businessName || user?.business_name || 'Coffee Lab'}
              balance={248}
              bg={previewBg}
              full={false}
              cardUid="DEMO-1234"
              logoUrl={user?.logo_url || ''}
            />
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr', gap: 10, width: '100%', maxWidth: 480,
            marginTop: 16,
          }}>
            <Stat label={t('cd2.color.primary')} status={colorPresetName(color1)}/>
          </div>

          <div style={{
            padding: '12px 16px', background: 'var(--m-warn-soft)', color: 'var(--m-warn)',
            borderRadius: 8, fontSize: 12, lineHeight: 1.5, maxWidth: 480, textAlign: 'center',
          }}>
            {t('cd2.preview.warning')}
          </div>

          {savedAt && !dirty && (
            <div style={{
              padding: '8px 14px', background: 'var(--m-good-soft)', color: 'var(--m-good)',
              borderRadius: 8, fontSize: 12, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <i className="bi bi-check-circle-fill"/>{t('common.save')} · {savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </Surface>
      </div>
    </>
  );
}

function ColorPickerRow({ value, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px',
      border: '1px solid var(--m-line-strong)', borderRadius: 9, background: 'var(--m-surface)',
    }}>
      <label style={{
        position: 'relative', width: 22, height: 22, borderRadius: 6,
        background: value, border: '1px solid rgba(0,0,0,.1)', cursor: 'pointer', flexShrink: 0,
      }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: 'var(--m-mono)', fontSize: 13, color: 'var(--m-ink)',
          background: 'transparent', border: 'none', outline: 'none', flex: 1,
        }}
      />
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--m-ink-mute)', flexShrink: 0 }}>
        {colorPresetName(value)}
      </span>
    </div>
  );
}

function Stat({ label, status }) {
  return (
    <div style={{ textAlign: 'center', padding: 14, background: 'var(--m-surface)', borderRadius: 10, border: '1px solid var(--m-line)' }}>
      <div style={{ fontSize: 11, color: 'var(--m-ink-mute)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--m-good)', marginTop: 4 }}>{status}</div>
    </div>
  );
}
