import React from 'react';

const base = (children, p) => (
  <svg
    width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24"
    fill={p.fill || 'none'} stroke={p.stroke || 'currentColor'}
    strokeWidth={p.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round"
    style={p.style}
  >
    {children}
  </svg>
);

export const KIcon = {
  arrow: (p = {}) => base(<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>, p),
  check: (p = {}) => base(<polyline points="20 6 9 17 4 12"/>, { strokeWidth: 2.5, ...p }),
  star: (p = {}) => base(
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>,
    { fill: 'currentColor', stroke: 'none', ...p }
  ),
  plus: (p = {}) => base(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>, p),
  qr: (p = {}) => base(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <line x1="14" y1="14" x2="21" y2="14"/>
      <line x1="14" y1="18" x2="18" y2="18"/>
      <line x1="14" y1="21" x2="21" y2="21"/>
      <line x1="18" y1="14" x2="18" y2="21"/>
    </>, p
  ),
  zap: (p = {}) => base(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/>, { fill: 'currentColor', stroke: 'none', ...p }),
  chart: (p = {}) => base(<><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></>, p),
  users: (p = {}) => base(
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </>, p
  ),
  gift: (p = {}) => base(
    <>
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </>, p
  ),
  bell: (p = {}) => base(
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </>, p
  ),
  lock: (p = {}) => base(
    <>
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </>, p
  ),
  layers: (p = {}) => base(
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </>, p
  ),
  branch: (p = {}) => base(
    <>
      <path d="M3 21h18"/>
      <path d="M5 21V7l7-4 7 4v14"/>
      <path d="M9 9h2v2H9z M13 9h2v2h-2z M9 13h2v2H9z M13 13h2v2h-2z"/>
    </>, p
  ),
  sun: (p = {}) => base(
    <>
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41"/>
    </>, p
  ),
  moon: (p = {}) => base(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>, p),
};
