import type { ComponentType } from 'react';

export type GameProps = {
  initialState?: unknown;
  dailySeed?: string;
  reducedMotion: boolean;
  bestScore?: number;
  preferences: {
    showMistakes: boolean;
    sudokuDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
    minesweeperDifficulty: 'Beginner' | 'Intermediate' | 'Expert' | 'Custom';
    nonogramSize: 5 | 10 | 15;
    snakeSize: 16 | 22 | 28;
    solitaireDraw: 1 | 3;
  };
  onState: (state: unknown) => void;
  onFinish: (details: { outcome: 'won' | 'lost'; score?: number; durationMs?: number }) => void;
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
  tips: string[];
  component: ComponentType<GameProps>;
};
