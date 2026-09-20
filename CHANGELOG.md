# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- Starting or resetting runs now disposes run-owned timers, listeners, requests, scene groups, and transient visuals without leaking or double-cleaning resources.
- Save imports reject malformed state before changing the current run.
- The campaign preview handles Escape without dismissing unrelated UI, and locale metadata stays synchronized without debug output.

### Security

- Save payloads are schema-validated and sanitized before restoration, including nested numeric, service, connection, and campaign data.
- Updated Vitest and its resolved development-tool dependency graph to patched compatible versions; the shipped game still has no npm runtime dependencies.

[3.1.0]: https://github.com/pshenok/server-survival/compare/v3.0.0...v3.1.0
