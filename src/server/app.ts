import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import argon2 from 'argon2';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { accounts, openDatabase, sessions } from './database.js';

const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(12).max(256) }).strict();
const setupSchema = loginSchema.extend({ displayName: z.string().trim().min(1).max(80), setupSecret: z.string().min(32).max(1024) }).strict();
const accountSchema = loginSchema.extend({ displayName: z.string().trim().min(1).max(80) }).strict();
const themeSchema = z.enum(['lavender', 'mint', 'sky', 'amber', 'rose', 'graphite']);
const legacyThemeSchema = z.enum(['violet', 'ocean', 'forest', 'sunset', 'mono']);
const normalizeTheme = (theme: z.infer<typeof themeSchema> | z.infer<typeof legacyThemeSchema>) => {
  if (theme === 'violet') return 'lavender' as const;
  if (theme === 'ocean') return 'sky' as const;
  if (theme === 'forest') return 'mint' as const;
  if (theme === 'sunset') return 'amber' as const;
  if (theme === 'mono') return 'graphite' as const;
  return theme;
};
const settingsSchema = z.object({ theme: z.union([themeSchema, legacyThemeSchema]).transform(normalizeTheme), mode: z.enum(['light', 'dark', 'system']), sound: z.boolean(), haptics: z.boolean(), animations: z.boolean(), reducedMotion: z.boolean(), autoResume: z.boolean() }).strict();
const parseStoredSettings = (value?: string) => {
  if (!value) return defaultSettings;
  try { const parsed = settingsSchema.safeParse(JSON.parse(value)); return parsed.success ? parsed.data : defaultSettings; } catch { return defaultSettings; }
};
const gameIdSchema = z.enum(['sudoku', 'minesweeper', '2048', 'nonogram', 'snake', 'solitaire']);
const stateSchema = z.object({ state: z.unknown(), completed: z.boolean().default(false) }).strict();
const statisticsSchema = z.object({ gameId: gameIdSchema, outcome: z.enum(['started', 'won', 'lost']), durationMs: z.number().int().min(0).max(86_400_000).default(0), score: z.number().int().min(0).max(2_147_483_647).optional(), dailyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const safeEqual = (left: string, right: string) => timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
const MAX_STATE_BYTES = 64 * 1024;
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;

type Auth = { accountId: number; username: string; displayName: string; role: 'admin' | 'user'; csrf: string; tokenHash: string };

export async function buildApp(options: { databasePath: string; cookieSecure: boolean; setupSecret?: string; timezone?: string; serveFrontend?: boolean; logger?: boolean }) {
  const app = Fastify({ logger: options.logger === false ? false : { redact: ['req.headers.cookie', 'req.headers.authorization', 'body.password', 'body.setupSecret'] }, trustProxy: false, bodyLimit: MAX_STATE_BYTES + 4096 });
  const { sqlite, db } = openDatabase(options.databasePath);
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null } }, hsts: options.cookieSecure });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  const audit = (eventType: string, actorId: number | null, result: string, requestId: string) => sqlite.prepare('INSERT INTO audit_events (event_type, actor_id, result, request_id, occurred_at) VALUES (?, ?, ?, ?, ?)').run(eventType, actorId, result, requestId, Date.now());
  const error = (reply: FastifyReply, request: FastifyRequest, status: number, code: string, message: string) => reply.code(status).send({ code, message, requestId: request.id });
  const sessionCookie = options.cookieSecure ? '__Host-ishiku_session' : 'ishiku_session';
  const transaction = <T,>(operation: () => T): T => {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = operation(); sqlite.exec('COMMIT'); return result; }
    catch (cause) { sqlite.exec('ROLLBACK'); throw cause; }
  };

  const authenticate = async (request: FastifyRequest, reply: FastifyReply, requireCsrf = false): Promise<Auth | undefined> => {
    const token = request.cookies[sessionCookie];
    const now = Date.now();
    const session = token ? db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token))).get() : undefined;
    if (!session || session.expiresAt <= now || now - session.lastSeenAt > IDLE_MS) {
      if (session) db.delete(sessions).where(eq(sessions.tokenHash, session.tokenHash)).run();
      error(reply, request, 401, 'AUTH_REQUIRED', 'Authentication required.');
      return;
    }
    if (requireCsrf && request.headers['x-csrf-token'] !== session.csrf) {
      error(reply, request, 403, 'AUTH_FORBIDDEN', 'Request denied.');
      return;
    }
    const account = db.select().from(accounts).where(eq(accounts.id, session.accountId)).get();
    if (!account) {
      error(reply, request, 401, 'AUTH_REQUIRED', 'Authentication required.');
      return;
    }
    db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, session.tokenHash)).run();
    return { accountId: account.id, username: account.username, displayName: account.displayName, role: account.role === 'admin' ? 'admin' : 'user', csrf: session.csrf, tokenHash: session.tokenHash };
  };

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try { sqlite.prepare('SELECT 1').get(); return { status: 'ready' }; } catch { return reply.code(503).send({ status: 'not-ready' }); }
  });
  app.get('/api/manifest', async () => ({ id: 'playiku', name: 'Playiku', subtitle: 'Casual Games', version: process.env.APP_VERSION ?? '0.1.0', buildDate: process.env.BUILD_DATE ?? 'development', gitSha: process.env.GIT_SHA ?? 'development', schemaVersion: 1, license: 'Apache-2.0', repository: 'https://github.com/MaroIshiku/playiku' }));

  app.get('/api/setup', async () => ({ required: !db.select().from(accounts).limit(1).get() }));
  app.post('/api/setup', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (db.select().from(accounts).limit(1).get()) return error(reply, request, 404, 'SETUP_CLOSED', 'Setup is not available.');
    const input = setupSchema.safeParse(request.body);
    if (!input.success || !options.setupSecret || !safeEqual(input.data.setupSecret, options.setupSecret)) {
      audit('setup_attempt', null, 'failed', request.id);
      return error(reply, request, 403, 'SETUP_INVALID', 'Setup could not be completed.');
    }
    if (safeEqual(input.data.password, input.data.setupSecret)) return error(reply, request, 400, 'SETUP_PASSWORD_REUSED', 'Administrator password must differ from the setup secret.');
    const passwordHash = await argon2.hash(input.data.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const createAccount = () => transaction(() => {
      const result = sqlite.prepare('INSERT INTO accounts (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(input.data.username, input.data.displayName, passwordHash, 'admin', Date.now());
      sqlite.prepare('INSERT INTO setup_state (id, completed_at) VALUES (1, ?)').run(Date.now());
      sqlite.prepare('INSERT INTO user_settings (account_id, value_json, updated_at) VALUES (?, ?, ?)').run(Number(result.lastInsertRowid), JSON.stringify(defaultSettings), Date.now());
      return Number(result.lastInsertRowid);
    });
    const accountId = createAccount();
    audit('setup_completed', accountId, 'success', request.id);
    return reply.code(201).send({ created: true });
  });

  app.post('/api/session', { config: { rateLimit: { max: 8, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const input = loginSchema.safeParse(request.body);
    const account = input.success ? db.select().from(accounts).where(eq(accounts.username, input.data.username)).get() : undefined;
    const valid = account && input.success ? await argon2.verify(account.passwordHash, input.data.password) : false;
    if (!valid || !account) {
      audit('sign_in', account?.id ?? null, 'failed', request.id);
      return error(reply, request, 401, 'AUTH_INVALID', 'Invalid credentials.');
    }
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    const now = Date.now();
    db.insert(sessions).values({ tokenHash: hashToken(token), accountId: account.id, csrf, createdAt: now, lastSeenAt: now, expiresAt: now + ABSOLUTE_MS }).run();
    reply.setCookie(sessionCookie, token, { path: '/', httpOnly: true, secure: options.cookieSecure, sameSite: 'strict', maxAge: ABSOLUTE_MS / 1000 });
    audit('sign_in', account.id, 'success', request.id);
    return { csrf, user: { username: account.username, displayName: account.displayName, role: account.role === 'admin' ? 'admin' : 'user' } };
  });

  app.get('/api/session', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    return { csrf: auth.csrf, user: { username: auth.username, displayName: auth.displayName, role: auth.role } };
  });

  app.delete('/api/session', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    db.delete(sessions).where(eq(sessions.tokenHash, auth.tokenHash)).run();
    reply.clearCookie(sessionCookie, { path: '/', secure: options.cookieSecure, sameSite: 'strict' });
    audit('sign_out', auth.accountId, 'success', request.id);
    return reply.code(204).send();
  });

  app.get('/api/accounts', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    if (auth.role !== 'admin') return error(reply, request, 403, 'AUTH_FORBIDDEN', 'Request denied.');
    return (sqlite.prepare('SELECT id, username, display_name, role, created_at FROM accounts ORDER BY created_at, id').all() as { id: number; username: string; display_name: string; role: string; created_at: number }[]).map((account) => ({ id: account.id, username: account.username, displayName: account.display_name, role: account.role, createdAt: account.created_at }));
  });

  app.post('/api/accounts', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    if (auth.role !== 'admin') return error(reply, request, 403, 'AUTH_FORBIDDEN', 'Request denied.');
    const input = accountSchema.safeParse(request.body);
    if (!input.success) return error(reply, request, 400, 'VALIDATION_ERROR', 'Account details are invalid.');
    if (db.select().from(accounts).where(eq(accounts.username, input.data.username)).get()) return error(reply, request, 409, 'ACCOUNT_EXISTS', 'That username is already in use.');
    const passwordHash = await argon2.hash(input.data.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const accountId = transaction(() => {
      const result = sqlite.prepare('INSERT INTO accounts (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(input.data.username, input.data.displayName, passwordHash, 'user', Date.now());
      sqlite.prepare('INSERT INTO user_settings (account_id, value_json, updated_at) VALUES (?, ?, ?)').run(Number(result.lastInsertRowid), JSON.stringify(defaultSettings), Date.now());
      return Number(result.lastInsertRowid);
    });
    audit('account_created', auth.accountId, 'success', request.id);
    return reply.code(201).send({ id: accountId, username: input.data.username, displayName: input.data.displayName, role: 'user' });
  });

  app.delete('/api/accounts/:accountId', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    if (auth.role !== 'admin') return error(reply, request, 403, 'AUTH_FORBIDDEN', 'Request denied.');
    const accountId = z.coerce.number().int().positive().safeParse((request.params as { accountId?: string }).accountId);
    if (!accountId.success) return error(reply, request, 400, 'VALIDATION_ERROR', 'Account identifier is invalid.');
    if (accountId.data === auth.accountId) return error(reply, request, 400, 'ACCOUNT_SELF_DELETE', 'The active administrator cannot be deleted.');
    const target = db.select().from(accounts).where(eq(accounts.id, accountId.data)).get();
    if (!target) return error(reply, request, 404, 'NOT_FOUND', 'Account not found.');
    transaction(() => sqlite.prepare('DELETE FROM accounts WHERE id = ?').run(accountId.data));
    audit('account_deleted', auth.accountId, 'success', request.id);
    return reply.code(204).send();
  });

  app.get('/api/state', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    const settingsRow = sqlite.prepare('SELECT value_json FROM user_settings WHERE account_id = ?').get(auth.accountId) as { value_json?: string } | undefined;
    const favorites = (sqlite.prepare('SELECT game_id FROM favorites WHERE account_id = ? ORDER BY position, game_id').all(auth.accountId) as { game_id: string }[]).map((row) => row.game_id);
    const activeSessions = sqlite.prepare('SELECT game_id, state_json, updated_at FROM game_sessions WHERE account_id = ? ORDER BY updated_at DESC').all(auth.accountId) as { game_id: string; state_json: string; updated_at: number }[];
    const statistics = sqlite.prepare('SELECT * FROM game_statistics WHERE account_id = ? ORDER BY last_played_at DESC').all(auth.accountId);
    const achievements = (sqlite.prepare('SELECT achievement_id, unlocked_at FROM achievements WHERE account_id = ? ORDER BY unlocked_at').all(auth.accountId) as { achievement_id: string; unlocked_at: number }[]).map((row) => ({ id: row.achievement_id, unlockedAt: row.unlocked_at }));
    return { settings: parseStoredSettings(settingsRow?.value_json), favorites, activeSessions: activeSessions.map((row) => ({ gameId: row.game_id, state: JSON.parse(row.state_json), updatedAt: row.updated_at })), statistics, achievements };
  });

  app.put('/api/settings', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    const input = settingsSchema.safeParse(request.body);
    if (!input.success) return error(reply, request, 400, 'VALIDATION_ERROR', 'Settings are invalid.');
    sqlite.prepare('INSERT INTO user_settings (account_id, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at').run(auth.accountId, JSON.stringify(input.data), Date.now());
    return input.data;
  });

  app.put('/api/favorites/:gameId', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    const gameId = gameIdSchema.safeParse((request.params as { gameId?: string }).gameId);
    const favorite = z.object({ favorite: z.boolean() }).strict().safeParse(request.body);
    if (!gameId.success || !favorite.success) return error(reply, request, 400, 'VALIDATION_ERROR', 'Favorite is invalid.');
    if (favorite.data.favorite) sqlite.prepare('INSERT OR IGNORE INTO favorites (account_id, game_id, position) VALUES (?, ?, ?)').run(auth.accountId, gameId.data, Date.now());
    else sqlite.prepare('DELETE FROM favorites WHERE account_id = ? AND game_id = ?').run(auth.accountId, gameId.data);
    return { gameId: gameId.data, favorite: favorite.data.favorite };
  });

  app.put('/api/games/:gameId/session', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    const gameId = gameIdSchema.safeParse((request.params as { gameId?: string }).gameId);
    const input = stateSchema.safeParse(request.body);
    if (!gameId.success || !input.success || Buffer.byteLength(JSON.stringify(input.data.state)) > MAX_STATE_BYTES) return error(reply, request, 400, 'VALIDATION_ERROR', 'Game state is invalid or too large.');
    if (input.data.completed) sqlite.prepare('DELETE FROM game_sessions WHERE account_id = ? AND game_id = ?').run(auth.accountId, gameId.data);
    else sqlite.prepare('INSERT INTO game_sessions (account_id, game_id, state_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, game_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at').run(auth.accountId, gameId.data, JSON.stringify(input.data.state), Date.now());
    return { saved: !input.data.completed };
  });

  app.post('/api/statistics', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    const input = statisticsSchema.safeParse(request.body);
    if (!input.success) return error(reply, request, 400, 'VALIDATION_ERROR', 'Statistic is invalid.');
    const won = input.data.outcome === 'won' ? 1 : 0;
    const played = input.data.outcome === 'started' ? 1 : 0;
    sqlite.prepare(`INSERT INTO game_statistics (account_id, game_id, games_played, games_won, total_play_ms, best_score, best_time_ms, current_streak, longest_streak, last_played_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, game_id) DO UPDATE SET
        games_played = games_played + excluded.games_played,
        games_won = games_won + excluded.games_won,
        total_play_ms = total_play_ms + excluded.total_play_ms,
        best_score = CASE WHEN excluded.best_score IS NULL THEN best_score WHEN best_score IS NULL OR excluded.best_score > best_score THEN excluded.best_score ELSE best_score END,
        best_time_ms = CASE WHEN excluded.best_time_ms IS NULL THEN best_time_ms WHEN best_time_ms IS NULL OR excluded.best_time_ms < best_time_ms THEN excluded.best_time_ms ELSE best_time_ms END,
        current_streak = CASE WHEN ? = 1 THEN current_streak + 1 WHEN ? = 1 THEN 0 ELSE current_streak END,
        longest_streak = MAX(longest_streak, CASE WHEN ? = 1 THEN current_streak + 1 ELSE longest_streak END),
        last_played_at = excluded.last_played_at`).run(auth.accountId, input.data.gameId, played, won, input.data.durationMs, input.data.score ?? null, won ? input.data.durationMs : null, won, won, Date.now(), won, input.data.outcome === 'lost' ? 1 : 0, won);
    if (input.data.dailyDate && won) sqlite.prepare('INSERT OR IGNORE INTO daily_results (account_id, game_id, challenge_date, completed_at) VALUES (?, ?, ?, ?)').run(auth.accountId, input.data.gameId, input.data.dailyDate, Date.now());
    const totals = sqlite.prepare('SELECT COALESCE(SUM(games_played), 0) AS played, COALESCE(SUM(games_won), 0) AS won FROM game_statistics WHERE account_id = ?').get(auth.accountId) as { played: number; won: number };
    const unlock = (id: string) => sqlite.prepare('INSERT OR IGNORE INTO achievements (account_id, achievement_id, unlocked_at) VALUES (?, ?, ?)').run(auth.accountId, id, Date.now());
    if (totals.won >= 1) unlock('first_win');
    if (totals.played >= 10) unlock('ten_games');
    if (input.data.gameId === '2048' && (input.data.score ?? 0) >= 2048) unlock('2048_tile');
    return reply.code(201).send({ recorded: true });
  });

  app.delete('/api/history', async (request, reply) => {
    const auth = await authenticate(request, reply, true);
    if (!auth) return;
    const input = z.object({ type: z.enum(['sessions', 'statistics', 'all']) }).strict().safeParse(request.body);
    if (!input.success) return error(reply, request, 400, 'VALIDATION_ERROR', 'Deletion request is invalid.');
    const deleteData = () => transaction(() => {
      if (input.data.type !== 'statistics') sqlite.prepare('DELETE FROM game_sessions WHERE account_id = ?').run(auth.accountId);
      if (input.data.type !== 'sessions') {
        sqlite.prepare('DELETE FROM game_statistics WHERE account_id = ?').run(auth.accountId);
        sqlite.prepare('DELETE FROM daily_results WHERE account_id = ?').run(auth.accountId);
        sqlite.prepare('DELETE FROM achievements WHERE account_id = ?').run(auth.accountId);
      }
    });
    deleteData();
    audit('game_data_deleted', auth.accountId, 'success', request.id);
    return reply.code(204).send();
  });

  app.get('/api/daily/:gameId', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    const gameId = gameIdSchema.safeParse((request.params as { gameId?: string }).gameId);
    if (!gameId.success || !['sudoku', 'minesweeper', '2048', 'nonogram'].includes(gameId.data)) return error(reply, request, 404, 'NOT_FOUND', 'Daily challenge is unavailable.');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: options.timezone ?? 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const date = `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
    return { gameId: gameId.data, date, seed: createHash('sha256').update(`playiku:v1:${gameId.data}:${date}`).digest('hex').slice(0, 16) };
  });

  app.setErrorHandler((cause, request, reply) => {
    request.log.error({ err: cause }, 'request failed');
    const statusCode = typeof cause === 'object' && cause !== null && 'statusCode' in cause && typeof cause.statusCode === 'number' ? cause.statusCode : 500;
    const message = cause instanceof Error ? cause.message : 'The request could not be completed.';
    if (!reply.sent) error(reply, request, statusCode < 500 ? statusCode : 500, statusCode < 500 ? 'REQUEST_ERROR' : 'INTERNAL_ERROR', statusCode < 500 ? message : 'The request could not be completed.');
  });

  const clientRoot = resolve('dist/client');
  if (options.serveFrontend !== false && existsSync(join(clientRoot, 'index.html'))) {
    await app.register(fastifyStatic, { root: clientRoot, wildcard: false, maxAge: '1h', immutable: false });
    app.get('/*', async (_request, reply) => reply.sendFile('index.html', { maxAge: 0, immutable: false }));
  }

  app.addHook('onClose', async () => sqlite.close());
  return app;
}

export const defaultSettings = { theme: 'lavender', mode: 'system', sound: true, haptics: true, animations: true, reducedMotion: false, autoResume: true } as const;
