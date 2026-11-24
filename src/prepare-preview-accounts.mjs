import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolveWranglerCli} from './ensure-preview-secret.mjs';
const PREVIEW='feature/cotego-premium-ux';
/** Initializes only the already-authorized Preview database and a write-only secret. */
export function preparePreviewAccounts({env=process.env,run=spawnSync,read=readFileSync,cli,makePepper=()=>randomBytes(32).toString('hex')}={}){
 if(env.WORKERS_CI!=='1'||env.WORKERS_CI_BRANCH!==PREVIEW)return 'skipped';
 const config=JSON.parse(read('wrangler.jsonc','utf8'));
 const bindings=config.previews?.d1_databases||[],audit=bindings.find(b=>b.binding==='COTEGO_AUDIT_DB'),account=bindings.find(b=>b.binding==='COTEGO_DB');
 if(config.name!=='cotego'||!audit||audit.database_name!=='cotego-preview-audit'||account?.database_id!==audit.database_id||account.database_name!==audit.database_name)throw Error('Unexpected Preview account storage');
 const executable=cli??resolveWranglerCli(),childEnv={...env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_SANITIZE:'true'};
 for(const key of ['FOOTBALL_DATA_API_KEY','ODDS_API_KEY','COTEGO_AUTH_PEPPER','STRIPE_TEST_SECRET_KEY','STRIPE_TEST_WEBHOOK_SECRET','WRANGLER_LOG'])delete childEnv[key];
 const invoke=(args,input)=>{const r=run(process.execPath,[executable,...args],{env:childEnv,input,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});if(r.error||r.status!==0)throw Error('Preview account setup unavailable; deployment stopped');return r.stdout;};
 const migrationConfig='wrangler.preview-migrations.generated.json';
 invoke(['d1','execute','COTEGO_AUDIT_DB','--remote','--config',migrationConfig,'--file','db/cotego-test.sql','--yes']);
 const list=JSON.parse(invoke(['preview','secret','list','--json','--name',PREVIEW,'--worker-name','cotego']));
 if(!Array.isArray(list))throw Error('Invalid Preview secret metadata');
 if(!list.some(s=>s?.name==='COTEGO_AUTH_PEPPER'&&s.type==='secret_text')){
  const count=JSON.parse(invoke(['d1','execute','COTEGO_AUDIT_DB','--remote','--config',migrationConfig,'--command','SELECT count(*) AS count FROM users','--json']));
  const existing=count?.[0]?.results?.[0]?.count;
  if(!Number.isSafeInteger(existing)||existing<0)throw Error('Cannot verify existing test accounts');
  const supplied=env.COTEGO_AUTH_PEPPER;
  if(existing>0&&!/^[a-f0-9]{64}$/i.test(supplied||''))throw Error('Existing test accounts require restoration of their original authentication secret');
  const pepper=supplied||makePepper();if(!/^[a-f0-9]{64}$/i.test(pepper))throw Error('Invalid authentication secret');
  invoke(['preview','secret','bulk','--name',PREVIEW,'--worker-name','cotego'],JSON.stringify({COTEGO_AUTH_PEPPER:pepper}));
 }
 return 'ready';
}
