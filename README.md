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


## Preview : journal avant match et cotes ciblées (15 novembre 2026)

- Le build `src/build-preview.mjs` conserve le secret football puis prépare une base dédiée `cotego-preview-audit`. La liaison D1 doit figurer sous `previews.d1_databases` ; la production ne reçoit pas cette liaison.
- Les prévisions des affiches prioritaires sont créées côté serveur avant le coup d'envoi. La première version est conservée (`INSERT OR IGNORE` et protection SQL contre les modifications). Le même modèle est vérifié contre le calcul du navigateur. Les fiches réutilisent la prévision enregistrée lorsqu'elle existe.
- `/api/predictions?league=fr.1` présente les dernières prévisions enregistrées, leurs dates, les résultats définitifs vérifiés, les taux par cible et les probabilités moyennes annoncées. Les simulations rétrospectives restent séparées. Les annulations, reports ou identités contradictoires ne deviennent pas artificiellement des réussites.
- Le journal s'alimente à la consultation des flux ; aucune tâche serveur permanente n'est annoncée. Les prévisions anciennes ne sont jamais remplies après coup.
- Le flux de cotes utilise uniquement **The Odds API**, avec la clé facultative `ODDS_API_KEY` stockée comme secret de build Cloudflare. Le build la raccorde à la Preview sans l'écrire dans les sources ou les logs. Aucun compte bookmaker n'est requis.
- Les relevés concernent les trois affiches éditoriales prioritaires du jour, dans les 90 minutes précédant le coup d'envoi. Il s'agit de critères d'intérêt sportif, pas de chiffres d'audience mesurés.
- Plafonds applicatifs : 450 crédits réservés au maximum sur 31 jours glissants, 15 par jour, trois rencontres par jour et une demande payante par rencontre. La réserve fournisseur de 50 crédits est protégée lorsqu'un quota fiable est communiqué. Une erreur ou un timeout conserve sa réservation, car le fournisseur peut avoir débité l'appel.
- Les visiteurs partagent les relevés enregistrés. Les moyennes n'incluent que des prix réellement reçus de Betclic France, Unibet France et Winamax France pour le même marché/ligne, suffisamment récents lors du relevé. Les marchés absents restent indisponibles ; aucune cote n'est inventée ou dérivée d'un marché voisin. Les horodatages sont affichés.
- L'offre gratuite/premium reste une règle commerciale préparée : cible 1,50 gratuite, trois cibles avec Plus. La bêta reste gratuite et n'active ni facturation réelle ni prétendu verrouillage de sécurité côté navigateur.
