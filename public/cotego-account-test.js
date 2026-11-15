/* Preview accounts and Stripe test controls. No live checkout, no keys in the browser. */
(() => {
'use strict';
if(location.hostname!=='feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev')return;
const host=document.querySelector('#page-membership');if(!host)return;
const panel=document.createElement('section');panel.className='cotego-test-account';
panel.innerHTML=`<div class="account-heading"><h2>Mon compte de test</h2><span>PREVIEW</span></div>
<p class="account-caption">Tests uniquement. Utilisez un mot de passe réservé à cette Preview.</p>
<p id="cotego-test-status" role="status" aria-live="polite">Vérification…</p>
<div id="cotego-account-guest"><div class="account-tabs" role="group" aria-label="Connexion ou création de compte"><button type="button" data-account-mode="login" aria-pressed="true">Connexion</button><button type="button" data-account-mode="signup" aria-pressed="false">Créer un compte</button></div>
<form id="cotego-account-form"><label>E-mail<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Mot de passe <small>12 caractères minimum à la création</small><input name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label><button type="submit" class="btn btn-primary">Se connecter</button></form></div>
<div id="cotego-account-member" hidden><p id="cotego-account-plan"></p><div class="cotego-test-actions"><button type="button" id="cotego-test-checkout" class="btn btn-primary">Essayer Plus — TEST</button><button type="button" id="cotego-test-portal" class="btn btn-outline">Gérer le test</button><button type="button" id="cotego-test-logout" class="btn btn-outline">Déconnexion</button></div><p id="cotego-stripe-status" class="account-caption"></p></div>`;
host.appendChild(panel);
const $=s=>panel.querySelector(s),say=t=>$('#cotego-test-status').textContent=t;
let mode='login',configuration=null;
const translations={'Invalid email or password':'Vérifiez l’e-mail et le mot de passe (12 caractères minimum).','Invalid credentials':'E-mail ou mot de passe incorrect.','Too many attempts':'Trop de tentatives. Réessayez plus tard.','Unable to create account':'Ce compte ne peut pas être créé. Essayez de vous connecter.','Authentication not configured':'Les comptes sont momentanément indisponibles.'};
async function api(path,method='GET',data){const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:data?{'content-type':'application/json'}:{},body:data?JSON.stringify(data):undefined});let body;try{body=await response.json();}catch{throw Error('Réponse momentanément indisponible.');}if(!response.ok){const e=Error(translations[body.error]||'Service momentanément indisponible.');e.status=response.status;throw e;}return body;}
async function refresh(){
 configuration=await api('/api/account/config');
 const configured=configuration.accountsConfigured;
 $('#cotego-account-form').querySelector('button').disabled=!configured;
 if(!configured){say('Les comptes de test sont en préparation.');return;}
 let me;try{me=await api('/api/account/me');}catch(e){if(e.status!==401)throw e;}
 $('#cotego-account-guest').hidden=!!me;$('#cotego-account-member').hidden=!me;
 if(!me){say(configuration.accessMode==='freemium'?'Accès gratuit : cible 1,50. Connectez-vous pour retrouver votre formule.':'La bêta reste gratuite, avec les trois cibles accessibles.');return;}
 say('Connecté : '+me.email);
 $('#cotego-account-plan').textContent=me.plan==='plus'?'Formule Plus de test':configuration.accessMode==='freemium'?'Compte gratuit · Cible 1,50':'Compte gratuit · Trois cibles ouvertes pendant la bêta';
 $('#cotego-test-checkout').disabled=!configuration.stripeConfigured;
 $('#cotego-test-portal').disabled=!configuration.stripeConfigured||!me.canManageBilling;
 $('#cotego-stripe-status').textContent=configuration.stripeConfigured?'Paiement fictif uniquement. Aucun débit réel.':'Le paiement de test n’est pas encore raccordé.';
}
for(const button of panel.querySelectorAll('[data-account-mode]'))button.addEventListener('click',()=>{mode=button.dataset.accountMode;for(const b of panel.querySelectorAll('[data-account-mode]'))b.setAttribute('aria-pressed',String(b===button));const form=$('#cotego-account-form');form.querySelector('button').textContent=mode==='signup'?'Créer mon compte de test':'Se connecter';form.elements.password.autocomplete=mode==='signup'?'new-password':'current-password';});
$('#cotego-account-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;try{await api('/api/account/'+mode,'POST',{email:form.elements.email.value,password:form.elements.password.value});form.reset();await refresh();if(configuration.accessMode==='freemium')window.dispatchEvent(new Event('cotego:account-changed'));}catch(error){say(error.message);}finally{button.disabled=!configuration?.accountsConfigured;}});
for(const [id,endpoint] of [['#cotego-test-checkout','/api/billing/checkout'],['#cotego-test-portal','/api/billing/portal']])$(id).addEventListener('click',async()=>{try{const result=await api(endpoint,'POST');if(!/^https:\/\/(checkout|billing)\.stripe\.com\//.test(result.url))throw Error('Lien de paiement non vérifié.');location.assign(result.url);}catch(e){say(e.message);}});
$('#cotego-test-logout').addEventListener('click',async()=>{try{await api('/api/account/logout','POST');await refresh();if(configuration.accessMode==='freemium')window.dispatchEvent(new Event('cotego:account-changed'));}catch(e){say(e.message);}});
refresh().catch(e=>say(e.message));
})();
