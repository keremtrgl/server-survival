import { test, expect, openGame, boardCounts, chooseTool } from "./fixtures.mjs";

async function buildTwoNodeBoard(page) {
    await page.evaluate(() => window.startSandbox());
    await chooseTool(page, "waf");
    await page.mouse.click(640, 400);
    await chooseTool(page, "alb");
    await page.mouse.click(780, 400);
    await chooseTool(page, "connect");
    await page.mouse.click(640, 400);
    await page.mouse.click(780, 400);
    await expect.poll(() => boardCounts(page)).toMatchObject({ services: 2, connections: 1 });
}

test.describe("save and load", () => {
    test("a browser save survives a reload and restores the board", async ({ page }) => {
        await openGame(page);
        await buildTwoNodeBoard(page);
        page.once("dialog", (d) => d.accept());
        await page.evaluate(() => window.saveGameState("browser"));

        await page.reload();
        await page.waitForFunction(() => window.STATE && window.onClickContinueGame);
        await page.evaluate(() => window.onClickContinueGame());
        await expect.poll(() => boardCounts(page)).toMatchObject({ services: 2, connections: 1 });
    });

    test("a corrupt save file is rejected and the current board is kept", async ({ page, diagnostics }) => {
        diagnostics.allowErrors.push(/Failed to load game/);
        await openGame(page);
        await buildTwoNodeBoard(page);

        const dialog = page.waitForEvent("dialog");
        await page.locator("#upload-file-input").setInputFiles({
            name: "broken.json",
            mimeType: "application/json",
            buffer: Buffer.from('{"version":"2.0","services":[{"type":"not-a-service"'),
        });
        const d = await dialog;
        expect(d.message()).toMatch(/save file may be corrupted/i);
        await d.accept();

        expect(await boardCounts(page)).toMatchObject({ services: 2, connections: 1 });
    });
});
