# Changelog

All notable changes follow semantic versioning.

## 0.1.0 - 2026-08-14

- Added the responsive Playiku library, six themes, light/dark modes, profile navigation, settings, statistics, milestones, About data, and PWA shell.
- Added modular Sudoku, Minesweeper, 2048, Nonogram, Snake, and Klondike Solitaire games.
- Added one-time administrator setup, Argon2id authentication, revocable sessions, CSRF protection, audit events, per-user persistence, and deterministic daily seeds.
- Added deterministic engine tests, API/security integration tests, Axe coverage, and responsive visual artifacts.
- Added hardened Docker/Compose delivery, operational documentation, pinned GitHub Actions, SBOM, and provenance publishing.
- Added digest-preserving promotion to the ZimaOS `latest` channel, high/critical image scanning, SPDX release assets, and evidence-backed GitHub release notes.

### Compatibility and migration

This is the first release. The SQLite schema is created automatically in `/data`; there is no prior data migration. Back up the complete volume before every upgrade. Roll back by restoring the pre-upgrade volume and previous image digest.
