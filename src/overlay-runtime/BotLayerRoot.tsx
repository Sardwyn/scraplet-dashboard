import React, { useState, useEffect } from 'react';

/**
 * Bot Layer Zones (Default for Every Overlay)
 * These zones are where bot-spawned widgets appear
 */
const BOT_ZONES = {
  TL: { x: 50, y: 50, width: 400, height: 200, zIndex: 9999 },      // Top Left
  TR: { x: 1470, y: 50, width: 400, height: 200, zIndex: 9999 },    // Top Right  
  C: { x: 760, y: 440, width: 400, height: 200, zIndex: 9999 },     // Center
  BL: { x: 50, y: 830, width: 400, height: 200, zIndex: 9999 },     // Bottom Left
  BR: { x: 1470, y: 830, width: 400, height: 200, zIndex: 9999 },   // Bottom Right
  LT: { x: 0, y: 930, width: 1920, height: 150, zIndex: 10000 }     // Lower Third
} as const;

type ZoneKey = keyof typeof BOT_ZONES;

interface BotWidget {
  id: number;
  zone: ZoneKey;
  type: 'lower-third' | 'alert' | 'card' | 'custom';
  config: Record<string, any>;
  expiresAt?: string;
  createdAt: string;
}

interface BotLayerRootProps {
  publicId: string;
  isEditorMode: boolean;
}

/**
 * BotLayerRoot — Renders bot-spawned widgets above all other overlay content
 * 
 * - Hidden in editor mode (users can't interact with it)
 * - Visible in OBS runtime
 * - Subscribes to SSE events for bot widget spawn/clear
 * - Auto-expires widgets based on duration
 * - z-index 9999+ (above all user-created content)
 */
export function BotLayerRoot({ publicId, isEditorMode }: BotLayerRootProps) {
  const [widgets, setWidgets] = useState<BotWidget[]>([]);
  // Live data store — tracks overlay variable values from SSE events
  // Used by LowerThirdWidget ticker and other data-bound elements
  const [liveData, setLiveData] = useState<Record<string, string>>({});
  
  // Hide in editor mode — bot layer is invisible to users in the editor
  if (isEditorMode) {
    return null;
  }
  
  // Subscribe to SSE for bot widget events AND live data updates
  useEffect(() => {
    const handleOverlayEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const type: string = detail?.header?.type ?? '';
      const payload = detail?.payload ?? {};
      
      if (type === 'bot:widget:spawn') {
        try {
          const widget = payload as BotWidget;
          setWidgets(prev => [...prev.filter(w => w.zone !== widget.zone), widget]);
        } catch (err) {
          console.error('[BotLayerRoot] Failed to process bot:widget:spawn event:', err);
        }
      } else if (type === 'bot:widget:clear') {
        try {
          const { zone } = payload as { zone: ZoneKey };
          setWidgets(prev => prev.filter(w => w.zone !== zone));
        } catch (err) {
          console.error('[BotLayerRoot] Failed to process bot:widget:clear event:', err);
        }
      } else if (type === 'bot:widget:sync') {
        // Sync active widgets on reconnect
        try {
          const { widgets: activeWidgets } = payload as { widgets: BotWidget[] };
          if (Array.isArray(activeWidgets)) {
            setWidgets(activeWidgets.filter((w: any) => w.widget_type === 'lower-third' || w.type === 'lower-third').map((w: any) => ({
              id: w.id,
              zone: w.zone_key || w.zone,
              type: w.widget_type || w.type,
              config: w.config,
              expiresAt: w.expires_at || w.expiresAt,
              createdAt: w.created_at || w.createdAt,
            })));
          }
        } catch (err) {
          console.error('[BotLayerRoot] Failed to process bot:widget:sync event:', err);
        }
      } else if (
        // Track data updates from any event that carries payload data
        // This covers: overlay.lower_third.show, variables.update, and any
        // event that sets data keys the ticker or other elements bind to
        type === 'overlay.lower_third.show' ||
        type === 'variables.update'
      ) {
        try {
          if (type === 'overlay.lower_third.show') {
            // Extract data keys from the show event payload
            const { title, subtitle, duration_ms } = payload as any;
            setLiveData(prev => ({
              ...prev,
              ...(title !== undefined ? { 'lower_third.title': String(title) } : {}),
              ...(subtitle !== undefined ? { 'lower_third.subtitle': String(subtitle) } : {}),
              'lower_third.active': '1',
            }));
            // Auto-clear active flag after duration
            if (duration_ms) {
              setTimeout(() => {
                setLiveData(prev => ({ ...prev, 'lower_third.active': '0' }));
              }, duration_ms);
            }
          } else if (type === 'variables.update') {
            const vars = (payload as any)?.variables;
            if (Array.isArray(vars)) {
              const updates: Record<string, string> = {};
              vars.forEach((v: any) => { if (v.key) updates[v.key] = String(v.value ?? ''); });
              setLiveData(prev => ({ ...prev, ...updates }));
            }
          }
        } catch (err) {
          // Non-fatal — live data update failed
        }
      } else if (payload && typeof payload === 'object') {
        // Universal: flatten any payload keys into liveData so ticker can bind to them
        // This covers custom events that set arbitrary data keys
        try {
          const flat: Record<string, string> = {};
          let changed = false;
          for (const [k, v] of Object.entries(payload)) {
            if (typeof v === 'string' || typeof v === 'number') {
              flat[k] = String(v);
              changed = true;
            }
          }
          if (changed) {
            setLiveData(prev => ({ ...prev, ...flat }));
          }
        } catch (_) {}
      }
    };
    
    window.addEventListener('scraplet:overlay:event', handleOverlayEvent);
    return () => window.removeEventListener('scraplet:overlay:event', handleOverlayEvent);
  }, [publicId]);
  
  // Auto-expire widgets based on expiresAt timestamp
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setWidgets(prev => prev.filter(w => {
        if (!w.expiresAt) return true; // Persistent widget
        const expiresAtMs = new Date(w.expiresAt).getTime();
        return expiresAtMs > now;
      }));
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Always render container (even with no widgets) to maintain compositing layer in OBS CEF
  
  return (
    <div 
      style={{ 
        position: 'absolute', 
        inset: 0, 
        pointerEvents: 'none',
        zIndex: 9999,
        // Force OBS CEF to create a compositing layer
        willChange: 'transform',
        transform: 'translateZ(0)'
      }}
    >
      {widgets.map(widget => (
        <BotWidget key={widget.id} widget={widget} liveData={liveData} />
      ))}
    </div>
  );
}

/**
 * BotWidget — Renders a single bot-spawned widget in its zone
 */
function BotWidget({ widget, liveData }: { widget: BotWidget; liveData: Record<string, string> }) {
  const zone = BOT_ZONES[widget.zone];
  
  // For lower-third, use template's own dimensions if available
  const width = (widget.type === 'lower-third' && widget.config?.width) ? widget.config.width : zone.width;
  const height = (widget.type === 'lower-third' && widget.config?.height) ? widget.config.height : zone.height;
  // For LT zone, position from bottom using template height
  const top = widget.zone === 'LT'
    ? 1080 - height
    : zone.y;
  
  return (
    <div 
      style={{
        position: 'absolute',
        left: zone.x,
        top,
        width,
        height,
        zIndex: zone.zIndex,
        pointerEvents: 'none',
        willChange: 'transform',
        transform: 'translateZ(0)'
      }}
    >
      {widget.type === 'lower-third' && <LowerThirdWidget config={widget.config} liveData={liveData} />}
      {widget.type === 'alert' && <AlertWidget config={widget.config} />}
      {widget.type === 'card' && <CardWidget config={widget.config} />}
      {widget.type === 'custom' && <CustomWidget config={widget.config} />}
    </div>
  );
}

/**
 * TickerStrip — Scrolling ticker with accurate pixel-based timing.
 * Measures actual text width via ref to calculate correct animation duration.
 */
function TickerStrip({
  text, repeated, speed, height, bgColor, color, fontSize, paddingLeft
}: {
  text: string; repeated: string; speed: number; height: number;
  bgColor: string; color: string; fontSize: number; paddingLeft: number;
}) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [duration, setDuration] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (innerRef.current) {
      const oneWidth = innerRef.current.scrollWidth / 2;
      if (oneWidth > 0) {
        setDuration(oneWidth / speed);
      }
    }
  }, [text, speed, fontSize]);

  const animStyle = duration
    ? { animation: `scraplet-ticker-scroll ${duration}s linear infinite` }
    : { visibility: 'hidden' as const };

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height, backgroundColor: bgColor, overflow: 'hidden',
      display: 'flex', alignItems: 'center',
    }}>
      <div
        ref={innerRef}
        style={{
          display: 'inline-block', whiteSpace: 'nowrap',
          fontSize, color, ...animStyle,
        }}
      >
        {repeated}
      </div>
      <style>{`@keyframes scraplet-ticker-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
  );
}

/**
 * LowerThirdWidget — Renders a lower third from bot command using full template config.
 * Reads the same fields as the native lower_third ElementRenderer so named templates
 * render exactly as designed in the editor.
 */
function LowerThirdWidget({ config, liveData = {} }: { config: Record<string, any>; liveData?: Record<string, string> }) {
  // Text content — command args (primary/secondary) take priority over template defaults
  const primary = config.primary || config.title || '';
  const secondary = config.secondary || config.subtitle || '';

  // Style — read from template config, fall back to sensible defaults
  const style = config.style || {};
  const layout = config.layout || {};
  const animation = config.animation || {};

  const variant = style.variant || 'accent-bar';
  const layoutMode = layout.mode || (secondary ? 'stacked' : 'single');
  const bgColor = style.bgColor || '#111111';
  const bgOpacity = style.bgOpacity ?? 0.85;
  const accent = style.accentColor || '#4f46e5';
  const titleColor = style.titleColor || '#ffffff';
  const subtitleColor = style.subtitleColor || 'rgba(255,255,255,0.85)';
  const padding = style.paddingPx ?? 20;
  const radius = style.cornerRadiusPx ?? 0;
  const titleSize = style.titleSizePx ?? 32;
  const subSize = style.subtitleSizePx ?? 22;
  const titleWeight = style.titleWeight === 'normal' ? 400 : 700;
  const fontFamily = style.fontFamily ? `${style.fontFamily}, Inter, sans-serif` : 'Inter, sans-serif';

  // Convert hex+opacity to rgba
  function hexToRgba(hex: string, opacity: number): string {
    try {
      const h = hex.replace('#', '');
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${opacity})`;
    } catch { return hex; }
  }

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: radius,
    padding,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    fontFamily,
    position: 'relative',
    overflow: 'hidden',
  };

  if (variant === 'glass') {
    containerStyle.backgroundColor = `rgba(30,30,30,${bgOpacity * 0.5})`;
    containerStyle.backdropFilter = 'blur(12px)';
    containerStyle.border = '1px solid rgba(255,255,255,0.1)';
  } else if (variant === 'minimal') {
    containerStyle.backgroundColor = 'transparent';
    containerStyle.padding = 0;
  } else {
    containerStyle.backgroundColor = hexToRgba(bgColor, bgOpacity);
    if (variant === 'accent-bar') {
      containerStyle.borderLeft = `6px solid ${accent}`;
    }
  }

  let content: React.ReactNode;

  if (layoutMode === 'single') {
    content = (
      <div style={{ fontSize: titleSize, fontWeight: titleWeight, color: titleColor }}>
        {primary}
      </div>
    );
  } else if (layoutMode === 'split') {
    const ratio = layout.splitRatio ?? 0.6;
    const leftSize = layout.leftSizePx ?? titleSize;
    const rightSize = layout.rightSizePx ?? subSize;
    content = (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center' }}>
        <div style={{
          width: `${ratio * 100}%`,
          paddingRight: padding,
          textAlign: 'right',
          borderRight: `2px solid ${accent}`,
          fontSize: leftSize,
          fontWeight: titleWeight,
          color: titleColor,
        }}>
          {primary}
        </div>
        <div style={{ width: `${(1 - ratio) * 100}%`, paddingLeft: padding, fontSize: rightSize, color: subtitleColor }}>
          {secondary}
        </div>
      </div>
    );
  } else {
    // Stacked (default)
    const extraLines: any[] = config.contentLines ?? [];
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {primary && (
          <div style={{ fontSize: titleSize, fontWeight: titleWeight, color: titleColor }}>
            {primary}
          </div>
        )}
        {secondary && (
          <div style={{ fontSize: subSize, color: subtitleColor, marginTop: 4 }}>
            {secondary}
          </div>
        )}
        {extraLines.map((line: any, i: number) => {
          const lineWeight = line.weight === 'bold' ? 700 : line.weight === 'light' ? 300 : 400;
          // For BotLayerRoot, extra lines use their label as content if no data key available
          const lineText = line.label || '';
          if (!lineText) return null;
          return (
            <div key={i} style={{
              fontSize: line.sizePx ?? 18,
              color: line.color ?? subtitleColor,
              fontWeight: lineWeight,
              fontStyle: line.italic ? 'italic' : 'normal',
              opacity: line.opacity ?? 1,
              marginTop: 3,
            }}>
              {lineText}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {content}
      {config.ticker?.enabled && (() => {
        const ticker = config.ticker;
        // Read live text from the overlay's data system using the ticker's bind key
        // Falls back to tickerText (saved default) or previewText
        const tickerKey = ticker.key || 'lower_third.ticker';
        const tickerText = liveData[tickerKey] || config.tickerText || ticker.tickerText || ticker.previewText || '';
        if (!tickerText) return null;
        const tickerH = ticker.heightPx ?? 32;
        const tickerBg = ticker.bgColor ?? accent;
        const tickerColor = ticker.color ?? '#fff';
        const tickerSize = ticker.sizePx ?? 18;
        const tickerPad = ticker.paddingPx ?? 8;
        const speed = ticker.speed ?? 80;
        const sep = ticker.separator ?? '   •   ';
        const singleText = `${tickerText}${sep}`;
        const repeated = `${singleText}${singleText}`;

        return (
          <TickerStrip
            text={singleText}
            repeated={repeated}
            speed={speed}
            height={tickerH}
            bgColor={tickerBg}
            color={tickerColor}
            fontSize={tickerSize}
            paddingLeft={tickerPad}
          />
        );
      })()}
    </div>
  );
}

/**
 * AlertWidget — Renders an alert from bot command
 */
function AlertWidget({ config }: { config: Record<string, any> }) {
  const {
    message = '',
    type = 'info',
    backgroundColor = 'rgba(0, 0, 0, 0.9)',
    textColor = '#ffffff',
    fontSize = 20,
    fontFamily = 'Inter, sans-serif'
  } = config;
  
  // Type-specific colors
  const typeColors: Record<string, string> = {
    info: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    subscription: '#9333ea'
  };
  
  const accentColor = typeColors[type] || typeColors.info;
  
  return (
    <div 
      style={{
        width: '100%',
        height: '100%',
        backgroundColor,
        color: textColor,
        fontFamily,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
        borderLeft: `6px solid ${accentColor}`,
        fontSize
      }}
    >
      {message}
    </div>
  );
}

/**
 * CardWidget — Renders a card from bot command (e.g., Discord user card)
 */
function CardWidget({ config }: { config: Record<string, any> }) {
  const {
    title = '',
    subtitle = '',
    avatar = '',
    backgroundColor = 'rgba(0, 0, 0, 0.85)',
    textColor = '#ffffff',
    fontSize = 18,
    fontFamily = 'Inter, sans-serif'
  } = config;
  
  return (
    <div 
      style={{
        width: '100%',
        height: '100%',
        backgroundColor,
        color: textColor,
        fontFamily,
        display: 'flex',
        alignItems: 'center',
        padding: '20px',
        boxSizing: 'border-box',
        gap: 16
      }}
    >
      {avatar && (
        <img 
          src={avatar} 
          alt="" 
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            objectFit: 'cover'
          }}
        />
      )}
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{ fontSize: fontSize * 1.2, fontWeight: 700, marginBottom: 4 }}>
            {title}
          </div>
        )}
        {subtitle && (
          <div style={{ fontSize, fontWeight: 400, opacity: 0.8 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CustomWidget — Renders a custom widget from bot command
 */
function CustomWidget({ config }: { config: Record<string, any> }) {
  const {
    html = '',
    backgroundColor = 'transparent',
    textColor = '#ffffff',
    fontSize = 16,
    fontFamily = 'Inter, sans-serif'
  } = config;
  
  return (
    <div 
      style={{
        width: '100%',
        height: '100%',
        backgroundColor,
        color: textColor,
        fontFamily,
        fontSize,
        padding: '20px',
        boxSizing: 'border-box'
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
