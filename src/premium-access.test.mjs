import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPremiumPayload,protectPremiumResponse} from './premium-access.mjs';
import {accountDatabase} from './sqlite-test-helper.mjs';
import {handleBillingTest} from './billing-test.mjs';
const root='https://feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev';
const tiers=[1.5,2,3].map(target=>({target,market:{name:'scenario-'+target,p:.5,code:'home'}}));
const analysis={tiers,lh:2,la:1,home:.6,draw:.2,away:.2,grid:[{i:2,j:1,p:.5}],quality:'Sample',historyCount:50,playedHome:10,playedAway:10};
const payload={ok:true,competitions:[{matches:[{_sourceId:10,team1:'A',team2:'B',_prediction:{analysis}}]}],records:[{analysis,tiers}],summary:tiers,quotes:tiers};
const access={mode:'freemium',plan:'free',allowedTargets:[1.5]};
test('free responses remove paid choices from feeds, archives, summaries and odds without mutating saved records',()=>{
 const filtered=filterPremiumPayload(payload,access),a=filtered.competitions[0].matches[0]._prediction.analysis;
 assert.deepEqual(a.tiers.map(t=>t.target),[1.5]);assert.equal(a.grid,undefined);assert.equal(a.home,undefined);assert.equal(a.lh,undefined);assert.equal(a.restricted,true);
 assert.deepEqual(filtered.records[0].tiers.map(t=>t.target),[1.5]);assert.deepEqual(filtered.records[0].analysis.tiers.map(t=>t.target),[1.5]);
 assert.deepEqual(filtered.summary.map(t=>t.target),[1.5]);assert.deepEqual(filtered.quotes.map(t=>t.target),[1.5]);
 assert.deepEqual(payload.records[0].analysis.tiers.map(t=>t.target),[1.5,2,3]);assert.equal(payload.records[0].analysis.lh,2);
 assert.ok(!JSON.stringify(filtered).includes('scenario-2'));assert.ok(!JSON.stringify(filtered).includes('scenario-3'));
});
test('open beta preserves all three scenarios and the existing public response',async()=>{
 const r=Response.json(payload);assert.equal(await protectPremiumResponse(new Request(root+'/api/football-featured'),{},r),r);
});
test('all public analysis routes apply the same guest policy and never cache personalized output',async()=>{
 for(const path of ['/api/football-featured','/api/football/fr.1','/api/predictions','/api/prediction/fr.1/10','/api/odds/fr.1/10']){
  const r=await protectPremiumResponse(new Request(root+path),{COTEGO_ACCESS_MODE:'freemium'},Response.json(payload,{headers:{'cache-control':'public,max-age=600'}}));
  assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vary'),'Cookie');assert.equal((await r.json()).records[0].tiers.length,1);
 }
});
test('Plus requires a real session and current server subscription, not client plan hints',async()=>{
 const env={COTEGO_DB:accountDatabase(),COTEGO_AUTH_PEPPER:'a'.repeat(64),COTEGO_ACCESS_MODE:'freemium'};
 const signup=await handleBillingTest(new Request(root+'/api/account/signup',{method:'POST',headers:{origin:root,'content-type':'application/json'},body:JSON.stringify({email:'access@example.invalid',password:'Synthetic account password'})}),env);
 const cookie=signup.headers.get('set-cookie').split(';')[0],id=env.COTEGO_DB.sqlite.prepare('SELECT id FROM users').get().id;
 let r=await protectPremiumResponse(new Request(root+'/api/predictions?plan=plus',{headers:{cookie,'x-plan':'plus'}}),env,Response.json(payload));assert.equal((await r.json()).records[0].tiers.length,1);
 env.COTEGO_DB.sqlite.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run(id,'cus_test','sub_test','active',Math.floor(Date.now()/1000)+3600,1);
 r=await protectPremiumResponse(new Request(root+'/api/predictions',{headers:{cookie}}),env,Response.json(payload));const p=await r.json();assert.equal(p.records[0].tiers.length,3);assert.equal(p.records[0].analysis.lh,2);
});
test('invalid policy and failed entitlement verification fail closed',async()=>{
 let r=await protectPremiumResponse(new Request(root+'/api/predictions'),{COTEGO_ACCESS_MODE:'invalid'},Response.json(payload));assert.equal(r.status,503);assert.ok(!(await r.text()).includes('scenario-'));
 r=await protectPremiumResponse(new Request(root+'/api/predictions',{headers:{cookie:'__Host-cotego_session='+('a'.repeat(64))}}),{COTEGO_ACCESS_MODE:'freemium',COTEGO_DB:{prepare(){throw Error('Unavailable');}},COTEGO_AUTH_PEPPER:'a'.repeat(64)},Response.json(payload));assert.equal(r.status,503);
});
