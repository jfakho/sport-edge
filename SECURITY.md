# COTEGO — sécurité du projet

Ce dépôt est sous le contrôle du titulaire du compte GitHub `jfakho`.

- Ne jamais committer de clé secrète Stripe, de jeton Cloudflare ou de mot de passe.
- Ne jamais débloquer l'accès Plus sur la seule base d'une redirection de paiement côté navigateur : les événements Stripe doivent être vérifiés par un backend sécurisé.
- Les analyses et probabilités restent expérimentales jusqu'à validation sur données récentes et indépendantes.
- Ne pas présenter les cotes théoriques comme des cotes de bookmakers réelles ou garantir un gain.
- La version test du paiement ne permet pas l'encaissement d'argent réel.
