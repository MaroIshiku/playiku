# Playiku 0.9 release checklist

`0.9.0` is the stable preview release for the `latest` channel. Its publication is authorized only after every automated gate below passes. The human exploratory checks remain the acceptance checklist for a future `1.0.0` release and must not be recorded as complete without direct human evidence.

## Automated release gates

- `node .ishiku/kit/scripts/verify-app . --full`
- Clean `npm audit --audit-level=high`
- Chromium, Firefox, and mobile Chromium Playwright matrix
- Axe on the shell, every game, and the modal help/confirmation states
- Five viewport, six theme, light/dark visual artifact matrix plus phone and desktop game captures
- Compose validation, Dockerfile build check, hardened container smoke test, persistence backup/restore test
- Exact-digest high/critical image scan, SPDX SBOM, and provenance attestation in the tag workflow

## Human exploratory sign-off

- On a physical phone, play at least five moves in every game using touch; verify Minesweeper long press, 2048 and Snake swipes, Nonogram drag painting, and Solitaire tap-to-move.
- On a desktop keyboard, verify Sudoku cell navigation and entry, 2048 and Snake arrows/WASD, Space pause in Snake, visible focus, Escape-to-close dialogs, and focus restoration.
- Win one Sudoku or Nonogram and lose one Minesweeper or Snake round; confirm feedback, sound/haptics preferences, animation, and reduced-motion behavior.
- Start a normal 2048 game, start its Daily challenge, return, and confirm the normal save is unchanged. Complete one Daily and confirm it is marked complete for the rest of the configured instance date.
- Review the five-viewport visual artifacts in all six themes and both modes. Approve the baseline only if no clipping, unintended page-level horizontal scroll, contrast regression, or obscured focus is present.
- Upgrade a copy of a `v0.1.2` data volume, inspect accounts, settings, statistics, and one old save, then perform the documented rollback.
- Confirm ZimaOS first run through fixed port `8514`, remove the setup secret after administrator creation, and restart the container once.

## 0.9 publication

After the automated gates pass, merge the `0.9.0` release metadata and create tag `v0.9.0`. The release workflow must build the tag once, scan its immutable digest, attach evidence, and only then promote that same digest to `latest`. Before a future `v1.0.0`, complete and record every human exploratory item above, update the version metadata, and repeat the full release gate.
