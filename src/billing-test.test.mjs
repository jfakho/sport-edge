import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBillingTest,verifyStripeSignature} from './billing-test.mjs';
const ROOT='https://feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev';
const req=(path,init={})=>new Request(ROOT+path,init);

test('unconfigured test database fails closed',async()=>{
  const r=await handleBillingTest(req('/api/account/me'),{});
  assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
});

test('billing routes are disabled on cotego.fr',async()=>{
  const r=await handleBillingTest(new Request('https://cotego.fr/api/account/me'),{});
  assert.equal(r.status,404);
});

test('cross-site POST attempts are rejected',async()=>{
  const r=await handleBillingTest(req('/api/account/signup',{method:'POST',headers:{origin:'https://evil.invalid'},body:'{}'}),{COTEGO_DB:{}});
  assert.equal(r.status,403);
});

test('webhooks must have a genuine signature and cannot be live events',async()=>{
  const request=req('/api/billing/webhook',{method:'POST',body:JSON.stringify({id:'evt_live',livemode:true})});
  const r=await handleBillingTest(request,{COTEGO_DB:{},STRIPE_TEST_WEBHOOK_SECRET:'whsec_fake'});
  assert.equal(r.status,400);
  assert.equal(await verifyStripeSignature('body','t=1,v1='+'a'.repeat(64),'whsec_fake'),false);
});

test('HMAC signature is accepted only inside five minute window',async()=>{
  const raw=JSON.stringify({id:'evt_test1',livemode:false});
  const now=Date.now(),stamp=Math.floor(now/1000),secret='whsec_test_webhook';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+raw))),b=>b.toString(16).padStart(2,'0')).join('');
  const header='t='+stamp+',v1='+signature;
  assert.equal(await verifyStripeSignature(raw,header,secret,now),true);
  assert.equal(await verifyStripeSignature(raw,header,secret,now+700000),false);
});
