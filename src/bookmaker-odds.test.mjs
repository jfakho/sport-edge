import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDatabase} from './sqlite-test-helper.mjs';
import {matchOddsEvent,summarizeBookmakerOdds,reserveOddsCredits,readOddsBudget,getBookmakerOdds,dailyPriorityMatches,neededMarkets} from './bookmaker-odds.mjs';
const now=new Date('2026-11-21T18:00:00Z');
const fixture={home:'Paris Saint-Germain',away:'Paris FC',aliases:[['Paris Saint-Germain FC','Paris Saint-Germain','PSG'],['Paris FC']],kickoffUtc:'2026-11-21T19:00:00.000Z'};
const tiers=[{target:1.5,market:{code:'home',name:'Victoire domicile',p:.66}},{target:2,market:{code:'o25',name:'Plus de 2,5 buts',p:.5}},{target:3,market:{code:'btts',name:'Les deux équipes marquent',p:.33}}];
const event={id:'event1',sport_key:'soccer_france_ligue_one',home_team:'Paris Saint Germain',away_team:'Paris FC',commence_time:fixture.kickoffUtc};
const book=(key,price)=>({key,last_update:now.toISOString(),markets:[{key:'h2h',outcomes:[{name:event.home_team,price},{name:event.away_team,price:8},{name:'Draw',price:4}]},{key:'alternate_totals',outcomes:[{name:'Over',point:2.5,price:1.9},{name:'Over',point:3.5,price:2.7}]},{key:'btts',outcomes:[{name:'Yes',price:1.8},{name:'No',price:2.1}]}]});
const raw={date:'2026-11-21',team1:fixture.home,team2:fixture.away,_kickoffUtc:fixture.kickoffUtc,_sourceId:1,_teamIds:[524,1045],_status:'TIMED',score:null};
async function seed(db,id=1,analysis={tiers}){
  await db.prepare(`INSERT INTO predictions(match_id,competition,kickoff_utc,created_at,home_id,away_id,home_name,away_name,aliases_json,model_version,analysis_json) VALUES(?,'fr.1',?,'2026-11-20T12:00:00.000Z',524,1045,?, ?,?,'test',?)`)
    .bind(id,fixture.kickoffUtc,fixture.home,fixture.away,JSON.stringify(fixture.aliases),JSON.stringify(analysis)).run();
}
test('event matching keeps the Paris clubs distinct, rejects swapped, ambiguous and wrong-time fixtures',()=>{
 assert.equal(matchOddsEvent(fixture,[event],'fr.1').id,event.id);
 for(const invalid of [{...event,home_team:'Paris FC',away_team:'Paris Saint Germain'},{...event,commence_time:'2026-11-21T20:00:00Z'},{...event,sport_key:'soccer_epl'}])assert.equal(matchOddsEvent(fixture,[invalid],'fr.1'),null);
 assert.equal(matchOddsEvent(fixture,[event,{...event,id:'another'}],'fr.1'),null);
});
test('averages only the requested market/line from the three French bookmakers',()=>{
 const result=summarizeBookmakerOdds({...event,bookmakers:[book('betclic_fr',1.5),book('unibet_fr',1.6),book('winamax_fr',1.7),book('other',9)]},tiers,now);
 assert.equal(result[0].average,(1.5+1.6+1.7)/3);
 assert.equal(result[0].books.length,3);
 assert.ok(Math.abs(result[1].average-1.9)<1e-12);
 assert.ok(Math.abs(result[2].average-1.8)<1e-12);
});
test('stale, future and contradictory bookmaker prices cannot enter the average',()=>{
 const stale={...book('betclic_fr',1.5),last_update:'2026-11-21T17:00:00Z'};
 const future={...book('unibet_fr',1.6),last_update:'2026-11-21T18:10:00Z'};
 const conflict=book('winamax_fr',1.7);conflict.markets[0].outcomes.push({name:event.home_team,price:1.8});
 const result=summarizeBookmakerOdds({...event,bookmakers:[stale,future,conflict]},tiers,now);
 assert.equal(result[0].average,null);
});
test('credit reservations are atomic, enforce three daily fixtures and keep provider reserve',async()=>{
 const db=auditDatabase();
 await db.prepare('INSERT INTO odds_provider_budget VALUES(1,?,?)').bind(57,now.toISOString()).run();
 for(let id=1;id<=4;id++)await seed(db,id);
 const attempts=await Promise.all([1,1,2,3,4].map(id=>reserveOddsCredits(db,id,3,now)));
 assert.equal(attempts.filter(Boolean).length,2);
 assert.equal(db.sqlite.prepare('SELECT remaining FROM odds_provider_budget').get().remaining,51);
 assert.equal((await readOddsBudget(db,now)).usedCredits,6);
});
test('rolling 31-day cap includes failed reservations instead of assuming timeouts are free',async()=>{
 const db=auditDatabase();await seed(db,1);await seed(db,2);
 await db.prepare('INSERT INTO odds_provider_budget VALUES(1,500,?)').bind(now.toISOString()).run();
 for(let i=0;i<90;i++)db.sqlite.prepare('INSERT INTO odds_requests VALUES(?,?,5,?,?)').run('old-'+i,1,'2026-11-10T12:00:00.000Z','failed');
 assert.equal(await reserveOddsCredits(db,2,1,now),false);
 assert.equal((await readOddsBudget(db,now)).usedCredits,450);
});
test('priority ranking is editorial and a completed headline match still occupies its daily slot',()=>{
 const feed={competitions:[{ok:true,league:'fr.1',matches:[raw,{...raw,_sourceId:2,_teamIds:[519,531]}],historicalMatches:[{...raw,_sourceId:3,_teamIds:[524,516],_status:'FINISHED',score:{ft:[1,0]}}]}]};
 assert.equal(dailyPriorityMatches(feed,now)[0].match._sourceId,3);
});
test('missing key or storage cannot consume provider credits',async()=>{
 const fetcher=()=>assert.fail('Must not invoke the odds provider');
 assert.equal((await getBookmakerOdds({fetcher})).status,'not_configured');
 assert.equal((await getBookmakerOdds({apiKey:'fake-test-key',fetcher})).status,'storage_unavailable');
});
test('one successful snapshot is reused without additional provider calls or exposing its key',async()=>{
 const db=auditDatabase();await seed(db);
 const calls=[];const token='test-only-not-real-secret';
 const fetcher=async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(JSON.stringify([event]),{headers:{'x-requests-remaining':'500'}}):Response.json({...event,bookmakers:[book('betclic_fr',1.5)]});};
 const options={db,apiKey:token,league:'fr.1',matchId:1,clock:()=>now,fetcher,loadFeed:async()=>({competitions:[{ok:true,league:'fr.1',matches:[raw]}]})};
 const first=await getBookmakerOdds(options),second=await getBookmakerOdds(options);
 assert.equal(first.status,'recorded');assert.equal(second.status,'recorded');assert.equal(calls.length,2);
 assert.ok(calls.every(c=>!c.url.includes(token)&&c.options.headers['x-api-key']===token&&c.options.redirect==='manual'));
 assert.ok(!JSON.stringify(first).includes(token));
 assert.equal((await readOddsBudget(db,now)).usedCredits,4);
});
test('missing provider quota header stops before any credit-consuming request',async()=>{
 const db=auditDatabase();await seed(db);let calls=0;
 const result=await getBookmakerOdds({db,apiKey:'test-only',league:'fr.1',matchId:1,clock:()=>now,
 loadFeed:async()=>({competitions:[{ok:true,league:'fr.1',matches:[raw]}]}),fetcher:async()=>{calls++;return Response.json([event]);}});
 assert.equal(result.status,'budget_exhausted');assert.equal(calls,1);
 assert.equal((await readOddsBudget(db,now)).usedCredits,0);
});

test('standard totals are included, exact lines only, with no double count or invented price',()=>{
 const markets=neededMarkets(tiers);
 assert.deepEqual(markets,['h2h','totals','alternate_totals','btts']);
 const standard={key:'betclic_fr',last_update:now.toISOString(),markets:[{key:'totals',outcomes:[{name:'Over',point:2.5,price:1.95},{name:'Over',point:3.5,price:8}]}]};
 assert.equal(summarizeBookmakerOdds({...event,bookmakers:[standard]},tiers,now)[1].average,1.95);
 standard.markets.push({...standard.markets[0],key:'alternate_totals'});
 const same=summarizeBookmakerOdds({...event,bookmakers:[standard]},tiers,now)[1];
 assert.equal(same.average,1.95);assert.equal(same.books.length,1);
 standard.markets[1]={key:'alternate_totals',outcomes:[{name:'Over',point:2.5,price:2.05}]};
 assert.equal(summarizeBookmakerOdds({...event,bookmakers:[standard]},tiers,now)[1].average,null);
});
test('standard team totals match the exact team and the credit ceiling covers every three-scenario mix',()=>{
 const teamTiers=[{market:{code:'hg15'}},{market:{code:'ag05'}},{market:{code:'o25'}}];
 const payload={...event,bookmakers:[{key:'winamax_fr',last_update:now.toISOString(),markets:[{key:'team_totals',outcomes:[
 {name:'Over',description:event.home_team,point:1.5,price:2},{name:'Over',description:event.away_team,point:0.5,price:1.6}]}]}]};
 const result=summarizeBookmakerOdds(payload,teamTiers,now);
 assert.deepEqual(result.map(q=>q.average),[2,1.6,null]);
 const codes=['home','draw','away','1X','X2','12','o05','u15','o25','u35','btts','notbtts','hg05','ag15'];
 for(const a of codes)for(const b of codes)for(const c of codes)assert.ok(neededMarkets([a,b,c].map(code=>({market:{code}}))).length<=5);
});
