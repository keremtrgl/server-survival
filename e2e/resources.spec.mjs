import { test, expect, openGame, boardCounts, chooseTool } from "./fixtures.mjs";

// Reads the ?perf=1 overlay (src/ui/perf-hud.js), which prints three.js
// renderer.info — the GPU-side truth that state arrays cannot show.
async function rendererStats(page) {
    await expect(page.locator("#perf-hud")).toContainText("geo");
    // The overlay repaints every 500 ms; wait for a fresh sample.
    await page.waitForTimeout(600);
    const text = await page.locator("#perf-hud").textContent();
    const num = (label) => Number(new RegExp(`${label} (\\d+)`).exec(text)?.[1]);
    return { fps: num(""), geometries: num("geo"), textures: num("tex"), draws: num("draw") };
}

test.describe("GPU resources and load bounds", () => {
    test("repeated restarts under traffic do not leak GPU geometries", async ({ page }) => {
        await openGame(page, { path: "/?perf=1" });

        const cycle = async () => {
            await page.evaluate(() => window.startSandbox());
            await chooseTool(page, "waf");
            await page.mouse.click(640, 400);
            await chooseTool(page, "alb");
            await page.mouse.click(780, 400);
            await page.evaluate(() => {
                window.setSandboxRPS(80);
                window.spawnBurst("READ");
            });
            await page.waitForTimeout(700);
            await page.evaluate(() => window.restartGame());
            await expect.poll(() => boardCounts(page)).toEqual({ services: 0, connections: 0, requests: 0 });
        };

        await cycle();
        const baseline = await rendererStats(page);
        for (let i = 0; i < 5; i++) await cycle();
        const after = await rendererStats(page);

        expect(baseline.geometries).toBeGreaterThan(0);
        // Five more full runs: a per-run leak would add dozens of geometries.
        expect(after.geometries - baseline.geometries).toBeLessThanOrEqual(2);
        expect(after.textures - baseline.textures).toBeLessThanOrEqual(1);
    });

    test("live requests share GPU resources instead of allocating one each", async ({ page }) => {
        await openGame(page, { path: "/?perf=1" });
        await page.evaluate(() => {
            window.startSandbox();
            window.setTimeScale(1);
        });
        const before = await rendererStats(page);
        await page.evaluate(() => window.setSandboxRPS(200));
        await expect.poll(async () => (await boardCounts(page)).requests, { timeout: 10_000 }).toBeGreaterThan(40);
        const loaded = await rendererStats(page);
        expect(loaded.geometries - before.geometries).toBeLessThanOrEqual(2);
    });

    test("an absurd sandbox RPS is clamped and the page stays responsive", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => {
            window.startSandbox();
            window.setTimeScale(1);
            window.setSandboxRPS(1e9);
        });
        expect(await page.evaluate(() => window.STATE.currentRPS)).toBe(500);
        await expect(page.locator("#rps-input")).toHaveValue("500");

        // The main thread still answers promptly under the capped load.
        await page.waitForTimeout(1500);
        const started = Date.now();
        await page.evaluate(() => 1 + 1);
        expect(Date.now() - started).toBeLessThan(2000);
    });
});
