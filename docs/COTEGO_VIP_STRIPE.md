# COTEGO Plus — plan d'abonnement sécurisé (pas de vente live)

État du compte Stripe connecté le 11 novembre 2026 : uniquement **sandbox** accessible depuis ChatGPT. Produit existant `COTEGO Plus`, prix de test existant `990 EUR cents / mois`. Aucun compte live contrôlé ici ; ne pas activer d'encaissement réel.

## Architecture minimale Cloudflare gratuite
- Cloudflare Workers : routes `/api/me`, `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/webhook`, `/api/premium/*`.
- Cloudflare D1 (free tier dans ses limites) : tables users, sessions, stripe_customers, subscriptions, processed_events, premium_entitlements, audit.
- Authentification : sessions aléatoires, longues et opaques dans cookies HttpOnly / Secure / SameSite, ou fournisseur compatible; rotation, expiration, anti-CSRF.
- Stripe Checkout : souscription flat-rate 9,90 €/mois (prix à confirmer TVA comprise ou hors TVA), `mode=subscription`, session créée **seulement après authentification** et côté serveur.
- Webhook : vérification cryptographique `Stripe-Signature` avec le corps brut et `STRIPE_WEBHOOK_SECRET`, idempotence sur l'identifiant événement, gestion de l'ordre des événements, état d'accès fiable.
- Événements minimum : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
- Customer Portal : accessible depuis un compte authentifié, association explicite au customer Stripe de cet utilisateur, résiliation/paiement.
- Entitlements **vérifiés serveur** à chaque demande premium ; aucun paywall CSS ou JSON complet renvoyé aux visiteurs gratuits.
- Secrets : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` et gestion du D1 via bindings Cloudflare. Ne jamais enregistrer de secrets dans GitHub ni navigateur.
- Préparer tests d'abonnements : création, reconduction, paiement refusé, litige, résiliation fin de période, remboursement, accès rétrogradé, doublons de webhooks.

## Inconnues qui bloquent la mise en production
- Personne/société facturante, régime TVA et CGV françaises.
- Vérification juridique de la commercialisation d'analyses statistiques associées aux paris sportifs, et de la compatibilité avec les restrictions Stripe.
- Consentement et respect du RGPD.
- Validation du droit d'utilisation commerciale des données.
- Procédures de support, facturation, contestation et droit de rétractation.
- Pour iOS/Android natif, règles Apple In-App Purchase et Google Play Billing pour le contenu numérique ; ne pas présumer que Stripe Checkout peut contourner ces obligations.

## Sources officielles
- https://docs.stripe.com/billing/subscriptions/build-subscriptions
- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/customer-management
- https://developers.cloudflare.com/d1/
- https://developer.apple.com/app-store/review/guidelines/
- https://support.google.com/googleplay/android-developer/answer/9858738
- https://stripe.com/legal/restricted-businesses

**Statut** : spécification seulement ; aucun serveur d'auth, aucun webhook, aucun abonnement commercial activé.
