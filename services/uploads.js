// /services/uploads.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { recordApiStatus } from "../utils/metrics.js";

const { promises: fsp, constants } = fs;

export const PUBLIC_UPLOADS_PREFIX = "/uploads";

export function ensureUploadDir(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    recordApiStatus({ service: "uploads", status: "error", detail: "invalid_path" });
    throw new Error("Upload directory must be a non-empty string");
  }
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export async function verifyWritable(dirPath) {
  if (!dirPath) return false;
  try {
    await fsp.access(dirPath, constants.W_OK);
    const probe = path.join(dirPath, `.probe-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await fsp.writeFile(probe, "probe");
    await fsp.unlink(probe);
    return true;
  } catch {
    return false;
  }
}

export async function prepareUploadDirectory(dirPath) {
  const resolved = ensureUploadDir(dirPath);
  const writable = await verifyWritable(resolved);
  if (!writable) {
    recordApiStatus({ service: "uploads", status: "error", detail: "not_writable" });
    throw new Error(`Upload directory is not writable: ${resolved}`);
  }
  recordApiStatus({ service: "uploads", status: "success", detail: "prepare_directory" });
  return resolved;
}

export function getUploadsRoot() {
  const envRoot = process.env.SCRAPLET_UPLOADS_ROOT;
  if (envRoot && envRoot.trim()) return envRoot.trim();

  // Fallback: still works in dev without nginx mapping
  return path.join(process.cwd(), "public", "uploads");
}

function safeSeg(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function safeUserId(userId) {
  const n = Number(userId);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid user id");
  return String(Math.trunc(n));
}

export function resolveUserScopeKindDir({ userId, scope, kind }) {
  const uid = safeUserId(userId);
  const s = safeSeg(scope || "misc");
  const k = safeSeg(kind || "files");
  return path.join(getUploadsRoot(), "u", uid, s, k);
}

export function urlForDiskPath(diskPath) {
  const root = path.resolve(getUploadsRoot());
  const abs = path.resolve(diskPath);
  if (!abs.startsWith(root)) throw new Error(`Path outside uploads root: ${abs}`);

  const rel = abs.slice(root.length).replaceAll(path.sep, "/");
  return `${PUBLIC_UPLOADS_PREFIX}${rel.startsWith("/") ? "" : "/"}${rel}`;
}

function pickExtFromMimetype(mimetype) {
  if (!mimetype) return "";
  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "image/gif") return ".gif";
  if (mimetype === "video/mp4") return ".mp4";
  if (mimetype === "video/webm") return ".webm";
  if (mimetype === "video/quicktime") return ".mov";
  return "";
}

function makeFileName({ originalname, mimetype }) {
  const base = safeSeg(path.parse(originalname || "file").name) || "file";
  const ext = pickExtFromMimetype(mimetype) || safeSeg(path.extname(originalname || "")) || "";
  const id = crypto.randomBytes(12).toString("hex");
  return `${base}-${id}${ext}`;
}

export function makeMulterStorage({ userId, scope, kind }) {
  return multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        const dir = resolveUserScopeKindDir({ userId, scope, kind });
        await prepareUploadDirectory(dir);
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (_req, file, cb) => {
      try {
        cb(null, makeFileName({ originalname: file.originalname, mimetype: file.mimetype }));
      } catch (e) {
        cb(e);
      }
    },
  });
}

export function makeUploadMiddleware({
  getUserId,
  scope = "misc",
  kind = "files",
  maxBytes = 25 * 1024 * 1024,
  allowedMimes = null,
  fieldName = "file",
}) {
  return function uploadMiddleware(req, res, next) {
    let userId;
    try {
      userId = getUserId(req);
      if (!userId) throw new Error("Missing user id");
    } catch (e) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const upload = multer({
      storage: makeMulterStorage({ userId, scope, kind }),
      limits: { fileSize: maxBytes },
      fileFilter: (_req, file, cb) => {
        if (Array.isArray(allowedMimes) && allowedMimes.length) {
          if (!allowedMimes.includes(file.mimetype)) {
            return cb(new Error(`Unsupported file type: ${file.mimetype}`));
          }
        }
        cb(null, true);
      },
    }).single(fieldName);

    upload(req, res, (err) => {
      if (err) {
        recordApiStatus({ service: "uploads", status: "error", detail: err.message });
        return res.status(400).json({ ok: false, error: err.message });
      }
      if (!req.file) return res.status(400).json({ ok: false, error: "no_file" });

      req.uploads = {
        diskPath: req.file.path,
        url: urlForDiskPath(req.file.path),
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        bytes: req.file.size,
        originalname: req.file.originalname,
        scope,
        kind,
        userId,
      };

      recordApiStatus({ service: "uploads", status: "success", detail: "upload_ok" });
      next();
    });
  };
}
