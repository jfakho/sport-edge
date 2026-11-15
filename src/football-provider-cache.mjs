import {COMPETITIONS} from './football-data-adapter.mjs';

/** Shared D1 cache and reservations, independent of Cloudflare point-of-presence.
 * Successful provider payloads are reused for ten minutes. Never fabricate data.
 */
export async function fetchFootballProvider(env,league,{fetcher=fetch,clock=()=>Date.now()}={}) {
  const upstream=()=>fetcher('https://api.football-data.org/v4/competitions/'+COMPETITIONS[league]+'/matches',{
    headers:{'X-Auth-Token':env.FOOTBALL_DATA_API_KEY,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(9000),
  });
  const db=env.COTEGO_AUDIT_DB;
  if(!db)return upstream();
  const now=clock();
  const row=await db.prepare('SELECT * FROM football_feed_cache WHERE competition=?').bind(league).first();
  const cached=()=>new Response(row.payload_json,{headers:{'content-type':'application/json','x-cotego-provider-fetched-at':String(row.fetched_at)}});
  if(row?.payload_json&&now-row.fetched_at<600000)return cached();
  const lease=await db.prepare(`INSERT INTO football_feed_cache(competition,lease_until) VALUES(?,?)
    ON CONFLICT(competition) DO UPDATE SET lease_until=excluded.lease_until
    WHERE football_feed_cache.lease_until<?`).bind(league,now+15000,now).run();
  if(!lease.meta.changes){
    if(row?.lease_until>now+15000)return new Response(null,{status:429,headers:{'retry-after':String(Math.ceil((row.lease_until-now)/1000))}});
    // A concurrent cold visitor waits briefly for the same shared response.
    for(let attempt=0;attempt<6;attempt++){
      await new Promise(resolve=>setTimeout(resolve,500));
      const filled=await db.prepare('SELECT payload_json,fetched_at FROM football_feed_cache WHERE competition=?').bind(league).first();
      if(filled?.payload_json&&clock()-filled.fetched_at<600000)return new Response(filled.payload_json,{headers:{'content-type':'application/json'}});
    }
    return new Response(null,{status:503,headers:{'retry-after':'2'}});
  }
  // The provider's free quota is shared across all leagues and all visitors.
  const reservation=await db.prepare(`INSERT INTO football_provider_requests(request_id,requested_at)
    SELECT ?,? WHERE (SELECT count(*) FROM football_provider_requests WHERE requested_at>?)<9`)
    .bind(crypto.randomUUID(),now,now-60000).run();
  if(!reservation.meta.changes){
    await db.prepare('UPDATE football_feed_cache SET lease_until=0 WHERE competition=?').bind(league).run();
    return new Response(null,{status:429,headers:{'retry-after':'60'}});
  }
  try {
    const response=await upstream();
    if(response.ok){
      const body=await response.text();
      const payload=JSON.parse(body);
      if(!Array.isArray(payload.matches)||payload.matches.length===0)throw Error('No verified payload');
      // A wrong-competition payload must never be promoted to the shared cache.
      if(payload.competition?.code&&payload.competition.code!==COMPETITIONS[league])throw Error('Competition mismatch');
      await db.prepare('UPDATE football_feed_cache SET payload_json=?,fetched_at=?,lease_until=0 WHERE competition=?')
        .bind(body,clock(),league).run();
      return new Response(body,{headers:{'content-type':'application/json'}});
    }
    if(response.status===429){
      const retry=response.headers.get('retry-after');
      const seconds=retry&&/^\d{1,4}$/.test(retry)?Math.min(3600,Math.max(1,Number(retry))):60;
      await db.prepare('UPDATE football_feed_cache SET lease_until=? WHERE competition=?').bind(now+seconds*1000,league).run();
    }else await db.prepare('UPDATE football_feed_cache SET lease_until=0 WHERE competition=?').bind(league).run();
    return response;
  } catch(error){
    await db.prepare('UPDATE football_feed_cache SET lease_until=0 WHERE competition=?').bind(league).run();
    throw error;
  }
}
