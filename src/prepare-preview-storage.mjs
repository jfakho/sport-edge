import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolveWranglerCli} from './ensure-preview-secret.mjs';

const PREVIEW='feature/cotego-premium-ux';
const DATABASE='cotego-preview-audit';
const BINDING='COTEGO_AUDIT_DB';

/** Reuses Workers Builds authorization. Never changes a plan or production.
 * Failure leaves the site deployable, explicitly without durable recording.
 */
export function preparePreviewStorage({env=process.env,run=spawnSync,read=readFileSync,write=writeFileSync,cli}={}) {
  if(env.WORKERS_CI!=='1'||env.WORKERS_CI_BRANCH!==PREVIEW)return 'skipped';
  const executable=cli??resolveWranglerCli();
  const childEnv={...env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_SANITIZE:'true'};
  for(const key of ['FOOTBALL_DATA_API_KEY','ODDS_API_KEY','WRANGLER_LOG'])delete childEnv[key];
  const invoke=(args,input)=>{
    const result=run(process.execPath,[executable,...args],{env:childEnv,input,encoding:'utf8',
      timeout:60000,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});
    if(result.error||result.status!==0)throw new Error('Preview storage authorization or setup unavailable');
    return result.stdout;
  };
  // Restore the optional odds key only when it has been supplied as a build secret.
  // Its value is sent on stdin, never written into configuration or logs.
  const config=JSON.parse(read('wrangler.jsonc','utf8'));
  if(config.name!=='cotego')throw new Error('Unexpected Worker; Preview setup stopped');
  const list=JSON.parse(invoke(['preview','secret','list','--json','--name',PREVIEW,'--worker-name','cotego']));
  const hasOdds=Array.isArray(list)&&list.some(s=>s?.name==='ODDS_API_KEY'&&s.type==='secret_text');
  if(!hasOdds&&typeof env.ODDS_API_KEY==='string'&&env.ODDS_API_KEY.trim()){
    invoke(['preview','secret','bulk','--name',PREVIEW,'--worker-name','cotego'],JSON.stringify({ODDS_API_KEY:env.ODDS_API_KEY}));
  }
  if(hasOdds||env.ODDS_API_KEY?.trim()){
    config.secrets??={};config.secrets.required=[...new Set([...(config.secrets.required||[]),'ODDS_API_KEY'])];
    write('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
  }
  try {
    const databases=()=>JSON.parse(invoke(['d1','list','--json']));
    let database=databases().find(d=>d.name===DATABASE);
    if(!database){
      invoke(['d1','create',DATABASE,'--location','weur','--update-config=false']);
      database=databases().find(d=>d.name===DATABASE);
    }
    if(!/^[a-f0-9-]{36}$/i.test(database?.uuid||''))throw new Error('Preview database unavailable');
    invoke(['d1','execute',DATABASE,'--remote','--file','db/cotego-audit.sql','--yes']);
    config.d1_databases=[...(config.d1_databases||[]).filter(d=>d.binding!==BINDING),
      {binding:BINDING,database_name:DATABASE,database_id:database.uuid}];
    write('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
    return 'ready';
  } catch {return 'unavailable';}
}
