import { buildApp } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const app = await buildApp({ databasePath: config.DATABASE_PATH, cookieSecure: config.COOKIE_SECURE, setupSecret: config.setupSecret, timezone: config.TZ });
await app.listen({ host: config.HOST, port: config.PORT });
