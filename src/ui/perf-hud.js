// Opt-in performance overlay (open the game with `?perf=1`).
//
// Shows what the roadmap's performance budget needs to be measured against:
// FPS, frame-time p50/p95 over the last second, renderer draw calls and
// triangles, live GPU geometries/textures, and live requests. It is off by
// default and costs nothing then — frame() returns immediately.

const WINDOW = 120; // frames kept for percentiles (~2 s at 60 fps)
const REFRESH_MS = 500;

export function isPerfHudRequested(search = globalThis.location?.search ?? "") {
    try {
        const value = new URLSearchParams(search).get("perf");
        return value !== null && value !== "0" && value !== "false";
    } catch {
        return false;
    }
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[i];
}

export function summarizeFrameTimes(frameTimes) {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
    return {
        fps: mean > 0 ? 1000 / mean : 0,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
    };
}

export function createPerfHud({ enabled = isPerfHudRequested(), doc = globalThis.document } = {}) {
    if (!enabled || !doc) return { enabled: false, frame() {} };

    const el = doc.createElement("div");
    el.id = "perf-hud";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
        "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;" +
        "pointer-events:none;font:11px/1.35 ui-monospace,monospace;color:#9ef0c0;" +
        "background:rgba(0,0,0,.72);border:1px solid rgba(0,255,133,.35);" +
        "border-radius:6px;padding:4px 8px;white-space:pre;";
    doc.body.appendChild(el);

    const frameTimes = [];
    let last = null;
    let lastPaint = 0;

    return {
        enabled: true,
        frame(now, { renderer, requests = 0, services = 0 } = {}) {
            if (last !== null) {
                frameTimes.push(now - last);
                if (frameTimes.length > WINDOW) frameTimes.shift();
            }
            last = now;
            if (now - lastPaint < REFRESH_MS) return;
            lastPaint = now;

            const { fps, p50, p95 } = summarizeFrameTimes(frameTimes);
            const info = renderer?.info;
            const r = info?.render ?? {};
            const m = info?.memory ?? {};
            el.textContent =
                `${fps.toFixed(0)} fps  p50 ${p50.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms\n` +
                `draw ${r.calls ?? "-"}  tris ${r.triangles ?? "-"}  ` +
                `geo ${m.geometries ?? "-"}  tex ${m.textures ?? "-"}\n` +
                `services ${services}  requests ${requests}`;
        },
    };
}
