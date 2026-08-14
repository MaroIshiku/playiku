import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(resolve(root, '.ishiku/design-system.lock'), 'utf8'));
const expected = { id: 'ishiku-design-5', version: '5.0.0', application: 'playiku', authentication: 'standard-account', locale: 'en' };

if (lock.contract?.id !== expected.id || lock.contract?.version !== expected.version || lock.application?.id !== expected.application || lock.application?.authentication !== expected.authentication || lock.application?.locale !== expected.locale) {
  throw new Error('The design-system lock metadata does not match the Playiku v5 contract.');
}

for (const item of lock.implementation ?? []) {
  const actual = createHash('sha256').update(readFileSync(resolve(root, item.path))).digest('hex');
  if (actual !== item.sha256) throw new Error(`Design implementation drift detected in ${item.path}. Re-review the change and refresh the approved lock.`);
}

console.log(`Verified ${lock.implementation.length} design implementation artifacts against ${lock.contract.id} ${lock.contract.version}.`);
