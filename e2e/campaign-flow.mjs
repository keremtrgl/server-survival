import { expect } from "./fixtures.mjs";

/**
 * Enter campaign level 1 the way a player does: main menu → campaign map →
 * level card → briefing → Start Level.
 */
export async function enterCampaignLevel1(page) {
    await page.locator('button[onclick="openCampaignSelect()"]').click();
    await expect(page.locator("#campaign-select-modal")).toBeVisible();
    await page.locator('#campaign-levels-list [onclick="openCampaignBriefing(1)"]').click();
    await expect(page.locator("#campaign-briefing-modal")).toBeVisible();
    await page.locator('button[onclick="campaignStartCurrentLevel()"]').click();
    await expect(page.locator("#campaign-briefing-modal")).toBeHidden();
    await expect(page.locator("#main-menu-modal")).toBeHidden();
}
