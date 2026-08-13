import { readFileSync } from 'node:fs';
import { z } from 'zod';

const schema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_PATH: z.string().default('/data/app.sqlite'),
  ISHIKU_SETUP_SECRET: z.string().min(32).max(1024).optional(),
  ISHIKU_SETUP_SECRET_FILE: z.string().optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  TZ: z.string().min(1).default('Europe/Berlin')
});

export function loadConfig(environment = process.env) {
  const value = schema.parse(environment);
  return {
    ...value,
    COOKIE_SECURE: value.COOKIE_SECURE === 'true',
    setupSecret: value.ISHIKU_SETUP_SECRET ?? (value.ISHIKU_SETUP_SECRET_FILE ? readFileSync(value.ISHIKU_SETUP_SECRET_FILE, 'utf8').trim() : undefined)
  };
}
