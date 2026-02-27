import { c, j as r, b as a } from "./assets/index-BxuFAmv3.js";

function ElementRenderer({ element: t }) {
  const e = { position: "absolute", left: t.x, top: t.y, width: t.width, height: t.height };

  if (t.type === "box") {
    const s = t;
    return r.jsx("div", {
      style: { ...e, background: s.backgroundColor || "rgba(15,23,42,0.8)", borderRadius: s.borderRadius ?? 16 }
    });
  }

  const o = t;
  let n = "flex-start";
  if (o.textAlign === "center") n = "center";
  if (o.textAlign === "right") n = "flex-end";

  return r.jsx("div", {
    style: {
      ...e,
      display: "flex",
      alignItems: "center",
      justifyContent: n,
      padding: "8px 12px",
      color: "#e5e7eb",
      fontSize: o.fontSize ?? 24,
      fontWeight: o.fontWeight === "bold" ? 700 : 400,
      boxSizing: "border-box"
    },
    children: o.text
  });
}

function DebugHud({ state }) {
  const mode = state?.show?.mode ?? "unknown";
  const rev = state?.rev ?? "?";
  const ts = state?.ts ?? null;

  return r.jsx("div", {
    style: {
      position: "absolute",
      left: 16,
      top: 16,
      padding: "10px 12px",
      borderRadius: 12,
      background: "rgba(2,6,23,0.75)",
      border: "1px solid rgba(148,163,184,0.25)",
      color: "#e5e7eb",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1.35,
      zIndex: 9999,
      minWidth: 220
    },
    children: r.jsxs("div", {
      children: [
        r.jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Scraplet Overlay V0" }),
        r.jsxs("div", { children: ["mode: ", r.jsx("span", { style: { fontWeight: 700 }, children: mode })] }),
        r.jsxs("div", { children: ["rev: ", String(rev)] }),
        r.jsxs("div", { children: ["ts: ", ts ? new Date(ts).toISOString() : "—"] })
      ]
    })
  });
}

function OverlayRuntime({ publicId: t }) {
  const [config, setConfig] = a.useState(null);
  const [state, setState] = a.useState(null);

  // Load overlay config once
  a.useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/api/overlays/public/${t}`);
        if (!resp.ok) {
          console.error("Failed to load overlay config", resp.status);
          return;
        }
        const cfg = await resp.json();
        setConfig(cfg);
      } catch (err) {
        console.error("Failed to load overlay config", err);
      }
    })();
  }, [t]);

  // Poll overlay state (V0)
  a.useEffect(() => {
    let alive = true;
    let timer = null;

    const tick = async () => {
      try {
        const resp = await fetch(`/api/overlays/public/${t}/state`, { cache: "no-store" });
        if (!resp.ok) return;
        const s = await resp.json();
        if (alive) setState(s);
      } catch (err) {
        // swallow; transient network failures are fine
      }
    };

    // initial + interval
    tick();
    timer = setInterval(tick, 750);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [t]);

  if (!config) return null;

  const { width: n, height: s } = config.baseResolution || { width: 1920, height: 1080 };

  return r.jsx("div", {
    style: {
      width: "100vw",
      height: "100vh",
      background: config.backgroundColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    children: r.jsxs("div", {
      style: {
        position: "relative",
        width: n,
        height: s,
        transformOrigin: "top left",
        transform: `scale(${Math.min(window.innerWidth / n, window.innerHeight / s)})`
      },
      children: [
        config.elements?.map((i) => r.jsx(ElementRenderer, { element: i }, i.id)),
        r.jsx(DebugHud, { state })
      ]
    })
  });
}

const rootEl = document.getElementById("overlay-runtime-root");
if (rootEl && window.__OVERLAY_PUBLIC_ID__) {
  c.createRoot(rootEl).render(r.jsx(OverlayRuntime, { publicId: window.__OVERLAY_PUBLIC_ID__ }));
}
