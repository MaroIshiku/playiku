import { useEffect, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

export type Board2048 = number[];
export type Direction = 'left' | 'right' | 'up' | 'down';

function collapse(line: number[]) {
  const values = line.filter(Boolean);
  const result: number[] = [];
  let score = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) { const merged = values[index]! * 2; result.push(merged); score += merged; index += 1; }
    else result.push(values[index]!);
  }
  return { line: [...result, ...Array(4 - result.length).fill(0)], score };
}

export function move2048(board: Board2048, direction: Direction) {
  const next = Array(16).fill(0) as number[];
  let score = 0;
  for (let outer = 0; outer < 4; outer += 1) {
    const indices = Array.from({ length: 4 }, (_, inner) => direction === 'left' ? outer * 4 + inner : direction === 'right' ? outer * 4 + (3 - inner) : direction === 'up' ? inner * 4 + outer : (3 - inner) * 4 + outer);
    const result = collapse(indices.map((index) => board[index]!));
    score += result.score;
    indices.forEach((index, inner) => { next[index] = result.line[inner]!; });
  }
  return { board: next, score, moved: next.some((value, index) => value !== board[index]) };
}

function spawn(board: Board2048, seed = Math.random()) {
  const empty = board.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
  if (!empty.length) return board;
  const next = [...board];
  next[empty[Math.floor(seed * empty.length)] ?? empty[0]!] = seed > .9 ? 4 : 2;
  return next;
}

const fresh = (seed?: string) => { const value = seed ? Number.parseInt(seed.slice(0, 8), 16) / 0xffffffff : undefined; return spawn(spawn(Array(16).fill(0), value ?? .13), value === undefined ? .72 : (value * 1.618) % 1); };

function Game2048({ initialState, dailySeed, onState, onComplete }: GameProps) {
  const restored = initialState as { board?: number[]; score?: number; best?: number } | undefined;
  const [board, setBoard] = useState<Board2048>(dailySeed ? fresh(dailySeed) : restored?.board?.length === 16 ? restored.board : fresh());
  const [score, setScore] = useState(restored?.score ?? 0);
  const [best, setBest] = useState(restored?.best ?? 0);
  const [history, setHistory] = useState<{ board: Board2048; score: number }[]>([]);
  const touch = useRef<{ x: number; y: number } | undefined>(undefined);

  const move = (direction: Direction) => {
    const result = move2048(board, direction);
    if (!result.moved) return;
    setHistory((items) => [...items.slice(-9), { board, score }]);
    const next = spawn(result.board);
    const nextScore = score + result.score;
    setBoard(next); setScore(nextScore); setBest(Math.max(best, nextScore));
    onState({ board: next, score: nextScore, best: Math.max(best, nextScore) });
    if (next.includes(2048) && !board.includes(2048)) onComplete({ score: nextScore });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const map: Record<string, Direction | undefined> = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
      const direction = map[event.key];
      if (direction) { event.preventDefault(); move(direction); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });

  return <section className="game-panel" aria-label="2048 game">
    <div className="score-row"><span>Score <strong>{score}</strong></span><span>Best <strong>{best}</strong></span></div>
    <div className="board board-2048" role="region" tabIndex={0} aria-label="2048 board. Use arrow keys or swipe."
      onTouchStart={(event) => { const point = event.touches[0]; if (point) touch.current = { x: point.clientX, y: point.clientY }; }}
      onTouchEnd={(event) => { const start = touch.current; const point = event.changedTouches[0]; if (!start || !point) return; const dx = point.clientX - start.x; const dy = point.clientY - start.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'); }}>
      {board.map((value, index) => <div className={`tile tile-${value || 'empty'}`} role="img" key={index} aria-label={value ? String(value) : 'Empty'}>{value || ''}</div>)}
    </div>
    <div className="game-actions"><button className="secondary" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setBoard(previous.board); setScore(previous.score); setHistory((items) => items.slice(0, -1)); onState({ ...previous, best }); } }}>Undo</button><button onClick={() => { const next = fresh(); setBoard(next); setScore(0); setHistory([]); onState({ board: next, score: 0, best }); }}>New game</button></div>
  </section>;
}

export const game2048: GameManifest = { id: '2048', name: '2048', description: 'Slide and merge matching tiles to reach 2048.', category: 'puzzle', icon: '2048', supportsResume: true, supportsDailyChallenge: true, controls: 'Arrow keys, WASD, or swipe', component: Game2048 };
