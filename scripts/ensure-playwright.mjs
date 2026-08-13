import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('playwright')), 'cli.js');
const args = [cli, 'install', ...(process.platform === 'linux' ? ['--with-deps'] : []), 'chromium', 'firefox'];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
