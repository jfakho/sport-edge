import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePreviewSecret} from './ensure-preview-secret.mjs';

const env = {WORKERS_CI:'1', WORKERS_CI_BRANCH:'feature/cotego-premium-ux'};
const listed = [{name:'FOOTBALL_DATA_API_KEY', type:'secret_text'}];
const result = data => ({status:0, stdout:JSON.stringify(data)});

test('never manages production, another branch, or a local build', () => {
  for (const e of [{}, {...env,WORKERS_CI_BRANCH:'main'}, {...env,WORKERS_CI_BRANCH:'feature/other'}, {...env,WORKERS_CI:'0'}]) {
    assert.equal(ensurePreviewSecret({env:e,run:()=>assert.fail('Must not call Cloudflare')}),'skipped');
  }
});
test('keeps an existing runtime secret without needing or overwriting its value', () => {
  let calls=0;
  assert.equal(ensurePreviewSecret({env,cli:'/mock/wrangler.js',run:()=>{calls++;return result(listed);}}),'preserved');
  assert.equal(calls,1);
});
test('restores only the intended Preview using private stdin, then verifies it', () => {
  const calls=[];
  const fake='test-only-$literal-value';
  const replies=[result([]),result({}),result(listed)];
  const status=ensurePreviewSecret({env:{...env,FOOTBALL_DATA_API_KEY:fake},cli:'/mock/wrangler.js',run:(command,args,opts)=>{
    calls.push({command,args,opts});return replies.shift();
  }});
  assert.equal(status,'restored');
  assert.equal(calls.length,3);
  for (const c of calls) {
    assert.ok(c.args.includes('feature/cotego-premium-ux'));
    assert.ok(c.args.includes('cotego'));
    assert.ok(!c.args.join(' ').includes(fake));
    assert.equal(c.opts.env.FOOTBALL_DATA_API_KEY,undefined);
  }
  assert.deepEqual(JSON.parse(calls[1].opts.input),{FOOTBALL_DATA_API_KEY:fake});
  assert.ok(calls[1].args.includes('bulk'));
});
test('fails before mutation if no build value can restore the missing runtime secret', () => {
  let calls=0;
  assert.throws(()=>ensurePreviewSecret({env,cli:'/mock/wrangler.js',run:()=>{calls++;return result([]);}}),/build secret unavailable/);
  assert.equal(calls,1);
});
test('withholds CLI output on permission failures and rejects failed restoration', () => {
  assert.throws(()=>ensurePreviewSecret({env,cli:'/mock/wrangler.js',run:()=>({status:1,stdout:'private-details',stderr:'private-details'})}),e=>!e.message.includes('private-details'));
  const replies=[result([]),result({}),result([])];
  assert.throws(()=>ensurePreviewSecret({env:{...env,FOOTBALL_DATA_API_KEY:'test-only'},cli:'/mock/wrangler.js',run:()=>replies.shift()}),/restoration not confirmed/);
});
