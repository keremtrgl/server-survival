// The ?perf=1 overlay (src/ui/perf-hud.js): off by default and inert when off,
// and its frame-time summary reports the numbers the overlay prints.
import { describe, it, expect } from "vitest";
import { Window } from "happy-dom";
import {
    createPerfHud,
    isPerfHudRequested,
    summarizeFrameTimes,
} from "../src/ui/perf-hud.js";

describe("perf HUD", () => {
    it("is only requested by an explicit, truthy ?perf flag", () => {
        expect(isPerfHudRequested("")).toBe(false);
        expect(isPerfHudRequested("?lang=en")).toBe(false);
        expect(isPerfHudRequested("?perf=0")).toBe(false);
        expect(isPerfHudRequested("?perf=false")).toBe(false);
        expect(isPerfHudRequested("?perf")).toBe(true);
        expect(isPerfHudRequested("?perf=1")).toBe(true);
    });

    it("summarizes frame times as fps and percentiles", () => {
        const times = [...Array(19).fill(16), 50];
        const { fps, p50, p95 } = summarizeFrameTimes(times);
        expect(p50).toBe(16);
        expect(p95).toBe(50);
        expect(fps).toBeCloseTo(1000 / ((19 * 16 + 50) / 20), 5);
        expect(summarizeFrameTimes([])).toEqual({ fps: 0, p50: 0, p95: 0 });
    });

    it("adds nothing to the page when disabled", () => {
        const doc = new Window().document;
        const hud = createPerfHud({ enabled: false, doc });
        hud.frame(0);
        expect(hud.enabled).toBe(false);
        expect(doc.getElementById("perf-hud")).toBeNull();
    });

    it("renders renderer and board stats when enabled", () => {
        const doc = new Window().document;
        const hud = createPerfHud({ enabled: true, doc });
        const renderer = {
            info: { render: { calls: 42, triangles: 1234 }, memory: { geometries: 7, textures: 3 } },
        };
        for (let t = 0; t <= 600; t += 16) hud.frame(t, { renderer, requests: 9, services: 4 });
        const text = doc.getElementById("perf-hud").textContent;
        expect(text).toMatch(/fps/);
        expect(text).toContain("draw 42");
        expect(text).toContain("tris 1234");
        expect(text).toContain("geo 7");
        expect(text).toContain("services 4  requests 9");
    });
});
