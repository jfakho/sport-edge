import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

const origin = 'https://preview.example.test';
const request = (path) => new Request(origin + path);

// Build-time secrets are not proof that a deployed Worker has runtime bindings.
test('preview status reports missing runtime football secret without exposing values', async () => {
  const response = await worker.fetch(request('/api/status'), {}, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.footballDataConfigured, false);
  assert.equal(body.liveScores, false);
  assert.equal(JSON.stringify(body).includes('FOOTBALL_DATA_API_KEY'), false);
});

test('preview match endpoint fails closed when runtime secret is absent', async () => {
  const response = await worker.fetch(request('/api/football/fr.1'), {}, {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).ok, false);
});

test('preview featured endpoint fails closed when runtime secret is absent', async () => {
  const response = await worker.fetch(request('/api/football-featured'), {}, {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).ok, false);
});
