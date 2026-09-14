# Server Survival v3.1 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a release-ready v3.1 that prevents stale-run/resource failures, validates untrusted saves, improves campaign and topology feedback, and makes the current HUD usable and accessible without changing game balance.

**Architecture:** Keep the simulation's existing ESM structure and add two narrow modules: one owns run epochs/timers plus visual disposal, and one turns untrusted saves into a normalized DTO before any state mutation. Existing game, input, campaign, and persistence modules call those boundaries rather than duplicating guards. UI feedback remains DOM-based and localized through the current i18n manager.

**Tech Stack:** Vanilla ES modules, Three.js r128 CDN runtime, HTML/CSS with Tailwind Play CDN, Vitest 4, happy-dom, ESLint 10, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-v3-1-stabilization-design.md`

## Global Constraints

- Do not migrate Three.js from r128 or add a build step in this release.
- Do not alter campaign balance, service-edge legality, traffic-mix semantics, or the simulation teaching model.
- Do not introduce object pooling, instancing, Workers, replay, backend, telemetry, or multiplayer.
- Preserve the existing destination repository history; use a normal non-force integration only after release checks pass.
- All numeric limits are centralized in `CONFIG`, are finite, and are applied to UI and programmatic entry points.
- Every new player-visible string exists in all eleven locale dictionaries; `tests/i18n-usage.test.mjs` must remain green.
- No imported file clears or mutates the current board until parsing, migration, validation, and normalization all succeed.
- Every task follows red → green → full relevant suite; no browser or remote push occurs before the final verification task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/core/run-lifecycle.js` | Owns the monotonic run epoch, cancellable run callbacks, and idempotent disposal of requests, services, connections, and defensive orphan scene children. |
| `src/persistence/save-validation.js` | Accepts an in-memory parsed save, performs migration-compatible structural validation, and returns a bounded plain save DTO or `null`. |
| `src/config.js` | Holds v3.1 sandbox, spawn, save-size/count, and position-bound constants. |
| `game.js` | Starts a new epoch at run boundaries, delegates scene teardown, caps per-frame spawn catch-up, registers Sandbox bursts, sets dynamic HUD identity, and invalidates work on survival game-over. |
| `src/entities/Service.js`, `src/entities/Request.js` | Dispose every visual each entity owns exactly once. |
| `src/persistence/save-load.js` | Checks upload byte size, validates before clear/restore, normalizes browser saves, and uses shared run teardown. |
| `src/sim/topology.js` | Returns a stable connection outcome for success and each rejection while preserving current valid-link behavior. |
| `src/input/handlers.js`, `src/ui/live-status.js` | Converts rejected topology outcomes into a localized polite live announcement. |
| `src/ui/campaign-ui.js`, `src/campaign/campaign.js` | Renders campaign title/objectives synchronously at level start and registers campaign bursts with the shared run scheduler. |
| `index.html`, `style.css` | Supplies semantic labels/live region/button markup and compact-layout, focus, and reduced-motion styles. |
| `src/i18n.js`, `src/locales/*.js` | Removes debug logs, synchronizes `lang`, and supplies all new localized labels/status text. |
| `tests/sim/*.test.mjs`, `tests/*.test.mjs` | Pin run cleanup, limits, save trust boundary, campaign first render, topology outcomes, and DOM/accessibility contracts. |
| `.github/workflows/ci.yml`, `.github/dependabot.yml`, `package.json`, `package-lock.json`, `CHANGELOG.md` | Provides least-privilege CI, update monitoring, a compatible dev-tool security update, and release notes. |

### Task 1: Establish run lifecycle ownership

**Files:**
- Create: `src/core/run-lifecycle.js`
- Modify: `src/config.js`
- Modify: `src/state.js`
- Modify: `tests/helpers/sim-world.mjs`
- Test: `tests/sim/run-lifecycle.test.mjs`

**Interfaces:**
- Defines: `DisposableEntity = { destroy: () => void }`, `DisposableConnection = { mesh?: { geometry?: { dispose: () => void }; material?: { dispose: () => void }; parent?: { remove: (node: unknown) => void } } }`, and `DisposableGroup = { children: unknown[]; remove: (node: unknown) => void }`.
- Produces: `beginRunEpoch(): number`, `getRunEpoch(): number`, `scheduleForRun(callback: () => void, delayMs: number): number`, and `disposeRunScene(input: { services: DisposableEntity[]; requests: DisposableEntity[]; connections: DisposableConnection[]; groups: DisposableGroup[] }): void`.
- Consumes: entity `destroy(): void` methods and connection `mesh.geometry.dispose()` / `mesh.material.dispose()` ownership.
- Adds: `STATE.runEpoch: number`; later tasks call only `beginRunEpoch` and `scheduleForRun`, never raw burst `setTimeout`.

- [ ] **Step 1: Write the failing lifecycle tests**

Create `tests/sim/run-lifecycle.test.mjs` with spies that prove a new epoch cancels pending callbacks, a callback from the active epoch executes once, and every resource is disposed once:

```js
import { describe, expect, it, vi } from "vitest";
import {
  beginRunEpoch, disposeRunScene, scheduleForRun,
} from "../../src/core/run-lifecycle.js";

it("cancels a callback scheduled by a previous run", () => {
  vi.useFakeTimers();
  const seen = vi.fn();
  beginRunEpoch();
  scheduleForRun(seen, 30);
  beginRunEpoch();
  vi.advanceTimersByTime(30);
  expect(seen).not.toHaveBeenCalled();
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
```

- [ ] **Step 2: Run the new tests and confirm the missing-module failure**

Run: `npx vitest run tests/sim/run-lifecycle.test.mjs`

Expected: FAIL because `src/core/run-lifecycle.js` does not exist.

- [ ] **Step 3: Add bounded lifecycle primitives**

Add `CONFIG.limits` values used by this release and implement only these lifecycle mechanics:

```js
let epoch = 0;
const pendingTimers = new Set();

export function beginRunEpoch() {
  epoch += 1;
  for (const timerId of pendingTimers) clearTimeout(timerId);
  pendingTimers.clear();
  return epoch;
}

export function scheduleForRun(callback, delayMs) {
  const scheduledEpoch = epoch;
  const timerId = setTimeout(() => {
    pendingTimers.delete(timerId);
    if (scheduledEpoch === epoch) callback();
  }, Math.max(0, delayMs));
  pendingTimers.add(timerId);
  return timerId;
}
```

Implement `disposeRunScene` by snapshotting each array, calling entity `destroy()`, disposing each connection line's geometry/material, removing it from its parent group, and finally removing any remaining group children. Wrap each independent destroy/dispose operation in `try/catch` and continue to the next resource so one malformed visual cannot prevent later cleanup. Set `STATE.runEpoch = beginRunEpoch()` wherever a run boundary is started in later tasks; initialize it to `0` in `state.js`. Extend `resetWorld` to advance the epoch and reset the property so headless tests cannot leak scheduled work.

- [ ] **Step 4: Run the focused lifecycle suite**

Run: `npx vitest run tests/sim/run-lifecycle.test.mjs`

Expected: PASS; no scheduled callback survives `beginRunEpoch()`, and the disposal spies each receive one call.

- [ ] **Step 5: Commit the isolated lifecycle boundary**

```bash
git add src/core/run-lifecycle.js src/config.js src/state.js tests/helpers/sim-world.mjs tests/sim/run-lifecycle.test.mjs
git commit -m "feat: add run lifecycle boundary"
```

### Task 2: Dispose every visual at reset, save-load, and entity deletion

**Files:**
- Modify: `src/entities/Service.js`
- Modify: `src/entities/Request.js`
- Modify: `game.js`
- Modify: `src/persistence/save-load.js`
- Modify: `tests/sim/run-lifecycle.test.mjs`
- Test: `tests/sim/reset-leaks.test.mjs`

**Interfaces:**
- Consumes: `beginRunEpoch()` and `disposeRunScene(...)` from Task 1.
- Produces: idempotent `Service.destroy()` and `Request.destroy()`; `resetGame()` and persistence `clearCurrentGame()` leave all state collections and scene groups empty.

- [ ] **Step 1: Write failing regression tests for nested visuals and reset**

Append tests that create an SQS service and a request, retain `loadRing`, `queueFill`, main mesh, and request mesh references, then reset:

```js
it("reset disposes service child visuals and request visuals before clearing arrays", () => {
  resetGame("sandbox");
  const sqs = place("sqs");
  const request = new Request("READ");
  STATE.requests.push(request);
  const { geometry: ringGeo, material: ringMat } = sqs.loadRing;
  const { geometry: fillGeo, material: fillMat } = sqs.queueFill;
  resetGame("sandbox");
  expect(ringGeo.disposed).toBe(true);
  expect(ringMat.disposed).toBe(true);
  expect(fillGeo.disposed).toBe(true);
  expect(fillMat.disposed).toBe(true);
  expect(STATE.services).toEqual([]);
  expect(STATE.requests).toEqual([]);
});
```

Where the Three stub lacks `Geometry.disposed`, add that explicit flag to its `dispose()` method before asserting it; this makes disposal observable without changing production behavior.

- [ ] **Step 2: Run the affected tests and confirm the child-disposal failure**

Run: `npx vitest run tests/sim/run-lifecycle.test.mjs tests/sim/reset-leaks.test.mjs`

Expected: FAIL because `Service.destroy()` does not dispose `loadRing` or `queueFill`, and `resetGame()` removes scene children before it destroys the state-owned entities.

- [ ] **Step 3: Make ownership and teardown order explicit**

In `Service.destroy()`, dispose `loadRing.geometry/material` and optional `queueFill.geometry/material` before disposing the main mesh. Null out disposed references or add a private `_destroyed` guard so repeated paths cannot dispose them twice. Give `Request.destroy()` the same guard.

In `game.js`, call `beginRunEpoch()` and `disposeRunScene({ services: STATE.services, requests: STATE.requests, connections: STATE.connections, groups: [serviceGroup, connectionGroup, requestGroup] })` before assigning empty state arrays. Delete the three old “remove children” loops that discarded ownership before disposal. In `save-load.js`, make `clearCurrentGame()` use the identical shared teardown before restore. Preserve the internet node and static grid/light objects; they are not run-owned visuals.

- [ ] **Step 4: Run lifecycle, reset, save, and deletion coverage**

Run: `npx vitest run tests/sim/run-lifecycle.test.mjs tests/sim/reset-leaks.test.mjs tests/sim/save-load.test.mjs tests/sim/save-load-boundaries.test.mjs tests/sim/topology.test.mjs`

Expected: PASS; entity removal still refunds/removes state correctly and reset/load no longer leave undisposed child meshes.

- [ ] **Step 5: Commit the resource lifecycle fix**

```bash
git add game.js src/entities/Service.js src/entities/Request.js src/persistence/save-load.js tests/helpers/three-stub.mjs tests/sim/run-lifecycle.test.mjs
git commit -m "fix: dispose run-owned Three.js visuals"
```

### Task 3: Bound Sandbox traffic and make bursts run-safe

**Files:**
- Modify: `src/config.js`
- Modify: `game.js`
- Modify: `src/campaign/campaign.js`
- Modify: `tests/sim/run-lifecycle.test.mjs`
- Create: `tests/sim/sandbox-limits.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.limits.maxSandboxRps`, `CONFIG.limits.maxSandboxBurst`, `CONFIG.limits.maxSpawnCatchUpPerFrame`, `beginRunEpoch()`, and `scheduleForRun()`.
- Produces: `normalizeSandboxRps(value: unknown): number`, `normalizeBurstCount(value: unknown): number`, and `spawnBurst(type: string): void` exposed through the existing `window` assignments.
- Preserves: traffic slider behavior and campaign `_session` stale-callback protection.

- [ ] **Step 1: Write failing numeric and stale-burst tests**

Create `tests/sim/sandbox-limits.test.mjs`:

```js
it.each([
  [Infinity, CONFIG.limits.maxSandboxRps],
  [-4, 0],
  ["not-a-number", 0],
  [999999, CONFIG.limits.maxSandboxRps],
])("normalizes RPS %p", (input, expected) => {
  expect(normalizeSandboxRps(input)).toBe(expected);
});

it("clamps burst count and does not inject an old run's burst", () => {
  vi.useFakeTimers();
  resetGame("sandbox");
  window.setBurstCount(Infinity);
  expect(STATE.burstCount).toBe(CONFIG.limits.maxSandboxBurst);
  window.spawnBurst("READ");
  resetGame("sandbox");
  vi.runAllTimers();
  expect(STATE.requests).toHaveLength(0);
});
```

Add a frame-catch-up test by extracting the spawn-credit drain into an exported pure helper or a narrow function in `game.js`; assert that an input with enough accumulated credit for hundreds of requests invokes the supplied spawn function only `maxSpawnCatchUpPerFrame` times and leaves non-negative remaining credit.

- [ ] **Step 2: Run the new limits suite and confirm it fails**

Run: `npx vitest run tests/sim/sandbox-limits.test.mjs`

Expected: FAIL because the normalization helpers and capped catch-up boundary do not exist.

- [ ] **Step 3: Implement one numeric boundary for every entry point**

Define conservative constants in `CONFIG.limits`:

```js
limits: {
  maxSandboxRps: 500,
  maxSandboxBurst: 200,
  maxSpawnCatchUpPerFrame: 100,
  maxSaveBytes: 1_000_000,
  maxSaveServices: 60,
  maxSaveConnections: 240,
}
```

Implement the two normalizers with `Number(value)`, `Number.isFinite`, `Math.floor` for burst count, and `Math.min/Math.max`. Use them in `window.setSandboxRPS`, `window.setBurstCount`, and save restoration. Keep `syncInput` after normalization so the DOM mirrors the accepted number.

Replace raw Sandbox `setTimeout` calls with `scheduleForRun`. Replace campaign burst `setTimeout` calls with `scheduleForRun`, retaining its `session === this._session`, `active`, and `ended` checks. Extract the spawn-credit loop so it executes at most `maxSpawnCatchUpPerFrame` iterations per animation frame; leave the remaining `STATE.spawnTimer` credit for future frames. Call `beginRunEpoch()` when survival sets `STATE.isRunning = false` at game-over, so any delayed Sandbox/campaign work becomes inert.

- [ ] **Step 4: Run all timing-related suites**

Run: `npx vitest run tests/sim/sandbox-limits.test.mjs tests/sim/run-lifecycle.test.mjs tests/sim/timing-and-tiers.test.mjs tests/sim/campaign-lifetime.test.mjs`

Expected: PASS; finite legal values retain existing behavior, invalid values clamp, and neither a restart nor a game-over accepts old delayed traffic.

- [ ] **Step 5: Commit bounded traffic scheduling**

```bash
git add game.js src/config.js src/campaign/campaign.js tests/sim/sandbox-limits.test.mjs tests/sim/run-lifecycle.test.mjs
git commit -m "fix: bound sandbox traffic and stale bursts"
```

### Task 4: Validate saves before live-state mutation

**Files:**
- Create: `src/persistence/save-validation.js`
- Modify: `src/persistence/save-load.js`
- Modify: `src/config.js`
- Modify: `tests/sim/save-load-boundaries.test.mjs`
- Create: `tests/sim/save-validation.test.mjs`

**Interfaces:**
- Defines: `NormalizedSave = { version: "2.0"; gameMode: "survival" | "sandbox"; money: number; reputation: number; currentRPS: number; timeScale: number; burstCount: number; trafficDistribution: Record<string, number>; services: SavedService[]; connections: SavedConnection[]; internetConnections: string[]; [key: string]: unknown }`, `SavedService = { id: string; type: string; position: [number, number, number]; connections: string[]; tier: number; asgEnabled: boolean; instances: number }`, and `SavedConnection = { from: string; to: string }`.
- Produces: `normalizeSaveData(candidate: unknown): NormalizedSave | null` and `isSaveFileSizeAllowed(bytes: number): boolean`.
- `NormalizedSave` contains finite bounded scalar state, known service records, known traffic keys, valid connections, and default-filled optional legacy fields; it never includes live Three objects.
- Consumes: `CONFIG.services`, `CONFIG.gridSize`, `CONFIG.tileSize`, Task 3 limits, and the existing `migrateOldSave(saveData)` conversion.

- [ ] **Step 1: Write failing trust-boundary tests**

Create `tests/sim/save-validation.test.mjs` and capture an existing board before each invalid candidate:

```js
it.each([
  [{ version: "2.0", services: new Array(61).fill({}) }, "too many services"],
  [{ version: "2.0", services: [{ type: "__proto__", position: [0, 0, 0] }] }, "unknown type"],
  [{ version: "2.0", currentRPS: Infinity, services: [] }, "non-finite scalar"],
  [{ version: "future", services: [] }, "unsupported version"],
])("rejects %s without returning a DTO", (candidate) => {
  expect(normalizeSaveData(candidate)).toBeNull();
});

it("leaves the active board untouched when load validation fails", () => {
  resetGame("sandbox");
  const before = place("db").id;
  loadGameState({ version: "2.0", services: [{ type: "not-a-service", position: [0, 0, 0] }] });
  expect(STATE.services.map((service) => service.id)).toEqual([before]);
});
```

Add a valid legacy/current fixture asserting the returned DTO has default-filled `trafficDistribution`, `failures`, `score`, `finances`, and an empty invalid-edge list rather than aliases to input arrays.

- [ ] **Step 2: Run save validation tests and confirm they fail**

Run: `npx vitest run tests/sim/save-validation.test.mjs tests/sim/save-load-boundaries.test.mjs`

Expected: FAIL because `loadGameState` currently clears the board before structural validation.

- [ ] **Step 3: Implement a normalized, plain save DTO**

Move legacy migration into `save-validation.js` or export it from `save-load.js` without a cycle. Validate in this order:

```js
export function normalizeSaveData(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const migrated = migrateOldSave(structuredClone(candidate));
  if (!["2.0", undefined].includes(migrated.version)) return null;
  // validate finite bounded scalars, arrays, service type/position, and edge endpoints
  return normalizedPlainObject;
}
```

Use `Object.prototype.hasOwnProperty.call(CONFIG.services, type)`; require finite coordinates inside `CONFIG.gridSize * CONFIG.tileSize`; cap services and connections with `CONFIG.limits`; reject invalid `gameMode`, `activeTool`, traffic keys, endpoint IDs, nested arrays, and non-finite numbers. Normalize missing legacy fields to the current reset defaults. Do not mutate `candidate`.

In `onSaveGameFileUpload`, reject `file.size > CONFIG.limits.maxSaveBytes` before `FileReader.readAsText`. In `loadGameState`, parse localStorage/upload JSON, normalize it, return after the localized corrupted-save message if normalization returns `null`, and only then call `clearCurrentGame()` and restore. Use the accepted DTO thereafter; do not use truthiness for zero-valued finite fields.

- [ ] **Step 4: Run persistence coverage**

Run: `npx vitest run tests/sim/save-validation.test.mjs tests/sim/save-load.test.mjs tests/sim/save-load-boundaries.test.mjs tests/sim/share.test.mjs`

Expected: PASS; valid saved games restore, legacy conversion remains supported, and every invalid case preserves the pre-existing board.

- [ ] **Step 5: Commit the save trust boundary**

```bash
git add src/persistence/save-validation.js src/persistence/save-load.js src/config.js tests/sim/save-validation.test.mjs tests/sim/save-load-boundaries.test.mjs
git commit -m "fix: validate saves before restoring state"
```

### Task 5: Give rejected topology actions visible, localized feedback

**Files:**
- Create: `src/ui/live-status.js`
- Modify: `src/sim/topology.js`
- Modify: `src/input/handlers.js`
- Modify: `index.html`
- Modify: `src/locales/en.js`, `src/locales/zh.js`, `src/locales/pt-BR.js`, `src/locales/de.js`, `src/locales/fr.js`, `src/locales/ko.js`, `src/locales/ru.js`, `src/locales/it.js`, `src/locales/nep.js`, `src/locales/uk.js`, `src/locales/hi.js`
- Modify: `tests/sim/topology.test.mjs`
- Create: `tests/live-status.test.mjs`

**Interfaces:**
- Produces: `createConnection(fromId: string, toId: string): { ok: boolean; reasonKey?: string }` and `announceStatus(key: string): void`.
- Uses exact rejection keys: `connection_same_node`, `connection_endpoint_missing`, `connection_duplicate`, `connection_reverse`, and existing `invalid_topology_detailed`.
- The live region is `#live-status[role="status"][aria-live="polite"]`.

- [ ] **Step 1: Write failing outcome and announcement tests**

Add outcome assertions to `tests/sim/topology.test.mjs`:

```js
it("returns a reason and does not mutate state for a duplicate edge", () => {
  const from = place("alb");
  const to = place("sqs");
  expect(createConnection(from.id, to.id)).toEqual({ ok: true });
  expect(createConnection(from.id, to.id)).toEqual({
    ok: false, reasonKey: "connection_duplicate",
  });
  expect(STATE.connections).toHaveLength(1);
});
```

Create `tests/live-status.test.mjs`:

```js
it("writes localized topology feedback into the polite live region", () => {
  announceStatus("connection_duplicate");
  const region = document.getElementById("live-status");
  expect(region.getAttribute("role")).toBe("status");
  expect(region.textContent).toBe(i18n.t("connection_duplicate"));
});
```

- [ ] **Step 2: Run topology and status tests and confirm they fail**

Run: `npx vitest run tests/sim/topology.test.mjs tests/live-status.test.mjs`

Expected: FAIL because rejected connections return `undefined` and no live status module/region exists.

- [ ] **Step 3: Implement explicit result handling without changing legal edges**

Return `{ ok: false, reasonKey }` for self, missing endpoint, duplicate, reverse, and invalid-edge branches in `createConnection`; return `{ ok: true }` after adding a valid line. Keep existing success/failure sounds. Remove the player-facing `console.error` branch.

Create `announceStatus(key)`:

```js
export function announceStatus(key) {
  const region = document.getElementById("live-status");
  if (region) region.textContent = i18n.t(key);
}
```

In the connect branch of `handlePrimaryDown`, store the returned result, always clear `STATE.selectedNodeId` after an attempted second endpoint, and call `announceStatus(result.reasonKey)` only when `!result.ok`. Add the hidden visual live region to `index.html`. Add the five exact keys to every locale dictionary, using native translations where available and concise English fallback only where no verified translation is available.

- [ ] **Step 4: Run topology, input, locale, and status tests**

Run: `npx vitest run tests/sim/topology.test.mjs tests/sim/pointer-release.test.mjs tests/live-status.test.mjs tests/locales.test.mjs tests/i18n-usage.test.mjs`

Expected: PASS; invalid links stay absent, player feedback is announced, and locale parity remains intact.

- [ ] **Step 5: Commit topology feedback**

```bash
git add src/sim/topology.js src/input/handlers.js src/ui/live-status.js index.html src/locales tests/sim/topology.test.mjs tests/live-status.test.mjs
git commit -m "feat: announce rejected topology links"
```

### Task 6: Render campaign context before simulation time advances

**Files:**
- Modify: `game.js`
- Modify: `src/ui/campaign-ui.js`
- Modify: `src/campaign/campaign.js`
- Modify: `index.html`
- Modify: `tests/sim/campaign.test.mjs`
- Create: `tests/campaign-ui.test.mjs`

**Interfaces:**
- Produces: `setHudModeTitle(mode: "survival" | "sandbox" | "campaign"): void` and immediate `renderCampaignObjectives(level, primaryResults, bonusResults)` after a level becomes active.
- Consumes: existing `levelText`, `i18n.t("campaign_mode")`, and existing initial empty objective result objects.

- [ ] **Step 1: Write failing first-frame tests**

Create `tests/campaign-ui.test.mjs` that starts Level 1 but does not call `campaign.tick`:

```js
it("renders level objectives and campaign identity before the first tick", () => {
  startCampaignLevel(1);
  expect(STATE.timeScale).toBe(0);
  expect(document.getElementById("objectivesPanel").textContent)
    .toContain(i18n.t("campaign_hud_level", { id: 1, title: i18n.t("level_1_title") }));
  expect(document.getElementById("game-mode-title").textContent).toContain(i18n.t("campaign_mode"));
});
```

Use the existing `level_1_title` locale key directly in this DOM-level test; do not widen the campaign UI module's export surface solely for test access.

- [ ] **Step 2: Run first-frame campaign tests and confirm they fail**

Run: `npx vitest run tests/campaign-ui.test.mjs tests/sim/campaign.test.mjs`

Expected: FAIL because objectives render only after the controller's 0.5-second tick and the top HUD title is fixed to Survival.

- [ ] **Step 3: Apply the initial render at the level boundary**

Give the existing top-left `h1` the `id="game-mode-title"`. In `resetGame(mode)`, update its class/text via `setHudModeTitle`: existing Survival styling/text, Sandbox styling/text, and Campaign label/text. In `startCampaignLevel`, after forced settings and toolbar gating, call:

```js
renderCampaignObjectives(
  level,
  STATE.campaign.objectiveResults,
  STATE.campaign.bonusResults,
);
```

Do not call objective checks early: first-frame checkboxes remain empty/false until the existing two-Hz controller evaluation. Leave the level paused and preserve the tutorial timer.

- [ ] **Step 4: Run campaign UI and simulation coverage**

Run: `npx vitest run tests/campaign-ui.test.mjs tests/sim/campaign.test.mjs tests/sim/campaign-lifetime.test.mjs tests/sim/campaign-tutorial.test.mjs tests/sim/toolbar.test.mjs`

Expected: PASS; campaign content is immediately accurate and no campaign lifecycle/gating regression appears.

- [ ] **Step 5: Commit first-frame campaign rendering**

```bash
git add game.js src/ui/campaign-ui.js index.html tests/campaign-ui.test.mjs tests/sim/campaign.test.mjs
git commit -m "fix: render campaign objectives on level start"
```

### Task 7: Make current controls semantic and the Sandbox HUD compact-safe

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `game.js`
- Modify: `src/ui/campaign-ui.js`
- Create: `tests/accessibility-dom.test.mjs`

**Interfaces:**
- Produces: meaningful `aria-label` on icon-only controls; panel toggles update `aria-expanded`; campaign entries are `button` elements with `disabled` and `aria-disabled` when locked.
- Consumes: `#live-status` from Task 5 and `#sandboxPanel` CSS hooks.

- [ ] **Step 1: Write failing static DOM/accessibility tests**

Create `tests/accessibility-dom.test.mjs`:

```js
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

it("names all time controls and exposes a polite live region", () => {
  for (const id of ["btn-pause", "btn-play", "btn-fast"]) {
    expect(html).toMatch(new RegExp(`id="${id}"[^>]*aria-label="`));
  }
  expect(html).toMatch(/id="live-status"[^>]*role="status"[^>]*aria-live="polite"/);
});

it("uses buttons for campaign choices and reserves a compact sandbox layout", () => {
  expect(readFileSync(new URL("../src/ui/campaign-ui.js", import.meta.url), "utf8"))
    .toMatch(/<button[^>]*data-campaign-level/);
  expect(readFileSync(new URL("../style.css", import.meta.url), "utf8"))
    .toMatch(/#sandboxPanel\.sandbox-panel-compact/);
});
```

- [ ] **Step 2: Run DOM tests and confirm they fail**

Run: `npx vitest run tests/accessibility-dom.test.mjs`

Expected: FAIL because the present icon controls have no accessible names, campaign cards are `div` elements, and compact layout hooks do not exist.

- [ ] **Step 3: Add semantic markup and responsive CSS**

Add localized `aria-label` attributes to time controls, close controls, and collapse controls; use visible or screen-reader-only text where localized labels exist. Change panel toggle buttons to carry `aria-controls` and `aria-expanded`; update the existing `togglePanel(contentId, iconId)` to set `aria-expanded` alongside its icon state.

Render each campaign item as:

```html
<button type="button" data-campaign-level="7" aria-disabled="true" disabled>
  ...
</button>
```

For unlocked items, use a direct click handler and add `onfocus`/keyboard-safe briefing behavior rather than relying on pointer movement. Preserve tooltip content as supplemental, not the only way to learn objectives.

Give the Sandbox panel a `sandbox-panel-compact` class and add CSS using `max-height: calc(100dvh - var(--toolbar-safe-height) - env(safe-area-inset-bottom))`, `overflow-y: auto`, a bottom offset that includes the toolbar/safe area, and narrow-width sizing. Add `:focus-visible` outlines for buttons/inputs and a `@media (prefers-reduced-motion: reduce)` rule that disables pulse/transition animation without removing state color.

- [ ] **Step 4: Run DOM and affected behavior tests**

Run: `npx vitest run tests/accessibility-dom.test.mjs tests/sim/toolbar.test.mjs tests/sim/touch-input.test.mjs tests/i18n-usage.test.mjs`

Expected: PASS; button contract and input/touch behavior remain valid while accessibility attributes and layout hooks are present.

- [ ] **Step 5: Commit the HUD accessibility pass**

```bash
git add index.html style.css game.js src/ui/campaign-ui.js tests/accessibility-dom.test.mjs
git commit -m "feat: improve hud accessibility and compact layout"
```

### Task 8: Finish localization and remove production debug noise

**Files:**
- Modify: `src/i18n.js`
- Modify: `src/locales/en.js`, `src/locales/zh.js`, `src/locales/pt-BR.js`, `src/locales/de.js`, `src/locales/fr.js`, `src/locales/ko.js`, `src/locales/ru.js`, `src/locales/it.js`, `src/locales/nep.js`, `src/locales/uk.js`, `src/locales/hi.js`
- Modify: `tests/i18n-usage.test.mjs`
- Create: `tests/i18n-manager.test.mjs`

**Interfaces:**
- Produces: `I18nManager.setLocale(locale)` that silently rejects unknown locales, updates `document.documentElement.lang` for accepted locales, persists locale, translates, and dispatches the existing event.
- Consumes: the connection/accessibility labels introduced in Tasks 5–7.

- [ ] **Step 1: Write failing i18n manager tests**

Create `tests/i18n-manager.test.mjs`:

```js
it("updates the document language without writing locale dictionaries to console", () => {
  const log = vi.spyOn(console, "log");
  i18n.setLocale("de");
  expect(document.documentElement.lang).toBe("de");
  expect(log).not.toHaveBeenCalled();
});
```

Extend the static key scan fixture to include the newly created `src/ui/live-status.js` directory/file, so literal status keys cannot bypass English-key coverage.

- [ ] **Step 2: Run i18n tests and confirm the debug-log failure**

Run: `npx vitest run tests/i18n-manager.test.mjs tests/i18n-usage.test.mjs tests/locales.test.mjs`

Expected: FAIL because `setLocale` writes two unconditional console logs and does not update the document language.

- [ ] **Step 3: Implement locale metadata behavior**

Remove the two `console.log` lines. On a recognized locale, set `document.documentElement.lang = locale` before applying translations; retain localStorage persistence and the `localeChanged` event. Add every new task key to all locale dictionaries and ensure no literal UI key remains absent from English.

- [ ] **Step 4: Run all locale coverage**

Run: `npx vitest run tests/i18n-manager.test.mjs tests/i18n-usage.test.mjs tests/locales.test.mjs tests/sim/locales-uk.test.mjs`

Expected: PASS; locale switching is quiet, language metadata is accurate, and all dictionaries remain structurally compatible.

- [ ] **Step 5: Commit i18n cleanup**

```bash
git add src/i18n.js src/locales tests/i18n-manager.test.mjs tests/i18n-usage.test.mjs
git commit -m "fix: synchronize locale metadata and remove debug logs"
```

### Task 9: Add release automation, dependency hygiene, and player-facing notes

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `CHANGELOG.md`
- Modify: `README.md`
- Test: `tests/readme-claims.test.mjs`

**Interfaces:**
- CI uses minimal explicit permissions: `contents: read`.
- Dependabot monitors `npm` and `github-actions` weekly at repository root.
- Changelog declares v3.1.0 with Added, Changed, Fixed, and Security sections that exactly describe implemented behavior.

- [ ] **Step 1: Write failing release-documentation assertions**

Add an assertion in `tests/readme-claims.test.mjs` that README's displayed version and changelog latest version agree:

```js
it("keeps the documented release version aligned with CHANGELOG", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  const changelog = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
  expect(readme).toContain("v3.1.0");
  expect(changelog).toMatch(/^## \[3\.1\.0\]/m);
});
```

- [ ] **Step 2: Run release-documentation coverage and confirm it fails**

Run: `npx vitest run tests/readme-claims.test.mjs`

Expected: FAIL because no changelog/versioned release documentation exists.

- [ ] **Step 3: Update automation, development dependencies, and documentation**

Add this top-level CI permissions block:

```yaml
permissions:
  contents: read
```

Add `.github/dependabot.yml` with one weekly root `npm` update entry and one weekly root `github-actions` entry. Update only compatible development dependency versions required to eliminate the then-current `npm audit` findings; run `npm install --package-lock-only` for the exact lockfile update and verify that production dependencies remain zero because the game ships no npm runtime bundle.

Create `CHANGELOG.md` in Keep a Changelog format. Its v3.1.0 entries must cover live topology feedback, first-frame campaign information, responsive/a11y controls, resource cleanup, bounded Sandbox values/bursts, save validation, and release automation. Update README's visible version plus a concise v3.1 summary without claiming deferred Three/Tailwind/multiplayer work.

- [ ] **Step 4: Run documentation, dependency, and CI syntax checks**

Run: `npx vitest run tests/readme-claims.test.mjs && npm audit --omit=dev && npm audit && npm run check`

Expected: README/changelog test and `npm run check` PASS; production audit reports zero vulnerabilities. Record any remaining dev-tool advisory with package, severity, and upstream fixed-version status in the release verification notes rather than concealing it.

- [ ] **Step 5: Commit release hygiene**

```bash
git add .github/workflows/ci.yml .github/dependabot.yml package.json package-lock.json CHANGELOG.md README.md tests/readme-claims.test.mjs
git commit -m "chore: prepare v3.1 release hygiene"
```

### Task 10: Perform cross-feature verification and browser acceptance

**Files:**
- Modify: `docs/PROFESYONELLESTIRME_DENETIMI_TR.md`
- Modify: `CHANGELOG.md`
- Test: all existing and newly added suites

**Interfaces:**
- Consumes: every completed task; produces a final verification record in the audit report and accurate changelog wording.

- [ ] **Step 1: Run the complete static and simulation suite**

Run: `npm run check`

Expected: exit code 0, ESLint clean, and every Vitest file passing. Record actual file/test counts and command output date in the audit report; do not reuse prior counts.

- [ ] **Step 2: Run dependency checks**

Run: `npm audit --omit=dev; npm audit`

Expected: production audit has zero vulnerabilities. If the development audit still reports an advisory after the compatible update, update the audit report with the exact package/version and do not claim zero dev findings.

- [ ] **Step 3: Run local browser checks**

Serve the repository without a production build:

```bash
python -m http.server 4173
```

At `http://localhost:4173`, verify and record:

1. Execute ten Sandbox restarts and Campaign transitions; after each, confirm only the current run's services, requests, and connections remain in the scene.
2. At 1280×720 Sandbox, scroll the panel to its last Burst action and confirm the bottom toolbar never obscures it.
3. At 320px, 375px, and 768px widths, confirm the panel is internally scrollable, controls retain visible focus, and touch targets remain reachable.
4. Start Campaign Level 1 and verify Campaign title/objectives are visible before Play.
5. Attempt self, duplicate, reverse, and illegal links; confirm a visible announcement and no unintended wire.
6. Start Sandbox burst, immediately restart, then wait longer than the largest burst delay; confirm no old requests appear.
7. Create a board, import a malformed save, and confirm the board remains present.
8. With reduced motion enabled in browser emulation, confirm pulse/transition effects are suppressed without hiding state indications.

- [ ] **Step 4: Reconcile documentation with verified behavior**

Update `CHANGELOG.md` only to reflect checks actually performed. Append a dated v3.1 verification section to `docs/PROFESYONELLESTIRME_DENETIMI_TR.md` containing the exact test/audit result, browser viewport checks, and still-deferred migration items.

- [ ] **Step 5: Commit verification record**

```bash
git add CHANGELOG.md docs/PROFESYONELLESTIRME_DENETIMI_TR.md
git commit -m "docs: record v3.1 verification"
```

### Task 11: Integrate safely with the requested destination repository

**Files:**
- Modify: repository Git configuration and merge commit only after Task 10 passes
- Verify: `README.md`, `CHANGELOG.md`, and full test suite on the integrated history

**Interfaces:**
- Destination remote name: `destination`
- Destination URL: `https://github.com/keremtrgl/server-survival.git`
- Upstream remote `origin` remains unchanged and is never pushed by this work.

- [ ] **Step 1: Inspect target history and working tree**

Run:

```bash
git status --short
git remote -v
git ls-remote https://github.com/keremtrgl/server-survival.git HEAD refs/heads/main
```

Expected: clean working tree; `origin` still points to pshenok upstream; target main's known independent README commit is visible.

- [ ] **Step 2: Add and fetch the destination without modifying origin**

Run:

```bash
git remote add destination https://github.com/keremtrgl/server-survival.git
git fetch destination main
git log --oneline --decorate --max-count=5 destination/main
```

Expected: target history is fetched as `destination/main`; no branch or remote is overwritten.

- [ ] **Step 3: Perform a normal unrelated-history integration**

Run:

```bash
git merge destination/main --allow-unrelated-histories
```

If a README conflict occurs, compare both versions and preserve all meaningful destination-authored material while adding the verified v3.1 source/release information. Do not use `git checkout --theirs`, `git reset --hard`, or a force push. If preserving destination content cannot be determined from the two files, stop and request user direction.

- [ ] **Step 4: Verify integrated history before publish**

Run:

```bash
git diff --check
npm run check
git status --short
git log --oneline --decorate --max-count=8
```

Expected: no whitespace errors, all checks pass, and the only staged/committed merge content is the reviewed union of v3.1 plus destination README history.

- [ ] **Step 5: Push the verified normal history**

Run:

```bash
git push destination main
```

Expected: a normal fast-forward or merge-based push to `keremtrgl/server-survival`; never add `--force` or push `origin`.
