import { defineConfig, devices } from "@playwright/test";

// Browser tests (e2e/): the real game in real Chromium with WebGL, served by
// scripts/serve.mjs exactly as GitHub Pages serves it — no build, no stubs.
// The Vitest suite (tests/) proves the simulation; this suite proves the
// page: boot, input, layout, accessibility, persistence and visual identity.
//
//   npm run test:e2e            run everything
//   npm run test:e2e:update     re-record visual baselines (Linux only)
const PORT = Number(process.env.E2E_PORT) || 4173;

export default defineConfig({
    testDir: "e2e",
    testMatch: "**/*.spec.mjs",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // No retries: a test that passes on the second attempt is a bug report,
    // not a pass.
    retries: 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI
        ? [["github"], ["html", { open: "never" }], ["list"]]
        : [["list"]],
    snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
    expect: {
        toHaveScreenshot: {
            animations: "disabled",
            caret: "hide",
            // Anti-aliasing noise only; a layout or colour change is far larger.
            maxDiffPixelRatio: 0.01,
        },
    },
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // The game honours prefers-reduced-motion (style.css); running with
        // it makes pulsing controls clickable and screenshots deterministic,
        // and keeps that accessibility path under test.
        contextOptions: { reducedMotion: "reduce" },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "node scripts/serve.mjs",
        env: { PORT: String(PORT) },
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
    projects: [
        {
            name: "desktop",
            testIgnore: /mobile\.spec\.mjs$/,
            use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
        },
        {
            name: "mobile",
            testMatch: /(mobile|visual)\.spec\.mjs$/,
            use: { ...devices["Pixel 7"] },
        },
    ],
});
