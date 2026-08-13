import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

type Cell = { mine: boolean; open: boolean; flagged: boolean };
type Difficulty = 'Beginner' | 'Intermediate' | 'Expert' | 'Custom';
type BoardConfig = { width: number; height: number; mines: number };
const presets: Record<Exclude<Difficulty, 'Custom'>, BoardConfig> = { Beginner: { width: 9, height: 9, mines: 10 }, Intermediate: { width: 16, height: 16, mines: 40 }, Expert: { width: 30, height: 16, mines: 99 } };

function rng(seed: number) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
export function createMinefield(width: number, height: number, mineCount: number, safeIndex: number, seed: number): Cell[] {
  const random = rng(seed);
  const cells = Array.from({ length: width * height }, () => ({ mine: false, open: false, flagged: false }));
  const candidates = cells.map((_, index) => index).filter((index) => index !== safeIndex);
  for (let placed = 0; placed < Math.min(mineCount, candidates.length); placed += 1) {
    const pick = Math.floor(random() * candidates.length);
    const index = candidates.splice(pick, 1)[0]!;
    cells[index]!.mine = true;
  }
  return cells;
}

export function neighbors(index: number, width: number, height: number) {
  const x = index % width, y = Math.floor(index / width), result: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const nx = x + dx, ny = y + dy;
    if ((dx || dy) && nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
  }
  return result;
}

export function revealCells(cells: Cell[], index: number, width: number, height: number) {
  const next = cells.map((cell) => ({ ...cell }));
  const queue = [index], seen = new Set<number>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current) || next[current]?.flagged) continue;
    seen.add(current); next[current]!.open = true;
    if (!next[current]!.mine && neighbors(current, width, height).every((item) => !next[item]!.mine)) queue.push(...neighbors(current, width, height));
  }
  return next;
}

function Minesweeper({ initialState, dailySeed, onState, onComplete }: GameProps) {
  const saved = initialState as { difficulty?: Difficulty; custom?: BoardConfig; cells?: Cell[]; seed?: number; startedAt?: number; ended?: boolean } | undefined;
  const [difficulty, setDifficulty] = useState<Difficulty>(saved?.difficulty ?? 'Beginner');
  const [custom, setCustom] = useState<BoardConfig>(saved?.custom ?? { width: 12, height: 12, mines: 20 });
  const config = difficulty === 'Custom' ? custom : presets[difficulty];
  const [cells, setCells] = useState<Cell[]>(saved?.cells?.length === config.width * config.height ? saved.cells : Array.from({ length: config.width * config.height }, () => ({ mine: false, open: false, flagged: false })));
  const [seed, setSeed] = useState(dailySeed ? Number.parseInt(dailySeed.slice(0, 8), 16) : saved?.seed ?? Date.now());
  const [startedAt, setStartedAt] = useState(saved?.startedAt ?? 0);
  const [ended, setEnded] = useState(saved?.ended ?? false);
  const [flagMode, setFlagMode] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const longPress = useRef<number | undefined>(undefined);
  const didLongPress = useRef(false);
  const mineCount = useMemo(() => cells.filter((cell) => cell.flagged).length, [cells]);

  useEffect(() => { if (!startedAt || ended) return; const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000); return () => clearInterval(timer); }, [startedAt, ended]);

  const save = (next: Cell[], nextEnded = ended, start = startedAt || Date.now()) => { setCells(next); setStartedAt(start); setEnded(nextEnded); onState({ difficulty, custom, cells: next, seed, startedAt: start, ended: nextEnded }); };
  const flag = (index: number) => { if (ended || cells[index]?.open) return; const next = cells.map((cell) => ({ ...cell })); next[index]!.flagged = !next[index]!.flagged; save(next); };
  const open = (index: number) => {
    if (ended || cells[index]?.flagged) return;
    let working = cells;
    if (!startedAt) working = createMinefield(config.width, config.height, config.mines, index, seed);
    if (working[index]?.open) {
      const around = neighbors(index, config.width, config.height);
      if (around.filter((item) => working[item]!.flagged).length === around.filter((item) => working[item]!.mine).length) working = around.reduce((current, item) => current[item]!.flagged ? current : revealCells(current, item, config.width, config.height), working);
    } else working = revealCells(working, index, config.width, config.height);
    if (working[index]!.mine) { working = working.map((cell) => cell.mine ? { ...cell, open: true } : cell); save(working, true); return; }
    const won = working.every((cell) => cell.mine || cell.open);
    save(working, won);
    if (won) onComplete({ durationMs: Date.now() - (startedAt || Date.now()) });
  };
  const reset = (sameSeed = false, nextDifficulty = difficulty, nextCustom = custom) => { const nextSeed = sameSeed ? seed : Date.now(), nextConfig = nextDifficulty === 'Custom' ? nextCustom : presets[nextDifficulty]; setSeed(nextSeed); setStartedAt(0); setSeconds(0); setEnded(false); const next = Array.from({ length: nextConfig.width * nextConfig.height }, () => ({ mine: false, open: false, flagged: false })); setCells(next); onState({ difficulty: nextDifficulty, custom: nextCustom, cells: next, seed: nextSeed, startedAt: 0, ended: false }); };
  const updateCustom = (key: keyof BoardConfig, raw: number) => { const width = key === 'width' ? Math.min(30, Math.max(5, raw || 5)) : custom.width, height = key === 'height' ? Math.min(24, Math.max(5, raw || 5)) : custom.height; const mines = key === 'mines' ? Math.min(width * height - 1, Math.max(1, raw || 1)) : Math.min(custom.mines, width * height - 1); const next = { width, height, mines }; setCustom(next); setDifficulty('Custom'); reset(false, 'Custom', next); };

  return <section className="game-panel mines-panel">
    <div className="game-toolbar"><label>Difficulty<select value={difficulty} onChange={(event) => { const value = event.target.value as Difficulty; setDifficulty(value); reset(false, value); }}><option>Beginner</option><option>Intermediate</option><option>Expert</option><option>Custom</option></select></label>{difficulty === 'Custom' && <><label>Width<input aria-label="Custom width" type="number" min={5} max={30} value={custom.width} onChange={(event) => updateCustom('width', Number(event.target.value))} /></label><label>Height<input aria-label="Custom height" type="number" min={5} max={24} value={custom.height} onChange={(event) => updateCustom('height', Number(event.target.value))} /></label><label>Mines<input aria-label="Custom mines" type="number" min={1} max={custom.width * custom.height - 1} value={custom.mines} onChange={(event) => updateCustom('mines', Number(event.target.value))} /></label></>}<span aria-label={`${config.mines - mineCount} mines remaining`}>⚑ {config.mines - mineCount}</span><span>Time {seconds}s</span></div>
    <div className="mine-scroll"><div className="mine-board" style={{ gridTemplateColumns: `repeat(${config.width}, var(--mine-cell))` }} role="region" aria-label="Minesweeper board">
      {cells.map((cell, index) => { const adjacent = neighbors(index, config.width, config.height).filter((item) => cells[item]!.mine).length; return <button key={index} className={`mine-cell ${cell.open ? 'open' : ''}`} aria-label={cell.open ? cell.mine ? 'Mine' : adjacent ? `${adjacent} adjacent mines` : 'Empty' : cell.flagged ? 'Flagged cell' : 'Hidden cell'} onContextMenu={(event) => { event.preventDefault(); flag(index); }} onPointerDown={() => { didLongPress.current = false; longPress.current = window.setTimeout(() => { didLongPress.current = true; flag(index); }, 500); }} onPointerUp={() => { clearTimeout(longPress.current); if (didLongPress.current) return; if (flagMode) flag(index); else open(index); }}>{cell.open ? cell.mine ? '✹' : adjacent || '' : cell.flagged ? '⚑' : ''}</button>; })}
    </div></div>
    {ended && <p className="status-message" role="status">{cells.some((cell) => cell.mine && cell.open) && !cells.every((cell) => cell.mine || cell.open) ? 'Mine opened — try again.' : 'Board cleared!'}</p>}
    <div className="game-actions"><button className={flagMode ? '' : 'secondary'} aria-pressed={flagMode} onClick={() => setFlagMode((value) => !value)}>Flag mode</button><button className="secondary" onClick={() => reset(true)}>Restart board</button><button onClick={() => reset(false)}>New board</button></div>
  </section>;
}

export const minesweeper: GameManifest = { id: 'minesweeper', name: 'Minesweeper', description: 'Clear the field without opening a mine.', category: 'logic', icon: '✹', supportsResume: true, supportsDailyChallenge: true, controls: 'Click, right-click, long press, or flag mode', component: Minesweeper };
