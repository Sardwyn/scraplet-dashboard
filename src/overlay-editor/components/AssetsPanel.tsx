// src/overlay-editor/components/AssetsPanel.tsx
// Asset Library panel — upload, browse, and add assets to canvas
import React, { useCallback, useEffect, useRef, useState } from "react";

interface Asset {
  id: number;
  filename: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

interface AssetsPanelProps {
  onAddToCanvas: (url: string, mimeType: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isVideo(mimeType: string) {
  return mimeType.startsWith("video/");
}

export function AssetsPanel({ onAddToCanvas }: AssetsPanelProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/dashboard/api/assets");
      const data = await res.json();
      if (data.ok) {
        setAssets(data.assets);
      } else {
        setError("Failed to load assets");
      }
    } catch {
      setError("Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of fileArr) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/dashboard/api/assets/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!data.ok) {
          const msg = res.status === 413
            ? "File too large (max 50MB)"
            : data.error || "Upload failed";
          setUploadError(msg);
          return;
        }
      }
      await fetchAssets();
    } catch {
      setUploadError("Upload failed — check your connection");
    } finally {
      setUploading(false);
    }
  }, [fetchAssets]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(true);
  };

  const handleDragLeave = () => setDraggingOver(false);

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`Delete "${asset.filename}"?`)) return;
    try {
      const res = await fetch(`/dashboard/api/assets/${asset.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setAssets(prev => prev.filter(a => a.id !== asset.id));
      }
    } catch {
      // silent fail
    }
  };

  const filtered = assets.filter(a =>
    a.filename.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Upload dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`mx-2 mt-2 mb-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed cursor-pointer transition-colors py-3
          ${draggingOver
            ? "border-indigo-400 bg-indigo-900/20"
            : "border-[rgba(255,255,255,0.12)] hover:border-indigo-500/50 hover:bg-[rgba(255,255,255,0.03)]"
          }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileInput}
        />
        {uploading ? (
          <span className="text-[11px] text-indigo-400">Uploading…</span>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="text-[11px] text-slate-500">Drop files or click to upload</span>
            <span className="text-[10px] text-slate-600">PNG, JPG, GIF, WebP, SVG, MP4, WebM · max 50MB</span>
          </>
        )}
      </div>

      {uploadError && (
        <div className="mx-2 mb-1 px-2 py-1.5 rounded bg-red-900/30 border border-red-500/30 text-[11px] text-red-400 flex items-center justify-between">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Search */}
      <div className="px-2 mb-1">
        <input
          type="text"
          placeholder="Search assets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-[12px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-[11px] text-slate-600">Loading…</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <span className="text-[11px] text-slate-500">{error}</span>
            <button onClick={fetchAssets} className="text-[11px] text-indigo-400 hover:text-indigo-300">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-[11px] text-slate-600">
            {search ? "No matching assets" : "No assets yet — upload some files"}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map(asset => (
              <AssetTile
                key={asset.id}
                asset={asset}
                onAdd={() => onAddToCanvas(asset.url, asset.mime_type)}
                onDelete={() => handleDelete(asset)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AssetTileProps {
  asset: Asset;
  onAdd: () => void;
  onDelete: () => void;
}

function AssetTile({ asset, onAdd, onDelete }: AssetTileProps) {
  return (
    <div
      className="group relative rounded-md overflow-hidden bg-[#1a1a1f] border border-[rgba(255,255,255,0.07)] cursor-pointer hover:border-indigo-500/50 transition-colors aspect-square"
      onClick={onAdd}
      title={asset.filename}
    >
      {/* Thumbnail */}
      {isImage(asset.mime_type) ? (
        <img
          src={asset.url}
          alt={asset.filename}
          className="w-full h-full object-cover pointer-events-none"
          loading="lazy"
        />
      ) : isVideo(asset.mime_type) ? (
        <video
          src={asset.url}
          className="w-full h-full object-cover pointer-events-none"
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
        <div className="flex justify-end">
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="w-6 h-6 rounded bg-red-900/80 hover:bg-red-700 flex items-center justify-center transition-colors"
            title="Delete"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-300">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
        <div>
          <div className="text-[10px] text-slate-200 truncate leading-tight">{asset.filename}</div>
          <div className="text-[10px] text-slate-400">{formatBytes(asset.size_bytes)}</div>
        </div>
      </div>
    </div>
  );
}
