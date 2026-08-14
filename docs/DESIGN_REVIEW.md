# Design System v5 review

Playiku targets `ishiku-design-5` version `5.0.0`, English UI text, the standard-account shell, WCAG 2.2 AA, and Lavender, Mint, Sky, Amber, Rose, and Graphite in System, Light, and Dark modes.

The shell uses the shared spacing, radius, motion, elevation, and semantic color roles. The short color variable names retained in `styles.css` are the documented compatibility adapter for established game-board styles; the corresponding `--color-*` roles are exposed centrally. Game artwork is limited to local SVG paths and the approved Playiku bitmap. Controls use visible focus, minimum general touch targets, labeled dense-board exceptions, explicit text or shape state, and reduced-motion overrides.

Automated visual evidence covers 390×844, 412×915, 768×1024, 1440×900, and 1920×1080 across all theme/mode combinations. Additional phone and desktop captures cover all six games plus a destructive confirmation dialog. Loading, empty, error, paused, won, lost, Daily, help-dialog, settings, sessions, and offline states have executable or exploratory coverage.

Automated comparison and Axe results are evidence, not manual baseline approval. Final visual baseline approval remains one of the explicit human release gates in `RELEASE_CHECKLIST.md`.
