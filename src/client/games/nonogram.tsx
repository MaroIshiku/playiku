import { useEffect, useMemo, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

type Size = 5 | 10 | 15;
function picture(size: Size, variant = 0) {
  if (size === 5) return ['01110', '11111', '11111', '01110', '00100'].flatMap((row) => [...row].map(Number));
  return Array.from({ length: size * size }, (_, index) => { const x = index % size, y = Math.floor(index / size), center = (size - 1) / 2; return Number(Math.abs(x - center) + Math.abs(y - center) < size * .55 || (x + y + variant) % (size === 10 ? 7 : 9) === 0); });
}
export function lineClues(line: number[]) { const result: number[] = []; let run = 0; for (const value of line) { if (value) run += 1; else if (run) { result.push(run); run = 0; } } if (run) result.push(run); return result.length ? result : [0]; }

function Nonogram({ initialState, dailySeed, onState, onComplete }: GameProps) {
  const saved = initialState as { size?: Size; marks?: number[]; elapsed?: number } | undefined;
  const [size, setSize] = useState<Size>(saved?.size ?? 5);
  const variant = dailySeed ? Number.parseInt(dailySeed.slice(0, 4), 16) : 0;
  const solution = useMemo(() => picture(size, variant), [size, variant]);
  const [marks, setMarks] = useState<number[]>(saved?.marks?.length === size * size ? saved.marks : Array(size * size).fill(0));
  const [mode, setMode] = useState<1 | 2>(1);
  const [history, setHistory] = useState<number[][]>([]);
  const [future, setFuture] = useState<number[][]>([]);
  const [elapsed, setElapsed] = useState(saved?.elapsed ?? 0);
  useEffect(() => { const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => clearInterval(timer); }, []);
  const rowClues = Array.from({ length: size }, (_, row) => lineClues(solution.slice(row * size, (row + 1) * size)));
  const columnClues = Array.from({ length: size }, (_, column) => lineClues(Array.from({ length: size }, (_, row) => solution[row * size + column]!)));
  const rowDone = (row: number) => solution.slice(row * size, (row + 1) * size).every((value, column) => (marks[row * size + column] === 1) === Boolean(value));
  const columnDone = (column: number) => Array.from({ length: size }, (_, row) => solution[row * size + column]).every((value, row) => (marks[row * size + column] === 1) === Boolean(value));
  const persist = (next: number[]) => { setMarks(next); onState({ size, marks: next, elapsed }); const won = solution.every((value, index) => (next[index] === 1) === Boolean(value)); if (won) onComplete({ durationMs: elapsed * 1000 }); };
  const mark = (index: number, nextMode = mode) => { setHistory((items) => [...items.slice(-49), marks]); setFuture([]); const next = [...marks]; next[index] = next[index] === nextMode ? 0 : nextMode; persist(next); };
  const reset = (nextSize = size) => { const next = Array(nextSize * nextSize).fill(0); setMarks(next); setHistory([]); setFuture([]); setElapsed(0); onState({ size: nextSize, marks: next, elapsed: 0 }); };

  return <section className="game-panel nonogram-panel">
    <div className="game-toolbar"><label>Size<select value={size} onChange={(event) => { const next = Number(event.target.value) as Size; setSize(next); reset(next); }}><option value={5}>5 × 5</option><option value={10}>10 × 10</option><option value={15}>15 × 15</option></select></label><span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div>
    <div className="nonogram-scroll"><div className="nonogram-grid" role="region" aria-label="Nonogram board" style={{ gridTemplateColumns: `minmax(3.5rem, auto) repeat(${size}, var(--nono-cell))` }}>
      <span />{columnClues.map((clue, column) => <span className={columnDone(column) ? 'clue done' : 'clue'} key={`c${column}`}>{clue.join(' ')}</span>)}
      {Array.from({ length: size }, (_, row) => <span className="nonogram-row" key={`r${row}`}><span className={rowDone(row) ? 'clue done' : 'clue'}>{rowClues[row]!.join(' ')}</span>{Array.from({ length: size }, (_, column) => { const index = row * size + column; return <button key={index} aria-label={`Row ${row + 1}, column ${column + 1}, ${marks[index] === 1 ? 'filled' : marks[index] === 2 ? 'marked empty' : 'unknown'}`} className={`nono-cell mark-${marks[index]}`} onClick={() => mark(index)} onContextMenu={(event) => { event.preventDefault(); mark(index, 2); }}>{marks[index] === 2 ? '×' : ''}</button>; })}</span>)}
    </div></div>
    <div className="game-actions wrap"><button className={mode === 1 ? '' : 'secondary'} aria-pressed={mode === 1} onClick={() => setMode(1)}>Fill</button><button className={mode === 2 ? '' : 'secondary'} aria-pressed={mode === 2} onClick={() => setMode(2)}>Mark empty</button><button className="secondary" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setFuture((items) => [...items, marks]); setHistory((items) => items.slice(0, -1)); persist(previous); } }}>Undo</button><button className="secondary" disabled={!future.length} onClick={() => { const next = future.at(-1); if (next) { setHistory((items) => [...items, marks]); setFuture((items) => items.slice(0, -1)); persist(next); } }}>Redo</button><button className="secondary" onClick={() => { const index = solution.findIndex((value, item) => (marks[item] === 1) !== Boolean(value)); if (index >= 0) { const next = [...marks]; next[index] = solution[index] ? 1 : 2; persist(next); } }}>Hint</button><button onClick={() => reset()}>New puzzle</button></div>
  </section>;
}

export const nonogram: GameManifest = { id: 'nonogram', name: 'Nonogram', description: 'Reveal a tiny picture using row and column clues.', category: 'logic', icon: '▦', supportsResume: true, supportsDailyChallenge: true, controls: 'Tap to fill; right-click or mark mode for empty', component: Nonogram };
