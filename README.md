# COTEGO — Statistiques sportives

Application web expérimentale d'analyse statistique pour le football, le tennis et le basket.

## Site public

- Domaine principal : https://cotego.fr (hébergé séparément sur Cloudflare Workers)
- Code source de la version de référence : `index.html` de ce dépôt
- Nom historique du dépôt : `sport-edge` ; la marque de l'application est **COTEGO**
- GitHub est connecté à Cloudflare Workers Builds sur la branche `main`. Les commits déclenchent une construction et `npx wrangler versions upload` prépare une version, **sans promotion automatique vers les 100 % du trafic**. La publication est validée séparément.

## Fonctionnalités actuellement développées

- Calendriers et résultats football depuis des archives ouvertes, avec vérification nécessaire de leur fraîcheur
- Modèle exploratoire de probabilité 1/N/2, buts totaux et mi-temps ; estimateur de buteurs paramétrable
- Trois scénarios théoriques autour de cotes 1,50 / 2,00 / 3,00 (ne sont pas des cotations de bookmakers réelles)
- Calculateurs expérimentaux tennis et basket
- Parcours **Stripe Test** COTEGO Plus à 9,90 €/mois : sans encaissement réel, sans déblocage automatique des fonctionnalités

## État de commercialisation

**BÊTA GRATUITE — NE PAS VENDRE D'ABONNEMENT RÉEL.** Les données sportives, la calibration du modèle, le backend de gestion des utilisateurs, les webhooks Stripe, la TVA et la conformité doivent être validés avant ouverture à la vente.

## Sécurité

Ne pas placer de clés Stripe secrètes, secrets webhook, jetons Cloudflare ni mots de passe dans le dépôt public. Voir [SECURITY.md](SECURITY.md).

## Déploiement

Le domaine est exploité via Cloudflare Workers. Le code enregistré ici est une sauvegarde de source et ne déclenche pas de mise à jour de `cotego.fr` à lui seul. Le dossier `public/` contient le site statique, le manifeste PWA, le service worker et le module de scores. La racine `index.html` est maintenue identique à `public/index.html` pour référence. Certaines ressources complémentaires peuvent encore nécessiter une vérification.

## Scores récents : expérimentation du 11 novembre 2026

- `public/live-scores.js` lit le flux ouvert SportScore et affiche jusqu'à huit matchs récents ou en direct sur le tableau de bord. Une consultation est tentée toutes les deux minutes **uniquement quand l'application est visible**. Cette fréquence n'est ni une garantie de données disponibles ni une indication de l'heure de mise à jour fournisseur.
- Source et conditions d'attribution : https://sportscore.com/developers/terms/ . Le crédit visible « Powered by SportScore » est conservé dans la section.
- Lien vers Flashscore pour comparaison manuelle uniquement. Aucun scraping de Flashscore n'est réalisé.
- **Séparation impérative** : les scores SportScore de ce module ne sont pas encore injectés dans les archives utilisées par les probabilités. Avant ce raccordement : vérifier IDs d'équipes, compétitions, dates, scores finaux, doublons, droits d'usage, fraîcheur et tests sur données historiques.
- Le site public ne doit pas être considéré comme mis à jour tant que la version correspondante n'est pas explicitement promue dans Cloudflare.

## Prochaines étapes

1. Sauvegarder l'ensemble des actifs et créer une chaîne de déploiement réversible.
2. Améliorer les sources de données et contrôler la date du dernier match par championnat.
3. Tester les probabilités sur données hors échantillon.
4. Ajouter authentification, contrôle d'accès premium côté serveur, gestion des droits par événements Stripe vérifiés.
5. Tests de facturation en sandbox, puis activation commerciale seulement après validations juridiques et fiscales.
