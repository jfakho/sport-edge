import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBillingTest} from './billing-test.mjs';
import {accountDatabase} from './sqlite-test-helper.mjs';
const root='https://feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev';
const setup=()=>({COTEGO_DB:accountDatabase(),COTEGO_AUTH_PEPPER:'a'.repeat(64),STRIPE_TEST_PRICE_ID:'price_test'});
const request=(path,body,cookie,ip='192.0.2.1')=>new Request(root+path,{method:body?'POST':'GET',headers:{...(body?{origin:root,'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),'cf-connecting-ip':ip},body:body?JSON.stringify(body):undefined});
const fields={email:'test@example.invalid',password:'A synthetic test password!'};
async function signup(env){const r=await handleBillingTest(request('/api/account/signup',fields),env);assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0];}
test('test-account configuration discloses flags, never a secret',async()=>{
 const env=setup(),r=await handleBillingTest(request('/api/account/config'),env),body=await r.json();
 assert.equal(body.accountsConfigured,true);assert.equal(body.stripeConfigured,false);assert.ok(!JSON.stringify(body).includes(env.COTEGO_AUTH_PEPPER));
});
test('signup, session, login and logout persist correctly with no plaintext password or token',async()=>{
 const env=setup(),cookie=await signup(env);
 const user=env.COTEGO_DB.sqlite.prepare('SELECT * FROM users').get();assert.equal(user.iterations,100000);assert.notEqual(user.password_hash,fields.password);assert.match(user.password_hash,/^[a-f0-9]{64}$/);
 const saved=env.COTEGO_DB.sqlite.prepare('SELECT * FROM sessions').get();assert.ok(!cookie.includes(saved.token_hash));
 let r=await handleBillingTest(request('/api/account/me',null,cookie),env);let data=await r.json();assert.equal(data.plan,'free');assert.deepEqual(data.premiumTargets,[1.5]);assert.deepEqual(data.betaTargets,[1.5,2,3]);assert.equal(data.premiumEnforced,false);
 r=await handleBillingTest(request('/api/account/logout',{},cookie),env);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax; Max-Age=0/);
 assert.equal((await handleBillingTest(request('/api/account/me',null,cookie),env)).status,401);
 r=await handleBillingTest(request('/api/account/login',fields),env);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
});
test('a supplied plan, invented cookie, wrong password or different pepper cannot grant Plus',async()=>{
 const env=setup();let r=await handleBillingTest(request('/api/account/signup',{...fields,plan:'plus'}),env);const cookie=r.headers.get('set-cookie').split(';')[0];
 assert.equal((await (await handleBillingTest(request('/api/account/me',null,cookie),env)).json()).plan,'free');
 assert.equal((await handleBillingTest(request('/api/account/me',null,'__Host-cotego_session='+('f'.repeat(64))),env)).status,401);
 assert.equal((await handleBillingTest(request('/api/account/login',{...fields,password:'wrong'}),env)).status,401);
 assert.equal((await handleBillingTest(request('/api/account/login',fields),{...env,COTEGO_AUTH_PEPPER:'b'.repeat(64)})).status,401);
});
test('Plus follows only server-side active and unexpired subscription state',async()=>{
 const env=setup(),cookie=await signup(env),id=env.COTEGO_DB.sqlite.prepare('SELECT id FROM users').get().id;
 const sql=env.COTEGO_DB.sqlite.prepare('INSERT OR REPLACE INTO subscriptions VALUES (?,?,?,?,?,?)');
 for(const [status,end,expected] of [['active',Math.floor(Date.now()/1000)+3600,'plus'],['canceled',Math.floor(Date.now()/1000)+3600,'free'],['active',1,'free'],['past_due',Math.floor(Date.now()/1000)+3600,'free']]){
  sql.run(id,'cus_test','sub_test',status,end,1);const data=await (await handleBillingTest(request('/api/account/me',null,cookie),env)).json();assert.equal(data.plan,expected);assert.deepEqual(data.premiumTargets,expected==='plus'?[1.5,2,3]:[1.5]);
 }
});
test('login rate limits are enforced independently of successful password verification',async()=>{
 const env=setup();await signup(env);
 for(let i=0;i<6;i++)assert.equal((await handleBillingTest(request('/api/account/login',{...fields,password:'incorrect'}),env)).status,401);
 assert.equal((await handleBillingTest(request('/api/account/login',fields),env)).status,429);
});
test('checkout refuses live keys and missing webhook configuration before contacting Stripe',async()=>{
 const env=setup(),cookie=await signup(env),previous=globalThis.fetch;let called=0;globalThis.fetch=async()=>{called++;throw Error('Unexpected network');};
 try{for(const key of ['sk_live_forbidden','rk_live_forbidden','rk_test_placeholder'])assert.equal((await handleBillingTest(request('/api/billing/checkout',{},cookie),{...env,STRIPE_TEST_SECRET_KEY:key})).status,503);assert.equal(called,0);}finally{globalThis.fetch=previous;}
});
