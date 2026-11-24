/* Shared browser/Node media policy. Only curated, dated photos may be displayed. */
(function (root, factory) {
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.CotegoMedia=api;
})(typeof globalThis!=='undefined'?globalThis:this, function () {
  'use strict';
  // No current photo meets the date rule. Add licensed photos with verified
  // capture dates here; never substitute upload/modified dates for capture dates.
  const PHOTOS=Object.freeze([]);
  const LOCAL_CRESTS=Object.freeze(Object.fromEntries([64,516,521,522,523,524,535].map(id=>[id,'/media/clubs/'+id+'.png'])));
  function calendarDate(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
  }
  function isPhotoAllowed(photo, sport='football', now=new Date()) {
    const captured=calendarDate(photo?.capturedAt);
    if(!captured||!Number.isFinite(now?.getTime?.()))return false;
    const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
    if(captured>today)return false;
    if(sport==='tennis')return true;
    if(!['football','basketball','basket'].includes(sport))return false;
    const lastYear=today.getUTCFullYear()-1,month=today.getUTCMonth();
    const day=Math.min(today.getUTCDate(),new Date(Date.UTC(lastYear,month+1,0)).getUTCDate());
    return captured>=new Date(Date.UTC(lastYear,month,day));
  }
  function fixturePhoto(match, sport='football', now=new Date(), photos=PHOTOS) {
    if(!match?.sourceId||!Array.isArray(match.teamIds))return null;
    return photos.find(photo=>photo.sport===sport&&match.teamIds.includes(photo.teamId)
      &&isPhotoAllowed(photo,sport,now)&&/^\/media\/[a-z0-9/-]+\.(jpg|jpeg|png|webp)$/.test(photo.src))||null;
  }
  function safeProviderCrest(value) {
    if(typeof value!=='string')return null;
    try {
      const u=new URL(value);
      return u.origin==='https://crests.football-data.org'&&!u.username&&!u.password&&!u.search&&!u.hash
        &&/^\/[a-zA-Z0-9_-]+\.(png|svg|webp)$/.test(u.pathname)?u.href:null;
    }catch{return null;}
  }
  function crestUrl(id, provided) {
    if(!Number.isSafeInteger(id)||id<=0)return null;
    return LOCAL_CRESTS[id]||safeProviderCrest(provided);
  }
  return Object.freeze({isPhotoAllowed,fixturePhoto,crestUrl,safeProviderCrest});
});
