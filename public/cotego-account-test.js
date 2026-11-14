/* COTEGO — Preview-only Stripe Test UI. No real payments. */
(() => {
'use strict';
if(!location.hostname.endsWith('-cotego.salama-jimmy.workers.dev'))return;
const host=document.querySelector('#page-membership');if(!host)return;
const panel=document.createElement('section');
panel.className='cotego-test-account';
panel.innerHTML=[
'<h3>Comptes et abonnements — mode test</h3>',
'<p class="caption">Essais techniques uniquement. Aucun paiement réel. Les fonctions Plus ne sont pas encore commercialisées.</p>',
'<p id="cotego-test-status" role="status" aria-live="polite">Vérification de la configuration…</p>',
'<div class="cotego-test-forms">',
'<form id="cotego-test-signup"><strong>Créer un compte de test</strong>',
'<label>E-mail <input name="email" type="email" autocomplete="email" required></label>',
'<label>Mot de passe (minimum 12 caractères) <input name="password" type="password" autocomplete="new-password" minlength="12" required></label>',
'<button type="submit">Créer</button></form>',
'<form id="cotego-test-login"><strong>Connexion</strong>',
'<label>E-mail <input name="email" type="email" autocomplete="email" required></label>',
'<label>Mot de passe <input name="password" type="password" autocomplete="current-password" required></label>',
'<button type="submit">Se connecter</button></form></div>',
'<div class="cotego-test-actions">',
'<button type="button" id="cotego-test-checkout">Essayer Plus — 9,90 €/mois (TEST)</button>',
'<button type="button" id="cotego-test-portal">Gérer le test</button>',
'<button type="button" id="cotego-test-logout">Déconnexion</button>',
'</div>'
].join('');
const css=document.createElement('style');
css.textContent='.cotego-test-account{background:#151c25;color:#f0f0f0;border:1px solid #59606c;border-radius:12px;margin:20px 0;padding:20px}.cotego-test-account h3{font-size:19px;margin:0 0 8px}.cotego-test-account .caption{font-size:13px;color:#bdc5d0}.cotego-test-forms{display:flex;flex-wrap:wrap;gap:18px;margin-top:15px}.cotego-test-forms form{flex:1 1 220px;display:grid;gap:10px}.cotego-test-account label{display:grid;gap:5px;font-size:13px}.cotego-test-account input{min-width:0;width:100%;background:#0c141e;color:#fff;border:1px solid #697480;border-radius:7px;padding:11px}.cotego-test-account button{border:1px solid #74808b;background:#253241;color:#fff;border-radius:7px;padding:11px;cursor:pointer}.cotego-test-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}#cotego-test-status{padding:10px 0;font-size:13px}';
panel.prepend(css);host.appendChild(panel);
const status=panel.querySelector('#cotego-test-status');
const say=text=>status.textContent=text;
async function api(path,method='GET',data){
 const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:data?{'content-type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
 let body;try{body=await response.json();}catch{body={error:'Réponse invalide'};}
 if(!response.ok)throw Error(body.error||'Erreur '+response.status);
 return body;
}
async function refresh(){
 try{const me=await api('/api/account/me');say('Connecté : '+me.email+' | Formule : '+me.plan+' | Abonnement : '+(me.subscriptionStatus||'aucun'));}
 catch(e){say('Compte test non connecté ou configuration D1 absente : '+e.message);}
}
for(const [id,endpoint] of [['#cotego-test-signup','/api/account/signup'],['#cotego-test-login','/api/account/login']]){
 panel.querySelector(id).addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');btn.disabled=true;
  try{const fields=new FormData(form);await api(endpoint,'POST',{email:fields.get('email'),password:fields.get('password')});form.reset();await refresh();}
  catch(err){say('Test indisponible : '+err.message);}
  finally{btn.disabled=false;}
 });
}
for(const [id,endpoint] of [['#cotego-test-checkout','/api/billing/checkout'],['#cotego-test-portal','/api/billing/portal']]){
 panel.querySelector(id).addEventListener('click',async()=>{
  try{const result=await api(endpoint,'POST');if(!/^https:\/\/(checkout|billing)\.stripe\.com\//.test(result.url))throw Error('Lien non vérifié');location.assign(result.url);}
  catch(e){say('Test indisponible : '+e.message);}
 });
}
panel.querySelector('#cotego-test-logout').addEventListener('click',async()=>{
 try{await api('/api/account/logout','POST');await refresh();}catch(e){say('Erreur : '+e.message);}
});
refresh();
})();