/* COTEGO: UI for the durable journal and quota-limited real odds. No credentials. */
(() => {
'use strict';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=s=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const percentage=p=>Number.isFinite(p)?(100*p).toFixed(1)+' %':'—';
const histories=new Map();
let selectedLeague='fr.1',requestNumber=0,activeModal=0;
async function json(url){const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw Error('Unavailable');return res.json();}
function renderJournal(data,league){
  const host=$('#journal-content');if(!host)return;
  const count=$('#rail-recorded-count'),status=$('#rail-journal-status');
  if(!data.configured){
    if(count)count.textContent='—';if(status)status.textContent='Journal des prévisions en cours d’activation.';
    host.innerHTML='<section class="journal-intro"><h2>Prévisions enregistrées avant match</h2><p>Le journal durable est en cours d’activation. Aucun bilan de prévisions réellement publiées n’est encore disponible. Les simulations rétrospectives sont accessibles séparément ci-dessous.</p></section>';return;
  }
  if(count)count.textContent=String(data.records.length);
  if(status)status.textContent=data.records.length?'Prévisions horodatées avant le coup d’envoi.':'Le journal est actif. Les premières prévisions apparaîtront avec les prochaines affiches.';
  const stats=(data.summary||[]).map(t=>`<div class="history-stat"><small>CIBLE ${t.target.toFixed(2)} · ENREGISTRÉE</small><strong>${percentage(t.hitRate)}</strong><p>${t.hits} réussites / ${t.evaluated} scénarios évalués · ${t.pending} non évalués</p><p>Probabilité moyenne annoncée : ${percentage(t.meanProbability)}</p></div>`).join('');
  const scenario=(r,target)=>{const t=r.tiers.find(t=>t.target===target);if(!t)return '<span class="journal-pick journal-pick-locked">Plus</span>';return `<span class="journal-pick"><span class="journal-pick-name">${escape(t.market.name)}</span><span class="journal-pick-prob">${percentage(t.market.p)}</span><span class="journal-result ${t.hit===true?'hit':t.hit===false?'miss':''}">${t.hit===true?'✓':t.hit===false?'✕':'—'}</span></span>`;};
  const recordCard=r=>`<article class="journal-record"><div class="journal-record-head"><div><strong class="journal-teams">${escape(r.home)} <span>–</span> ${escape(r.away)}</strong><span class="journal-kickoff">${time(r.kickoffUtc)}</span></div><span class="journal-match-status ${r.finalScore?'journal-match-finished':''}">${r.finalScore?'Terminé · '+r.finalScore.join('–'):'À venir'}</span></div><div class="journal-picks">${[1.5,2,3].map(target=>`<div class="journal-pick-row"><span class="journal-pick-target">Cible ${target.toFixed(2).replace('.',',')}</span>${scenario(r,target)}</div>`).join('')}</div><div class="journal-record-footer"><span>Archivée le ${time(r.createdAt)}</span><button class="journal-detail-link" type="button" data-journal-detail="${r.matchId}" data-journal-league="${escape(league)}">Voir l’analyse ›</button></div></article>`;
  host.innerHTML=`<section class="journal-intro"><span class="journal-tag">PRÉVISIONS AVANT MATCH</span><h2>Le bilan de nos scénarios enregistrés</h2><p>Chaque prévision est enregistrée avant le coup d’envoi. Le taux de réussite porte uniquement sur les résultats finaux vérifiés. ${escape(data.coverage||'')}</p></section><div class="history-summary">${stats}</div>${data.records.length?`<section class="history-log journal-log"><div class="journal-log-heading"><h3>Les dernières prévisions</h3><span>${data.records.length} rencontre${data.records.length>1?'s':''}</span></div><p>— En attente · ✓ Réussi · ✕ Non réalisé. Les probabilités sont des estimations, pas des cotes.</p><div class="journal-records">${data.records.map(recordCard).join('')}</div></section>`:'<section class="history-log"><h3>Le suivi commence maintenant.</h3><p>Les anciens matchs ne seront pas remplis après coup. Les prochaines affiches enregistrées constitueront notre premier échantillon de validation.</p></section>'}`;
}
async function loadJournal(league=selectedLeague,force=false){
  league=league==='de-live'?'de.1':league;selectedLeague=league;
  document.querySelectorAll('[data-competition]').forEach(b=>b.classList.toggle('selected',(b.dataset.competition==='de-live'?'de.1':b.dataset.competition)===league));
  if(['demo','custom'].includes(league)){
    $('#journal-content').innerHTML='<section class="journal-intro"><h2>Données locales ou de démonstration</h2><p>Ces simulations ne sont pas enregistrées dans le bilan public des prévisions réelles.</p></section>';
    if(league==='demo')$('.retrospective-section').open=true;return;
  }
  const cached=histories.get(league);if(cached&&!force&&Date.now()-cached.at<30000){renderJournal(cached.data,league);return;}
  const request=++requestNumber;
  try {const data=await json('/api/predictions?league='+encodeURIComponent(league));if(request!==requestNumber)return;
    histories.set(league,{at:Date.now(),data});renderJournal(data,league);
  }catch{if(request===requestNumber){$('#rail-journal-status').textContent='Journal momentanément indisponible.';$('#journal-content').innerHTML='<section class="journal-intro"><h2>Journal momentanément indisponible</h2><p>Les prévisions conservées ne sont pas remplacées par des simulations. Réessayez ultérieurement.</p></section>';}}
}
window.addEventListener('cotego:competition',e=>loadJournal(e.detail.league));
document.addEventListener('click',e=>{
  const detail=e.target.closest('[data-journal-detail]');
  if(detail){const record=histories.get(detail.dataset.journalLeague)?.data.records.find(r=>r.matchId===Number(detail.dataset.journalDetail));if(record)window.dispatchEvent(new CustomEvent('cotego:archived-analysis',{detail:record}));}
  const nav=e.target.closest('[data-page="history"],[data-link="history"]');if(nav)loadJournal($('#history-league-select')?.value||selectedLeague,true);
});
$('#history-league-select')?.addEventListener('change',e=>loadJournal(e.target.value,true));
window.addEventListener('cotego:analysis',async e=>{
  const {match,league,recordedAt}=e.detail,number=++activeModal;
  if(!match.sourceId||['demo','custom'].includes(league))return;
  let data;
  try{data=await json('/api/odds/'+encodeURIComponent(league==='de-live'?'de.1':league)+'/'+match.sourceId);}catch{data={status:'unavailable'};}
  if(number!==activeModal||$('#analysis-modal').classList.contains('hidden'))return;
  const panel=document.createElement('section');panel.className='odds-import';panel.id='odds-import';
  const quotes=data.scenarios||[];
  panel.innerHTML='<h3>Cotes relevées chez les bookmakers</h3>'+(quotes.some(q=>q.average!==null)?quotes.map(q=>`<div class="book-quote"><strong>${escape(q.name)}</strong> · ${q.average===null?'Aucune cote comparable disponible':`moyenne ${q.average.toFixed(2)} sur ${q.books.length} bookmaker(s)`}${q.books.map(b=>`<br>${escape(b.bookmaker)} : ${b.price.toFixed(2)} · relevé ${time(b.updatedAt)}`).join('')}</div>`).join('')+'<p>La moyenne est un indicateur de comparaison. Chaque bookmaker propose sa propre cote, susceptible d’évoluer.</p>':`<p>${({not_configured:'Le raccordement aux cotes réelles est en préparation.',storage_unavailable:'Les relevés de cotes sont momentanément indisponibles.',not_selected:'Le quota gratuit est réservé aux trois affiches prioritaires de la journée.',too_early:'Le relevé sera disponible à l’approche du coup d’envoi pour les affiches prioritaires.',budget_exhausted:'Le budget de crédits est préservé ; aucun nouveau relevé n’est demandé.',no_match:'Aucune correspondance de rencontre suffisamment sûre n’a été trouvée.',unavailable:'Les cotes sont momentanément indisponibles.',pending:'Le relevé est en cours de préparation.'})[data.status]||'Aucune cote comparable disponible pour ces scénarios.'}</p>`);
  if(recordedAt)panel.innerHTML+=`<small>Prévision statistique enregistrée le ${time(recordedAt)}, avant le coup d’envoi.</small>`;
  $('#modal-content').prepend(panel);
});
json('/api/status').then(status=>{if($('#rail-odds-status'))$('#rail-odds-status').textContent=status.oddsConfigured?'Flux connecté · relevés ciblés à l’approche des matchs.':'Connexion au fournisseur en préparation.';}).catch(()=>{$('#rail-odds-status').textContent='État du flux momentanément indisponible.';});
loadJournal();
})();
