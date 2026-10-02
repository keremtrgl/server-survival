import { test, expect, openGame } from "./fixtures.mjs";

test.describe("languages", () => {
    test.describe("with a Turkish browser", () => {
        test.use({ locale: "tr-TR" });

        test("first visit opens in Turkish", async ({ page }) => {
            await openGame(page);
            await expect(page.locator("html")).toHaveAttribute("lang", "tr");
            await expect(page.locator("#lang-select")).toHaveValue("tr");
            await expect(page.locator('button[onclick="startGame()"]')).toHaveText("Hayatta Kalmayı Başlat");
            // CSS uppercasing follows the document language: dotted capital İ.
            const shown = await page.locator('button[onclick="startGame()"]').innerText();
            expect(shown).toBe("HAYATTA KALMAYI BAŞLAT");
        });
    });

    test("switching language relabels the UI and survives a reload", async ({ page }) => {
        await openGame(page);
        await expect(page.locator("html")).toHaveAttribute("lang", "en");

        await page.locator("#lang-select").selectOption("tr");
        await expect(page.locator("html")).toHaveAttribute("lang", "tr");
        await expect(page.locator("#lang-select")).toHaveAttribute("aria-label", "Dil");
        await expect(page.locator('[data-i18n="manual_faq"]').first()).toHaveText("Kılavuz / SSS");

        await page.reload();
        await page.waitForFunction(() => window.i18n);
        await expect(page.locator("#lang-select")).toHaveValue("tr");
        await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    });

    test("every shipped language renders the menu without raw keys", async ({ page }) => {
        await openGame(page);
        const codes = await page.locator("#lang-select option").evaluateAll((os) => os.map((o) => o.value));
        expect(codes).toContain("tr");
        expect(codes.length).toBe(12);
        for (const code of codes) {
            await page.locator("#lang-select").selectOption(code);
            const labels = await page.locator("#main-menu-modal [data-i18n]").allInnerTexts();
            const raw = labels.filter((t) => /^[a-z]+(_[a-z0-9]+)+$/.test(t.trim()));
            expect(raw, `${code} shows untranslated keys`).toEqual([]);
        }
    });
});
