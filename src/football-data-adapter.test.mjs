import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPETITIONS, normalizeFootballDataMatch, normalizeFootballDataSeason, footballDataFreshness} from './football-data-adapter.mjs';
const fixedNow = new Date('2026-11-11T12:00:00Z');
const base = {
 id:123, status:'FINISHED', utcDate:'2026-11-10T21:00:00Z',
 homeTeam:{id:1,name:'Paris FC'}, awayTeam:{id:2,name:'Rennes'},
 score:{fullTime:{home:2,away:1},halfTime:{home:1,away:1}},
};
test('supports Ligue 1 free-tier code',()=>assert.equal(COMPETITIONS['fr.1'],'FL1'));
test('maps a finished match into existing COTEGO dataset',()=>{
 const r=normalizeFootballDataMatch(base,'fr.1',fixedNow);
 assert.equal(r.date,'2026-11-10');
 assert.deepEqual(r.score,{ft:[2,1],ht:[1,1]});
 assert.equal(r.team1,'Paris FC');
});
test('an in-play score is NEVER training data',()=>{
 const r=normalizeFootballDataMatch({...base,status:'IN_PLAY'},'fr.1',fixedNow);
 assert.equal(r.score,null);
});
test('a future match never has a final score',()=>{
 const r=normalizeFootballDataMatch({...base,utcDate:'2026-11-22T20:00:00Z'},'fr.1',fixedNow);
 assert.equal(r.score,null);
});
test('refuses invalid finished scores',()=>{
 assert.equal(normalizeFootballDataMatch({...base,score:{fullTime:{home:null,away:1}}},'fr.1',fixedNow),null);
});
test('refuses cancelled games',()=>{
 assert.equal(normalizeFootballDataMatch({...base,status:'CANCELLED'},'fr.1',fixedNow),null);
});
test('deduplicates and sorts',()=>{
 const older={...base,id:124,utcDate:'2026-11-08T21:00:00Z'};
 const rows=normalizeFootballDataSeason({matches:[base,older,base]},'fr.1',fixedNow);
 assert.equal(rows.length,2);
 assert.equal(rows[0]._sourceId,124);
 assert.equal(rows[1]._sourceId,123);
});
test('alerts on stale archives',()=>{
 const report=footballDataFreshness([{date:'2026-09-20',time:'20:00',score:{ft:[1,0]}}],fixedNow);
 assert.equal(report.needsReview,true);
});
