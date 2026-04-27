/**
 * MediaQueueWidget.tsx
 * Declarative React renderer for the Media Queue widget.
 */

import React from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface QueueItem {
  id: number;
  title: string;
  artist?: string;
  requester: string;
  platform: string;
  request_type: string;
  status: 'playing' | 'pending';
  votes?: number;
}

interface MediaQueueState {
  nowPlaying?: QueueItem;
  queue: QueueItem[];
  showNowPlaying: boolean;
  showQueue: boolean;
  maxVisible: number;
  showRequester: boolean;
  showVotes: boolean;
  showPlatform: boolean;
  showCommand: boolean;
  command: string;
  nowPlayingLabel: string;
  upNextLabel: string;
  emptyLabel: string;
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  bgColor: string;
  nowPlayingBg: string;
  nowPlayingColor: string;
  rowBg: string;
  accentColor: string;
  borderRadius: number;
  rowGap: number;
}

const PLATFORM_ICONS: Record<string, string> = { kick: '🟢', youtube: '▶️', twitch: '💜', unknown: '⚪' };
const TYPE_ICONS: Record<string, string>     = { song: '🎵', video: '🎬', custom: '⭐' };

const KEYFRAMES = `@keyframes mq-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`;

export function MediaQueueWidget({ state }: WidgetRendererProps) {
  const cfg = state as MediaQueueState;
  const pending = (cfg.queue ?? []).filter(r => r.status === 'pending').slice(0, cfg.maxVisible ?? 5);

  const wrapStyle: React.CSSProperties = {
    fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSize: cfg.fontSizePx ?? 14,
    color: cfg.textColor ?? '#ffffff',
    background: cfg.bgColor ?? 'rgba(0,0,0,0.75)',
    borderRadius: cfg.borderRadius ?? 10,
    padding: 10,
    minWidth: 240,
  };

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={wrapStyle}>
        {/* Now Playing */}
        {cfg.showNowPlaying && cfg.nowPlaying && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: cfg.nowPlayingColor ?? '#a5b4fc', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: cfg.nowPlayingColor ?? '#a5b4fc', animation: 'mq-pulse 1.5s ease infinite' }} />
              {cfg.nowPlayingLabel ?? 'NOW PLAYING'}
            </div>
            <div style={{ background: cfg.nowPlayingBg ?? 'rgba(99,102,241,0.2)', borderLeft: `3px solid ${cfg.nowPlayingColor ?? '#a5b4fc'}`, borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {TYPE_ICONS[cfg.nowPlaying.request_type] ?? '🎵'} {cfg.nowPlaying.title}
              </div>
              <div style={{ fontSize: '0.8em', opacity: 0.65, marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                {cfg.nowPlaying.artist && <span>{cfg.nowPlaying.artist}</span>}
                {cfg.showRequester && <span>by {cfg.nowPlaying.requester}</span>}
                {cfg.showPlatform && <span>{PLATFORM_ICONS[cfg.nowPlaying.platform] ?? ''}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Queue */}
        {cfg.showQueue && (
          <>
            {pending.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px 8px', opacity: 0.4, fontSize: '0.85em', fontStyle: 'italic' }}>
                {cfg.emptyLabel ?? `Queue is empty — use ${cfg.command ?? '!sr'} to request!`}
              </div>
            ) : (
              <>
                <div style={{ fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 4, marginTop: cfg.nowPlaying ? 8 : 0 }}>
                  {cfg.upNextLabel ?? 'UP NEXT'} ({pending.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: cfg.rowGap ?? 3 }}>
                  {pending.map((req, i) => (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 5, background: cfg.rowBg ?? 'rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: '0.8em', opacity: 0.4, width: 16, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: '0.9em', flexShrink: 0 }}>{TYPE_ICONS[req.request_type] ?? '🎵'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.title}</div>
                        <div style={{ fontSize: '0.75em', opacity: 0.55, display: 'flex', gap: 6, alignItems: 'center', marginTop: 1 }}>
                          {req.artist && <span>{req.artist}</span>}
                          {cfg.showRequester && <span>by {req.requester}</span>}
                          {cfg.showPlatform && <span>{PLATFORM_ICONS[req.platform] ?? ''}</span>}
                        </div>
                      </div>
                      {cfg.showVotes && (req.votes ?? 0) > 0 && (
                        <span style={{ fontSize: '0.75em', opacity: 0.6, flexShrink: 0 }}>▲{req.votes}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {cfg.showCommand && (
          <div style={{ fontSize: '0.75em', opacity: 0.35, textAlign: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            Request with {cfg.command ?? '!sr'}
          </div>
        )}
      </div>
    </>
  );
}
