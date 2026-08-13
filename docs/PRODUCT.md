# Playiku product scope

Playiku is a small self-hosted collection of casual browser games. It favors immediate play, polished controls, useful private statistics, and a consistent ishiku shell over progression systems or social mechanics.

Version 1 includes Sudoku, Minesweeper, 2048, Nonogram, Snake, and Klondike Solitaire. Games are client-side modules registered through a shared manifest. Authenticated state is saved asynchronously to the local Playiku server. Daily challenges are deterministic per instance date and game version.

Playiku deliberately excludes advertising, analytics, gambling, virtual currency, loot boxes, public matchmaking, emulation, ROM management, external game services, and cross-game XP.

Future candidates include Memory, Lights Out, Mastermind, Four in a Row, 15 Puzzle, Falling Blocks, Brick Breaker, Paddle, and Maze.

## Product decisions

- License: Apache-2.0.
- Risk class: C because the application stores accounts, sessions, and per-user data.
- Authentication: the standard ishiku revocable-session profile; optional guest mode is deferred and disabled.
- Default instance timezone: Europe/Berlin, configurable through `TZ`.
- Branding asset: user-supplied ChatGPT-generated image, received 2026-08-13 and used unmodified.
