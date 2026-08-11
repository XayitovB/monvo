import React, { useState, useRef, useEffect } from 'react';
import { I, T, Button, Surface, Badge, Field, Input, EmptyState } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import { useConfirm } from '../hooks/useConfirm';
import { useAlert } from '../hooks/useAlert';
import api from '../api';

function BranchModal({ branch, onClose, onSaved }) {
  const { t } = useLang();
  const isEdit = !!branch;
  const [form, setForm] = useState(branch || { name: '', address: '', phone: '', lat: null, lng: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [geobusy, setGeobusy] = useState(false);
  const [geoerr, setGeoerr] = useState(null);

  function geolocate() {
    if (!navigator.geolocation) { setGeoerr(t('br.map.geo_unsupported')); return; }
    setGeobusy(true); setGeoerr(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = pos.coords.latitude, ln = pos.coords.longitude;
        setForm(f => ({ ...f, lat: la, lng: ln }));
        setShowMap(true);
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&accept-language=uz,ru,en`);
          const d = await r.json();
          if (d?.display_name) setForm(f => ({ ...f, address: f.address || d.display_name }));
        } catch (_) {}
        setGeobusy(false);
      },
      (e) => { setGeoerr(e.message || t('br.map.geo_error')); setGeobusy(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      if (isEdit) await api.updateBranch(branch.id, form);
      else await api.createBranch(form);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--m-surface)', borderRadius: 14, padding: 24, width: 460,
        maxHeight: '90vh', overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ ...T.h2 }}>{isEdit ? t('br.modal.title.edit') : t('br.modal.title.new')}</div>
        <Field label={t('br.modal.name')} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/>
        </Field>
        <Field label={t('br.modal.address')} required>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}/>
        </Field>

        <div style={{ display: 'flex', gap: 6, marginTop: -4, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<I.pin/>}
            onClick={() => setShowMap(s => !s)}
          >{showMap ? t('br.map.hide') : t('br.map.pick')}</Button>
          <Button
            variant="primary"
            size="sm"
            icon={<I.pin/>}
            onClick={geolocate}
            disabled={geobusy}
          >{geobusy ? '...' : t('br.map.my_location')}</Button>
          {form.lat != null && form.lng != null && (
            <span style={{ fontSize: 11, color: 'var(--m-ink-mute)', fontFamily: 'var(--m-mono)' }}>
              {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}
            </span>
          )}
          {geoerr && <span style={{ fontSize: 11, color: 'var(--m-bad)' }}>{geoerr}</span>}
        </div>

        {showMap && (
          <MapPicker
            lat={form.lat}
            lng={form.lng}
            onPick={(lat, lng, addr) => setForm(f => ({
              ...f,
              lat,
              lng,
              address: addr || f.address,
            }))}
          />
        )}

        <Field label={t('br.modal.phone')}>
          <Input icon={<I.phone/>} value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })}/>
        </Field>
        {error && <div style={{ padding: 10, background: 'var(--m-bad-soft)', color: 'var(--m-bad)', borderRadius: 8, fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <Button variant="secondary" full onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" full onClick={save} disabled={saving || !form.name || !form.address}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MapPicker({ lat, lng, onPick }) {
  const { t } = useLang();
  const defaultCenter = [41.2995, 69.2401];
  const mapDivRef = useRef(null);
  const leafletRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [hint, setHint] = useState(lat != null ? null : t('br.map.hint'));

  useEffect(() => {
    function init() {
      if (!mapDivRef.current || leafletRef.current) return;
      const L = window.L;
      const initCenter = (lat != null && lng != null) ? [lat, lng] : defaultCenter;
      const map = L.map(mapDivRef.current, { zoomControl: true }).setView(initCenter, lat != null ? 15 : 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);

      if (lat != null && lng != null) {
        markerRef.current = L.marker([lat, lng]).addTo(map);
      }

      map.on('click', async (e) => {
        const la = e.latlng.lat;
        const ln = e.latlng.lng;
        if (markerRef.current) {
          markerRef.current.setLatLng([la, ln]);
        } else {
          markerRef.current = L.marker([la, ln]).addTo(map);
        }
        setHint(null);
        onPickRef.current(la, ln);
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&accept-language=uz,ru,en`);
          const d = await r.json();
          if (d?.display_name) onPickRef.current(la, ln, d.display_name);
        } catch (_) {}
      });

      leafletRef.current = map;
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (window.L) {
      init();
    } else if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = init;
      document.head.appendChild(script);
    } else {
      const iv = setInterval(() => { if (window.L) { clearInterval(iv); init(); } }, 80);
    }

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!leafletRef.current || lat == null || lng == null) return;
    const L = window.L;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng]).addTo(leafletRef.current);
    }
    leafletRef.current.setView([lat, lng], 15);
    setHint(null);
  }, [lat, lng]);

  return (
    <div style={{ border: '1px solid var(--m-line)', borderRadius: 10, overflow: 'hidden', background: 'var(--m-surface-alt)' }}>
      <div ref={mapDivRef} style={{ width: '100%', height: 260, cursor: 'crosshair' }}/>
      {hint && (
        <div style={{ padding: '6px 10px' }}>
          <span style={{ fontSize: 11.5, color: 'var(--m-ink-mute)' }}>{hint}</span>
        </div>
      )}
    </div>
  );
}

export default function Branches() {
  const { t } = useLang();
  const [askConfirm, confirmModal] = useConfirm();
  const [showAlert, alertModal] = useAlert();
  const { data: branches, reload, loading } = useApi(() => api.branches(), []);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  async function onDelete(id) {
    if (!await askConfirm(t('br.confirmDelete'), { danger: true })) return;
    try {
      await api.deleteBranch(id);
      reload();
    } catch (e) {
      showAlert(e.message);
    }
  }

  const list = Array.isArray(branches) ? branches : [];

  return (
    <>
      {confirmModal}
      {alertModal}
      <Topbar
        title={t('br.title')}
        subtitle={t('br.subtitle', { n: list.length })}
        actions={<Button variant="primary" icon={<I.plus/>} onClick={() => setShowAdd(true)}>{t('br.add')}</Button>}
      />

      <div style={{ padding: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('common.loading')}</div>}
          {!loading && list.length === 0 && (
            <Surface padding={0}>
              <EmptyState
                title={t('br.empty.title')}
                sub={t('br.empty.sub')}
                action={<Button variant="primary" icon={<I.plus/>} onClick={() => setShowAdd(true)}>{t('br.add')}</Button>}
              />
            </Surface>
          )}
          {list.map((b) => (
            <Surface key={b.id} padding={20} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12,
                background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <I.branch size={26}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--m-ink)' }}>{b.name}</span>
                  <Badge tone="good" dot>{t('common.active')}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--m-ink-mute)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {b.address && <span><I.pin size={11} style={{ marginRight: 4, verticalAlign: '-1px' }}/>{b.address}</span>}
                  {b.phone && <span><I.phone size={11} style={{ marginRight: 4, verticalAlign: '-1px' }}/>{b.phone}</span>}
                  {b.staff_count != null && <span><I.staff size={11} style={{ marginRight: 4, verticalAlign: '-1px' }}/>{t('br.col.staff', { n: b.staff_count })}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 28 }}>
                {b.transactions_today != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--m-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('br.col.txnToday')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--m-mono)' }}>{b.transactions_today}</div>
                  </div>
                )}
                {b.revenue_today != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--m-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('br.col.revenueToday')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--m-mono)' }}>{Number(b.revenue_today).toLocaleString('ru-RU')} сум</div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditing(b)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--m-ink-mute)', padding: 6 }}
              ><I.cog size={16}/></button>
              <button
                onClick={() => onDelete(b.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--m-bad)', padding: 6 }}
              ><I.x size={16}/></button>
            </Surface>
          ))}
        </div>

      </div>

      {showAdd && <BranchModal onClose={() => setShowAdd(false)} onSaved={reload}/>}
      {editing && <BranchModal branch={editing} onClose={() => setEditing(null)} onSaved={reload}/>}
    </>
  );
}
