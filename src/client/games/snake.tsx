import { useEffect, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

export type SnakeDirection = 'up' | 'down' | 'left' | 'right';
const delta: Record<SnakeDirection, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const opposite: Record<SnakeDirection, SnakeDirection> = { up: 'down', down: 'up', left: 'right', right: 'left' };
export function stepSnake(body: number[], direction: SnakeDirection, size: number, food: number) {
  const head = body[0]!, x = head % size, y = Math.floor(head / size), [dx, dy] = delta[direction], nx = x + dx, ny = y + dy;
  if (nx < 0 || nx >= size || ny < 0 || ny >= size) return { body, ate: false, dead: true };
  const nextHead = ny * size + nx, ate = nextHead === food, collisionBody = ate ? body : body.slice(0, -1);
  if (collisionBody.includes(nextHead)) return { body, ate: false, dead: true };
  return { body: [nextHead, ...body.slice(0, ate ? body.length : body.length - 1)], ate, dead: false };
}
function newFood(body: number[], size: number) { const open = Array.from({ length: size * size }, (_, index) => index).filter((index) => !body.includes(index)); return open[Math.floor(Math.random() * open.length)] ?? -1; }

function Snake({ initialState, preferences, bestScore = 0, onState, onFinish }: GameProps) {
  const saved = initialState as { size?: number; body?: number[]; food?: number; score?: number } | undefined;
  const [size, setSize] = useState(saved?.size && [16, 22, 28].includes(saved.size) ? saved.size : preferences.snakeSize);
  const initialBody = saved?.body?.length ? saved.body : [Math.floor(size / 2) * size + Math.floor(size / 2)];
  const [body, setBody] = useState(initialBody), [food, setFood] = useState(saved?.food ?? newFood(initialBody, size));
  const [direction, setDirection] = useState<SnakeDirection>('right'), queued = useRef<SnakeDirection>('right');
  const [score, setScore] = useState(saved?.score ?? 0), [paused, setPaused] = useState(true), [dead, setDead] = useState(false), [startedAt, setStartedAt] = useState(0);
  const touch = useRef<{ x: number; y: number } | undefined>(undefined), turnRef = useRef<(next: SnakeDirection) => void>(() => undefined), finished = useRef(false);
  const turn = (next: SnakeDirection) => { if (dead || queued.current !== direction) return; if (opposite[direction] !== next) queued.current = next; if (!startedAt) setStartedAt(Date.now()); setPaused(false); };
  turnRef.current = turn;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const map: Record<string, SnakeDirection | undefined> = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' }, next = map[event.key];
      if (next) { event.preventDefault(); turnRef.current(next); }
      if (event.key === ' ') { event.preventDefault(); setPaused((value) => !value); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (paused || dead) return;
    const timer = window.setInterval(() => {
      const nextDirection = queued.current; setDirection(nextDirection);
      setBody((current) => {
        const result = stepSnake(current, nextDirection, size, food);
        if (result.dead) { setDead(true); setPaused(true); if (!finished.current) { finished.current = true; onFinish({ outcome: 'lost', score, durationMs: startedAt ? Date.now() - startedAt : 0 }); } return current; }
        let nextFood = food, nextScore = score;
        if (result.ate) { nextScore = score + 10; nextFood = newFood(result.body, size); setScore(nextScore); setFood(nextFood); if (nextFood < 0 && !finished.current) { finished.current = true; onFinish({ outcome: 'won', score: nextScore, durationMs: startedAt ? Date.now() - startedAt : 0 }); } }
        onState({ size, body: result.body, food: nextFood, score: nextScore }); return result.body;
      });
    }, Math.max(70, 190 - score * 2));
    return () => clearInterval(timer);
  }, [paused, dead, size, food, score, startedAt, onState, onFinish]);
  const reset = (nextSize = size) => {
    const nextBody = [Math.floor(nextSize / 2) * nextSize + Math.floor(nextSize / 2)], nextFood = newFood(nextBody, nextSize);
    finished.current = false; setBody(nextBody); setFood(nextFood); setScore(0); setDirection('right'); queued.current = 'right'; setDead(false); setPaused(true); setStartedAt(0); onState({ size: nextSize, body: nextBody, food: nextFood, score: 0 });
  };

  return <section className="game-panel snake-panel">
    <div className="game-toolbar"><label>Board<select value={size} onChange={(event) => { const next = Number(event.target.value); setSize(next); reset(next); }}><option value={16}>Small</option><option value={22}>Medium</option><option value={28}>Large</option></select></label><span>Score <strong>{score}</strong></span><span>Best <strong>{Math.max(bestScore, score)}</strong></span><button className="text-button" disabled={dead} onClick={() => { if (!startedAt) setStartedAt(Date.now()); setPaused((value) => !value); }}>{paused ? 'Play' : 'Pause'}</button></div>
    <div className={`snake-board ${dead ? 'is-dead' : ''}`} role="region" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }} tabIndex={0} aria-label="Snake board. Use arrow keys, WASD, swipe, or the direction buttons." onTouchStart={(event) => { const point = event.touches[0]; if (point) touch.current = { x: point.clientX, y: point.clientY }; }} onTouchEnd={(event) => { const point = event.changedTouches[0], start = touch.current; if (!point || !start) return; const dx = point.clientX - start.x, dy = point.clientY - start.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) turn(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'); touch.current = undefined; }}>{Array.from({ length: size * size }, (_, index) => <span aria-hidden="true" key={index} className={index === food ? 'snake-food' : body[0] === index ? 'snake-head' : body.includes(index) ? 'snake-body' : ''} />)}</div>
    <p className="sr-only" aria-live="polite">Score {score}. Snake length {body.length}. Food at row {Math.floor(food / size) + 1}, column {(food % size) + 1}.</p>
    {(paused || dead) && <p className={`status-message ${dead ? 'error' : ''}`} role="status">{dead ? `Game over — score ${score}.` : 'Paused — choose a direction to play.'}</p>}
    <div className="direction-pad"><span /><button aria-label="Move up" onClick={() => turn('up')}>↑</button><span /><button aria-label="Move left" onClick={() => turn('left')}>←</button><button aria-label="Move down" onClick={() => turn('down')}>↓</button><button aria-label="Move right" onClick={() => turn('right')}>→</button></div>
    <div className="game-actions"><button onClick={() => reset()}>Restart</button></div>
  </section>;
}

export const snake: GameManifest = {
  id: 'snake', name: 'Snake', description: 'Guide the growing snake and keep clear of the walls.', category: 'arcade', icon: 'M6 3a3 3 0 0 0 0 6h8a2 2 0 1 1 0 4H8a5 5 0 1 0 0 10h7v-3H8a2 2 0 1 1 0-4h6a5 5 0 1 0 0-10H6Zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm11 14h4v4h-4v-4Z', supportsResume: false, supportsDailyChallenge: false, controls: 'Arrow keys, WASD, swipe, or direction pad',
  tips: ['Choose any direction to start; the snake gets faster as your score grows.', 'Plan turns early and leave yourself space around the outside of the board.', 'Press Space to pause, or use the direction pad on touch devices.'], component: Snake
};
