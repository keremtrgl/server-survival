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
