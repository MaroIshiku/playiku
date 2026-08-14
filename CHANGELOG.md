# Changelog

All notable changes follow semantic versioning.

## 0.9.1 - 2026-08-14

- Prevented stale HTML and service-worker responses from retaining obsolete asset URLs after an upgrade, which could leave HTTP appliance deployments on a white screen.
- Made the application shell and service worker revalidate on every navigation while retaining immutable caching for hashed JavaScript and CSS assets.
- Added automatic service-worker update checks, atomic cache replacement, and regression coverage for release-safe cache headers and offline fallback.

### Compatibility and migration

The SQLite schema remains at version 1. No data migration is required. A browser that already cached the affected 0.9.0 shell may require one hard refresh or clearing Playiku site data once; subsequent releases update automatically.

## 0.9.0 - 2026-08-14

- Completed the version 1 game contract with shared How to play guidance, accessible confirmations, round feedback, configurable default games, editable profiles, and revocable session management.
- Reworked Daily challenges so the date seed drives complete puzzles and random sequences, completed challenges are not repeatedly offered, and Daily play cannot overwrite a normal saved game.
- Added varied uniquely solvable Sudoku transformations, safe-area and exact-count Minesweeper generation, deterministic Nonogram pictures, deterministic 2048 spawning and game-over handling, safer Snake turn queuing, and a corrected Klondike deal with redo and foundation-to-tableau moves.
- Added reduced-motion-aware tile, win, food, and incorrect-move animation plus responsive game-header, dialog, empty, loading, error, and completion states aligned with ishiku Design System v5.
- Added strict per-game persistence schemas, bounded payload validation, Daily result validation, stable opaque session identifiers, build identity metadata, and immutable release-note generation.
- Expanded deterministic engine, API, security, Axe, keyboard, touch/drag, offline, responsive, dialog, Daily-isolation, and visual evidence from 20 to 26 unit/integration tests plus the three-browser Playwright matrix.
- Made the hardened container smoke test honor the complete Docker healthcheck window before exercising persistence, backup, restore, and sign-in recovery.

### Compatibility and migration

The SQLite schema remains at version 1 and no irreversible database migration is performed. Existing accounts, settings, statistics, favorites, achievements, and sessions remain compatible. Legacy theme preferences and the previous Sudoku, Nonogram, Minesweeper, 2048, and Solitaire save shapes are migrated or normalized client-side when resumed. Back up `/data` before upgrading; rollback to `v0.1.2` is safe against the unchanged schema after stopping the newer container.

### Release status

This is the first stable preview release on the `latest` channel. Publication is authorized only after the complete automated application, browser, accessibility, container, security, and release gates pass. The remaining physical-device and human visual-approval checks in `docs/RELEASE_CHECKLIST.md` are retained as acceptance evidence required before a future `v1.0.0` release.

## 0.1.2 - 2026-08-14

- Prevented HTTP appliance deployments from upgrading same-origin assets to unavailable HTTPS URLs, fixing the blank screen seen on local ZimaOS addresses.
- Aligned the six themes and their light/dark color roles with ishiku Design System v5.
- Added backward-compatible migration from the legacy theme identifiers so existing account preferences remain usable.
- Added CSP and theme-migration regression coverage plus a versioned design-system provenance lock.

## 0.1.1 - 2026-08-14

- Added the responsive Playiku library, six themes, light/dark modes, profile navigation, settings, statistics, milestones, About data, and PWA shell.
- Added modular Sudoku, Minesweeper, 2048, Nonogram, Snake, and Klondike Solitaire games.
- Added one-time administrator setup, Argon2id authentication, revocable sessions, CSRF protection, audit events, per-user persistence, and deterministic daily seeds.
- Added deterministic engine tests, API/security integration tests, Axe coverage, and responsive visual artifacts.
- Added hardened Docker/Compose delivery, operational documentation, pinned GitHub Actions, SBOM, and provenance publishing.
- Added digest-preserving promotion to the ZimaOS `latest` channel, high/critical image scanning, SPDX release assets, and evidence-backed GitHub release notes.
- Normalized the GHCR repository path to lowercase after the unpublished `v0.1.0` tag exposed a registry compatibility issue.

### Compatibility and migration

This is the first release. The SQLite schema is created automatically in `/data`; there is no prior data migration. Back up the complete volume before every upgrade. Roll back by restoring the pre-upgrade volume and previous image digest.
