// routes/api/ttsAlert.js
// POST /dashboard/api/tts/alert
// Synthesizes a short alert message via Kokoro (free tier) and returns the audio URL.
// Used by the alert box widget for TTS on follow/sub/raid/tip events.

import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import requireAuth from '../../utils/requireAuth.js';

const router = express.Router();

const KOKORO_BIN    = process.env.KOKORO_BIN    || '/home/sardwyn/tts/venv/bin/python3';
const KOKORO_SCRIPT = process.env.KOKORO_SCRIPT || '/home/sardwyn/tts/kokoro_tts.py';
const UPLOADS_DIR   = process.env.SCRAPLET_UPLOADS_DIR || '/var/www/scraplet-uploads';
const TTS_DIR       = path.join(UPLOADS_DIR, 'tts');
const PUBLIC_PREFIX = '/uploads';

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function runKokoro(text, outPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(KOKORO_BIN, [KOKORO_SCRIPT, outPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, KOKORO_VOICE: 'af_sarah' },
    });
    let stderr = '';
    child.stderr.on('data', d => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`kokoro exited ${code}: ${stderr.slice(-200)}`));
      resolve();
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

router.post('/dashboard/api/tts/alert', requireAuth, express.json(), async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ ok: false, error: 'text required' });

    const safeText = text.slice(0, 200).replace(/[<>]/g, '');
    const hash = crypto.createHash('sha1').update(safeText).digest('hex').slice(0, 12);
    const filename = `alert_${hash}.wav`;

    ensureDir(TTS_DIR);
    const outPath = path.join(TTS_DIR, filename);
    const audioUrl = `${PUBLIC_PREFIX}/tts/${filename}`;

    // Use cached file if it exists (same text = same hash)
    if (!fs.existsSync(outPath)) {
      await runKokoro(safeText, outPath);
    }

    const stat = fs.statSync(outPath);
    if (stat.size < 100) {
      fs.unlinkSync(outPath);
      return res.status(500).json({ ok: false, error: 'TTS produced empty audio' });
    }

    return res.json({ ok: true, url: audioUrl });
  } catch (err) {
    console.error('[tts/alert] error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
