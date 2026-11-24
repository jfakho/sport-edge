import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('service worker bypasses both exact /api and nested /api/ paths', () => {
  assert.match(source, /pathname\s*===\s*['"]\/api['"]/);
  assert.match(source, /pathname\.startsWith\(['"]\/api\/['"]\)/);
  assert.match(source, /if\s*\(.*pathname.*\)return;/);
});
