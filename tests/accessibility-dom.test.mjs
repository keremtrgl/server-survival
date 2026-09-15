// @vitest-environment happy-dom
import "./helpers/sim-setup.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeEach, expect, it } from "vitest";
import { resetWorld } from "./helpers/sim-world.mjs";
import { i18n } from "../src/i18n.js";

const { renderCampaignLevels, showCampaignLevelTooltip, openCampaignBriefing } =
    await import("../src/ui/campaign-ui.js");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const css = readFileSync(resolve(root, "style.css"), "utf8");

beforeEach(() => {
    resetWorld();
    localStorage.removeItem("serverSurvivalCampaignProgress");
});

it("localizes icon control names on locale changes with real keys in every locale", () => {
    const original = i18n.currentLocale;
    try {
        for (const locale of Object.keys(i18n.translations)) {
            i18n.currentLocale = locale;
            window.dispatchEvent(new CustomEvent("localeChanged", { detail: locale }));
            for (const control of document.querySelectorAll("[data-i18n-aria-label]")) {
                const key = control.getAttribute("data-i18n-aria-label");
                expect(i18n.translations[locale][key], `${locale}: ${key}`).toBeTruthy();
                expect(control.getAttribute("aria-label")).toBe(i18n.t(key));
            }
        }
    } finally {
        i18n.currentLocale = original;
        window.dispatchEvent(new CustomEvent("localeChanged", { detail: original }));
    }
});

it("names all time controls and exposes a polite live region", () => {
    for (const id of ["btn-pause", "btn-play", "btn-fast"]) {
        expect(html).toMatch(new RegExp(`id="${id}"[^>]*aria-label="`));
    }
    expect(html).toMatch(/id="live-status"[^>]*role="status"[^>]*aria-live="polite"/);
});

it("uses buttons for campaign choices and reserves a compact sandbox layout", () => {
    expect(readFileSync(resolve(root, "src/ui/campaign-ui.js"), "utf8"))
        .toMatch(/<button[^>]*data-campaign-level/);
    expect(css).toMatch(/#sandboxPanel\.sandbox-panel-compact/);
    expect(document.getElementById("sandboxPanel").classList.contains("sandbox-panel-compact")).toBe(true);
    expect(css).toContain("100dvh");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
});

it("keeps each panel toggle's expanded state in sync in both directions", () => {
    for (const name of ["health", "metrics", "finances"]) {
        const id = `${name}-panel-content`;
        const toggle = document.querySelector(`button[aria-controls="${id}"]`);
        expect(toggle).not.toBeNull();
        document.getElementById(id).classList.remove("hidden");
        window.togglePanel(id, `${name}-panel-icon`);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(document.getElementById(id).classList.contains("hidden")).toBe(true);
        window.togglePanel(id, `${name}-panel-icon`);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
    }
});

it("makes unlocked levels focusable and locked levels disabled", () => {
    renderCampaignLevels();
    const first = document.querySelector('[data-campaign-level="1"]');
    const second = document.querySelector('[data-campaign-level="2"]');
    expect(first?.tagName).toBe("BUTTON");
    expect(first.disabled).toBe(false);
    expect(first.getAttribute("aria-disabled")).toBe("false");
    expect(first.getAttribute("onclick")).toContain("openCampaignBriefing(1)");
    expect(first.getAttribute("onfocus")).toContain("showCampaignLevelTooltip");
    expect(first.getAttribute("onblur")).toContain("hideCampaignLevelTooltip");
    expect(second.disabled).toBe(true);
    expect(second.getAttribute("aria-disabled")).toBe("true");
    expect(second.hasAttribute("onclick")).toBe(false);
});

it("positions a keyboard preview without pointer coordinates and moves focus to briefing", () => {
    renderCampaignLevels();
    const first = document.querySelector('[data-campaign-level="1"]');
    expect(first).not.toBeNull();
    showCampaignLevelTooltip({ currentTarget: first }, 1);
    const tooltip = document.getElementById("tooltip");
    expect(tooltip.style.display).toBe("block");
    expect(tooltip.style.left).toMatch(/^\d+(\.\d+)?px$/);
    openCampaignBriefing(1);
    expect(tooltip.style.display).toBe("none");
    expect(document.activeElement.id).toBe("campaign-briefing-title");
});
