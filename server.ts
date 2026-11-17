import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, '.data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sanitizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._-]/g, '_') || 'default';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'Portal E-Guru v10.2', timestamp: new Date().toISOString() });
  });

  // Server-side workspace persistence (optional full-stack sync)
  app.post('/api/sync/save', (req, res) => {
    try {
      ensureDataDir();
      const { email, data } = req.body as { email?: string; data?: unknown };
      if (!data || typeof data !== 'object') {
        res.status(400).json({ ok: false, error: 'Payload data tidak valid.' });
        return;
      }
      const key = sanitizeKey(email || 'guru_default');
      const target = path.join(DATA_DIR, `${key}.json`);
      fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf-8');
      res.json({ ok: true, savedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Gagal menyimpan data di server.' });
    }
  });

  app.get('/api/sync/load', (req, res) => {
    try {
      ensureDataDir();
      const email = String(req.query.email || 'guru_default');
      const key = sanitizeKey(email);
      const target = path.join(DATA_DIR, `${key}.json`);
      if (!fs.existsSync(target)) {
        res.json({ ok: true, found: false, data: null });
        return;
      }
      const raw = fs.readFileSync(target, 'utf-8');
      res.json({ ok: true, found: true, data: JSON.parse(raw) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Gagal memuat data dari server.' });
    }
  });

  // Optional Google Sheets Apps Script Web App proxy to avoid browser CORS blocks
  app.post('/api/sync/sheets', async (req, res) => {
    try {
      const { webAppUrl, payload } = req.body as { webAppUrl?: string; payload?: unknown };
      if (!webAppUrl || !/^https:\/\/script\.google\.com\//i.test(webAppUrl.trim())) {
        res.status(400).json({
          ok: false,
          error: 'URL Web App Google Sheets harus diawali dengan https://script.google.com/...',
        });
        return;
      }

      const response = await fetch(webAppUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });

      const text = await response.text();
      if (!response.ok) {
        res.status(502).json({
          ok: false,
          error: `Google Sheets merespons status ${response.status}`,
          details: text.slice(0, 300),
        });
        return;
      }

      res.json({ ok: true, syncedAt: new Date().toISOString(), responseText: text.slice(0, 300) });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal menghubungi Google Sheets Web App.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Portal E-Guru v10.2 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
