# Intégration de scores récents COTEGO — préparation (non déployée)

Objectif : remplacer les archives OpenFootball trop anciennes par des scores finaux et calendriers vérifiés, sans changer la version publique lors des tests.

1. **Source des probabilités** : football-data.org v4 sur les championnats couverts gratuitement (FL1, PL, PD, SA, BL1). Le plan à 0 € fournit des scores **différés**, pas de live garanti. Clé d'API nécessaire, conservée dans un **secret Cloudflare Worker** : jamais dans un fichier `public/`, dans GitHub ou un message ChatGPT.
2. **Affichage du direct** : conserver SportScore en panneau consultatif, avec attribution visible. Ne jamais fusionner ses scores en cours avec des matchs terminés ni afficher l'heure de requête comme heure de dernière modification du score.
3. **Proxy/cache** : ajouter ultérieurement une route serveur `/api/league/<code>` qui consomme football-data.org avec le secret et met en cache quelques minutes. Sans clé, répondre avec une erreur contrôlée, pas des données inventées. Respecter 10 requêtes/minute en version gratuite, partager le cache entre visiteurs, limiter les accès abusifs.
4. **Format** : le module `src/football-data-adapter.mjs` transforme la réponse de la v4 au format OpenFootball pris en charge par `decodeDataset()`. Il refuse les scores en cours, les scores impossibles, les matchs annulés et dédoublonne par ID fournisseur.
5. **Sécurité de déploiement** : branche isolée ; ne modifier `wrangler.jsonc` ou la production qu'après validation de la source, du secret serveur, des tests, de l'API et du retour arrière. Les ressources statiques actuelles ne sont pas affectées.
6. **Licences** : crédit « Data provided by football-data.org » visible si les données sont utilisées. Vérifier les conditions pour une future activité commerciale et obtenir les autorisations nécessaires pour logos et visuels de clubs.

Tests locaux : `node --test src/football-data-adapter.test.mjs`.

**Statut** : code de normalisation préparé, non branché à une API authentifiée, non testé avec des données réelles, aucun changement en production.
