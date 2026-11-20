import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const engine=runInNewContext(`
  ${section('const TIERS =','const state =')}
  ${section('const MARKET_TYPES =','function escapeHtml')}
  function today(){return '2026-11-15';}
  function daysBetween(a,b){return (Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000;}
  function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x));}
  ${section('function weightedMean(', 'function goalTotals(')}
  ${section('function evaluateTiers(', 'function renderHistory(')}
  ${section('function normalize(raw,league)', 'function decodeDataset(')}
  ({forecast,evaluateTiers,normalize,MARKET_TYPES});
`);
const plain=value=>JSON.parse(JSON.stringify(value));

test('past scenario outcomes evaluate every supported market, including losing picks',()=>{
  const analysis={tiers:engine.MARKET_TYPES.map(([code])=>({target:1.5,market:{code,p:.6}}))};
  const outcomes=plain(engine.evaluateTiers(analysis,[2,1]));
  const expected={home:true,draw:false,away:false,'1X':true,X2:false,'12':true,
    o05:true,o15:true,o25:true,o35:false,u15:false,u25:false,u35:true,
    btts:true,notbtts:false,hg05:true,ag05:true,hg15:true,ag15:false};
  for(const row of outcomes) assert.equal(row.hit,expected[row.market.code],row.market.code);
  assert.equal(outcomes.length,19);
  assert.ok(outcomes.some(row=>!row.hit),'Losses must not disappear');
});

test('missing market or invalid score never becomes a successful historical scenario',()=>{
  const analysis={tiers:[{target:1.5,market:null},{target:2,market:{code:'unknown'}}]};
  assert.deepEqual(plain(engine.evaluateTiers(analysis,[0,0])).map(t=>t.hit),[null,null]);
  for(const score of [null,[1],[1,-1],[1,'2'],[1,36]]) assert.deepEqual(plain(engine.evaluateTiers(analysis,score)),[]);
});

test('retrospective forecast ignores the evaluated score and every later result',()=>{
  const previous=Array.from({length:30},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,
    home:i%2?'A':'B',away:i%2?'B':'A',score:[i%3,(i+1)%3]}));
  const match={date:'2026-11-05',home:'A',away:'B',score:[2,1]};
  const later={date:'2026-11-07',home:'A',away:'B',score:[7,0]};
  const initial=plain(engine.forecast(match,[...previous,match,later]));
  const revised=plain(engine.forecast({...match,score:[0,9]},[...previous,{...match,score:[0,9]},{...later,score:[0,8]}]));
  assert.deepEqual(initial,revised);
  assert.equal(initial.historyCount,30);
});

test('provider identity survives a display name correction and keeps the Paris clubs separate',()=>{
  const match={date:'2026-11-21',team1:'Paris Saint-Germain FC',team2:'Paris FC',
    _sourceId:559623,_teamIds:[524,1045]};
  const original=engine.normalize(match,'fr.1');
  const corrected=engine.normalize({...match,team1:'Paris Saint-Germain'},'fr.1');
  assert.equal(original.id,corrected.id);
  assert.deepEqual(plain(corrected.teamIds),[524,1045]);
  assert.notEqual(corrected.id,engine.normalize({...match,_sourceId:559624},'fr.1').id);
});

test('restricted server forecasts are never expanded by the client model',()=>{
 const restricted={restricted:true,tiers:[{target:1.5,market:{name:'Free choice',p:.6}}],historyCount:20};
 const match={date:'2026-11-21',home:'A',away:'B',analysisAccess:{mode:'freemium'},recordedPrediction:{analysis:restricted}};
 assert.equal(engine.forecast(match,[]),restricted);
 assert.equal(engine.forecast({...match,recordedPrediction:null},[]),null);
});
