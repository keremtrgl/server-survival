import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginRunEpoch, disposeRunScene, getRunEpoch, scheduleForRun,
} from "../../src/core/run-lifecycle.js";
import { resetWorld } from "../helpers/sim-world.mjs";

afterEach(() => vi.useRealTimers());

describe("run lifecycle", () => {
  it("cancels a callback scheduled by a previous run", () => {
    vi.useFakeTimers();
    const seen = vi.fn();
    beginRunEpoch();
    scheduleForRun(seen, 30);
    beginRunEpoch();
    vi.advanceTimersByTime(30);
    expect(seen).not.toHaveBeenCalled();
  });

  it("executes a callback scheduled by the active run once", () => {
    vi.useFakeTimers();
    const seen = vi.fn();
    const activeEpoch = beginRunEpoch();
    expect(getRunEpoch()).toBe(activeEpoch);
    scheduleForRun(seen, 30);
    vi.advanceTimersByTime(30);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("destroys every live entity and disposes every connection exactly once", () => {
    const request = { destroy: vi.fn() };
    const service = { destroy: vi.fn() };
    const geometry = { dispose: vi.fn() };
    const material = { dispose: vi.fn() };
    const line = { mesh: { geometry, material } };
    disposeRunScene({ services: [service], requests: [request], connections: [line], groups: [] });
    expect(request.destroy).toHaveBeenCalledTimes(1);
    expect(service.destroy).toHaveBeenCalledTimes(1);
    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
  });

  it("cleans identical scene resources only once across repeated disposal", () => {
    const request = { destroy: vi.fn() };
    const service = { destroy: vi.fn() };
    const geometry = { dispose: vi.fn() };
    const material = { dispose: vi.fn() };
    const line = { mesh: { geometry, material } };
    const scene = { services: [service], requests: [request], connections: [line], groups: [] };

    disposeRunScene(scene);
    disposeRunScene(scene);

    expect(request.destroy).toHaveBeenCalledTimes(1);
    expect(service.destroy).toHaveBeenCalledTimes(1);
    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
  });

  it("cancels scheduled work when the simulation helper resets the world", () => {
    vi.useFakeTimers();
    const seen = vi.fn();
    beginRunEpoch();
    scheduleForRun(seen, 30);
    resetWorld();
    vi.advanceTimersByTime(30);
    expect(seen).not.toHaveBeenCalled();
  });
});
