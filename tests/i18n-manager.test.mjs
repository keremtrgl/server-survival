// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nManager } from "../src/i18n.js";

describe("I18nManager.setLocale", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates the document language without writing locale dictionaries to console", () => {
    const i18n = new I18nManager();
    const log = vi.spyOn(console, "log");

    i18n.setLocale("de");

    expect(document.documentElement.lang).toBe("de");
    expect(log).not.toHaveBeenCalled();
  });

  it("leaves locale metadata and persisted preference unchanged for an unknown locale", () => {
    const i18n = new I18nManager();
    localStorage.setItem("game_locale", "en");

    i18n.setLocale("xx");

    expect(i18n.currentLocale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("game_locale")).toBe("en");
  });
});

describe("detectLocale", () => {
  const AVAILABLE = ["en", "zh", "pt-BR", "de", "uk", "tr"];

  it("keeps a saved, still-shipped choice over the browser language", async () => {
    const { detectLocale } = await import("../src/i18n.js");
    expect(detectLocale("de", ["tr-TR"], AVAILABLE)).toBe("de");
  });

  it("ignores a saved locale the game no longer ships", async () => {
    const { detectLocale } = await import("../src/i18n.js");
    expect(detectLocale("xx", ["tr-TR"], AVAILABLE)).toBe("tr");
  });

  it("matches the browser language exactly, then by base language", async () => {
    const { detectLocale } = await import("../src/i18n.js");
    expect(detectLocale(null, ["pt-BR"], AVAILABLE)).toBe("pt-BR");
    expect(detectLocale(null, ["pt-PT"], AVAILABLE)).toBe("pt-BR");
    expect(detectLocale(null, ["tr-TR", "en-US"], AVAILABLE)).toBe("tr");
    expect(detectLocale(null, ["fr-FR", "de-DE"], AVAILABLE)).toBe("de");
  });

  it("falls back to English when nothing matches", async () => {
    const { detectLocale } = await import("../src/i18n.js");
    expect(detectLocale(null, ["sv-SE"], AVAILABLE)).toBe("en");
    expect(detectLocale(null, [], AVAILABLE)).toBe("en");
    expect(detectLocale(null, undefined, AVAILABLE)).toBe("en");
  });
});

describe("I18nManager.t", () => {
  it("falls back to English for a key the active locale lacks, then to the key", () => {
    const i18n = new I18nManager();
    i18n.translations.tr = { only_tr: "yalnız" };
    i18n.currentLocale = "tr";
    expect(i18n.t("only_tr")).toBe("yalnız");
    expect(i18n.t("time_pause")).toBe(i18n.translations.en.time_pause);
    expect(i18n.t("no_such_key_anywhere")).toBe("no_such_key_anywhere");
  });

  it("ships Turkish and interpolates its placeholders", () => {
    const i18n = new I18nManager();
    i18n.setLocale("tr");
    expect(i18n.currentLocale).toBe("tr");
    expect(document.documentElement.lang).toBe("tr");
    expect(i18n.t("time_pause")).toBe("Duraklat");
    expect(i18n.t("campaign_hud_level", { id: 4, title: "X" })).toBe("Seviye 4: X");
  });
});
