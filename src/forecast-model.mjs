// Server counterpart of the browser model. Parity is checked against index.html.
// This module never reads a prediction, probability or timestamp from the client.
export const MODEL_VERSION = 'poisson-v1-20261115';
export function createFootballModel(referenceDate) {
  function today() { return referenceDate ?? new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  function daysBetween(a,b) { return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000); }
  function clamp(x,lo,hi) { return Math.max(lo,Math.min(hi,x)); }
const TIERS = [
    { name: 'Niveau A · fréquence élevée', target: 1.5, color: 'tier-safe', brief: 'Cible ~1,50' },
    { name: 'Niveau B · fréquence intermédiaire', target: 2.0, color: 'tier-balanced', brief: 'Cible ~2,00' },
    { name: 'Niveau C · fréquence plus faible', target: 3.0, color: 'tier-risk', brief: 'Cible ~3,00' }
  ];
const MARKET_TYPES = [
    ['home', 'Victoire domicile', 'result', (a,b)=>a>b],
    ['draw', 'Match nul', 'result', (a,b)=>a===b],
    ['away', 'Victoire extérieur', 'result', (a,b)=>a<b],
    ['1X', 'Domicile ou nul', 'double', (a,b)=>a>=b],
    ['X2', 'Nul ou extérieur', 'double', (a,b)=>a<=b],
    ['12', 'Une équipe gagne', 'double', (a,b)=>a!==b],
    ['o05', 'Plus de 0,5 but', 'total', (a,b)=>a+b>=1],
    ['o15', 'Plus de 1,5 but', 'total', (a,b)=>a+b>=2],
    ['o25', 'Plus de 2,5 buts', 'total', (a,b)=>a+b>=3],
    ['o35', 'Plus de 3,5 buts', 'total', (a,b)=>a+b>=4],
    ['u15', 'Moins de 1,5 but', 'total', (a,b)=>a+b<=1],
    ['u25', 'Moins de 2,5 buts', 'total', (a,b)=>a+b<=2],
    ['u35', 'Moins de 3,5 buts', 'total', (a,b)=>a+b<=3],
    ['btts', 'Les deux équipes marquent', 'btts', (a,b)=>a>0&&b>0],
    ['notbtts', 'Au moins une équipe muette', 'btts', (a,b)=>a===0||b===0],
    ['hg05', 'Domicile marque au moins 1', 'homegoals', (a,b)=>a>=1],
    ['ag05', 'Extérieur marque au moins 1', 'awaygoals', (a,b)=>b>=1],
    ['hg15', 'Domicile marque au moins 2', 'homegoals', (a,b)=>a>=2],
    ['ag15', 'Extérieur marque au moins 2', 'awaygoals', (a,b)=>b>=2]
  ];
function weightedMean(rows,field,priorMean,prior=5) {
    let sum=prior*priorMean,weights=prior;
    for(const row of rows) {sum+=row[field]*row.weight;weights+=row.weight;}
    return sum/weights;
  }
  function forecast(match, all) {
    if(match.recordedPrediction?.analysis?.tiers?.length===3)return match.recordedPrediction.analysis;
    // Low-data fallback: estimates are always labeled by evidence quality.
    const previous=all.filter(m=>m.score && m.date<match.date && m.date<today() && daysBetween(m.date,match.date)<=550);
    const rows=previous.map(m=>({ ...m, weight:Math.exp(-Math.max(0,daysBetween(m.date,match.date))/240), hg:m.score[0], ag:m.score[1] }));
    const totalWeight=rows.reduce((s,m)=>s+m.weight,0);
    // Generic assumptions, not observed league statistics.
    const priorWeight=12;
    const avgHome=clamp((rows.reduce((s,m)=>s+m.hg*m.weight,0)+priorWeight*1.45)/(totalWeight+priorWeight),.6,3.4);
    const avgAway=clamp((rows.reduce((s,m)=>s+m.ag*m.weight,0)+priorWeight*1.15)/(totalWeight+priorWeight),.45,3.1);
    const homeMatches=rows.filter(m=>m.home===match.home);
    const awayMatches=rows.filter(m=>m.away===match.away);
    const playedHome=rows.filter(m=>m.home===match.home || m.away===match.home).length;
    const playedAway=rows.filter(m=>m.home===match.away || m.away===match.away).length;
    const homeOff=weightedMean(homeMatches,'hg',avgHome)/avgHome;
    const homeDef=weightedMean(homeMatches,'ag',avgAway)/avgAway;
    const awayOff=weightedMean(awayMatches,'ag',avgAway)/avgAway;
    const awayDef=weightedMean(awayMatches,'hg',avgHome)/avgHome;
    const lh=clamp(avgHome*homeOff*awayDef,.25,4.2);
    const la=clamp(avgAway*awayOff*homeDef,.25,4.2);
    const homeP=poissonList(lh),awayP=poissonList(la),grid=[];
    let norm=0;
    for(let i=0;i<homeP.length;i++)for(let j=0;j<awayP.length;j++){const p=homeP[i]*awayP[j];norm+=p;grid.push({i,j,p});}
    grid.forEach(x=>x.p/=norm);
    const home=grid.filter(x=>x.i>x.j).reduce((a,x)=>a+x.p,0),draw=grid.filter(x=>x.i===x.j).reduce((a,x)=>a+x.p,0),away=1-home-draw;
    const markets=MARKET_TYPES.map(([code,name,group,fn])=>({code,name,group,p:grid.filter(x=>fn(x.i,x.j)).reduce((a,x)=>a+x.p,0)})).filter(m=>m.p>.08&&m.p<.97);
    const used=new Set(),usedGroups=new Set();
    const tiers=TIERS.map(t=>{
      const options=markets.filter(m=>!used.has(m.code)).sort((a,b)=>{
        const score=m=>Math.abs(Math.log((1/m.p)/t.target))+(usedGroups.has(m.group)?.05:0);
        return score(a)-score(b);
      });
      const pick=options[0];if(!pick)return {...t,market:null}; used.add(pick.code);usedGroups.add(pick.group);
      return {...t,market:pick};
    });
    const strength=Math.min(playedHome,playedAway);
    const latest=previous.at(-1)?.date;
    const stale=!latest || daysBetween(latest,today())>21;
    const quality=previous.length===0?'Simulation sans historique — hypothèses génériques uniquement'
      :stale?'Fiabilité très faible — historique ancien'
      :previous.length<24 || strength<2?'Fiabilité très faible — historique insuffisant'
      :strength<6?'Échantillon limité':strength<12?'Échantillon modéré':'Échantillon étoffé';
    return { lh,la,home,draw,away,tiers,playedHome,playedAway,historyCount:previous.length,quality,grid };
  }
  function poissonList(lambda) { let p=Math.exp(-lambda),arr=[p]; for(let k=1;k<=10;k++){p*=lambda/k;arr.push(p);} return arr; }

  // Exact score-distribution totals from the existing Poisson 1N2 model.
return {forecast,MARKET_TYPES,TIERS};
}
