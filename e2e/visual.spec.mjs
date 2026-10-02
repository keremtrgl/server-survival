import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test, expect, openGame } from "./fixtures.mjs";
import { enterCampaignLevel1 } from "./campaign-flow.mjs";

// Visual regression for the DOM UI (menus, HUD, panels). Screenshots must be
// identical on every Linux machine, so the two machine-dependent inputs are
// pinned: text renders in a bundled font (Inter, from @fontsource/inter)
// instead of whatever sans-serif the OS has, and the WebGL board — rendered by
// whatever GPU or software rasterizer is present — is hidden. Gameplay
// rendering is covered by the functional specs instead.
//
// Baselines live in e2e/__screenshots__ and are recorded on Linux, the CI
// platform; `npm run test:e2e:update` re-records them after an intended change.
const require = createRequire(import.meta.url);
const FONT_DIR = require.resolve("@fontsource/inter/package.json").replace(/package\.json$/, "files/");
const FONTS = {
    "400": readFileSync(`${FONT_DIR}inter-latin-ext-400-normal.woff2`),
    "700": readFileSync(`${FONT_DIR}inter-latin-ext-700-normal.woff2`),
    "400l": readFileSync(`${FONT_DIR}inter-latin-400-normal.woff2`),
    "700l": readFileSync(`${FONT_DIR}inter-latin-700-normal.woff2`),
};

const PIN_CSS = `
@font-face { font-family: "E2E Inter"; font-weight: 400; src: url(/__e2e__/fonts/400l.woff2) format("woff2"); unicode-range: U+0000-00FF, U+2000-206F, U+20AC, U+2122, U+2190-21FF, U+2212; }
@font-face { font-family: "E2E Inter"; font-weight: 400; src: url(/__e2e__/fonts/400.woff2) format("woff2"); unicode-range: U+0100-024F; }
@font-face { font-family: "E2E Inter"; font-weight: 700; src: url(/__e2e__/fonts/700l.woff2) format("woff2"); unicode-range: U+0000-00FF, U+2000-206F, U+20AC, U+2122, U+2190-21FF, U+2212; }
@font-face { font-family: "E2E Inter"; font-weight: 700; src: url(/__e2e__/fonts/700.woff2) format("woff2"); unicode-range: U+0100-024F; }
*, *::before, *::after { font-family: "E2E Inter", sans-serif !important; }
#canvas-container { visibility: hidden !important; }
`;

async function pinRendering(page) {
    await page.route("**/__e2e__/fonts/*.woff2", (route) => {
        const key = route.request().url().split("/").pop().replace(".woff2", "");
        return route.fulfill({ body: FONTS[key], contentType: "font/woff2" });
    });
}

async function settle(page) {
    await page.addStyleTag({ content: PIN_CSS });
    await page.evaluate(async () => {
        await document.fonts.load('400 16px "E2E Inter"');
        await document.fonts.load('700 16px "E2E Inter"');
        await document.fonts.ready;
    });
}

test.describe("visual", () => {
    test.skip(process.platform !== "linux", "visual baselines are recorded on Linux (the CI platform)");

    test.beforeEach(async ({ page }) => {
        await pinRendering(page);
    });

    test("main menu", async ({ page }) => {
        await openGame(page);
        await settle(page);
        await expect(page).toHaveScreenshot("main-menu.png");
    });

    test("main menu in Turkish", async ({ page }) => {
        await openGame(page);
        await page.locator("#lang-select").selectOption("tr");
        await settle(page);
        await expect(page).toHaveScreenshot("main-menu-tr.png");
    });

    test("campaign map", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => window.openCampaignSelect());
        await expect(page.locator("#campaign-select-modal")).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot("campaign-map.png");
    });

    test("sandbox HUD", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => window.startSandbox());
        await expect(page.locator("#sandboxPanel")).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot("sandbox-hud.png");
    });

    test("campaign level 1 HUD", async ({ page }) => {
        await openGame(page);
        await enterCampaignLevel1(page);
        await expect(page.locator("#objectivesPanel")).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot("campaign-level-1.png");
    });
});
