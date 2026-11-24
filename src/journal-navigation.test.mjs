import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/cotego-platform.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
  const elements=new Map(),listeners=new Map(),requests=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',addEventListener(){}});return elements.get(id);};
  const window={addEventListener:(name,fn)=>listeners.set(name,fn)};
  runInNewContext(source,{
    window,document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
    fetch:url=>url==='/api/status'?Promise.resolve({ok:true,json:async()=>({oddsConfigured:false})}):
      new Promise(resolve=>requests.push({url,resolve:data=>resolve({ok:true,json:async()=>data})}))
  });
  return {requests,element,select:league=>listeners.get('cotego:competition')({detail:{league}})};
}
const journal=coverage=>({configured:true,records:[],summary:[],coverage});
test('concurrent rerenders share one pending journal request',async()=>{
  const h=harness();h.select('fr.1');h.select('fr.1');
  assert.equal(h.requests.length,1);
  h.requests[0].resolve(journal('French snapshot'));await flush();
  assert.match(h.element('#journal-content').innerHTML,/French snapshot/);
});
test('a slow previous competition cannot overwrite a cached current journal',async()=>{
  const h=harness();h.requests[0].resolve(journal('French snapshot'));await flush();
  h.select('en.1');h.select('fr.1');
  assert.equal(h.requests.length,2);
  h.requests[1].resolve(journal('English snapshot'));await flush();
  assert.match(h.element('#journal-content').innerHTML,/French snapshot/);
  assert.doesNotMatch(h.element('#journal-content').innerHTML,/English snapshot/);
});
