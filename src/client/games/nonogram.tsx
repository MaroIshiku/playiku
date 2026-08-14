import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

type Size = 5 | 10 | 15;
const numericSeed = (seed: string | number) => typeof seed === 'number' ? seed >>> 0 : Number.parseInt(seed.slice(0, 8), 16) >>> 0;
const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
function randomFor(seed: string | number) { let value = numericSeed(seed) || 0x9e3779b9; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
export function createNonogramPicture(size: Size, seed: string | number) {
  const random = randomFor(seed), result = Array(size * size).fill(0) as number[], middle = Math.floor(size / 2);
  for (let y = 0; y < size; y += 1) for (let x = 0; x <= middle; x += 1) {
    const edgePenalty = x === 0 || y === 0 || y === size - 1 ? .14 : 0, filled = random() < .46 - edgePenalty ? 1 : 0;
    result[y * size + x] = filled; result[y * size + (size - 1 - x)] = random() < .82 ? filled : Number(random() < .38);
  }
  for (let y = 0; y < size; y += 1) if (!result.slice(y * size, (y + 1) * size).some(Boolean)) result[y * size + ((middle + y) % size)] = 1;
  for (let x = 0; x < size; x += 1) if (!Array.from({ length: size }, (_, y) => result[y * size + x]).some(Boolean)) result[((middle + x) % size) * size + x] = 1;
  return result;
}
function legacyPicture(size: Size) {
  if (size === 5) return ['01110', '11111', '11111', '01110', '00100'].flatMap((row) => [...row].map(Number));
  return Array.from({ length: size * size }, (_, index) => { const x = index % size, y = Math.floor(index / size), center = (size - 1) / 2; return Number(Math.abs(x - center) + Math.abs(y - center) < size * .55 || (x + y) % (size === 10 ? 7 : 9) === 0); });
}
export function lineClues(line: number[]) { const result: number[] = []; let run = 0; for (const value of line) { if (value) run += 1; else if (run) { result.push(run); run = 0; } } if (run) result.push(run); return result.length ? result : [0]; }

type SavedNonogram = { size?: Size; marks?: number[]; elapsed?: number; puzzleSeed?: number; generatorVersion?: 1 | 2; completed?: boolean };
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function Nonogram({ initialState, dailySeed, preferences, onState, onFinish }: GameProps) {
  const saved = initialState as SavedNonogram | undefined, dailyValue = dailySeed ? numericSeed(dailySeed) : undefined;
  const initialSize = dailyValue === undefined ? saved?.size ?? preferences.nonogramSize : ([5, 10, 15] as Size[])[dailyValue % 3]!;
  const canRestore = !dailySeed && saved?.marks?.length === initialSize * initialSize;
  const [size, setSize] = useState<Size>(initialSize), [puzzleSeed, setPuzzleSeed] = useState(dailyValue ?? saved?.puzzleSeed ?? newSeed()), [generatorVersion, setGeneratorVersion] = useState<1 | 2>(canRestore && saved?.puzzleSeed === undefined ? 1 : saved?.generatorVersion ?? 2);
  const solution = useMemo(() => generatorVersion === 1 ? legacyPicture(size) : createNonogramPicture(size, puzzleSeed), [size, puzzleSeed, generatorVersion]);
  const [marks, setMarks] = useState<number[]>(canRestore ? saved!.marks! : Array(size * size).fill(0));
  const [mode, setMode] = useState<1 | 2>(1), [history, setHistory] = useState<number[][]>([]), [future, setFuture] = useState<number[][]>([]);
  const [elapsed, setElapsed] = useState(canRestore ? saved?.elapsed ?? 0 : 0), [paused, setPaused] = useState(false), [completed, setCompleted] = useState(canRestore ? Boolean(saved?.completed) : false);
  const [selected, setSelected] = useState(0), cells = useRef<Array<HTMLButtonElement | null>>([]), finished = useRef(completed), marksRef = useRef(marks), dragValue = useRef<number | undefined>(undefined);
  const state = (nextMarks = marks, nextElapsed = elapsed, nextCompleted = completed) => ({ size, puzzleSeed, generatorVersion, marks: nextMarks, elapsed: nextElapsed, completed: nextCompleted });
  useEffect(() => { if (paused || completed) return; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => clearInterval(timer); }, [paused, completed]);
  useEffect(() => { if (elapsed > 0 && elapsed % 5 === 0 && !completed) onState(state(marks, elapsed)); }, [elapsed]);
  useEffect(() => { marksRef.current = marks; }, [marks]);
  useEffect(() => { const stop = () => { dragValue.current = undefined; }; window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); }; }, []);

  const rowClues = Array.from({ length: size }, (_, row) => lineClues(solution.slice(row * size, (row + 1) * size)));
  const columnClues = Array.from({ length: size }, (_, column) => lineClues(Array.from({ length: size }, (_, row) => solution[row * size + column]!)));
  const lineMatches = (indices: number[]) => indices.every((index) => marks[index] !== 0 && (marks[index] === 1) === Boolean(solution[index]));
  const rowDone = (row: number) => lineMatches(Array.from({ length: size }, (_, column) => row * size + column));
  const columnDone = (column: number) => lineMatches(Array.from({ length: size }, (_, row) => row * size + column));
  const remember = () => { setHistory((items) => [...items.slice(-49), [...marksRef.current]]); setFuture([]); };
  const persist = (candidate: number[]) => {
    const solved = solution.every((value, index) => value ? candidate[index] === 1 : candidate[index] !== 1);
    const next = solved ? candidate.map((mark, index) => mark || (solution[index] ? 1 : 2)) : candidate;
    marksRef.current = next; setMarks(next);
    if (solved) {
      setCompleted(true); onState(state(next, elapsed, true));
      if (!finished.current) { finished.current = true; onFinish({ outcome: 'won', durationMs: elapsed * 1000 }); }
    } else onState(state(next, elapsed, false));
  };
  const mark = (index: number, nextMode = mode, addHistory = true) => {
    if (paused || completed) return; if (addHistory) remember(); setSelected(index);
    const next = [...marksRef.current]; next[index] = next[index] === nextMode ? 0 : nextMode; persist(next);
  };
  const paint = (index: number, value: number) => { if (paused || completed || marksRef.current[index] === value) return; const next = [...marksRef.current]; next[index] = value; setSelected(index); persist(next); };
  const reset = (nextSize = size) => {
    const nextSeed = dailyValue ?? newSeed(), next = Array(nextSize * nextSize).fill(0);
    finished.current = false; setSize(nextSize); setPuzzleSeed(nextSeed); setGeneratorVersion(2); setMarks(next); setHistory([]); setFuture([]); setElapsed(0); setPaused(false); setCompleted(false); setSelected(0);
    onState({ size: nextSize, puzzleSeed: nextSeed, generatorVersion: 2, marks: next, elapsed: 0, completed: false });
  };
  const moveSelection = (dx: number, dy: number) => { const row = Math.floor(selected / size), column = selected % size, next = ((row + dy + size) % size) * size + ((column + dx + size) % size); setSelected(next); cells.current[next]?.focus(); };

  return <section className="game-panel nonogram-panel" onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelection(-1, 0); } else if (event.key === 'ArrowRight') { event.preventDefault(); moveSelection(1, 0); } else if (event.key === 'ArrowUp') { event.preventDefault(); moveSelection(0, -1); } else if (event.key === 'ArrowDown') { event.preventDefault(); moveSelection(0, 1); } }}>
    <div className="game-toolbar"><label>Size<select value={size} disabled={Boolean(dailySeed)} onChange={(event) => reset(Number(event.target.value) as Size)}><option value={5}>5 × 5</option><option value={10}>10 × 10</option><option value={15}>15 × 15</option></select></label><span aria-label={`${elapsed} seconds elapsed`}>{formatTime(elapsed)}</span><button className="text-button" disabled={completed} onClick={() => setPaused((value) => !value)}>{paused ? 'Resume' : 'Pause'}</button></div>
    {paused ? <div className="pause-card"><strong>Paused</strong><button onClick={() => setPaused(false)}>Resume</button></div> : <div className="nonogram-scroll"><div className={`nonogram-grid ${completed ? 'is-complete' : ''}`} role="region" aria-label="Nonogram board" style={{ gridTemplateColumns: `minmax(3.5rem, auto) repeat(${size}, var(--nono-cell))` }}>
      <span />{columnClues.map((clue, column) => <span className={columnDone(column) ? 'clue done' : 'clue'} aria-label={`Column ${column + 1}: ${clue.join(', ')}`} key={`c${column}`}>{clue.join(' ')}</span>)}
      {Array.from({ length: size }, (_, row) => <span className="nonogram-row" key={`r${row}`}><span className={rowDone(row) ? 'clue done' : 'clue'} aria-label={`Row ${row + 1}: ${rowClues[row]!.join(', ')}`}>{rowClues[row]!.join(' ')}</span>{Array.from({ length: size }, (_, column) => { const index = row * size + column; return <button ref={(node) => { cells.current[index] = node; }} tabIndex={selected === index ? 0 : -1} key={index} aria-pressed={marks[index] === 1} aria-label={`Row ${row + 1}, column ${column + 1}, ${marks[index] === 1 ? 'filled' : marks[index] === 2 ? 'marked empty' : 'unknown'}`} className={`nono-cell mark-${marks[index]}`} onFocus={() => setSelected(index)} onClick={(event) => { if (event.detail === 0) mark(index); }} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); remember(); const value = marksRef.current[index] === mode ? 0 : mode; dragValue.current = value; paint(index, value); }} onPointerEnter={() => { if (dragValue.current !== undefined) paint(index, dragValue.current); }} onContextMenu={(event) => { event.preventDefault(); mark(index, 2); }}>{marks[index] === 2 ? '×' : ''}</button>; })}</span>)}
    </div></div>}
    {completed && <p className="status-message success" role="status">Picture complete!</p>}
    <div className="game-actions wrap"><button className={mode === 1 ? '' : 'secondary'} aria-pressed={mode === 1} disabled={completed} onClick={() => setMode(1)}>Fill</button><button className={mode === 2 ? '' : 'secondary'} aria-pressed={mode === 2} disabled={completed} onClick={() => setMode(2)}>Mark empty</button><button className="secondary" disabled={!history.length || completed} onClick={() => { const previous = history.at(-1); if (previous) { setFuture((items) => [...items, marks]); setHistory((items) => items.slice(0, -1)); persist(previous); } }}>Undo</button><button className="secondary" disabled={!future.length || completed} onClick={() => { const next = future.at(-1); if (next) { setHistory((items) => [...items, marks]); setFuture((items) => items.slice(0, -1)); persist(next); } }}>Redo</button><button className="secondary" disabled={completed} onClick={() => { const index = solution.findIndex((value, item) => value ? marks[item] !== 1 : marks[item] === 1); if (index >= 0) { remember(); const next = [...marks]; next[index] = solution[index] ? 1 : 2; persist(next); } }}>Hint</button><button onClick={() => reset()}>{dailySeed ? 'Restart daily puzzle' : 'New puzzle'}</button></div>
  </section>;
}

export const nonogram: GameManifest = {
  id: 'nonogram', name: 'Nonogram', description: 'Reveal a tiny picture using row and column clues.', category: 'logic', icon: 'M3 3h18v18H3V3Zm2 2v4h4V5H5Zm5 0v4h4V5h-4Zm5 0v4h4V5h-4ZM5 10v4h4v-4H5Zm5 0v4h4v-4h-4Zm5 0v4h4v-4h-4ZM5 15v4h4v-4H5Zm5 0v4h4v-4h-4Zm5 0v4h4v-4h-4Z', supportsResume: true, supportsDailyChallenge: true, controls: 'Tap to fill; right-click or mark mode for empty',
  tips: ['Each clue is a run of filled cells; separate multiple runs with at least one empty cell.', 'Mark confirmed empty cells to make completed rows and columns easier to read.', 'Drag across cells to paint quickly, or use arrow keys to move around the grid.'], component: Nonogram
};
