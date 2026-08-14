# Playiku

Playiku is a self-hosted collection of polished casual browser games. Version 1 includes Sudoku, Minesweeper, 2048, Nonogram, Snake, and Klondike Solitaire in a responsive, accessible ishiku interface.

## Highlights

- Six isolated game modules registered through one manifest contract.
- In-app tips, safe replacement confirmations, Daily challenges that preserve normal saves, and focused completion feedback.
- Touch, mouse, and keyboard controls with reduced-motion support.
- Six themes in light and dark mode.
- Private per-user favorites, settings, saved games, statistics, daily results, and milestones.
- One-time first-run setup, Argon2id passwords, revocable sessions, CSRF protection, secure cookies, rate limiting, and no external telemetry.
- Installable PWA shell and asynchronous server-side saves.
- Non-root, read-only Docker delivery with persistent SQLite storage.

## Local development

Use Node.js 24 LTS.

```sh
npm ci
npm run check
npm run test:e2e
```

For a local server, set a synthetic 32-character `ISHIKU_SETUP_SECRET`, `DATABASE_PATH`, and `COOKIE_SECURE=false`. A mounted secret file through `ISHIKU_SETUP_SECRET_FILE` is also supported. Run `npm run build && npm start`, then open `http://127.0.0.1:8080`.

## Docker

`compose.yaml` is the primary ZimaOS-compatible deployment file. Before import, replace its setup-secret placeholder with at least 32 unique random characters. Create `/DATA/AppData/i_playiku/Data`, make it writable by UID/GID `65532:65532`, and verify that fixed host port `8514` is free.

```sh
docker compose config --quiet
docker compose up -d
```

Open `http://<zimaos-host>:8514`, complete first run, then remove or rotate the setup-secret value after the administrator exists. Deployments exposed beyond a trusted local appliance network must terminate TLS and set `COOKIE_SECURE=true`.

The only persistent path is `/data`. The primary Compose uses the standard ZimaOS host path and `x-casaos` metadata. See `docs/OPERATIONS.md` for backup, restore, upgrade, and rollback.

## Verification

The binding local and CI gate is:

```sh
node .ishiku/kit/scripts/verify-app . --full
```

Requirements live in `appspec.yaml`; traceability is generated under `.ishiku/requirements/`. Release workflows build once, publish an immutable versioned GHCR image with SBOM and provenance, scan that exact digest, and then promote the same digest to `latest` for ZimaOS. Privileged release jobs never receive secrets from untrusted pull-request code.

Version `1.0.0-rc.1` is the full-release candidate. The remaining manual approval steps are listed in `docs/RELEASE_CHECKLIST.md`; prerelease tags are deliberately never promoted to `latest`.

## License

Apache-2.0. See `LICENSE` and `THIRD_PARTY_LICENSES.md`.
