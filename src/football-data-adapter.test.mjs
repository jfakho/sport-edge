import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPETITIONS, normalizeFootballDataMatch, normalizeFootballDataSeason, footballDataFreshness, selectUpcomingMatches} from './football-data-adapter.mjs';
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
 assert.equal(r.time,'22:00');
 assert.equal(r._kickoffUtc,'2026-11-10T21:00:00.000Z');
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

test('displays kick-off in Paris local time across midnight and winter DST',()=>{
 const r=normalizeFootballDataMatch({...base,utcDate:'2026-11-10T23:45:00Z'},'fr.1',fixedNow);
 assert.equal(r.date,'2026-11-11');
 assert.equal(r.time,'00:45');
});
test('displays summer kick-off in Paris CEST',()=>{
 const r=normalizeFootballDataMatch({...base,utcDate:'2026-07-10T19:45:00Z'},'fr.1',fixedNow);
 assert.equal(r.date,'2026-07-10');
 assert.equal(r.time,'21:45');
});
test('freshness uses exact UTC kick-off, not localized Paris time',()=>{
 const match=normalizeFootballDataMatch(base,'fr.1',fixedNow);
 const freshness=footballDataFreshness([match],new Date('2026-11-11T00:00:00Z'));
 assert.equal(freshness.latestFinishedAt,'2026-11-10T21:00:00.000Z');
 assert.equal(freshness.hoursSinceLatestFinished,3);
});

test('international competitions are mapped to football-data.org codes',()=>{
 assert.equal(COMPETITIONS['intl.cl'],'CL');
 assert.equal(COMPETITIONS['intl.wc'],'WC');
 assert.equal(COMPETITIONS['intl.ec'],'EC');
});

test('featured fixtures exclude in-play and paused matches and past kickoffs',()=>{
 const future='2026-11-14T20:00:00.000Z';
 const fixtures=[
  {_status:'IN_PLAY',score:null,_kickoffUtc:future},
  {_status:'PAUSED',score:null,_kickoffUtc:future},
  {_status:'TIMED',score:null,_kickoffUtc:future},
  {_status:'SCHEDULED',score:null,_kickoffUtc:future},
  {_status:'SCHEDULED',score:null,_kickoffUtc:'2026-11-10T20:00:00.000Z'},
 ];
 assert.deepEqual(selectUpcomingMatches(fixtures,fixedNow),[fixtures[2],fixtures[3]]);
});

test('upcoming fixtures sort by actual UTC kickoff even when provider order is reversed',()=>{
 const later={_sourceId:8,_status:'SCHEDULED',score:null,_kickoffUtc:'2026-11-16T20:00:00Z'};
 const sooner={_sourceId:9,_status:'TIMED',score:null,_kickoffUtc:'2026-11-13T20:00:00Z'};
 const input=[later,sooner];
 assert.deepEqual(selectUpcomingMatches(input,fixedNow,1),[sooner]);
 assert.deepEqual(input,[later,sooner], 'cached provider data must not be mutated');
});
test('upcoming fixtures reject invalid limits and ignore null entries',()=>{
 assert.deepEqual(selectUpcomingMatches([null,{_status:'SCHEDULED',score:null,_kickoffUtc:'2026-11-14T20:00:00Z'}],fixedNow).length,1);
 assert.throws(()=>selectUpcomingMatches([],fixedNow,-1),RangeError);
 assert.throws(()=>selectUpcomingMatches([],fixedNow,1.5),RangeError);
});

test('excludes contradictory duplicate provider IDs instead of trusting the last score',()=>{
 const contradictory={...base,score:{...base.score,fullTime:{home:0,away:3}}};
 const clean={...base,id:125};
 const rows=normalizeFootballDataSeason({matches:[base,clean,contradictory,base]},'fr.1',fixedNow);
 assert.deepEqual(rows.map(m=>m._sourceId),[125]);
});
test('identical duplicate provider records remain deduplicated',()=>{
 const rows=normalizeFootballDataSeason({matches:[base,{...base}]},'fr.1',fixedNow);
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0].score,{ft:[2,1],ht:[1,1]});
});
