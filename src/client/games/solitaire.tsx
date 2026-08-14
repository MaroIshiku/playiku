import { useEffect, useRef, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

type Suit = '♠' | '♥' | '♦' | '♣';
export type Card = { id: string; suit: Suit; rank: number; faceUp: boolean };
export type SolitaireState = { stock: Card[]; waste: Card[]; foundations: Card[][]; tableau: Card[][]; draw: 1 | 3; moves: number; elapsed: number; completed: boolean };
type Selection = { column: number; index: number } | { waste: true } | { foundation: number };
const suits: Suit[] = ['♠', '♥', '♦', '♣'];
const red = (card: Card) => card.suit === '♥' || card.suit === '♦';
export function canPlaceTableau(card: Card, target?: Card) { return target ? target.faceUp && target.rank === card.rank + 1 && red(target) !== red(card) : card.rank === 13; }
export function canPlaceFoundation(card: Card, foundation: Card[]) { const top = foundation.at(-1); return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1; }
export function isValidTableauRun(cards: Card[]) { return cards.every((card, index) => card.faceUp && (index === 0 || canPlaceTableau(card, cards[index - 1]))); }
export function isSolitaireWon(state: Pick<SolitaireState, 'foundations'>) { return state.foundations.every((foundation) => foundation.length === 13); }
function label(card: Card) { return `${card.rank === 1 ? 'A' : card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank}${card.suit}`; }
function shuffle(cards: Card[], seed: number) { const result = [...cards]; let value = seed >>> 0; for (let index = result.length - 1; index > 0; index -= 1) { value = (value * 1664525 + 1013904223) >>> 0; const target = value % (index + 1); [result[index], result[target]] = [result[target]!, result[index]!]; } return result; }
export function createDeal(seed = Date.now(), draw: 1 | 3 = 1): SolitaireState {
  const deck = shuffle(suits.flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({ id: `${suit}${index + 1}`, suit, rank: index + 1, faceUp: false }))), seed), tableau: Card[][] = Array.from({ length: 7 }, () => []);
  for (let column = 0; column < 7; column += 1) for (let row = 0; row <= column; row += 1) { const card = deck.pop()!; card.faceUp = row === column; tableau[column]!.push(card); }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau, draw, moves: 0, elapsed: 0, completed: false };
}
const clone = (state: SolitaireState) => structuredClone(state) as SolitaireState;
const normalizeSavedDeal = (state: SolitaireState) => {
  const next = clone(state);
  for (const column of next.tableau) if (column.length > 1 && column[0]?.faceUp && column.slice(1).every((card) => !card.faceUp)) { column[0]!.faceUp = false; column.at(-1)!.faceUp = true; }
  next.completed = Boolean(state.completed) || isSolitaireWon(next);
  return next;
};
const topOffset = (column: Card[], index: number) => column.slice(0, index).reduce((sum, card) => sum + (card.faceUp ? 2.15 : 1.15), 0);

function Solitaire({ initialState, preferences, onState, onFinish }: GameProps) {
  const saved = initialState as SolitaireState | undefined, validSaved = saved?.tableau?.length === 7 && saved.foundations?.length === 4;
  const [state, setState] = useState<SolitaireState>(validSaved ? normalizeSavedDeal(saved) : createDeal(Date.now(), preferences.solitaireDraw));
  const [history, setHistory] = useState<SolitaireState[]>([]), [future, setFuture] = useState<SolitaireState[]>([]), [selected, setSelected] = useState<Selection>();
  const finished = useRef(state.completed);
  useEffect(() => { if (state.completed) return; const timer = window.setInterval(() => setState((current) => ({ ...current, elapsed: current.elapsed + 1 })), 1000); return () => clearInterval(timer); }, [state.completed]);
  useEffect(() => { if (state.elapsed > 0 && state.elapsed % 5 === 0 && !state.completed) onState(state); }, [state.elapsed]);

  const commit = (candidate: SolitaireState, remember = true) => {
    const won = isSolitaireWon(candidate), next = { ...candidate, completed: won };
    if (remember) { setHistory((items) => [...items.slice(-49), clone(state)]); setFuture([]); }
    setState(next); setSelected(undefined); onState(next);
    if (won && !finished.current) { finished.current = true; onFinish({ outcome: 'won', durationMs: next.elapsed * 1000, score: Math.max(0, 1000 - next.moves) }); }
  };
  const drawStock = () => {
    if (state.completed) return;
    if (!state.stock.length) { if (!state.waste.length) return; commit({ ...state, stock: [...state.waste].reverse().map((card) => ({ ...card, faceUp: false })), waste: [], moves: state.moves + 1 }); return; }
    const stock = [...state.stock], waste = [...state.waste]; for (let count = 0; count < state.draw && stock.length; count += 1) waste.push({ ...stock.pop()!, faceUp: true }); commit({ ...state, stock, waste, moves: state.moves + 1 });
  };
  const sourceCards = (source = selected) => {
    if (!source) return [];
    if ('waste' in source) return state.waste.length ? [state.waste.at(-1)!] : [];
    if ('foundation' in source) return state.foundations[source.foundation]!.length ? [state.foundations[source.foundation]!.at(-1)!] : [];
    return state.tableau[source.column]!.slice(source.index);
  };
  const removeSource = (next: SolitaireState, source: Selection) => {
    if ('waste' in source) next.waste.pop();
    else if ('foundation' in source) next.foundations[source.foundation]!.pop();
    else { next.tableau[source.column]!.splice(source.index); const top = next.tableau[source.column]!.at(-1); if (top) top.faceUp = true; }
  };
  const moveToTableau = (target: number) => {
    if (!selected || state.completed) return;
    if ('column' in selected && selected.column === target) { setSelected(undefined); return; }
    const cards = sourceCards(); if (!cards.length || !isValidTableauRun(cards) || !canPlaceTableau(cards[0]!, state.tableau[target]!.at(-1))) return;
    const next = clone(state); removeSource(next, selected); next.tableau[target]!.push(...cards); next.moves += 1; commit(next);
  };
  const moveToFoundation = (source: Selection | undefined = selected) => {
    if (!source || state.completed || 'foundation' in source) return;
    const cards = sourceCards(source); if (cards.length !== 1) return;
    const card = cards[0]!, target = suits.indexOf(card.suit); if (!canPlaceFoundation(card, state.foundations[target]!)) return;
    const next = clone(state); removeSource(next, source); next.foundations[target]!.push(card); next.moves += 1; commit(next);
  };
  const tapCard = (column: number, index: number) => {
    const card = state.tableau[column]![index]!;
    if (!card.faceUp) { if (index !== state.tableau[column]!.length - 1) return; const next = clone(state); next.tableau[column]![index]!.faceUp = true; next.moves += 1; commit(next); return; }
    if (selected) moveToTableau(column); else setSelected({ column, index });
  };
  const newDeal = (draw = state.draw) => { const next = createDeal(Date.now(), draw); finished.current = false; setState(next); setHistory([]); setFuture([]); setSelected(undefined); onState(next); };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture((items) => [...items, clone(state)]); setHistory((items) => items.slice(0, -1)); setState(previous); setSelected(undefined); onState(previous); };
  const redo = () => { const next = future.at(-1); if (!next) return; setHistory((items) => [...items, clone(state)]); setFuture((items) => items.slice(0, -1)); setState(next); setSelected(undefined); onState(next); };

  return <section className="game-panel solitaire-panel">
    <div className="game-toolbar"><label>Draw<select value={state.draw} onChange={(event) => newDeal(Number(event.target.value) as 1 | 3)}><option value={1}>Draw 1</option><option value={3}>Draw 3</option></select></label><span>Moves {state.moves}</span><span aria-label={`${state.elapsed} seconds elapsed`}>{Math.floor(state.elapsed / 60)}:{String(state.elapsed % 60).padStart(2, '0')}</span></div>
    <div className={`solitaire-board ${state.completed ? 'is-complete' : ''}`} role="region" aria-label="Klondike Solitaire board" onClick={(event) => { if (event.target === event.currentTarget) setSelected(undefined); }}>
      <div className="sol-top"><button className="card card-back" aria-label={state.stock.length ? `Draw from stock, ${state.stock.length} cards` : state.waste.length ? 'Recycle waste' : 'Empty stock'} disabled={!state.stock.length && !state.waste.length} onClick={drawStock}>{state.stock.length || (state.waste.length ? '↻' : '')}</button><button className={`card ${selected && 'waste' in selected ? 'selected' : ''}`} disabled={!state.waste.length} aria-label={state.waste.length ? `Waste ${label(state.waste.at(-1)!)}` : 'Empty waste'} onClick={() => setSelected((current) => current && 'waste' in current ? undefined : { waste: true })} onDoubleClick={() => moveToFoundation({ waste: true })}>{state.waste.length ? label(state.waste.at(-1)!) : ''}</button><span className="sol-spacer" />{state.foundations.map((foundation, index) => <button key={index} className={`card foundation ${selected && 'foundation' in selected && selected.foundation === index ? 'selected' : ''}`} aria-label={`${(['Spades', 'Hearts', 'Diamonds', 'Clubs'] as const)[index]} foundation${foundation.length ? `, ${label(foundation.at(-1)!)}` : ', empty'}`} onClick={() => { if (selected && 'foundation' in selected && selected.foundation === index) setSelected(undefined); else if (selected) moveToFoundation(); else if (foundation.length) setSelected({ foundation: index }); }}>{foundation.length ? label(foundation.at(-1)!) : suits[index]}</button>)}</div>
      <div className="tableau">{state.tableau.map((column, columnIndex) => <div className="tableau-column" key={columnIndex} onClick={() => { if (!column.length && selected) moveToTableau(columnIndex); }} onDragOver={(event) => event.preventDefault()} onDrop={() => moveToTableau(columnIndex)}>{column.length ? column.map((card, index) => <button draggable={card.faceUp} onDragStart={() => setSelected({ column: columnIndex, index })} onClick={(event) => { event.stopPropagation(); tapCard(columnIndex, index); }} onDoubleClick={(event) => { event.stopPropagation(); moveToFoundation({ column: columnIndex, index }); }} key={card.id} style={{ top: `${topOffset(column, index)}rem` }} className={`card tableau-card ${card.faceUp ? red(card) ? 'red' : '' : 'card-back'} ${selected && 'column' in selected && selected.column === columnIndex && selected.index === index ? 'selected' : ''}`} aria-label={card.faceUp ? label(card) : 'Face-down card'}>{card.faceUp ? label(card) : ''}</button>) : <button className="card empty-card" aria-label="Empty tableau column" onClick={() => moveToTableau(columnIndex)}>K</button>}</div>)}</div>
    </div>
    {state.completed && <p className="status-message success" role="status">You won in {state.moves} moves!</p>}
    <div className="game-actions wrap"><button className="secondary" disabled={!history.length || state.completed} onClick={undo}>Undo</button><button className="secondary" disabled={!future.length || state.completed} onClick={redo}>Redo</button><button onClick={() => newDeal()}>New deal</button></div>
  </section>;
}

export const solitaire: GameManifest = {
  id: 'solitaire', name: 'Solitaire', description: 'A clean, touch-friendly game of Klondike.', category: 'cards', icon: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v16h12V4H6Zm6 3c2.8 2.1 4.2 3.8 4.2 5.2A2.7 2.7 0 0 1 12 14.4a2.7 2.7 0 0 1-4.2-2.2C7.8 10.8 9.2 9.1 12 7Zm-1 7.6L9.8 18h4.4L13 14.6h-2Z', supportsResume: true, supportsDailyChallenge: false, controls: 'Tap, double-click, or drag cards',
  tips: ['Build tableau columns downward in alternating colors; only Kings can move to empty columns.', 'Foundations build upward by suit from Ace to King. Double-click a single card to move it there.', 'Tap a card then its destination on touch devices. Foundation cards can return to the tableau.'], component: Solitaire
};
