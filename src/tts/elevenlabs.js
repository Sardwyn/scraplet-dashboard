// src/tts/elevenlabs.js
// ElevenLabs TTS adapter — synthesises text to WAV via ElevenLabs API.
// Converts MP3 response to WAV using ffmpeg.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const API_BASE = 'https://api.elevenlabs.io/v1';

// Voice list cache (24h)
let voiceCache = null;
let voiceCacheAt = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Fetch available ElevenLabs voices (cached 24h).
 */
export async function getVoices() {
  if (voiceCache && Date.now() - voiceCacheAt < CACHE_TTL) return voiceCache;
  try {
    const resp = await fetch(`${API_BASE}/voices`, {
      headers: { 'xi-api-key': API_KEY },
    });
    const data = await resp.json();
    voiceCache = data.voices || [];
    voiceCacheAt = Date.now();
    return voiceCache;
  } catch {
    return voiceCache || [];
  }
}

/**
 * Synthesise text using ElevenLabs and write WAV to outPath.
 * @param {string} elevenlabsVoiceId - ElevenLabs voice ID
 * @param {string} text
 * @param {string} outPath - output WAV file path
 * @returns {Promise<void>}
 */
export async function synthesise(elevenlabsVoiceId, text, outPath) {
  if (!API_KEY) throw new Error('ELEVENLABS_API_KEY not set');

  const resp = await fetch(`${API_BASE}/text-to-speech/${elevenlabsVoiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.status);
    throw new Error(`ElevenLabs API error: ${err}`);
  }

  // Write MP3 to temp file then convert to WAV
  const tmpMp3 = path.join(os.tmpdir(), `el_${Date.now()}.mp3`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(tmpMp3, buf);

  await mp3ToWav(tmpMp3, outPath);
  fs.unlinkSync(tmpMp3);
}

function mp3ToWav(inPath, outPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-y', '-i', inPath, outPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    ffmpeg.stderr.on('data', d => err += d);
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed: ${err.slice(-200)}`));
    });
  });
}
