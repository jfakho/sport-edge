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
  assert.equal(settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,finishedAt:'2026-11-14T17:00:00Z'}).hit,true);
  assert.equal(settleFootballPrediction(p,{status:'FINISHED',home:2,away:1}).status,'unverifiable');
});
test('reports hit rate only over evaluated predictions and deduplicates',()=>{
  const p=createPredictionRecord(fixture,before);
  const good={prediction:p,evaluation:settleFootballPrediction(p,{status:'FINISHED',home:2,away:1,finishedAt:'2026-11-14T17:00:00Z'})};
  const pending={prediction:{...p,id:'other'},evaluation:{status:'pending'}};
  assert.deepEqual(summarizePredictions([good,good,pending]),{
    total:2,evaluated:1,pending:1,unverifiable:0,hits:1,hitRate:1,
    averageBrierScore:(.65-1)**2,
  });
});
test('never implies a hit rate with zero settled results',()=>{
  assert.equal(summarizePredictions([]).hitRate,null);
});
