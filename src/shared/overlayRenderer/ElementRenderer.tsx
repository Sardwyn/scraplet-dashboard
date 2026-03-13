import React, { useId } from "react";
import {
    OverlayAnimation,
    OverlayAnimationPhase,
    OverlayBlendMode,
    OverlayElement,
    OverlayBoxElement,
    OverlayTextElement,
    OverlayShapeElement,
    OverlayImageElement,
    OverlayVideoElement,
    OverlayGroupElement,
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

function getBoxPatternStyle(pattern?: OverlayPatternFill): React.CSSProperties | null {
    if (!hasPatternSource(pattern)) return null;

    const fit = pattern?.fit ?? "tile";
    const scale = getPatternScale(pattern);
    const opacity = getPatternOpacity(pattern);

    const style: React.CSSProperties = {
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        backgroundImage: `url("${pattern!.src}")`,
        backgroundPosition: "center",
    };

    if (fit === "tile") {
        style.backgroundRepeat = "repeat";
        style.backgroundSize = `${scale}% auto`;
        return style;
    }

    style.backgroundRepeat = "no-repeat";
    style.backgroundSize = fit;
    style.transform = `scale(${scale / 100})`;
    style.transformOrigin = "center center";
    return style;
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
    if (el.rotationDeg) {
        transformStyle.transform = `rotate(${el.rotationDeg}deg)`;
        transformStyle.transformOrigin = "center center";
    }

    const effectStyle: React.CSSProperties = {};
    const useFilterShadow = el.type === "shape" || el.type === "text";

    if (el.shadow?.enabled) {
        const { color, blur, x, y, spread } = el.shadow;
        if (useFilterShadow) {
            effectStyle.filter = `drop-shadow(${x}px ${y}px ${blur}px ${color})`;
        } else {
            effectStyle.boxShadow = `${x}px ${y}px ${blur}px ${spread ?? 0}px ${color}`;
        }
    }

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
        ...effectStyle,
        ...clipStyle,
        transition: "inherit",
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
            if ((c.type === "group" || c.type === "mask") && Array.isArray((c as any).childIds)) {
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

        const maskEl = elementsById?.[maskShapeId] as OverlayShapeElement | undefined;
        const contentEl = contentId ? elementsById?.[contentId] : undefined;

        if (!maskEl || !contentEl) return null;

        if (visited && visited.has(el.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(el.id);

        const invert = !!(maskGroup as any).invert;

        const gx = el.x ?? 0;
        const gy = el.y ?? 0;

        const mx = (maskEl.x ?? 0) - gx;
        const my = (maskEl.y ?? 0) - gy;
        const mw = maskEl.width ?? 0;
        const mh = maskEl.height ?? 0;
        const mcr = (maskEl as any).cornerRadiusPx ?? (maskEl as any).cornerRadius ?? 0;
        const shape = maskEl.shape ?? "rect";

        const offsetX = (contentEl.x ?? 0) - (maskEl.x ?? 0);
        const offsetY = (contentEl.y ?? 0) - (maskEl.y ?? 0);
        const contentW = contentEl.width ?? mw;
        const contentH = contentEl.height ?? mh;

        const normalClipPath = shapeClipPath(shape, mcr);
        const svgMaskId = `mask-${el.id}`;

        if (!invert) {
            return (
                <div style={baseStyle}>
                    <div style={{ ...innerStyle, position: "relative" }}>
                        <div
                            style={{
                                position: "absolute",
                                left: mx,
                                top: my,
                                width: mw,
                                height: mh,
                                overflow: "hidden",
                                borderRadius: shape === "rect" ? mcr : undefined,
                                clipPath: normalClipPath,
                                WebkitClipPath: normalClipPath,
                            }}
                        >
                            <div
                                style={{
                                    position: "absolute",
                                    left: offsetX,
                                    top: offsetY,
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
                    </div>
                </div>
            );
        }

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
                                <rect x="0" y="0" width={groupW} height={groupH} fill="white" />
                                {renderSvgMaskShape(shape, mx, my, mw, mh, mcr, "black")}
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
    if (el.type === "group") {
        const group = el as OverlayGroupElement;

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
        const br = box.borderRadiusPx ?? (box as any).borderRadius ?? 16;
        const patternStyle = getBoxPatternStyle(box.pattern);

        const effectiveBr =
            el.clip && el.clip.type !== "none"
                ? clipStyle.borderRadius ?? br
                : br;

        return (
            <div style={baseStyle}>
                <div
                    style={{
                        ...innerStyle,
                        position: "relative",
                        overflow: "hidden",
                        background: box.backgroundColor || "rgba(15,23,42,0.8)",
                        borderRadius: effectiveBr,
                    }}
                >
                    {patternStyle && (
                        <div
                            style={{
                                ...patternStyle,
                                borderRadius: effectiveBr,
                            }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // TEXT
    if (el.type === "text") {
        const textEl = el as OverlayTextElement;
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

    // SHAPE
    if (el.type === "shape") {
        const s = el as OverlayShapeElement;
        const w = Math.max(1, s.width ?? 1);
        const h = Math.max(1, s.height ?? 1);

        const fill = s.fillColor ?? "rgba(56,189,248,0.18)";
        const fillOpacity = typeof s.fillOpacity === "number" ? s.fillOpacity : 1;

        const stroke = s.strokeColor ?? "rgba(56,189,248,0.95)";
        const strokeWidth = s.strokeWidthPx ?? (s as any).strokeWidth ?? 2;

        const strokeOpacity =
            typeof s.strokeOpacity === "number" ? s.strokeOpacity : 1;
        const dash =
            Array.isArray(s.strokeDash) && s.strokeDash.length ? s.strokeDash : undefined;
        const patternEnabled = hasPatternSource(s.pattern) && s.shape !== "line";
        const patternId = `shape-pattern-${patternScopeId}-${s.id}`;
        const patternFit = s.pattern?.fit ?? "tile";
        const patternScale = getPatternScale(s.pattern);
        const patternOpacity = getPatternOpacity(s.pattern);
        const tileWidth = Math.max(1, w * (patternScale / 100));
        const tileHeight = Math.max(1, h * (patternScale / 100));
        const scaledWidth = Math.max(1, w * (patternScale / 100));
        const scaledHeight = Math.max(1, h * (patternScale / 100));
        const patternImageX = (w - scaledWidth) / 2;
        const patternImageY = (h - scaledHeight) / 2;

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
                        {patternEnabled && (
                            <defs>
                                <pattern
                                    id={patternId}
                                    patternUnits="userSpaceOnUse"
                                    width={patternFit === "tile" ? tileWidth : w}
                                    height={patternFit === "tile" ? tileHeight : h}
                                >
                                    <image
                                        href={s.pattern!.src}
                                        x={patternFit === "tile" ? 0 : patternImageX}
                                        y={patternFit === "tile" ? 0 : patternImageY}
                                        width={patternFit === "tile" ? tileWidth : scaledWidth}
                                        height={patternFit === "tile" ? tileHeight : scaledHeight}
                                        preserveAspectRatio={
                                            patternFit === "cover"
                                                ? "xMidYMid slice"
                                                : patternFit === "contain"
                                                    ? "xMidYMid meet"
                                                    : "none"
                                        }
                                        opacity={patternOpacity}
                                    />
                                </pattern>
                            </defs>
                        )}

                        {renderShapeGeometry(s, w, h, strokeWidth, {
                            fill,
                            fillOpacity,
                            stroke: "none",
                        })}

                        {patternEnabled &&
                            renderShapeGeometry(s, w, h, strokeWidth, {
                                fill: `url(#${patternId})`,
                                stroke: "none",
                            })}

                        {renderShapeGeometry(s, w, h, strokeWidth, strokeProps)}
                    </svg>
                </div>
            </div>
        );
    }

    // IMAGE
    if (el.type === "image") {
        const img = el as OverlayImageElement;
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
                <div style={{ ...innerStyle, borderRadius: effectiveBr, overflow: "hidden" }}>
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
                <div style={{ ...innerStyle, borderRadius: effectiveBr, overflow: "hidden" }}>
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

    return null;
}

function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r)) return hex;
    return `rgba(${r},${g},${b},${alpha})`;
}
