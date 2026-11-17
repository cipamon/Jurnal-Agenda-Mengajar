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

export async function dataUrlToPngBase64(dataUrl: string, targetSize = 180): Promise<string | null> {
  if (!dataUrl) return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
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
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}
