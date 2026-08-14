import { describe, expect, it } from 'vitest';
import { is2048GameOver, move2048, spawn2048 } from '../src/client/games/2048.js';
import { createMinefield, neighbors, revealCells } from '../src/client/games/minesweeper.js';
import { createNonogramPicture, lineClues } from '../src/client/games/nonogram.js';
import { stepSnake } from '../src/client/games/snake.js';
import { canPlaceFoundation, canPlaceTableau, createDeal, isSolitaireWon, isValidTableauRun, type Card } from '../src/client/games/solitaire.js';
import { countSudokuSolutions, createSudokuPuzzle, sudokuPuzzles } from '../src/client/games/sudoku.js';

describe('2048 engine', () => {
  it('merges each pair once and calculates score', () => { const result = move2048([2, 2, 2, 2, ...Array(12).fill(0)], 'left'); expect(result.board.slice(0, 4)).toEqual([4, 4, 0, 0]); expect(result.score).toBe(8); });
  it('does not move an unchanged line and detects a fully blocked board', () => { expect(move2048([2, 4, 8, 16, ...Array(12).fill(0)], 'left').moved).toBe(false); expect(is2048GameOver([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2])).toBe(true); expect(is2048GameOver([2, 4, 2, 0, ...Array(12).fill(0)])).toBe(false); });
  it('spawns deterministically and advances the saved random sequence', () => { const first = spawn2048(Array(16).fill(0), 42), again = spawn2048(Array(16).fill(0), 42); expect(first).toEqual(again); expect(first.rngState).not.toBe(42); expect(first.board.filter(Boolean)).toHaveLength(1); });
});

describe('Minesweeper engine', () => {
  it('keeps a clear first-click area and places the requested mine count', () => { const cells = createMinefield(9, 9, 10, 40, 42); expect(cells.filter((cell) => cell.mine)).toHaveLength(10); expect([40, ...neighbors(40, 9, 9)].every((index) => !cells[index]!.mine)).toBe(true); });
  it('falls back to first-cell safety on extremely dense custom boards', () => { const cells = createMinefield(5, 5, 24, 0, 9); expect(cells[0]!.mine).toBe(false); expect(cells.filter((cell) => cell.mine)).toHaveLength(24); });
  it('opens connected empty cells without opening flagged cells', () => { const cells = createMinefield(9, 9, 1, 0, 1); cells[1]!.flagged = true; const opened = revealCells(cells, 0, 9, 9); expect(opened[0]!.open).toBe(true); expect(opened[1]!.open).toBe(false); expect(neighbors(0, 9, 9)).toEqual([1, 9, 10]); });
});

describe('Sudoku engine', () => {
  for (const [difficulty, puzzle] of Object.entries(sudokuPuzzles)) it(`${difficulty} has exactly one solution`, () => expect(countSudokuSolutions(puzzle)).toBe(1));
  it('creates deterministic, varied, uniquely solvable Daily transformations', () => { const first = createSudokuPuzzle('Hard', 101), again = createSudokuPuzzle('Hard', 101), next = createSudokuPuzzle('Hard', 102); expect(first).toEqual(again); expect(next).not.toEqual(first); expect(countSudokuSolutions(first)).toBe(1); expect(countSudokuSolutions(next)).toBe(1); });
});

describe('Nonogram engine', () => {
  it('calculates separated runs and empty lines', () => { expect(lineClues([1, 1, 0, 1, 0])).toEqual([2, 1]); expect(lineClues([0, 0])).toEqual([0]); });
  it('creates deterministic, non-repeating pictures with usable rows and columns', () => { for (const size of [5, 10, 15] as const) { const first = createNonogramPicture(size, 101), again = createNonogramPicture(size, 101), next = createNonogramPicture(size, 102); expect(first).toEqual(again); expect(next).not.toEqual(first); for (let row = 0; row < size; row += 1) expect(first.slice(row * size, (row + 1) * size).some(Boolean)).toBe(true); for (let column = 0; column < size; column += 1) expect(Array.from({ length: size }, (_, row) => first[row * size + column]).some(Boolean)).toBe(true); } });
});

describe('Snake engine', () => { it('grows on food and detects walls and self-collision', () => { expect(stepSnake([5], 'right', 4, 6)).toMatchObject({ body: [6, 5], ate: true, dead: false }); expect(stepSnake([3], 'right', 4, 10).dead).toBe(true); expect(stepSnake([6, 5, 9, 10, 11], 'down', 4, 0).dead).toBe(true); }); });

describe('Klondike engine', () => {
  const card = (suit: Card['suit'], rank: number): Card => ({ id: `${suit}${rank}`, suit, rank, faceUp: true });
  it('deals 24 stock cards and exposes only the top card of each tableau column', () => { const deal = createDeal(42); expect(deal.stock).toHaveLength(24); expect(deal.stock.length + deal.tableau.flat().length).toBe(52); expect(deal.tableau.map((column) => column.length)).toEqual([1, 2, 3, 4, 5, 6, 7]); for (const column of deal.tableau) { expect(column.at(-1)?.faceUp).toBe(true); expect(column.slice(0, -1).every((item) => !item.faceUp)).toBe(true); } });
  it('enforces alternating tableau runs and ascending same-suit foundations', () => { expect(canPlaceTableau(card('♠', 7), card('♥', 8))).toBe(true); expect(canPlaceTableau(card('♣', 7), card('♠', 8))).toBe(false); expect(isValidTableauRun([card('♥', 8), card('♠', 7), card('♦', 6)])).toBe(true); expect(isValidTableauRun([card('♥', 8), card('♦', 7)])).toBe(false); expect(canPlaceFoundation(card('♥', 1), [])).toBe(true); expect(canPlaceFoundation(card('♥', 2), [card('♥', 1)])).toBe(true); expect(canPlaceFoundation(card('♦', 2), [card('♥', 1)])).toBe(false); });
  it('recognizes a complete foundation state', () => { expect(isSolitaireWon({ foundations: Array.from({ length: 4 }, () => Array(13).fill(card('♠', 1))) })).toBe(true); expect(isSolitaireWon({ foundations: [[], [], [], []] })).toBe(false); });
});
