// Crisp official SVG emblems encoded as Data URLs (zero external network dependencies)
// and helper to rasterize any image URL/DataURL (including SVG or uploaded PNG/JPG) into PNG for jsPDF.

export const DEFAULT_LEFT_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <path d="M60 8 L104 24 V60 C104 88 82 106 60 114 C38 106 16 88 16 60 V24 Z" fill="url(#shieldGrad)" stroke="#d97706" stroke-width="4"/>
  <path d="M60 18 L94 31 V59 C94 81 76 96 60 103 C44 96 26 81 26 59 V31 Z" fill="none" stroke="#f59e0b" stroke-width="1.5" opacity="0.7"/>
  <polygon points="60,26 64,38 76,38 66,45 70,57 60,49 50,57 54,45 44,38 56,38" fill="#fbbf24"/>
  <path d="M38 66 Q60 58 82 66 V80 Q60 72 38 80 Z" fill="#ffffff" opacity="0.95"/>
  <line x1="60" y1="62" x2="60" y2="76" stroke="#1e293b" stroke-width="2"/>
  <text x="60" y="95" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#fbbf24">DINAS PENDIDIKAN</text>
</svg>`);

export const DEFAULT_RIGHT_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="52" fill="#312e81" stroke="#4f46e5" stroke-width="4"/>
  <circle cx="60" cy="60" r="44" fill="none" stroke="#c7d2fe" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="M34 52 L60 38 L86 52 L60 66 Z" fill="#ffffff"/>
  <path d="M44 58 V74 C44 80 76 80 76 74 V58 L60 67 Z" fill="#e0e7ff"/>
  <line x1="86" y1="52" x2="86" y2="74" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
  <circle cx="86" cy="76" r="3.5" fill="#fbbf24"/>
  <text x="60" y="94" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#ffffff">SMAN 1</text>
</svg>`);

export const DEFAULT_SCHOOL_STAMP =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <circle cx="80" cy="80" r="72" fill="none" stroke="#1d4ed8" stroke-width="3.5" opacity="0.88"/>
  <circle cx="80" cy="80" r="65" fill="none" stroke="#1d4ed8" stroke-width="1.2" opacity="0.82"/>
  <circle cx="80" cy="80" r="44" fill="none" stroke="#1d4ed8" stroke-width="1.8" opacity="0.85"/>
  <defs>
    <path id="topArc" d="M 24,80 A 56,56 0 1,1 136,80" />
    <path id="botArc" d="M 136,86 A 56,56 0 1,1 24,86" />
  </defs>
  <text font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2" opacity="0.9">
    <textPath href="#topArc" startOffset="50%" text-anchor="middle">PEMERINTAH PROVINSI · DINAS PENDIDIKAN</textPath>
  </text>
  <text font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1" opacity="0.9">
    <textPath href="#botArc" startOffset="50%" text-anchor="middle">SMAN 1 NUSANTARA</textPath>
  </text>
  <polygon points="80,50 84,61 96,61 86,68 90,79 80,72 70,79 74,68 64,61 76,61" fill="none" stroke="#1d4ed8" stroke-width="1.8" opacity="0.88"/>
  <line x1="44" y1="88" x2="116" y2="88" stroke="#1d4ed8" stroke-width="1.4" opacity="0.85"/>
  <text x="80" y="102" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#1d4ed8" opacity="0.9">SEKOLAH</text>
  <line x1="50" y1="107" x2="110" y2="107" stroke="#1d4ed8" stroke-width="1.2" opacity="0.8"/>
</svg>`);

export const DEFAULT_PRINCIPAL_TTD =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90">
  <path d="M22 62 C36 22, 54 18, 52 54 C50 74, 72 32, 86 24 C96 18, 84 64, 98 58 C114 52, 126 30, 144 38 C156 44, 150 58, 174 52 C188 48, 198 44, 206 42" fill="none" stroke="#0f172a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M36 74 C84 66, 136 64, 192 70" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
</svg>`);

export const DEFAULT_TEACHER_TTD =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90">
  <path d="M28 56 C40 16, 66 16, 60 54 C56 70, 80 34, 96 42 C108 48, 114 26, 128 32 C142 38, 134 62, 154 52 C170 44, 186 36, 202 30" fill="none" stroke="#1e293b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M44 68 C94 62, 146 60, 188 64" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round"/>
</svg>`);

import { normalizePhotoUrl } from './defaultAvatars';

export async function dataUrlToPngBase64(dataUrl: string, targetSize = 180): Promise<string | null> {
  const srcUrl = normalizePhotoUrl(dataUrl) || dataUrl;
  if (!srcUrl) return null;

  const renderImgToPng = (src: string, withCors: boolean) =>
    new Promise<string | null>((resolve) => {
      try {
        const img = new Image();
        if (withCors && !src.startsWith('data:') && !src.startsWith('/')) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ratio = img.width && img.height ? img.width / img.height : 1;
            canvas.width = targetSize;
            canvas.height = Math.round(targetSize / ratio) || targetSize;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      } catch {
        resolve(null);
      }
    });

  const direct = await renderImgToPng(srcUrl, true);
  if (direct) return direct;

  if (!srcUrl.startsWith('data:')) {
    try {
      const resp = await fetch(srcUrl, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        const localDataUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (localDataUrl) {
          return await renderImgToPng(localDataUrl, false);
        }
      }
    } catch {
      // External host disallows CORS canvas extraction
    }
  }

  return null;
}
