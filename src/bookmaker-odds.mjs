import {editorialPriority} from './featured-priority.mjs';

export const ODDS_POLICY=Object.freeze({rollingDays:31,creditLimit:450,reserve:50,dailyCreditLimit:15,dailyFixtures:3,beforeKickoffMinutes:90});
const BOOKS={betclic_fr:'Betclic',unibet_fr:'Unibet',winamax_fr:'Winamax'};
const SPORTS={'fr.1':'soccer_france_ligue_one','en.1':'soccer_epl','es.1':'soccer_spain_la_liga',
  'de.1':'soccer_germany_bundesliga','it.1':'soccer_italy_serie_a','intl.cl':'soccer_uefa_champs_league',
  'intl.wc':'soccer_fifa_world_cup','intl.ec':'soccer_uefa_european_championship'};
const key=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const parisDate=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const marketKey=code=>['home','draw','away'].includes(code)?'h2h':['1X','X2','12'].includes(code)?'double_chance':
  /^(o|u)(05|15|25|35)$/.test(code)?'alternate_totals':['btts','notbtts'].includes(code)?'btts':
  /^(hg|ag)(05|15)$/.test(code)?'alternate_team_totals':null;
export const neededMarkets=tiers=>[...new Set(tiers.map(t=>marketKey(t.market.code)).filter(Boolean))];

export function matchOddsEvent(fixture,events,league) {
  const aliases=fixture.aliases??[[fixture.home],[fixture.away]];
  const same=(name,side)=>aliases[side].some(alias=>key(alias)===key(name));
  const matches=events.filter(e=>typeof e.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(e.id)
    &&e.sport_key===SPORTS[league]&&Number.isFinite(Date.parse(e.commence_time))
    &&Math.abs(Date.parse(e.commence_time)-Date.parse(fixture.kickoffUtc))<=5*60000
    &&same(e.home_team,0)&&same(e.away_team,1));
  return matches.length===1?matches[0]:null;
}
function matchesOutcome(code,outcome,event) {
  const name=key(outcome.name);
  if(['home','draw','away'].includes(code))return name===key(code==='home'?event.home_team:code==='away'?event.away_team:'Draw');
  if(code==='btts'||code==='notbtts')return name===(code==='btts'?'yes':'no');
  const total=/^(o|u)(05|15|25|35)$/.exec(code);
  if(total)return name===(total[1]==='o'?'over':'under')&&outcome.point===Number(total[2])/10;
  const team=/^(hg|ag)(05|15)$/.exec(code);
  if(team)return name==='over'&&outcome.point===Number(team[2])/10
    &&key(outcome.description)===key(team[1]==='hg'?event.home_team:event.away_team);
  const doubles={
    '1X':['1X','Home/Draw',event.home_team+'/Draw',event.home_team+' or Draw'],
    'X2':['X2','Draw/Away','Draw/'+event.away_team,'Draw or '+event.away_team],
    '12':['12','Home/Away',event.home_team+'/'+event.away_team,event.home_team+' or '+event.away_team],
  };
  return (doubles[code]||[]).some(label=>key(label)===name);
}
export function summarizeBookmakerOdds(event,tiers,now=new Date()) {
  return tiers.map(tier=>{
    const books=[];
    for(const book of event.bookmakers||[]){
      if(!BOOKS[book.key])continue;
      const quotes=(book.markets||[]).filter(m=>m.key===marketKey(tier.market.code)).flatMap(m=>{
        const updatedAt=m.last_update||book.last_update;
        const timestamp=Date.parse(updatedAt);
        if(typeof updatedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(updatedAt)||!Number.isFinite(timestamp)
          ||timestamp>now.getTime()+60000||timestamp>=Date.parse(event.commence_time)||now.getTime()-timestamp>30*60000)return [];
        return (m.outcomes||[]).filter(o=>typeof o.price==='number'&&Number.isFinite(o.price)&&o.price>1&&o.price<=1000&&matchesOutcome(tier.market.code,o,event))
          .map(o=>({bookmaker:BOOKS[book.key],key:book.key,price:o.price,updatedAt:new Date(timestamp).toISOString()}));
      });
      // Contradictory duplicate quotes must not silently become the best price.
      if(quotes.length&&quotes.every(q=>q.price===quotes[0].price))books.push(quotes.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]);
    }
    const unique=new Map();
    for(const b of books){if(!unique.has(b.key))unique.set(b.key,b);else if(unique.get(b.key)?.price!==b.price)unique.set(b.key,null);}
    const valid=[...unique.values()].filter(Boolean);
    return {code:tier.market.code,name:tier.market.name,target:tier.target,average:valid.length?valid.reduce((sum,b)=>sum+b.price,0)/valid.length:null,books:valid};
  });
}
export function dailyPriorityMatches(feed,now=new Date()) {
  const day=parisDate(now),unique=new Map();
  for(const c of feed.competitions||[])if(c.ok)for(const m of [...(c.matches||[]),...(c.historicalMatches||[])]){
    if(m.date===day&&SPORTS[c.league]&&Number.isSafeInteger(m._sourceId))unique.set(m._sourceId,{match:m,league:c.league,priority:editorialPriority(m,c.league)});
  }
  return [...unique.values()].sort((a,b)=>b.priority-a.priority||a.match._kickoffUtc.localeCompare(b.match._kickoffUtc)||a.match._sourceId-b.match._sourceId).slice(0,3);
}
export async function reserveOddsCredits(db,matchId,cost,now=new Date()) {
  if(!Number.isSafeInteger(cost)||cost<1||cost>5)throw Error('Invalid credit reservation');
  const since=new Date(now.getTime()-ODDS_POLICY.rollingDays*86400000).toISOString();
  const day=now.toISOString().slice(0,10)+'T00:00:00.000Z';
  const result=await db.prepare(`INSERT OR IGNORE INTO odds_requests(request_id,match_id,reserved_credits,created_at)
    SELECT ?,?,?,? WHERE
    COALESCE((SELECT sum(reserved_credits) FROM odds_requests WHERE created_at>=?),0)+?<=450
    AND COALESCE((SELECT sum(reserved_credits) FROM odds_requests WHERE created_at>=?),0)+?<=15
    AND (SELECT count(*) FROM odds_requests WHERE created_at>=?)<3
    AND COALESCE((SELECT remaining FROM odds_provider_budget WHERE id=1),0)>=?+50`)
    .bind('match-'+matchId,matchId,cost,now.toISOString(),since,cost,day,cost,day,cost).run();
  return result.meta.changes>0;
}
export async function readOddsBudget(db,now=new Date()) {
  if(!db)return {...ODDS_POLICY,usedCredits:null};
  const since=new Date(now.getTime()-ODDS_POLICY.rollingDays*86400000).toISOString();
  const row=await db.prepare('SELECT COALESCE(sum(reserved_credits),0) AS used FROM odds_requests WHERE created_at>=?').bind(since).first();
  return {...ODDS_POLICY,usedCredits:row.used};
}
export async function getBookmakerOdds({db,apiKey,league,matchId,loadFeed,clock=()=>new Date(),now=clock(),fetcher=fetch}) {
  if(!apiKey)return {ok:true,status:'not_configured'};
  if(!db)return {ok:true,status:'storage_unavailable'};
  const row=await db.prepare('SELECT * FROM predictions WHERE match_id=? AND competition=?').bind(matchId,league).first();
  if(!row)return {ok:true,status:'not_selected'};
  const saved=await db.prepare('SELECT * FROM odds_snapshots WHERE match_id=?').bind(matchId).first();
  if(saved)return {ok:true,status:'recorded',receivedAt:saved.received_at,scenarios:JSON.parse(saved.quotes_json)};
  if(Date.parse(row.kickoff_utc)<=now.getTime())return {ok:true,status:'no_match'};
  if(Date.parse(row.kickoff_utc)-now.getTime()>ODDS_POLICY.beforeKickoffMinutes*60000)return {ok:true,status:'too_early'};
  const previous=await db.prepare('SELECT state,created_at FROM odds_requests WHERE match_id=?').bind(matchId).first();
  if(previous)return {ok:true,status:previous.state==='reserved'&&now.getTime()-Date.parse(previous.created_at)<90000?'pending':'unavailable'};
  if((await readOddsBudget(db,now)).usedCredits>=ODDS_POLICY.creditLimit)return {ok:true,status:'budget_exhausted'};
  const feed=await loadFeed();
  if(!dailyPriorityMatches(feed,now).some(item=>item.match._sourceId===matchId&&item.league===league))return {ok:true,status:'not_selected'};
  const headers={'x-api-key':apiKey,Accept:'application/json'};
  const request=url=>fetcher(url,{headers,redirect:'manual',signal:AbortSignal.timeout(8000)});
  const eventsResponse=await request('https://api.the-odds-api.com/v4/sports/'+SPORTS[league]+'/events');
  if(!eventsResponse.ok)return {ok:true,status:'unavailable'};
  const remainingText=eventsResponse.headers.get('x-requests-remaining');
  const remaining=remainingText!==null&&/^\d+$/.test(remainingText)?Number(remainingText):NaN;
  // A free discovery response must establish the available quota before any paid-credit call.
  if(!Number.isSafeInteger(remaining)||remaining<=ODDS_POLICY.reserve)return {ok:true,status:'budget_exhausted'};
  const events=await eventsResponse.json();
  const fixture={home:row.home_name,away:row.away_name,kickoffUtc:row.kickoff_utc,aliases:JSON.parse(row.aliases_json)};
  const event=Array.isArray(events)?matchOddsEvent(fixture,events,league):null;
  if(!event)return {ok:true,status:'no_match'};
  const tiers=JSON.parse(row.analysis_json).tiers,markets=neededMarkets(tiers);
  if(!markets.length)return {ok:true,status:'no_match'};
  await db.prepare(`INSERT INTO odds_provider_budget(id,remaining,cycle_started_at) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET remaining=CASE WHEN odds_provider_budget.cycle_started_at<?
      THEN excluded.remaining ELSE MIN(odds_provider_budget.remaining,excluded.remaining) END,
      cycle_started_at=CASE WHEN odds_provider_budget.cycle_started_at<? THEN excluded.cycle_started_at ELSE odds_provider_budget.cycle_started_at END`)
    .bind(remaining,now.toISOString(),new Date(now.getTime()-31*86400000).toISOString(),new Date(now.getTime()-31*86400000).toISOString()).run();
  if(!await reserveOddsCredits(db,matchId,markets.length,now))return {ok:true,status:'budget_exhausted'};
  try {
    const url=new URL('https://api.the-odds-api.com/v4/sports/'+SPORTS[league]+'/events/'+event.id+'/odds');
    url.searchParams.set('bookmakers',Object.keys(BOOKS).join(','));url.searchParams.set('markets',markets.join(','));url.searchParams.set('oddsFormat','decimal');
    const response=await request(url.href);
    if(!response.ok)throw Error('Upstream unavailable');
    const payload=await response.json();
    if(!matchOddsEvent(fixture,[payload],league)||payload.id!==event.id)throw Error('Mismatched odds fixture');
    const observedAt=clock();
    if(observedAt.getTime()>=Date.parse(row.kickoff_utc))throw Error('Kickoff already passed');
    const scenarios=summarizeBookmakerOdds(payload,tiers,observedAt);
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO odds_snapshots(match_id,received_at,quotes_json) VALUES(?,?,?)').bind(matchId,observedAt.toISOString(),JSON.stringify(scenarios)),
      db.prepare("UPDATE odds_requests SET state='recorded' WHERE request_id=?").bind('match-'+matchId),
    ]);
    return {ok:true,status:'recorded',receivedAt:observedAt.toISOString(),scenarios};
  } catch {
    // Retain reservations on timeouts: the upstream may already have charged credits.
    await db.prepare("UPDATE odds_requests SET state='failed' WHERE request_id=?").bind('match-'+matchId).run();
    return {ok:true,status:'unavailable'};
  }
}
