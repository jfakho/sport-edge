import {accountEntitlements} from './billing-test.mjs';
const protectedRoute=path=>/^\/api\/(football(?:-featured|\/[a-z0-9.-]+)|predictions|prediction\/[a-z0-9.]+\/\d+|odds\/[a-z0-9.]+\/\d+)$/.test(path);
/** Filters every response surface that can contain saved scenario choices.
 * Beta remains open. The commercial mode is deliberately NOT enabled in Preview.
 */
export function filterPremiumPayload(payload,access){
 const allowed=new Set(access.allowedTargets);
 const visit=(value,key='')=>{
  if(Array.isArray(value))return value.filter(item=>!['tiers','summary','quotes'].includes(key)||allowed.has(Number(item?.target))).map(item=>visit(item));
  if(!value||typeof value!=='object')return value;
  if(key==='analysis'&&Array.isArray(value.tiers)&&!allowed.has(2)){
   const visible={restricted:true,tiers:visit(value.tiers,'tiers')};
   for(const name of ['quality','historyCount','playedHome','playedAway'])if(name in value)visible[name]=value[name];
   return visible;
  }
  const result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));
  if(value._sourceId)result._analysisAccess=access;
  return result;
 };
 return {...visit(payload),access};
}
export async function protectPremiumResponse(request,env,response){
 const mode=env.COTEGO_ACCESS_MODE||'beta-open',path=new URL(request.url).pathname;
 if(mode==='beta-open'||!protectedRoute(path)||!response.ok)return response;
 const headers=new Headers(response.headers);headers.set('cache-control','private, no-store');headers.set('vary','Cookie');headers.delete('content-length');headers.delete('etag');
 if(mode!=='freemium')return Response.json({ok:false,error:'Access mode unavailable'},{status:503,headers});
 try{
  const rights=env.COTEGO_DB&&env.COTEGO_AUTH_PEPPER?await accountEntitlements(request,env):{plan:'guest',premiumTargets:[1.5]};
  const access={mode:'freemium',plan:rights.plan,allowedTargets:rights.premiumTargets};
  return Response.json(filterPremiumPayload(await response.json(),access),{headers});
 }catch{return Response.json({ok:false,error:'Access verification unavailable'},{status:503,headers});}
}
