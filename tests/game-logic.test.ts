import { describe, expect, it } from 'vitest';
import { move2048 } from '../src/client/games/2048.js';
import { createMinefield, neighbors, revealCells } from '../src/client/games/minesweeper.js';
import { lineClues } from '../src/client/games/nonogram.js';
import { stepSnake } from '../src/client/games/snake.js';
import { canPlaceFoundation, canPlaceTableau, createDeal, type Card } from '../src/client/games/solitaire.js';
import { countSudokuSolutions, sudokuPuzzles } from '../src/client/games/sudoku.js';

describe('2048 engine', () => {
  it('merges each pair once and calculates score', () => { const result = move2048([2, 2, 2, 2, ...Array(12).fill(0)], 'left'); expect(result.board.slice(0, 4)).toEqual([4, 4, 0, 0]); expect(result.score).toBe(8); });
  it('does not move an unchanged board', () => { expect(move2048([2, 4, 8, 16, ...Array(12).fill(0)], 'left').moved).toBe(false); });
});
describe('Minesweeper engine', () => {
  it('keeps the first cell safe and places the requested mine count', () => { const cells = createMinefield(9, 9, 10, 40, 42); expect(cells[40]!.mine).toBe(false); expect(cells.filter((cell) => cell.mine)).toHaveLength(10); });
  it('opens connected empty cells without opening flagged cells', () => { const cells = createMinefield(9, 9, 1, 0, 1); cells[1]!.flagged = true; const opened = revealCells(cells, 0, 9, 9); expect(opened[0]!.open).toBe(true); expect(opened[1]!.open).toBe(false); expect(neighbors(0, 9, 9)).toEqual([1, 9, 10]); });
});
describe('Sudoku engine', () => { for (const [difficulty, puzzle] of Object.entries(sudokuPuzzles)) it(`${difficulty} has exactly one solution`, () => expect(countSudokuSolutions(puzzle)).toBe(1)); });
describe('Nonogram engine', () => { it('calculates separated runs and empty lines', () => { expect(lineClues([1, 1, 0, 1, 0])).toEqual([2, 1]); expect(lineClues([0, 0])).toEqual([0]); }); });
describe('Snake engine', () => { it('grows on food and detects walls and self-collision', () => { expect(stepSnake([5], 'right', 4, 6)).toMatchObject({ body: [6, 5], ate: true, dead: false }); expect(stepSnake([3], 'right', 4, 10).dead).toBe(true); expect(stepSnake([6, 5, 9, 10, 11], 'down', 4, 0).dead).toBe(true); }); });
describe('Klondike engine', () => {
  const card = (suit: Card['suit'], rank: number): Card => ({ id: `${suit}${rank}`, suit, rank, faceUp: true });
  it('deals all 52 cards and exposes seven tableau columns', () => { const deal = createDeal(42); expect(deal.stock.length + deal.tableau.flat().length).toBe(52); expect(deal.tableau.map((column) => column.length)).toEqual([1, 2, 3, 4, 5, 6, 7]); });
  it('enforces alternating tableau and ascending same-suit foundations', () => { expect(canPlaceTableau(card('♠', 7), card('♥', 8))).toBe(true); expect(canPlaceTableau(card('♣', 7), card('♠', 8))).toBe(false); expect(canPlaceFoundation(card('♥', 1), [])).toBe(true); expect(canPlaceFoundation(card('♥', 2), [card('♥', 1)])).toBe(true); expect(canPlaceFoundation(card('♦', 2), [card('♥', 1)])).toBe(false); });
});
