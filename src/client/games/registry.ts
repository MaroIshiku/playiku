import { game2048 } from './2048.js';
import { minesweeper } from './minesweeper.js';
import { nonogram } from './nonogram.js';
import { snake } from './snake.js';
import { solitaire } from './solitaire.js';
import { sudoku } from './sudoku.js';
import type { GameManifest } from './types.js';

export const games = [sudoku, minesweeper, game2048, nonogram, snake, solitaire] satisfies GameManifest[];
export const gameById = Object.fromEntries(games.map((game) => [game.id, game])) as Record<GameManifest['id'], GameManifest>;
