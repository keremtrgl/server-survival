# Server Survival v3.1 Stabilization Design

## Purpose

Deliver a reliable, accessible, and release-ready v3.1 without changing the game's teaching model or introducing a high-risk Three.js major migration. The release fixes player-visible stability failures, protects trust boundaries, improves the first-run learning flow, and establishes a stricter delivery baseline.

## Scope

### Included

- Correct Three.js resource disposal across reset, retry, campaign transition, save load, and object removal paths.
- Bounded Sandbox traffic input, bounded burst scheduling, and reset-safe burst cancellation.
- Validate imported save files before they mutate live game state.
- Render Campaign identity and objectives before the first simulation tick.
- Explain rejected connections in the game UI.
- Make the Sandbox panel usable at compact desktop heights and narrow touch viewports.
- Improve semantic controls, live announcements, focus visibility, and reduced-motion behavior.
- Remove noisy production debug logs and tighten CI/dependency update configuration.
- Add focused regression coverage, a human-readable CHANGELOG, and release documentation.

### Explicitly deferred

- Moving Three.js from r128 to the current major release.
- Replacing Tailwind Play CDN with a bundled Tailwind build.
- Instanced rendering, object pooling, Web Workers, deterministic replay, a backend, or multiplayer.
- New game modes, progression systems, telemetry, or architecture linter features beyond connection feedback.

These are valid follow-up projects but each changes runtime architecture or public behavior enough to deserve independent design, migration, and visual compatibility work.

## Non-goals

- Do not rewrite the simulation core.
- Do not change the existing campaign level balance or intended service rules.
- Do not force-push or overwrite the destination repository history.
- Do not send any commit to GitHub until all release checks pass.

## Design

### Run resource lifecycle

A run owns every request mesh, service mesh, connection line, autoscaling satellite, failure badge, and pending burst callback it creates.

The reset and clear paths will first snapshot the active collections, then dispose their resources before clearing arrays or scene groups. The order is:

1. Cancel pending run timers.
2. Destroy requests.
3. Destroy services, including every owned child visual.
4. Dispose/remove connection visuals.
5. Clear failure badges and reset scene groups only as a defensive final cleanup.
6. Replace state collections with fresh empty arrays.

Service.destroy will explicitly dispose loadRing and queueFill in addition to the main mesh, tier rings, health bars, and satellites. Request.destroy remains the sole owner of request geometry/material disposal.

No shared geometry/material cache is introduced in v3.1. This avoids ambiguous ownership while the lifecycle fix is being proven.

### Sandbox traffic boundaries and burst scheduling

Sandbox number entry will normalize at its input boundary:

- RPS must be finite and within an explicit safe maximum.
- Burst count must be a positive integer within an explicit safe maximum.
- Programmatic calls receive the same validation as UI input.

The simulation spawn loop will use a per-frame catch-up ceiling. A large frame delay may leave spawn credit for a later frame, but can never execute an unbounded loop in one animation frame.

Burst callbacks will be registered against the active run epoch. Reset, retry, campaign load, load game, and game over advance the epoch and cancel all pending timeout IDs. A callback verifies its epoch before it creates a request. This prevents an old run from injecting traffic into a new run.

The UI will show the normalized value. If a player enters an out-of-range value, it will be clamped to the safe bound rather than silently retaining a dangerous internal state.

### Imported save validation

Imported JSON is untrusted data. The load flow becomes:

1. Reject files over the configured byte limit before FileReader parses them.
2. Parse JSON in a guarded block.
3. Migrate legacy formats in memory.
4. Validate and normalize into a versioned plain save DTO.
5. Only after validation succeeds, clear the active run and restore the normalized DTO.

The validator checks:

- top-level object and supported version;
- finite bounded counters, money, reputation, RPS, time scale, and burst count;
- known game modes, tools, traffic keys, and service types;
- maximum service and connection counts;
- finite, in-grid service positions;
- well-formed connection IDs and no unbounded nested arrays.

Invalid saves leave the existing game untouched and display the existing localized corrupted-save message. The current share URL validation limits remain the reference for service/edge caps.

### Campaign and topology feedback

Campaign load will immediately render the campaign objectives and a mode-aware HUD title. Objective evaluation can still run at its existing cadence; the first render does not wait for that cadence.

createConnection will return an outcome object rather than relying only on console output. It includes success/failure and a localized reason key. The input layer will display a short live toast for invalid endpoint, duplicate/reverse connection, and invalid topology outcomes. Existing valid connection behavior, sounds, and tutorial hooks stay unchanged.

v3.1 provides explanation first. Target highlighting, ghost arrows, and the broader architecture linter are later enhancements.

### Responsive HUD and accessibility

The compact layout will reserve bottom space for the toolbar and cap the Sandbox panel height to the visual viewport. Its contents become internally scrollable when needed. Safe-area insets are included in the bottom offset.

Semantic and assistive improvements:

- Time controls, panel-collapse controls, and icon-only actions receive meaningful accessible names.
- Campaign level cards become native buttons; locked entries use disabled/aria-disabled semantics.
- Dynamic objective and connection feedback use a polite live region.
- Visible focus styling is added for controls.
- prefers-reduced-motion disables nonessential pulse/transition animation.
- The HTML language attribute follows the selected locale.
- Existing keyboard shortcuts remain, but buttons and content do not depend solely on pointer hover.

Keyboard canvas placement is not included in v3.1 because it requires a separate command/selection model. This release makes all currently exposed DOM controls semantic and announces critical state changes.

### Release hygiene

- Remove unconditional locale dictionary console logging.
- Add explicit minimal GitHub Actions permissions.
- Add Dependabot configuration for npm and GitHub Actions.
- Upgrade only compatible development dependencies needed to remediate current audit findings, then refresh the lockfile using npm.
- Add CHANGELOG.md using Keep a Changelog sections: Added, Changed, Fixed, Security.

## Error handling

Every new validation or disposal path is fail-safe:

- Invalid Sandbox values normalize to a bounded usable value.
- A late burst callback becomes a no-op.
- A malformed save preserves the active board.
- A failed resource disposal does not stop the rest of reset cleanup; errors are contained and surfaced only through development diagnostics.
- A rejected topology action produces user-visible text and does not mutate topology state.

## Test strategy

### Automated

- Unit/simulation tests for numeric normalization, frame spawn caps, and old-run burst cancellation.
- Tests that reset and clear invoke request/service/connection disposal exactly once.
- Save validation tests for oversized, malformed, unknown-type, non-finite, excessive-count, and valid legacy/current saves.
- Campaign test asserting objectives and mode identity exist before the first simulation tick.
- Topology tests asserting each rejected-link outcome is returned and leaves state unchanged.
- DOM-focused tests for accessible labels, campaign buttons, live region, and compact-layout CSS hooks.
- Full npm run check and npm audit verification.

### Manual browser checks

- Survival, Campaign Level 1, and Sandbox at 1280x720.
- Sandbox at 320px, 375px, and 768px widths.
- Restart and Campaign transition sequences.
- Save import failure preserves the existing board.
- Keyboard-only traversal through menu, campaign selection, and time controls.

## Delivery and destination repository

The current full local checkout is the source base. The destination repository, keremtrgl/server-survival, currently has an unrelated one-commit README history.

After code review and release verification:

1. Add the destination as a separate git remote; do not alter the upstream origin.
2. Fetch its main branch and attempt a normal, non-force integration.
3. Preserve meaningful destination README content when resolving the unrelated-history merge.
4. Commit CHANGELOG.md and release changes with clear conventional commit messages.
5. Push only after the local checks and integration checks succeed.

If the destination README cannot be merged without losing meaningful user-authored content, stop and request direction rather than force-pushing.

## Acceptance criteria

- Ten restarts and campaign transitions do not leave stale request/service/connection resources in the active scene.
- Sandbox accepts no non-finite or unbounded load values, and a reset cancels prior bursts.
- Invalid save imports leave the current board intact.
- Campaign HUD/objectives are correct before the player starts time.
- Invalid linking explains the reason in the UI.
- Sandbox controls remain reachable at 1280x720 and supported narrow viewports.
- Every added/changed interaction has regression coverage where it can be automated.
- npm run check succeeds with zero failures.
- CHANGELOG accurately lists all player-visible changes before any remote push.
