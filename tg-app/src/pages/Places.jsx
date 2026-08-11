// Places tab — full-bleed map of merchant branches with logo markers and a
// slide-up selected-branch card (mirrors Flutter places_map_screen.dart).
// Mapbox isn't available in the web mini-app, so we render Leaflet with a
// Carto basemap but keep the same marker + bottom-card interaction.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme, useT } from '../store'
import { api } from '../api'
import { AppBar, Button, IconBtn, Icon, Spinner } from '../ui'
import { hexA, FONT } from '../theme'
import { haptic, openLink } from '../tg'

const TASHKENT = [41.2995, 69.2401]

function brandOf(b, fallback) {
  const c = (b.brand_color || '').trim()
  return /^#[0-9A-Fa-f]{6}$/.test(c) ? c : fallback
}

function markerHtml(b, color) {
  const logo = b.merchant_logo
  const inner = logo
    ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:9px" onerror="this.style.display='none'"/>`
    : `<span style="color:#fff;font-weight:800;font-size:16px;font-family:${FONT}">${(b.merchant_name || '?')[0].toUpperCase()}</span>`
  const bg = logo ? '#fff' : color
  return `<div style="width:40px;height:40px;border-radius:12px;background:${bg};
    border:3px solid ${color};box-shadow:0 3px 8px rgba(0,0,0,0.35);
    display:flex;align-items:center;justify-content:center;overflow:hidden">${inner}</div>`
}

export default function Places() {
  const t = useTheme()
  const tr = useT()
  const mapDiv = useRef(null)
  const mapRef = useRef(null)
  const userMarker = useRef(null)
  const [branches, setBranches] = useState(null)
  const [err, setErr] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    api.getDiscoverBranches()
      .then(b => setBranches(Array.isArray(b) ? b : []))
      .catch(e => setErr(e.message))
  }, [])

  // Init map once branches are loaded.
  useEffect(() => {
    if (!branches || !mapDiv.current || mapRef.current) return
    const map = L.map(mapDiv.current, { zoomControl: false, attributionControl: false })
      .setView(TASHKENT, 12)
    L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${t.isDark ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png`,
      { maxZoom: 19 },
    ).addTo(map)
    map.on('click', () => setSelected(null))

    const pts = []
    branches.filter(b => b.lat && b.lng).forEach(b => {
      const color = brandOf(b, t.accent)
      const icon = L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 20], html: markerHtml(b, color) })
      const m = L.marker([b.lat, b.lng], { icon }).addTo(map)
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); haptic('light'); setSelected(b); map.flyTo([b.lat, b.lng], 15, { duration: 0.6 }) })
      pts.push([b.lat, b.lng])
    })
    if (pts.length > 1) map.fitBounds(pts, { padding: [60, 60] })
    else if (pts.length === 1) map.setView(pts[0], 14)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [branches, t])

  function locate() {
    haptic('light')
    if (!navigator.geolocation || !mapRef.current) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = [pos.coords.latitude, pos.coords.longitude]
        const map = mapRef.current
        if (userMarker.current) userMarker.current.remove()
        userMarker.current = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#1E88FF', fillOpacity: 1 }).addTo(map)
        map.flyTo(ll, 14, { duration: 0.6 })
      },
      () => {}, { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div style={{ height: 'calc(100dvh - 84px)', display: 'flex', flexDirection: 'column', background: t.paper, fontFamily: FONT }}>
      <AppBar title={tr('mapTitle')}
        subtitle={branches == null ? null : branches.length ? `${branches.length} ${tr('placesOnMap')}` : tr('partners')} />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={mapDiv} style={{ position: 'absolute', inset: 0 }} />

        {branches == null && !err ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: hexA(t.paper, 0.6) }}>
            <Spinner /><div style={{ marginTop: 12, fontSize: 13, color: t.inkSoft }}>{tr('loading')}</div>
          </div>
        ) : null}

        {err ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: t.paperRaised, border: `1px solid ${t.line}`, borderRadius: 16, padding: 20, textAlign: 'center' }}>
              <Icon name="cloud-off" size={32} color={t.inkMute} />
              <div style={{ fontSize: 14, fontWeight: 600, color: t.ink, marginTop: 10 }}>{tr('loadFailed')}</div>
              <div style={{ fontSize: 12, color: t.inkMute, marginTop: 4 }}>{err}</div>
            </div>
          </div>
        ) : null}

        {/* Location FAB */}
        {!selected ? (
          <button onClick={locate} style={{
            position: 'absolute', right: 16, bottom: 16, width: 48, height: 48, borderRadius: '50%',
            background: t.paperRaised, border: `1px solid ${t.line}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 500,
          }}>
            <Icon name="nav" size={22} color={t.inkSoft} />
          </button>
        ) : null}

        {/* Selected branch card */}
        {selected ? <SelectedCard b={selected} onClose={() => setSelected(null)} /> : null}
      </div>
    </div>
  )
}

function SelectedCard({ b, onClose }) {
  const t = useTheme()
  const tr = useT()
  const color = brandOf(b, t.accent)
  const title = b.branch_name || b.merchant_name
  const showMerchant = b.branch_name && b.merchant_name && b.merchant_name !== b.branch_name

  function openMaps() {
    haptic('light')
    openLink(`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`)
  }

  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 600,
      background: t.paperRaised, borderRadius: 18, border: `1px solid ${t.line}`,
      padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', animation: 'slideUp 0.22s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: 'hidden', background: hexA(color, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {b.merchant_logo
            ? <img src={b.merchant_logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
            : <Icon name="store" size={20} color={color} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {showMerchant ? <div style={{ fontSize: 12, color: t.inkMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.merchant_name}</div> : null}
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
          <Icon name="close" size={20} color={t.inkMute} />
        </button>
      </div>

      {b.address ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <Icon name="nav" size={15} color={t.inkMute} />
          <span style={{ fontSize: 13, color: t.inkSoft, lineHeight: 1.35 }}>{b.address}</span>
        </div>
      ) : null}
      {b.working_hours ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
          <Icon name="history" size={15} color={t.inkMute} />
          <span style={{ fontSize: 13, color: t.inkSoft }}>{b.working_hours}</span>
        </div>
      ) : null}

      {Array.isArray(b.photos) && b.photos.length ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto' }}>
          {b.photos.map((p, i) => (
            <img key={i} src={p} alt="" style={{ width: 120, height: 88, flexShrink: 0, borderRadius: 10, objectFit: 'cover' }} />
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" onClick={openMaps}>{tr('openMap')}</Button>
        {b.phone ? <IconBtn onClick={() => openLink(`tel:${b.phone}`)}><Icon name="phone" size={18} /></IconBtn> : null}
      </div>
    </div>
  )
}
