import { test, expect, openGame, boardCounts } from "./fixtures.mjs";
import { enterCampaignLevel1 } from "./campaign-flow.mjs";

// Runs in the "mobile" project (Pixel 7: 412x915, touch, DPR 2.625).

async function noHorizontalScroll(page) {
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** A point where the board itself (not a HUD panel) receives the touch. */
async function openBoardPoint(page) {
    const point = await page.evaluate(() => {
        const canvas = document.querySelector("#canvas-container canvas");
        for (let y = window.innerHeight * 0.35; y < window.innerHeight * 0.75; y += 20) {
            for (let x = 40; x < window.innerWidth - 40; x += 20) {
                if (document.elementFromPoint(x, y) === canvas) return { x, y };
            }
        }
        return null;
    });
    expect(point, "no uncovered board area on screen").not.toBeNull();
    return point;
}

test.describe("phone", () => {
    test("menu, sandbox and campaign fit the screen width", async ({ page }) => {
        await openGame(page);
        await noHorizontalScroll(page);
        await enterCampaignLevel1(page);
        await noHorizontalScroll(page);
        await page.evaluate(() => window.startSandbox());
        await noHorizontalScroll(page);
    });

    test("a tap on the board places the selected service", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => {
            window.startGame();
            window.setTool("waf");
        });
        const p = await openBoardPoint(page);
        await page.touchscreen.tap(p.x, p.y);
        await expect.poll(() => boardCounts(page)).toMatchObject({ services: 1 });
        expect(await page.evaluate(() => window.STATE.services[0].type)).toBe("waf");
    });

    test("the objectives panel clears the build toolbar", async ({ page }) => {
        await openGame(page);
        await enterCampaignLevel1(page);
        const objectives = await page.locator("#objectivesPanel").boundingBox();
        const toolbar = await page.locator("#tool-select").evaluate(
            (el) => el.closest(".glass-panel").getBoundingClientRect().toJSON()
        );
        expect(objectives.y + objectives.height).toBeLessThanOrEqual(toolbar.top);
    });
});
