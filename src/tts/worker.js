// /root/scrapletdashboard/src/tts/worker.js
import "dotenv/config";
import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { getPool, query } from "../../db.js";

const WORKER_ID =
  process.env.TTS_WORKER_ID ||
  `${os.hostname()}:tts-worker:${process.pid}`;

const POLL_MS = toPosInt(process.env.TTS_WORKER_POLL_MS, 750);
const IDLE_SLEEP_MS = toPosInt(process.env.TTS_WORKER_IDLE_SLEEP_MS, 1250);
const MAX_ATTEMPTS = toPosInt(process.env.TTS_WORKER_MAX_ATTEMPTS, 5);
const STALE_LOCK_MINUTES = toPosInt(process.env.TTS_WORKER_STALE_LOCK_MINUTES, 10);

// Piper config
const PIPER_BIN = process.env.PIPER_BIN || "/opt/tts/piper/piper/piper";


// Voice model path (you installed this)
const DEFAULT_MODEL =
  process.env.PIPER_MODEL ||
  "/opt/tts/voices/models/en_GB-alba-medium.onnx";

// Uploads
const UPLOADS_BASE_DIR =
  process.env.SCRAPLET_UPLOADS_DIR || "/var/www/scraplet-uploads";
const TTS_DIR = path.join(UPLOADS_BASE_DIR, "tts");
const PUBLIC_UPLOADS_PREFIX = "/uploads";

// Optional: If you really want mp3 later, do it explicitly.
// For now, we commit to WAV only.
const AUDIO_EXT = "wav";
const AUDIO_MIME = "audio/wav";

function toPosInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function claimNextJob() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sel = await client.query(
      `
      SELECT id
      FROM tts_jobs
      WHERE attempts < $1
        AND (
          status = 'queued'
          OR (
            status = 'processing'
            AND (
              locked_at IS NULL
              OR locked_at < (NOW() - ($2::text || ' minutes')::interval)
            )
          )
        )
      ORDER BY
        CASE WHEN status = 'queued' THEN 0 ELSE 1 END,
        priority DESC,
        created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `,
      [MAX_ATTEMPTS, String(STALE_LOCK_MINUTES)]
    );

    if (!sel.rowCount) {
      await client.query("COMMIT");
      return null;
    }

    const id = sel.rows[0].id;

    const upd = await client.query(
      `
      UPDATE tts_jobs
      SET status = 'processing',
          locked_at = NOW(),
          locked_by = $2,
          attempts = attempts + 1,
          last_error = NULL
      WHERE id = $1
      RETURNING *
      `,
      [id, WORKER_ID]
    );

    await client.query("COMMIT");
    return upd.rows[0];
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function markDone(id, patch = {}) {
  const allowed = [
    "audio_mime",
    "audio_path",
    "audio_url",
    "audio_hash",
    "char_count",
    "text_sanitized",
    "cost_cents_estimate",
  ];

  const sets = [];
  const params = [];
  let i = 1;

  for (const k of allowed) {
    if (patch[k] !== undefined) {
      sets.push(`${k} = $${i++}`);
      params.push(patch[k]);
    }
  }

  sets.unshift(`status = 'done'`);
  sets.push(`locked_at = NULL`, `locked_by = NULL`, `finished_at = NOW()`);

  params.push(id);

  await query(
    `UPDATE tts_jobs SET ${sets.join(", ")} WHERE id = $${i}`,
    params
  );
}

async function markFailed(id, errText) {
  const msg = String(errText || "Unknown error").slice(0, 4000);
  await query(
    `
    UPDATE tts_jobs
    SET status = 'failed',
        locked_at = NULL,
        locked_by = NULL,
        last_error = $2
    WHERE id = $1
    `,
    [id, msg]
  );
}

function runPiper({ modelPath, text, outPath }) {
  return new Promise((resolve, reject) => {
    const child = spawn(PIPER_BIN, ["-m", modelPath, "-f", outPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`piper exited ${code}: ${stderr || "(no stderr)"}`)
        );
      }
      resolve();
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}

async function processJob(job) {
  ensureDir(TTS_DIR);

  const platform = job.platform || "kick";
  const channelSlug = job.channel_slug || "unknown";
  const voiceId = job.voice_id || "en_GB-alba-medium";
  const engine = job.engine || "local";

  // You can later map voiceId->modelPath. For now we keep a single known model.
  const modelPath = DEFAULT_MODEL;

  const textRaw = (job.text_sanitized || job.text || "").toString();
  const text = textRaw.trim();
  if (!text) throw new Error("Empty text");

  // Stable filename hash: voice + text
  const audioHash = sha1(`${engine}|${voiceId}|${text}`);
  const filename = `${audioHash}.${AUDIO_EXT}`;

  const audioPath = path.join(TTS_DIR, filename);
  const audioUrl = `${PUBLIC_UPLOADS_PREFIX}/tts/${filename}`;

  // Generate WAV via Piper
  await runPiper({ modelPath, text, outPath: audioPath });

  // Verify file exists and is non-trivial
  const st = fs.statSync(audioPath);
  if (!st.isFile() || st.size < 256) {
    throw new Error(`Piper wrote invalid audio file: ${audioPath} size=${st.size}`);
  }

  // Mark done (DB trigger will emit tts_ready event)
  await markDone(job.id, {
    audio_mime: AUDIO_MIME,
    audio_path: audioPath,
    audio_url: audioUrl,
    audio_hash: audioHash,
    char_count: text.length,
    text_sanitized: text,
    cost_cents_estimate: 0,
  });

  console.log(
    `[tts-worker] done id=${job.id} ${platform}/${channelSlug} url=${audioUrl} bytes=${st.size}`
  );
}

let shuttingDown = false;
function setupSignals() {
  const onSig = (sig) => {
    console.log(`[tts-worker] signal ${sig} received; shutting down`);
    shuttingDown = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
}

async function main() {
  console.log(
    `[tts-worker] start workerId=${WORKER_ID} piper=${PIPER_BIN} model=${DEFAULT_MODEL} uploads=${UPLOADS_BASE_DIR} poll=${POLL_MS}ms`
  );

  while (!shuttingDown) {
    try {
      const job = await claimNextJob();

      if (!job) {
        await sleep(IDLE_SLEEP_MS);
        continue;
      }

      console.log(
        `[tts-worker] claimed id=${job.id} platform=${job.platform} channel=${job.channel_slug} source=${job.source} attempts=${job.attempts}`
      );

      try {
        await processJob(job);
      } catch (err) {
        console.error(`[tts-worker] job fail id=${job.id}`, err);
        await markFailed(job.id, err?.stack || err?.message || String(err));
      }
    } catch (err) {
      console.error(`[tts-worker] loop error`, err);
      await sleep(POLL_MS);
    }

    await sleep(POLL_MS);
  }
}

setupSignals();
main().catch((e) => {
  console.error("[tts-worker] fatal", e);
  process.exit(1);
});
