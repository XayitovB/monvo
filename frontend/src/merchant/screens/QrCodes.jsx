import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { I, T, Button, Surface } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useAuth } from '../auth/AuthContext';
import posterSrc from '../../assets/qr-poster-v1.png';

// Poster (v1.png) ichidagi oq kvadratga QR joylashuvi (rasm o'lchamiga nisbatan %).
// Oq kvadrat: left 9.6% top 42.6% 52.3%×35.1% → markaz (35.7%, 60.2%).
// QR ~1200px (oq kvadratni deyarli to'liq to'ldiradi, ~50px margin).
const QR_BOX = { leftPct: 0.115, topPct: 0.431, sizePctW: 0.484 };

export default function QrCodes() {
  const { t, lang } = useLang();
  const { user } = useAuth();

  // QR oddiy https havola — har qanday telefon kamerasi ocha oladi.
  // Skanerlanda → smart-link sahifa (/j/<id>): platformani aniqlaydi va
  //   • Monvo o'rnatilgan bo'lsa → ilova ochilib shu biznes kartasi qo'shiladi
  //   • o'rnatilmagan bo'lsa → App Store / Play Market'ga o'tkazadi.
  const url = useMemo(() => {
    const id = user?.id;
    return id ? `${window.location.origin}/j/${id}` : '';
  }, [user]);

  // Fixed style — foydalanuvchi tahrirlay olmaydi
  const fg = '#0F1115';
  const bg = '#FFFFFF';
  const size = 512;
  const margin = 2;
  const ec = 'M';
  const [pngDataUrl, setPngDataUrl] = useState('');
  const [svgString, setSvgString] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!url) {
      setPngDataUrl('');
      setSvgString('');
      return;
    }
    let alive = true;
    const opts = {
      errorCorrectionLevel: ec,
      margin,
      width: size,
      color: { dark: fg, light: bg },
    };
    QRCode.toDataURL(url, opts).then((d) => { if (alive) setPngDataUrl(d); }).catch(() => {});
    QRCode.toString(url, { ...opts, type: 'svg' }).then((svg) => { if (alive) setSvgString(svg); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);

  function downloadBlob(blob, filename) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 0);
  }

  async function downloadPng() {
    const blob = await (await fetch(pngDataUrl)).blob();
    downloadBlob(blob, `monvo-qr-${Date.now()}.png`);
  }

  function downloadSvg() {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    downloadBlob(blob, `monvo-qr-${Date.now()}.svg`);
  }

  async function downloadJpg() {
    const img = new Image();
    img.src = pngDataUrl;
    await new Promise((r) => { img.onload = r; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
    downloadBlob(blob, `monvo-qr-${Date.now()}.jpg`);
  }

  function downloadPdf() {
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const qrSize = 120;
    const x = (pageW - qrSize) / 2;
    const y = (pageH - qrSize) / 2 - 10;
    pdf.setFillColor(bg);
    pdf.rect(0, 0, pageW, pageH, 'F');
    pdf.addImage(pngDataUrl, 'PNG', x, y, qrSize, qrSize);
    pdf.setTextColor('#0F1115');
    pdf.setFontSize(11);
    pdf.text('Skaner qiling — Telegram orqali bonus kartaga qo\'shiling', pageW / 2, y + qrSize + 16, { align: 'center' });
    pdf.save(`monvo-qr-${Date.now()}.pdf`);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Poster (v1.png) + QR ni oq kvadratga joylab, bosma sifatли PNG yuklaydi.
  async function downloadPoster() {
    if (!pngDataUrl) return;
    const [poster, qr] = await Promise.all([loadImage(posterSrc), loadImage(pngDataUrl)]);
    const canvas = document.createElement('canvas');
    canvas.width = poster.naturalWidth;   // 2480
    canvas.height = poster.naturalHeight; // 3508
    const ctx = canvas.getContext('2d');
    ctx.drawImage(poster, 0, 0);
    const qrSize = canvas.width * QR_BOX.sizePctW;
    ctx.drawImage(qr, canvas.width * QR_BOX.leftPct, canvas.height * QR_BOX.topPct, qrSize, qrSize);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    downloadBlob(blob, `monvo-plakat-${Date.now()}.png`);
  }

  async function copyImg() {
    try {
      const blob = await (await fetch(pngDataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied('img');
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  }

  return (
    <>
      <Topbar title={t('qr.title')} subtitle={t('qr.subtitle')}/>

      <div style={{ padding: 28, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18,
          maxWidth: 760, width: '100%',
        }}>
          <Surface padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ ...T.h2, alignSelf: 'flex-start' }}>{t('qr.preview')}</div>
            <div style={{
              position: 'relative', width: '100%', maxWidth: 300,
              borderRadius: 12, overflow: 'hidden', border: '1px solid var(--m-line)',
            }}>
              <img src={posterSrc} alt="Poster" style={{ width: '100%', display: 'block' }}/>
              {pngDataUrl && (
                <img src={pngDataUrl} alt="QR" style={{
                  position: 'absolute',
                  left: `${QR_BOX.leftPct * 100}%`,
                  top: `${QR_BOX.topPct * 100}%`,
                  width: `${QR_BOX.sizePctW * 100}%`,
                }}/>
              )}
            </div>
          </Surface>

          <Surface padding={20}>
            <div style={{ ...T.h2, marginBottom: 12 }}>{t('qr.download.title')}</div>
            <Button variant="primary" full icon={<I.download/>} onClick={downloadPoster} disabled={!pngDataUrl} style={{ marginBottom: 8 }}>
              {lang === 'ru' ? 'Скачать плакат (PNG)' : 'Plakatni yuklab olish (PNG)'}
            </Button>
            <Button variant="secondary" full icon={<I.download/>} onClick={downloadPng} disabled={!pngDataUrl}>
              {lang === 'ru' ? 'Скачать QR-код (PNG)' : 'QR kodni yuklab olish (PNG)'}
            </Button>
            <div style={{ height: 1, background: 'var(--m-line)', margin: '14px 0' }}/>
            <Button variant="ghost" full icon={<I.copy/>} onClick={copyImg} disabled={!pngDataUrl}>
              {copied === 'img' ? t('qr.copied') : t('qr.download.copyImg')}
            </Button>
          </Surface>
        </div>
      </div>
    </>
  );
}
