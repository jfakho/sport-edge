# COTEGO — stratégie de données (12 novembre 2026)

## Décision Flashscore
Flashscore est une référence produit et une source de comparaison manuelle, **pas un fournisseur de données automatisées autorisé** pour COTEGO à ce stade. Les conditions Livesport (https://livesport.eu/terms-of-use/en) restreignent l'extraction, le scraping, l'agrégation et la réutilisation commerciale sans consentement explicite. Ne pas intégrer de scraper, endpoints non documentés, proxies ou contournements.

Pour exploiter directement Flashscore, obtenir une autorisation écrite précisant : périmètre (scores, fixtures, statistiques, cotes), fréquence, stockage, rediffusion, attribution, usage commercial et prix. Aucun engagement payant sans validation utilisateur.

## MVP gratuit et robuste
1. Maintenir l'adaptateur football-data.org existant et contrôler les droits/quotas du plan effectivement souscrit.
2. Évaluer OpenLigaDB pour les compétitions couvertes et les droits de réutilisation ; ne pas mélanger des sources sans provenance explicite.
3. Pour chaque match, conserver source, horodatage, statut (réel/démo/indisponible), nombre de rencontres historiques, fraîcheur et couverture.
4. Afficher trois scénarios (cotes cibles 1,50/2,00/3,00), **sans inventer de cote bookmaker**. Afficher « cote réelle indisponible » en l'absence de flux sous licence.
5. Accueil multichampionnats : charger les compétitions indépendamment, dédupliquer par identifiant de source + compétition + match, sélectionner au plus trois matchs provenant de compétitions distinctes quand c'est possible. En cas de source indisponible, afficher un état d'erreur et une action de réessai ; jamais des archives déguisées en rencontres récentes.
6. Tester les cas : zéro match, données périmées, API en échec, fuseau Paris, liens Analyse, trois scénarios, mobile 375 px, PWA iOS/Android.

## Garde-fous
- Pas de mise en production ni de fusion de PR sans validation.
- Pas de Stripe réel, pas de dépenses, pas de publication stores.
- Vérification juridique ANJ avant toute offre payante de conseils de paris.
- Protéger la logique métier côté serveur avant toute promesse de confidentialité du modèle ; un dépôt public et du JS navigateur sont consultables.

## Références
- https://livesport.eu/terms-of-use/en
- https://www.flashscore.com/faq/information/
