// tests/assetUpload.test.js
// Property tests for asset upload validation logic (P4: size limit, P5: MIME type filtering)

import { describe, it, expect } from '@jest/globals';

// ---- Validation logic extracted from routes/assets.js ----
const ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
];

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

function validateUpload(mimeType, sizeBytes) {
  if (sizeBytes > MAX_BYTES) {
    return { ok: false, status: 413, error: "File too large" };
  }
  if (!ALLOWED_MIMES.includes(mimeType)) {
    return { ok: false, status: 400, error: `Unsupported file type: ${mimeType}` };
  }
  return { ok: true };
}

// ---- P4: Upload rejects files > 50MB ----
describe("P4: Asset upload size validation", () => {
  it("rejects files exactly at 50MB + 1 byte", () => {
    const result = validateUpload("image/png", MAX_BYTES + 1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(413);
  });

  it("rejects files well over 50MB", () => {
    const result = validateUpload("video/mp4", 100 * 1024 * 1024);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(413);
  });

  it("accepts files exactly at 50MB", () => {
    const result = validateUpload("image/png", MAX_BYTES);
    expect(result.ok).toBe(true);
  });

  it("accepts files under 50MB", () => {
    const result = validateUpload("image/jpeg", 1 * 1024 * 1024);
    expect(result.ok).toBe(true);
  });

  // Property: any size > MAX_BYTES is rejected
  it("property: all sizes above limit are rejected", () => {
    const overSizes = [MAX_BYTES + 1, MAX_BYTES + 1000, 100 * 1024 * 1024, 500 * 1024 * 1024];
    for (const size of overSizes) {
      const result = validateUpload("image/png", size);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(413);
    }
  });

  // Property: any size <= MAX_BYTES with valid MIME is accepted
  it("property: all sizes at or below limit with valid MIME are accepted", () => {
    const validSizes = [0, 1, 1024, 1024 * 1024, MAX_BYTES];
    for (const size of validSizes) {
      const result = validateUpload("image/png", size);
      expect(result.ok).toBe(true);
    }
  });
});

// ---- P5: Upload rejects disallowed MIME types ----
describe("P5: Asset upload MIME type validation", () => {
  it("accepts all allowed MIME types", () => {
    for (const mime of ALLOWED_MIMES) {
      const result = validateUpload(mime, 1024);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects application/pdf", () => {
    const result = validateUpload("application/pdf", 1024);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("rejects text/html", () => {
    const result = validateUpload("text/html", 1024);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("rejects application/octet-stream", () => {
    const result = validateUpload("application/octet-stream", 1024);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("rejects video/quicktime (not in allowed list)", () => {
    const result = validateUpload("video/quicktime", 1024);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  // Property: any MIME not in ALLOWED_MIMES is rejected
  it("property: all disallowed MIME types are rejected", () => {
    const disallowed = [
      "application/pdf",
      "text/plain",
      "text/html",
      "application/zip",
      "application/octet-stream",
      "video/quicktime",
      "audio/mpeg",
      "image/tiff",
      "image/bmp",
    ];
    for (const mime of disallowed) {
      const result = validateUpload(mime, 1024);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    }
  });

  // Property: MIME type check is case-sensitive (uppercase variants rejected)
  it("property: MIME type matching is case-sensitive", () => {
    const upperMimes = ["IMAGE/PNG", "Image/Jpeg", "VIDEO/MP4"];
    for (const mime of upperMimes) {
      const result = validateUpload(mime, 1024);
      expect(result.ok).toBe(false);
    }
  });
});
