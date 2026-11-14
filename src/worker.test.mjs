import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const api = (path) => new Request('https://cotego.example'+path);
const envWithoutSecret = {ASSETS:{fetch:()=>new Response('static asset')}};
const match = {
  id:321, status:'FINISHED', utcDate:'2026-11-10T20:00:00Z',
  homeTeam:{id:11,name:'Equipe domicile'},
  awayTeam:{id:12,name:'Equipe extérieure'},
  score:{fullTime:{home:2,away:1},halfTime:{home:1,away:0}},
};

test('non-API assets stay available without invoking upstream', async()=>{
  const res=await worker.fetch(api('/'),envWithoutSecret,{});
  assert.equal(await res.text(),'static asset');
});

test('unknown competition cannot invoke upstream', async()=>{
  const res=await worker.fetch(api('/api/football/whatever'),envWithoutSecret,{});
  assert.equal(res.status,400);
  assert.equal(res.headers.get('cache-control'),'no-store');
});

test('missing secret yields explicit 503 without leaking credentials', async()=>{
  const res=await worker.fetch(api('/api/football/fr.1'),envWithoutSecret,{});
  assert.equal(res.status,503);
  assert.match((await res.json()).error,/non configurée/);
});

test('rejects non-GET for API', async()=>{
  const res=await worker.fetch(new Request('https://cotego.example/api/football/fr.1',{method:'POST'}),envWithoutSecret,{});
  assert.equal(res.status,405);
});

test('happy path transmits secret only in upstream header and omits it from response', async()=>{
  const TOKEN='private-test-token-please-never-publish';
  const requests=[];
  mock.method(globalThis,'fetch',async (url, options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({matches:[match]}),{status:200,headers:{'content-type':'application/json'}});
  });
  try{
    const res=await worker.fetch(api('/api/football/fr.1'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:TOKEN},{waitUntil(){}});
    assert.equal(res.status,200);
    assert.equal(res.headers.get('x-cotego-source'),'football-data.org');
    const data=await res.json();
    assert.equal(data.matches[0].score.ft[0],2);
    assert.equal(requests.length,1);
    assert.equal(requests[0].options.redirect,'manual');
    assert.equal(requests[0].options.headers['X-Auth-Token'],TOKEN);
    assert.ok(!JSON.stringify(data).includes(TOKEN));
  } finally {mock.restoreAll();}
});

test('upstream 401 is hidden from browser', async()=>{
  mock.method(globalThis,'fetch',async ()=>new Response('token invalid',{status:401}));
  try{
    const res=await worker.fetch(api('/api/football/fr.1'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:'test-only'},{});
    assert.equal(res.status,503);
    assert.ok(!(await res.text()).includes('token invalid'));
  } finally {mock.restoreAll();}
});


test('status endpoint exposes only configuration availability, not the token',async()=>{
  const secret='never-send-secret-to-browser';
  const r=await worker.fetch(api('/api/status'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:secret},{});
  const result=await r.json();
  assert.equal(r.status,200);
  assert.equal(result.ok,true);
  assert.equal(result.footballDataConfigured,true);
  assert.equal(result.liveScores,false);
  assert.ok(!(JSON.stringify(result).includes(secret)));
  const unconfigured=await worker.fetch(api('/api/status'),envWithoutSecret,{});
  assert.equal((await unconfigured.json()).footballDataConfigured,false);
});

test('cross-league endpoint exposes five independent competitions and never leaks token',async()=>{
  const seen=[];
  mock.method(globalThis,'fetch',async url=>{
    seen.push(String(url));
    return new Response(JSON.stringify({matches:[match]}),{status:200,headers:{'content-type':'application/json'}});
  });
  try {
    const response=await worker.fetch(api('/api/football-featured'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:'private-token'},{});
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.competitions.length,5);
    assert.deepEqual(payload.competitions.map(x=>x.league),['fr.1','en.1','es.1','de.1','it.1']);
    assert.equal(seen.length,5);
    assert.ok(!JSON.stringify(payload).includes('private-token'));
  } finally {mock.restoreAll();}
});

test('partial five-league failures are not cached and are retried',async()=>{
  const cached=[];
  let calls=0;
  mock.method(globalThis,'fetch',async ()=>{
    calls++;
    if(calls===2) return new Response('temporarily unavailable',{status:503});
    return new Response(JSON.stringify({matches:[match]}),{status:200,headers:{'content-type':'application/json'}});
  });
  const previousCaches=globalThis.caches;
  globalThis.caches={default:{
    match:async()=>undefined,
    put:async (_key,response)=>{cached.push(await response.json());},
  }};
  try {
    const pending=[];
    const context={waitUntil:p=>pending.push(p)};
    const env={...envWithoutSecret,FOOTBALL_DATA_API_KEY:'test-only'};
    const firstResponse=await worker.fetch(api('/api/football-featured'),env,context);
    const first=await firstResponse.json();
    assert.equal(firstResponse.headers.get('cache-control'),'no-store');
    assert.equal(first.competitions.filter(x=>!x.ok).length,1);
    assert.equal(cached.length,0);
    assert.equal(pending.length,0);
    const secondResponse=await worker.fetch(api('/api/football-featured'),env,context);
    const second=await secondResponse.json();
    assert.match(secondResponse.headers.get('cache-control'),/max-age=120/);
    assert.equal(second.competitions.filter(x=>!x.ok).length,0);
    await Promise.all(pending);
    assert.equal(cached.length,1);
    assert.equal(calls,10);
  } finally {
    if(previousCaches===undefined) delete globalThis.caches;
    else globalThis.caches=previousCaches;
    mock.restoreAll();
  }
});

test('featured feed stops further upstream calls on rate limit and marks remaining leagues unavailable',async()=>{
  let calls=0;
  mock.method(globalThis,'fetch',async()=>{
    calls++;
    if(calls===2) return new Response('rate limited',{status:429});
    return new Response(JSON.stringify({matches:[match]}),{status:200,headers:{'content-type':'application/json'}});
  });
  try {
    const res=await worker.fetch(api('/api/football-featured'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:'test-only'},{});
    assert.equal(res.status,200);
    assert.equal(res.headers.get('cache-control'),'no-store');
    const body=await res.json();
    assert.equal(calls,2);
    assert.equal(body.competitions.length,5);
    assert.equal(body.competitions[0].ok,true);
    assert.ok(body.competitions.slice(1).every(x=>!x.ok && /Quota/.test(x.error)));
  } finally {mock.restoreAll();}
});


test('malformed encoded league returns 400 without contacting upstream',async()=>{
  let calls=0;
  mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('unexpected upstream request');});
  try {
    const res=await worker.fetch(api('/api/football/%E0%A4%A'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:'test-only'},{});
    assert.equal(res.status,400);
    assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal(calls,0);
  } finally {mock.restoreAll();}
});

test('upstream redirects are never followed with the private token',async()=>{
  let calls=0;
  mock.method(globalThis,'fetch',async(_url,options)=>{
    calls++;
    assert.equal(options.redirect,'manual');
    return new Response(null,{status:302,headers:{location:'https://untrusted.example/collect'}});
  });
  try {
    const res=await worker.fetch(api('/api/football/fr.1'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:'private-test-token'},{});
    assert.equal(res.status,503);
    assert.equal(calls,1);
    assert.ok(!(await res.text()).includes('untrusted.example'));
    assert.equal(res.headers.get('cache-control'),'no-store');
  } finally {mock.restoreAll();}
});


test('featured feed never follows upstream redirects or exposes the private key',async()=>{
  const TOKEN='featured-private-test-token';
  const requests=[];
  mock.method(globalThis,'fetch',async (url,options)=>{
    requests.push({url:String(url),redirect:options.redirect,token:options.headers['X-Auth-Token']});
    return new Response(null,{status:302,headers:{location:'https://untrusted.example/collect'}});
  });
  try {
    const res=await worker.fetch(api('/api/football-featured'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:TOKEN},{});
    assert.equal(res.status,503);
    assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal(requests.length,5);
    assert.ok(requests.every(x=>x.redirect==='manual' && x.token===TOKEN));
    const body=await res.text();
    assert.ok(!body.includes(TOKEN));
    assert.ok(!body.includes('untrusted.example'));
  } finally {mock.restoreAll();}
});

test('featured feed does not cache an entirely unavailable response',async()=>{
  const previousCaches=globalThis.caches;
  let writes=0;
  globalThis.caches={default:{match:async()=>undefined,put:async()=>{writes++;}}};
  mock.method(globalThis,'fetch',async()=>new Response('provider down',{status:503}));
  try {
    const res=await worker.fetch(api('/api/football-featured'),{...envWithoutSecret,FOOTBALL_DATA_API_KEY:'test-only'},{waitUntil(){throw new Error('must not cache');}});
    assert.equal(res.status,503);
    assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal(writes,0);
    assert.ok(!(await res.text()).includes('provider down'));
  } finally {
    if(previousCaches===undefined) delete globalThis.caches;
    else globalThis.caches=previousCaches;
    mock.restoreAll();
  }
});
