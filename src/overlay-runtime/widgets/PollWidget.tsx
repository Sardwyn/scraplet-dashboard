/**
 * PollWidget.tsx
 * Declarative React renderer for the Poll widget.
 */

import React, { useEffect, useState } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface PollOption { id: number; text: string; votes: number; }
interface PollData {
  id: number;
  title: string;
  status: 'active' | 'ended';
  ends_at?: string;
  winner_id?: number;
  options: PollOption[];
}

interface PollState {
  poll?: PollData;
  showTitle: boolean;
  showVoteCount: boolean;
  showPercent: boolean;
  showTimer: boolean;
  showWinner: boolean;
  highlightWinner: boolean;
  voteCommand: string;
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  bgColor: string;
  barBg: string;
  accentColor: string;
  winnerColor: string;
  borderRadius: number;
  barHeight: number;
  barRadius: number;
  optionColors: string[];
}

const KEYFRAMES = `@keyframes poll-blink{0%,100%{opacity:1}50%{opacity:0.3}}`;

export function PollWidget({ state }: WidgetRendererProps) {
  const cfg = state as PollState;
  const poll = cfg.poll;
  const [timerText, setTimerText] = useState('--');
  const [timerUrgent, setTimerUrgent] = useState(false);

  useEffect(() => {
    if (!poll?.ends_at || poll.status === 'ended') return;
    const tick = () => {
      const rem = Math.max(0, new Date(poll.ends_at!).getTime() - Date.now());
      const secs = Math.ceil(rem / 1000);
      setTimerText(secs + 's');
      setTimerUrgent(secs <= 10 && rem > 0);
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [poll?.ends_at, poll?.status]);

  if (!poll) return null;

  const opts = poll.options ?? [];
  const totalVotes = opts.reduce((s, o) => s + (o.votes ?? 0), 0);
  const isEnded = poll.status === 'ended';
  const winnerId = poll.winner_id ?? (isEnded && opts.length ? opts.reduce((a, b) => b.votes > a.votes ? b : a, opts[0]).id : null);
  const optColors = cfg.optionColors ?? ['#6366f1','#ec4899','#10b981','#f59e0b','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{
        fontFamily: cfg.fontFamily ?? 'Inter, system-ui, sans-serif',
        fontSize: cfg.fontSizePx ?? 15,
        color: cfg.textColor ?? '#ffffff',
        background: cfg.bgColor ?? 'rgba(0,0,0,0.8)',
        borderRadius: cfg.borderRadius ?? 12,
        padding: '14px 16px',
        minWidth: 280,
      }}>
        {cfg.showTitle && <div style={{ fontWeight: 700, fontSize: '1.1em', marginBottom: 10, lineHeight: 1.3 }}>{poll.title}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {opts.map((opt, i) => {
            const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            const color = optColors[i % optColors.length];
            const isWinner = cfg.highlightWinner && isEnded && opt.id === winnerId;
            let numLabel = '';
            if (cfg.showPercent && cfg.showVoteCount) numLabel = `${pct}% (${opt.votes})`;
            else if (cfg.showPercent) numLabel = `${pct}%`;
            else if (cfg.showVoteCount) numLabel = `${opt.votes} votes`;

            return (
              <div key={opt.id} style={{
                position: 'relative',
                borderRadius: cfg.barRadius ?? 6,
                overflow: 'hidden',
                height: cfg.barHeight ?? 32,
                background: cfg.barBg ?? 'rgba(255,255,255,0.1)',
                boxShadow: isWinner ? `0 0 0 2px ${cfg.winnerColor ?? '#fbbf24'}` : undefined,
              }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: cfg.barRadius ?? 6, background: color + (isWinner ? '' : '99'), width: `${pct}%`, transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)' }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', padding: '0 10px', gap: 8 }}>
                  <span style={{ fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {!isEnded && `${i + 1}. `}{opt.text}
                  </span>
                  <span style={{ fontSize: '0.8em', opacity: 0.8, whiteSpace: 'nowrap', flexShrink: 0 }}>{numLabel}</span>
                  {isWinner && <span style={{ fontSize: '0.85em', flexShrink: 0 }}>🏆</span>}
                </div>
              </div>
            );
          })}
        </div>

        {!isEnded ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: '0.8em', opacity: 0.55 }}>
            <span>Vote: {cfg.voteCommand ?? '!vote'} 1-{opts.length}</span>
            {cfg.showTimer && (
              <span style={{ fontVariantNumeric: 'tabular-nums', color: timerUrgent ? '#ef4444' : 'inherit', opacity: timerUrgent ? 1 : undefined, animation: timerUrgent ? 'poll-blink 0.8s ease infinite' : 'none' }}>
                {timerText}
              </span>
            )}
            <span>{totalVotes} votes</span>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', fontSize: '0.85em', opacity: 0.6, marginTop: 8, fontStyle: 'italic' }}>
              Poll ended · {totalVotes} total votes
            </div>
            {cfg.showWinner && winnerId != null && (
              <div style={{ textAlign: 'center', padding: 8, background: `${cfg.winnerColor ?? '#fbbf24'}22`, borderRadius: 6, marginTop: 8, fontWeight: 700, color: cfg.winnerColor ?? '#fbbf24' }}>
                🏆 {opts.find(o => o.id === winnerId)?.text} wins!
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
