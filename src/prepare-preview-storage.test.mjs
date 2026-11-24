import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePreviewStorage} from './prepare-preview-storage.mjs';
const env={WORKERS_CI:'1',WORKERS_CI_BRANCH:'feature/cotego-premium-ux'};
const database={name:'cotego-preview-audit',uuid:'11111111-1111-1111-1111-111111111111'};
const result=data=>({status:0,stdout:JSON.stringify(data)});
const config={name:'cotego',secrets:{required:['FOOTBALL_DATA_API_KEY']}};
test('storage setup cannot run on production or a local build',()=>{
  for(const e of [{},{...env,WORKERS_CI_BRANCH:'main'},{...env,WORKERS_CI_BRANCH:'other'}]){
    assert.equal(preparePreviewStorage({env:e,run:()=>assert.fail()}),'skipped');
  }
});
test('reuses only the named Preview database and never rewrites an existing runtime key',()=>{
  const calls=[],writes=[];
  const responses=[result([{name:'ODDS_API_KEY',type:'secret_text'}]),result([database]),result({})];
  assert.equal(preparePreviewStorage({env,cli:'mock',run:(exe,args)=>{calls.push(args);return responses.shift();},
    read:()=>JSON.stringify(config),write:(path,body)=>writes.push(JSON.parse(body))}),'ready');
  assert.ok(!calls.some(args=>args.includes('create')||args.includes('bulk')));
  const finalConfig=writes.findLast(value=>value.name==='cotego');
  assert.equal(finalConfig.previews.d1_databases[0].database_name,database.name);
  assert.equal(finalConfig.d1_databases,undefined,'Production binding must remain absent');
  assert.ok(finalConfig.secrets.required.includes('ODDS_API_KEY'));
});
test('denied storage authorization does not prevent the visual update or invent a binding',()=>{
  let calls=0,writes=0;
  assert.equal(preparePreviewStorage({env,cli:'mock',read:()=>JSON.stringify(config),write:()=>writes++,run:()=>{
    calls++;return calls===1?result([]):{status:1,stderr:'private diagnostics'};
  }}),'unavailable');
  assert.equal(writes,1,'Only non-secret setup metadata is saved on failure');
});

test('odds build secret is restored privately on the exact Preview and confirmed before deploying',()=>{
 const calls=[],writes=[];
 const responses=[result([]),result({}),result([{name:'ODDS_API_KEY',type:'secret_text'}]),result([database]),result({})];
 const token='test-only-not-a-real-key';
 assert.equal(preparePreviewStorage({env:{...env,ODDS_API_KEY:token},cli:'mock',
 run:(exe,args,options)=>{calls.push({args,options});return responses.shift();},
 read:()=>JSON.stringify(config),write:(path,body)=>writes.push(body)}),'ready');
 const bulk=calls.find(c=>c.args.includes('bulk'));
 assert.equal(bulk.options.input,JSON.stringify({ODDS_API_KEY:token}));
 assert.equal(bulk.options.env.ODDS_API_KEY,undefined);
 assert.ok(bulk.args.includes('feature/cotego-premium-ux'));
 assert.ok(calls.every(c=>!c.args.join(' ').includes(token)));
 assert.ok(writes.every(body=>!body.includes(token)));
 assert.equal(calls.filter(c=>c.args.includes('secret')&&c.args.includes('list')).length,2);
});
test('unconfirmed odds secret stops before database or configuration changes',()=>{
 const responses=[result([]),result({}),result([])];
 assert.throws(()=>preparePreviewStorage({env:{...env,ODDS_API_KEY:'fake'},cli:'mock',run:()=>responses.shift(),
 read:()=>JSON.stringify(config),write:()=>assert.fail('Must not claim configured')}),/restoration was not confirmed/);
});
