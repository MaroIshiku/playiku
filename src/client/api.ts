export type ThemeName = 'lavender' | 'mint' | 'sky' | 'amber' | 'rose' | 'graphite';
export type ThemeMode = 'light' | 'dark' | 'system';
export type GameDefaults = { sudoku: 'Easy' | 'Medium' | 'Hard' | 'Expert'; minesweeper: 'Beginner' | 'Intermediate' | 'Expert' | 'Custom'; nonogram: 5 | 10 | 15; snake: 16 | 22 | 28; solitaireDraw: 1 | 3 };
export type Settings = { theme: ThemeName; mode: ThemeMode; sound: boolean; haptics: boolean; animations: boolean; reducedMotion: boolean; autoResume: boolean; showMistakes: boolean; confirmNewGames: boolean; defaults: GameDefaults };
export type Statistic = { game_id: string; games_played: number; games_won: number; total_play_ms: number; best_score: number | null; best_time_ms: number | null; current_streak: number; longest_streak: number; last_played_at: number | null };
export type AppState = { settings: Settings; favorites: string[]; activeSessions: { gameId: string; state: unknown; updatedAt: number }[]; statistics: Statistic[]; achievements: { id: string; unlockedAt: number }[] };
export type User = { username: string; displayName: string; role: 'admin' | 'user' };
export type Account = User & { id: number; createdAt: number };
export type SessionInfo = { id: string; current: boolean; createdAt: number; lastSeenAt: number; expiresAt: number };

let csrf = '';
const storage = { user: 'playiku:offline-user', state: 'playiku:offline-state', csrf: 'playiku:offline-csrf', queue: 'playiku:offline-queue' } as const;
const read = <T,>(key: string): T | undefined => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : undefined; } catch { return undefined; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ } };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.method && !['GET', 'HEAD'].includes(init.method)) headers.set('x-csrf-token', csrf);
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'The request could not be completed.' })) as { message?: string };
    throw new Error(body.message ?? 'The request could not be completed.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type QueuedMutation = { path: string; method: string; body?: string };
async function mutation<T>(path: string, init: RequestInit, offlineResult?: T): Promise<T> {
  try { return await request<T>(path, init); }
  catch (cause) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queued = read<QueuedMutation[]>(storage.queue) ?? [];
      queued.push({ path, method: init.method ?? 'POST', body: typeof init.body === 'string' ? init.body : undefined });
      write(storage.queue, queued.slice(-100));
      return offlineResult as T;
    }
    throw cause;
  }
}
export async function flushOfflineQueue() {
  const queued = read<QueuedMutation[]>(storage.queue) ?? [];
  if (!queued.length) return;
  const remaining: QueuedMutation[] = [];
  for (const item of queued) {
    try { await request(item.path, { method: item.method, body: item.body }); }
    catch { remaining.push(item); }
  }
  write(storage.queue, remaining);
}

export const api = {
  setupStatus: async () => { try { return await request<{ required: boolean }>('/api/setup'); } catch (cause) { if (read<User>(storage.user)) return { required: false }; throw cause; } },
  setup: (input: { username: string; displayName: string; password: string; setupSecret: string }) => request('/api/setup', { method: 'POST', body: JSON.stringify(input) }),
  session: async () => { try { const result = await request<{ csrf: string; user: User }>('/api/session'); csrf = result.csrf; write(storage.csrf, csrf); write(storage.user, result.user); return result; } catch (cause) { const user = read<User>(storage.user); const proof = read<string>(storage.csrf); if (user && proof) { csrf = proof; return { csrf, user }; } throw cause; } },
  login: async (input: { username: string; password: string }) => { const result = await request<{ csrf: string; user: User }>('/api/session', { method: 'POST', body: JSON.stringify(input) }); csrf = result.csrf; write(storage.csrf, csrf); write(storage.user, result.user); return result; },
  logout: async () => { try { return await request('/api/session', { method: 'DELETE' }); } finally { csrf = ''; Object.values(storage).forEach((key) => localStorage.removeItem(key)); } },
  state: async () => { try { const result = await request<AppState>('/api/state'); write(storage.state, result); return result; } catch (cause) { const cached = read<AppState>(storage.state); if (cached) return cached; throw cause; } },
  saveSettings: (settings: Settings) => mutation<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }, settings),
  favorite: (gameId: string, favorite: boolean) => mutation(`/api/favorites/${gameId}`, { method: 'PUT', body: JSON.stringify({ favorite }) }, { gameId, favorite }),
  saveGame: (gameId: string, state: unknown, completed = false) => mutation(`/api/games/${gameId}/session`, { method: 'PUT', body: JSON.stringify({ state, completed }) }, { saved: !completed }),
  statistic: (input: { gameId: string; outcome: 'started' | 'won' | 'lost'; durationMs?: number; score?: number; dailyDate?: string }) => mutation('/api/statistics', { method: 'POST', body: JSON.stringify({ durationMs: 0, ...input }) }, { recorded: true }),
  clearHistory: (type: 'sessions' | 'statistics' | 'all') => mutation('/api/history', { method: 'DELETE', body: JSON.stringify({ type }) }),
  daily: (gameId: string) => request<{ gameId: string; date: string; seed: string; completed: boolean }>(`/api/daily/${gameId}`),
  sessions: () => request<SessionInfo[]>('/api/sessions'),
  revokeSession: (id: string) => request(`/api/sessions/${id}`, { method: 'DELETE' }),
  reauthenticate: (password: string) => request<{ reauthenticated: boolean }>('/api/session/reauthenticate', { method: 'POST', body: JSON.stringify({ password }) }),
  updateProfile: (displayName: string) => request<User>('/api/profile', { method: 'PATCH', body: JSON.stringify({ displayName }) }),
  accounts: () => request<Account[]>('/api/accounts'),
  createAccount: (input: { username: string; displayName: string; password: string }) => request<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(input) }),
  deleteAccount: (id: number) => request(`/api/accounts/${id}`, { method: 'DELETE' }),
  manifest: () => request<{ version: string; buildDate: string; gitSha: string; license: string; repository: string }>('/api/manifest')
};
