// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../src/i18n.js";
import { announceStatus } from "../src/ui/live-status.js";

const INDEX = readFileSync("index.html", "utf8");
const STATUS_MARKUP = INDEX.match(/<[^>]+id="live-status"[^>]*><\/[^>]+>/)?.[0];

describe("topology live status", () => {
  beforeEach(() => {
    document.body.innerHTML = STATUS_MARKUP || "";
  });

  it("writes localized topology feedback into the polite live region", () => {
    announceStatus("connection_duplicate");
    const region = document.getElementById("live-status");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe(i18n.t("connection_duplicate"));
  });
});
