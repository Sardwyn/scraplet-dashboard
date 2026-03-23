// services/llmClient.js
// Thin OpenAI-compatible HTTP client for vLLM.
// Configure via env:
//   VLLM_BASE_URL  e.g. http://your-aws-instance:8000
//   VLLM_MODEL     e.g. Qwen/Qwen2.5-72B-Instruct
//   VLLM_TIMEOUT_MS (optional, default 30000)

import https from 'https';
import http from 'http';

const BASE_URL = (process.env.VLLM_BASE_URL || '').replace(/\/$/, '');
const MODEL    = process.env.VLLM_MODEL || 'Qwen/Qwen2.5-72B-Instruct';
const TIMEOUT  = Number(process.env.VLLM_TIMEOUT_MS || 30000);

function isConfigured() {
  return Boolean(BASE_URL);
}

/**
 * Send a chat completion request to vLLM.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} opts  - optional overrides: model, temperature, max_tokens
 * @returns {Promise<string>} assistant reply text
 */
export async function chat(messages, opts = {}) {
  if (!isConfigured()) {
    throw new Error('[llmClient] VLLM_BASE_URL is not set');
  }

  const body = JSON.stringify({
    model:       opts.model       || MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens:  opts.max_tokens  ?? 512,
    stream:      false,
  });

  const url = new URL('/v1/chat/completions', BASE_URL);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: TIMEOUT,
    }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const text = json?.choices?.[0]?.message?.content;
          if (typeof text !== 'string') {
            return reject(new Error(`[llmClient] unexpected response: ${raw.slice(0, 200)}`));
          }
          resolve(text.trim());
        } catch (e) {
          reject(new Error(`[llmClient] parse error: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('[llmClient] request timed out'));
    });

    req.on('error', (e) => reject(new Error(`[llmClient] request error: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

export default { chat, isConfigured };
