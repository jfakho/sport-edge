import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
test('PWA activation only deletes obsolete COTEGO shell caches', () => {
  assert.match(sw, /name\.startsWith\('cotego-shell-'\)/);
  assert.doesNotMatch(sw, /if\(name !== CACHE\) await caches\.delete\(name\)/);
});
test('PWA never caches API responses', () => {
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)\)return/);
});
