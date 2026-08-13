import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  createdAt: integer('created_at').notNull()
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: integer('account_id').notNull(),
  csrf: text('csrf').notNull(),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  expiresAt: integer('expires_at').notNull()
});

const migration = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS setup_state (id INTEGER PRIMARY KEY CHECK (id = 1), completed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_settings (account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS favorites (account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, game_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account_id, game_id));
CREATE TABLE IF NOT EXISTS game_sessions (account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, game_id TEXT NOT NULL, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, game_id));
CREATE TABLE IF NOT EXISTS game_statistics (account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, game_id TEXT NOT NULL, games_played INTEGER NOT NULL DEFAULT 0, games_won INTEGER NOT NULL DEFAULT 0, total_play_ms INTEGER NOT NULL DEFAULT 0, best_score INTEGER, best_time_ms INTEGER, current_streak INTEGER NOT NULL DEFAULT 0, longest_streak INTEGER NOT NULL DEFAULT 0, last_played_at INTEGER, PRIMARY KEY (account_id, game_id));
CREATE TABLE IF NOT EXISTS daily_results (account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, game_id TEXT NOT NULL, challenge_date TEXT NOT NULL, completed_at INTEGER NOT NULL, PRIMARY KEY (account_id, game_id, challenge_date));
CREATE TABLE IF NOT EXISTS achievements (account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, achievement_id TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY (account_id, achievement_id));
CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY, event_type TEXT NOT NULL, actor_id INTEGER, result TEXT NOT NULL, request_id TEXT NOT NULL, occurred_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS statistics_recent_idx ON game_statistics(account_id, last_played_at DESC);
PRAGMA user_version = 1;
`;

export function openDatabase(path: string) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  sqlite.exec(migration);
  return { sqlite, db: drizzle({ client: sqlite }) };
}
