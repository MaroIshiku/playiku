import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';
const puzzleStrings: Record<Difficulty, string> = {
  Easy: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  Medium: '009000000080605020501078000000000700706040102004000000000720903090301080000000600',
  Hard: '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
  Expert: '100007090030020008009600500005300900010080002600004000300000010040000007007000300'
};
export const sudokuPuzzles = Object.fromEntries(Object.entries(puzzleStrings).map(([key, value]) => [key, value.split('').map(Number)])) as Record<Difficulty, number[]>;

function seedNumber(seed: string | number) {
  if (typeof seed === 'number') return seed >>> 0;
  return Number.parseInt(seed.slice(0, 8), 16) >>> 0;
}
function seededRandom(seed: string | number) {
  let value = seedNumber(seed) || 0x9e3779b9;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
function shuffled<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) { const target = Math.floor(random() * (index + 1)); [result[index], result[target]] = [result[target]!, result[index]!]; }
  return result;
}
export function createSudokuPuzzle(difficulty: Difficulty, seed: string | number) {
  const random = seededRandom(seed);
  const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const groups = shuffled([0, 1, 2], random);
  const rows = groups.flatMap((group) => shuffled([0, 1, 2], random).map((row) => group * 3 + row));
  const stacks = shuffled([0, 1, 2], random);
  const columns = stacks.flatMap((stack) => shuffled([0, 1, 2], random).map((column) => stack * 3 + column));
  const transpose = random() > .5;
  return Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9), column = index % 9;
    const sourceRow = transpose ? rows[column]! : rows[row]!;
    const sourceColumn = transpose ? columns[row]! : columns[column]!;
    const value = sudokuPuzzles[difficulty][sourceRow * 9 + sourceColumn]!;
    return value ? digits[value - 1]! : 0;
  });
}

function allowed(board: number[], index: number, value: number) {
  const row = Math.floor(index / 9), column = index % 9;
  for (let item = 0; item < 9; item += 1) if (board[row * 9 + item] === value || board[item * 9 + column] === value) return false;
  const startRow = Math.floor(row / 3) * 3, startColumn = Math.floor(column / 3) * 3;
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) if (board[(startRow + y) * 9 + startColumn + x] === value) return false;
  return true;
}
export function solveSudoku(input: number[]) { const board = [...input]; const visit = (): boolean => { const index = board.indexOf(0); if (index < 0) return true; for (let value = 1; value <= 9; value += 1) if (allowed(board, index, value)) { board[index] = value; if (visit()) return true; board[index] = 0; } return false; }; return visit() ? board : undefined; }
export function countSudokuSolutions(input: number[], limit = 2) { const board = [...input]; let count = 0; const visit = () => { if (count >= limit) return; const index = board.indexOf(0); if (index < 0) { count += 1; return; } for (let value = 1; value <= 9; value += 1) if (allowed(board, index, value)) { board[index] = value; visit(); board[index] = 0; } }; visit(); return count; }

type Snapshot = { values: number[]; notes: number[][] };
type SavedSudoku = { difficulty?: Difficulty; givens?: number[]; values?: number[]; notes?: number[][]; elapsed?: number; puzzleSeed?: number; completed?: boolean };
const blankNotes = () => Array.from({ length: 81 }, () => [] as number[]);
const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function Sudoku({ initialState, dailySeed, preferences, onState, onFinish }: GameProps) {
  const saved = initialState as SavedSudoku | undefined;
  const dailyDifficulty = dailySeed ? (['Easy', 'Medium', 'Hard', 'Expert'] as Difficulty[])[seedNumber(dailySeed) % 4]! : undefined;
  const initialDifficulty = dailyDifficulty ?? saved?.difficulty ?? preferences.sudokuDifficulty;
  const initialPuzzleSeed = dailySeed ? seedNumber(dailySeed) : saved?.puzzleSeed ?? newSeed();
  const legacySaved = !dailySeed && saved?.values?.length === 81 && !saved.givens;
  const initialGivens = saved?.givens?.length === 81 && !dailySeed ? saved.givens : legacySaved ? [...sudokuPuzzles[initialDifficulty]] : createSudokuPuzzle(initialDifficulty, initialPuzzleSeed);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [puzzleSeed, setPuzzleSeed] = useState(initialPuzzleSeed);
  const [givens, setGivens] = useState(initialGivens);
  const solution = useMemo(() => solveSudoku(givens)!, [givens]);
  const [values, setValues] = useState(saved?.values?.length === 81 && !dailySeed ? saved.values : [...initialGivens]);
  const [notes, setNotes] = useState<number[][]>(saved?.notes?.length === 81 && !dailySeed ? saved.notes : blankNotes());
  const [selected, setSelected] = useState(initialGivens.findIndex((value) => !value));
  const [noteMode, setNoteMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(dailySeed ? 0 : saved?.elapsed ?? 0);
  const [completed, setCompleted] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const finished = useRef(false);

  const state = (nextValues = values, nextNotes = notes, nextElapsed = elapsed) => ({ difficulty, puzzleSeed, givens, values: nextValues, notes: nextNotes, elapsed: nextElapsed, completed: false });
  useEffect(() => { if (paused || completed) return; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => clearInterval(timer); }, [paused, completed]);
  useEffect(() => { if (elapsed > 0 && elapsed % 5 === 0 && !completed) onState(state(values, notes, elapsed)); }, [elapsed]);

  const persist = (nextValues: number[], nextNotes: number[][]) => {
    setValues(nextValues); setNotes(nextNotes);
    const won = nextValues.every((value, index) => value === solution[index]);
    if (won) {
      setCompleted(true);
      if (!finished.current) { finished.current = true; onFinish({ outcome: 'won', durationMs: elapsed * 1000 }); }
    } else onState(state(nextValues, nextNotes));
  };
  const remember = () => { setHistory((items) => [...items.slice(-49), { values: [...values], notes: notes.map((item) => [...item]) }]); setFuture([]); };
  const enter = (value: number) => {
    if (paused || completed || selected < 0 || givens[selected]) return;
    remember();
    const nextValues = [...values], nextNotes = notes.map((item) => [...item]);
    if (noteMode && value) nextNotes[selected] = nextNotes[selected]!.includes(value) ? nextNotes[selected]!.filter((item) => item !== value) : [...nextNotes[selected]!, value].sort();
    else {
      nextValues[selected] = value; nextNotes[selected] = [];
      if (value) for (let index = 0; index < 81; index += 1) if (Math.floor(index / 9) === Math.floor(selected / 9) || index % 9 === selected % 9 || (Math.floor(index / 27) === Math.floor(selected / 27) && Math.floor((index % 9) / 3) === Math.floor((selected % 9) / 3))) nextNotes[index] = nextNotes[index]!.filter((item) => item !== value);
    }
    persist(nextValues, nextNotes);
  };
  const reset = (nextDifficulty = difficulty) => {
    const nextSeed = dailySeed ? seedNumber(dailySeed) : newSeed();
    const nextGivens = createSudokuPuzzle(nextDifficulty, nextSeed), nextNotes = blankNotes();
    finished.current = false; setCompleted(false); setDifficulty(nextDifficulty); setPuzzleSeed(nextSeed); setGivens(nextGivens); setValues(nextGivens); setNotes(nextNotes); setHistory([]); setFuture([]); setElapsed(0); setPaused(false); setSelected(nextGivens.findIndex((value) => !value));
    onState({ difficulty: nextDifficulty, puzzleSeed: nextSeed, givens: nextGivens, values: nextGivens, notes: nextNotes, elapsed: 0, completed: false });
  };
  const restore = (snapshot: Snapshot, target: 'undo' | 'redo') => {
    if (target === 'undo') { setFuture((items) => [...items, { values, notes }]); setHistory((items) => items.slice(0, -1)); }
    else { setHistory((items) => [...items, { values, notes }]); setFuture((items) => items.slice(0, -1)); }
    persist(snapshot.values, snapshot.notes);
  };
  const moveSelection = (dx: number, dy: number) => {
    const current = selected < 0 ? 0 : selected, row = Math.floor(current / 9), column = current % 9;
    const next = ((row + dy + 9) % 9) * 9 + ((column + dx + 9) % 9);
    setSelected(next); cells.current[next]?.focus();
  };
  const selectedValue = values[selected] ?? 0;

  return <section className="game-panel sudoku-panel" onKeyDown={(event) => {
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); }
    else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') { event.preventDefault(); enter(0); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelection(-1, 0); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); moveSelection(1, 0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveSelection(0, -1); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); moveSelection(0, 1); }
  }}>
    <div className="game-toolbar"><label>Difficulty<select value={difficulty} disabled={Boolean(dailySeed)} onChange={(event) => reset(event.target.value as Difficulty)}><option>Easy</option><option>Medium</option><option>Hard</option><option>Expert</option></select></label><span aria-label={`${elapsed} seconds elapsed`}>{formatTime(elapsed)}</span><button className="text-button" disabled={completed} onClick={() => { setPaused((value) => !value); onState(state()); }}>{paused ? 'Resume' : 'Pause'}</button></div>
    <div className="sudoku-wrap">{paused ? <div className="pause-card"><strong>Paused</strong><button onClick={() => setPaused(false)}>Resume</button></div> : <div className={`sudoku-board ${completed ? 'is-complete' : ''}`} role="region" aria-label="Sudoku board">{values.map((value, index) => {
      const sameBox = Math.floor(index / 27) === Math.floor(selected / 27) && Math.floor((index % 9) / 3) === Math.floor((selected % 9) / 3);
      const related = selected >= 0 && (Math.floor(index / 9) === Math.floor(selected / 9) || index % 9 === selected % 9 || sameBox);
      const wrong = preferences.showMistakes && value !== 0 && value !== solution[index];
      return <button ref={(node) => { cells.current[index] = node; }} tabIndex={selected === index ? 0 : -1} key={index} aria-pressed={selected === index} aria-invalid={wrong || undefined} aria-label={`Row ${Math.floor(index / 9) + 1}, column ${index % 9 + 1}${value ? `, ${value}` : ', empty'}`} className={`${givens[index] ? 'given' : ''} ${selected === index ? 'selected' : ''} ${related ? 'related' : ''} ${wrong ? 'wrong' : ''} ${selectedValue && value === selectedValue ? 'same' : ''}`} onClick={() => setSelected(index)}>{value || <small>{notes[index]?.join(' ')}</small>}</button>;
    })}</div>}</div>
    {completed && <p className="status-message success" role="status">Puzzle complete!</p>}
    <div className="number-pad" aria-label="Number pad">{Array.from({ length: 9 }, (_, index) => <button key={index + 1} disabled={paused || completed} onClick={() => enter(index + 1)}>{index + 1}</button>)}</div>
    <div className="game-actions wrap"><button className={noteMode ? '' : 'secondary'} aria-pressed={noteMode} disabled={completed} onClick={() => setNoteMode((value) => !value)}>Notes</button><button className="secondary" disabled={!history.length || completed} onClick={() => { const snapshot = history.at(-1); if (snapshot) restore(snapshot, 'undo'); }}>Undo</button><button className="secondary" disabled={!future.length || completed} onClick={() => { const snapshot = future.at(-1); if (snapshot) restore(snapshot, 'redo'); }}>Redo</button><button className="secondary" disabled={completed} onClick={() => { const index = values.findIndex((value, item) => !value && !givens[item]); if (index >= 0) { remember(); setSelected(index); const next = [...values], nextNotes = notes.map((item) => [...item]); next[index] = solution[index]!; nextNotes[index] = []; persist(next, nextNotes); } }}>Hint</button><button onClick={() => reset()}>{dailySeed ? 'Restart puzzle' : 'New puzzle'}</button></div>
  </section>;
}

export const sudoku: GameManifest = {
  id: 'sudoku', name: 'Sudoku', description: 'Place numbers so every row, column, and box is complete.', category: 'logic', icon: 'M3 3h18v18H3V3Zm2 2v4h4V5H5Zm6 0v4h2V5h-2Zm4 0v4h4V5h-4ZM5 11v2h4v-2H5Zm6 0v2h2v-2h-2Zm4 0v2h4v-2h-4ZM5 15v4h4v-4H5Zm6 0v4h2v-4h-2Zm4 0v4h4v-4h-4Z', supportsResume: true, supportsDailyChallenge: true, controls: 'Keyboard or touch number pad',
  tips: ['Every row, column, and 3 × 3 box needs the numbers 1–9 exactly once.', 'Turn on Notes to keep candidate numbers without committing a value.', 'Arrow keys move between cells; number keys enter values; Delete clears a cell.'], component: Sudoku
};
