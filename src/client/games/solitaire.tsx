import { useEffect, useState } from 'react';
import type { GameManifest, GameProps } from './types.js';

type Suit = '♠' | '♥' | '♦' | '♣';
export type Card = { id: string; suit: Suit; rank: number; faceUp: boolean };
type SolitaireState = { stock: Card[]; waste: Card[]; foundations: Card[][]; tableau: Card[][]; draw: 1 | 3; moves: number; elapsed: number };
const red = (card: Card) => card.suit === '♥' || card.suit === '♦';
export function canPlaceTableau(card: Card, target?: Card) { return target ? target.faceUp && target.rank === card.rank + 1 && red(target) !== red(card) : card.rank === 13; }
export function canPlaceFoundation(card: Card, foundation: Card[]) { const top = foundation.at(-1); return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1; }
function label(card: Card) { return `${card.rank === 1 ? 'A' : card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank}${card.suit}`; }
function shuffle(cards: Card[], seed: number) { const result = [...cards]; let value = seed >>> 0; for (let index = result.length - 1; index > 0; index -= 1) { value = (value * 1664525 + 1013904223) >>> 0; const target = value % (index + 1); [result[index], result[target]] = [result[target]!, result[index]!]; } return result; }
export function createDeal(seed = Date.now(), draw: 1 | 3 = 1): SolitaireState {
  const deck = shuffle((['♠', '♥', '♦', '♣'] as Suit[]).flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({ id: `${suit}${index + 1}`, suit, rank: index + 1, faceUp: false }))), seed);
  const tableau: Card[][] = Array.from({ length: 7 }, () => []);
  for (let column = 0; column < 7; column += 1) for (let row = column; row < 7; row += 1) { const card = deck.pop()!; card.faceUp = row === column; tableau[row]!.push(card); }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau, draw, moves: 0, elapsed: 0 };
}

function Solitaire({ initialState, onState, onComplete }: GameProps) {
  const saved = initialState as SolitaireState | undefined;
  const [state, setState] = useState<SolitaireState>(saved?.tableau?.length === 7 ? saved : createDeal());
  const [history, setHistory] = useState<SolitaireState[]>([]);
  const [selected, setSelected] = useState<{ column: number; index: number } | { waste: true }>();
  useEffect(() => { const timer = window.setInterval(() => setState((current) => ({ ...current, elapsed: current.elapsed + 1 })), 1000); return () => clearInterval(timer); }, []);
  const commit = (next: SolitaireState) => { setHistory((items) => [...items.slice(-49), state]); setState(next); setSelected(undefined); onState(next); if (next.foundations.every((foundation) => foundation.length === 13)) onComplete({ durationMs: next.elapsed * 1000 }); };
  const drawStock = () => {
    if (!state.stock.length) return commit({ ...state, stock: [...state.waste].reverse().map((card) => ({ ...card, faceUp: false })), waste: [], moves: state.moves + 1 });
    const stock = [...state.stock], waste = [...state.waste]; for (let count = 0; count < state.draw && stock.length; count += 1) waste.push({ ...stock.pop()!, faceUp: true }); commit({ ...state, stock, waste, moves: state.moves + 1 });
  };
  type Selection = { column: number; index: number } | { waste: true };
  const sourceCards = (source = selected) => source && 'waste' in source ? state.waste.length ? [state.waste.at(-1)!] : [] : source ? state.tableau[source.column]!.slice(source.index) : [];
  const moveToTableau = (target: number) => {
    const cards = sourceCards(); if (!cards.length || !canPlaceTableau(cards[0]!, state.tableau[target]!.at(-1))) return;
    const next = structuredClone(state) as SolitaireState;
    if (selected && 'waste' in selected) next.waste.pop(); else if (selected) { next.tableau[selected.column]!.splice(selected.index); const top = next.tableau[selected.column]!.at(-1); if (top) top.faceUp = true; }
    next.tableau[target]!.push(...cards); next.moves += 1; commit(next);
  };
  const moveToFoundation = (source: Selection | undefined = selected) => {
    const cards = sourceCards(source); if (cards.length !== 1) return;
    const card = cards[0]!, target = (['♠', '♥', '♦', '♣'] as Suit[]).indexOf(card.suit); if (!canPlaceFoundation(card, state.foundations[target]!)) return;
    const next = structuredClone(state) as SolitaireState;
    if (source && 'waste' in source) next.waste.pop(); else if (source) { next.tableau[source.column]!.splice(source.index); const top = next.tableau[source.column]!.at(-1); if (top) top.faceUp = true; }
    next.foundations[target]!.push(card); next.moves += 1; commit(next);
  };
  const tapCard = (column: number, index: number) => {
    const card = state.tableau[column]![index]!;
    if (!card.faceUp) { if (index !== state.tableau[column]!.length - 1) return; const next = structuredClone(state) as SolitaireState; next.tableau[column]![index]!.faceUp = true; next.moves += 1; commit(next); return; }
    if (selected) { moveToTableau(column); } else setSelected({ column, index });
  };
  const newDeal = (draw = state.draw) => { const next = createDeal(Date.now(), draw); setState(next); setHistory([]); setSelected(undefined); onState(next); };

  return <section className="game-panel solitaire-panel">
    <div className="game-toolbar"><label>Draw<select value={state.draw} onChange={(event) => newDeal(Number(event.target.value) as 1 | 3)}><option value={1}>Draw 1</option><option value={3}>Draw 3</option></select></label><span>Moves {state.moves}</span><span>{Math.floor(state.elapsed / 60)}:{String(state.elapsed % 60).padStart(2, '0')}</span></div>
    <div className="solitaire-board" role="region" aria-label="Klondike Solitaire board" onClick={(event) => { if (event.target === event.currentTarget) setSelected(undefined); }}>
      <div className="sol-top"><button className="card card-back" aria-label={state.stock.length ? `Draw from stock, ${state.stock.length} cards` : 'Recycle waste'} onClick={drawStock}>{state.stock.length || '↻'}</button><button className={`card ${selected && 'waste' in selected ? 'selected' : ''}`} disabled={!state.waste.length} aria-label={state.waste.length ? `Waste ${label(state.waste.at(-1)!)}` : 'Empty waste'} onClick={() => setSelected({ waste: true })} onDoubleClick={() => moveToFoundation({ waste: true })}>{state.waste.length ? label(state.waste.at(-1)!) : ''}</button><span className="sol-spacer" />{state.foundations.map((foundation, index) => <button key={index} className="card foundation" aria-label={`${(['Spades', 'Hearts', 'Diamonds', 'Clubs'] as const)[index]} foundation${foundation.length ? `, ${label(foundation.at(-1)!)}` : ', empty'}`} onClick={() => moveToFoundation()}>{foundation.length ? label(foundation.at(-1)!) : (['♠', '♥', '♦', '♣'] as Suit[])[index]}</button>)}</div>
      <div className="tableau">{state.tableau.map((column, columnIndex) => <div className="tableau-column" key={columnIndex} onClick={() => { if (!column.length && selected) moveToTableau(columnIndex); }} onDragOver={(event) => event.preventDefault()} onDrop={() => moveToTableau(columnIndex)}>{column.length ? column.map((card, index) => <button draggable={card.faceUp} onDragStart={() => setSelected({ column: columnIndex, index })} onClick={(event) => { event.stopPropagation(); tapCard(columnIndex, index); }} onDoubleClick={(event) => { event.stopPropagation(); moveToFoundation({ column: columnIndex, index }); }} key={card.id} style={{ top: `${index * (card.faceUp ? 2.15 : 1.15)}rem` }} className={`card tableau-card ${card.faceUp ? red(card) ? 'red' : '' : 'card-back'} ${selected && !('waste' in selected) && selected.column === columnIndex && selected.index === index ? 'selected' : ''}`} aria-label={card.faceUp ? label(card) : 'Face-down card'}>{card.faceUp ? label(card) : ''}</button>) : <button className="card empty-card" aria-label="Empty tableau column" onClick={() => moveToTableau(columnIndex)}>K</button>}</div>)}</div>
    </div>
    <div className="game-actions"><button className="secondary" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setState(previous); setHistory((items) => items.slice(0, -1)); onState(previous); } }}>Undo</button><button onClick={() => newDeal()}>New deal</button></div>
  </section>;
}

export const solitaire: GameManifest = { id: 'solitaire', name: 'Solitaire', description: 'A clean, touch-friendly game of Klondike.', category: 'cards', icon: '♠', supportsResume: true, supportsDailyChallenge: false, controls: 'Tap, double-click, or drag cards', component: Solitaire };
