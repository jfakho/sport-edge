# COTEGO — Statistiques sportives

Application web expérimentale d'analyse statistique pour le football, le tennis et le basket.

## Site public

- Domaine principal : https://cotego.fr (hébergé séparément sur Cloudflare Workers)
- Code source de la version de référence : `index.html` de ce dépôt
- Nom historique du dépôt : `sport-edge` ; la marque de l'application est **COTEGO**
- L'application hébergée chez Cloudflare n'est **pas automatiquement déployée** depuis ce dépôt actuellement.

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

Le domaine est exploité via Cloudflare Workers. Le code enregistré ici est une sauvegarde de source et ne déclenche pas de mise à jour de `cotego.fr` à lui seul. Les ressources PWA (icônes et service worker) ainsi que les pages de contenu peuvent être récupérées depuis l'archive de livraison COTEGO ; elles ne sont pas encore toutes versionnées ici.

## Prochaines étapes

1. Sauvegarder l'ensemble des actifs et créer une chaîne de déploiement réversible.
2. Améliorer les sources de données et contrôler la date du dernier match par championnat.
3. Tester les probabilités sur données hors échantillon.
4. Ajouter authentification, contrôle d'accès premium côté serveur, gestion des droits par événements Stripe vérifiés.
5. Tests de facturation en sandbox, puis activation commerciale seulement après validations juridiques et fiscales.
