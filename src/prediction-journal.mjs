import {createFootballModel,MODEL_VERSION} from './forecast-model.mjs';
import {selectPriorityFixtures,editorialPriority} from './featured-priority.mjs';

export function modelMatch(raw,league) {
  return {date:raw.date,time:raw.time,home:raw.team1,away:raw.team2,
    score:raw.score?.ft??null,ht:raw.score?.ht??null,league,
    sourceId:raw._sourceId,kickoffUtc:raw._kickoffUtc,teamIds:raw._teamIds,
    id:[league,'football-data.org',raw._sourceId].join('|')};
}
const parisDate=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const parseRow=row=>({matchId:row.match_id,league:row.competition,kickoffUtc:row.kickoff_utc,
  createdAt:row.created_at,home:row.home_name,away:row.away_name,teamIds:[row.home_id,row.away_id],
  modelVersion:row.model_version,analysis:JSON.parse(row.analysis_json)});

/** Only trusted provider rows can reach this method; no client-submitted forecasts.
 * INSERT OR IGNORE + immutable SQL trigger makes the first pre-match record final.
 */
export async function synchronizeJournal(db,competition,{now=new Date(),captureId=null}={}) {
  if(!db||!competition.ok)return competition;
  const {league}=competition;
  const raw=[...(competition.historicalMatches||[]),...(competition.matches||[])];
  const after=new Date(now.getTime()-45*86400000).toISOString();
  const read=()=>db.prepare('SELECT * FROM predictions WHERE competition=? AND kickoff_utc>=? ORDER BY kickoff_utc').bind(league,after).all();
  let existing=new Map((await read()).results.map(row=>[row.match_id,row]));
  const candidates=captureId?competition.matches.filter(m=>m._sourceId===captureId):
    selectPriorityFixtures([competition],now,3,14*24).map(x=>x.match);
  const model=createFootballModel(parisDate(now));
  const all=raw.map(m=>modelMatch(m,league));
  const writes=[];
  for(const m of candidates){
    if(existing.has(m._sourceId)||m.score||!['TIMED','SCHEDULED'].includes(m._status)
      ||!Number.isSafeInteger(m._sourceId)||!Array.isArray(m._teamIds)||m._teamIds.length!==2
      ||!m._teamIds.every(n=>Number.isSafeInteger(n)&&n>0)||m._teamIds[0]===m._teamIds[1]
      ||!Number.isFinite(Date.parse(m._kickoffUtc))
      ||Date.parse(m._kickoffUtc)<=now.getTime()||Date.parse(m._kickoffUtc)>now.getTime()+30*86400000)continue;
    const analysis=model.forecast(modelMatch(m,league),all);
    if(!analysis?.tiers?.every(t=>t.market&&Number.isFinite(t.market.p)))continue;
    writes.push(db.prepare(`INSERT OR IGNORE INTO predictions
      (match_id,competition,kickoff_utc,created_at,home_id,away_id,home_name,away_name,aliases_json,model_version,analysis_json)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ? < ?`)
      .bind(m._sourceId,league,m._kickoffUtc,now.toISOString(),...m._teamIds,m.team1,m.team2,
        JSON.stringify(m._teamAliases||[[m.team1],[m.team2]]),MODEL_VERSION,JSON.stringify(analysis),now.toISOString(),m._kickoffUtc));
  }
  if(writes.length){await db.batch(writes);existing=new Map((await read()).results.map(row=>[row.match_id,row]));}
  const settlements=[];
  for(const m of raw){
    const saved=existing.get(m._sourceId);
    if(!saved||m._status!=='FINISHED'||!Array.isArray(m.score?.ft)||m.score.ft.length!==2
      ||!m.score.ft.every(n=>Number.isInteger(n)&&n>=0&&n<=35)
      ||saved.home_id!==m._teamIds?.[0]||saved.away_id!==m._teamIds?.[1]||saved.kickoff_utc!==m._kickoffUtc
      ||Date.parse(saved.kickoff_utc)>now.getTime())continue;
    settlements.push(db.prepare(`INSERT INTO verified_results(match_id,home_goals,away_goals,observed_at,source)
      VALUES(?,?,?,?,'football-data.org') ON CONFLICT(match_id) DO UPDATE SET
      home_goals=excluded.home_goals,away_goals=excluded.away_goals,observed_at=excluded.observed_at
      WHERE verified_results.home_goals<>excluded.home_goals OR verified_results.away_goals<>excluded.away_goals`)
      .bind(m._sourceId,...m.score.ft,now.toISOString()));
  }
  for(let i=0;i<settlements.length;i+=40)await db.batch(settlements.slice(i,i+40));
  const attach=m=>{
    const row=existing.get(m._sourceId);
    const same=row&&row.home_id===m._teamIds?.[0]&&row.away_id===m._teamIds?.[1]&&row.kickoff_utc===m._kickoffUtc;
    return {...m,_editorialPriority:editorialPriority(m,league),...(same?{_prediction:parseRow(row)}:{})};
  };
  return {...competition,matches:competition.matches.map(attach),
    historicalMatches:(competition.historicalMatches||[]).map(attach)};
}

export async function journalFeed(payload,db) {
  if(!db)return {...payload,journal:{configured:false,available:false}};
  const competitions=[];
  let failed=0;
  for(const competition of payload.competitions) {
    try { competitions.push(await synchronizeJournal(db,competition)); }
    catch {
      failed++;
      // Preserve provider fixtures while making missing audit coverage explicit.
      competitions.push({...competition,journalAvailable:false});
    }
  }
  return {...payload,competitions,journal:{configured:true,available:failed===0,failedCompetitions:failed}};
}

export async function readJournal(db,league) {
  if(!db)return {ok:true,configured:false,records:[],summary:null};
  const rows=await db.prepare(`SELECT p.*,r.home_goals,r.away_goals,r.observed_at FROM predictions p
    LEFT JOIN verified_results r ON p.match_id=r.match_id AND r.observed_at>=p.kickoff_utc
    WHERE p.competition=? AND p.created_at<p.kickoff_utc
    ORDER BY p.kickoff_utc DESC LIMIT 200`).bind(league).all();
  const model=createFootballModel();
  const records=rows.results.map(row=>{
    const saved=parseRow(row);
    const final=row.observed_at?[row.home_goals,row.away_goals]:null;
    const tiers=saved.analysis.tiers.map(t=>{
      const market=model.MARKET_TYPES.find(([code])=>code===t.market.code);
      const hit=final&&market?market[3](...final):null;
      return {target:t.target,market:t.market,hit,brier:typeof hit==='boolean'?(t.market.p-Number(hit))**2:null};
    });
    return {...saved,finalScore:final,resultObservedAt:row.observed_at??null,tiers};
  });
  const summary=model.TIERS.map((tier,i)=>{
    const evaluated=records.map(r=>r.tiers[i]).filter(t=>typeof t.hit==='boolean');
    return {target:tier.target,total:records.length,evaluated:evaluated.length,
      hits:evaluated.filter(t=>t.hit).length,pending:records.length-evaluated.length,
      hitRate:evaluated.length?evaluated.filter(t=>t.hit).length/evaluated.length:null,
      meanProbability:evaluated.length?evaluated.reduce((s,t)=>s+t.market.p,0)/evaluated.length:null,
      brier:evaluated.length?evaluated.reduce((s,t)=>s+t.brier,0)/evaluated.length:null};
  });
  return {ok:true,configured:true,records,summary,coverage:'200 derniers matchs enregistrés de cette compétition',modelVersion:MODEL_VERSION};
}
