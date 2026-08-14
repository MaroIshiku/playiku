import { useEffect, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

export type Board2048 = number[];
export type Direction = 'left' | 'right' | 'up' | 'down';

function collapse(line: number[]) {
  const values = line.filter(Boolean), result: number[] = []; let score = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) { const merged = values[index]! * 2; result.push(merged); score += merged; index += 1; }
    else result.push(values[index]!);
  }
  return { line: [...result, ...Array(4 - result.length).fill(0)], score };
}
export function move2048(board: Board2048, direction: Direction) {
  const next = Array(16).fill(0) as number[]; let score = 0;
  for (let outer = 0; outer < 4; outer += 1) {
    const indices = Array.from({ length: 4 }, (_, inner) => direction === 'left' ? outer * 4 + inner : direction === 'right' ? outer * 4 + (3 - inner) : direction === 'up' ? inner * 4 + outer : (3 - inner) * 4 + outer);
    const result = collapse(indices.map((index) => board[index]!)); score += result.score;
    indices.forEach((index, inner) => { next[index] = result.line[inner]!; });
  }
  return { board: next, score, moved: next.some((value, index) => value !== board[index]) };
}
const nextRandom = (state: number) => { const next = (state * 1664525 + 1013904223) >>> 0; return { state: next, value: next / 4294967296 }; };
export function spawn2048(board: Board2048, rngState: number) {
  const empty = board.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
  if (!empty.length) return { board, rngState };
  const position = nextRandom(rngState), number = nextRandom(position.state), next = [...board];
  next[empty[Math.floor(position.value * empty.length)] ?? empty[0]!] = number.value < .9 ? 2 : 4;
  return { board: next, rngState: number.state };
}
export function is2048GameOver(board: Board2048) { return (['left', 'right', 'up', 'down'] as Direction[]).every((direction) => !move2048(board, direction).moved); }
function fresh(seed: number) { const first = spawn2048(Array(16).fill(0), seed || 0x9e3779b9), second = spawn2048(first.board, first.rngState); return { board: second.board, rngState: second.rngState }; }
const randomSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
const dailyNumber = (seed: string) => Number.parseInt(seed.slice(0, 8), 16) >>> 0;
type GameState2048 = { board: Board2048; score: number; best: number; rngState: number; reached2048: boolean; gameOver: boolean };

function Game2048({ initialState, dailySeed, bestScore = 0, onState, onFinish }: GameProps) {
  const restored = initialState as Partial<GameState2048> | undefined, seed = dailySeed ? dailyNumber(dailySeed) : randomSeed(), initial = fresh(seed);
  const canRestore = !dailySeed && restored?.board?.length === 16;
  const [board, setBoard] = useState<Board2048>(canRestore ? restored!.board! : initial.board);
  const [rngState, setRngState] = useState(canRestore && typeof restored?.rngState === 'number' ? restored.rngState : initial.rngState);
  const [score, setScore] = useState(canRestore ? restored?.score ?? 0 : 0);
  const [best, setBest] = useState(Math.max(bestScore, canRestore ? restored?.best ?? 0 : 0));
  const [reached2048, setReached2048] = useState(canRestore ? Boolean(restored?.reached2048) : false);
  const [gameOver, setGameOver] = useState(canRestore ? Boolean(restored?.gameOver) : false);
  const [history, setHistory] = useState<GameState2048[]>([]), [turn, setTurn] = useState(0), [lastDirection, setLastDirection] = useState<Direction>();
  const touch = useRef<{ x: number; y: number } | undefined>(undefined), moveRef = useRef<(direction: Direction) => void>(() => undefined), finished = useRef(canRestore && (Boolean(restored?.reached2048) || Boolean(restored?.gameOver)));

  const persist = (next: GameState2048) => onState(next);
  const move = (direction: Direction) => {
    if (gameOver) return;
    const result = move2048(board, direction); if (!result.moved) return;
    setHistory((items) => [...items.slice(-19), { board, score, best, rngState, reached2048, gameOver }]);
    const spawned = spawn2048(result.board, rngState), nextScore = score + result.score, nextBest = Math.max(best, nextScore), nextReached = reached2048 || spawned.board.includes(2048), nextOver = is2048GameOver(spawned.board);
    setBoard(spawned.board); setRngState(spawned.rngState); setScore(nextScore); setBest(nextBest); setReached2048(nextReached); setGameOver(nextOver); setLastDirection(direction); setTurn((value) => value + 1);
    persist({ board: spawned.board, score: nextScore, best: nextBest, rngState: spawned.rngState, reached2048: nextReached, gameOver: nextOver });
    if (!reached2048 && nextReached && !finished.current) { finished.current = true; onFinish({ outcome: 'won', score: nextScore }); }
    else if (nextOver && !nextReached && !finished.current) { finished.current = true; onFinish({ outcome: 'lost', score: nextScore }); }
  };
  moveRef.current = move;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const map: Record<string, Direction | undefined> = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' }, direction = map[event.key];
      if (direction) { event.preventDefault(); moveRef.current(direction); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  const reset = () => {
    const nextSeed = dailySeed ? dailyNumber(dailySeed) : randomSeed(), next = fresh(nextSeed);
    finished.current = false; setBoard(next.board); setRngState(next.rngState); setScore(0); setReached2048(false); setGameOver(false); setHistory([]); setLastDirection(undefined); setTurn((value) => value + 1);
    persist({ board: next.board, score: 0, best, rngState: next.rngState, reached2048: false, gameOver: false });
  };

  return <section className="game-panel" aria-label="2048 game">
    <div className="score-row"><span>Score <strong>{score}</strong></span><span>Best <strong>{best}</strong></span></div>
    <div className={`board board-2048 ${gameOver ? 'is-over' : ''}`} role="region" tabIndex={0} aria-label="2048 board. Use arrow keys or swipe."
      onTouchStart={(event) => { const point = event.touches[0]; if (point) touch.current = { x: point.clientX, y: point.clientY }; }}
      onTouchEnd={(event) => { const start = touch.current, point = event.changedTouches[0]; if (!start || !point) return; const dx = point.clientX - start.x, dy = point.clientY - start.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'); touch.current = undefined; }}>
      {board.map((value, index) => <div className={`tile tile-${value || 'empty'} ${value ? `tile-pop tile-move-${lastDirection ?? 'none'}` : ''}`} role="img" key={`${index}-${value}-${turn}`} aria-label={value ? String(value) : 'Empty'}>{value || ''}</div>)}
    </div>
    {reached2048 && !gameOver && <p className="status-message success" role="status">2048 reached — keep going for a higher score!</p>}
    {gameOver && <p className={`status-message ${reached2048 ? 'success' : 'error'}`} role="status">{reached2048 ? `Finished with ${score} points.` : 'No moves left — try a new board.'}</p>}
    <div className="game-actions"><button className="secondary" disabled={!history.length || gameOver} onClick={() => { const previous = history.at(-1); if (!previous) return; setBoard(previous.board); setScore(previous.score); setBest(previous.best); setRngState(previous.rngState); setReached2048(previous.reached2048); setGameOver(false); setHistory((items) => items.slice(0, -1)); setTurn((value) => value + 1); persist({ ...previous, gameOver: false }); }}>Undo</button><button onClick={reset}>{dailySeed ? 'Restart daily game' : 'New game'}</button></div>
  </section>;
}

export const game2048: GameManifest = {
  id: '2048', name: '2048', description: 'Slide and merge matching tiles to reach 2048.', category: 'puzzle', icon: 'M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm8-2h8v8h-8v-8Zm2 2v4h4v-4h-4Z', supportsResume: true, supportsDailyChallenge: true, controls: 'Arrow keys, WASD, or swipe',
  tips: ['Every move slides all tiles; equal neighbors merge once per move.', 'Keep your largest tile in a corner and build orderly rows toward it.', 'Undo restores the exact board and random sequence, including in the Daily challenge.'], component: Game2048
};
