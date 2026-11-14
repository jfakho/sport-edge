# COTEGO mobile — stratégie à budget initial nul

## Étape 1 — PWA gratuite
La bêta COTEGO peut être installée depuis Safari/Chrome via l'écran d'accueil, avec le même code et le même domaine. Sur la branche de refonte, le manifeste est relié dans `<head>`, le service worker est enregistré et la page « Installer l'application » explique la procédure.

Reste à faire : images PNG 192 et 512 px, écran d'accueil iOS spécifique, tests des mises à jour du service worker, contrôles en environnement réel et notifications seulement si consentement et infrastructure appropriés.

## Étape 2 — publication Android
Le compte Google Play Console demande **25 USD une fois** et peut exiger des tests préalables pour les nouveaux comptes personnels. Préparer AAB (TWA / Capacitor selon capacités), page confidentialité, fiche application, tests, captures, accès de démonstration. Les achats de fonctionnalités numériques via Google Play peuvent relever de Play Billing.

## Étape 3 — publication iOS
L'Apple Developer Program coûte généralement **99 USD par an** (devise locale possible). Préparer une véritable app iOS fiable, pas seulement un navigateur enveloppé, captures/metadata, connexion test pour l'équipe de validation, confidentialité, règles de paiement in-app pour les abonnements numériques et conditions d'affichage de liens externes selon marché.

## Produits à ne pas confondre
- Ajouter à l'écran d'accueil = PWA, pas publication sur l'App Store ou Play Store.
- Un paiement Stripe sur le site n'autorise pas automatiquement le même flux d'achat dans les apps natives.
- « 0 € au lancement » et « disponibilité immédiate sur les deux stores » sont incompatibles sans financement des frais d'inscription et des éventuels développements supplémentaires.

Références :
https://developer.chrome.com/docs/modern-web-guidance/guides/pwa/install-web-app
https://developer.apple.com/programs/
https://support.google.com/googleplay/android-developer/answer/6112435
