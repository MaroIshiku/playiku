import { useEffect, useMemo, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';
const puzzleStrings: Record<Difficulty, string> = {
  Easy: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  Medium: '009000000080605020501078000000000700706040102004000000000720903090301080000000600',
  Hard: '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
  Expert: '100007090030020008009600500005300900010080002600004000300000010040000007007000300'
};
export const sudokuPuzzles = Object.fromEntries(Object.entries(puzzleStrings).map(([key, value]) => [key, value.split('').map(Number)])) as Record<Difficulty, number[]>;

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
function Sudoku({ initialState, dailySeed, onState, onComplete }: GameProps) {
  const saved = initialState as { difficulty?: Difficulty; values?: number[]; notes?: number[][]; elapsed?: number } | undefined;
  const dailyDifficulty = dailySeed ? (['Easy', 'Medium', 'Hard', 'Expert'] as Difficulty[])[Number.parseInt(dailySeed.slice(0, 2), 16) % 4]! : undefined;
  const [difficulty, setDifficulty] = useState<Difficulty>(dailyDifficulty ?? saved?.difficulty ?? 'Easy');
  const givens = sudokuPuzzles[difficulty];
  const solution = useMemo(() => solveSudoku(givens)!, [difficulty]);
  const [values, setValues] = useState(saved?.values?.length === 81 ? saved.values : [...givens]);
  const [notes, setNotes] = useState<number[][]>(saved?.notes?.length === 81 ? saved.notes : Array.from({ length: 81 }, () => []));
  const [selected, setSelected] = useState(givens.findIndex((value) => !value));
  const [noteMode, setNoteMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(saved?.elapsed ?? 0);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  useEffect(() => { if (paused) return; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => clearInterval(timer); }, [paused]);

  const persist = (nextValues: number[], nextNotes: number[][]) => { setValues(nextValues); setNotes(nextNotes); onState({ difficulty, values: nextValues, notes: nextNotes, elapsed }); if (nextValues.every((value, index) => value === solution[index])) onComplete({ durationMs: elapsed * 1000 }); };
  const enter = (value: number) => {
    if (selected < 0 || givens[selected]) return;
    setHistory((items) => [...items.slice(-49), { values, notes }]); setFuture([]);
    const nextValues = [...values], nextNotes = notes.map((item) => [...item]);
    if (noteMode && value) nextNotes[selected] = nextNotes[selected]!.includes(value) ? nextNotes[selected]!.filter((item) => item !== value) : [...nextNotes[selected]!, value].sort();
    else { nextValues[selected] = value; nextNotes[selected] = []; if (value) for (let index = 0; index < 81; index += 1) if (Math.floor(index / 9) === Math.floor(selected / 9) || index % 9 === selected % 9 || (Math.floor(index / 27) === Math.floor(selected / 27) && Math.floor((index % 9) / 3) === Math.floor((selected % 9) / 3))) nextNotes[index] = nextNotes[index]!.filter((item) => item !== value); }
    persist(nextValues, nextNotes);
  };
  const reset = (nextDifficulty = difficulty) => { const next = [...sudokuPuzzles[nextDifficulty]]; setValues(next); setNotes(Array.from({ length: 81 }, () => [])); setHistory([]); setFuture([]); setElapsed(0); setSelected(next.findIndex((value) => !value)); onState({ difficulty: nextDifficulty, values: next, notes: Array.from({ length: 81 }, () => []), elapsed: 0 }); };
  const restore = (snapshot: Snapshot, target: 'undo' | 'redo') => { if (target === 'undo') { setFuture((items) => [...items, { values, notes }]); setHistory((items) => items.slice(0, -1)); } else { setHistory((items) => [...items, { values, notes }]); setFuture((items) => items.slice(0, -1)); } persist(snapshot.values, snapshot.notes); };
  const selectedValue = values[selected] ?? 0;

  return <section className="game-panel sudoku-panel" onKeyDown={(event) => { if (/^[1-9]$/.test(event.key)) enter(Number(event.key)); if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') enter(0); }}>
    <div className="game-toolbar"><label>Difficulty<select value={difficulty} onChange={(event) => { const next = event.target.value as Difficulty; setDifficulty(next); reset(next); }}><option>Easy</option><option>Medium</option><option>Hard</option><option>Expert</option></select></label><span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span><button className="text-button" onClick={() => setPaused((value) => !value)}>{paused ? 'Resume' : 'Pause'}</button></div>
    <div className="sudoku-wrap">{paused ? <div className="pause-card"><strong>Paused</strong><button onClick={() => setPaused(false)}>Resume</button></div> : <div className="sudoku-board" role="region" aria-label="Sudoku board">{values.map((value, index) => { const related = selected >= 0 && (Math.floor(index / 9) === Math.floor(selected / 9) || index % 9 === selected % 9); const wrong = value !== 0 && value !== solution[index]; return <button key={index} aria-label={`Row ${Math.floor(index / 9) + 1}, column ${index % 9 + 1}${value ? `, ${value}` : ', empty'}`} className={`${givens[index] ? 'given' : ''} ${selected === index ? 'selected' : ''} ${related ? 'related' : ''} ${wrong ? 'wrong' : ''} ${selectedValue && value === selectedValue ? 'same' : ''}`} onClick={() => setSelected(index)}>{value || <small>{notes[index]?.join(' ')}</small>}</button>; })}</div>}</div>
    <div className="number-pad" aria-label="Number pad">{Array.from({ length: 9 }, (_, index) => <button key={index + 1} onClick={() => enter(index + 1)}>{index + 1}</button>)}</div>
    <div className="game-actions wrap"><button className={noteMode ? '' : 'secondary'} aria-pressed={noteMode} onClick={() => setNoteMode((value) => !value)}>Notes</button><button className="secondary" disabled={!history.length} onClick={() => { const snapshot = history.at(-1); if (snapshot) restore(snapshot, 'undo'); }}>Undo</button><button className="secondary" disabled={!future.length} onClick={() => { const snapshot = future.at(-1); if (snapshot) restore(snapshot, 'redo'); }}>Redo</button><button className="secondary" onClick={() => { const index = values.findIndex((value, item) => !value && !givens[item]); if (index >= 0) { setSelected(index); const next = [...values]; next[index] = solution[index]!; persist(next, notes); } }}>Hint</button><button onClick={() => reset()}>New puzzle</button></div>
  </section>;
}

export const sudoku: GameManifest = { id: 'sudoku', name: 'Sudoku', description: 'Place numbers so every row, column, and box is complete.', category: 'logic', icon: '9', supportsResume: true, supportsDailyChallenge: true, controls: 'Keyboard or touch number pad', component: Sudoku };
