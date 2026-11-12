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

test('featured content is restricted to three cards without replacing the full catalog',()=>{
  assert.match(source,/\.slice\(0,3\)/);
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


test('all multi-element actions use querySelectorAll helper instead of querySelector',()=>{
  const forbidden=/(?<!\$)\$\((?:'[^']+'|"[^"]+")\)\.(?:forEach|map|filter|some|every)\s*\(/g;
  assert.doesNotMatch(source,forbidden,'$ selects one element; use $$ for collections');
  for(const selector of ['.home-tab','.odd-input','.page','.nav-item','.cotego-bottom-nav button']) {
    assert.ok(source.includes(`$$('${selector}').forEach`),`Missing collection iteration for ${selector}`);
  }
});


test('match detail action opens the modal and navigation uses valid multi-select helper', () => {
  assert.doesNotMatch(source, /\$\$\$\(/, 'Unknown $$$ helper would prevent click handlers from finishing');
  for (const selector of ['.home-tab','.odd-input','.page','.nav-item','.cotego-bottom-nav button']) {
    assert.ok(source.includes("$$('" + selector + "').forEach"), 'Broken selector for ' + selector);
  }
  assert.match(source, /const analyze=e\.target\.closest\('\[data-analyze\]'\);if\(analyze\)\{openAnalysis\(analyze\.dataset\.analyze\);return;\}/);
  assert.match(source, /function openAnalysis\(id\)\s*\{/);
  assert.match(source, /\$\('#analysis-modal'\)\.classList\.remove\('hidden'\)/);
});


test('football uses a single bounded recent-data API and never silently falls back to old archives',()=>{
  const start=source.indexOf('async function loadLeague(');
  const end=source.indexOf('function updateSourceHealth(',start);
  const loader=source.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.match(loader,/fetch\('\/api\/football\/'/);
  assert.match(loader,/new AbortController\(\)/);
  assert.match(loader,/setSourceUnavailable/);
  assert.doesNotMatch(loader,/raw\.githubusercontent\.com|applyData\(\[\.\.\.older/);
  assert.match(source,/data-retry-league/);
  assert.match(source,/if \(state\.dataError\)/);
});


test('sandbox subscription UI is included only as a non-secret external script',()=>{
 assert.match(source,/src="\/cotego-account-test\.js" defer/);
 assert.doesNotMatch(source,/sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}/);
});

test('approved light palette and three featured cards',()=>{assert.match(css,/--bg:#f6f4ef/);assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(source,/name="color-scheme" content="light"/);});

test('featured cards show all three scenario targets and their model probabilities',()=>{
  assert.match(source,/featured-scenarios/);
  assert.match(source,/for\(const tier of f\.tiers\)/);
  assert.match(source,/featured-scenario-target/);
  assert.match(source,/featured-scenario-prob/);
  assert.match(css,/\.featured-scenarios/);
});


test('analysis modal never renders infinite theoretical odds for missing scenarios',()=>{
  assert.match(source,/const theoreticalOdd=p>0 \? \(1\/p\)\.toFixed\(2\) : 'Indisponible'/);
  const start=source.indexOf('const tierHTML=f.tiers.map');
  const end=source.indexOf("}).join('');",start);
  const html=source.slice(start,end);
  assert.match(html,/\$\{theoreticalOdd\}/);
  assert.doesNotMatch(html,/\$\{\(1\/p\)\.toFixed\(2\)\}/);
});

test('sparse historical data uses transparent priors instead of suppressing forecasts',()=>{
  const start=source.indexOf('function forecast(match, all)');
  const end=source.indexOf('function poissonList(lambda)',start);
  const model=source.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.doesNotMatch(model,/if\s*\(previous\.length\s*<\s*24\)\s*return null/);
  assert.doesNotMatch(model,/if\s*\(playedHome\s*<\s*2\s*\|\|\s*playedAway\s*<\s*2\)\s*return null/);
  assert.match(model,/priorWeight=12/);
  assert.match(model,/Simulation sans historique/);
  assert.match(model,/Fiabilité très faible/);
});

test('homepage shows three scenarios and explicit confidence with historical sample size',()=>{
  assert.match(source,/className\s*=\s*['"]featured-scenarios/);
  assert.match(source,/for\(const tier of f\.tiers\)/);
  assert.match(source,/featured-confidence/);
  assert.match(source,/f\.historyCount\+' résultats historiques'/);
});
