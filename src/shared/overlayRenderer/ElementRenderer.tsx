import React, { useId, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getWidgetRenderer } from './widgetContract';
import { renderParametricEffectCSS, interpolateParams, EFFECT_PRESETS } from "../effects/parametricEffects";
import { renderParticleEmitter, renderLightningArc, cleanupParticleState, renderSnowfall, cleanupSnowState, renderRain, cleanupRainState, renderFireEmitter, cleanupFireState, renderMotionTrail, cleanupTrailState, renderFilmGrain, renderTapeNoise, cleanupGrainState } from "../effects/parametricCanvas";
import { renderLightsaberBorderSVG, renderHologramScanlinesSVG, renderRippleSVG, renderElectricBorderSVG, renderLensFlareSVG, renderStrokePulseSVG, renderCornerBracketsSVG } from "../effects/parametricSvg";
import {
    OverlayAnimation,
    OverlayAnimationPhase,
    OverlayBlendMode,
    OverlayBoxElement,
    OverlayCornerType,
    OverlayElement,
    OverlayEffect,
    OverlayFrameElement,
    OverlayGlowEffect,
    OverlayLayerBlurEffect,
    OverlayNoiseEffect,
    OverlayPathElement,
    OverlayShadowEffect,
    OverlayStrokeAlign,
    OverlayStrokeSides,
    OverlayTextElement,
    OverlayShapeElement,
    OverlayImageElement,
    OverlayVideoElement,
    OverlayGroupElement,
    OverlayGradientFill,
    OverlayFill,
    OverlayProgressBarElement,
    OverlayProgressRingElement,
    OverlayLowerThirdElement,
    OverlayMaskElement,
    OverlayMediaFit,
    OverlayPatternFill,
    OverlayComponentDef,
    OverlayComponentInstanceElement,
} from "../overlayTypes";
import { getFontStack } from "../FontManager";
import { resolveBinding } from "../bindingEngine";
import { KeyedMedia } from "../mediaEffects/KeyedMedia";
import { resolveElementGeometry } from "../geometry/resolveGeometry";
import { elementToOverlayPath, isClosedPath, svgPathFromCommands, translateOverlayPath } from "../geometry/pathUtils";
import { resolveElementTransform } from "./renderResolver";

type ElementAnimationPhaseMap = Record<string, { phase: OverlayAnimationPhase }>;

function sanitizeSvgId(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function getPatternScale(pattern?: OverlayPatternFill) {
    return Math.max(1, pattern?.scale ?? 100);
}

function getPatternOpacity(pattern?: OverlayPatternFill) {
    return Math.max(0, Math.min(1, pattern?.opacity ?? 1));
}

function hasPatternSource(pattern?: OverlayPatternFill) {
    return typeof pattern?.src === "string" && pattern.src.trim().length > 0;
}

function renderShapeGeometry(
    shape: OverlayShapeElement,
    width: number,
    height: number,
    strokeWidth: number,
    props: Record<string, any>
) {
    if (shape.shape === "rect") {
        const radius = shape.cornerRadiusPx ?? (shape as any).cornerRadius ?? 0;
        const cornerType = (shape as any).cornerType ?? "round";
        // Use path for cut/angle corners since <rect> only supports round
        if (cornerType !== "round" && radius > 0) {
            const shapePath = shapeElementToPath(shape);
            const d = svgPathFromCommands(shapePath);
            return <path d={d} {...props} />;
        }
        return (
            <rect
                x={strokeWidth / 2}
                y={strokeWidth / 2}
                width={Math.max(0, width - strokeWidth)}
                height={Math.max(0, height - strokeWidth)}
                rx={radius}
                ry={radius}
                {...props}
            />
        );
    }

    if (shape.shape === "circle") {
        return (
            <ellipse
                cx={width / 2}
                cy={height / 2}
                rx={Math.max(0, width / 2 - strokeWidth / 2)}
                ry={Math.max(0, height / 2 - strokeWidth / 2)}
                {...props}
            />
        );
    }

    if (shape.shape === "line") {
        return (
            <line
                x1={shape.line ? shape.line.x1 * width : 0}
                y1={shape.line ? shape.line.y1 * height : height / 2}
                x2={shape.line ? shape.line.x2 * width : width}
                y2={shape.line ? shape.line.y2 * height : height / 2}
                {...props}
            />
        );
    }

    return (
        <polygon
            points={`${width / 2},${strokeWidth / 2} ${width - strokeWidth / 2},${height - strokeWidth / 2} ${strokeWidth / 2},${height - strokeWidth / 2}`}
            {...props}
        />
    );
}

function getAnimationTransition(
    animation: OverlayAnimation | undefined,
    phase: OverlayAnimationPhase | undefined
) {
    if (!animation) return undefined;
    if (phase === "hidden") return "none";

    const duration = Math.max(0, animation.durationMs ?? 400);
    const delay = Math.max(0, animation.delayMs ?? 0);
    const easing = animation.easing ?? "ease-out";
    const transitionProps = ["opacity", "transform", "filter", "box-shadow"];

    return transitionProps
        .map((prop) => `${prop} ${duration}ms ${easing} ${delay}ms`)
        .join(", ");
}

function getEnterMotionPresetStyle(
    preset?: OverlayAnimation["enter"],
    animation?: OverlayAnimation
): React.CSSProperties {
    const d = animation?.distance ?? 32;
    const s = animation?.scale ?? 0.8;
    const r = animation?.rotation ?? 90;
    const b = animation?.blur ?? 12;
    switch (preset) {
        case "fade":
            return { opacity: 0 };
        case "slideUp":
            return { transform: `translateY(${d}px)`, opacity: 0 };
        case "slideDown":
            return { transform: `translateY(-${d}px)`, opacity: 0 };
        case "slideLeft":
            return { transform: `translateX(${d}px)`, opacity: 0 };
        case "slideRight":
            return { transform: `translateX(-${d}px)`, opacity: 0 };
        case "scaleIn":
            return { transform: `scale(${s})`, opacity: 0 };
        case "scaleOut":
            return { transform: `scale(${2 - s})`, opacity: 0 };
        case "zoomIn":
            return { transform: `scale(${s * 0.5})`, opacity: 0 };
        case "zoomOut":
            return { transform: `scale(${1 + (1 - s) * 2})`, opacity: 0 };
        case "blurIn":
            return { filter: `blur(${b}px)`, opacity: 0 };
        case "blurOut":
            return { filter: `blur(${b}px)`, opacity: 0 };
        case "rotateIn":
            return { transform: `rotate(${r}deg) scale(0.8)`, opacity: 0 };
        case "rotateOut":
            return { transform: `rotate(-${r}deg) scale(0.8)`, opacity: 0 };
        case "none":
        default:
            return {};
    }
}

function getExitMotionPresetStyle(
    preset?: OverlayAnimation["exit"],
    animation?: OverlayAnimation
): React.CSSProperties {
    const d = animation?.distance ?? 32;
    const s = animation?.scale ?? 0.8;
    const r = animation?.rotation ?? 90;
    const b = animation?.blur ?? 12;
    switch (preset) {
        case "fade":
            return { opacity: 0 };
        case "slideUp":
            return { transform: `translateY(-${d}px)`, opacity: 0 };
        case "slideDown":
            return { transform: `translateY(${d}px)`, opacity: 0 };
        case "slideLeft":
            return { transform: `translateX(-${d}px)`, opacity: 0 };
        case "slideRight":
            return { transform: `translateX(${d}px)`, opacity: 0 };
        case "scaleIn":
            return { transform: `scale(${s})`, opacity: 0 };
        case "scaleOut":
            return { transform: `scale(${2 - s})`, opacity: 0 };
        case "zoomIn":
            return { transform: `scale(${1 + (1 - s) * 2})`, opacity: 0 };
        case "zoomOut":
            return { transform: `scale(${s * 0.5})`, opacity: 0 };
        case "blurIn":
            return { filter: `blur(${b}px)`, opacity: 0 };
        case "blurOut":
            return { filter: `blur(${b}px)`, opacity: 0 };
        case "rotateIn":
            return { transform: `rotate(-${r}deg) scale(0.8)`, opacity: 0 };
        case "rotateOut":
            return { transform: `rotate(${r}deg) scale(0.8)`, opacity: 0 };
        case "none":
        default:
            return {};
    }
}

function getAnimationStyle(
    animation: OverlayAnimation | undefined,
    phase: OverlayAnimationPhase | undefined
): React.CSSProperties {
    if (phase === "hidden") {
        if (!animation) {
            return {
                opacity: 0,
                pointerEvents: "none",
            };
        }

        return {
            ...getEnterMotionPresetStyle(animation.enter, animation),
            pointerEvents: "none",
        };
    }

    if (!animation || !phase || phase === "visible") {
        return {};
    }

    if (phase === "entering") {
        return {};
    }

    if (phase === "exiting") {
        return {
            ...getExitMotionPresetStyle(animation.exit, animation),
            pointerEvents: "none",
        };
    }

    return {};
}

function fitToObjectFit(fit?: OverlayMediaFit) {
    if (fit === "contain") return "contain";
    if (fit === "fill") return "fill";
    return "cover";
}

function toCssBlendMode(blendMode?: OverlayBlendMode): React.CSSProperties["mixBlendMode"] {
    if (blendMode === "screen" || blendMode === "multiply") return blendMode;
    return "normal";
}

function parseColorWithAlpha(color: string | undefined, opacity = 1) {
    if (!color) return { color: "#000000", opacity: Math.max(0, Math.min(1, opacity)) };
    const value = color.trim();
    if (value.startsWith("#")) {
        if (value.length === 9) {
            const alpha = parseInt(value.slice(7, 9), 16) / 255;
            return { color: value.slice(0, 7), opacity: Math.max(0, Math.min(1, alpha * opacity)) };
        }
        if (value.length === 5) {
            const alpha = parseInt(value.slice(4, 5).repeat(2), 16) / 255;
            return { color: `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`, opacity: Math.max(0, Math.min(1, alpha * opacity)) };
        }
        return { color: value, opacity: Math.max(0, Math.min(1, opacity)) };
    }

    const match = value.match(/^rgba?\(([^)]+)\)$/i);
    if (match) {
        const parts = match[1].split(",").map((part) => part.trim());
        const [r = "0", g = "0", b = "0", a = "1"] = parts;
        return {
            color: `rgb(${r}, ${g}, ${b})`,
            opacity: Math.max(0, Math.min(1, Number(a) * opacity)),
        };
    }

    return { color: value, opacity: Math.max(0, Math.min(1, opacity)) };
}

function cssColorWithOpacity(color: string | undefined, opacity = 1) {
    const parsed = parseColorWithAlpha(color, opacity);
    const rgbMatch = parsed.color.match(/^rgb\(([^)]+)\)$/i);
    if (rgbMatch) {
        return `rgba(${rgbMatch[1]}, ${parsed.opacity})`;
    }
    if (parsed.color.startsWith("#") && parsed.color.length === 7) {
        const r = parseInt(parsed.color.slice(1, 3), 16);
        const g = parseInt(parsed.color.slice(3, 5), 16);
        const b = parseInt(parsed.color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${parsed.opacity})`;
    }
    return parsed.color;
}

function getElementEffects(el: OverlayElement): OverlayEffect[] {
    const legacyEffects: OverlayEffect[] = Array.isArray((el as any).effects)
        ? (el as any).effects.filter((effect: OverlayEffect) => effect?.enabled !== false)
        : [];
    const parametricEffects: OverlayEffect[] = Array.isArray((el as any).parametricEffects)
        ? (el as any).parametricEffects
            .filter((pe: any) => pe?.enabled !== false)
            .map((pe: any) => ({ ...pe, type: 'parametric' } as any))
        : [];
    if (legacyEffects.length || parametricEffects.length) {
        return [...legacyEffects, ...parametricEffects];
    }

    if ((el as any).shadow?.enabled) {
        const shadow = (el as any).shadow;
        return [
            {
                type: "dropShadow",
                color: shadow.color,
                blur: shadow.blur,
                x: shadow.x,
                y: shadow.y,
                spread: shadow.spread ?? 0,
                opacity: 1,
                enabled: true,
            } as OverlayShadowEffect,
        ];
    }

    return [];
}

function buildCssEffectStyle(effects: OverlayEffect[]): React.CSSProperties {
    const active = effects.filter((effect) => effect.enabled !== false);
    if (!active.length) return {};

    const filterParts: string[] = [];
    for (const effect of active) {
        if (effect.type === "dropShadow") {
            const shadow = effect as OverlayShadowEffect;
            filterParts.push(`drop-shadow(${shadow.x}px ${shadow.y}px ${Math.max(0, shadow.blur)}px ${cssColorWithOpacity(shadow.color, shadow.opacity ?? 1)})`);
        } else if (effect.type === "outerGlow") {
            const glow = effect as OverlayGlowEffect;
            filterParts.push(`drop-shadow(0 0 ${Math.max(0, glow.blur)}px ${cssColorWithOpacity(glow.color, glow.opacity ?? 1)})`);
        } else if (effect.type === "layerBlur") {
            filterParts.push(`blur(${Math.max(0, (effect as OverlayLayerBlurEffect).blur)}px)`);
        }
    }

    return filterParts.length ? { filter: filterParts.join(" ") } : {};
}

function buildParametricCssStyle(effects: OverlayEffect[], t: number): React.CSSProperties {
    let result: React.CSSProperties = {};
    const filterParts: string[] = [];
    for (const effect of effects) {
        if (effect.type !== "parametric" || effect.enabled === false) continue;
        const pe = effect as any;
        const preset = EFFECT_PRESETS[pe.preset];
        if (!preset?.produces.includes("css")) continue;
        const params = pe.keyframes?.length
            ? interpolateParams(pe.params, pe.keyframes, t, pe.duration ?? 1000)
            : pe.params;
        const css = renderParametricEffectCSS(pe.preset, params, t);
        if (css.filter) filterParts.push(css.filter as string);
        const { filter: _f, ...rest } = css;
        result = { ...result, ...rest };
    }
    if (filterParts.length) result.filter = filterParts.join(" ");
    return result;
}

function renderSvgEffectFilter(effects: OverlayEffect[], filterId: string, t?: number) {
    const nonParametric = effects.filter((effect) => effect.enabled !== false && (effect as any).type !== "parametric");
    const svgFilterParametric = effects.filter((e: any) =>
        e.type === "parametric" && e.enabled !== false &&
        EFFECT_PRESETS[e.preset]?.produces.includes("svgFilter")
    ) as any[];
    const active = nonParametric;
    if (!active.length && !svgFilterParametric.length) return null;

    const nodes: React.ReactNode[] = [];
    let currentResult = "SourceGraphic";

    active.forEach((effect, index) => {
        const resultId = `${filterId}-r${index}`;

        if (effect.type === "layerBlur") {
            nodes.push(
                <feGaussianBlur
                    key={`${resultId}-blur`}
                    in={currentResult}
                    stdDeviation={Math.max(0, (effect as OverlayLayerBlurEffect).blur) / 2}
                    result={resultId}
                />
            );
            currentResult = resultId;
            return;
        }

        if (effect.type === "dropShadow" || effect.type === "outerGlow") {
            const shadow =
                effect.type === "dropShadow"
                    ? (effect as OverlayShadowEffect)
                    : ({
                          color: (effect as OverlayGlowEffect).color,
                          blur: (effect as OverlayGlowEffect).blur,
                          x: 0,
                          y: 0,
                          spread: (effect as OverlayGlowEffect).spread ?? 0,
                          opacity: effect.opacity ?? 1,
                      } as OverlayShadowEffect);
            const { color, opacity } = parseColorWithAlpha(shadow.color, shadow.opacity ?? 1);
            const morphId = `${resultId}-morph`;
            const shadowId = `${resultId}-shadow`;
            const mergeId = `${resultId}-merge`;
            const sourceIn = currentResult;
            if ((shadow.spread ?? 0) > 0) {
                nodes.push(
                    <feMorphology
                        key={`${morphId}-node`}
                        in={sourceIn}
                        operator="dilate"
                        radius={(shadow.spread ?? 0) / 2}
                        result={morphId}
                    />
                );
            }
            nodes.push(
                <feDropShadow
                    key={`${shadowId}-node`}
                    in={(shadow.spread ?? 0) > 0 ? morphId : sourceIn}
                    dx={shadow.x}
                    dy={shadow.y}
                    stdDeviation={Math.max(0, shadow.blur) / 2}
                    floodColor={color}
                    floodOpacity={opacity}
                    result={shadowId}
                />
            );
            nodes.push(
                <feMerge key={`${mergeId}-node`} result={mergeId}>
                    <feMergeNode in={shadowId} />
                    <feMergeNode in={currentResult} />
                </feMerge>
            );
            currentResult = mergeId;
            return;
        }

        if (effect.type === "innerShadow" || effect.type === "innerGlow") {
            const inner =
                effect.type === "innerShadow"
                    ? (effect as OverlayShadowEffect)
                    : ({
                          color: (effect as OverlayGlowEffect).color,
                          blur: (effect as OverlayGlowEffect).blur,
                          x: 0,
                          y: 0,
                          spread: (effect as OverlayGlowEffect).spread ?? 0,
                          opacity: effect.opacity ?? 1,
                      } as OverlayShadowEffect);
            const { color, opacity } = parseColorWithAlpha(inner.color, inner.opacity ?? 1);
            const alphaId = `${resultId}-alpha`;
            const blurId = `${resultId}-blur`;
            const offsetId = `${resultId}-offset`;
            const fillId = `${resultId}-fill`;
            const compId = `${resultId}-comp`;
            const clipId = `${resultId}-clip`;
            const mergeId = `${resultId}-merge`;
            if ((inner.spread ?? 0) > 0) {
                nodes.push(
                    <feMorphology
                        key={`${alphaId}-morph`}
                        in="SourceAlpha"
                        operator="dilate"
                        radius={(inner.spread ?? 0) / 2}
                        result={alphaId}
                    />
                );
            }
            nodes.push(
                <feGaussianBlur
                    key={`${blurId}-node`}
                    in={(inner.spread ?? 0) > 0 ? alphaId : "SourceAlpha"}
                    stdDeviation={Math.max(0, inner.blur) / 2}
                    result={blurId}
                />
            );
            nodes.push(
                <feOffset key={`${offsetId}-node`} in={blurId} dx={inner.x} dy={inner.y} result={offsetId} />
            );
            nodes.push(
                <feFlood key={`${fillId}-node`} floodColor={color} floodOpacity={opacity} result={fillId} />
            );
            nodes.push(
                <feComposite key={`${compId}-node`} in={fillId} in2={offsetId} operator="in" result={compId} />
            );
            nodes.push(
                <feComposite key={`${clipId}-node`} in={compId} in2="SourceAlpha" operator="in" result={clipId} />
            );
            nodes.push(
                <feMerge key={`${mergeId}-node`} result={mergeId}>
                    <feMergeNode in={currentResult} />
                    <feMergeNode in={clipId} />
                </feMerge>
            );
            currentResult = mergeId;
            return;
        }

        if (effect.type === "noise") {
            const noise = effect as OverlayNoiseEffect;
            const turbulenceId = `${resultId}-turbulence`;
            const monoId = `${resultId}-mono`;
            const alphaId = `${resultId}-alpha`;
            const clipId = `${resultId}-clip`;
            nodes.push(
                <feTurbulence
                    key={`${turbulenceId}-node`}
                    type="fractalNoise"
                    baseFrequency={Math.max(0.002, 1 / Math.max(1, noise.scale ?? 24))}
                    numOctaves={2}
                    seed={index + 1}
                    result={turbulenceId}
                />
            );
            nodes.push(
                <feColorMatrix
                    key={`${monoId}-node`}
                    in={turbulenceId}
                    type="saturate"
                    values="0"
                    result={monoId}
                />
            );
            nodes.push(
                <feComponentTransfer key={`${alphaId}-node`} in={monoId} result={alphaId}>
                    <feFuncA type="linear" slope={Math.max(0, Math.min(1, (noise.amount ?? 0.18) * (noise.opacity ?? 1)))} />
                </feComponentTransfer>
            );
            nodes.push(
                <feComposite key={`${clipId}-node`} in={alphaId} in2="SourceAlpha" operator="in" result={clipId} />
            );
            nodes.push(
                <feBlend key={`${resultId}-blend`} in={currentResult} in2={clipId} mode="overlay" result={resultId} />
            );
            currentResult = resultId;
        }
    });

    // Parametric svgFilter effects — inject primitives into the filter
    const now2 = t ?? performance.now();
    svgFilterParametric.forEach((e: any, pi: number) => {
        const params = e.keyframes?.length
            ? interpolateParams(e.params, e.keyframes, now2, e.duration ?? 1000)
            : e.params;
        const speed = Number(params.speed ?? 1);
        const intensity = Number(params.intensity ?? 4);
        const angle = Number(params.angle ?? 0) * Math.PI / 180;
        const pulse = 0.5 + 0.5 * Math.sin((now2 / 1000) * Math.PI * 2 * speed);
        const offset = intensity * pulse;
        const ox = Math.cos(angle) * offset;
        const oy = Math.sin(angle) * offset;
        const gox = Math.cos(angle + Math.PI / 2) * offset * Number(params.greenOffset ?? 0.3);
        const goy = Math.sin(angle + Math.PI / 2) * offset * Number(params.greenOffset ?? 0.3);
        const pid = `${filterId}-p${pi}`;
        if (e.preset === "caFull") {
            // True CA: R channel shifts along angle, B shifts opposite, G stays centred
            // Use multiply blend to darken overlap areas (more realistic than screen)
            const gShift = Number(params.greenOffset ?? 0.3);
            const gox2 = Math.cos(angle) * offset * gShift;
            const goy2 = Math.sin(angle) * offset * gShift;
            nodes.push(
                <React.Fragment key={`ca-${pi}`}>
                    {/* Isolate and offset each channel */}
                    <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result={`${pid}-src-r`}/>
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result={`${pid}-src-g`}/>
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result={`${pid}-src-b`}/>
                    <feOffset in={`${pid}-src-r`} dx={ox} dy={oy} result={`${pid}-r`}/>
                    <feOffset in={`${pid}-src-g`} dx={gox2} dy={goy2} result={`${pid}-g`}/>
                    <feOffset in={`${pid}-src-b`} dx={-ox} dy={-oy} result={`${pid}-b`}/>
                    {/* Recombine channels using screen (additive for light) */}
                    <feBlend in={`${pid}-r`} in2={`${pid}-g`} mode="screen" result={`${pid}-rg`}/>
                    <feBlend in={`${pid}-rg`} in2={`${pid}-b`} mode="screen" result={`${pid}-rgb`}/>
                    {/* Clip to original alpha so CA doesn't bleed outside element */}
                    <feComposite in={`${pid}-rgb`} in2="SourceAlpha" operator="in" result={`${pid}-clipped`}/>
                </React.Fragment>
            );
            currentResult = `${pid}-clipped`;
        } else if (e.preset === "caEdges") {
            // Edge-only CA: detect edges, apply CA only there, blend back with interior
            const ew = Number(params.edgeWidth ?? 2);
            nodes.push(
                <React.Fragment key={`cae-${pi}`}>
                    {/* Build edge mask */}
                    <feMorphology in="SourceAlpha" operator="dilate" radius={ew} result={`${pid}-dilate`}/>
                    <feMorphology in="SourceAlpha" operator="erode" radius={Math.max(0, ew - 1)} result={`${pid}-erode`}/>
                    <feComposite in={`${pid}-dilate`} in2={`${pid}-erode`} operator="out" result={`${pid}-edge-mask`}/>
                    {/* Isolate channels */}
                    <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result={`${pid}-src-r`}/>
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result={`${pid}-src-b`}/>
                    {/* Offset channels */}
                    <feOffset in={`${pid}-src-r`} dx={ox} dy={oy} result={`${pid}-r`}/>
                    <feOffset in={`${pid}-src-b`} dx={-ox} dy={-oy} result={`${pid}-b`}/>
                    {/* Recombine R+G+B (G from original) */}
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result={`${pid}-src-g`}/>
                    <feBlend in={`${pid}-r`} in2={`${pid}-src-g`} mode="screen" result={`${pid}-rg`}/>
                    <feBlend in={`${pid}-rg`} in2={`${pid}-b`} mode="screen" result={`${pid}-ca`}/>
                    {/* Apply CA only at edges */}
                    <feComposite in={`${pid}-ca`} in2={`${pid}-edge-mask`} operator="in" result={`${pid}-edge-ca`}/>
                    {/* Keep interior unchanged */}
                    <feComposite in="SourceGraphic" in2={`${pid}-edge-mask`} operator="out" result={`${pid}-interior`}/>
                    {/* Merge */}
                    <feBlend in={`${pid}-interior`} in2={`${pid}-edge-ca`} mode="normal" result={`${pid}-merged`}/>
                    <feComposite in={`${pid}-merged`} in2="SourceAlpha" operator="in"/>
                </React.Fragment>
            );
            currentResult = `${pid}-merged`;
        } else if (e.preset === "turbulence") {
            const scale = Number(params.scale ?? 20);
            const octaves = Number(params.octaves ?? 2);
            const seed = Math.floor(now2 * speed / 500) % 100;
            const disp = intensity * pulse;
            nodes.push(
                <React.Fragment key={`turb-${pi}`}>
                    <feTurbulence type="turbulence" baseFrequency={1/scale} numOctaves={octaves} seed={seed} result={`${pid}-turb`}/>
                    <feDisplacementMap in={currentResult} in2={`${pid}-turb`} scale={disp} xChannelSelector="R" yChannelSelector="G"/>
                </React.Fragment>
            );
        } else if (e.preset === "rgbSplit") {
            // Clean RGB split — no glitch movement, pure channel separation
            const amount = Number(params.amount ?? 4);
            const angle = Number(params.angle ?? 0) * Math.PI / 180;
            const animate = params.animate === true;
            const animPulse = animate ? 0.5 + 0.5 * Math.sin((now2 / 1000) * Math.PI * 2 * speed) : 1;
            const eff = amount * animPulse;
            const rx = Math.cos(angle) * eff;
            const ry = Math.sin(angle) * eff;
            nodes.push(
                <React.Fragment key={`rgb-${pi}`}>
                    <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result={`${pid}-src-r`}/>
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result={`${pid}-src-g`}/>
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result={`${pid}-src-b`}/>
                    <feOffset in={`${pid}-src-r`} dx={rx} dy={ry} result={`${pid}-r`}/>
                    <feOffset in={`${pid}-src-b`} dx={-rx} dy={-ry} result={`${pid}-b`}/>
                    <feBlend in={`${pid}-r`} in2={`${pid}-src-g`} mode="screen" result={`${pid}-rg`}/>
                    <feBlend in={`${pid}-rg`} in2={`${pid}-b`} mode="screen" result={`${pid}-rgb`}/>
                    <feComposite in={`${pid}-rgb`} in2="SourceAlpha" operator="in" result={`${pid}-out`}/>
                </React.Fragment>
            );
            currentResult = `${pid}-out`;
        }
    });

    return (
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            {nodes}
        </filter>
    );
}

function resolveText(text: string, data?: Record<string, string>) {
    if (!data) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        return data[key.trim()] ?? "";
    });
}

function shapeClipPath(shape: string, radius = 0) {
    if (shape === "circle") return "ellipse(50% 50% at 50% 50%)";
    if (shape === "triangle") return "polygon(50% 0%, 100% 100%, 0% 100%)";
    if (shape === "rect" && radius > 0) return undefined;
    return undefined;
}

function renderSvgMaskShape(
    shape: string,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    fill: "white" | "black"
) {
    if (shape === "circle") {
        return (
            <ellipse
                cx={x + w / 2}
                cy={y + h / 2}
                rx={w / 2}
                ry={h / 2}
                fill={fill}
            />
        );
    }

    if (shape === "triangle") {
        return (
            <polygon
                points={`${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`}
                fill={fill}
            />
        );
    }

    return (
        <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={radius}
            ry={radius}
            fill={fill}
        />
    );
}

function renderPathSvg(
    pathD: string,
    style: {
        fill?: string;
        fillOpacity?: number;
        stroke?: string;
        strokeWidth?: number;
        strokeOpacity?: number;
        dash?: number[];
        strokeLineCap?: string;
        strokeLineJoin?: string;
    }
) {
    return (
        <path
            d={pathD}
            fill={style.fill ?? "none"}
            fillOpacity={style.fillOpacity}
            fillRule="evenodd"
            clipRule="evenodd"
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            strokeOpacity={style.strokeOpacity}
            strokeDasharray={style.dash?.join(" ")}
            strokeLinecap={style.strokeLineCap as any}
            strokeLinejoin={style.strokeLineJoin as any}
        />
    );
}

function fillOpacityValue(fill?: OverlayFill) {
    return Math.max(0, Math.min(1, fill?.opacity ?? 1));
}

function stopColor(fill: OverlayGradientFill, stop: { color: string; opacity?: number; position?: number }, index: number) {
    const opacity = Math.max(0, Math.min(1, (stop.opacity ?? 1) * fillOpacityValue(fill)));
    return (
        <stop
            key={`${fill.id ?? fill.type}-${index}`}
            offset={`${Math.max(0, Math.min(100, stop.position ?? (fill.stops.length <= 1 ? 0 : (index / (fill.stops.length - 1)) * 100)))}%`}
            stopColor={stop.color}
            stopOpacity={opacity}
        />
    );
}

function legacyFillStack(element: OverlayBoxElement | OverlayShapeElement | OverlayPathElement | any): OverlayFill[] {
    if (Array.isArray((element as any).fills) && (element as any).fills.length > 0) return (element as any).fills;

    if (element.type === "box") {
        const fills: OverlayFill[] = [];
        if ((element as any).backgroundColor) {
            fills.push({ type: "solid", color: (element as any).backgroundColor, opacity: 1, id: `${element.id}-fill-solid` });
        }
        if ((element as any).pattern?.src) {
            fills.push({ ...(element as any).pattern, type: "pattern", id: `${element.id}-fill-pattern` });
        }
        return fills;
    }

    const fills: OverlayFill[] = [];
    if ((element as any).fillColor) {
        fills.push({
            type: "solid",
            color: (element as any).fillColor,
            opacity: typeof (element as any).fillOpacity === "number" ? (element as any).fillOpacity : 1,
            id: `${element.id}-fill-solid`,
        });
    }
    if ((element as any).pattern?.src) {
        fills.push({ ...(element as any).pattern, type: "pattern", id: `${element.id}-fill-pattern` });
    }
    return fills;
}

function renderFillDefs(
    fills: OverlayFill[],
    scopeId: string,
    width: number,
    height: number
) {
    return fills.map((fill, index) => {
        if (fill.type === "linear") {
            const angle = ((fill.angleDeg ?? 0) * Math.PI) / 180;
            const x1 = 50 - Math.cos(angle) * 50;
            const y1 = 50 - Math.sin(angle) * 50;
            const x2 = 50 + Math.cos(angle) * 50;
            const y2 = 50 + Math.sin(angle) * 50;
            return (
                <linearGradient key={`${scopeId}-linear-${index}`} id={`${scopeId}-linear-${index}`} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}>
                    {fill.stops.map((stop, stopIndex) => stopColor(fill, stop, stopIndex))}
                </linearGradient>
            );
        }

        if (fill.type === "radial") {
            return (
                <radialGradient key={`${scopeId}-radial-${index}`} id={`${scopeId}-radial-${index}`} cx="50%" cy="50%" r="70%">
                    {fill.stops.map((stop, stopIndex) => stopColor(fill, stop, stopIndex))}
                </radialGradient>
            );
        }

        if (fill.type === "conic") {
            return (
                <radialGradient key={`${scopeId}-conic-${index}`} id={`${scopeId}-conic-${index}`} cx="50%" cy="50%" r="70%">
                    {fill.stops.map((stop, stopIndex) => stopColor(fill, stop, stopIndex))}
                </radialGradient>
            );
        }

        if (fill.type === "pattern" && hasPatternSource(fill)) {
            const fit = fill.fit ?? "tile";
            const scale = getPatternScale(fill);
            const opacity = getPatternOpacity(fill) * fillOpacityValue(fill);
            const tileWidth = Math.max(1, width * (scale / 100));
            const tileHeight = Math.max(1, height * (scale / 100));
            const scaledWidth = Math.max(1, width * (scale / 100));
            const scaledHeight = Math.max(1, height * (scale / 100));
            const imageX = (fit === "tile" ? 0 : (width - scaledWidth) / 2) + (fill.offsetX ?? 0);
            const imageY = (fit === "tile" ? 0 : (height - scaledHeight) / 2) + (fill.offsetY ?? 0);
            const rotate = fill.rotationDeg ?? 0;
            return (
                <pattern
                    key={`${scopeId}-pattern-${index}`}
                    id={`${scopeId}-pattern-${index}`}
                    patternUnits="userSpaceOnUse"
                    width={fit === "tile" ? tileWidth : width}
                    height={fit === "tile" ? tileHeight : height}
                    patternTransform={rotate ? `rotate(${rotate} ${width / 2} ${height / 2})` : undefined}
                >
                    <image
                        href={fill.src}
                        x={imageX}
                        y={imageY}
                        width={fit === "tile" ? tileWidth : fit === "stretch" ? width : scaledWidth}
                        height={fit === "tile" ? tileHeight : fit === "stretch" ? height : scaledHeight}
                        preserveAspectRatio={
                            fit === "cover"
                                ? "xMidYMid slice"
                                : fit === "contain"
                                    ? "xMidYMid meet"
                                    : fit === "stretch"
                                        ? "none"
                                        : "none"
                        }
                        opacity={opacity}
                    />
                </pattern>
            );
        }

        return null;
    });
}

function renderFillLayers(pathD: string, fills: OverlayFill[], scopeId: string) {
    return fills.map((fill, index) => {
        const key = `${scopeId}-fill-${index}`;
        if (fill.type === "solid") {
            return <React.Fragment key={key}>{renderPathSvg(pathD, {
                fill: fill.color,
                fillOpacity: fillOpacityValue(fill),
            })}</React.Fragment>;
        }
        if (fill.type === "linear") {
            return <React.Fragment key={key}>{renderPathSvg(pathD, { fill: `url(#${scopeId}-linear-${index})` })}</React.Fragment>;
        }
        if (fill.type === "radial") {
            return <React.Fragment key={key}>{renderPathSvg(pathD, { fill: `url(#${scopeId}-radial-${index})` })}</React.Fragment>;
        }
        if (fill.type === "conic") {
            return <React.Fragment key={key}>{renderPathSvg(pathD, { fill: `url(#${scopeId}-conic-${index})` })}</React.Fragment>;
        }
        if (fill.type === "pattern" && hasPatternSource(fill)) {
            return <React.Fragment key={key}>{renderPathSvg(pathD, { fill: `url(#${scopeId}-pattern-${index})` })}</React.Fragment>;
        }
        if (fill.type === "texture") {
            // Texture fills are rendered via child image elements, not as SVG fills
            // Skip rendering the fill entirely - the child will render on top
            return null;
        }
        return null;
    });
}

function resolveRectCornerRadii(
    width: number,
    height: number,
    radius: number,
    cornerRadii?: { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number }
) {
    const maxRadius = Math.min(width, height) / 2;
    return {
        topLeft: Math.max(0, Math.min(cornerRadii?.topLeft ?? radius, maxRadius)),
        topRight: Math.max(0, Math.min(cornerRadii?.topRight ?? radius, maxRadius)),
        bottomRight: Math.max(0, Math.min(cornerRadii?.bottomRight ?? radius, maxRadius)),
        bottomLeft: Math.max(0, Math.min(cornerRadii?.bottomLeft ?? radius, maxRadius)),
    };
}

function perSideStrokeRects(
    width: number,
    height: number,
    strokeWidth: number,
    align: OverlayStrokeAlign,
    sides?: OverlayStrokeSides
) {
    const selected = {
        top: sides?.top ?? true,
        right: sides?.right ?? true,
        bottom: sides?.bottom ?? true,
        left: sides?.left ?? true,
    };
    const insideOffset = align === "outside" ? -strokeWidth : align === "center" ? -strokeWidth / 2 : 0;
    const entries: Array<{ key: "top" | "right" | "bottom" | "left"; x: number; y: number; width: number; height: number }> = [];
    if (selected.top) entries.push({ key: "top", x: 0, y: insideOffset, width, height: strokeWidth });
    if (selected.right) entries.push({ key: "right", x: width - strokeWidth - insideOffset, y: 0, width: strokeWidth, height });
    if (selected.bottom) entries.push({ key: "bottom", x: 0, y: height - strokeWidth - insideOffset, width, height: strokeWidth });
    if (selected.left) entries.push({ key: "left", x: insideOffset, y: 0, width: strokeWidth, height });
    return entries;
}

function renderRectPerSideStroke(
    width: number,
    height: number,
    strokeWidth: number,
    stroke: string,
    strokeOpacity: number,
    dash: number[] | undefined,
    align: OverlayStrokeAlign,
    sides?: OverlayStrokeSides
) {
    const dashPattern = dash?.join(" ");
    return perSideStrokeRects(width, height, strokeWidth, align, sides).map((rect) => (
        <rect
            key={`side-${rect.key}`}
            x={rect.x}
            y={rect.y}
            width={Math.max(0, rect.width)}
            height={Math.max(0, rect.height)}
            fill={stroke}
            fillOpacity={strokeOpacity}
            stroke={dashPattern ? stroke : undefined}
            strokeWidth={dashPattern ? 0 : undefined}
            strokeDasharray={dashPattern}
        />
    ));
}

function renderAlignedPathStroke(
    pathD: string,
    pathId: string,
    style: {
        stroke?: string;
        strokeWidth?: number;
        strokeOpacity?: number;
        dash?: number[];
        strokeLineCap?: string;
        strokeLineJoin?: string;
        strokeAlign?: OverlayStrokeAlign;
    },
    closed: boolean
) {
    if (!style.stroke || !style.strokeWidth || style.strokeWidth <= 0) return null;
    const align = style.strokeAlign ?? "center";
    if (align === "center" || !closed) {
        return renderPathSvg(pathD, style);
    }

    const expandedWidth = style.strokeWidth * 2;
    if (align === "inside") {
        return (
            <>
                <defs>
                    <clipPath id={`${pathId}-inside-clip`}>
                        <path d={pathD} />
                    </clipPath>
                                {renderParentClipPaths(elements, elementsById)}
</defs>
                <path
                    d={pathD}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={expandedWidth}
                    strokeOpacity={style.strokeOpacity}
                    strokeDasharray={style.dash?.join(" ")}
                    strokeLinecap={style.strokeLineCap as any}
                    strokeLinejoin={style.strokeLineJoin as any}
                    clipPath={`url(#${pathId}-inside-clip)`}
                />
            </>
        );
    }

    return (
        <>
            <defs>
                <mask id={`${pathId}-outside-mask`}>
                    <rect x="-100%" y="-100%" width="300%" height="300%" fill="white" />
                    <path d={pathD} fill="black" />
                </mask>
            </defs>
            <path
                d={pathD}
                fill="none"
                stroke={style.stroke}
                strokeWidth={expandedWidth}
                strokeOpacity={style.strokeOpacity}
                strokeDasharray={style.dash?.join(" ")}
                strokeLinecap={style.strokeLineCap as any}
                strokeLinejoin={style.strokeLineJoin as any}
                mask={`url(#${pathId}-outside-mask)`}
            />
        </>
    );
}

// ── Parametric Effect Overlay ─────────────────────────────────────────────────
// Hook: animated CSS style for parametric effects
// Uses a ref to store current style so it's always up-to-date without state lag
function useParametricCss(effects: OverlayEffect[]): React.CSSProperties {
    const styleRef = React.useRef<React.CSSProperties>({});
    const [, forceUpdate] = React.useState(0);
    const rafRef = React.useRef<number | null>(null);
    const effectsRef = React.useRef(effects);
    effectsRef.current = effects;

    React.useEffect(() => {
        const getCssEffects = () => (effectsRef.current ?? []).filter((e: any) =>
            e.type === "parametric" && e.enabled !== false &&
            EFFECT_PRESETS[(e as any).preset]?.produces.includes("css")
        ) as any[];

        // Always start the loop — effects may be added after mount
        const start = performance.now();
        const loop = () => {
            const active = getCssEffects();
            if (!active.length) {
                if (Object.keys(styleRef.current).length > 0) {
                    styleRef.current = {};
                    forceUpdate(n => n + 1);
                }
                rafRef.current = requestAnimationFrame(loop);
                return;
            }
            const t = performance.now() - start;
            let filterParts: string[] = [];
            let combined: React.CSSProperties = {};
            for (const e of active) {
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
            styleRef.current = combined;
            forceUpdate(n => n + 1);
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } styleRef.current = {}; };
    }, []); // Run once, reads effects via ref

    return styleRef.current;
}

// Drives re-renders of ElementRenderer every frame when svgFilter/svgOverlay effects are active
function useParametricRafTick(effects: OverlayEffect[]): number {
    const [tick, setTick] = React.useState(0);
    const effectsRef = React.useRef(effects);
    effectsRef.current = effects;
    React.useEffect(() => {
        let raf: number;
        const loop = () => {
            const active = (effectsRef.current ?? []).filter((e: any) =>
                e.type === "parametric" && e.enabled !== false &&
                (EFFECT_PRESETS[e.preset]?.produces.includes("svgFilter") ||
                 EFFECT_PRESETS[e.preset]?.produces.includes("svgOverlay"))
            );
            if (active.length) setTick(t => t + 1);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
    return tick;
}



// ── Text-to-SVG-path via canvas alpha trace ───────────────────────────────────
const _textPathCache = new Map<string, string>();

function traceTextToSvgPath(
    text: string,
    fontStack: string,
    fontSize: number,
    fontWeight: number,
    width: number,
    height: number,
    align: string
): string {
    const key = `v2|${text}|${fontStack}|${fontSize}|${fontWeight}|${width}|${height}|${align}`;
    if (_textPathCache.has(key)) return _textPathCache.get(key)!;

    const fallback = `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;

    try {
        // Render at 2x for better edge quality, then scale back
        const scale = 2;
        const cw = Math.round(width * scale);
        const ch = Math.round(height * scale);
        const fs = fontSize * scale;

        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d")!;
        ctx.font = `${fontWeight} ${fs}px ${fontStack}`;
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        if (align === "center") { ctx.textAlign = "center"; ctx.fillText(text, cw / 2, ch / 2, cw - 16 * scale); }
        else if (align === "right") { ctx.textAlign = "right"; ctx.fillText(text, cw - 8 * scale, ch / 2, cw - 16 * scale); }
        else { ctx.textAlign = "left"; ctx.fillText(text, 8 * scale, ch / 2, cw - 16 * scale); }

        const raw = ctx.getImageData(0, 0, cw, ch).data;

        // Build binary alpha grid
        const grid = new Uint8Array(cw * ch);
        for (let i = 0; i < cw * ch; i++) grid[i] = raw[i * 4 + 3] > 32 ? 1 : 0;

        // Morphological dilation — expand by ~1.5px to merge nearby glyphs into one blob
        // Keep small so the path stays close to the actual text boundary
        const dilateR = Math.round(1.5 * scale);
        const dilated = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                if (grid[y * cw + x]) { dilated[y * cw + x] = 1; continue; }
                outer: for (let dy = -dilateR; dy <= dilateR; dy++) {
                    for (let dx = -dilateR; dx <= dilateR; dx++) {
                        if (dx * dx + dy * dy > dilateR * dilateR) continue;
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < cw && ny >= 0 && ny < ch && grid[ny * cw + nx]) {
                            dilated[y * cw + x] = 1; break outer;
                        }
                    }
                }
            }
        }

        // Moore neighborhood contour tracing (single outer boundary)
        // Find topmost-leftmost foreground pixel as start
        let startX = -1, startY = -1;
        outer2: for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                if (dilated[y * cw + x]) { startX = x; startY = y; break outer2; }
            }
        }
        if (startX === -1) { _textPathCache.set(key, fallback); return fallback; }

        // 8-directional Moore tracing
        const dx8 = [-1, -1, 0, 1, 1, 1, 0, -1];
        const dy8 = [0, -1, -1, -1, 0, 1, 1, 1];
        const contour: [number, number][] = [];
        let cx2 = startX, cy2 = startY;
        // Entry direction: came from left (dir=0 means we check from left)
        let dir = 6; // start checking from bottom-left
        const maxSteps = cw * ch;
        let steps = 0;

        do {
            contour.push([cx2, cy2]);
            // Find next boundary pixel by rotating clockwise from backtrack direction
            const backDir = (dir + 4) % 8;
            let found = false;
            for (let i = 1; i <= 8; i++) {
                const checkDir = (backDir + i) % 8;
                const nx = cx2 + dx8[checkDir];
                const ny = cy2 + dy8[checkDir];
                if (nx >= 0 && nx < cw && ny >= 0 && ny < ch && dilated[ny * cw + nx]) {
                    dir = checkDir;
                    cx2 = nx; cy2 = ny;
                    found = true;
                    break;
                }
            }
            if (!found) break;
            steps++;
        } while ((cx2 !== startX || cy2 !== startY) && steps < maxSteps);

        if (contour.length < 4) { _textPathCache.set(key, fallback); return fallback; }

        // Simplify contour using Ramer-Douglas-Peucker
        function rdp(pts: [number, number][], eps: number): [number, number][] {
            if (pts.length <= 2) return pts;
            let maxD = 0, maxI = 0;
            const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
            const len = Math.hypot(x2 - x1, y2 - y1);
            for (let i = 1; i < pts.length - 1; i++) {
                const d = len < 0.001
                    ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1)
                    : Math.abs((y2 - y1) * pts[i][0] - (x2 - x1) * pts[i][1] + x2 * y1 - y2 * x1) / len;
                if (d > maxD) { maxD = d; maxI = i; }
            }
            if (maxD > eps) {
                const l = rdp(pts.slice(0, maxI + 1), eps);
                const r = rdp(pts.slice(maxI), eps);
                return [...l.slice(0, -1), ...r];
            }
            return [pts[0], pts[pts.length - 1]];
        }

        const simplified = rdp(contour, 1.2 * scale);

        // Scale back to element coordinates and build SVG path
        const inv = 1 / scale;
        let d = `M ${(simplified[0][0] * inv).toFixed(1)} ${(simplified[0][1] * inv).toFixed(1)}`;
        for (let i = 1; i < simplified.length; i++) {
            d += ` L ${(simplified[i][0] * inv).toFixed(1)} ${(simplified[i][1] * inv).toFixed(1)}`;
        }
        d += " Z";

        _textPathCache.set(key, d);
        return d;
    } catch (e) {
        _textPathCache.set(key, fallback);
        return fallback;
    }
}

function useTextShapePath(
    text: string,
    fontStack: string,
    fontSize: number,
    fontWeight: number,
    width: number,
    height: number,
    align: string,
    hasPathEffects: boolean
): string {
    const [path, setPath] = React.useState("");
    React.useEffect(() => {
        if (!hasPathEffects || !text || typeof document === "undefined") return;
        // Wait for font to be ready
        const compute = () => {
            const p = traceTextToSvgPath(text, fontStack, fontSize, fontWeight, width, height, align);
            setPath(p);
        };
        if ((document as any).fonts?.ready) {
            (document as any).fonts.ready.then(compute);
        } else {
            setTimeout(compute, 300);
        }
    }, [text, fontStack, fontSize, fontWeight, width, height, align, hasPathEffects]);
    return path;
}

function ParametricEffectOverlay({
    effects, width, height, elementId, borderRadius = 0, shapePath = "",
}: {
    effects: OverlayEffect[]; width: number; height: number;
    elementId: string; borderRadius?: number; shapePath?: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const [tick, setTick] = useState(0);

    const parametric = effects.filter(e => e.type === "parametric" && e.enabled !== false) as any[];
    const canvasEffects = parametric.filter(e => EFFECT_PRESETS[e.preset]?.produces.includes("canvas"));
    const svgEffects = parametric.filter(e => EFFECT_PRESETS[e.preset]?.produces.includes("svgOverlay"));
    const cssEffects = parametric.filter(e => EFFECT_PRESETS[e.preset]?.produces.includes("css"));
    const svgEffectsRef = useRef(svgEffects);
    svgEffectsRef.current = svgEffects;

    // CSS effects: animate via React state, rendered as overlay
    const [cssOverlayStyle, setCssOverlayStyle] = useState<React.CSSProperties>({});
    useEffect(() => {
        if (!cssEffects.length) { setCssOverlayStyle({}); return; }
        let raf: number;
        const start = performance.now();
        const loop = () => {
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
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(raf); setCssOverlayStyle({}); };
    }, [cssEffects.map((e: any) => e.id ?? e.preset).join(",")]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !canvasEffects.length) return;
        const startTime = performance.now();
        const loop = () => {
            const t = performance.now() - startTime;
            const ctx = canvas.getContext("2d");
            if (!ctx) { rafRef.current = requestAnimationFrame(loop); return; }

            // Clear the full canvas BEFORE any clipping — clearRect ignores clip regions
            ctx.clearRect(0, 0, width, height);

            for (const e of canvasEffects) {
                const params = e.keyframes?.length ? interpolateParams(e.params, e.keyframes, t, e.duration ?? 1000) : e.params;
                const clipMode = String(params.clipMode ?? "none");
                ctx.save();
                if (shapePath && clipMode !== "none") {
                    try {
                        if (clipMode === "surface") {
                            // Clip to the filled material of the shape, excluding boolean voids.
                            // evenodd correctly handles boolean subtract/intersect holes.
                            const p2d = new Path2D(shapePath);
                            ctx.clip(p2d, "evenodd");
                        } else if (clipMode === "space") {
                            // Clip to interior voids only (holes cut by boolean operations).
                            // bbox + shape with evenodd makes the shape area the "hole".
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
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
            cleanupParticleState(elementId);
            cleanupSnowState(elementId);
            cleanupRainState(elementId);
            cleanupFireState(elementId);
            cleanupTrailState(elementId);
            cleanupGrainState(elementId);
        };
    }, [canvasEffects.map((e: any) => e.id ?? e.preset).join(","), width, height, elementId]);

    useEffect(() => {
        // Always run — svgEffects may be added after mount
        let raf: number;
        const loop = () => { if (svgEffectsRef.current.length) setTick(t => t + 1); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

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
                                {/* Surface clip: effect on solid material only (evenodd excludes holes) */}
                                <clipPath id={`peo-clip-${elementId}`} clipPathUnits="userSpaceOnUse">
                                    <path d={shapePath} clipRule="evenodd" fillRule="evenodd" />
                                </clipPath>
                                {/* Space clip: effect in voids/holes only (bbox minus shape) */}
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
                        // clipMode: "surface" = clip to shape path (positive material only)
                        //           "space"   = clip to bounding box (fills holes too)
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



// Helper: Render SVG clipPath for parent clipping
function renderParentClipPaths(elements: OverlayElement[], elementsById: Record<string, OverlayElement>): JSX.Element[] {
    const clipPaths: JSX.Element[] = [];
    
    elements.forEach(el => {
        if (el.clip && (el.clip as any).type === "parent") {
            const parentEl = (el as any).parentId ? elementsById[(el as any).parentId] : null;
            if (parentEl && parentEl.type === "path") {
                const clipPathId = `clip-${el.id}`;
                const pathData = (parentEl as any).path;
                // Calculate the transform to position the clipPath
                // The clipPath needs to be at the parent's position
                const parentX = parentEl.x ?? 0;
                const parentY = parentEl.y ?? 0;
                const childX = (el as any).x ?? 0;
                const childY = (el as any).y ?? 0;
                
                // The offset is the difference between parent and child positions
                const offsetX = parentX - childX;
                const offsetY = parentY - childY;
                
                clipPaths.push(
                    <clipPath key={clipPathId} id={clipPathId} clipPathUnits="userSpaceOnUse">
                        <path d={pathData} transform={`translate(${offsetX}, ${offsetY})`} />
                    </clipPath>
                );
            }
        }
    });
    
    return clipPaths;
}

/** Editor widget preview node - uses registered React renderer */
/**
 * WidgetRuntimeNode — handles both unified-state and IIFE-state widgets in runtime mode.
 * - Unified path: renders directly from widgetStates prop (no event listening needed)
 * - IIFE path: listens for scraplet:widget:state events, dispatches scraplet:widget:ready
 */
function WidgetRuntimeNode({ baseStyle, w, h, has3D, widgetId, instanceId, Renderer, unifiedState }: {
    baseStyle: React.CSSProperties;
    w: number; h: number; has3D: boolean;
    widgetId: string; instanceId: string;
    Renderer: any;
    unifiedState?: Record<string, any>;
}) {
    const [iifeState, setIifeState] = useState<Record<string, any>>({});

    // Dispatch ready synchronously before paint so IIFE scripts that load fast can respond
    useLayoutEffect(() => {
        window.dispatchEvent(new CustomEvent('scraplet:widget:ready', {
            detail: { widgetId, instanceId }
        }));
    }, [widgetId, instanceId]);

    useEffect(() => {
        function handleState(e: Event) {
            const detail = (e as CustomEvent).detail;
            if (detail?.widgetId === widgetId || detail?.instanceId === instanceId) {
                setIifeState(detail.state || {});
            }
        }
        // Add listener FIRST, then dispatch ready — ticker re-emits synchronously on ready
        window.addEventListener('scraplet:widget:state', handleState);

        // Dispatch ready again now that listener is attached
        const dispatchReady = () => window.dispatchEvent(new CustomEvent('scraplet:widget:ready', {
            detail: { widgetId, instanceId }
        }));
        dispatchReady();
        const t1 = window.setTimeout(dispatchReady, 200);
        const t2 = window.setTimeout(dispatchReady, 800);

        return () => {
            window.removeEventListener('scraplet:widget:state', handleState);
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [widgetId, instanceId]);

    const state = unifiedState && Object.keys(unifiedState).length > 0 ? unifiedState : iifeState;

    return (
        <div
            style={{ ...baseStyle, width: w, height: h, overflow: has3D ? 'visible' : 'hidden', pointerEvents: 'none', position: 'absolute' }}
            data-element-id={instanceId}
            data-widget-id={widgetId}
        >
            {Renderer && Object.keys(state).length > 0 && (
                <Renderer state={state} config={{ instanceId }} width={w} height={h} />
            )}
        </div>
    );
}

function WidgetEditorNode({ baseStyle, w, h, has3D, widgetId, instanceId, initialState, Renderer }: {
    baseStyle: React.CSSProperties;
    w: number; h: number; has3D: boolean;
    widgetId: string; instanceId: string;
    initialState: Record<string, any>;
    Renderer: any;
}) {
    const [widgetState, setWidgetState] = useState<Record<string, any>>(initialState);

    useEffect(() => {
        function handleState(e: Event) {
            const detail = (e as CustomEvent).detail;
            if (detail?.widgetId === widgetId) {
                setWidgetState(detail.state);
            }
        }
        window.addEventListener('scraplet:widget:state', handleState);
        window.dispatchEvent(new CustomEvent('scraplet:widget:ready', {
            detail: { widgetId, instanceId }
        }));
        return () => window.removeEventListener('scraplet:widget:state', handleState);
    }, [widgetId, instanceId]);

    return (
        <div style={{ ...baseStyle, width: w, height: h, position: 'absolute', overflow: has3D ? 'visible' : 'hidden', isolation: 'isolate', pointerEvents: 'auto' }}
             data-widget-editor-preview={widgetId}
             data-widget-instance-id={instanceId}>
            {Object.keys(widgetState).length > 0 && (
                <Renderer state={widgetState} config={{ instanceId }} width={w} height={h} />
            )}
        </div>
    );
}

export function ElementRenderer({
    element,
    elementsById,
    overlayComponents,
    animationPhase,
    animationPhases,
    data,
    yOffset = 0,
    layout = "absolute",
    visited,
    overlayPublicId,
    elementIndex,
    widgetStates,
}: {
    element: OverlayElement;
    elementsById?: Record<string, OverlayElement>;
    overlayComponents?: OverlayComponentDef[];
    animationPhase?: OverlayAnimationPhase;
    animationPhases?: ElementAnimationPhaseMap;
    data?: Record<string, any>;
    yOffset?: number;
    layout?: "absolute" | "fill";
    visited?: Set<string>;
    overlayPublicId?: string;
    elementIndex?: number;
    widgetStates?: Record<string, any>;
}) {
    const patternScopeId = sanitizeSvgId(useId());
    let el = element as any;

    if (el.bindings && data) {
        const overrides: any = {};
        for (const [propPath, binding] of Object.entries(el.bindings)) {
            if (binding && typeof binding === "object" && (binding as any).mode === "dynamic") {
                overrides[propPath] = resolveBinding(binding as any, data);
            } else if (typeof binding === "string") {
                const val = data[binding];
                if (val !== undefined) overrides[propPath] = val;
            }
        }
        if (Object.keys(overrides).length > 0) {
            el = { ...el, ...overrides };
        }
    }

    const effectiveAnimationPhase =
        animationPhase ?? (el.visible === false ? "hidden" : "visible");

    const baseStyle: React.CSSProperties =
        layout === "fill"
            ? {
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                transition: getAnimationTransition(el.animation, effectiveAnimationPhase),
            }
            : {
                position: "absolute",
                left: el.x,
                top: el.y + yOffset,
                width: el.width,
                height: el.height,
                zIndex: elementIndex ?? undefined,
                transition: getAnimationTransition(el.animation, effectiveAnimationPhase),
            };

    Object.assign(baseStyle, getAnimationStyle(el.animation, effectiveAnimationPhase));




    // Apply parametric CSS effects directly to the element's baseStyle
    const _legacyEffects: OverlayEffect[] = Array.isArray(el.effects) ? el.effects : [];
    const _parametricAsEffects: OverlayEffect[] = Array.isArray((el as any).parametricEffects)
      ? (el as any).parametricEffects.map((pe: any) => ({ ...pe, type: 'parametric' } as any))
      : [];
    const _elEffects: OverlayEffect[] = [..._legacyEffects, ..._parametricAsEffects];
    const _paramCss = useParametricCss(_elEffects);
    useParametricRafTick(_elEffects); // drives re-renders for svgFilter/svgOverlay effects
    if (Object.keys(_paramCss).length > 0) {
        // Only apply safe properties that won't break layout
        // transform: combine additively (never override with "none")
        const paramTransform = (_paramCss as any).transform;
        if (paramTransform && paramTransform !== "none") {
            const existingTransform = (baseStyle as any).transform;
            (baseStyle as any).transform = existingTransform
                ? `${existingTransform} ${paramTransform}`
                : paramTransform;
            (baseStyle as any).transformOrigin = "center center";
        }
        // filter: append to existing
        if (_paramCss.filter) {
            const existing = (baseStyle as any).filter;
            (baseStyle as any).filter = existing ? `${existing} ${_paramCss.filter}` : _paramCss.filter;
        }
        // opacity: multiply
        if (_paramCss.opacity !== undefined) {
            const existing = typeof (baseStyle as any).opacity === "number" ? (baseStyle as any).opacity : 1;
            (baseStyle as any).opacity = existing * Number(_paramCss.opacity);
        }
        // clipPath: apply directly (text reveal)
        if ((_paramCss as any).clipPath) {
            (baseStyle as any).clipPath = (_paramCss as any).clipPath;
        }
        // boxShadow: apply directly (neon pulse)
        if ((_paramCss as any).boxShadow) {
            (baseStyle as any).boxShadow = (_paramCss as any).boxShadow;
        }
        // backdropFilter: apply directly (blur pulse)
        if ((_paramCss as any).backdropFilter) {
            (baseStyle as any).backdropFilter = (_paramCss as any).backdropFilter;
        }
        // outline: apply directly (glitch color shift)
        if ((_paramCss as any).outline) {
            (baseStyle as any).outline = (_paramCss as any).outline;
            (baseStyle as any).outlineOffset = (_paramCss as any).outlineOffset;
        }
        // backgroundImage/Position/Size: apply directly (scanlineStatic)
        if ((_paramCss as any).backgroundImage) {
            (baseStyle as any).backgroundImage = (_paramCss as any).backgroundImage;
            (baseStyle as any).backgroundPosition = (_paramCss as any).backgroundPosition;
            (baseStyle as any).backgroundSize = (_paramCss as any).backgroundSize;
        }
    }

    // Use canonical transform resolver for 1:1 parity with runtime
    const _tiltX = (el as any).tiltX ?? 0;
    const _tiltY = (el as any).tiltY ?? 0;
    const _skewX = (el as any).skewX ?? 0;
    const _skewY = (el as any).skewY ?? 0;
    const has3D = _tiltX !== 0 || _tiltY !== 0 || _skewX !== 0 || _skewY !== 0;
    
    const canonicalTransform = resolveElementTransform({
        x: (el as any).x ?? 0,
        y: (el as any).y ?? 0,
        width: el.width ?? 0,
        height: el.height ?? 0,
        rotationDeg: el.rotationDeg,
        scaleX: (el as any).scaleX,
        scaleY: (el as any).scaleY,
        tiltX: _tiltX,
        tiltY: _tiltY,
        skewX: _skewX,
        skewY: _skewY,
        perspective: (el as any).perspective
    });
    
    if (canonicalTransform !== 'none') {
        (baseStyle as any).transform = canonicalTransform;
        (baseStyle as any).transformOrigin = 'center center';
    }

    const effects = getElementEffects(el);

    const clipStyle: React.CSSProperties = {};
    if (el.clip && el.clip.type !== "none") {
        clipStyle.overflow = "hidden";
        if (el.clip.type === "circle") {
            clipStyle.borderRadius = "9999px";
        } else if (el.clip.type === "roundRect") {
            if (typeof el.clip.radius === "number") {
                clipStyle.borderRadius = el.clip.radius;
            }
        } else if (el.clip.type === "parent") {
            // Parent clipping: use CSS clip-path: path() with path translated to child's local space
            const parentEl = (el as any).parentId ? elementsById[(el as any).parentId] : null;
            if (parentEl && parentEl.type === "path") {
                const parentPath = elementToOverlayPath(parentEl as any);
                if (parentPath) {
                    // Parent path is in 0..parentW, 0..parentH local space.
                    // Child element is at (childX, childY) in canvas space.
                    // Parent element is at (parentX, parentY) in canvas space.
                    // CSS clip-path: path() is in element-local space (0,0 = top-left of element).
                    // So translate by (parentX - childX, parentY - childY).
                    const parentX = (parentEl as any).x ?? 0;
                    const parentY = (parentEl as any).y ?? 0;
                    const childX = (el as any).x ?? 0;
                    const childY = (el as any).y ?? 0;
                    const dx = parentX - childX;
                    const dy = parentY - childY;
                    const translatedPath = dx !== 0 || dy !== 0
                        ? translateOverlayPath(parentPath, dx, dy)
                        : parentPath;
                    const clipD = svgPathFromCommands(translatedPath);
                    clipStyle.clipPath = `path('${clipD}')`;
                    clipStyle.overflow = undefined;
                }
            }
        }
    }

    const innerStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        opacity: typeof el.opacity === "number" ? el.opacity : 1,
        ...clipStyle,
        transition: "inherit",
    };

    const resolveMaskPathInfo = (maskShape: OverlayElement) => {
        const resolved = resolveElementGeometry(maskShape, elementsById);
        if (!resolved) return null;
        const localD = svgPathFromCommands(resolved.path);
        return {
            d: localD,
            bounds: resolved.bounds,
        };
    };

    // COMPONENT INSTANCE
    if (el.type === "componentInstance") {
        const inst = el as OverlayComponentInstanceElement;

        if (visited && visited.has(el.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(el.id);

        const def = overlayComponents?.find((c) => c.id === inst.componentId);
        if (!def) {
            return (
                <div data-element-id={el.id} style={baseStyle}>
                    <div
                        style={{
                            ...innerStyle,
                            border: "2px dashed red",
                            background: "rgba(255,0,0,0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "red",
                            fontSize: 10,
                        }}
                    >
                        Missing Component
                    </div>
                </div>
            );
        }

        const mergedData = { ...data, ...inst.propOverrides };
        const masterElementsById = Object.fromEntries(def.elements.map((e) => [e.id, e]));

        const childIds = new Set<string>();
        def.elements.forEach((c) => {
            if ((c.type === "group" || c.type === "frame" || c.type === "mask" || c.type === "boolean") && Array.isArray((c as any).childIds)) {
                (c as any).childIds.forEach((cid: string) => childIds.add(cid));
            }
        });

        const roots = def.elements.filter((e) => !childIds.has(e.id));

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={{ ...innerStyle, position: "relative" }}>
                    {roots.map((child) => (
                        <ElementRenderer
                            key={child.id}
                            element={child}
                            elementsById={masterElementsById}
                            overlayComponents={overlayComponents}
                            animationPhase={undefined}
                            data={mergedData}
                            layout="absolute"
                            visited={nextVisited}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // MASK
    if (el.type === "mask") {
        const maskGroup = el as OverlayMaskElement;
        const maskShapeId = maskGroup.childIds?.[0];
        const contentId = maskGroup.childIds?.[1];

        const maskEl = elementsById?.[maskShapeId] as OverlayElement | undefined;
        const contentEl = contentId ? elementsById?.[contentId] : undefined;

        if (!maskEl || !contentEl) return null;

        if (visited && visited.has(el.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(el.id);

        const invert = !!(maskGroup as any).invert;

        const gx = el.x ?? 0;
        const gy = el.y ?? 0;

        const maskPathInfo = resolveMaskPathInfo(maskEl);
        if (!maskPathInfo) return null;
        const mx = maskPathInfo.bounds.x - gx;
        const my = maskPathInfo.bounds.y - gy;
        const mw = maskPathInfo.bounds.width;
        const mh = maskPathInfo.bounds.height;
        const localMaskD =
            maskEl.type === "boolean"
                ? maskPathInfo.d
                : svgPathFromCommands(
                    {
                        commands: (elementToOverlayPath(maskEl)?.commands ?? []).map((command) => {
                            if (command.type === "close") return command;
                            if (command.type === "curve") {
                                return {
                                    ...command,
                                    x1: command.x1 + mx,
                                    y1: command.y1 + my,
                                    x2: command.x2 + mx,
                                    y2: command.y2 + my,
                                    x: command.x + mx,
                                    y: command.y + my,
                                };
                            }
                            return { ...command, x: command.x + mx, y: command.y + my };
                        }),
                    }
                );

        const offsetX = (contentEl.x ?? 0) - (maskEl.x ?? 0);
        const offsetY = (contentEl.y ?? 0) - (maskEl.y ?? 0);
        const contentW = contentEl.width ?? mw;
        const contentH = contentEl.height ?? mh;
        const svgMaskId = `mask-${el.id}`;

        const groupW = el.width ?? 0;
        const groupH = el.height ?? 0;

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={{ ...innerStyle, position: "relative", overflow: "hidden" }}>
                    <svg
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${groupW} ${groupH}`}
                        preserveAspectRatio="none"
                        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    >
                        <defs>
                            <mask id={svgMaskId} maskUnits="userSpaceOnUse">
                                <rect x="0" y="0" width={groupW} height={groupH} fill={invert ? "white" : "black"} />
                                <path d={localMaskD} fill={invert ? "black" : "white"} />
                            </mask>
                        </defs>

                        <foreignObject
                            x="0"
                            y="0"
                            width={groupW}
                            height={groupH}
                            mask={`url(#${svgMaskId})`}
                        >
                            <div
                                style={{
                                    position: "relative",
                                    width: `${groupW}px`,
                                    height: `${groupH}px`,
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        position: "absolute",
                                        left: (contentEl.x ?? 0) - gx,
                                        top: (contentEl.y ?? 0) - gy,
                                        width: contentW,
                                        height: contentH,
                                    }}
                                >
                                    <ElementRenderer
                                        element={contentEl}
                                        elementsById={elementsById}
                                        overlayComponents={overlayComponents}
                                        animationPhase={animationPhases?.[contentEl.id]?.phase}
                                        animationPhases={animationPhases}
                                        data={data}
                                        layout="fill"
                                        visited={nextVisited}
                                    />
                                </div>
                            </div>
                        </foreignObject>
                    </svg>
                </div>
            </div>
        );
    }

    // GROUP
    if (el.type === "group" || el.type === "frame") {
        const group = el as OverlayGroupElement | OverlayFrameElement;

        if (visited && visited.has(el.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(el.id);

        const groupStyle: React.CSSProperties = {
            ...innerStyle,
            backgroundColor: group.backgroundColor,
            borderRadius: group.borderRadiusPx,
            border: group.borderWidth
                ? `${group.borderWidth}px solid ${group.borderColor}`
                : undefined,
            position: "relative",
            overflow: el.type === "frame" && (group as OverlayFrameElement).clipContent !== false && !has3D ? "hidden" : undefined,
            mixBlendMode: (group as any).blendMode && (group as any).blendMode !== "normal" ? (group as any).blendMode as any : undefined,
        };

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={groupStyle}>
                    {group.childIds?.map((childId) => {
                        const child = elementsById?.[childId];
                        if (!child) return null;

                        const relX = (child.x ?? 0) - (el.x ?? 0);
                        const relY = (child.y ?? 0) - (el.y ?? 0);

                        const relChild = {
                            ...child,
                            x: relX,
                            y: relY,
                        };

                        return (
                            <ElementRenderer
                                key={child.id}
                                element={relChild}
                                elementsById={elementsById}
                                overlayComponents={overlayComponents}
                                animationPhase={animationPhases?.[child.id]?.phase}
                                animationPhases={animationPhases}
                                data={data}
                                layout="absolute"
                                visited={nextVisited}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    // BOX
    if (el.type === "box") {
        const box = el as OverlayBoxElement;
        const w = Math.max(1, box.width ?? 1);
        const h = Math.max(1, box.height ?? 1);
        const boxPath = elementToOverlayPath(box);
        const pathD = svgPathFromCommands(boxPath ?? { commands: [] });
        const fills = legacyFillStack(box);
        const fillScopeId = `box-fill-${patternScopeId}-${box.id}`;
        const effectFilterId = sanitizeSvgId(`box-effect-${patternScopeId}-${box.id}`);
        const strokeWidth = box.strokeWidthPx ?? 0;
        const strokeOpacity = typeof box.strokeOpacity === "number" ? box.strokeOpacity : 1;
        const strokeAlign = box.strokeAlign ?? "center";

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={{ ...innerStyle, opacity: undefined, position: "relative", overflow: "visible" }}>
                    <div style={{ position: 'absolute', inset: 0, opacity: typeof el.opacity === 'number' ? el.opacity : 1, overflow: 'visible' }}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId, performance.now())}
                        </defs>
                        <g filter={effects.filter(e => (e as any).type !== "parametric" || EFFECT_PRESETS[(e as any).preset]?.produces.includes("svgFilter")).length ? `url(#${effectFilterId})` : undefined}>
                            {pathD && renderFillLayers(pathD, fills, fillScopeId)}
                            {box.strokeSides && strokeWidth > 0 && Object.values(box.strokeSides).some(v => v === false)
                                ? renderRectPerSideStroke(
                                      w,
                                      h,
                                      strokeWidth,
                                      box.strokeColor ?? "rgba(255,255,255,0.9)",
                                      strokeOpacity,
                                      box.strokeDash,
                                      strokeAlign,
                                      box.strokeSides
                                  )
                                : renderAlignedPathStroke(
                                      pathD,
                                      `box-${patternScopeId}-${box.id}`,
                                      {
                                          stroke: box.strokeColor ?? "rgba(255,255,255,0.9)",
                                          strokeWidth,
                                          strokeOpacity,
                                          dash: box.strokeDash,
                                          strokeLineCap: box.strokeLineCap,
                                          strokeLineJoin: box.strokeLineJoin,
                                          strokeAlign,
                                      },
                                      true
                                  )}
                        </g>
                    </svg>
                    </div>
                    <ParametricEffectOverlay
                        effects={effects}
                        width={w}
                        height={h}
                        elementId={box.id}
                        borderRadius={box.borderRadiusPx ?? (box as any).borderRadius ?? 0}
                        shapePath={pathD}
                    />
                </div>
            </div>
        );
    }

    // PATH
    if (el.type === "path") {
        const pathEl = el as OverlayPathElement;
        const w = Math.max(1, pathEl.width ?? 1);
        const h = Math.max(1, pathEl.height ?? 1);
        const scaledPath = elementToOverlayPath(pathEl);
        const pathD = svgPathFromCommands(scaledPath ?? pathEl.path);
        const fills = legacyFillStack(pathEl);
        const fillScopeId = `path-fill-${patternScopeId}-${pathEl.id}`;
        const effectFilterId = sanitizeSvgId(`path-effect-${patternScopeId}-${pathEl.id}`);

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={{ ...innerStyle, opacity: undefined, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, opacity: typeof el.opacity === "number" ? el.opacity : 1 }}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId, performance.now())}
                        </defs>
                        <g filter={effects.filter(e => (e as any).type !== "parametric" || EFFECT_PRESETS[(e as any).preset]?.produces.includes("svgFilter")).length ? `url(#${effectFilterId})` : undefined}>
                            {renderFillLayers(pathD, fills, fillScopeId)}
                            {renderAlignedPathStroke(
                                pathD,
                                `path-${patternScopeId}-${pathEl.id}`,
                                {
                                    stroke: pathEl.strokeColor ?? "rgba(56,189,248,0.95)",
                                    strokeWidth: pathEl.strokeWidthPx ?? 2,
                                    strokeOpacity: typeof pathEl.strokeOpacity === "number" ? pathEl.strokeOpacity : 1,
                                    dash: pathEl.strokeDash,
                                    strokeLineCap: pathEl.strokeLineCap,
                                    strokeLineJoin: pathEl.strokeLineJoin,
                                    strokeAlign: pathEl.strokeAlign,
                                },
                                Boolean(scaledPath && isClosedPath(scaledPath))
                            )}
                        </g>
                    </svg>
                    </div>
                    <ParametricEffectOverlay
                        effects={effects}
                        width={w}
                        height={h}
                        elementId={pathEl.id}
                        shapePath={pathD}
                    />
                </div>
            </div>
        );
    }

    // TEXT
    if (el.type === "text") {
        const textEl = el as OverlayTextElement;
        const cssEffectStyle = buildCssEffectStyle(effects);
        let justify: React.CSSProperties["justifyContent"] = "flex-start";
        if (textEl.textAlign === "center") justify = "center";
        if (textEl.textAlign === "right") justify = "flex-end";

        const fontSize = textEl.fontSizePx ?? (textEl as any).fontSize ?? 24;
        const strokeWidth = textEl.strokeWidthPx ?? (textEl as any).strokeWidth ?? 0;
        const strokeColor = textEl.strokeColor;
        const content = resolveText(textEl.text, data);

        const _textW = textEl.width ?? 100;
        const _textH = textEl.height ?? 40;
        const _fontWeight = textEl.fontWeight === "bold" ? 700 : 400;
        const _fontStack = getFontStack(textEl.fontFamily);
        const _textAlign = textEl.textAlign ?? "left";
        // Determine if any active effect needs a shape path (svgOverlay or svgFilter)
        const _needsPath = effects.some((e: any) =>
            e.type === "parametric" && e.enabled !== false &&
            (EFFECT_PRESETS[e.preset]?.produces.includes("svgOverlay") ||
             EFFECT_PRESETS[e.preset]?.produces.includes("svgFilter"))
        );
        const _textShapePath = useTextShapePath(
            content, _fontStack, fontSize, _fontWeight,
            _textW, _textH, _textAlign, _needsPath
        );
        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div
                    style={{
                        ...innerStyle,
                        ...cssEffectStyle,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: justify,
                        padding: "0 8px",
                        color: textEl.color ?? "#e5e7eb",
                        fontSize,
                        fontWeight: _fontWeight,
                        fontFamily: _fontStack,
                        lineHeight: 1.1,
                        boxSizing: "border-box",
                        whiteSpace: "pre-wrap",
                        textShadow:
                            strokeWidth > 0 && strokeColor
                                ? [
                                    `${-strokeWidth}px 0 ${strokeColor}`,
                                    `${strokeWidth}px 0 ${strokeColor}`,
                                    `0 ${-strokeWidth}px ${strokeColor}`,
                                    `0 ${strokeWidth}px ${strokeColor}`,
                                ].join(",")
                                : undefined,
                    }}
                >
                    {content}
                </div>
                <ParametricEffectOverlay
                    effects={effects}
                    width={_textW}
                    height={_textH}
                    elementId={textEl.id}
                    shapePath={_textShapePath || undefined}
                />
            </div>
        );
    }

    if (el.type === "boolean") {
        const booleanEl = el as OverlayBooleanElement;
        const resolved = resolveElementGeometry(booleanEl, elementsById);
        if (!resolved) return null;
        const w = Math.max(1, booleanEl.width ?? resolved.bounds.width ?? 1);
        const h = Math.max(1, booleanEl.height ?? resolved.bounds.height ?? 1);
        const pathD = svgPathFromCommands(resolved.path);
        const fills = legacyFillStack(booleanEl);
        const fillScopeId = `boolean-fill-${patternScopeId}-${booleanEl.id}`;
        const effectFilterId = sanitizeSvgId(`boolean-effect-${patternScopeId}-${booleanEl.id}`);

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={{ ...innerStyle, opacity: undefined, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, opacity: typeof el.opacity === "number" ? el.opacity : 1 }}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId, performance.now())}
                        </defs>
                        <g filter={effects.filter(e => (e as any).type !== "parametric" || EFFECT_PRESETS[(e as any).preset]?.produces.includes("svgFilter")).length ? `url(#${effectFilterId})` : undefined}>
                            {renderFillLayers(pathD, fills, fillScopeId)}
                            {renderAlignedPathStroke(
                                pathD,
                                `boolean-${patternScopeId}-${booleanEl.id}`,
                                {
                                    stroke: booleanEl.strokeColor ?? "rgba(56,189,248,0.95)",
                                    strokeWidth: booleanEl.strokeWidthPx ?? 2,
                                    strokeOpacity: typeof booleanEl.strokeOpacity === "number" ? booleanEl.strokeOpacity : 1,
                                    dash: booleanEl.strokeDash,
                                    strokeLineCap: booleanEl.strokeLineCap,
                                    strokeLineJoin: booleanEl.strokeLineJoin,
                                    strokeAlign: booleanEl.strokeAlign,
                                },
                                true
                            )}
                        </g>
                    </svg>
                    </div>
                    <ParametricEffectOverlay
                        effects={effects}
                        width={w}
                        height={h}
                        elementId={booleanEl.id}
                        shapePath={pathD}
                    />
                </div>
            </div>
        );
    }

    // SHAPE
    if (el.type === "shape") {
        const s = el as OverlayShapeElement;
        const w = Math.max(1, s.width ?? 1);
        const h = Math.max(1, s.height ?? 1);
        const shapePath = elementToOverlayPath(s);
        const pathD = shapePath ? svgPathFromCommands(shapePath) : "";

        const fill = s.fillColor ?? "rgba(56,189,248,0.18)";
        const fillOpacity = typeof s.fillOpacity === "number" ? s.fillOpacity : 1;

        const stroke = s.strokeColor ?? "rgba(56,189,248,0.95)";
        const strokeWidth = s.strokeWidthPx ?? (s as any).strokeWidth ?? 2;

        const strokeOpacity =
            typeof s.strokeOpacity === "number" ? s.strokeOpacity : 1;
        const dash =
            Array.isArray(s.strokeDash) && s.strokeDash.length ? s.strokeDash : undefined;
        const fills = s.shape === "line" ? legacyFillStack({ ...s, fills: [] } as any) : legacyFillStack(s);
        const fillScopeId = `shape-fill-${patternScopeId}-${s.id}`;
        const effectFilterId = sanitizeSvgId(`shape-effect-${patternScopeId}-${s.id}`);

        const strokeProps = {
            fill: "none",
            stroke,
            strokeWidth,
            strokeOpacity,
            strokeDasharray: dash ? dash.join(" ") : undefined,
        } as any;

        // Hide the shape SVG when only canvas-based parametric effects are present
        const _parametricEffects = effects.filter(e => (e as any).type === 'parametric' && e.enabled !== false);
        const _hasOnlyCanvasEffects = _parametricEffects.length > 0
            && _parametricEffects.every(e => EFFECT_PRESETS[(e as any).preset]?.produces.every((p: string) => p === 'canvas'))
            && effects.filter(e => (e as any).type !== 'parametric').length === 0;

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={{ ...innerStyle, opacity: undefined, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, opacity: typeof el.opacity === 'number' ? el.opacity : 1 }}>
                    {!_hasOnlyCanvasEffects && <svg
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${w} ${h}`}
                        preserveAspectRatio="none"
                        style={(_paramCss as any).filter ? { filter: (_paramCss as any).filter } : undefined}
                    >
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId, performance.now())}
                        </defs>
                        <g filter={effects.filter(e => (e as any).type !== "parametric" || EFFECT_PRESETS[(e as any).preset]?.produces.includes("svgFilter")).length ? `url(#${effectFilterId})` : undefined}>
                            {pathD && renderFillLayers(pathD, fills, fillScopeId)}

                            {s.shape === "rect" && s.strokeSides && strokeWidth > 0 && Object.values(s.strokeSides).some(v => v === false)
                                ? renderRectPerSideStroke(
                                      w,
                                      h,
                                      strokeWidth,
                                      stroke,
                                      strokeOpacity,
                                      dash,
                                      s.strokeAlign ?? "center",
                                      s.strokeSides
                                  )
                                : renderAlignedPathStroke(
                                      pathD,
                                      `shape-${patternScopeId}-${s.id}`,
                                      {
                                          stroke,
                                          strokeWidth,
                                          strokeOpacity,
                                          dash,
                                          strokeLineCap: s.strokeLineCap,
                                          strokeLineJoin: s.strokeLineJoin,
                                          strokeAlign: s.strokeAlign,
                                      },
                                      Boolean(shapePath && isClosedPath(shapePath))
                                  )}
                        </g>
                    </svg>}
                    </div>
                    <ParametricEffectOverlay
                        effects={effects}
                        width={w}
                        height={h}
                        elementId={s.id}
                        shapePath={pathD}
                    />
                </div>
            </div>
        );
    }

    // IMAGE
    if (el.type === "image") {
        const img = el as OverlayImageElement;
        const cssEffectStyle = buildCssEffectStyle(effects);
        const br = img.borderRadiusPx ?? (img as any).borderRadius ?? 0;
        const effectiveBr =
            el.clip && el.clip.type !== "none" && typeof el.clip.radius === "number"
                ? el.clip.radius
                : br;

        const src = img.src || "";
        const mixBlendMode = toCssBlendMode(img.blendMode);
        const imageStyle: React.CSSProperties = { ...baseStyle, mixBlendMode };
        // Build CSS filter from adjustments
        const adj = (img as any).adjustments ?? {};
        const adjFilter = [
          adj.brightness !== undefined && adj.brightness !== 1 ? `brightness(${adj.brightness})` : "",
          adj.contrast !== undefined && adj.contrast !== 1 ? `contrast(${adj.contrast})` : "",
          adj.saturate !== undefined && adj.saturate !== 1 ? `saturate(${adj.saturate})` : "",
          adj.hueRotate !== undefined && adj.hueRotate !== 0 ? `hue-rotate(${adj.hueRotate}deg)` : "",
          adj.blur !== undefined && adj.blur !== 0 ? `blur(${adj.blur}px)` : "",
          adj.opacity !== undefined && adj.opacity !== 1 ? `opacity(${adj.opacity})` : "",
        ].filter(Boolean).join(" ");
        // Build CSS filter from adjustments

        // For parent clipping, don't use overflow:hidden (conflicts with clipPath)
        const useClipPath = el.clip && (el.clip as any).type === "parent";
        
        return (
            <div data-element-id={el.id} style={imageStyle}>
                <div style={{ ...innerStyle, ...cssEffectStyle, borderRadius: effectiveBr, overflow: useClipPath ? undefined : "hidden", filter: adjFilter || undefined }}>
                    {src && (
                        <KeyedMedia kind="image" src={src} fit={img.fit} keying={img.keying} />
                    )}
                </div>
                <ParametricEffectOverlay
                    effects={effects}
                    width={img.width ?? 100}
                    height={img.height ?? 100}
                    elementId={img.id}
                />
            </div>
        );
    }

    // VIDEO
    if (el.type === "video") {
        const vid = el as OverlayVideoElement;
        const cssEffectStyle = buildCssEffectStyle(effects);
        const br = vid.borderRadiusPx ?? (vid as any).borderRadius ?? 0;
        const effectiveBr =
            el.clip && el.clip.type !== "none" && typeof el.clip.radius === "number"
                ? el.clip.radius
                : br;

        const src = vid.src || "";
        const mixBlendMode = toCssBlendMode(vid.blendMode);
        const videoStyle: React.CSSProperties = { ...baseStyle, mixBlendMode };

        return (
            <div data-element-id={el.id} style={videoStyle}>
                <div style={{ ...innerStyle, ...cssEffectStyle, borderRadius: effectiveBr, overflow: "hidden" }}>
                    {src && (
                        <KeyedMedia
                            kind="video"
                            src={src}
                            fit={vid.fit}
                            keying={vid.keying}
                            poster={vid.poster}
                            autoplay={!!vid.autoplay}
                            muted={vid.muted !== false}
                            loop={!!vid.loop}
                            controls={!!vid.controls}
                        />
                    )}
                </div>
                <ParametricEffectOverlay
                    effects={effects}
                    width={vid.width ?? 100}
                    height={vid.height ?? 100}
                    elementId={vid.id}
                />
            </div>
        );
    }

    // PROGRESS BAR
    if (el.type === "progressBar") {
        const bar = el as OverlayProgressBarElement;
        const val = Math.max(0, Math.min(1, bar.value ?? 0));
        const br = bar.borderRadiusPx ?? 0;

        let progressStyle: React.CSSProperties = {
            position: "absolute",
            backgroundColor: bar.fillColor ?? "#3b82f6",
        };

        if (bar.direction === "ltr") {
            progressStyle = { ...progressStyle, left: 0, top: 0, bottom: 0, width: `${val * 100}%` };
        } else if (bar.direction === "rtl") {
            progressStyle = { ...progressStyle, right: 0, top: 0, bottom: 0, width: `${val * 100}%` };
        } else if (bar.direction === "ttb") {
            progressStyle = { ...progressStyle, left: 0, top: 0, right: 0, height: `${val * 100}%` };
        } else if (bar.direction === "btt") {
            progressStyle = { ...progressStyle, left: 0, bottom: 0, right: 0, height: `${val * 100}%` };
        }

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div
                    style={{
                        ...innerStyle,
                        backgroundColor: bar.backgroundColor ?? "rgba(255,255,255,0.1)",
                        borderRadius: br,
                        overflow: "hidden",
                    }}
                >
                    <div style={progressStyle} />
                </div>
            </div>
        );
    }

    // PROGRESS RING
    if (el.type === "progressRing") {
        const ring = el as OverlayProgressRingElement;
        const val = Math.max(0, Math.min(1, ring.value ?? 0));
        const sw = ring.strokeWidthPx ?? 4;
        const w = el.width || 1;
        const h = el.height || 1;
        const r = Math.max(0.1, Math.min(w, h) / 2 - sw / 2);
        const cx = w / 2;
        const cy = h / 2;
        const circumference = 2 * Math.PI * r;
        const offset = circumference * (1 - val);
        const startAngle = ring.startAngleDeg ?? -90;

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={innerStyle}>
                    <svg
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${w} ${h}`}
                        style={{ transform: `rotate(${startAngle}deg)` }}
                    >
                        <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={ring.backgroundColor ?? "rgba(255,255,255,0.1)"}
                            strokeWidth={sw}
                        />
                        <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={ring.fillColor ?? "#3b82f6"}
                            strokeWidth={sw}
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
            </div>
        );
    }

    // LOWER THIRD
    if (el.type === "lower_third") {
        const lt = el as OverlayLowerThirdElement;

        const keys = {
            active: lt.bind?.activeKey || "lower_third.active",
            text: lt.bind?.textKey || "lower_third",
            title: lt.bind?.titleKey || "lower_third.title",
            subtitle: lt.bind?.subtitleKey || "lower_third.subtitle",
        };

        const activeVal = data?.[keys.active];
        const rawText = data?.[keys.text] || "";
        const rawTitle = data?.[keys.title] || "";
        const rawSubtitle = data?.[keys.subtitle] || "";
        const hasContent = Boolean(rawText || rawTitle || rawSubtitle);

        const isActive = activeVal
            ? activeVal !== "0" && activeVal !== "false"
            : hasContent;

        const [renderState, setRenderState] = React.useState<{
            show: boolean;
            mounting: boolean;
        }>({
            show: isActive,
            mounting: false,
        });

        React.useEffect(() => {
            if (isActive) {
                setRenderState({ show: true, mounting: true });
            } else {
                setRenderState((prev) => (prev.show ? { show: true, mounting: false } : prev));

                const dur = lt.animation?.durationMs ?? 450;
                const tm = setTimeout(() => {
                    setRenderState((prev) => (!isActive ? { show: false, mounting: false } : prev));
                }, dur);
                return () => clearTimeout(tm);
            }
        }, [isActive, lt.animation?.durationMs]);

        if (!renderState.show && !isActive) return null;

        const variant = lt.style?.variant || "accent-bar";
        const layoutMode = lt.layout?.mode || "stacked";

        const bgColor = lt.style?.bgColor || "#111";
        const bgOpacity = lt.style?.bgOpacity ?? 0.75;
        const accent = lt.style?.accentColor || "#4f46e5";
        const titleColor = lt.style?.titleColor || "#fff";
        const subtitleColor = lt.style?.subtitleColor || "rgba(255,255,255,0.85)";

        const padding = lt.style?.paddingPx ?? 20;
        const radius = lt.style?.cornerRadiusPx ?? 18;
        const titleSize = lt.style?.titleSizePx ?? 40;
        const subSize = lt.style?.subtitleSizePx ?? 26;
        const titleWeight = lt.style?.titleWeight === "normal" ? 400 : 700;
        const font = getFontStack(lt.style?.fontFamily);

        const animOut = lt.animation?.out || "slideDown";
        const animDur = lt.animation?.durationMs ?? 450;
        const ease = lt.animation?.easing || "cubic-bezier(0.2, 0.9, 0.2, 1)";
        const isExiting = !isActive && renderState.show;

        const getAnimStyle = (type: string): React.CSSProperties => {
            if (type === "none") return {};
            if (type === "fade") return { opacity: 0 };
            if (type === "slideUp") return { transform: "translateY(100%)", opacity: 0 };
            if (type === "slideDown") return { transform: "translateY(100%)", opacity: 0 };
            if (type === "slideLeft") return { transform: "translateX(-50px)", opacity: 0 };
            if (type === "slideRight") return { transform: "translateX(50px)", opacity: 0 };
            return {};
        };

        const combinedAnimStyle = {
            transition: `all ${animDur}ms ${ease}`,
            opacity: 1,
            transform: "translate(0,0)",
            ...(isExiting ? getAnimStyle(animOut) : {}),
        };

        const titleText = resolveText(rawTitle || rawText, data);
        const subText = resolveText(rawSubtitle, data);

        let contentNode: React.ReactNode;

        if (layoutMode === "single") {
            contentNode = (
                <div style={{ fontSize: titleSize, fontWeight: titleWeight, color: titleColor }}>
                    {titleText}
                </div>
            );
        } else if (layoutMode === "split") {
            const ratio = lt.layout?.splitRatio ?? 0.6;
            const leftW = `${ratio * 100}%`;
            const rightW = `${(1 - ratio) * 100}%`;

            contentNode = (
                <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center" }}>
                    <div
                        style={{
                            width: leftW,
                            paddingRight: padding,
                            textAlign: "right",
                            borderRight: `2px solid ${accent}`,
                            fontSize: titleSize,
                            fontWeight: titleWeight,
                            color: titleColor,
                        }}
                    >
                        {titleText}
                    </div>
                    <div style={{ width: rightW, paddingLeft: padding, fontSize: subSize, color: subtitleColor }}>
                        {subText}
                    </div>
                </div>
            );
        } else {
            contentNode = (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {titleText && (
                        <div style={{ fontSize: titleSize, fontWeight: titleWeight, color: titleColor }}>
                            {titleText}
                        </div>
                    )}
                    {subText && (
                        <div style={{ fontSize: subSize, color: subtitleColor, marginTop: 4 }}>
                            {subText}
                        </div>
                    )}
                </div>
            );
        }

        const containerStyle: React.CSSProperties = {
            width: "100%",
            height: "100%",
            borderRadius: radius,
            padding: padding,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            fontFamily: font,
            position: "relative",
            overflow: "hidden",
        };

        if (variant === "glass") {
            containerStyle.backgroundColor = `rgba(30,30,30, ${bgOpacity * 0.5})`;
            containerStyle.backdropFilter = "blur(12px)";
            containerStyle.border = "1px solid rgba(255,255,255,0.1)";
        } else if (variant === "minimal") {
            containerStyle.backgroundColor = "transparent";
            containerStyle.padding = 0;
        } else {
            containerStyle.backgroundColor = hexToRgba(bgColor, bgOpacity);
            if (variant === "accent-bar") {
                containerStyle.borderLeft = `6px solid ${accent}`;
            }
        }

        return (
            <div data-element-id={el.id} style={baseStyle}>
                <div style={{ width: "100%", height: "100%", ...combinedAnimStyle }}>
                    <div style={innerStyle}>
                        <div style={containerStyle}>{contentNode}</div>
                    </div>
                </div>
            </div>
        );
    }

    if ((el as any).type === "widget") {
        const widgetEl = el as any;
        const widgetId = widgetEl.widgetId;
        const propOverrides = widgetEl.propOverrides || {};
        const w = widgetEl.visible === false ? 0 : (baseStyle.width || 0);
        const h = widgetEl.visible === false ? 0 : (baseStyle.height || 0);

        // Editor preview: inject widget script directly, render into scoped div
        if (overlayPublicId) {
            const WIDGET_SCRIPTS: Record<string, string> = {
                'chat-overlay': '/widgets/chat-overlay.js',
                'alert-box-widget': '/widgets/alert-box-widget.js',
                'sub-counter': '/widgets/sub-counter.js',
                'event-console-widget': '/widgets/event-console-widget.js',
                'tts-player': '/widgets/tts-player.js',
                'stake-monitor': '/widgets/stake-monitor.js',
                'raffle': '/widgets/raffle.js',
                'subathon-timer': '/widgets/subathon-timer.js',
                'random-number': '/widgets/random-number.js',
                'emote-wall': '/widgets/emote-wall.js',
                'emote-counter': '/widgets/emote-counter.js',
                'top-donators': '/widgets/top-donators.js',
                'sound-visualizer': '/widgets/sound-visualizer.js',
                'ticker': '/widgets/ticker.js',
                'hype-train': '/widgets/hype-train.js',
            };
            const scriptSrc = WIDGET_SCRIPTS[widgetId];
            const scriptId = `widget-script-editor-${widgetId}`;
            const containerId = `widget-preview-${el.id}`;
            if (scriptSrc && typeof document !== 'undefined') {
                // Per-instance config key scoped to el.id so multiple instances don't clobber each other
                const configKey = `__WIDGET_CONFIG_${el.id.replace(/-/g, '_').toUpperCase()}__`;
                // Also set the shared widgetId-keyed config for widgets that read it directly
                const sharedConfigKey = `__WIDGET_CONFIG_${widgetId.replace(/-/g, '_').toUpperCase()}__`;
                const newCfg = { ...propOverrides, editorPreview: true, _instanceId: el.id };
                (window as any)[sharedConfigKey] = newCfg;
                (window as any)[configKey] = newCfg;
                if (!document.getElementById(scriptId)) {
                    const s = document.createElement('script');
                    s.id = scriptId;
                    s.src = scriptSrc + '?v=' + Date.now();
                    document.head.appendChild(s);
                } else {
                    // Script already loaded — dispatch config update event so widget can hot-reload
                    window.dispatchEvent(new CustomEvent('scraplet:widget:config-update', {
                        detail: { widgetId, instanceId: el.id, config: newCfg }
                    }));
                }
            }
            // Use React renderer if registered, otherwise fall back to DOM container
            const EditorWidgetRenderer = getWidgetRenderer(widgetId);
            if (EditorWidgetRenderer) {
                return (
                    <WidgetEditorNode
                        baseStyle={baseStyle}
                        w={w} h={h} has3D={has3D}
                        widgetId={widgetId}
                        instanceId={el.id}
                        initialState={{ ...propOverrides }}
                        Renderer={EditorWidgetRenderer}
                    />
                );
            }
            return (
                <div style={{ ...baseStyle, width: w, height: h, position: 'absolute', overflow: has3D ? 'visible' : 'hidden', isolation: 'isolate', pointerEvents: 'auto' }}>
                    <div
                        id={containerId}
                        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none' }}
                        data-widget-editor-preview={widgetId}
                        data-widget-instance-id={el.id}
                    />
                </div>
            );
        }

        // Runtime mode (OBS): use WidgetRuntimeNode for all widgets with a registered renderer.
        // - Unified-state widgets: state comes from widgetStates prop
        // - IIFE widgets: state comes from scraplet:widget:state events
        const RuntimeWidgetRenderer = getWidgetRenderer(widgetId);
        if (RuntimeWidgetRenderer) {
            return (
                <WidgetRuntimeNode
                    baseStyle={baseStyle}
                    w={w as number}
                    h={h as number}
                    has3D={has3D}
                    widgetId={widgetId}
                    instanceId={el.id}
                    Renderer={RuntimeWidgetRenderer}
                    unifiedState={widgetStates?.[el.id]}
                />
            );
        }

        // No renderer registered — render empty container (IIFE script injects into it)
        const rp = new URLSearchParams();
        Object.entries(propOverrides).forEach(([k, v]) => rp.set(k, String(v)));
        return (
            <div
                style={{ ...baseStyle, width: w, height: h, overflow: has3D ? 'visible' : 'hidden', pointerEvents: 'none', position: 'absolute' }}
                data-element-id={el.id}
                data-widget-id={widgetId}
                data-widget-params={rp.toString()}
            />
        );
    }




    return null;
}

function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r)) return hex;
    return `rgba(${r},${g},${b},${alpha})`;
}
