import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config.js";
import {
  isSaveFileSizeAllowed,
  normalizeSaveData,
} from "../../src/persistence/save-validation.js";
import { onSaveGameFileUpload } from "../../src/persistence/save-load.js";

function currentSave(extra = {}) {
  return {
    version: "2.0",
    gameMode: "sandbox",
    money: 0,
    reputation: 0,
    currentRPS: 0,
    timeScale: 0,
    burstCount: 0,
    services: [],
    connections: [],
    internetConnections: [],
    ...extra,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeSaveData", () => {
  it.each([
    [{ version: "2.0", services: new Array(61).fill({}) }, "too many services"],
    [{ version: "2.0", services: [{ type: "__proto__", position: [0, 0, 0] }] }, "unknown type"],
    [{ version: "2.0", currentRPS: Infinity, services: [] }, "non-finite scalar"],
    [{ version: "future", services: [] }, "unsupported version"],
  ])("rejects %s (%s) without returning a DTO", (candidate) => {
    expect(normalizeSaveData(candidate)).toBeNull();
  });

  it("migrates a legacy save and fills current reset defaults", () => {
    const candidate = {
      version: "1.0",
      trafficDistribution: { WEB: 0.5, API: 0.4, FRAUD: 0.1 },
      score: { total: 9, web: 3, api: 4, fraudBlocked: 2 },
      services: [],
      connections: [],
      internetConnections: [],
    };

    const normalized = normalizeSaveData(candidate);

    expect(normalized).toMatchObject({
      version: "2.0",
      gameMode: "survival",
      trafficDistribution: {
        STATIC: 0.5,
        READ: 0.2,
        WRITE: 0.12,
        UPLOAD: 0.05,
        SEARCH: 0.08000000000000002,
        MALICIOUS: 0.1,
        INFERENCE: 0,
      },
      failures: {
        STATIC: 0,
        READ: 0,
        WRITE: 0,
        UPLOAD: 0,
        SEARCH: 0,
        MALICIOUS: 0,
        INFERENCE: 0,
      },
      score: {
        total: 9,
        storage: 3,
        database: 4,
        maliciousBlocked: 2,
        penalties: 0,
      },
    });
    expect(normalized.finances.income.total).toBe(0);
    expect(normalized.finances.expenses.byService.serverless).toBe(0);
    expect(normalized.connections).toEqual([]);
  });

  it("returns detached plain service and edge records for a current save", () => {
    const serviceConnections = ["svc_db"];
    const services = [
      {
        id: "svc_compute",
        type: "compute",
        position: [0, 0, 0],
        connections: serviceConnections,
        tier: 2,
        asgEnabled: true,
        instances: 3,
      },
      {
        id: "svc_db",
        type: "db",
        position: [8, 0, 0],
        connections: [],
        tier: 1,
      },
    ];
    const connections = [{ from: "svc_compute", to: "svc_db" }];
    const internetConnections = [];
    const candidate = currentSave({ services, connections, internetConnections });

    const normalized = normalizeSaveData(candidate);

    expect(normalized).not.toBeNull();
    expect(normalized.services).toEqual([
      {
        id: "svc_compute",
        type: "compute",
        position: [0, 0, 0],
        connections: ["svc_db"],
        tier: 2,
        asgEnabled: true,
        instances: 3,
      },
      {
        id: "svc_db",
        type: "db",
        position: [8, 0, 0],
        connections: [],
        tier: 1,
        asgEnabled: false,
        instances: 1,
      },
    ]);
    expect(normalized.services).not.toBe(services);
    expect(normalized.services[0]).not.toBe(services[0]);
    expect(normalized.services[0].position).not.toBe(services[0].position);
    expect(normalized.services[0].connections).not.toBe(serviceConnections);
    expect(normalized.connections).not.toBe(connections);
    expect(normalized.connections[0]).not.toBe(connections[0]);
    expect(normalized.internetConnections).not.toBe(internetConnections);
  });

  it.each([
    [currentSave({ gameMode: "campaign" }), "unknown game mode"],
    [currentSave({ activeTool: "developer-console" }), "unknown active tool"],
    [currentSave({ trafficDistribution: { STATIC: 1, TYPO: 0 } }), "unknown traffic key"],
    [currentSave({ failures: { READ: Infinity } }), "non-finite nested number"],
    [currentSave({ inference: Infinity }), "invalid inference state"],
    [currentSave({ services: [{ id: "svc", type: "waf", position: [0, [0], 0] }] }), "nested position array"],
    [currentSave({ services: [{ id: "svc", type: "waf", position: [121, 0, 0] }] }), "out-of-grid position"],
    [currentSave({ services: [{ id: "internet", type: "waf", position: [0, 0, 0] }] }), "reserved service ID"],
    [currentSave({ services: [{ id: "svc", type: "waf", position: [0, 0, 0], connections: [["svc"]] }] }), "nested connection ID"],
    [currentSave({ services: [{ id: "svc", type: "waf", position: [0, 0, 0] }], connections: [{ from: "missing", to: "svc" }] }), "missing edge endpoint"],
    [currentSave({ connections: new Array(CONFIG.limits.maxSaveConnections + 1).fill({ from: "a", to: "b" }) }), "too many connections"],
  ])("rejects a structurally invalid save: %s (%s)", (candidate) => {
    expect(normalizeSaveData(candidate)).toBeNull();
  });

  it("does not mutate the candidate while migrating it", () => {
    const candidate = {
      version: "1.0",
      fraudSpikeTimer: 12,
      fraudSpikeActive: true,
      services: [],
      connections: [],
      internetConnections: [],
    };
    const snapshot = structuredClone(candidate);

    const normalized = normalizeSaveData(candidate);

    expect(normalized.maliciousSpikeTimer).toBe(12);
    expect(normalized.maliciousSpikeActive).toBe(true);
    expect(candidate).toEqual(snapshot);
    expect(candidate).not.toHaveProperty("maliciousSpikeTimer");
  });

  it("accepts the reserved internet node as a selection", () => {
    const normalized = normalizeSaveData(currentSave({ selectedNodeId: "internet" }));

    expect(normalized).not.toBeNull();
    expect(normalized.selectedNodeId).toBe("internet");
  });

  it.each([
    ["missing-service"],
    [42],
  ])("rejects a selected node that is not internet or a restored service: %s", (selectedNodeId) => {
    expect(normalizeSaveData(currentSave({ selectedNodeId }))).toBeNull();
  });

  it.each([
    [{ WEB: 0.5, API: 0.4, FRAUD: 0.1, TYPO: 0 }, "unknown traffic key"],
    [{ WEB: [], API: 0.4, FRAUD: 0.1 }, "traffic array"],
    [{ WEB: null, API: 0.4, FRAUD: 0.1 }, "null traffic value"],
    [{ WEB: 0.5, API: "0.4", FRAUD: 0.1 }, "string traffic value"],
  ])("rejects legacy traffic before migration: %s (%s)", (trafficDistribution) => {
    expect(normalizeSaveData({
      version: "1.0",
      trafficDistribution,
      services: [],
      connections: [],
      internetConnections: [],
    })).toBeNull();
  });

  it.each([
    [{ total: 9, web: 3, api: 4, fraudBlocked: 2, TYPO: 0 }, "unknown score key"],
    [{ total: 9, web: [], api: 4, fraudBlocked: 2 }, "score array"],
    [{ total: 9, web: null, api: 4, fraudBlocked: 2 }, "null score value"],
    [{ total: 9, web: "3", api: 4, fraudBlocked: 2 }, "string score value"],
  ])("rejects legacy score before migration: %s (%s)", (score) => {
    expect(normalizeSaveData({
      version: "1.0",
      score,
      services: [],
      connections: [],
      internetConnections: [],
    })).toBeNull();
  });
});

describe("save upload byte boundary", () => {
  it("allows the configured byte limit and rejects values outside it", () => {
    expect(isSaveFileSizeAllowed(CONFIG.limits.maxSaveBytes)).toBe(true);
    expect(isSaveFileSizeAllowed(CONFIG.limits.maxSaveBytes + 1)).toBe(false);
    expect(isSaveFileSizeAllowed(-1)).toBe(false);
    expect(isSaveFileSizeAllowed(Infinity)).toBe(false);
  });

  it("rejects an oversized file before constructing or reading with FileReader", () => {
    const originalFileReader = globalThis.FileReader;
    const fileReader = vi.fn();
    globalThis.FileReader = fileReader;
    globalThis.alertCalls.length = 0;
    const input = {
      files: [{ size: CONFIG.limits.maxSaveBytes + 1 }],
      value: "oversized.json",
    };

    try {
      onSaveGameFileUpload({ target: input });
    } finally {
      globalThis.FileReader = originalFileReader;
    }

    expect(fileReader).not.toHaveBeenCalled();
    expect(globalThis.alertCalls).toHaveLength(1);
    expect(input.value).toBe("");
  });
});
