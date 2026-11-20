# COTEGO Plus — état du socle de test (novembre 2026)

## Déjà développé
- Routes dédiées aux comptes, aux sessions et à leur déconnexion.
- Mot de passe de test dérivé par PBKDF2, cookie Secure et HttpOnly, contrôle d'origine sur les écritures.
- Paiement Stripe hébergé en mode abonnement (Stripe Test seulement).
- Portail de gestion Stripe Test et réception d'événements signés.
- Déduplication des événements, état d'abonnement dans une base D1, statut de formule renvoyé par l'API.
- Petit panneau de test dans la page « COTEGO Plus », visible uniquement sur la prévisualisation Cloudflare.
- Toutes les routes de test refusent le domaine public cotego.fr. Aucun encaissement réel n'est possible avec ce code.

## Non encore fonctionnel de bout en bout
- La base Cloudflare D1 n'a pas encore été créée/associée dans le compte : appliquer db/cotego-test.sql sur une base de TEST et associer le binding COTEGO_DB à la Preview.
- Les secrets STRIPE_TEST_SECRET_KEY et STRIPE_TEST_WEBHOOK_SECRET ne sont pas installés dans la Preview ; STRIPE_TEST_PRICE_ID doit référencer le tarif Test à 9,90 EUR TTC/mois.
- L'endpoint webhook Stripe Test doit être déclaré côté Stripe : chemin /api/billing/webhook de la Preview et événements checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted.
- La protection réelle du contenu Plus (server-side paywall) n'est pas développée : les calculs avancés demeurent publics dans le navigateur.
- Absence de vérification d'adresse e-mail, réinitialisation des mots de passe, limitation globale anti-abus, gestion avancée des retries et événements Stripe de facture ; à compléter avant commercialisation.
- Les validations réglementaires, droits des données, RGPD, CGV, TVA et identité du bénéficiaire de paiement restent nécessaires.
- Ne pas activer de clé Stripe Live, ne pas utiliser de vraies cartes bancaires pour les tests.

## Procédure unique de configuration à effectuer ensuite
1. Cloudflare > D1 : créer une base de données dédiée aux essais sur le plan gratuit.
2. Exécuter le script SQL db/cotego-test.sql dans la console de cette base.
3. Dans Workers > cotego > Preview feature-cotego-premium-ux : créer un binding D1 nommé COTEGO_DB et pointer vers la base de test. Vérifier que la configuration Preview persiste au prochain build.
4. Déclarer STRIPE_TEST_PRICE_ID (la référence Test existante), puis les deux secrets Stripe Test. Ne jamais les transmettre par chat, mettre dans GitHub ou copier dans des variables publiques.
5. Créer le webhook dans le Stripe Dashboard en mode test et copier la clé de signature directement vers Cloudflare.
6. Exécuter les tests de bout en bout sur iPhone : création compte test, authentification, Checkout avec carte de test, webhook actif, statut Plus, portail de résiliation, paiement refusé, absence d'accès premium sans souscription.
7. Désactiver les versions de test à la fin des essais et passer une revue de sécurité avant tout lancement commercial.

## Principes de sécurité
- Une validation automatique GitHub/Cloudflare ne remplace pas les essais réels du parcours Stripe.
- Les événements webhook sont contrôlés cryptographiquement, mais les événements Stripe de facturation devront être complétés (invoice.paid, invoice.payment_failed, périodes d'essai, litiges, ordre des événements) pour une exploitation réelle.
- Les abonnements sont par défaut désactivés si les paramètres ne sont pas configurés.
- Les secrets doivent être séparés entre Production et Previews Base/Preview.
