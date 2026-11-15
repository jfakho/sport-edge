/**
 * COTEGO — Cloudflare Worker API for delayed, verified match results.
 * Confidential: FOOTBALL_DATA_API_KEY exists only as a Worker secret.
 * Static assets remain static; only /api/* invokes this Worker.
 */
import {COMPETITIONS, normalizeFootballDataSeason, footballDataFreshness, selectUpcomingMatches} from './football-data-adapter.mjs';
import {handleBillingTest} from './billing-test.mjs';
import {journalFeed,readJournal,synchronizeJournal} from './prediction-journal.mjs';

const CACHE_SECONDS = 600;
const CODES = Object.keys(COMPETITIONS);
const errorJSON = (message, status, headers={}) => new Response(
  JSON.stringify({ok:false,error:message}),
  {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}}
);

async function attachJournal(response,env) {
  if(!env.COTEGO_AUDIT_DB)return response;
  const payload=await response.json();
  const isBulk=Array.isArray(payload.competitions);
  const input=isBulk?payload:{competitions:[{ok:true,league:payload.league,
    matches:payload.matches.filter(m=>!m.score),historicalMatches:payload.matches.filter(m=>!!m.score)}]};
  const enriched=await journalFeed(input,env.COTEGO_AUDIT_DB);
  const data=isBulk?enriched:{...payload,journal:enriched.journal,matches:[
    ...enriched.competitions[0].historicalMatches,...enriched.competitions[0].matches]};
  return new Response(JSON.stringify(data),{headers:{...Object.fromEntries(response.headers),'cache-control':'no-store'}});
}

const worker = {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/api/account/') || url.pathname.startsWith('/api/billing/')) return handleBillingTest(request,env);
    if (request.method !== 'GET') return errorJSON('Méthode non autorisée',405,{allow:'GET'});
    if (url.pathname === '/api/status') return new Response(JSON.stringify({ok:true,service:'cotego',api:'available',footballDataConfigured:!!env.FOOTBALL_DATA_API_KEY,journalConfigured:!!env.COTEGO_AUDIT_DB,journalSetup:env.COTEGO_JOURNAL_SETUP??null,oddsConfigured:!!env.ODDS_API_KEY,deploymentId:env.CF_VERSION_METADATA?.id ?? null,liveScores:false}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    if(url.pathname==='/api/predictions'){
      const league=url.searchParams.get('league')||'fr.1';
      if(!CODES.includes(league))return errorJSON('Compétition non prise en charge',400);
      try {return Response.json(await readJournal(env.COTEGO_AUDIT_DB,league),{headers:{'cache-control':'no-store'}});}
      catch {return errorJSON('Journal momentanément indisponible',503);}
    }
    const predictionRoute=/^\/api\/prediction\/([a-z0-9.]+)\/(\d{1,10})$/.exec(url.pathname);
    if(predictionRoute){
      const league=predictionRoute[1],id=Number(predictionRoute[2]);
      if(!CODES.includes(league)||!Number.isSafeInteger(id)||id<=0)return errorJSON('Rencontre invalide',400);
      if(!env.COTEGO_AUDIT_DB)return Response.json({ok:true,configured:false,record:null},{headers:{'cache-control':'no-store'}});
      const source=await worker.fetch(new Request(url.origin+'/api/football/'+league),env,context);
      if(!source.ok)return errorJSON('Source sportive momentanément indisponible',503);
      const payload=await source.json();
      try {
        const data=await synchronizeJournal(env.COTEGO_AUDIT_DB,{ok:true,league,
          matches:payload.matches.filter(m=>!m.score),historicalMatches:payload.matches.filter(m=>!!m.score)},{captureId:id});
        const match=[...data.matches,...data.historicalMatches].find(m=>m._sourceId===id);
        return Response.json({ok:true,configured:true,record:match?._prediction??null},{headers:{'cache-control':'no-store'}});
      } catch {return errorJSON('Enregistrement momentanément indisponible',503);}
    }


    // Cross-league fixtures: one client request, eight upstream requests max (five leagues and three international competitions).
    // No stale or fabricated fixtures; each competition reports its own availability.
    if (url.pathname === '/api/football-featured') {
      if (!env.FOOTBALL_DATA_API_KEY) return errorJSON('Source de résultats non configurée',503);
      const leagues=['fr.1','en.1','es.1','de.1','it.1','intl.cl','intl.wc','intl.ec'];
      const cache = typeof caches !== 'undefined' ? caches.default : null;
      const cacheKey=new Request(url.origin+'/api/football-featured',{method:'GET'});
      if (cache) {const cached=await cache.match(cacheKey);if(cached)return attachJournal(cached,env);}
      const results=[];
      let quotaExhausted=false;
      let accessDenied=false;
      let quotaRetrySeconds=60;
      // Eight sequential requests fit the provider's nominal 10 calls/minute free limit;
      // upstream 429 handling stops the batch and never fabricates unavailable competitions.
      for (const league of leagues) {
        if (quotaExhausted || accessDenied) {
          results.push({league,ok:false,error:quotaExhausted ? 'Quota de données atteint' : 'Accès à la source non autorisé'});
          continue;
        }
        try {
          const upstream=await fetch('https://api.football-data.org/v4/competitions/'+COMPETITIONS[league]+'/matches',{
            headers:{'X-Auth-Token':env.FOOTBALL_DATA_API_KEY,Accept:'application/json'},
            redirect:'manual',signal:AbortSignal.timeout(9000),
          });
          if (!upstream.ok) {
            // A provider-wide 429 must stop this batch immediately: retrying
            // the remaining leagues only wastes quota and can prolong throttling.
            if (upstream.status === 401 || upstream.status === 403) accessDenied=true;
            if (upstream.status === 429) {
              quotaExhausted=true;
              const rawRetry=upstream.headers.get('retry-after');
              quotaRetrySeconds=rawRetry !== null && /^\d{1,5}$/.test(rawRetry.trim())
                ? Math.min(Math.max(Number(rawRetry.trim()),1),3600) : 60;
            }
            const error = upstream.status === 429 ? 'Quota de données atteint'
              : upstream.status === 401 || upstream.status === 403 ? 'Accès à cette compétition non autorisé'
              : 'Source indisponible';
            results.push({league,ok:false,error});continue;
          }
          const matches=normalizeFootballDataSeason(await upstream.json(),league);
          // An empty provider response is not verified coverage. Keep it visible
          // as unavailable and retry next time rather than caching false success.
          if (matches.length === 0) {
            results.push({league,ok:false,error:'Aucune rencontre vérifiable reçue'});
            continue;
          }
          results.push({league,ok:true,matches:selectUpcomingMatches(matches),
            freshness:footballDataFreshness(matches),
            historicalMatches:matches.filter(x=>!!x.score).slice(-80)});
        } catch {results.push({league,ok:false,error:'Source indisponible'});}
      }
      const ok=results.some(x=>x.ok);
      if (!ok)return errorJSON('Aucune compétition disponible',503,
        quotaExhausted ? {'retry-after':String(quotaRetrySeconds)} : {});
      // Some international competitions can be unavailable on a free plan.
      // Avoid eight upstream calls on every visitor request: briefly cache partial
      // non-auth, non-quota responses, while retrying unavailable leagues soon.
      const complete=results.every(x=>x.ok);
      const cacheable=!quotaExhausted&&!accessDenied;
      const cacheControl=cacheable
        ? (complete ? 'public, max-age=120, s-maxage=600' : 'public, max-age=30, s-maxage=60')
        : 'no-store';
      const response=new Response(JSON.stringify({ok:true,source:'football-data.org',receivedAt:new Date().toISOString(),competitions:results}),{
        headers:{'content-type':'application/json; charset=utf-8','cache-control':cacheControl,'x-content-type-options':'nosniff',...(quotaExhausted ? {'retry-after':String(quotaRetrySeconds)} : {})},
      });
      if(cache&&context?.waitUntil&&cacheable)context.waitUntil(cache.put(cacheKey,response.clone()));
      return attachJournal(response,env);
    }

    const match = /^\/api\/football\/([^/]+)$/.exec(url.pathname);
    if (!match) return errorJSON('Route inconnue',404);
    // Malformed percent-encoding must return a controlled client error, not a 500.
    let league;
    try { league = decodeURIComponent(match[1]); }
    catch { return errorJSON('Identifiant de compétition invalide',400); }
    if (!CODES.includes(league)) return errorJSON('Compétition non prise en charge',400);
    if (!env.FOOTBALL_DATA_API_KEY) return errorJSON('Source de résultats non configurée',503);

    // Only approved competition codes may reach the external API.
    const source = COMPETITIONS[league];
    const publicCacheKey = new Request(url.origin+'/api/football/'+encodeURIComponent(league),{method:'GET'});
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    if (cache) {
      const hit = await cache.match(publicCacheKey);
      if (hit) return attachJournal(hit,env);
    }
    try {
      const response = await fetch('https://api.football-data.org/v4/competitions/'+source+'/matches', {
        method:'GET',
        headers:{'X-Auth-Token':env.FOOTBALL_DATA_API_KEY,'Accept':'application/json'},
        // Workers Fetch API does not support redirect: 'error'.
        // 'manual' avoids sending the API token to an unexpected redirect destination.
        redirect:'manual',
        signal:AbortSignal.timeout(9000),
      });
      if (response.status === 429) {
        // Honor a provider Retry-After delay when it is a bounded number of seconds.
        // Never relay arbitrary upstream headers or reveal provider internals.
        const rawRetry = response.headers.get('retry-after');
        const seconds = rawRetry !== null && /^\d{1,5}$/.test(rawRetry.trim())
          ? Number(rawRetry.trim()) : 60;
        return errorJSON('Quota de données atteint, veuillez réessayer plus tard',503,
          {'retry-after':String(Math.min(Math.max(seconds,1),3600))});
      }
      if (response.status === 401 || response.status === 403)
        return errorJSON('Accès à la source non autorisé pour cette compétition',503);
      if (!response.ok) return errorJSON('Service de données indisponible',503);
      const raw = await response.json();
      const rows = normalizeFootballDataSeason(raw,league);
      if (!rows.length) return errorJSON('Aucune rencontre disponible pour cette compétition',503);
      const health = footballDataFreshness(rows);
      const body = JSON.stringify({
        ok:true,source:'football-data.org',coverage:'scores différés',
        league,competition:source,receivedAt:new Date().toISOString(),
        freshness:health,
        matches:rows,
      });
      const out = new Response(body, {
        status:200,
        headers:{
          'content-type':'application/json; charset=utf-8',
          'cache-control':'public, max-age=120, s-maxage='+CACHE_SECONDS,
          'x-content-type-options':'nosniff',
          'x-cotego-source':'football-data.org',
        },
      });
      if (cache && context?.waitUntil) context.waitUntil(cache.put(publicCacheKey,out.clone()));
      return attachJournal(out,env);
    } catch {
      // Never echo token, private headers, upstream payload or internal stack.
      return errorJSON('Résultats momentanément indisponibles',503);
    }
  },
};
export default worker;
