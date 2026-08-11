import React from 'react';

export const Icon = ({ d, size = 18, stroke = 1.6, fill = 'none', style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
       stroke="currentColor" strokeWidth={stroke}
       strokeLinecap="round" strokeLinejoin="round" style={style}>
    {typeof d === 'string' ? <path d={d}/> : d}
  </svg>
);

export const I = {
  home:        (p) => <Icon {...p} d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>,
  card:        (p) => <Icon {...p} d="M2 7h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 11h20"/>,
  qr:          (p) => <Icon {...p} d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3z"/>,
  users:       (p) => <Icon {...p} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 3.13a4 4 0 0 1 0 7.75"/>,
  receipt:     (p) => <Icon {...p} d="M5 2v20l3-2 3 2 3-2 3 2 3-2V2zM8 7h8M8 11h8M8 15h5"/>,
  gift:        (p) => <Icon {...p} d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7"/>,
  sparkles:    (p) => <Icon {...p} d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 14l.95 2.3 2.3.95-2.3.95L19 20.5l-.95-2.3-2.3-.95 2.3-.95z"/>,
  megaphone:   (p) => <Icon {...p} d="M3 11v2a2 2 0 0 0 2 2h1l3 6h2l-1-6h2l8 4V5l-8 4H5a2 2 0 0 0-2 2"/>,
  bell:        (p) => <Icon {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>,
  chart:       (p) => <Icon {...p} d="M3 3v18h18M7 14l4-4 4 4 5-7"/>,
  pin:         (p) => <Icon {...p} d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z M12 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4"/>,
  staff:       (p) => <Icon {...p} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 8v6M18 11h6"/>,
  star:        (p) => <Icon {...p} d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z"/>,
  brush:       (p) => <Icon {...p} d="M9.06 11.94L4 17l3 3 5.06-5.06M14 4l6 6-9 9-3-3 9-9M14 4l3-2 3 3-2 3"/>,
  wallet:      (p) => <Icon {...p} d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M16 12h6v4h-6a2 2 0 0 1 0-4z"/>,
  cog:         (p) => <Icon {...p} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09c0 .66.39 1.26 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.25.61.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>,
  search:      (p) => <Icon {...p} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.35-4.35"/>,
  plus:        (p) => <Icon {...p} d="M12 5v14M5 12h14"/>,
  edit:        (p) => <Icon {...p} d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>,
  filter:      (p) => <Icon {...p} d="M3 4h18l-7 9v6l-4 2v-8z"/>,
  download:    (p) => <Icon {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>,
  upload:      (p) => <Icon {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>,
  arrowR:      (p) => <Icon {...p} d="M5 12h14M13 5l7 7-7 7"/>,
  arrowU:      (p) => <Icon {...p} d="M12 19V5M5 12l7-7 7 7"/>,
  arrowD:      (p) => <Icon {...p} d="M12 5v14M5 12l7 7 7-7"/>,
  check:       (p) => <Icon {...p} d="M20 6L9 17l-5-5"/>,
  x:           (p) => <Icon {...p} d="M18 6L6 18M6 6l12 12"/>,
  eye:         (p) => <Icon {...p} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>,
  more:        (p) => <Icon {...p} d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/>,
  calendar:    (p) => <Icon {...p} d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4"/>,
  phone:       (p) => <Icon {...p} d="M22 16.92V20a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3.08a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.37a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72a2 2 0 0 1 1.72 2.03"/>,
  mail:        (p) => <Icon {...p} d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM2 6l10 7 10-7"/>,
  tag:         (p) => <Icon {...p} d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82M7 7h.01"/>,
  trophy:      (p) => <Icon {...p} d="M6 9H4.5a2.5 2.5 0 1 1 0-5H6M18 9h1.5a2.5 2.5 0 1 0 0-5H18M4 22h16M10 14.66V17a2 2 0 0 0-1 1.73 .5.5 0 0 0 .5.27h5a.5.5 0 0 0 .5-.27A2 2 0 0 0 14 17v-2.34M18 2H6v7a6 6 0 0 0 12 0z"/>,
  zap:         (p) => <Icon {...p} d="M13 2L3 14h9l-1 8 10-12h-9z"/>,
  link:        (p) => <Icon {...p} d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>,
  copy:        (p) => <Icon {...p} d="M9 2h11a2 2 0 0 1 2 2v11M5 6H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5z"/>,
  refresh:     (p) => <Icon {...p} d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>,
  branch:      (p) => <Icon {...p} d="M3 21h18M5 21V8l7-5 7 5v13M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-5h4v5"/>,
  user:        (p) => <Icon {...p} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>,
  lock:        (p) => <Icon {...p} d="M5 11h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4"/>,
  logout:      (p) => <Icon {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>,
};

export const T = {
  display:  { fontSize: 26, fontWeight: 600, letterSpacing: -0.4, color: 'var(--m-ink)', lineHeight: 1.15 },
  // Italic serif callout — matches Monvo mobile mockup ("Coffee Lab · 4 filiala")
  displayItalic: {
    fontFamily: 'var(--m-display)', fontStyle: 'italic',
    fontSize: 28, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1.1,
    color: 'var(--m-ink)',
  },
  h1:       { fontSize: 22, fontWeight: 600, letterSpacing: -0.3, color: 'var(--m-ink)', lineHeight: 1.2 },
  h2:       { fontSize: 17, fontWeight: 600, letterSpacing: -0.2, color: 'var(--m-ink)', lineHeight: 1.3 },
  body:     { fontSize: 13, color: 'var(--m-ink-soft)', lineHeight: 1.45 },
  bodyL:    { fontSize: 14, color: 'var(--m-ink-soft)', lineHeight: 1.45 },
  meta:     { fontSize: 12, color: 'var(--m-ink-mute)', letterSpacing: 0.1 },
  micro:    { fontSize: 11, color: 'var(--m-ink-mute)', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 500 },
  mono:     { fontFamily: 'var(--m-mono)', fontFeatureSettings: '"tnum"' },
};
