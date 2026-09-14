import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  drainSpawnCredit,
  normalizeBurstCount,
  normalizeSandboxRps,
  resetGame,
} from "../../game.js";
import { loadGameState } from "../../src/persistence/save-load.js";
import { CONFIG, STATE } from "../helpers/sim-world.mjs";

beforeEach(() => {
  STATE.animationId = 1;
  resetGame("sandbox");
});

describe("Sandbox traffic limits", () => {
  it.each([
    [Infinity, CONFIG.limits.maxSandboxRps],
    [-4, 0],
    ["not-a-number", 0],
    [999999, CONFIG.limits.maxSandboxRps],
  ])("normalizes RPS %p", (input, expected) => {
    expect(normalizeSandboxRps(input)).toBe(expected);
  });

  it.each([
    [Infinity, CONFIG.limits.maxSandboxBurst],
    [-4, 0],
    ["not-a-number", 0],
    [17.9, 17],
    [999999, CONFIG.limits.maxSandboxBurst],
  ])("normalizes burst count %p", (input, expected) => {
    expect(normalizeBurstCount(input)).toBe(expected);
  });

  it("clamps burst count and does not inject an old run's burst", () => {
    vi.useFakeTimers();
    window.setBurstCount(Infinity);
    expect(STATE.burstCount).toBe(CONFIG.limits.maxSandboxBurst);
    window.spawnBurst("READ");
    resetGame("sandbox");
    vi.runAllTimers();
    expect(STATE.requests).toHaveLength(0);
    vi.useRealTimers();
  });

  it("caps one frame's spawn catch-up and preserves non-negative credit", () => {
    const spawn = vi.fn();

    const remainingCredit = drainSpawnCredit(1000, 1, spawn);

    expect(spawn).toHaveBeenCalledTimes(CONFIG.limits.maxSpawnCatchUpPerFrame);
    expect(remainingCredit).toBe(900);
    expect(remainingCredit).toBeGreaterThanOrEqual(0);
  });

  it("rejects non-finite Sandbox save values without mutating the active run", () => {
    STATE.currentRPS = 12;
    STATE.burstCount = 8;
    globalThis.alertCalls.length = 0;

    loadGameState({
      version: "2.0",
      services: [],
      connections: [],
      internetConnections: [],
      gameMode: "sandbox",
      currentRPS: Infinity,
      burstCount: Infinity,
    });

    expect(STATE.currentRPS).toBe(12);
    expect(STATE.burstCount).toBe(8);
    expect(globalThis.alertCalls).toHaveLength(1);
  });
});
