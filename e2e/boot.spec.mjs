import { test, expect, openGame } from "./fixtures.mjs";

test.describe("boot", () => {
    test("boots offline from its own origin with WebGL and no errors", async ({ page }) => {
        await openGame(page);

        await expect(page.locator("#main-menu-modal")).toBeVisible();
        await expect(page).toHaveTitle(/SERVER/);

        const info = await page.evaluate(() => {
            const canvas = document.querySelector("#canvas-container canvas");
            // A canvas keeps the context type it was created with; asking for
            // the one three.js picked returns that same live context.
            const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
            return {
                revision: window.THREE?.REVISION,
                webgl: !!gl && !gl.isContextLost(),
                width: canvas.width,
            };
        });
        expect(info.revision).toBe("128");
        expect(info.webgl).toBe(true);
        expect(info.width).toBeGreaterThan(0);
    });

    test("the compiled stylesheet is applied (no Tailwind Play CDN)", async ({ page }) => {
        await openGame(page);
        const start = page.locator('button[onclick="startGame()"]');
        // bg-green-700 from vendor/tailwind/tailwind.css
        await expect(start).toHaveCSS("background-color", "rgb(21, 128, 61)");
        await expect(start).toHaveCSS("text-transform", "uppercase");
    });

    test("explains itself instead of a blank page when three.js cannot load", async ({ page, diagnostics }) => {
        diagnostics.allowErrors.push(/THREE is not defined|Failed to load resource/);
        await page.route("**/vendor/three/three.min.js", (route) => route.fulfill({ status: 404, body: "" }));
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Server Survival could not start" })).toBeVisible();
    });
});
