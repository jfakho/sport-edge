/** COTEGO: deterministic audit of football predictions. No bookmaker odds or profit claims. */
const MARKETS = new Set(['home','draw','away','over_2_5','under_2_5','btts_yes','btts_no']);
const isNumber = n => typeof n === 'number' && Number.isFinite(n);
const isoMs = value => typeof value === 'string' ? Date.parse(value) : NaN;

/** Persist the returned record BEFORE kickoff in durable server storage.
 * Do not modify records after creation: use append-only storage and an audit timestamp. */
export function createPredictionRecord(input, now = new Date()) {
  const {source,sourceMatchId,sport,competition,kickoffUtc,market,probability,modelVersion} = input || {};
  const createdAt = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : '';
  const kickoff = isoMs(kickoffUtc);
  if (!source || !sourceMatchId || !sport || !competition || !modelVersion ||
      !MARKETS.has(market) || !isNumber(probability) || probability < 0 || probability > 1 ||
      !Number.isFinite(kickoff) || !Number.isFinite(isoMs(createdAt)) || isoMs(createdAt) >= kickoff)
    throw new Error('Prévision invalide ou créée après le coup d’envoi');
  return Object.freeze({
    id:[source,sourceMatchId,market,modelVersion].map(encodeURIComponent).join(':'),
    source:String(source),sourceMatchId:String(sourceMatchId),sport:String(sport),
    competition:String(competition),kickoffUtc:new Date(kickoff).toISOString(),
    market,probability,modelVersion:String(modelVersion),createdAt,
  });
}

export function settleFootballPrediction(prediction, result) {
  if (!prediction || !result || result.status !== 'FINISHED') return {status:'pending'};
  const {home,away} = result;
  if (![home,away].every(n=>Number.isInteger(n)&&n>=0&&n<=35)) return {status:'unverifiable'};
  const finishedAt = isoMs(result.finishedAt);
  if (!Number.isFinite(finishedAt) || !Number.isFinite(isoMs(prediction.kickoffUtc)) ||
      !Number.isFinite(isoMs(prediction.createdAt)) || finishedAt < isoMs(prediction.kickoffUtc) ||
      isoMs(prediction.createdAt) >= isoMs(prediction.kickoffUtc)) return {status:'unverifiable'};
  // A final score is not independently auditable without both provider identifiers.
  // Never include an anonymous result in the published prediction hit rate.
  if (!result.source || result.sourceMatchId == null ||
      String(result.source) !== prediction.source ||
      String(result.sourceMatchId) !== prediction.sourceMatchId)
    return {status:'unverifiable'};
  const outcomes = {
    home:home>away,draw:home===away,away:home<away,
    over_2_5:home+away>2.5,under_2_5:home+away<2.5,
    btts_yes:home>0&&away>0,btts_no:home===0||away===0,
  };
  if (!Object.hasOwn(outcomes,prediction.market) || !isNumber(prediction.probability))
    return {status:'unverifiable'};
  return {status:'settled',hit:outcomes[prediction.market],actualScore:[home,away],
    brierScore:(prediction.probability-Number(outcomes[prediction.market]))**2};
}

/** Each fixture is counted once per selected market and model version.
 * Exclude pending and unverifiable outcomes from denominator. */
export function summarizePredictions(records) {
  const unique=new Map();
  for (const entry of records||[]) {
    if (!entry?.prediction?.id) continue;
    if (!unique.has(entry.prediction.id)) unique.set(entry.prediction.id,entry);
  }
  const values=[...unique.values()];
  // A malformed or fabricated evaluation must never inflate public hit rates.
  // Only well-formed, pre-kickoff records with an explicit binary outcome count.
  const settled=values.filter(x=>{
    const p=x.prediction, e=x.evaluation;
    return e?.status==='settled' && typeof e.hit==='boolean'
      && isNumber(e.brierScore) && e.brierScore>=0 && e.brierScore<=1
      && isNumber(p.probability) && p.probability>=0 && p.probability<=1
      && Number.isFinite(isoMs(p.createdAt)) && Number.isFinite(isoMs(p.kickoffUtc))
      && isoMs(p.createdAt)<isoMs(p.kickoffUtc)
      && Array.isArray(e.actualScore) && e.actualScore.length===2
      && e.actualScore.every(n=>Number.isInteger(n)&&n>=0&&n<=35)
      // Recalculate the market outcome from the recorded final score; never trust
      // a stored hit flag by itself when publishing performance statistics.
      && MARKETS.has(p.market)
      && (() => {
        const [home,away]=e.actualScore;
        const outcomes={
          home:home>away,draw:home===away,away:home<away,
          over_2_5:home+away>2.5,under_2_5:home+away<2.5,
          btts_yes:home>0&&away>0,btts_no:home===0||away===0,
        };
        return e.hit===outcomes[p.market];
      })()
      && Math.abs(e.brierScore-(p.probability-Number(e.hit))**2)<1e-10;
  });
  const hits=settled.filter(x=>x.evaluation.hit).length;
  const avgBrier=settled.length
    ? settled.reduce((sum,x)=>sum+x.evaluation.brierScore,0)/settled.length : null;
  return {total:values.length,evaluated:settled.length,pending:values.filter(x=>x.evaluation?.status==='pending').length,
    unverifiable:values.filter(x=>x.evaluation?.status==='unverifiable').length,
    hits,hitRate:settled.length?hits/settled.length:null,averageBrierScore:avgBrier};
}
