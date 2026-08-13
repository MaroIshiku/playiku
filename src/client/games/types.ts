import type { ComponentType } from 'react';

export type GameProps = {
  initialState?: unknown;
  dailySeed?: string;
  reducedMotion: boolean;
  onState: (state: unknown) => void;
  onComplete: (details?: { score?: number; durationMs?: number }) => void;
};

export type GameManifest = {
  id: 'sudoku' | 'minesweeper' | '2048' | 'nonogram' | 'snake' | 'solitaire';
  name: string;
  description: string;
  category: 'logic' | 'puzzle' | 'arcade' | 'cards';
  icon: string;
  supportsResume: boolean;
  supportsDailyChallenge: boolean;
  controls: string;
  component: ComponentType<GameProps>;
};
