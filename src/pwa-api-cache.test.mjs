import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/sw.js'), 'utf8');

test('PWA service worker bypasses cache for exact /api and nested API routes', () => {
  const apiGuard = sw.indexOf("pathname === '/api'");
  const nestedGuard = sw.indexOf("pathname.startsWith('/api/')");
  const cacheLookup = sw.indexOf('caches.match(request)');
  assert.ok(apiGuard >= 0, 'Missing exact /api bypass');
  assert.ok(nestedGuard > apiGuard, 'Missing nested API bypass');
  assert.ok(cacheLookup > nestedGuard, 'API bypass must precede cache lookup');
  assert.match(sw, /if\([^\n]*pathname === '\/api'\s*\|\|[^\n]*pathname\.startsWith\('\/api\/'\)\)return;/);
});
