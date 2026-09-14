import { CONFIG } from "../config.js";

/**
 * @typedef {Object} SavedService
 * @property {string} id
 * @property {string} type
 * @property {[number, number, number]} position
 * @property {string[]} connections
 * @property {number} tier
 * @property {boolean} asgEnabled
 * @property {number} instances
 */

/**
 * @typedef {Object} SavedConnection
 * @property {string} from
 * @property {string} to
 */

/**
 * @typedef {Object} NormalizedSave
 * @property {"2.0"} version
 * @property {"survival" | "sandbox"} gameMode
 * @property {number} money
 * @property {number} reputation
 * @property {number} currentRPS
 * @property {number} timeScale
 * @property {number} burstCount
 * @property {Record<string, number>} trafficDistribution
 * @property {SavedService[]} services
 * @property {SavedConnection[]} connections
 * @property {string[]} internetConnections
 */

const TRAFFIC_KEYS = Object.keys(CONFIG.trafficTypes);
const TRAFFIC_KEY_SET = new Set(TRAFFIC_KEYS);
const SERVICE_KEYS = Object.keys(CONFIG.services);
const SERVICE_KEY_SET = new Set(SERVICE_KEYS);
const MAX_SCALAR = Number.MAX_SAFE_INTEGER;
const POSITION_BOUND = CONFIG.gridSize * CONFIG.tileSize;

const DEFAULT_TRAFFIC_DISTRIBUTION = {
  STATIC: 0.3,
  READ: 0.2,
  WRITE: 0.15,
  UPLOAD: 0.05,
  SEARCH: 0.1,
  MALICIOUS: 0.2,
  INFERENCE: 0,
};

const DEFAULT_FAILURES = Object.fromEntries(TRAFFIC_KEYS.map((key) => [key, 0]));
const DEFAULT_SCORE = {
  total: 0,
  storage: 0,
  database: 0,
  maliciousBlocked: 0,
  penalties: 0,
};

const TOOL_KEYS = new Set([
  "select",
  "connect",
  "delete",
  "unlink",
  "lambda",
  ...SERVICE_KEYS,
]);

const isPlainRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isFiniteInRange = (value, min = -MAX_SCALAR, max = MAX_SCALAR) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function readNumber(value, fallback, { min = -MAX_SCALAR, max = MAX_SCALAR, integer = false, clamp = false } = {}) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = integer ? Math.floor(value) : value;
  if (clamp) return Math.min(max, Math.max(min, normalized));
  return normalized >= min && normalized <= max ? normalized : null;
}

function readBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return typeof value === "boolean" ? value : null;
}

function normalizeKnownNumberRecord(value, defaults, allowedKeys, options = {}) {
  if (value === undefined) return { ...defaults };
  if (!isPlainRecord(value)) return null;

  const normalized = { ...defaults };
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return null;
    const number = readNumber(value[key], defaults[key] ?? 0, options);
    if (number === null) return null;
    normalized[key] = number;
  }
  return normalized;
}

function createDefaultFinances() {
  const serviceZeros = Object.fromEntries(SERVICE_KEYS.map((type) => [type, 0]));
  return {
    income: {
      byType: { STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0, SEARCH: 0 },
      countByType: { STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0, SEARCH: 0, blocked: 0 },
      requests: 0,
      blocked: 0,
      total: 0,
    },
    expenses: {
      services: 0,
      upkeep: 0,
      repairs: 0,
      autoRepair: 0,
      mitigation: 0,
      breach: 0,
      byService: { ...serviceZeros },
      countByService: { ...serviceZeros },
    },
  };
}

function normalizeFinances(value) {
  const defaults = createDefaultFinances();
  if (value === undefined) return defaults;
  if (!isPlainRecord(value)) return null;
  if (Object.keys(value).some((key) => key !== "income" && key !== "expenses")) return null;

  const income = value.income;
  if (income !== undefined && !isPlainRecord(income)) return null;
  const expenses = value.expenses;
  if (expenses !== undefined && !isPlainRecord(expenses)) return null;

  const incomeScalarKeys = new Set(["requests", "blocked", "total"]);
  const expenseScalarKeys = new Set([
    "services", "upkeep", "repairs", "autoRepair", "mitigation", "breach",
  ]);
  if (income && Object.keys(income).some((key) =>
    !incomeScalarKeys.has(key) && key !== "byType" && key !== "countByType")) return null;
  if (expenses && Object.keys(expenses).some((key) =>
    !expenseScalarKeys.has(key) && key !== "byService" && key !== "countByService")) return null;

  for (const key of incomeScalarKeys) {
    const normalized = readNumber(income?.[key], defaults.income[key]);
    if (normalized === null) return null;
    defaults.income[key] = normalized;
  }
  for (const key of expenseScalarKeys) {
    const normalized = readNumber(expenses?.[key], defaults.expenses[key]);
    if (normalized === null) return null;
    defaults.expenses[key] = normalized;
  }

  const incomeByType = normalizeKnownNumberRecord(
    income?.byType,
    defaults.income.byType,
    TRAFFIC_KEY_SET
  );
  const countByType = normalizeKnownNumberRecord(
    income?.countByType,
    defaults.income.countByType,
    new Set([...TRAFFIC_KEYS, "blocked"]),
    { min: 0, integer: true }
  );
  const byService = normalizeKnownNumberRecord(
    expenses?.byService,
    defaults.expenses.byService,
    SERVICE_KEY_SET
  );
  const countByService = normalizeKnownNumberRecord(
    expenses?.countByService,
    defaults.expenses.countByService,
    SERVICE_KEY_SET,
    { min: 0, integer: true }
  );
  if (!incomeByType || !countByType || !byService || !countByService) return null;

  defaults.income.byType = incomeByType;
  defaults.income.countByType = countByType;
  defaults.expenses.byService = byService;
  defaults.expenses.countByService = countByService;
  return defaults;
}

function isSaveId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= CONFIG.limits.maxSaveBytes;
}

function migrateOldSave(saveData) {
  if (saveData.version === undefined || saveData.version === "1.0") {
    if (isPlainRecord(saveData.trafficDistribution)) {
      const oldDist = saveData.trafficDistribution;
      if ("WEB" in oldDist || "API" in oldDist || "FRAUD" in oldDist) {
        saveData.trafficDistribution = {
          STATIC: oldDist.WEB || 0,
          READ: (oldDist.API || 0) * 0.5,
          WRITE: (oldDist.API || 0) * 0.3,
          UPLOAD: 0.05,
          SEARCH: (oldDist.API || 0) * 0.2,
          MALICIOUS: oldDist.FRAUD || 0,
        };
      }
    }

    if (isPlainRecord(saveData.score)) {
      const oldScore = saveData.score;
      if ("web" in oldScore || "api" in oldScore || "fraudBlocked" in oldScore) {
        saveData.score = {
          total: oldScore.total || 0,
          storage: oldScore.web || 0,
          database: oldScore.api || 0,
          maliciousBlocked: oldScore.fraudBlocked || 0,
        };
      }
    }

    if (Object.prototype.hasOwnProperty.call(saveData, "fraudSpikeTimer")) {
      saveData.maliciousSpikeTimer = saveData.fraudSpikeTimer;
    }
    if (Object.prototype.hasOwnProperty.call(saveData, "fraudSpikeActive")) {
      saveData.maliciousSpikeActive = saveData.fraudSpikeActive;
    }
    saveData.version = "2.0";
  }
  return saveData;
}

function normalizeServices(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CONFIG.limits.maxSaveServices) return null;

  const services = [];
  const ids = new Set();
  for (const record of value) {
    if (!isPlainRecord(record) || !isSaveId(record.id) || record.id === "internet" || ids.has(record.id)) {
      return null;
    }
    if (typeof record.type !== "string" || !Object.prototype.hasOwnProperty.call(CONFIG.services, record.type)) {
      return null;
    }
    if (!Array.isArray(record.position) || record.position.length !== 3 ||
        !record.position.every((coordinate) => isFiniteInRange(coordinate, -POSITION_BOUND, POSITION_BOUND))) {
      return null;
    }

    const links = record.connections ?? [];
    if (!Array.isArray(links) || links.length > CONFIG.limits.maxSaveConnections ||
        !links.every(isSaveId)) return null;

    const maxTier = CONFIG.services[record.type].tiers?.length ?? 1;
    const tier = readNumber(record.tier, 1, { min: 1, max: maxTier, integer: true });
    const asgEnabled = readBoolean(record.asgEnabled, false);
    const instances = readNumber(record.instances, 1, {
      min: CONFIG.autoscaling.minInstances,
      max: CONFIG.autoscaling.maxInstances,
      integer: true,
      clamp: true,
    });
    if (tier === null || asgEnabled === null || instances === null) return null;
    if (asgEnabled && record.type !== "compute" && record.type !== "container") return null;

    ids.add(record.id);
    services.push({
      id: record.id,
      type: record.type,
      position: [...record.position],
      connections: [...links],
      tier,
      asgEnabled,
      instances,
    });
  }

  for (const service of services) {
    if (service.connections.some((id) => id === service.id || !ids.has(id))) return null;
  }
  return services;
}

function normalizeConnections(value, serviceIds) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CONFIG.limits.maxSaveConnections) return null;

  const connections = [];
  for (const record of value) {
    if (!isPlainRecord(record) || !isSaveId(record.from) || !isSaveId(record.to)) return null;
    if ((record.from !== "internet" && !serviceIds.has(record.from)) ||
        !serviceIds.has(record.to) || record.from === record.to) return null;
    connections.push({ from: record.from, to: record.to });
  }
  return connections;
}

function normalizeInternetConnections(value, serviceIds) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CONFIG.limits.maxSaveServices) return null;
  if (!value.every((id) => isSaveId(id) && serviceIds.has(id))) return null;
  return [...value];
}

/**
 * Converts an untrusted parsed save into a detached, bounded plain DTO.
 * @param {unknown} candidate
 * @returns {NormalizedSave | null}
 */
export function normalizeSaveData(candidate) {
  if (!isPlainRecord(candidate)) return null;

  let migrated;
  try {
    migrated = migrateOldSave(structuredClone(candidate));
  } catch {
    return null;
  }
  if (migrated.version !== "2.0") return null;

  const gameMode = migrated.gameMode ?? "survival";
  if (gameMode !== "survival" && gameMode !== "sandbox") return null;
  const activeTool = migrated.activeTool ?? "select";
  if (typeof activeTool !== "string" || !TOOL_KEYS.has(activeTool)) return null;

  const services = normalizeServices(migrated.services);
  if (!services) return null;
  const serviceIds = new Set(services.map((service) => service.id));
  const connections = normalizeConnections(migrated.connections, serviceIds);
  const internetConnections = normalizeInternetConnections(migrated.internetConnections, serviceIds);
  if (!connections || !internetConnections) return null;

  const trafficDistribution = normalizeKnownNumberRecord(
    migrated.trafficDistribution,
    DEFAULT_TRAFFIC_DISTRIBUTION,
    TRAFFIC_KEY_SET,
    { min: 0, max: 1 }
  );
  const failures = normalizeKnownNumberRecord(
    migrated.failures,
    DEFAULT_FAILURES,
    TRAFFIC_KEY_SET,
    { min: 0, integer: true }
  );
  const score = normalizeKnownNumberRecord(
    migrated.score,
    DEFAULT_SCORE,
    new Set(Object.keys(DEFAULT_SCORE))
  );
  const finances = normalizeFinances(migrated.finances);
  if (!trafficDistribution || !failures || !score || !finances) return null;

  let failuresByReason = {};
  if (migrated.failuresByReason !== undefined) {
    if (!isPlainRecord(migrated.failuresByReason) ||
        Object.keys(migrated.failuresByReason).length > CONFIG.limits.maxSaveConnections) return null;
    failuresByReason = {};
    for (const [reason, count] of Object.entries(migrated.failuresByReason)) {
      if (reason === "__proto__" || reason === "prototype" || reason === "constructor" ||
          !isFiniteInRange(count, 0, MAX_SCALAR)) return null;
      failuresByReason[reason] = Math.floor(count);
    }
  }

  const money = readNumber(migrated.money, 0);
  const reputation = readNumber(migrated.reputation, 100);
  const requestsProcessed = readNumber(migrated.requestsProcessed, 0, { min: 0, integer: true });
  const lateCompletions = readNumber(migrated.lateCompletions, 0, { min: 0, integer: true });
  const failuresDismissedAt = readNumber(migrated.failuresDismissedAt, 0, { min: 0, integer: true });
  const spawnTimer = readNumber(migrated.spawnTimer, 0, { min: 0 });
  const currentRPS = readNumber(migrated.currentRPS, 0.5, {
    min: 0,
    max: CONFIG.limits.maxSandboxRps,
    clamp: true,
  });
  const timeScale = readNumber(migrated.timeScale, 0, { min: 0, max: 4, clamp: true });
  const elapsedGameTime = readNumber(migrated.elapsedGameTime, 0, { min: 0 });
  const sandboxBudget = readNumber(migrated.sandboxBudget, CONFIG.sandbox.defaultBudget, { min: 0 });
  const burstCount = readNumber(migrated.burstCount, CONFIG.sandbox.defaultBurstCount, {
    min: 0,
    max: CONFIG.limits.maxSandboxBurst,
    integer: true,
    clamp: true,
  });
  const previousTimeScale = readNumber(migrated.previousTimeScale, 1, {
    min: 0,
    max: 4,
    clamp: true,
  });
  const maliciousSpikeTimer = readNumber(migrated.maliciousSpikeTimer, 0, { min: 0 });
  if (migrated.inference !== undefined &&
      (!isPlainRecord(migrated.inference) ||
       Object.keys(migrated.inference).some((key) => key !== "expired"))) return null;
  const inferenceExpired = readNumber(migrated.inference?.expired, 0, { min: 0, integer: true });
  if ([
    money,
    reputation,
    requestsProcessed,
    lateCompletions,
    failuresDismissedAt,
    spawnTimer,
    currentRPS,
    timeScale,
    elapsedGameTime,
    sandboxBudget,
    burstCount,
    previousTimeScale,
    maliciousSpikeTimer,
    inferenceExpired,
  ].some((value) => value === null)) return null;

  const isRunning = readBoolean(migrated.isRunning, false);
  const upkeepEnabled = readBoolean(migrated.upkeepEnabled, true);
  const gameStarted = readBoolean(migrated.gameStarted, true);
  const autoRepairEnabled = readBoolean(migrated.autoRepairEnabled, false);
  const maliciousSpikeActive = readBoolean(migrated.maliciousSpikeActive, false);
  if ([isRunning, upkeepEnabled, gameStarted, autoRepairEnabled, maliciousSpikeActive]
    .some((value) => value === null)) return null;

  const selectedNodeId = migrated.selectedNodeId ?? null;
  if (selectedNodeId !== null && (!isSaveId(selectedNodeId) || !serviceIds.has(selectedNodeId))) return null;

  return {
    version: "2.0",
    gameMode,
    money,
    reputation,
    requestsProcessed,
    lateCompletions,
    failures,
    failuresByReason,
    failuresDismissedAt,
    score,
    activeTool,
    selectedNodeId,
    spawnTimer,
    currentRPS,
    timeScale,
    elapsedGameTime,
    isRunning,
    sandboxBudget,
    upkeepEnabled,
    trafficDistribution,
    inference: { expired: inferenceExpired },
    burstCount,
    gameStarted,
    previousTimeScale,
    autoRepairEnabled,
    maliciousSpikeTimer,
    maliciousSpikeActive,
    finances,
    services,
    connections,
    internetConnections,
  };
}

export function isSaveFileSizeAllowed(bytes) {
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= CONFIG.limits.maxSaveBytes;
}
