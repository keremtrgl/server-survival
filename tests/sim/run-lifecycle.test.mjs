import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginRunEpoch, disposeRunScene, getRunEpoch, scheduleForRun,
} from "../../src/core/run-lifecycle.js";
import { Request } from "../../src/entities/Request.js";
import { resetWorld, place } from "../helpers/sim-world.mjs";

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

  it("continues cleanup after malformed entries", () => {
    const entity = { destroy: vi.fn() };
    const geometry = { dispose: vi.fn() };
    const material = { dispose: vi.fn() };
    const line = { mesh: { geometry, material } };
    const child = {};
    const group = { children: [child], remove: vi.fn() };

    disposeRunScene({
      services: [null, entity],
      requests: [],
      connections: [null, line],
      groups: [null, group],
    });

    expect(entity.destroy).toHaveBeenCalledTimes(1);
    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
    expect(group.remove).toHaveBeenCalledWith(child);
  });

  it("continues cleanup after a group without children", () => {
    const child = {};
    const validGroup = { children: [child], remove: vi.fn() };

    disposeRunScene({
      services: [],
      requests: [],
      connections: [],
      groups: [{ remove: vi.fn() }, validGroup],
    });

    expect(validGroup.remove).toHaveBeenCalledWith(child);
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

  it("service and request destruction is idempotent for every owned visual", () => {
    resetWorld();
    const sqs = place("sqs");
    const request = new Request("READ");
    const visuals = [sqs.loadRing, sqs.queueFill, sqs.mesh, request.mesh];
    const disposals = visuals.flatMap((mesh) => [
      vi.spyOn(mesh.geometry, "dispose"),
      vi.spyOn(mesh.material, "dispose"),
    ]);

    sqs.destroy();
    request.destroy();
    sqs.destroy();
    request.destroy();

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    for (const mesh of visuals) {
      expect(mesh.geometry.disposed).toBe(true);
      expect(mesh.material.disposed).toBe(true);
    }
  });

  it("continues destroying a service when one child resource is malformed", () => {
    resetWorld();
    const sqs = place("sqs");
    sqs.loadRing.geometry.dispose = () => {
      throw new Error("broken geometry");
    };

    expect(() => sqs.destroy()).not.toThrow();
    expect(sqs.loadRing.material.disposed).toBe(true);
    expect(sqs.queueFill.geometry.disposed).toBe(true);
    expect(sqs.queueFill.material.disposed).toBe(true);
    expect(sqs.mesh.geometry.disposed).toBe(true);
    expect(sqs.mesh.material.disposed).toBe(true);
  });
});
