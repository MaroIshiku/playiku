import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

export type MineCell = { mine: boolean; open: boolean; flagged: boolean };
type Difficulty = 'Beginner' | 'Intermediate' | 'Expert' | 'Custom';
type BoardConfig = { width: number; height: number; mines: number };
type Outcome = 'playing' | 'won' | 'lost';
const presets: Record<Exclude<Difficulty, 'Custom'>, BoardConfig> = { Beginner: { width: 9, height: 9, mines: 10 }, Intermediate: { width: 16, height: 16, mines: 40 }, Expert: { width: 30, height: 16, mines: 99 } };

function rng(seed: number) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
export function neighbors(index: number, width: number, height: number) {
  const x = index % width, y = Math.floor(index / width), result: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const nx = x + dx, ny = y + dy;
    if ((dx || dy) && nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
  }
  return result;
}
export function createMinefield(width: number, height: number, mineCount: number, safeIndex: number, seed: number): MineCell[] {
  const random = rng(seed), cells = Array.from({ length: width * height }, () => ({ mine: false, open: false, flagged: false }));
  const safeZone = new Set([safeIndex, ...neighbors(safeIndex, width, height)]);
  const excluded = width * height - safeZone.size >= mineCount ? safeZone : new Set([safeIndex]);
  const candidates = cells.map((_, index) => index).filter((index) => !excluded.has(index));
  const placements = Math.min(mineCount, candidates.length);
  for (let placed = 0; placed < placements; placed += 1) { const pick = Math.floor(random() * candidates.length), index = candidates.splice(pick, 1)[0]!; cells[index]!.mine = true; }
  return cells;
}
export function revealCells(cells: MineCell[], index: number, width: number, height: number) {
  const next = cells.map((cell) => ({ ...cell })), queue = [index], seen = new Set<number>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current) || next[current]?.flagged) continue;
    seen.add(current); next[current]!.open = true;
    if (!next[current]!.mine && neighbors(current, width, height).every((item) => !next[item]!.mine)) queue.push(...neighbors(current, width, height));
  }
  return next;
}

type SavedMines = { difficulty?: Difficulty; custom?: BoardConfig; cells?: MineCell[]; seed?: number; seconds?: number; started?: boolean; outcome?: Outcome };
const emptyCells = (config: BoardConfig) => Array.from({ length: config.width * config.height }, () => ({ mine: false, open: false, flagged: false }));
const seedFromDaily = (value: string) => Number.parseInt(value.slice(0, 8), 16) >>> 0;
const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

function Minesweeper({ initialState, dailySeed, preferences, onState, onFinish }: GameProps) {
  const saved = initialState as SavedMines | undefined;
  const dailyDifficulty = dailySeed ? (['Beginner', 'Intermediate', 'Expert'] as const)[seedFromDaily(dailySeed) % 3]! : undefined;
  const initialDifficulty = dailyDifficulty ?? saved?.difficulty ?? preferences.minesweeperDifficulty;
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [custom, setCustom] = useState<BoardConfig>(saved?.custom ?? { width: 12, height: 12, mines: 20 });
  const config = difficulty === 'Custom' ? custom : presets[difficulty];
  const canRestore = !dailySeed && saved?.cells?.length === config.width * config.height;
  const [cells, setCells] = useState<MineCell[]>(canRestore ? saved!.cells! : emptyCells(config));
  const [seed, setSeed] = useState(dailySeed ? seedFromDaily(dailySeed) : saved?.seed ?? freshSeed());
  const [started, setStarted] = useState(Boolean(canRestore && saved?.started));
  const [outcome, setOutcome] = useState<Outcome>(canRestore ? saved?.outcome ?? 'playing' : 'playing');
  const [flagMode, setFlagMode] = useState(false);
  const [seconds, setSeconds] = useState(canRestore ? saved?.seconds ?? 0 : 0);
  const longPress = useRef<number | undefined>(undefined), didLongPress = useRef(false), finished = useRef(outcome !== 'playing');
  const flaggedCount = useMemo(() => cells.filter((cell) => cell.flagged).length, [cells]);

  const snapshot = (nextCells = cells, nextOutcome = outcome, nextStarted = started, nextSeconds = seconds) => ({ difficulty, custom, cells: nextCells, seed, seconds: nextSeconds, started: nextStarted, outcome: nextOutcome });
  useEffect(() => { if (!started || outcome !== 'playing') return; const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => clearInterval(timer); }, [started, outcome]);
  useEffect(() => { if (started && outcome === 'playing' && seconds > 0 && seconds % 5 === 0) onState(snapshot(cells, outcome, started, seconds)); }, [seconds]);

  const finish = (next: MineCell[], result: Exclude<Outcome, 'playing'>) => {
    const visible = result === 'lost' ? next.map((cell) => cell.mine ? { ...cell, open: true } : cell) : next;
    setCells(visible); setOutcome(result); onState(snapshot(visible, result, true));
    if (!finished.current) { finished.current = true; onFinish({ outcome: result, durationMs: seconds * 1000 }); }
  };
  const save = (next: MineCell[], nextStarted: boolean = true) => { setCells(next); setStarted(nextStarted); onState(snapshot(next, 'playing', nextStarted)); };
  const flag = (index: number) => { if (outcome !== 'playing' || cells[index]?.open || (!cells[index]?.flagged && flaggedCount >= config.mines)) return; const next = cells.map((cell) => ({ ...cell })); next[index]!.flagged = !next[index]!.flagged; save(next, started); };
  const open = (index: number) => {
    if (outcome !== 'playing' || cells[index]?.flagged) return;
    let working = cells, nextStarted = started;
    if (!started) { const generated = createMinefield(config.width, config.height, config.mines, index, seed); working = generated.map((cell, item) => ({ ...cell, flagged: cells[item]?.flagged ?? false })); nextStarted = true; setStarted(true); }
    if (working[index]?.open) {
      const around = neighbors(index, config.width, config.height), adjacentMines = around.filter((item) => working[item]!.mine).length;
      if (around.filter((item) => working[item]!.flagged).length !== adjacentMines) return;
      for (const item of around) if (!working[item]!.flagged) working = revealCells(working, item, config.width, config.height);
    } else working = revealCells(working, index, config.width, config.height);
    if (working.some((cell) => cell.mine && cell.open)) { finish(working, 'lost'); return; }
    if (working.every((cell) => cell.mine || cell.open)) { finish(working, 'won'); return; }
    save(working, nextStarted);
  };
  const reset = (sameSeed = false, nextDifficulty = difficulty, nextCustom = custom) => {
    const nextSeed = dailySeed ? seedFromDaily(dailySeed) : sameSeed ? seed : freshSeed(), nextConfig = nextDifficulty === 'Custom' ? nextCustom : presets[nextDifficulty];
    const next = emptyCells(nextConfig); finished.current = false; setDifficulty(nextDifficulty); setSeed(nextSeed); setStarted(false); setSeconds(0); setOutcome('playing'); setCells(next); setFlagMode(false);
    onState({ difficulty: nextDifficulty, custom: nextCustom, cells: next, seed: nextSeed, seconds: 0, started: false, outcome: 'playing' });
  };
  const updateCustom = (key: keyof BoardConfig, raw: number) => {
    const width = key === 'width' ? Math.min(30, Math.max(5, raw || 5)) : custom.width, height = key === 'height' ? Math.min(24, Math.max(5, raw || 5)) : custom.height;
    const mines = key === 'mines' ? Math.min(width * height - 1, Math.max(1, raw || 1)) : Math.min(custom.mines, width * height - 1), next = { width, height, mines };
    setCustom(next); reset(false, 'Custom', next);
  };
  const clearLongPress = () => clearTimeout(longPress.current);

  return <section className="game-panel mines-panel">
    <div className="game-toolbar"><label>Difficulty<select aria-label="Difficulty" value={difficulty} disabled={Boolean(dailySeed)} onChange={(event) => reset(false, event.target.value as Difficulty)}><option>Beginner</option><option>Intermediate</option><option>Expert</option><option>Custom</option></select></label>{difficulty === 'Custom' && <><label>Width<input aria-label="Custom width" type="number" min={5} max={30} value={custom.width} onChange={(event) => updateCustom('width', Number(event.target.value))} /></label><label>Height<input aria-label="Custom height" type="number" min={5} max={24} value={custom.height} onChange={(event) => updateCustom('height', Number(event.target.value))} /></label><label>Mines<input aria-label="Custom mines" type="number" min={1} max={custom.width * custom.height - 1} value={custom.mines} onChange={(event) => updateCustom('mines', Number(event.target.value))} /></label></>}<span aria-label={`${config.mines - flaggedCount} mines remaining`}>Flags {config.mines - flaggedCount}</span><span>Time {seconds}s</span></div>
    <div className="mine-scroll"><div className={`mine-board ${outcome !== 'playing' ? `is-${outcome}` : ''}`} style={{ gridTemplateColumns: `repeat(${config.width}, var(--mine-cell))` }} role="region" aria-label="Minesweeper board">
      {cells.map((cell, index) => { const adjacent = neighbors(index, config.width, config.height).filter((item) => cells[item]!.mine).length; return <button key={index} className={`mine-cell ${cell.open ? 'open' : ''} ${cell.mine && cell.open ? 'mine' : ''}`} aria-label={cell.open ? cell.mine ? 'Mine' : adjacent ? `${adjacent} adjacent mines` : 'Empty' : cell.flagged ? 'Flagged cell' : 'Hidden cell'} onContextMenu={(event) => { event.preventDefault(); flag(index); }} onPointerDown={(event) => { if (event.pointerType === 'mouse') return; didLongPress.current = false; longPress.current = window.setTimeout(() => { didLongPress.current = true; flag(index); }, 500); }} onPointerUp={(event) => { if (event.pointerType === 'mouse') return; clearLongPress(); if (didLongPress.current) return; if (flagMode) flag(index); else open(index); }} onPointerCancel={clearLongPress} onPointerLeave={clearLongPress} onClick={(event) => { if ((event.nativeEvent as PointerEvent).pointerType !== 'touch') open(index); }}>{cell.open ? cell.mine ? '×' : adjacent || '' : cell.flagged ? 'F' : ''}</button>; })}
    </div></div>
    {outcome !== 'playing' && <p className={`status-message ${outcome === 'won' ? 'success' : 'error'}`} role="status">{outcome === 'lost' ? 'Mine opened — try the same board again.' : 'Board cleared!'}</p>}
    <div className="game-actions wrap"><button className={flagMode ? '' : 'secondary'} aria-pressed={flagMode} disabled={outcome !== 'playing'} onClick={() => setFlagMode((value) => !value)}>Flag mode</button><button className="secondary" onClick={() => reset(true)}>Restart board</button><button onClick={() => reset(false)}>{dailySeed ? 'Restart daily board' : 'New board'}</button></div>
  </section>;
}

export const minesweeper: GameManifest = {
  id: 'minesweeper', name: 'Minesweeper', description: 'Clear the field without opening a mine.', category: 'logic', icon: 'M11 2h2v3.07A7.02 7.02 0 0 1 18.93 11H22v2h-3.07A7.02 7.02 0 0 1 13 18.93V22h-2v-3.07A7.02 7.02 0 0 1 5.07 13H2v-2h3.07A7.02 7.02 0 0 1 11 5.07V2Zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-2 3h4v4h-4v-4Z', supportsResume: true, supportsDailyChallenge: true, controls: 'Click, right-click, long press, or flag mode',
  tips: ['Your first opened cell is always safe, with a clear starting area whenever the mine density allows it.', 'Right-click a hidden cell to flag it, or use Flag mode on touch devices.', 'Open an already revealed number after placing the matching flags to clear its remaining neighbors.'], component: Minesweeper
};
