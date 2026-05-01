// This is the updated ParametricEffectOverlay function
// Replace the existing function in ElementRenderer.tsx starting at line 1491

import { globalEffectCoordinator } from './globalEffectCoordinator';
import { usePerformanceMode } from './PerformanceModeContext';

function ParametricEffectOverlay({
    effects, width, height, elementId, borderRadius = 0, shapePath = "",
}: {
    effects: OverlayEffect[]; width: number; height: number;
    elementId: string; borderRadius?: number; shapePath?: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [tick, setTick] = useState(0);
    const { isPerformanceMode } = usePerformanceMode();

    const parametric = effects.filter(e => e.type === "parametric" && e.enabled !== false) as any[];
    const canvasEffects = parametric.filter(e => EFFECT_PRESETS[e.preset]?.produces.includes("canvas"));
    const svgEffects = parametric.filter(e => EFFECT_PRESETS[e.preset]?.produces.includes("svgOverlay"));
    const cssEffects = parametric.filter(e => EFFECT_PRESETS[e.preset]?.produces.includes("css"));
    const svgEffectsRef = useRef(svgEffects);
    svgEffectsRef.current = svgEffects;

    // CSS effects: animate via React state, rendered as overlay
    const [cssOverlayStyle, setCssOverlayStyle] = useState<React.CSSProperties>({});
    useEffect(() => {
        if (!cssEffects.length || isPerformanceMode) { 
            setCssOverlayStyle({}); 
            return; 
        }
        
        const start = performance.now();
        const unregister = globalEffectCoordinator.register(() => {
            const t = performance.now() - start;
            let filterParts: string[] = [];
            let combined: React.CSSProperties = {};
            for (const e of cssEffects) {
                const params = e.keyframes?.length
                    ? interpolateParams(e.params, e.keyframes, t, e.duration ?? 1000)
                    : e.params;
                const css = renderParametricEffectCSS(e.preset, params, t);
                const _effOpacity = Number(params.opacity ?? 1);
                if (css.filter) filterParts.push(css.filter as string);
                const { filter: _f, opacity: _op, ...rest } = css as any;
                if (_effOpacity < 1) (rest as any).opacity = (_op !== undefined ? Number(_op) : 1) * _effOpacity;
                else if (_op !== undefined) (rest as any).opacity = _op;
                Object.assign(combined, rest);
            }
            if (filterParts.length) combined.filter = filterParts.join(" ");
            setCssOverlayStyle(combined);
        });
        
        return () => { 
            unregister(); 
            setCssOverlayStyle({}); 
        };
    }, [cssEffects.map((e: any) => e.id ?? e.preset).join(","), isPerformanceMode]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !canvasEffects.length || isPerformanceMode) return;
        
        const startTime = performance.now();
        const unregister = globalEffectCoordinator.register(() => {
            const t = performance.now() - startTime;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // Clear the full canvas BEFORE any clipping
            ctx.clearRect(0, 0, width, height);

            for (const e of canvasEffects) {
                const params = e.keyframes?.length ? interpolateParams(e.params, e.keyframes, t, e.duration ?? 1000) : e.params;
                const clipMode = String(params.clipMode ?? "none");
                ctx.save();
                if (shapePath && clipMode !== "none") {
                    try {
                        if (clipMode === "surface") {
                            const p2d = new Path2D(shapePath);
                            ctx.clip(p2d, "evenodd");
                        } else if (clipMode === "space") {
                            const p2d = new Path2D(`M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z ${shapePath}`);
                            ctx.clip(p2d, "evenodd");
                        }
                    } catch (_) { /* ignore invalid path */ }
                }
                if (e.preset === "particleEmitter") renderParticleEmitter(ctx, width, height, params, t, elementId + (e.id ?? e.preset));
                else if (e.preset === "lightningArc") renderLightningArc(ctx, width, height, params, t);
                else if (e.preset === "snowfall") renderSnowfall(ctx, width, height, params, t, elementId + (e.id ?? e.preset));
                else if (e.preset === "rain") renderRain(ctx, width, height, params, t, elementId + (e.id ?? e.preset));
                else if (e.preset === "fireEmitter") renderFireEmitter(ctx, width, height, params, t, elementId + (e.id ?? e.preset));
                else if (e.preset === "motionTrail") renderMotionTrail(ctx, width, height, params, t, elementId + (e.id ?? e.preset));
                else if (e.preset === "filmGrain") renderFilmGrain(ctx, width, height, params, t, elementId + (e.id ?? e.preset));
                else if (e.preset === "tapeNoise") renderTapeNoise(ctx, width, height, params, t, elementId + (e.id ?? e.preset));
                ctx.restore();
            }
        });
        
        return () => {
            unregister();
            cleanupParticleState(elementId);
            cleanupSnowState(elementId);
            cleanupRainState(elementId);
            cleanupFireState(elementId);
            cleanupTrailState(elementId);
            cleanupGrainState(elementId);
        };
    }, [canvasEffects.map((e: any) => e.id ?? e.preset).join(","), width, height, elementId, isPerformanceMode]);

    useEffect(() => {
        if (isPerformanceMode) return;
        
        // SVG effects tick updater
        const unregister = globalEffectCoordinator.register(() => { 
            if (svgEffectsRef.current.length) setTick(t => t + 1); 
        });
        
        return unregister;
    }, [isPerformanceMode]);

    // In performance mode, don't render any effects
    if (isPerformanceMode) return null;
    
    if (!canvasEffects.length && !svgEffects.length && !cssEffects.length) return null;
    
    const now = performance.now();
    // Build overlay-only style: backgroundImage for scanline, nothing for filter-based effects
    const overlayOnlyStyle: React.CSSProperties = {};
    if ((cssOverlayStyle as any).backgroundImage) {
        (overlayOnlyStyle as any).backgroundImage = (cssOverlayStyle as any).backgroundImage;
        (overlayOnlyStyle as any).backgroundPosition = (cssOverlayStyle as any).backgroundPosition;
        (overlayOnlyStyle as any).backgroundSize = (cssOverlayStyle as any).backgroundSize;
        if ((cssOverlayStyle as any).mixBlendMode) {
            (overlayOnlyStyle as any).mixBlendMode = (cssOverlayStyle as any).mixBlendMode;
        }
    }
    return (
        <div ref={wrapperRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>

            {canvasEffects.length > 0 && (() => {
                // Determine clip mode from first canvas effect that has clipMode set
                const canvasClipMode = canvasEffects.find((e: any) => e.params?.clipMode)?.params?.clipMode ?? "space";
                const canvasClipPath = (canvasClipMode === "surface" && shapePath)
                    ? `path('${shapePath.replace(/'/g, "\'")}')`
                    : undefined;
                return (
                    <canvas ref={canvasRef} width={width} height={height}
                        style={{
                            position: "absolute", inset: 0, width: "100%", height: "100%",
                            ...(canvasClipPath ? { clipPath: canvasClipPath } : {}),
                        }} />
                );
            })()}
            {svgEffects.length > 0 && (
                <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}
                    style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                    <defs>
                        {shapePath && (
                            <>
                                <clipPath id={`peo-clip-${elementId}`} clipPathUnits="userSpaceOnUse">
                                    <path d={shapePath} clipRule="evenodd" fillRule="evenodd" />
                                </clipPath>
                                <clipPath id={`peo-space-${elementId}`} clipPathUnits="userSpaceOnUse">
                                    <path
                                        d={`M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z ${shapePath}`}
                                        clipRule="evenodd" fillRule="evenodd"
                                    />
                                </clipPath>
                            </>
                        )}
                        <clipPath id={`peo-bbox-${elementId}`}><rect x="0" y="0" width={width} height={height} /></clipPath>
                    </defs>
                    {svgEffects.map((e: any, i: number) => {
                        const params = e.keyframes?.length ? interpolateParams(e.params, e.keyframes, now, e.duration ?? 1000) : e.params;
                        const clipMode = String(params.clipMode ?? "surface");
                        const clipId = !shapePath
                            ? `peo-bbox-${elementId}`
                            : clipMode === "space"
                                ? `peo-space-${elementId}`
                                : `peo-clip-${elementId}`;
                        const clipAttr = `clip-path="url(#${clipId})"`;

                        if (e.preset === "lightsaberBorder") {
                            const { svgContent } = renderLightsaberBorderSVG(width, height, params, now, borderRadius, shapePath || undefined);
                            return <g key={i} dangerouslySetInnerHTML={{ __html: `<g ${clipAttr}>${svgContent}</g>` }} />;
                        }
                        if (e.preset === "hologramFlicker") {
                            return <g key={i} dangerouslySetInnerHTML={{ __html: `<g ${clipAttr}>${renderHologramScanlinesSVG(width, height, params, now)}</g>` }} />;
                        }
                        if (e.preset === "ripple") {
                            return <g key={i} dangerouslySetInnerHTML={{ __html: `<g ${clipAttr}>${renderRippleSVG(width, height, params, now)}</g>` }} />;
                        }
                        if (e.preset === "electricBorder") {
                            return <g key={i} dangerouslySetInnerHTML={{ __html: `<g ${clipAttr}>${renderElectricBorderSVG(width, height, params, now, shapePath || undefined)}</g>` }} />;
                        }
                        if (e.preset === "lensFlare") {
                            return <g key={i} dangerouslySetInnerHTML={{ __html: `<g ${clipAttr}>${renderLensFlareSVG(width, height, params, now)}</g>` }} />;
                        }
                        if (e.preset === "strokePulse") {
                            return <g key={i} dangerouslySetInnerHTML={{ __html: `<g ${clipAttr}>${renderStrokePulseSVG(width, height, params, now, shapePath || undefined)}</g>` }} />;
                        }
                        if (e.preset === "cornerBrackets") {
                            return <g key={i} dangerouslySetInnerHTML={{ __html: `<g ${clipAttr}>${renderCornerBracketsSVG(width, height, params, now)}</g>` }} />;
                        }
                        return null;
                    })}
                </svg>
            )}
            {Object.keys(overlayOnlyStyle).length > 0 && (
                <div style={{ position: "absolute", inset: 0, ...overlayOnlyStyle }} />
            )}
        </div>
    );
}
