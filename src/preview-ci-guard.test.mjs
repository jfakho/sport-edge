import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regression guard: CI must never target the live custom domain while
// diagnosing preview configuration. This test needs no API credentials.
const workflow = readFileSync(new URL('../.github/workflows/cotego-tests.yml', import.meta.url), 'utf8');

test('preview smoke checks target only the isolated workers.dev preview', () => {
  assert.match(workflow, /feature-cotego-premium-ux-cotego\.salama-jimmy\.workers\.dev/);
  assert.doesNotMatch(workflow, /https?:\/\/(?:www\.)?cotego\.fr/);
});

test('preview smoke checks never print raw upstream response bodies', () => {
  assert.doesNotMatch(workflow, /(?:cat|head|tail)\s+\/tmp\/cotego-(?:football|featured|health)\.json/);
  assert.match(workflow, /response body withheld/);
});

test('preview CI preserves manual recheck without deployment', () => {
  assert.match(workflow, /workflow_dispatch:/);
});
