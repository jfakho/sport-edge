/**
 * COTEGO — adaptation des rencontres football-data.org v4.
 * Préparatoire : NON branché au site public ou au Worker.
 * API : https://www.football-data.org/documentation/api
 * Aucune clé n'est demandée ici. Utiliser plus tard un secret Cloudflare côté serveur.
 */

export const COMPETITIONS = Object.freeze({
  'fr.1': 'FL1', 'en.1': 'PL', 'es.1': 'PD',
  'de.1': 'BL1', 'it.1': 'SA',
});

const INVALID_STATUS = new Set(['CANCELLED', 'POSTPONED', 'SUSPENDED']);
const FINAL_STATUS = 'FINISHED';

function validGoal(value) {
  return Number.isInteger(value) && value >= 0 && value <= 35;
}

function safeDateTime(utcDate) {
  if (typeof utcDate !== 'string') return null;
  const milliseconds = Date.parse(utcDate);
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  // France-facing UI uses the local Paris kick-off date and time, including DST.
  const pieces = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Paris',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    hourCycle:'h23',
  }).formatToParts(date);
  const p = Object.fromEntries(pieces.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {
    date: p.year+'-'+p.month+'-'+p.day,
    time: p.hour+':'+p.minute,
    timestamp: milliseconds,
  };
}

function safeTeam(team) {
  if (!team || typeof team !== 'object') return null;
  const id = Number(team.id);
  const name = String(team.name || team.shortName || '').trim();
  if (!Number.isSafeInteger(id) || id <= 0 || !name) return null;
  return {id, name};
}

/** Normalize a v4 match for COTEGO's existing decodeDataset() without
 * borrowing an ongoing game's score for future model training. */
export function normalizeFootballDataMatch(match, league, now = new Date()) {
  if (!match || typeof match !== 'object') return null;
  if (!COMPETITIONS[league]) return null;
  const status = String(match.status || '').toUpperCase();
  if (INVALID_STATUS.has(status)) return null;
  const home = safeTeam(match.homeTeam);
  const away = safeTeam(match.awayTeam);
  const time = safeDateTime(match.utcDate);
  const id = Number(match.id);
  if (!home || !away || !time || !Number.isSafeInteger(id) || id <= 0) return null;
  if (home.id === away.id) return null;
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a valid Date');
  const finished = status === FINAL_STATUS && time.timestamp <= nowMs;
  const ft = match.score?.fullTime;
  // A live/paused match is NEVER considered finished for COTEGO's model.
  const hasScore = finished && validGoal(ft?.home) && validGoal(ft?.away);
  if (finished && !hasScore) return null;
  const ht = match.score?.halfTime;
  const validHt = hasScore && validGoal(ht?.home) && validGoal(ht?.away)
    && ht.home <= ft.home && ht.away <= ft.away;
  return {
    date: time.date,
    time: time.time,
    team1: home.name,
    team2: away.name,
    score: hasScore ? {ft:[ft.home, ft.away], ...(validHt ? {ht:[ht.home,ht.away]} : {})} : null,
    _source: 'football-data.org',
    _sourceId: id,
    _kickoffUtc: new Date(time.timestamp).toISOString(),
    _teamIds: [home.id,away.id],
    _status: status,
  };
}

/** Deduplicate within one competition, sort oldest to newest. */
export function normalizeFootballDataSeason(payload, league, now = new Date()) {
  if (!payload || !Array.isArray(payload.matches)) throw new Error('Invalid football-data.org match list');
  if (!COMPETITIONS[league]) throw new Error('Unknown competition');
  const result = new Map();
  for (const match of payload.matches) {
    const normalized = normalizeFootballDataMatch(match,league,now);
    if (!normalized) continue;
    result.set(normalized._sourceId, normalized);
  }
  return [...result.values()].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** Source metadata for the UI, not a guarantee of truth or live status. */
export function footballDataFreshness(matches, now = new Date()) {
  const timestamps = matches.filter(m=>Array.isArray(m.score?.ft))
    .map(m=>m._kickoffUtc ? Date.parse(m._kickoffUtc) : Date.parse(m.date+'T'+(m.time||'00:00')+':00Z'))
    .filter(Number.isFinite);
  const latest = timestamps.length ? Math.max(...timestamps) : null;
  const ageHours = latest === null ? null : Math.max(0,(now.getTime()-latest)/3600000);
  return {
    latestFinishedAt: latest === null ? null : new Date(latest).toISOString(),
    hoursSinceLatestFinished: ageHours === null ? null : Math.round(ageHours),
    needsReview: ageHours === null || ageHours > 7*24,
    message: latest === null ? 'Aucun résultat final reçu'
      : ageHours > 7*24 ? 'Résultats anciens : analyse à contrôler'
      : 'Dates à recouper avec la source',
  };
}
