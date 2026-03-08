import React, { useMemo } from "react";
import {
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
    OverlayComponentDef,
    OverlayComponentInstanceElement
} from "../overlayTypes";
import { getFontStack } from "../FontManager";

import { resolveBinding } from "../bindingEngine";

function fitToObjectFit(fit?: OverlayMediaFit) {
    if (fit === "contain") return "contain";
    if (fit === "fill") return "fill";
    return "cover";
}

function resolveText(text: string, data?: Record<string, string>) {
    if (!data) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        return data[key.trim()] ?? "";
    });
}

export function ElementRenderer({
    element,
    elementsById, // Required for Group recursion
    overlayComponents, // Required for componentInstance rendering
    data,         // Variable binding context
    yOffset = 0,
    layout = "absolute",
    visited,      // Cycle detection
}: {
    element: OverlayElement;
    elementsById?: Record<string, OverlayElement>;
    overlayComponents?: OverlayComponentDef[];
    data?: Record<string, any>;
    yOffset?: number;
    layout?: "absolute" | "fill";
    visited?: Set<string>;
}) {
    // -------------------------------------------------------------------------
    // PROP WEAVING: If this element has bindings and we have data, override props
    // -------------------------------------------------------------------------
    let el = element as any;
    if (el.bindings && data) {
        const overrides: any = {};
        for (const [propPath, binding] of Object.entries(el.bindings)) {
            if (binding && typeof binding === 'object' && (binding as any).mode === 'dynamic') {
                overrides[propPath] = resolveBinding(binding as any, data);
            } else if (typeof binding === 'string') {
                // Back-compat for legacy string-based bindings
                const val = data[binding];
                if (val !== undefined) overrides[propPath] = val;
            }
        }
        if (Object.keys(overrides).length > 0) {
            el = { ...el, ...overrides };
        }
    }

    // -------------------------------------------------------------------------
    // 1. BASE STYLES & LAYOUT
    // -------------------------------------------------------------------------
    const baseStyle: React.CSSProperties =
        layout === "fill"
            ? {
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                transition: "all 0.4s ease-out", // Default smooth transitions
            }
            : {
                position: "absolute",
                left: el.x,
                top: el.y + yOffset,
                width: el.width,
                height: el.height,
                transition: "all 0.4s ease-out", // Default smooth transitions
            };

    if (el.visible === false) {
        baseStyle.opacity = 0;
        baseStyle.pointerEvents = "none";
    }

    // -------------------------------------------------------------------------
    // 2. TRANSFORMS (Rotation)
    // -------------------------------------------------------------------------
    // Applied to inner container so Rnd (editor) stays axis-aligned
    const transformStyle: React.CSSProperties = {};
    if (element.rotationDeg) {
        transformStyle.transform = `rotate(${element.rotationDeg}deg)`;
        transformStyle.transformOrigin = "center center";
    }

    // -------------------------------------------------------------------------
    // 3. EFFECTS (Shadow / Glow)
    // -------------------------------------------------------------------------
    const effectStyle: React.CSSProperties = {};
    const useFilterShadow = element.type === "shape" || element.type === "text"; // Text/Shape use filter

    if (element.shadow?.enabled) {
        const { color, blur, x, y, spread } = element.shadow;
        if (useFilterShadow) {
            // SVG/Text use drop-shadow filter
            // Note: spread is not supported in drop-shadow, ignored
            effectStyle.filter = `drop-shadow(${x}px ${y}px ${blur}px ${color})`;
        } else {
            // Box/Image/Video/Group use box-shadow
            effectStyle.boxShadow = `${x}px ${y}px ${blur}px ${spread ?? 0}px ${color}`;
        }
    }

    // -------------------------------------------------------------------------
    // 4. CLIPPING (Masks)
    // -------------------------------------------------------------------------
    const clipStyle: React.CSSProperties = {};
    if (element.clip && element.clip.type !== "none") {
        clipStyle.overflow = "hidden";
        if (element.clip.type === "circle") {
            clipStyle.borderRadius = "9999px";
        } else if (element.clip.type === "roundRect") {
            // If explicit radius provided, use it. Else fall back to element's native radius or 0.
            // Note: Some elements (Box) have native borderRadius. We use clip radius if present.
            if (typeof element.clip.radius === "number") {
                clipStyle.borderRadius = element.clip.radius;
            } else {
                // Keep native borderRadius if no clip radius specified?
                // Actually, if clip is roundRect without radius, user likely expects 0 or inherited.
                // We'll trust native props if clip.radius is undefined.
            }
        }
    }

    // -------------------------------------------------------------------------
    // 5. COMBINED STYLE (Inner Wrapper)
    // -------------------------------------------------------------------------
    // Opacity is applied here (common prop).
    const innerStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        opacity: typeof el.opacity === "number" ? el.opacity : 1,
        ...transformStyle,
        ...effectStyle,
        ...clipStyle,
        transition: "inherit",
    };

    // -------------------------------------------------------------------------
    // 6. RENDERERS
    // -------------------------------------------------------------------------

    // --- COMPONENT INSTANCE ---
    if (element.type === "componentInstance") {
        const inst = element as OverlayComponentInstanceElement;

        // Cycle Check
        if (visited && visited.has(element.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(element.id);

        const def = overlayComponents?.find(c => c.id === inst.componentId);
        if (!def) {
            // Render a missing component placeholder in editor/debug mode?
            return (
                <div style={baseStyle}>
                    <div style={{ ...innerStyle, border: '2px dashed red', background: 'rgba(255,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red', fontSize: 10 }}>
                        Missing Component
                    </div>
                </div>
            );
        }

        // We apply prop overrides here eventually (Phase 3).
        // For now we just render the master elements at the origin of this component container.
        const mergedData = { ...data, ...inst.propOverrides };

        // Ensure child elements map correctly if `elements` is flat
        // If master definition has grouping, it should provide a hierarchy via childIds.
        // We'll trust that the master definition 'elements' is self-contained.
        const masterElementsById = Object.fromEntries(def.elements.map(e => [e.id, e]));

        // Root elements of the component definition are those that aren't children of any group inside the def
        const childIds = new Set<string>();
        def.elements.forEach(c => {
            if (c.type === 'group' && Array.isArray((c as any).childIds)) {
                (c as any).childIds.forEach((cid: string) => childIds.add(cid));
            }
        });

        const roots = def.elements.filter(e => !childIds.has(e.id));

        return (
            <div style={baseStyle}>
                <div style={{ ...innerStyle, position: "relative" }}>
                    {roots.map(child => (
                        <ElementRenderer
                            key={child.id}
                            element={child}
                            elementsById={masterElementsById}
                            overlayComponents={overlayComponents} // pass down!
                            data={mergedData}
                            layout="absolute"
                            visited={nextVisited}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // --- MASK ---
    if (element.type === "mask") {
        const maskGroup = element as OverlayMaskElement;
        const maskShapeId = maskGroup.childIds[0];
        const contentId = maskGroup.childIds[1];

        const maskEl = elementsById?.[maskShapeId] as OverlayShapeElement;
        const contentEl = elementsById?.[contentId];

        if (!maskEl || !contentEl) return null;

        if (visited && visited.has(element.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(element.id);

        // All offsets are relative to the mask group's top-left (which baseStyle places for us)
        const gx = element.x ?? 0;
        const gy = element.y ?? 0;
        const gw = element.width ?? 0;
        const gh = element.height ?? 0;

        // Mask shape position and size, relative to group origin
        const mx = (maskEl.x ?? 0) - gx;
        const my = (maskEl.y ?? 0) - gy;
        const mw = maskEl.width ?? 0;
        const mh = maskEl.height ?? 0;
        const mcr = (maskEl as any).cornerRadiusPx ?? (maskEl as any).cornerRadius ?? 0;

        // Content position relative to group origin
        const cx = (contentEl.x ?? 0) - gx;
        const cy = (contentEl.y ?? 0) - gy;

        // Build clip-path in group-relative space
        // The clip wrapper is position:absolute, left:0, top:0, 100% x 100% of the group.
        // So clip-path coords are relative to the group origin. Simple.
        const shape = maskEl.shape ?? "rect";
        let clipPath: string;
        if (shape === "circle") {
            clipPath = `ellipse(${mw / 2}px ${mh / 2}px at ${mx + mw / 2}px ${my + mh / 2}px)`;
        } else if (shape === "triangle") {
            clipPath = `polygon(${mx + mw / 2}px ${my}px, ${mx + mw}px ${my + mh}px, ${mx}px ${my + mh}px)`;
        } else {
            // rect: inset from edges of the group to the shape edges
            const top = my;
            const right = gw - mx - mw;
            const bottom = gh - my - mh;
            const left = mx;
            clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${mcr}px)`;
        }

        // Remove debug log now that we understand the values
        return (
            <div style={baseStyle}>
                <div style={{ ...innerStyle, position: "relative" }}>
                    {/*
                     * ─── HOW THIS WORKS ──────────────────────────────────────────
                     * The clip wrapper fills the mask group container (left:0, top:0, 100%x100%).
                     * clip-path is expressed in group-relative coords, cutting to the mask shape.
                     *
                     * The content element is rendered at its ORIGINAL absolute coordinates —
                     * we do NOT override x/y. Instead, the clip wrapper is translated by
                     * (-gx, -gy) and sized to the full overlay, so the content element's
                     * absolute positioning lands exactly where it should within the clip space.
                     *
                     * This avoids the bug where group renderers subtract element.x from children
                     * using the wrong (modified) x value.
                     * ─────────────────────────────────────────────────────────────
                     */}
                    <div style={{
                        position: "absolute",
                        // Shift to align with overlay origin so children's absolute coords work
                        left: -gx,
                        top: -gy,
                        // Size to the full overlay (or at least large enough)
                        width: 1920,
                        height: 1080,
                        clipPath,
                        WebkitClipPath: clipPath,
                    }}>
                        <ElementRenderer
                            element={contentEl}
                            elementsById={elementsById}
                            overlayComponents={overlayComponents}
                            data={data}
                            layout="absolute"
                            visited={nextVisited}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // --- GROUP ---
    if (element.type === "group") {
        const group = element as OverlayGroupElement;

        // Cycle Check
        if (visited && visited.has(element.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(element.id);

        const groupStyle: React.CSSProperties = {
            ...innerStyle,
            backgroundColor: group.backgroundColor,
            borderRadius: group.borderRadiusPx,
            border: group.borderWidth ? `${group.borderWidth}px solid ${group.borderColor}` : undefined,
            // Groups often need relative positioning context for their children
            // But here children are rendered with (child.x - group.x) logic?
            // "child absolute position should be offset by -group.x/-group.y"
            position: "relative",
        };

        return (
            <div style={baseStyle}>
                <div style={groupStyle}>
                    {group.childIds?.map((childId) => {
                        const child = elementsById?.[childId];
                        if (!child) return null;

                        // Calculate relative position for the child
                        // We create a phantom child object shifted to (0,0) relative to group
                        const relX = child.x - element.x;
                        const relY = child.y - element.y;

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
                                data={data}
                                layout="absolute" // force absolute for children inside group
                                visited={nextVisited}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    // --- BOX ---
    if (element.type === "box") {
        const box = element as OverlayBoxElement;
        const br = box.borderRadiusPx ?? (box as any).borderRadius ?? 16;

        // If clip active, it handled borderRadius in innerStyle (if clip.radius set).
        // If clip NOT active, we use native borderRadius.
        // If clip IS active but no radius, we use native borderRadius.
        const effectiveBr = (element.clip && element.clip.type !== "none")
            ? (clipStyle.borderRadius ?? br)
            : br;

        return (
            <div style={baseStyle}>
                <div
                    style={{
                        ...innerStyle,
                        background: box.backgroundColor || "rgba(15,23,42,0.8)",
                        borderRadius: effectiveBr,
                    }}
                />
            </div>
        );
    }

    // --- TEXT ---
    if (element.type === "text") {
        const textEl = element as OverlayTextElement;
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
                        // Note: textShadow conflicts with drop-shadow filter if both used. 
                        // Plan said "use text-stroke-shadow OR filter".
                        // Use textShadow for stroke only.
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

    // --- SHAPE (SVG) ---
    if (element.type === "shape") {
        const s = element as OverlayShapeElement;
        const w = Math.max(1, s.width ?? 1);
        const h = Math.max(1, s.height ?? 1);

        const fill = s.fillColor ?? "rgba(56,189,248,0.18)";
        const fillOpacity = typeof s.fillOpacity === "number" ? s.fillOpacity : 1;

        const stroke = s.strokeColor ?? "rgba(56,189,248,0.95)";
        const strokeWidth =
            s.strokeWidthPx ?? (s as any).strokeWidth ?? 2;

        const strokeOpacity = typeof s.strokeOpacity === "number" ? s.strokeOpacity : 1;
        const dash = Array.isArray(s.strokeDash) && s.strokeDash.length ? s.strokeDash : undefined;

        const cr = s.cornerRadiusPx ?? (s as any).cornerRadius ?? 0;

        const common = {
            fill,
            fillOpacity,
            stroke,
            strokeWidth,
            strokeOpacity,
            strokeDasharray: dash ? dash.join(" ") : undefined,
        } as any;

        return (
            <div style={baseStyle}>
                <div style={innerStyle}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                        {s.shape === "rect" && (
                            <rect
                                x={strokeWidth / 2}
                                y={strokeWidth / 2}
                                width={Math.max(0, w - strokeWidth)}
                                height={Math.max(0, h - strokeWidth)}
                                rx={cr}
                                ry={cr}
                                {...common}
                            />
                        )}

                        {s.shape === "circle" && (
                            <ellipse
                                cx={w / 2}
                                cy={h / 2}
                                rx={Math.max(0, w / 2 - strokeWidth / 2)}
                                ry={Math.max(0, h / 2 - strokeWidth / 2)}
                                {...common}
                            />
                        )}

                        {s.shape === "line" && (
                            <line
                                x1={s.line ? s.line.x1 * w : 0}
                                y1={s.line ? s.line.y1 * h : h / 2}
                                x2={s.line ? s.line.x2 * w : w}
                                y2={s.line ? s.line.y2 * h : h / 2}
                                {...common}
                                fill="none"
                            />
                        )}

                        {s.shape === "triangle" && (
                            <polygon
                                points={`${w / 2},${strokeWidth / 2} ${w - strokeWidth / 2},${h - strokeWidth / 2} ${strokeWidth / 2},${h - strokeWidth / 2}`}
                                {...common}
                            />
                        )}
                    </svg>
                </div>
            </div>
        );
    }

    // --- IMAGE ---
    if (element.type === "image") {
        const img = element as OverlayImageElement;
        const br = img.borderRadiusPx ?? (img as any).borderRadius ?? 0;
        // Clip radius takes precedence if set
        const effectiveBr = (element.clip && element.clip.type !== "none" && typeof element.clip.radius === 'number')
            ? element.clip.radius
            : br;

        const fit = fitToObjectFit(img.fit);
        const src = img.src || "";

        return (
            <div style={baseStyle}>
                <div style={{ ...innerStyle, borderRadius: effectiveBr, overflow: "hidden" }}>
                    {src && (
                        <img
                            src={src}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: fit as any }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // --- VIDEO ---
    if (element.type === "video") {
        const vid = element as OverlayVideoElement;
        const br = vid.borderRadiusPx ?? (vid as any).borderRadius ?? 0;
        const effectiveBr = (element.clip && element.clip.type !== "none" && typeof element.clip.radius === 'number')
            ? element.clip.radius
            : br;

        const fit = fitToObjectFit(vid.fit);
        const src = vid.src || "";

        return (
            <div style={baseStyle}>
                <div style={{ ...innerStyle, borderRadius: effectiveBr, overflow: "hidden" }}>
                    {src && (
                        <video
                            src={src}
                            poster={vid.poster || undefined}
                            autoPlay={!!vid.autoplay}
                            muted={vid.muted !== false}
                            loop={!!vid.loop}
                            controls={!!vid.controls}
                            playsInline
                            style={{ width: "100%", height: "100%", objectFit: fit as any }}
                        />
                    )}
                </div>
            </div>
        );
    }

    // --- PROGRESS BAR ---
    if (element.type === "progressBar") {
        const bar = element as OverlayProgressBarElement;
        const val = Math.max(0, Math.min(1, bar.value ?? 0));
        const br = bar.borderRadiusPx ?? 0;
        const w = Math.max(0, element.width || 0);
        const h = Math.max(0, element.height || 0);

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
                <div style={{
                    ...innerStyle,
                    backgroundColor: bar.backgroundColor ?? "rgba(255,255,255,0.1)",
                    borderRadius: br,
                    overflow: "hidden"
                }}>
                    <div style={progressStyle} />
                </div>
            </div>
        );
    }

    // --- PROGRESS RING ---
    if (element.type === "progressRing") {
        const ring = element as OverlayProgressRingElement;
        const val = Math.max(0, Math.min(1, ring.value ?? 0));
        const sw = ring.strokeWidthPx ?? 4;
        const w = element.width || 1;
        const h = element.height || 1;
        const r = Math.max(0.1, Math.min(w, h) / 2 - sw / 2);
        const cx = w / 2;
        const cy = h / 2;
        const circumference = 2 * Math.PI * r;
        const offset = circumference * (1 - val);
        const startAngle = (ring.startAngleDeg ?? -90); // default top

        return (
            <div style={baseStyle}>
                <div style={innerStyle}>
                    <svg
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${w} ${h}`}
                        style={{ transform: `rotate(${startAngle}deg)` }}
                    >
                        {/* Track */}
                        <circle
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={ring.backgroundColor ?? "rgba(255,255,255,0.1)"}
                            strokeWidth={sw}
                        />
                        {/* Progress */}
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

    // --- LOWER THIRD ---
    if (element.type === "lower_third") {
        const lt = element as OverlayLowerThirdElement;

        // 1. Data Binding & Active State
        // Defaults
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

        // Active logical check: activeKey truthy OR fallback to hasContent
        // Note: The new plan says "primary visibility gate is activeKey truthy"
        //       "Fallback: if activeKey absent from data, treat non-empty bound content as active"
        const isActive = activeVal
            ? (activeVal !== "0" && activeVal !== "false")
            : hasContent;

        // 2. Animation Retention
        const [renderState, setRenderState] = React.useState<{ show: boolean; mounting: boolean }>({
            show: isActive,
            mounting: false // true = enter, false = exit or stable
        });

        React.useEffect(() => {
            if (isActive) {
                // Showing
                setRenderState({ show: true, mounting: true });
                // Remove mounting class after duration to stabilize?
                // Actually simple approach:
                // class "enter" -> normal
                // class "exit" -> unmount
            } else {
                // Hiding
                setRenderState(prev => prev.show ? { show: true, mounting: false } : prev);

                const dur = lt.animation?.durationMs ?? 450;
                const tm = setTimeout(() => {
                    setRenderState(prev => (!isActive ? { show: false, mounting: false } : prev));
                }, dur);
                return () => clearTimeout(tm);
            }
        }, [isActive, lt.animation?.durationMs]);

        // If completely hidden and animation done, don't render
        if (!renderState.show && !isActive) return null;

        // 3. Styles & Layout
        const variant = lt.style?.variant || "accent-bar";
        const layoutMode = lt.layout?.mode || "stacked";

        // Colors
        const bgColor = lt.style?.bgColor || "#111";
        const bgOpacity = lt.style?.bgOpacity ?? 0.75;
        const accent = lt.style?.accentColor || "#4f46e5";
        const titleColor = lt.style?.titleColor || "#fff";
        const subtitleColor = lt.style?.subtitleColor || "rgba(255,255,255,0.85)";

        // Metrics
        const padding = lt.style?.paddingPx ?? 20;
        const radius = lt.style?.cornerRadiusPx ?? 18;
        const titleSize = lt.style?.titleSizePx ?? 40;
        const subSize = lt.style?.subtitleSizePx ?? 26;
        const titleWeight = lt.style?.titleWeight === "normal" ? 400 : 700;
        const font = getFontStack(lt.style?.fontFamily);

        // Animation Classes / Styles
        const animIn = lt.animation?.in || "slideUp";
        const animOut = lt.animation?.out || "slideDown";
        const animDur = lt.animation?.durationMs ?? 450;
        const ease = lt.animation?.easing || "cubic-bezier(0.2, 0.9, 0.2, 1)";

        // We'll use inline styles for animation to avoid new global CSS.
        // State:
        //  - isActive + renderState.show => ENTERING (or stable shown)
        //  - !isActive + renderState.show => EXITING

        // Ideally we start from "out" state, transition to "in".
        // But for React retention, we can just use a key or simple prop.
        // Let's use a transition wrapper.

        const isExiting = !isActive && renderState.show;

        // Compute transform/opacity based on state
        const getAnimStyle = (type: string): React.CSSProperties => {
            if (type === "none") return {};
            if (type === "fade") return { opacity: 0 };
            if (type === "slideUp") return { transform: "translateY(100%)", opacity: 0 };
            if (type === "slideDown") return { transform: "translateY(100%)", opacity: 0 }; // same direction usually
            if (type === "slideLeft") return { transform: "translateX(-50px)", opacity: 0 };
            if (type === "slideRight") return { transform: "translateX(50px)", opacity: 0 };
            return {};
        };

        // Base state is "idle/shown".
        // Enter state: start at valid 'out' position, transition to idle.
        // Exit state: transition from idle to valid 'out' position.

        const baseTrans: React.CSSProperties = {
            transition: `all ${animDur}ms ${ease}`,
            opacity: 1,
            transform: "translate(0,0)",
        };

        const outStyle = isExiting ? getAnimStyle(animOut) : {};
        // Initial mount check is harder in pure function component without more state.
        // We'll rely on the fact that if it *was* unmounted, it starts fresh.
        // To animate IN, we need a layout effect or CSS animation. 
        // CSS animation keyframes are cleaner but we can't inject easily.
        // Let's use a simple mounting flag with setTimeout to trigger "enter".

        // Actually, simpler:
        // Use a persistent opacity/transform.
        // If isActive, style = idle.
        // If !isActive, style = outStyle.
        // But for ENTER, it defaults to idle immediately.
        // We need 'start-state'.

        // To fix enter animation, we can allow the 'enter' style to persist for one tick.
        // But simpler: just toggle a class or data-attr if we had CSS.
        // We will settle for: Exiting works well. Entering might pop unless we hold state.
        // Let's try to just render "Exiting" state correctly, and for "Entering" we accept pop 
        // OR we use a "hasMounted" ref to suppress transition on very first render? No, we want animation.
        // We will skip complex enter-animation logic for this V1 patch to minimize lines 
        // and just rely on transition from "out" state if possible. 
        // Retaining "isExiting" logic is good.

        const combinedAnimStyle = {
            ...baseTrans,
            ...(isExiting ? outStyle : {}),
            // To animate IN, we normally need to start at "outStyle" then frame -> normal.
            // This requires `useEffect` to set a 'vis' state after mount.
        };

        // --- Content Rendering ---

        // Resolvers
        const titleText = resolveText(rawTitle || rawText, data);
        const subText = resolveText(rawSubtitle, data);

        // Layout: Single (only text/title), Stacked (Title \n Sub), Split (Title | Sub)

        let contentNode: React.ReactNode;

        if (layoutMode === "single") {
            contentNode = (
                <div style={{ fontSize: titleSize, fontWeight: titleWeight, color: titleColor }}>
                    {titleText}
                </div>
            );
        } else if (layoutMode === "split") {
            const ratio = lt.layout?.splitRatio ?? 0.6; // e.g. 60% left
            const leftW = `${ratio * 100}%`;
            const rightW = `${(1 - ratio) * 100}%`;

            contentNode = (
                <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center" }}>
                    <div style={{ width: leftW, paddingRight: padding, textAlign: "right", borderRight: `2px solid ${accent}`, fontSize: titleSize, fontWeight: titleWeight, color: titleColor }}>
                        {titleText}
                    </div>
                    <div style={{ width: rightW, paddingLeft: padding, fontSize: subSize, color: subtitleColor }}>
                        {subText}
                    </div>
                </div>
            );
        } else {
            // Stacked
            contentNode = (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    {titleText && (
                        <div style={{ fontSize: titleSize, fontWeight: titleWeight, color: titleColor }}>{titleText}</div>
                    )}
                    {subText && (
                        <div style={{ fontSize: subSize, color: subtitleColor, marginTop: 4 }}>{subText}</div>
                    )}
                </div>
            );
        }

        // --- Container Styles (Variant) ---
        // "accent-bar" -> Left border accent
        // "glass" -> Blur bg
        // "solid" -> Solid bg
        // "minimal" -> No bg, just text?

        const containerStyle: React.CSSProperties = {
            width: "100%",
            height: "100%",
            borderRadius: radius,
            padding: padding,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column", // defaulting to flex col unless content overrides
            justifyContent: "center",
            fontFamily: font,
            position: "relative",
            overflow: "hidden", // for glass/fills
        };

        if (variant === "glass") {
            containerStyle.backgroundColor = `rgba(30,30,30, ${bgOpacity * 0.5})`;
            containerStyle.backdropFilter = "blur(12px)";
            containerStyle.border = "1px solid rgba(255,255,255,0.1)";
        } else if (variant === "minimal") {
            containerStyle.backgroundColor = "transparent";
            containerStyle.padding = 0; // minimal usually implies raw text placement
        } else {
            // solid / accent-bar
            containerStyle.backgroundColor = hexToRgba(bgColor, bgOpacity);
            if (variant === "accent-bar") {
                containerStyle.borderLeft = `6px solid ${accent}`;
            }
        }

        return (
            <div style={baseStyle}>
                {/* Animation Wrapper */}
                <div style={{ width: "100%", height: "100%", ...combinedAnimStyle }}>
                    <div style={innerStyle}>
                        <div style={containerStyle}>
                            {contentNode}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

// Helper
function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r)) return hex; // fallback
    return `rgba(${r},${g},${b},${alpha})`;
}
