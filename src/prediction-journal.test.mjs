import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditDatabase} from './sqlite-test-helper.mjs';
import {synchronizeJournal,readJournal,journalFeed} from './prediction-journal.mjs';
import {createFootballModel} from './forecast-model.mjs';

const now=new Date('2026-11-15T12:00:00Z');
const match={date:'2026-11-21',time:'20:00',team1:'Paris Saint-Germain',team2:'Paris FC',score:null,
  _teamIds:[524,1045],_sourceId:123,_kickoffUtc:'2026-11-21T19:00:00.000Z',_status:'TIMED'};
const comp={ok:true,league:'fr.1',matches:[match],historicalMatches:[]};

test('server recording uses the exact browser forecast and market definitions',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const server=readFileSync(new URL('./forecast-model.mjs',import.meta.url),'utf8');
  for(const [start,end] of [['const TIERS =','const state ='],['const MARKET_TYPES =','function escapeHtml'],['function weightedMean(','function goalTotals(']]){
    assert.ok(server.includes(html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start))).trim()),start);
  }
  assert.equal(createFootballModel('2026-11-15').forecast({date:'2026-11-21',home:'A',away:'B'},[]).tiers.length,3);
});
test('prediction survives repeated synchronizations and a model input change',async()=>{
  const db=auditDatabase();
  const first=await synchronizeJournal(db,comp,{now});
  const prediction=first.matches[0]._prediction;
  assert.equal(prediction.createdAt,now.toISOString());
  assert.equal(prediction.matchId,123);
  const histories=[{...match,_sourceId:124,date:'2026-11-10',_kickoffUtc:'2026-11-10T19:00:00.000Z',_status:'FINISHED',score:{ft:[6,0]}}];
  const next=await synchronizeJournal(db,{...comp,historicalMatches:histories},{now:new Date('2026-11-16T12:00:00Z')});
  assert.deepEqual(next.matches[0]._prediction,prediction);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM predictions').get().n,1);
  assert.throws(()=>db.sqlite.exec("UPDATE predictions SET home_name='altered'"),/immutable/);
});
test('no past prediction can be backfilled from a final score or a client clock',async()=>{
  const db=auditDatabase();
  await synchronizeJournal(db,{...comp,matches:[{...match,date:'2026-11-14',_kickoffUtc:'2026-11-14T19:00:00.000Z'}]},{now});
  const data=await readJournal(db,'fr.1');
  assert.equal(data.records.length,0);
  assert.equal(data.summary[0].hitRate,null);
});
test('settles saved scenarios from the matching verified final score, including losses',async()=>{
  const db=auditDatabase();
  await synchronizeJournal(db,comp,{now});
  const finished={...match,_status:'FINISHED',score:{ft:[0,0]}};
  await synchronizeJournal(db,{...comp,matches:[],historicalMatches:[finished]},{now:new Date('2026-11-22T12:00:00Z')});
  const {records,summary}=await readJournal(db,'fr.1');
  assert.deepEqual(records[0].finalScore,[0,0]);
  assert.ok(records[0].tiers.some(t=>t.hit===false));
  assert.ok(summary.every(t=>t.evaluated===1&&t.pending===0));
  assert.ok(summary.every(t=>Number.isFinite(t.brier)));
});
test('a different team identity or postponed kickoff cannot settle the saved fixture',async()=>{
  const db=auditDatabase();
  await synchronizeJournal(db,comp,{now});
  for(const changed of [{_teamIds:[524,81]},{_kickoffUtc:'2026-11-22T19:00:00.000Z'}]){
    await synchronizeJournal(db,{...comp,matches:[],historicalMatches:[{...match,...changed,_status:'FINISHED',score:{ft:[2,0]}}]},
      {now:new Date('2026-11-23T12:00:00Z')});
  }
  const data=await readJournal(db,'fr.1');
  assert.equal(data.records[0].finalScore,null);
  assert.equal(data.summary[0].evaluated,0);
});
test('missing storage is explicit rather than presenting retrospective results as recorded forecasts',async()=>{
  assert.equal((await journalFeed({competitions:[comp]},null)).journal.configured,false);
  assert.deepEqual(await readJournal(null,'fr.1'),{ok:true,configured:false,records:[],summary:null});
});

test('a journal failure in one competition does not discard another competition audit',async()=>{
  const db=auditDatabase();
  const broken={...comp,league:'en.1',matches:[{...match,_sourceId:456}]};
  const originalPrepare=db.prepare.bind(db);
  db.prepare=(sql)=>{
    if(sql.includes('SELECT * FROM predictions')) {
      const prepared=originalPrepare(sql);
      const bind=prepared.bind.bind(prepared);
      prepared.bind=(league,...rest)=>{
        if(league==='en.1')throw new Error('simulated league-specific storage failure');
        return bind(league,...rest);
      };
      return prepared;
    }
    return originalPrepare(sql);
  };
  const result=await journalFeed({competitions:[broken,comp]},db);
  assert.equal(result.journal.available,false);
  assert.equal(result.journal.failedCompetitions,1);
  assert.equal(result.competitions[0].journalAvailable,false);
  assert.equal(result.competitions[1].matches[0]._prediction.matchId,123);
});
