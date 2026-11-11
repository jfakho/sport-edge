/* COTEGO — scores récents (flux consultatif distinct du modèle de probabilités).
   Source autorisée : https://sportscore.com/developers/terms/
   Ne pas faire passer l'heure de consultation pour l'heure de mise à jour du fournisseur.
*/
(() => {
  'use strict';
  const ROOT = document.getElementById('cotego-live-panel');
  if (!ROOT) return;
  const status = document.getElementById('cotego-live-status');
  const list = document.getElementById('cotego-live-list');
  const refreshed = document.getElementById('cotego-live-refreshed');
  const button = document.getElementById('cotego-live-refresh');
  const ENDPOINT = 'https://sportscore.com/api/widget/matches/?sport=football&limit=50';
  const INTERVAL = 120000; // Demande toutes les 2 minutes si la page est visible.
  let requestPending = false;
  let lastRequestAt = 0;
  let lastSuccessfulAt = 0;

  const text = value => String(value ?? '').trim();
  const scoreNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  const teamName = value => {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') return text(value.name || value.team_name || value.strTeam);
    return '';
  };
  const classify = value => {
    const v = text(value).toLowerCase();
    if (/^(live|in_progress|playing|1h|2h|ht|et|pen)$/.test(v) || /in.play|half.time|extra.time|progress|live/.test(v)) return 'live';
    if (/^(finished|ft|ended|full_time|completed)$/.test(v) || /final|finished/.test(v)) return 'finished';
    return 'scheduled';
  };
  function normalize(item) {
    if (!item || typeof item !== 'object') return null;
    const home = teamName(item.home || item.home_team);
    const away = teamName(item.away || item.away_team);
    if (!home || !away) return null;
    const rawStatus = item.status || item.status_text || '';
    const state = classify(rawStatus);
    const when = Date.parse(item.time || item.start_time || item.date || '');
    return {
      home, away, state,
      scoreHome: scoreNumber(item.home_score ?? item.score_home),
      scoreAway: scoreNumber(item.away_score ?? item.score_away),
      when: Number.isFinite(when) ? when : 0,
      description: text(item.status_text || item.status || '')
    };
  }
  function displayDate(when) {
    if (!when) return 'Date inconnue';
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone:'Europe/Paris', day:'2-digit', month:'short',
      hour:'2-digit', minute:'2-digit'
    }).format(new Date(when));
  }
  function displayClock(when) {
    return new Intl.DateTimeFormat('fr-FR', {timeZone:'Europe/Paris', hour:'2-digit',minute:'2-digit'}).format(new Date(when));
  }
  function createCell(className, value) {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = value;
    return cell;
  }
  function showMatches(items) {
    const normalized = items.map(normalize).filter(Boolean);
    const priority = {live:0, finished:1, scheduled:2};
    normalized.sort((a,b) => {
      const group = priority[a.state] - priority[b.state];
      if (group) return group;
      return a.state === 'scheduled' ? a.when-b.when : b.when-a.when;
    });
    list.replaceChildren();
    if (!normalized.length) {
      const empty = document.createElement('p');
      empty.className = 'cotego-live-empty';
      empty.textContent = 'Aucune rencontre disponible dans ce flux actuellement. Consultez Flashscore pour une couverture plus large.';
      list.append(empty);
      return 0;
    }
    for (const match of normalized.slice(0, 8)) {
      const row = document.createElement('div');
      row.className = 'cotego-live-row';
      const meta = document.createElement('div');
      meta.className = 'cotego-live-match-meta';
      meta.append(createCell('cotego-live-team', match.home + ' – ' + match.away));
      const stage = match.state === 'live' ? 'EN DIRECT' : match.state === 'finished' ? 'TERMINÉ' : 'À VENIR';
      const stageEl = createCell('cotego-live-stage '+match.state, stage+' · '+displayDate(match.when));
      meta.append(stageEl);
      const result = (match.scoreHome !== null && match.scoreAway !== null)
        ? match.scoreHome + ' – ' + match.scoreAway : '—';
      row.append(meta, createCell('cotego-live-score', result));
      list.append(row);
    }
    return normalized.length;
  }
  async function refresh(force = false) {
    if (requestPending || document.visibilityState === 'hidden') return;
    if (!force && Date.now() - lastRequestAt < INTERVAL) return;
    requestPending = true;
    lastRequestAt = Date.now();
    button.disabled = true;
    status.textContent = 'Vérification des scores…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(ENDPOINT, {signal:controller.signal, cache:'no-store'});
      if (!response.ok) throw new Error('HTTP '+response.status);
      const data = await response.json();
      if (!data || !Array.isArray(data.matches)) throw new Error('Format du flux inattendu');
      const count = showMatches(data.matches);
      lastSuccessfulAt = Date.now();
      status.textContent = count
        ? 'Flux accessible · '+count+' rencontres reçues' : 'Flux accessible · aucune rencontre affichable';
      refreshed.textContent = 'Consulté à '+displayClock(lastSuccessfulAt)+' (Paris) · source mise en cache ~60 s ; couverture variable.';
    } catch (error) {
      status.textContent = 'Flux indisponible · consulter Flashscore';
      refreshed.textContent = lastSuccessfulAt
        ? 'Dernière consultation réussie à '+displayClock(lastSuccessfulAt)+' (Paris) · scores potentiellement périmés.'
        : 'Pas de résultat vérifié disponible. Les archives d’analyse restent distinctes.';
      if (!lastSuccessfulAt) list.textContent = 'Impossible de charger les scores pour le moment.';
    } finally {
      clearTimeout(timeout);
      requestPending = false;
      button.disabled = false;
    }
  }
  button.addEventListener('click', () => refresh(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, INTERVAL);
  refresh(true);
})();