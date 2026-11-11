import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(join(root,'public/index.html'),'utf8');
const css=readFileSync(join(root,'public/cotego-rework.css'),'utf8');
const manifest=JSON.parse(readFileSync(join(root,'public/manifest.webmanifest'),'utf8'));

test('home route is visible by default and original dashboard is separate',()=>{
  assert.match(source,/<section class="page visible" id="page-home">/);
  assert.match(source,/<section class="page" id="page-dashboard">/);
  assert.match(source,/currentPage: 'home'/);
});

test('featured content is restricted to four cards without replacing the full catalog',()=>{
  assert.match(source,/\.slice\(0,4\)/);
  assert.match(source,/function renderFeatured\(\)/);
  assert.match(source,/id="featured-grid"/);
  assert.match(source,/data-link="dashboard"/);
});

test('mobile navigation and about sources page exist',()=>{
  assert.match(source,/class="cotego-bottom-nav"/);
  assert.match(source,/id="page-about"/);
  assert.match(css,/\.cotego-bottom-nav/);
  assert.match(source,/Football data provided by the Football-Data.org API/);
  assert.match(source,/Powered by SportScore/);
});

test('VIP remains a transparent sandbox, never a real checkout by accident',()=>{
  assert.match(source,/9,90 € <span>\/ mois envisagés/);
  assert.match(source,/Aucun achat réel n'est possible actuellement/);
  assert.match(source,/buy\.stripe\.com\/test_/);
  assert.match(source,/id="checkout-test-link"/);
});

test('PWA is linked and has a stable identity and service worker registration',()=>{
  assert.match(source,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(source,/serviceWorker\.register\('\/sw\.js'\)/);
  assert.equal(manifest.id,'/');
  assert.equal(manifest.display,'standalone');
});

test('inline app JavaScript has valid syntax',()=>{
  const inline=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(inline.length>=2);
  for (const [,code] of inline) new Script(code);
});
