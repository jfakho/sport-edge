import test from 'node:test';
import assert from 'node:assert/strict';
import {createPredictionRecord,settleFootballPrediction,summarizePredictions} from './prediction-audit.mjs';
const fixture={source:'football-data.org',sourceMatchId:123,sport:'football',competition:'PL',
  kickoffUtc:'2026-11-14T15:00:00Z',market:'home',probability:.65,modelVersion:'v1'};
const before=new Date('2026-11-14T12:00:00Z');
test('accepts immutable pre-match prediction with traceability',()=>{
  const p=createPredictionRecord(fixture,before);
  assert.equal(p.createdAt,before.toISOString());
  assert.equal(Object.isFrozen(p),true);
  assert.equal(p.probability,.65);
});
test('rejects post-kickoff predictions and invalid probabilities',()=>{
  assert.throws(()=>createPredictionRecord(fixture,new Date('2026-11-14T15:00:00Z')));
  assert.throws(()=>createPredictionRecord({...fixture,probability:1.2},before));
});
test('settles only finished verified fixtures',()=>{
  const p=createPredictionRecord(fixture,before);
  assert.equal(settleFootballPrediction(p,{status:'IN_PLAY'}).status,'pending');
  assert.equal(settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'}).hit,true);
  assert.equal(settleFootballPrediction(p,{status:'FINISHED',home:2,away:1}).status,'unverifiable');
});
test('reports hit rate only over evaluated predictions and deduplicates',()=>{
  const p=createPredictionRecord(fixture,before);
  const good={prediction:p,evaluation:settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'})};
  const pending={prediction:{...p,id:'other'},evaluation:{status:'pending'}};
  assert.deepEqual(summarizePredictions([good,good,pending]),{
    total:2,evaluated:1,pending:1,unverifiable:0,hits:1,hitRate:1,
    averageBrierScore:(.65-1)**2,
  });
});
test('never implies a hit rate with zero settled results',()=>{
  assert.equal(summarizePredictions([]).hitRate,null);
});

test('invalid clock fails with domain validation rather than RangeError',()=>{
 assert.throws(()=>createPredictionRecord(fixture,new Date('invalid')),/Prévision invalide/);
});
test('a verified score cannot settle a prediction for a different fixture',()=>{
 const p=createPredictionRecord(fixture,before);
 const final={status:'FINISHED',home:2,away:1,finishedAt:'2026-11-14T17:00:00Z',
   source:'football-data.org',sourceMatchId:'999'};
 assert.equal(settleFootballPrediction(p,final).status,'unverifiable');
 assert.equal(settleFootballPrediction(p,{...final,sourceMatchId:'123'}).status,'settled');
 assert.equal(settleFootballPrediction(p,{...final,source:'untrusted-source',sourceMatchId:'123'}).status,'unverifiable');
});

test('anonymous final results cannot inflate verified hit rate',()=>{
 const p=createPredictionRecord(fixture,before);
 const anonymous={status:'FINISHED',home:2,away:1,finishedAt:'2026-11-14T17:00:00Z'};
 const evaluation=settleFootballPrediction(p,anonymous);
 assert.equal(evaluation.status,'unverifiable');
 const summary=summarizePredictions([{prediction:p,evaluation}]);
 assert.equal(summary.evaluated,0);
 assert.equal(summary.hitRate,null);
});

test('malformed settled entries never inflate the public hit rate',()=>{
 const p=createPredictionRecord(fixture,before);
 const final={status:'FINISHED',home:2,away:1,finishedAt:'2026-11-14T17:00:00Z',
   source:'football-data.org',sourceMatchId:'123'};
 const valid={prediction:p,evaluation:settleFootballPrediction(p,final)};
 const fake={prediction:{...p,id:'fake'},evaluation:{status:'settled',hit:true,brierScore:0}};
 const impossible={prediction:{...p,id:'impossible'},evaluation:{status:'settled',hit:true,brierScore:0,actualScore:[2,1]}};
 const report=summarizePredictions([valid,fake,impossible]);
 assert.equal(report.evaluated,1);
 assert.equal(report.hits,1);
 assert.equal(report.hitRate,1);
});

test('a forged hit flag cannot override the verified final score',()=>{
 const p=createPredictionRecord(fixture,before);
 const real=settleFootballPrediction(p,{status:'FINISHED',home:0,away:2,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'});
 assert.equal(real.hit,false);
 const forged={...real,hit:true,brierScore:(p.probability-1)**2};
 const report=summarizePredictions([{prediction:p,evaluation:forged}]);
 assert.equal(report.evaluated,0);
 assert.equal(report.hitRate,null);
});
test('correctly recorded losing forecasts still count in the denominator',()=>{
 const p=createPredictionRecord(fixture,before);
 const evaluation=settleFootballPrediction(p,{status:'FINISHED',home:0,away:2,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'});
 const report=summarizePredictions([{prediction:p,evaluation}]);
 assert.equal(report.evaluated,1);
 assert.equal(report.hits,0);
 assert.equal(report.hitRate,0);
});

test('public statistics reject plausible scores without verified result provenance',()=>{
 const p=createPredictionRecord(fixture,before);
 const verified=settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'});
 assert.equal(verified.verifiedResult.sourceMatchId,'123');
 for(const evaluation of [
   {...verified,verifiedResult:undefined},
   {...verified,verifiedResult:{...verified.verifiedResult,sourceMatchId:'999'}},
   {...verified,verifiedResult:{...verified.verifiedResult,finishedAt:'2026-11-14T14:00:00Z'}},
 ]) {
   const report=summarizePredictions([{prediction:p,evaluation}]);
   assert.equal(report.evaluated,0);
   assert.equal(report.hitRate,null);
 }
 assert.equal(summarizePredictions([{prediction:p,evaluation:verified}]).evaluated,1);
});

test('numeric and string provider match IDs settle identically in published statistics',()=>{
 const p=createPredictionRecord(fixture,before);
 const evaluation=settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:123});
 assert.equal(evaluation.status,'settled');
 const numeric={...evaluation,verifiedResult:{...evaluation.verifiedResult,sourceMatchId:123}};
 assert.equal(summarizePredictions([{prediction:p,evaluation:numeric}]).evaluated,1);
 assert.equal(summarizePredictions([{prediction:p,evaluation:{...numeric,verifiedResult:{...numeric.verifiedResult,sourceMatchId:999}}}]).evaluated,0);
});


test('forged record IDs cannot inflate public prediction performance',()=>{
 const p=createPredictionRecord(fixture,before);
 const evaluation=settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'});
 assert.equal(summarizePredictions([{prediction:p,evaluation}]).evaluated,1);
 for(const forged of [{...p,id:'another-match'}, {...p,sourceMatchId:'999'}, {...p,modelVersion:'v2'}]) {
   const summary=summarizePredictions([{prediction:forged,evaluation}]);
   assert.equal(summary.evaluated,0);
   assert.equal(summary.hitRate,null);
 }
});

test('conflicting duplicate audit entries are quarantined regardless of order',()=>{
 const p=createPredictionRecord(fixture,before);
 const win=settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'});
 const loss=settleFootballPrediction(p,{status:'FINISHED',home:0,away:1,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'});
 const a={prediction:p,evaluation:win},b={prediction:p,evaluation:loss};
 for(const entries of [[a,b],[b,a],[a,b,a]]) {
   const report=summarizePredictions(entries);
   assert.equal(report.total,1);
   assert.equal(report.evaluated,0);
   assert.equal(report.unverifiable,1);
   assert.equal(report.hitRate,null);
 }
 assert.equal(summarizePredictions([a,a]).evaluated,1);
});

test('rejected settled predictions are counted as unverifiable, not silently omitted',()=>{
 const p=createPredictionRecord(fixture,before);
 const verified=settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,
   finishedAt:'2026-11-14T17:00:00Z',source:'football-data.org',sourceMatchId:'123'});
 const forged={prediction:{...p,id:'tampered'},evaluation:verified};
 const pending={prediction:{...p,id:'pending'},evaluation:{status:'pending'}};
 const report=summarizePredictions([{prediction:p,evaluation:verified},forged,pending]);
 assert.equal(report.total,3);
 assert.equal(report.evaluated,1);
 assert.equal(report.pending,1);
 assert.equal(report.unverifiable,1);
 assert.equal(report.hits,1);
 assert.equal(report.hitRate,1);
});
