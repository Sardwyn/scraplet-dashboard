import React, { useId } from "react";
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
import { elementToOverlayPath, isClosedPath, svgPathFromCommands } from "../geometry/pathUtils";

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
    preset?: OverlayAnimation["enter"]
): React.CSSProperties {
    switch (preset) {
        case "fade":
            return { opacity: 0 };
        case "slideUp":
            return { transform: "translateY(32px)", opacity: 0 };
        case "slideDown":
            return { transform: "translateY(-32px)", opacity: 0 };
        case "slideLeft":
            return { transform: "translateX(32px)", opacity: 0 };
        case "slideRight":
            return { transform: "translateX(-32px)", opacity: 0 };
        case "none":
        default:
            return {};
    }
}

function getExitMotionPresetStyle(
    preset?: OverlayAnimation["exit"]
): React.CSSProperties {
    switch (preset) {
        case "fade":
            return { opacity: 0 };
        case "slideUp":
            return { transform: "translateY(-32px)", opacity: 0 };
        case "slideDown":
            return { transform: "translateY(32px)", opacity: 0 };
        case "slideLeft":
            return { transform: "translateX(-32px)", opacity: 0 };
        case "slideRight":
            return { transform: "translateX(32px)", opacity: 0 };
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
            ...getEnterMotionPresetStyle(animation.enter),
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
            ...getExitMotionPresetStyle(animation.exit),
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
    if (Array.isArray((el as any).effects) && (el as any).effects.length) {
        return (el as any).effects.filter((effect: OverlayEffect) => effect?.enabled !== false);
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

function renderSvgEffectFilter(effects: OverlayEffect[], filterId: string) {
    const active = effects.filter((effect) => effect.enabled !== false);
    if (!active.length) return null;

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
        if (fill.type === "solid") {
            return renderPathSvg(pathD, {
                fill: fill.color,
                fillOpacity: fillOpacityValue(fill),
            });
        }
        if (fill.type === "linear") {
            return renderPathSvg(pathD, { fill: `url(#${scopeId}-linear-${index})` });
        }
        if (fill.type === "radial") {
            return renderPathSvg(pathD, { fill: `url(#${scopeId}-radial-${index})` });
        }
        if (fill.type === "conic") {
            return renderPathSvg(pathD, { fill: `url(#${scopeId}-conic-${index})` });
        }
        if (fill.type === "pattern" && hasPatternSource(fill)) {
            return renderPathSvg(pathD, { fill: `url(#${scopeId}-pattern-${index})` });
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
                transition: getAnimationTransition(el.animation, effectiveAnimationPhase),
            };

    Object.assign(baseStyle, getAnimationStyle(el.animation, effectiveAnimationPhase));

    const transformStyle: React.CSSProperties = {};
    const scaleX = typeof (el as any).scaleX === "number" ? (el as any).scaleX : 1;
    const scaleY = typeof (el as any).scaleY === "number" ? (el as any).scaleY : 1;
    const transformParts: string[] = [];
    if (el.rotationDeg) {
        transformParts.push(`rotate(${el.rotationDeg}deg)`);
    }
    if (scaleX !== 1 || scaleY !== 1) {
        transformParts.push(`scale(${scaleX}, ${scaleY})`);
    }
    if (transformParts.length > 0) {
        transformStyle.transform = transformParts.join(" ");
        transformStyle.transformOrigin = "center center";
    }

    // 3D transforms applied directly to baseStyle so they affect the outermost div
    const _tiltX = (el as any).tiltX ?? 0;
    const _tiltY = (el as any).tiltY ?? 0;
    const _skewX = (el as any).skewX ?? 0;
    const _skewY = (el as any).skewY ?? 0;
    const _persp = (el as any).perspective ?? 800;
    const has3D = _tiltX !== 0 || _tiltY !== 0 || _skewX !== 0 || _skewY !== 0;
    if (has3D) {
        const parts3D = [`perspective(${_persp}px)`];
        if (_tiltX !== 0) parts3D.push(`rotateX(${_tiltX}deg)`);
        if (_tiltY !== 0) parts3D.push(`rotateY(${_tiltY}deg)`);
        if (_skewX !== 0) parts3D.push(`skewX(${_skewX}deg)`);
        if (_skewY !== 0) parts3D.push(`skewY(${_skewY}deg)`);
        const existing = (baseStyle as any).transform;
        (baseStyle as any).transform = existing ? `${existing} ${parts3D.join(' ')}` : parts3D.join(' ');
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
        }
    }

    const innerStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        opacity: typeof el.opacity === "number" ? el.opacity : 1,
        ...transformStyle,
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
                <div style={baseStyle}>
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
            <div style={baseStyle}>
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
            <div style={baseStyle}>
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
            overflow: el.type === "frame" && (group as OverlayFrameElement).clipContent !== false ? "hidden" : undefined,
        };

        return (
            <div style={baseStyle}>
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
            <div style={baseStyle}>
                <div style={{ ...innerStyle, position: "relative", overflow: "visible" }}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId)}
                        </defs>
                        <g filter={effects.length ? `url(#${effectFilterId})` : undefined}>
                            {pathD && renderFillLayers(pathD, fills, fillScopeId)}
                            {box.strokeSides && strokeWidth > 0
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
            <div style={baseStyle}>
                <div style={innerStyle}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId)}
                        </defs>
                        <g filter={effects.length ? `url(#${effectFilterId})` : undefined}>
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

        return (
            <div style={baseStyle}>
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
                        fontWeight: textEl.fontWeight === "bold" ? 700 : 400,
                        fontFamily: getFontStack(textEl.fontFamily),
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
            <div style={baseStyle}>
                <div style={innerStyle}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId)}
                        </defs>
                        <g filter={effects.length ? `url(#${effectFilterId})` : undefined}>
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

        return (
            <div style={baseStyle}>
                <div style={innerStyle}>
                    <svg
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${w} ${h}`}
                        preserveAspectRatio="none"
                    >
                        <defs>
                            {renderFillDefs(fills, fillScopeId, w, h)}
                            {renderSvgEffectFilter(effects, effectFilterId)}
                        </defs>
                        <g filter={effects.length ? `url(#${effectFilterId})` : undefined}>
                            {pathD && renderFillLayers(pathD, fills, fillScopeId)}

                            {s.shape === "rect" && s.strokeSides && strokeWidth > 0
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
                    </svg>
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

        return (
            <div style={imageStyle}>
                <div style={{ ...innerStyle, ...cssEffectStyle, borderRadius: effectiveBr, overflow: "hidden" }}>
                    {src && (
                        <KeyedMedia kind="image" src={src} fit={img.fit} keying={img.keying} />
                    )}
                </div>
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
            <div style={videoStyle}>
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
            <div style={baseStyle}>
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
            <div style={baseStyle}>
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
            <div style={baseStyle}>
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
            };
            const scriptSrc = WIDGET_SCRIPTS[widgetId];
            const scriptId = `widget-script-editor-${widgetId}`;
            const containerId = `widget-preview-${el.id}`;
            if (scriptSrc && typeof document !== 'undefined') {
                const configKey = `__WIDGET_CONFIG_${widgetId.replace(/-/g, '_').toUpperCase()}__`;
                (window as any)[configKey] = { ...propOverrides, editorPreview: true };
                if (!document.getElementById(scriptId)) {
                    const s = document.createElement('script');
                    s.id = scriptId;
                    s.src = scriptSrc + '?v=' + Date.now();
                    document.head.appendChild(s);
                }
            }
            return (
                <div style={{ ...baseStyle, width: w, height: h, position: 'absolute', overflow: 'hidden', isolation: 'isolate' }}>
                    <div
                        id={containerId}
                        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
                        data-widget-editor-preview={widgetId}
                    />
                </div>
            );
        }

        // Runtime mode (OBS): empty div, widget script injected by loadWidgetRuntimes()
        const rp = new URLSearchParams();
        Object.entries(propOverrides).forEach(([k, v]) => rp.set(k, String(v)));
        return (
            <div
                style={{ ...baseStyle, width: w, height: h, overflow: 'hidden', pointerEvents: 'none', position: 'absolute' }}
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
