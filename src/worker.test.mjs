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
