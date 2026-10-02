import { test, expect, openGame, boardCounts, chooseTool } from "./fixtures.mjs";
import { enterCampaignLevel1 } from "./campaign-flow.mjs";

// Two empty board cells at the default camera (1280x720). The input layer
// raycasts these clicks onto the grid exactly as it does for a player.
const CELL_A = { x: 640, y: 400 };
const CELL_B = { x: 780, y: 400 };

async function click(page, p) {
    await page.mouse.click(p.x, p.y);
}

test.describe("gameplay", () => {
    test("survival starts, the clock runs and traffic spawns", async ({ page }) => {
        await openGame(page);
        await page.locator('button[onclick="startGame()"]').click();
        await expect(page.locator("#main-menu-modal")).toBeHidden();
        // A run starts paused so the player can build first.
        expect(await page.evaluate(() => window.STATE.timeScale)).toBe(0);

        await page.locator("#btn-play").click();
        await page.waitForFunction(() => window.STATE.elapsedGameTime > 1.5);
        const state = await page.evaluate(() => ({
            mode: window.STATE.gameMode,
            running: window.STATE.isRunning,
            spawned: window.STATE.requests.length > 0 || window.STATE.score.total !== 0,
        }));
        expect(state).toEqual({ mode: "survival", running: true, spawned: true });
        await expect(page.locator("#elapsed-time")).not.toHaveText("0s");
    });

    test("sandbox: place, link and explain rejected links with real clicks", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => window.startSandbox());

        await chooseTool(page, "waf");
        await click(page, CELL_A);
        await chooseTool(page, "alb");
        await click(page, CELL_B);
        await expect.poll(() => boardCounts(page)).toMatchObject({ services: 2 });
        const types = await page.evaluate(() => window.STATE.services.map((s) => s.type));
        expect(types).toEqual(["waf", "alb"]);

        await chooseTool(page, "connect");
        await click(page, CELL_A);
        await click(page, CELL_B);
        await expect.poll(() => boardCounts(page)).toMatchObject({ connections: 1 });

        // Reverse link: rejected, explained, nothing added.
        await click(page, CELL_B);
        await click(page, CELL_A);
        await expect(page.locator("#live-status")).toHaveText(
            "A reverse connection between those nodes already exists."
        );
        // Self link: rejected, explained.
        await click(page, CELL_A);
        await click(page, CELL_A);
        await expect(page.locator("#live-status")).toHaveText("You can't connect a node to itself.");
        expect((await boardCounts(page)).connections).toBe(1);

        // Demolish removes the node and its link.
        await chooseTool(page, "delete");
        await click(page, CELL_B);
        await expect.poll(() => boardCounts(page)).toMatchObject({ services: 1, connections: 0 });
    });

    test("campaign level 1 shows its goals before Play", async ({ page }) => {
        await openGame(page);
        await enterCampaignLevel1(page);

        const panel = page.locator("#objectivesPanel");
        await expect(panel).toBeVisible();
        await expect(panel).toContainText("Process 50 READ requests");
        await expect(panel).toContainText("Keep reputation above 80%");
        expect(await page.evaluate(() => window.STATE.elapsedGameTime)).toBe(0);
    });

    test("restart returns an empty board and a fresh budget", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => window.startSandbox());
        await chooseTool(page, "waf");
        await click(page, CELL_A);
        await expect.poll(() => boardCounts(page)).toMatchObject({ services: 1 });

        await page.evaluate(() => window.restartGame());
        await expect.poll(() => boardCounts(page)).toEqual({ services: 0, connections: 0, requests: 0 });
    });
});

test.describe("HUD layout at 1280x720", () => {
    test("no HUD panel slides under the build toolbar", async ({ page }) => {
        await openGame(page);
        await enterCampaignLevel1(page);
        const toolbarTop = await page.locator("#tool-select").evaluate(
            (el) => el.closest(".glass-panel").getBoundingClientRect().top
        );
        for (const id of ["objectivesPanel", "hud-right-column"]) {
            const box = await page.locator(`#${id}`).boundingBox();
            expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(toolbarTop);
        }
    });
});
