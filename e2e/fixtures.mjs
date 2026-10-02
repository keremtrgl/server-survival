// Shared fixtures for the browser suite.
//
// Every test runs the page fully offline: any request that leaves the local
// server is aborted and recorded, so a regression that reintroduces a CDN or
// a tracker fails loudly instead of silently depending on the network. Page
// errors and console errors are collected and must be empty when the test
// ends, unless a test explicitly expects one.
import { test as base, expect } from "@playwright/test";

// Browsers may refuse audio before a user gesture; that is policy, not a bug.
const BENIGN = [/NotAllowedError/, /play\(\) (request|failed)/i, /user didn't interact/i];

export const test = base.extend({
    diagnostics: [
        async ({ page, baseURL }, use) => {
            const origin = new URL(baseURL).origin;
            const diag = { external: [], errors: [], allowErrors: [] };

            await page.route("**/*", (route) => {
                const url = route.request().url();
                if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) {
                    return route.continue();
                }
                diag.external.push(url);
                return route.abort("blockedbyclient");
            });
            page.on("pageerror", (err) => diag.errors.push(`pageerror: ${err.message}`));
            page.on("console", (msg) => {
                if (msg.type() === "error") diag.errors.push(`console: ${msg.text()}`);
            });

            await use(diag);

            const unexpected = diag.errors.filter(
                (e) =>
                    !BENIGN.some((re) => re.test(e)) &&
                    !diag.allowErrors.some((re) => re.test(e))
            );
            expect(diag.external, "requests to third-party origins").toEqual([]);
            expect(unexpected, "page or console errors").toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };

/**
 * Open the game and wait until the module graph has booted: STATE and i18n
 * exist and the WebGL canvas is in the DOM. `skipTutorial` marks the guided
 * tutorial as done so campaign level 1 does not open it over the board.
 */
export async function openGame(page, { path = "/", skipTutorial = true } = {}) {
    if (skipTutorial) {
        await page.addInitScript(() => {
            try {
                localStorage.setItem("serverSurvivalTutorialComplete", "true");
            } catch {
                // storage unavailable: the tutorial simply shows
            }
        });
    }
    await page.goto(path);
    await page.waitForFunction(
        () => window.STATE && window.i18n && document.querySelector("#canvas-container canvas")
    );
}

/** Board-wide counts, read from the live game state. */
export function boardCounts(page) {
    return page.evaluate(() => ({
        services: window.STATE.services.length,
        connections: window.STATE.connections.length,
        requests: window.STATE.requests.length,
    }));
}

/** Pick a build tool by clicking its real toolbar button. */
export async function chooseTool(page, tool) {
    const button = page.locator(`#tool-${tool}`);
    // Service buttons live in category tabs; reveal the tab that owns it.
    if (!(await button.isVisible())) {
        await page.evaluate((t) => window.setTool(t), tool);
        return;
    }
    await button.click();
}
