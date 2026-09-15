// @vitest-environment happy-dom
// Campaign UI needs the real page fixture and the THREE global before its
// game.js import chain evaluates. Reuse the sim harness while retaining this
// DOM-level first-frame regression test at the task's requested path.
import "./helpers/sim-setup.mjs";
import { beforeEach, describe, expect, it } from "vitest";
import { STATE, resetWorld } from "./helpers/sim-world.mjs";
import { i18n } from "../src/i18n.js";

const { startCampaignLevel } = await import("../src/ui/campaign-ui.js");

beforeEach(() => {
    resetWorld();
    localStorage.removeItem("serverSurvivalCampaignProgress");
    document.getElementById("objectivesPanel").classList.add("hidden");
});

describe("campaign first frame", () => {
    it("renders level objectives and campaign identity before the first tick", () => {
        startCampaignLevel(1);

        expect(STATE.timeScale).toBe(0);
        const objectives = document.getElementById("objectivesPanel").textContent;
        expect(objectives)
            .toContain(i18n.t("campaign_hud_level", { id: 1, title: i18n.t("level_1_title") }));
        expect(objectives).toContain("☐");
        expect(objectives).not.toContain("☑");
        expect(document.getElementById("game-mode-title").textContent).toContain(i18n.t("campaign_mode"));
    });
});
