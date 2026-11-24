import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDatabase} from './sqlite-test-helper.mjs';
import {fetchFootballProvider} from './football-provider-cache.mjs';
const body={competition:{code:'FL1'},matches:[{id:1}]};
const fixed=Date.parse('2026-11-15T18:00:00Z');
const environment=db=>({COTEGO_AUDIT_DB:db,FOOTBALL_DATA_API_KEY:'test-only-token'});
test('different visitors share one successful football response for ten minutes',async()=>{
 const db=auditDatabase();let calls=0;
 const fetcher=async()=>{calls++;return Response.json(body);};
 for(let visitor=0;visitor<5;visitor++)assert.deepEqual(await (await fetchFootballProvider(environment(db),'fr.1',{fetcher,clock:()=>fixed})).json(),body);
 assert.equal(calls,1);
 await fetchFootballProvider(environment(db),'fr.1',{fetcher,clock:()=>fixed+601000});
 assert.equal(calls,2);
});
test('parallel cold visitors reserve one upstream call and reuse its result',async()=>{
 const db=auditDatabase();let calls=0;
 const fetcher=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));return Response.json(body);};
 const responses=await Promise.all([1,2].map(()=>fetchFootballProvider(environment(db),'fr.1',{fetcher,clock:()=>fixed})));
 assert.ok(responses.every(r=>r.ok));assert.equal(calls,1);
});
test('the global free-provider request budget applies across every league',async()=>{
 const db=auditDatabase();
 for(let i=0;i<9;i++)db.sqlite.prepare('INSERT INTO football_provider_requests VALUES(?,?)').run('seed-'+i,fixed);
 const response=await fetchFootballProvider(environment(db),'fr.1',{clock:()=>fixed,fetcher:()=>assert.fail('Quota must stop the request')});
 assert.equal(response.status,429);
});
test('an error or different competition cannot become a successful shared cache entry',async()=>{
 const db=auditDatabase();
 await assert.rejects(()=>fetchFootballProvider(environment(db),'fr.1',{clock:()=>fixed,fetcher:async()=>Response.json({...body,competition:{code:'PL'}})}),/mismatch/);
 assert.equal(db.sqlite.prepare('SELECT payload_json FROM football_feed_cache').get().payload_json,null);
 const response=await fetchFootballProvider(environment(db),'fr.1',{clock:()=>fixed,fetcher:async()=>new Response(null,{status:429,headers:{'retry-after':'60'}})});
 assert.equal(response.status,429);
 assert.equal(db.sqlite.prepare('SELECT payload_json FROM football_feed_cache').get().payload_json,null);
});
