/**
 * SnapshotRenderer.tsx
 *
 * Dumb runtime renderer. Takes a RenderSnapshot and outputs DOM.
 * Makes zero layout decisions - all transforms are pre-computed.
 *
 * Widget nodes listen for 'scraplet:widget:state' events and render
 * declaratively via registered React components. No DOM injection.
 */

import React, { useEffect, useState } from 'react';
import type { RenderSnapshot, RenderNode } from './renderResolver';
import { ElementRenderer } from './index';
import { getWidgetRenderer } from './widgetContract';

interface SnapshotRendererProps {
  snapshot: RenderSnapshot;
  scale: number;
  elementsById: Record<string, any>;
  overlayComponents?: any[];
  animationPhases?: Record<string, any>;
  data?: Record<string, any>;
  overlayVariables?: any[];
  /** When true, render ONLY widget nodes (effect layer). When false/undefined, render ONLY non-widget nodes. */
  widgetLayerOnly?: boolean;
}

/** Render a single non-widget node */
function ElementNode({
  node,
  elementsById,
  overlayComponents,
  animationPhases,
  data,
  overlayVariables,
}: {
  node: RenderNode;
  elementsById: Record<string, any>;
  overlayComponents?: any[];
  animationPhases?: Record<string, any>;
  data?: Record<string, any>;
  overlayVariables?: any[];
}) {
  const el = elementsById[node.id];
  if (!el) return null;

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    opacity: node.opacity !== 1 ? node.opacity : undefined,
    zIndex: node.zIndex,
    overflow: 'visible',
    pointerEvents: 'none',
  };

  return (    <div data-element-id={node.id} data-element-type={node.type} style={wrapperStyle}>
      <ElementRenderer
        element={el}
        elementsById={elementsById}
        overlayComponents={overlayComponents}
        animationPhase={animationPhases?.[node.id]?.phase}
        animationPhases={animationPhases}
        data={data}
        overlayVariables={overlayVariables}
        layout="fill"
        visited={new Set()}
      />
    </div>
  );
}

/** Render a widget node declaratively via registered React renderer */
function WidgetNode({ node }: { node: RenderNode }) {
  const [widgetState, setWidgetState] = useState<Record<string, any>>(() => {
    // Synchronous read from global store on first render — OBS-safe
    const store = (window as any).__SCRAPLET_WIDGET_STORE__;
    const stored = store?.[node.id]?.state;
    if (stored && Object.keys(stored).length > 0) return stored;
    if (node.initialState && Object.keys(node.initialState).length > 0) return node.initialState;
    return {};
  });

  useEffect(() => {
    const id = node.id;

    const sync = () => {
      const store = (window as any).__SCRAPLET_WIDGET_STORE__;
      const next = store?.[id]?.state;
      if (next && Object.keys(next).length > 0) {
        setWidgetState(prev => {
          // Avoid re-render if state hasn't changed
          if (prev === next) return prev;
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(next);
          if (prevStr === nextStr) return prev;
          return next;
        });
      }
    };

    // Immediate sync
    sync();

    // Poll store every 200ms — OBS-safe, no event dependency
    const interval = setInterval(sync, 200);

    // Signal to widget scripts that this container is ready
    window.dispatchEvent(new CustomEvent('scraplet:widget:ready', {
      detail: { widgetId: node.widgetId, instanceId: node.id }
    }));

    return () => clearInterval(interval);
  }, [node.id, node.widgetId]);

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    opacity: node.opacity !== 1 ? node.opacity : undefined,
    zIndex: node.zIndex,
    overflow: 'visible',
    pointerEvents: 'none',
    ...(node.matrix && node.matrix !== 'none' ? {
      transform: node.matrix,
      transformOrigin: 'center center',
    } : {}),
  };

  const Renderer = node.widgetId ? getWidgetRenderer(node.widgetId) : undefined;

  return (
    <div
      data-element-id={node.id}
      data-widget-id={node.widgetId}
      style={containerStyle}
    >
      {Renderer && Object.keys(widgetState).length > 0 && (
        <Renderer
          state={widgetState}
          config={{ instanceId: node.id }}
          width={node.width}
          height={node.height}
        />
      )}
    </div>
  );
}

export function SnapshotRenderer({
  snapshot,
  scale,
  elementsById,
  overlayComponents,
  animationPhases,
  data,
  overlayVariables,
  widgetLayerOnly,
}: SnapshotRendererProps) {
  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: snapshot.canvas.width,
    height: snapshot.canvas.height,
    overflow: 'visible',
  };

  return (
    <div style={canvasStyle} data-snapshot-version={snapshot.version}>
      {snapshot.nodes.map(node => {
        const isWidget = node.type === 'widget';
        // In widgetLayerOnly mode: only render widgets. Otherwise: only render non-widgets.
        if (widgetLayerOnly && !isWidget) return null;
        if (!widgetLayerOnly && isWidget) return null;

        if (isWidget) {
          return <WidgetNode key={node.id} node={node} />;
        }
        return (
          <ElementNode
            key={node.id}
            node={node}
            elementsById={elementsById}
            overlayComponents={overlayComponents}
            animationPhases={animationPhases}
            data={data}
            overlayVariables={overlayVariables}
          />
        );
      })}
    </div>
  );
}
