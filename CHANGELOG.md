# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Turkish (Türkçe) localization: all 937 strings, including the 25-level campaign, the operator manual and every trophy. The game now has 12 languages.
- First visit picks the language from the browser's preferences (exact match, then base language) when no language was saved; English otherwise.
- `npm run serve`: a zero-dependency static server for local play and browser tests.
- Opt-in performance overlay: open the game with `?perf=1` to see FPS, frame-time p50/p95, renderer draw calls and triangles, live GPU geometries/textures, and live service/request counts.

### Changed

- Request tokens share one sphere geometry and one material per colour instead of allocating and disposing GPU resources for every request. Fail/throttle flashes swap to a shared material rather than mutating it.
- The per-frame HUD only writes to the DOM when a value actually changes, and no longer reads `innerText` (which forces layout).
- three.js r128 and Tailwind CSS are now served from this repository (`vendor/`) instead of cdnjs and the Tailwind Play CDN, which Tailwind documents as development-only. The page loads no third-party script or stylesheet; three.js carries a pinned SRI hash, and tests keep the hash and the compiled stylesheet in sync.
- A string missing from the active locale now falls back to English instead of showing the raw key, and `<html lang>` follows the active language from the first paint.
- Locale guards (briefing percentages, burst sizes, the level 4 "average" wording) understand Turkish forms such as the prefix percent sign ("%60 READ").
- The objectives panel keeps clear of the build toolbar (and of the stats panel on phones), scrolling internally when space is short. At 1280×720 its last bonus line used to sit under the toolbar.
- The board renders at the display's device pixel ratio (capped at 2x) for crisp visuals on HiDPI screens, re-applied on resize.

## [3.1.0] - 2026-09-15

### Added

- Localized live-status feedback explains why a requested topology connection was rejected.
- Campaign objectives and level context appear as soon as a campaign level starts.
- Automated checks now cover keyboard accessibility, run lifecycle cleanup, Sandbox boundaries, save validation, topology feedback, and release documentation.
- Weekly Dependabot updates cover npm development tooling and GitHub Actions.

### Changed

- The HUD, campaign controls, and compact layouts adapt more cleanly to small screens, keyboard navigation, and assistive technology.
- Sandbox RPS, traffic-mix, and burst inputs are bounded to safe playable ranges.
- CI now declares read-only repository-content permissions explicitly.

### Fixed

- Starting, resetting, or loading runs now disposes run-owned timers, requests, scene groups, failure badges, and transient visuals without leaking or double-cleaning resources.
- Save imports reject malformed state before changing the current run.
- The campaign preview handles Escape without dismissing unrelated UI, and locale metadata stays synchronized without debug output.

### Security

- Save payloads are schema-validated and sanitized before restoration, including nested numeric, service, and connection data; unsupported campaign-mode saves are rejected.
- Updated Vitest and its resolved development-tool dependency graph to patched compatible versions; the shipped game still has no npm runtime dependencies.

### Verification

- On 2026-09-20, `npm run check` completed with a clean ESLint run and 68 Vitest files / 1,165 tests passing; both `npm audit --omit=dev` and `npm audit` reported 0 vulnerabilities.
- Final release validation on 2026-09-21 completed with clean ESLint and 68 Vitest files / 1,172 tests passing after the save-load regression additions.
- Local-browser acceptance covered ten Sandbox restart/Campaign transition cycles, 1280×720 toolbar clearance, 320/375/768px responsive scrolling and keyboard focus, Campaign Level 1 pre-Play context, rejected-link announcements, burst cancellation across restart, malformed-save preservation, and reduced-motion rendering.

[3.1.0]: https://github.com/pshenok/server-survival/compare/v3.0.0...v3.1.0
