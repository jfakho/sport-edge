# Activer les cotes gratuites sur la preview COTEGO

État vérifié le 24 novembre 2026 : le propriétaire confirme ne pas avoir de clé The Odds API. Aucune cote réelle n’a donc été validée auprès du fournisseur. Les tests de correspondance utilisent des réponses simulées, pas des cotes réellement reçues.

## Élément manquant et activation

1. Sur https://the-odds-api.com/, choisir **Starter / FREE / 500 credits per month**, puis START. Utiliser son adresse e-mail pour recevoir la clé. Ne sélectionner aucun forfait payant. Ne transmettre la clé ni dans le chat ni dans GitHub.
2. Dans Cloudflare, ouvrir **Workers & Pages → cotego → Previews → feature/cotego-premium-ux**, puis les variables et secrets d’exécution de cette preview. Ajouter un **Secret** nommé exactement `ODDS_API_KEY`, dont la valeur est la clé reçue. Enregistrer/déployer uniquement cette preview.
3. Alternative depuis une session Cloudflare authentifiée, avec le Wrangler 4.149.0 du dépôt (la valeur est demandée de manière privée) :

```sh
npx wrangler preview secret put ODDS_API_KEY --name feature/cotego-premium-ux --worker-name cotego
```

Cette commande crée un déploiement de la preview. Ne pas utiliser `wrangler secret put` sans `preview`, ni modifier Production ou les DNS. Modifier la configuration Base ne met pas à jour les previews existantes.

Le code sait aussi restaurer cette valeur depuis un secret de build `ODDS_API_KEY` lors d’un build de cette seule branche. Ce second emplacement est facultatif si le secret d’exécution est déjà présent. La restauration est confirmée par une nouvelle lecture des noms de secrets, sans lire ni afficher leur valeur. Un build non confirmé s’arrête.

L’agent peut publier le code GitHub, mais ne dispose actuellement ni d’une session Cloudflare authentifiée ni d’un jeton Cloudflare local pour enregistrer ce secret lui-même. Aucune carte bancaire ni aucun accès aux comptes bookmakers n’est nécessaire au code.

## Vérification après activation

Preview : https://feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev/

- `/api/status` doit afficher `oddsConfigured: true`. Cela confirme uniquement la présence de la clé, pas sa validité auprès du fournisseur.
- `/api/odds/status` expose la consommation réservée et les limites locales, sans secret.
- Ouvrir l’analyse d’une des trois affiches prioritaires du jour dans les 90 minutes avant le coup d’envoi. Il faut une prévision déjà enregistrée et une correspondance exacte entre les deux fournisseurs.
- Vérifier au moins une cote réellement reçue, son bookmaker, son marché/seuil et son horodatage. Recharger : le relevé enregistré doit être réutilisé sans nouveau crédit.
- Si aucune rencontre n’est éligible à cet instant, ne pas prétendre que les cotes sont validées. Reporter le contrôle à la fenêtre d’une affiche éligible.

## Limites de la gratuité

Offre officielle consultée : 500 crédits par mois, sports et marchés inclus, la plupart des bookmakers, sans historique fournisseur. Betclic FR, Unibet FR et Winamax FR figurent dans le catalogue officiel ; leur présence pour chaque rencontre/marché n’est pas garantie.

COTEGO conserve 50 crédits de réserve et limite ses réservations à 450 sur 31 jours, 15 par jour et trois rencontres par jour. Un relevé est demandé à l’ouverture d’une analyse éligible, pas par une tâche automatique. Une rencontre utilise jusqu’à cinq marchés, soit jusqu’à cinq crédits pour ces trois bookmakers. Les échecs après réservation restent comptés par précaution. Aucune montée en gamme ni recharge automatique n’est implémentée.

Les marchés standard et alternatifs sont interrogés ensemble quand nécessaire. Seul le seuil exact et la bonne équipe sont retenus. Une même cote présente deux fois n’est comptée qu’une fois ; deux prix contradictoires sont exclus. Les cotes manquantes ne sont jamais déduites des probabilités du modèle. Les relevés sont des instantanés avant match, pas un flux de cotes en continu.

Sources :
- https://the-odds-api.com/
- https://the-odds-api.com/liveapi/guides/v4/
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
- https://the-odds-api.com/sports-odds-data/betting-markets.html
- https://developers.cloudflare.com/workers/previews/configuration/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
