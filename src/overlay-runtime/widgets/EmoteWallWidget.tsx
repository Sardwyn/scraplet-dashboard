/**
 * EmoteWallWidget.tsx
 * Declarative React renderer for the Emote Wall widget.
 * Consumes state emitted by emote-wall.js.
 * Manages its own particle animation via useEffect.
 */

import React, { useEffect, useRef } from 'react';
import type { WidgetRendererProps } from '../../shared/overlayRenderer/widgetContract';

interface EmoteParticle {
  id: number;
  src: string;
  name?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface EmoteWallState {
  // Config
  emoteSize: number;
  speed: number;
  maxOnScreen: number;
  direction: 'up' | 'right' | 'left' | 'random';
  showNames: boolean;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  bgColor: string;
  // Live events — each new emote is appended here
  pendingEmotes: Array<{ src: string; name?: string; id: number }>;
}

export function EmoteWallWidget({ state, width, height }: WidgetRendererProps) {
  const cfg = state as EmoteWallState;
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCountRef = useRef(0);
  const prevPendingRef = useRef<number>(0);

  const w = width ?? 400;
  const h = height ?? 300;
  const emoteSize = cfg.emoteSize ?? 48;
  const speed = cfg.speed ?? 4;
  const maxOnScreen = cfg.maxOnScreen ?? 50;

  // Spawn a new emote particle into the DOM
  function spawnEmote(src: string, name?: string) {
    const container = containerRef.current;
    if (!container || activeCountRef.current >= maxOnScreen) return;
    activeCountRef.current++;

    const dir = cfg.direction === 'random'
      ? (['up', 'right', 'left'] as const)[Math.floor(Math.random() * 3)]
      : (cfg.direction ?? 'up');

    let startX: number, startY: number, endX: number, endY: number;
    if (dir === 'up') {
      startX = Math.random() * (w - emoteSize);
      startY = h + emoteSize;
      endX = startX + (Math.random() - 0.5) * 80;
      endY = -emoteSize * 2;
    } else if (dir === 'right') {
      startX = -emoteSize;
      startY = Math.random() * (h - emoteSize);
      endX = w + emoteSize;
      endY = startY + (Math.random() - 0.5) * 80;
    } else {
      startX = w + emoteSize;
      startY = Math.random() * (h - emoteSize);
      endX = -emoteSize;
      endY = startY + (Math.random() - 0.5) * 80;
    }

    const el = document.createElement('div');
    el.style.cssText = `position:absolute;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;left:${startX}px;top:${startY}px;opacity:1;`;

    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = `width:${emoteSize}px;height:${emoteSize}px;object-fit:contain;`;
    img.onerror = () => { el.remove(); activeCountRef.current--; };
    el.appendChild(img);

    if (cfg.showNames && name) {
      const lbl = document.createElement('div');
      lbl.style.cssText = `font-family:${cfg.fontFamily ?? 'Inter, system-ui, sans-serif'};font-size:${cfg.fontSize ?? 12}px;color:${cfg.textColor ?? '#ffffff'};text-shadow:0 1px 2px rgba(0,0,0,0.8);white-space:nowrap;`;
      lbl.textContent = name;
      el.appendChild(lbl);
    }

    el.style.transition = `transform ${speed}s linear, opacity 0.5s ease ${speed - 0.5}s`;
    container.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transform = `translate(${endX - startX}px,${endY - startY}px)`;
      el.style.opacity = '0';
    });

    setTimeout(() => { el.remove(); activeCountRef.current--; }, (speed + 0.5) * 1000);
  }

  // Spawn new emotes when pendingEmotes changes
  useEffect(() => {
    const pending = cfg.pendingEmotes ?? [];
    if (pending.length > prevPendingRef.current) {
      const newOnes = pending.slice(prevPendingRef.current);
      newOnes.forEach(e => spawnEmote(e.src, e.name));
    }
    prevPendingRef.current = pending.length;
  }, [cfg.pendingEmotes]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: cfg.bgColor ?? 'transparent',
        pointerEvents: 'none',
      }}
    />
  );
}
