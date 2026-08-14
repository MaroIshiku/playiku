import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
const create = async (setupSecret?: string) => { const app = await buildApp({ databasePath: join(mkdtempSync(join(tmpdir(), 'playiku-')), 'app.sqlite'), cookieSecure: false, setupSecret, serveFrontend: false, logger: false }); apps.push(app); return app; };
const setupAndLogin = async (app: Awaited<ReturnType<typeof buildApp>>, username = 'admin') => {
  const created = await app.inject({ method: 'POST', url: '/api/setup', payload: { username, displayName: 'Test Admin', password: 'synthetic-password-2026', setupSecret: 'synthetic-setup-material-for-tests-2026' } });
  expect(created.statusCode).toBe(201);
  const login = await app.inject({ method: 'POST', url: '/api/session', payload: { username, password: 'synthetic-password-2026' } });
  expect(login.statusCode).toBe(200);
  const setCookie = login.headers['set-cookie']!;
  return { cookie: (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!, csrf: login.json().csrf as string };
};

describe('platform endpoints', () => {
  it('reports liveness, readiness, and build identity', async () => {
    const app = await create();
    const live = await app.inject('/health/live');
    expect(live.statusCode).toBe(200);
    expect(live.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
    expect((await app.inject('/api/manifest')).json()).toMatchObject({ id: 'playiku', license: 'Apache-2.0', schemaVersion: 1 });
  }, 15_000);
});

describe('first run and sessions', () => {
  it('fails closed without the configured one-time setup secret', async () => {
    const app = await create();
    const response = await app.inject({ method: 'POST', url: '/api/setup', payload: { username: 'admin', displayName: 'Admin', password: 'synthetic-password-2026', setupSecret: 'synthetic-invalid-material' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'SETUP_INVALID' });
  });
  it('creates the first administrator once and requires a distinct password', async () => {
    const app = await create('synthetic-setup-material-for-tests-2026');
    const reused = await app.inject({ method: 'POST', url: '/api/setup', payload: { username: 'admin', displayName: 'Admin', password: 'synthetic-setup-material-for-tests-2026', setupSecret: 'synthetic-setup-material-for-tests-2026' } });
    expect(reused.statusCode).toBe(400);
    await setupAndLogin(app);
    expect((await app.inject('/api/setup')).json()).toEqual({ required: false });
    expect((await app.inject({ method: 'POST', url: '/api/setup', payload: { username: 'other', displayName: 'Other', password: 'synthetic-password-2026', setupSecret: 'synthetic-setup-material-for-tests-2026' } })).statusCode).toBe(404);
  });
  it('uses generic login failures and enforces authentication and CSRF', async () => {
    const app = await create('synthetic-setup-material-for-tests-2026'); const auth = await setupAndLogin(app);
    const invalid = await app.inject({ method: 'POST', url: '/api/session', payload: { username: 'admin', password: 'incorrect-password' } });
    expect(invalid.statusCode).toBe(401); expect(invalid.json().message).toBe('Invalid credentials.');
    expect((await app.inject('/api/state')).statusCode).toBe(401);
    const settings = { theme: 'sky', mode: 'dark', sound: false, haptics: false, animations: true, reducedMotion: false, autoResume: true };
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: { cookie: auth.cookie }, payload: settings })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: settings })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: auth.cookie } })).json().settings).toMatchObject(settings);
  });
  it('migrates legacy theme preferences without losing other settings', async () => {
    const app = await create('synthetic-setup-material-for-tests-2026'); const auth = await setupAndLogin(app);
    const legacySettings = { theme: 'ocean', mode: 'dark', sound: false, haptics: true, animations: false, reducedMotion: true, autoResume: false };
    const response = await app.inject({ method: 'PUT', url: '/api/settings', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: legacySettings });
    expect(response.statusCode).toBe(200);
    const migrated = { ...legacySettings, theme: 'sky', showMistakes: true, confirmNewGames: true, defaults: { sudoku: 'Easy', minesweeper: 'Beginner', nonogram: 5, snake: 16, solitaireDraw: 1 } };
    expect(response.json()).toEqual(migrated);
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: auth.cookie } })).json().settings).toEqual(migrated);
  });
  it('validates game identifiers and isolates mutating state behind CSRF', async () => {
    const app = await create('synthetic-setup-material-for-tests-2026'); const auth = await setupAndLogin(app);
    const bad = await app.inject({ method: 'PUT', url: '/api/games/not-a-game/session', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: { state: {}, completed: false } });
    expect(bad.statusCode).toBe(400);
    const saved = await app.inject({ method: 'PUT', url: '/api/games/2048/session', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: { state: { board: Array(16).fill(0), score: 0, best: 0, rngState: 42, reached2048: false, gameOver: false }, completed: false } });
    expect(saved.statusCode).toBe(200);
    const state = await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: auth.cookie } });
    expect(state.json().activeSessions).toHaveLength(1);
    const malformed = await app.inject({ method: 'PUT', url: '/api/games/2048/session', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: { state: { board: Array(16).fill(3), score: -1 }, completed: false } });
    expect(malformed.statusCode).toBe(400);
  });
  it('provides deterministic authenticated daily challenges for supported games', async () => {
    const app = await create('synthetic-setup-material-for-tests-2026'); const auth = await setupAndLogin(app);
    const first = await app.inject({ method: 'GET', url: '/api/daily/sudoku', headers: { cookie: auth.cookie } });
    const second = await app.inject({ method: 'GET', url: '/api/daily/sudoku', headers: { cookie: auth.cookie } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual(second.json());
    expect(first.json()).toMatchObject({ gameId: 'sudoku', completed: false });
    expect(first.json().date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.json().seed).toMatch(/^[a-f0-9]{16}$/);
    expect((await app.inject({ method: 'GET', url: '/api/daily/snake', headers: { cookie: auth.cookie } })).statusCode).toBe(404);
    expect((await app.inject('/api/daily/sudoku')).statusCode).toBe(401);
    const completed = await app.inject({ method: 'POST', url: '/api/statistics', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: { gameId: 'sudoku', outcome: 'won', durationMs: 1000, dailyDate: first.json().date } });
    expect(completed.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: '/api/daily/sudoku', headers: { cookie: auth.cookie } })).json().completed).toBe(true);
    const forged = await app.inject({ method: 'POST', url: '/api/statistics', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: { gameId: 'sudoku', outcome: 'won', durationMs: 1000, dailyDate: '2000-01-01' } });
    expect(forged.statusCode).toBe(400);
  });
  it('updates profile details and lets users review and revoke their own sessions', async () => {
    const app = await create('synthetic-setup-material-for-tests-2026'); const first = await setupAndLogin(app);
    const secondLogin = await app.inject({ method: 'POST', url: '/api/session', payload: { username: 'admin', password: 'synthetic-password-2026' } });
    const secondCookieHeader = secondLogin.headers['set-cookie']!;
    const second = { cookie: (Array.isArray(secondCookieHeader) ? secondCookieHeader[0]! : secondCookieHeader).split(';')[0]!, csrf: secondLogin.json().csrf as string };
    const profile = await app.inject({ method: 'PATCH', url: '/api/profile', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf }, payload: { displayName: 'Updated Admin' } });
    expect(profile.statusCode).toBe(200); expect(profile.json()).toMatchObject({ displayName: 'Updated Admin', username: 'admin' });
    expect((await app.inject({ method: 'POST', url: '/api/session/reauthenticate', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf }, payload: { password: 'incorrect-password' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/session/reauthenticate', headers: { cookie: first.cookie, 'x-csrf-token': first.csrf }, payload: { password: 'synthetic-password-2026' } })).json()).toEqual({ reauthenticated: true });
    const listed = await app.inject({ method: 'GET', url: '/api/sessions', headers: { cookie: first.cookie } });
    expect(listed.statusCode).toBe(200); expect(listed.json()).toHaveLength(2); expect(listed.json().filter((item: { current: boolean }) => item.current)).toHaveLength(1);
    const remote = listed.json().find((item: { current: boolean }) => !item.current) as { id: string };
    expect(remote.id).toMatch(/^[a-f0-9]{32}$/);
    expect((await app.inject({ method: 'DELETE', url: `/api/sessions/${remote.id}`, headers: { cookie: first.cookie, 'x-csrf-token': first.csrf } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: second.cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/sessions', headers: { cookie: first.cookie } })).json()).toHaveLength(1);
  });
  it('isolates multiple accounts and revokes sessions when an account is deleted', async () => {
    const app = await create('synthetic-setup-material-for-tests-2026'); const admin = await setupAndLogin(app);
    const created = await app.inject({ method: 'POST', url: '/api/accounts', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf }, payload: { username: 'player', displayName: 'Second Player', password: 'synthetic-player-password-2026' } });
    expect(created.statusCode).toBe(201);
    const accountId = created.json().id as number;
    const playerLogin = await app.inject({ method: 'POST', url: '/api/session', payload: { username: 'player', password: 'synthetic-player-password-2026' } });
    const playerCookieHeader = playerLogin.headers['set-cookie']!;
    const player = { cookie: (Array.isArray(playerCookieHeader) ? playerCookieHeader[0]! : playerCookieHeader).split(';')[0]!, csrf: playerLogin.json().csrf as string };
    expect(playerLogin.json().user.role).toBe('user');
    expect((await app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: player.cookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/favorites/sudoku', headers: { cookie: player.cookie, 'x-csrf-token': player.csrf }, payload: { favorite: true } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/statistics', headers: { cookie: player.cookie, 'x-csrf-token': player.csrf }, payload: { gameId: 'sudoku', outcome: 'won', durationMs: 1000 } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: player.cookie } })).json().favorites).toEqual(['sudoku']);
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: player.cookie } })).json().achievements).toMatchObject([{ id: 'first_win' }]);
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: admin.cookie } })).json().favorites).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/api/accounts/${accountId}`, headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie: player.cookie } })).statusCode).toBe(401);
  });
});
