import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/sw.js'), 'utf8');

test('PWA service worker bypasses cache for all live API routes', () => {
  const apiGuard = sw.indexOf("pathname.startsWith('/api/')");
  const cacheLookup = sw.indexOf('caches.match(request)');
  assert.ok(apiGuard > 0, 'Missing API bypass guard');
  assert.ok(cacheLookup > apiGuard, 'API bypass must precede cache lookup');
  assert.match(sw, /if\(new URL\(request\.url\)\.pathname\.startsWith\('\/api\/'\)\)return;/);
});
