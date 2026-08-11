import React from 'react';
import { T } from './Icon';

export const Sparkline = ({ data, w = 120, h = 36, color = 'var(--m-brand)', filled = true }) => {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
  const fillPath = path + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {filled && <path d={fillPath} fill={color} fillOpacity={0.1}/>}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

export const BarChart = ({ data, w = 600, h = 180, color = 'var(--m-brand)', labels = [] }) => {
  const max = Math.max(...data) || 1;
  const bw = w / data.length * 0.6;
  const gap = w / data.length * 0.4;
  return (
    <svg width={w} height={h + 22} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * h;
        const x = i * (bw + gap) + gap / 2;
        return (
          <g key={i}>
            <rect x={x} y={h - bh} width={bw} height={bh} fill={color} rx={3}/>
            {labels[i] && <text x={x + bw / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="var(--m-ink-mute)" fontFamily="var(--m-sans)">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
};

export const LineChart = ({ series, w = 800, h = 220, labels = [] }) => {
  const all = series.flatMap(s => s.data);
  const min = Math.min(0, ...all);
  const max = Math.max(...all) * 1.1;
  const range = max - min || 1;
  const innerW = w - 40, innerH = h - 30;
  const step = innerW / (series[0].data.length - 1);
  const yT = (v) => 10 + innerH - ((v - min) / range) * innerH;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(p => 10 + innerH * (1 - p));
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {grid.map((y, i) => (
        <line key={i} x1={36} y1={y} x2={w - 4} y2={y} stroke="var(--m-line)" strokeDasharray={i === grid.length - 1 ? '0' : '3 4'}/>
      ))}
      {grid.map((y, i) => {
        const v = max - (max - min) * (i / (grid.length - 1));
        return <text key={i} x={4} y={y + 3} fontSize="10" fill="var(--m-ink-mute)" fontFamily="var(--m-mono)">{Math.round(v)}</text>;
      })}
      {(() => {
        // Toopa-toq labellarni siyraklatamiz — 30 kun bo'lsa har 5-tasini
        // ko'rsatamiz, 14 kun bo'lsa har 2-tasini, kam bo'lsa hammasini.
        const maxLabels = 7;
        const stride = Math.max(1, Math.ceil(labels.length / maxLabels));
        return labels.map((lbl, i) => {
          if (i % stride !== 0 && i !== labels.length - 1) return null;
          return (
            <text key={i} x={36 + i * step} y={h - 6} fontSize="10" fill="var(--m-ink-mute)" textAnchor="middle">{lbl}</text>
          );
        });
      })()}
      {series.map((s, si) => {
        const path = s.data.map((v, i) => (i === 0 ? 'M' : 'L') + (36 + i * step) + ' ' + yT(v)).join(' ');
        const fill = path + ` L ${36 + (s.data.length - 1) * step} ${10 + innerH} L 36 ${10 + innerH} Z`;
        return (
          <g key={si}>
            {s.fill && <path d={fill} fill={s.color} fillOpacity={0.08}/>}
            <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </g>
        );
      })}
    </svg>
  );
};

export const Donut = ({ segments, size = 140, thickness = 22, label, sub }) => {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--m-line)" strokeWidth={thickness}/>
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} strokeLinecap="butt"/>
          );
          off += len;
          return el;
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--m-mono)' }}>{label}</div>
        {sub && <div style={{ ...T.meta }}>{sub}</div>}
      </div>
    </div>
  );
};

export const RuMap = ({ pins = [] }) => (
  <svg viewBox="0 0 600 280" width="100%" style={{ display: 'block' }}>
    <rect width="600" height="280" fill="var(--m-surface-alt)" rx="10"/>
    <path d="M40 130 Q 80 90, 160 110 Q 240 80, 340 100 Q 460 80, 560 130 Q 540 200, 420 220 Q 300 210, 200 230 Q 120 220, 60 200 Z"
      fill="var(--m-line)" stroke="var(--m-line-strong)" strokeWidth="1"/>
    <path d="M200 200 Q 240 220, 290 215 Q 320 240, 280 250 Q 230 250, 200 230 Z"
      fill="var(--m-line)" stroke="var(--m-line-strong)" strokeWidth="1"/>
    {pins.map((p, i) => (
      <g key={i} transform={`translate(${p.x} ${p.y})`}>
        <circle r="14" fill="var(--m-brand)" opacity="0.18"/>
        <circle r="6" fill="var(--m-brand)"/>
        <circle r="2.5" fill="#fff"/>
        <text x="10" y="4" fontSize="10" fill="var(--m-ink)" fontFamily="var(--m-sans)" fontWeight="500">{p.label}</text>
      </g>
    ))}
  </svg>
);
