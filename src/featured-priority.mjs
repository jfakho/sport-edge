// Editorial interest, not measured audience and never a predicted success score.
const CLUB_INTEREST={524:10,516:9,523:7,521:6,546:6,548:6,
  66:10,64:10,65:9,57:9,61:8,73:7,86:10,81:10,78:8,
  5:10,4:9,3:7,108:10,98:10,109:10,113:8,100:7};
export function editorialPriority(match,league) {
  return (match._teamIds||[]).reduce((sum,id)=>sum+(CLUB_INTEREST[id]||0),0)+(league==='intl.cl'?3:0);
}
export function selectPriorityFixtures(competitions,now=new Date(),limit=3,hours=24) {
  const start=now.getTime(),end=start+hours*3600000;
  return competitions.filter(c=>c.ok).flatMap(c=>(c.matches||[]).filter(m=>
    !m.score&&['TIMED','SCHEDULED'].includes(m._status)&&Date.parse(m._kickoffUtc)>start&&Date.parse(m._kickoffUtc)<=end)
    .map(match=>({league:c.league,match,priority:editorialPriority(match,c.league)})))
    .sort((a,b)=>b.priority-a.priority||a.match._kickoffUtc.localeCompare(b.match._kickoffUtc)||a.match._sourceId-b.match._sourceId)
    .slice(0,limit);
}
