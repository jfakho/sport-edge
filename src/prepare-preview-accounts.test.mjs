import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePreviewAccounts} from './prepare-preview-accounts.mjs';
const env={WORKERS_CI:'1',WORKERS_CI_BRANCH:'feature/cotego-premium-ux'};
const a={binding:'COTEGO_AUDIT_DB',database_name:'cotego-preview-audit',database_id:'11111111-1111-1111-1111-111111111111'};
const config={name:'cotego',previews:{d1_databases:[a,{...a,binding:'COTEGO_DB'}]}};
const ok=data=>({status:0,stdout:JSON.stringify(data)});
test('account storage setup never runs for production, local execution, or another branch',()=>{for(const e of [{},{...env,WORKERS_CI_BRANCH:'main'},{...env,WORKERS_CI_BRANCH:'other'}])assert.equal(preparePreviewAccounts({env:e,run:()=>assert.fail()}),'skipped');});
test('existing runtime auth secret is preserved and only the dedicated Preview schema is initialized',()=>{
 const calls=[],results=[ok({}),ok([{name:'COTEGO_AUTH_PEPPER',type:'secret_text'}])];
 assert.equal(preparePreviewAccounts({env,cli:'mock',read:()=>JSON.stringify(config),run:(exe,args)=>{calls.push(args);return results.shift();},makePepper:()=>assert.fail()}),'ready');assert.ok(calls[0].includes('db/cotego-test.sql'));assert.ok(!calls.some(args=>args.includes('bulk')));
});
test('first account secret is sent on stdin and is absent from process arguments and environment',()=>{
 const pepper='a'.repeat(64),calls=[],results=[ok({}),ok([]),ok([{results:[{count:0}]}]),ok({})];
 preparePreviewAccounts({env:{...env,FOOTBALL_DATA_API_KEY:'private'},cli:'mock',read:()=>JSON.stringify(config),makePepper:()=>pepper,run:(exe,args,options)=>{calls.push({args,options});return results.shift();}});
 const last=calls.at(-1);assert.ok(last.args.includes('bulk'));assert.equal(JSON.parse(last.options.input).COTEGO_AUTH_PEPPER,pepper);assert.ok(!JSON.stringify(last.args).includes(pepper));assert.equal(last.options.env.FOOTBALL_DATA_API_KEY,undefined);
});
test('missing original auth secret cannot silently invalidate existing accounts',()=>{
 const results=[ok({}),ok([]),ok([{results:[{count:3}]}])];assert.throws(()=>preparePreviewAccounts({env,cli:'mock',read:()=>JSON.stringify(config),run:()=>results.shift(),makePepper:()=>assert.fail()}),/original authentication secret/);
});
test('setup rejects any account binding to a different database',()=>{
 assert.throws(()=>preparePreviewAccounts({env,cli:'mock',read:()=>JSON.stringify({...config,previews:{d1_databases:[a,{...a,binding:'COTEGO_DB',database_id:'other'}]}}),run:()=>assert.fail()}),/Unexpected Preview/);
});
