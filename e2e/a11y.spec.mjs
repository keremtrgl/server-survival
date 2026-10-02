import AxeBuilder from "@axe-core/playwright";
import { test, expect, openGame } from "./fixtures.mjs";
import { enterCampaignLevel1 } from "./campaign-flow.mjs";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function violations(page) {
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    return violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test.describe("accessibility (axe-core, WCAG 2.1 A/AA)", () => {
    test("main menu", async ({ page }) => {
        await openGame(page);
        expect(await violations(page)).toEqual([]);
    });

    test("sandbox controls", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => window.startSandbox());
        await expect(page.locator("#sandboxPanel")).toBeVisible();
        expect(await violations(page)).toEqual([]);
    });

    test("campaign level with the tutorial open", async ({ page }) => {
        await openGame(page, { skipTutorial: false });
        await enterCampaignLevel1(page);
        await expect(page.locator("#tutorial-next")).toBeVisible();
        expect(await violations(page)).toEqual([]);
    });

    test("operator manual", async ({ page }) => {
        await openGame(page);
        await page.evaluate(() => window.showFAQ());
        await expect(page.locator("#faq-modal")).toBeVisible();
        expect(await violations(page)).toEqual([]);
    });

    test("the menu is operable from the keyboard alone", async ({ page }) => {
        await openGame(page);
        const start = page.locator('button[onclick="startGame()"]');
        for (let i = 0; i < 40 && !(await start.evaluate((el) => el === document.activeElement)); i++) {
            await page.keyboard.press("Tab");
        }
        await expect(start).toBeFocused();
        await expect(start).toHaveCSS("outline-style", "solid");
        await page.keyboard.press("Enter");
        await expect(page.locator("#main-menu-modal")).toBeHidden();
        expect(await page.evaluate(() => window.STATE.gameMode)).toBe("survival");
    });

    test("pinch-zoom is not disabled for the page", async ({ page }) => {
        await openGame(page);
        const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/);
    });
});
