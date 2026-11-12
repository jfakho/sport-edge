/**
 * COTEGO — Cloudflare Worker API for delayed, verified match results.
 * Confidential: FOOTBALL_DATA_API_KEY exists only as a Worker secret.
 * Static assets remain static; only /api/* invokes this Worker.
 */
import {COMPETITIONS, normalizeFootballDataSeason, footballDataFreshness} from './football-data-adapter.mjs';
import {handleBillingTest} from './billing-test.mjs';

const CACHE_SECONDS = 600;
const CODES = Object.keys(COMPETITIONS);
const errorJSON = (message, status, headers={}) => new Response(
  JSON.stringify({ok:false,error:message}),
  {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}}
);

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/api/account/') || url.pathname.startsWith('/api/billing/')) return handleBillingTest(request,env);
    if (request.method !== 'GET') return errorJSON('Méthode non autorisée',405,{allow:'GET'});
    if (url.pathname === '/api/status') return new Response(JSON.stringify({ok:true,service:'cotego',api:'available',footballDataConfigured:!!env.FOOTBALL_DATA_API_KEY,liveScores:false}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});


    // Cross-league fixtures: one client request, five upstream requests max.
    // No stale or fabricated fixtures; each competition reports its own availability.
    if (url.pathname === '/api/football-featured') {
      if (!env.FOOTBALL_DATA_API_KEY) return errorJSON('Source de résultats non configurée',503);
      const leagues=['fr.1','en.1','es.1','de.1','it.1'];
      const cache = typeof caches !== 'undefined' ? caches.default : null;
      const cacheKey=new Request(url.origin+'/api/football-featured',{method:'GET'});
      if (cache) {const cached=await cache.match(cacheKey);if(cached)return cached;}
      const results=[];
      // Sequential requests stay below the free provider's 10 calls/minute limit.
      for (const league of leagues) {
        try {
          const upstream=await fetch('https://api.football-data.org/v4/competitions/'+COMPETITIONS[league]+'/matches',{
            headers:{'X-Auth-Token':env.FOOTBALL_DATA_API_KEY,Accept:'application/json'},
            redirect:'manual',signal:AbortSignal.timeout(9000),
          });
          if (!upstream.ok) {results.push({league,ok:false,error:'Source indisponible'});continue;}
          const matches=normalizeFootballDataSeason(await upstream.json(),league);
          results.push({league,ok:true,matches:matches.filter(x=>!x.score && Date.parse(x._kickoffUtc)>Date.now()).slice(0,12),
            historicalMatches:matches.filter(x=>!!x.score).slice(-80)});
        } catch {results.push({league,ok:false,error:'Source indisponible'});}
      }
      const ok=results.some(x=>x.ok);
      if (!ok)return errorJSON('Aucune compétition disponible',503);
      const response=new Response(JSON.stringify({ok:true,source:'football-data.org',receivedAt:new Date().toISOString(),competitions:results}),{
        headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=120, s-maxage=600','x-content-type-options':'nosniff'},
      });
      if(cache&&context?.waitUntil)context.waitUntil(cache.put(cacheKey,response.clone()));
      return response;
    }

    const match = /^\/api\/football\/([^/]+)$/.exec(url.pathname);
    if (!match) return errorJSON('Route inconnue',404);
    const league = decodeURIComponent(match[1]);
    if (!CODES.includes(league)) return errorJSON('Compétition non prise en charge',400);
    if (!env.FOOTBALL_DATA_API_KEY) return errorJSON('Source de résultats non configurée',503);

    // Only approved competition codes may reach the external API.
    const source = COMPETITIONS[league];
    const publicCacheKey = new Request(url.origin+'/api/football/'+encodeURIComponent(league),{method:'GET'});
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    if (cache) {
      const hit = await cache.match(publicCacheKey);
      if (hit) return hit;
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
      if (response.status === 429) return errorJSON('Quota de données atteint, veuillez réessayer plus tard',503);
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
      return out;
    } catch {
      // Never echo token, private headers, upstream payload or internal stack.
      return errorJSON('Résultats momentanément indisponibles',503);
    }
  },
};
