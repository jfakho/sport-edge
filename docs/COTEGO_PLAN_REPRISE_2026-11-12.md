# COTEGO — proposition de refonte à valider
Préparé le 11 novembre 2026 pour la revue du 12 novembre 2026.

## Mandat utilisateur
Lancement rapide, aucun débours initial, site simple à comprendre, navigation de référence « Betclic » sans copie, direction graphique sobre, accueil qui ne montre que quelques grandes affiches, menu latéral, freemium, VIP envisagé à 9,90 €/mois, application installable et futurs stores.

## Modifications techniques préparées, non publiées
- Branche de travail `feature/cotego-premium-ux`, issue de la refonte mobile précédente.
- Accueil « À la une » : au maximum quatre matchs sur 30 jours dans le championnat sélectionné, tri éditorial basé sur équipes majeures + disponibilité d'une analyse + volume de données + proximité de date. **Ce tri n'est pas une mesure validée de probabilité de gagner un pari.** Pas de liste infinie sur l'accueil.
- Onglets de championnats, page « Matchs & analyses » distincte, navigation latérale et barre d'accès rapide mobile.
- Palette anthracite, ivoire, beige pierre, typographie système sobre ; aucune reprise des visuels, logos, textes commerciaux ou codes couleurs propres à Betclic.
- « À propos & sources » contenant les informations fournisseurs et les limites ; la signature obligatoire football-data.org demeure au pied de page, et le crédit SportScore reste sur la page de scores qui l'utilise.
- Page « Installer l'application » avec instructions PWA sur iOS / Android ; manifeste relié et service worker enregistré. Des icônes PNG 192/512 restent à finaliser pour l'installabilité Chrome.
- COTEGO Plus : description de fonctionnalités envisagées et lien de paiement **Stripe en mode test seulement**, placé dans une section technique repliable. Aucun encaissement réel et aucun droit d'accès VIP actif.

## Ce que nous devons encore valider techniquement
1. Tests GitHub et inspection visuelle de la branche après build de prévisualisation.
2. Sélection des 4 affiches et contrôle que les noms, heures de Paris et accès aux analyses sont cohérents.
3. Fiabilité des calculs : historique plus large si licence autorisée, tests temporels hors échantillon, Brier score, calibration des probabilités et comparaison à un baseline simple.
4. Vérifier le crédit fournisseur et les usages commerciaux permis ; licences et droit des bases de données.
5. Créer les icônes PNG, vérifier PWA sur iPhone et Android.
6. Compléter mentions légales, politique de confidentialité, CGV, cookies éventuels et procédure de résiliation avant commercialisation.

## Proposition sur les scénarios
Trois cotes cibles 1,50 / 2,00 / 3,00 ne constituent **pas** trois niveaux démontrés de fiabilité ni trois opportunités rentables. Une cote théorique est 1 / probabilité estimée, sans marge et sans bookmaker.

Recommandation : **un seul indicateur principal compréhensible sur chaque carte**, avec une mesure claire de disponibilité et de fraîcheur des données. Dans la fiche complète :
- Projection 1/N/2 et buts attendus.
- Jusqu'à trois scénarios statistiques complémentaires selon les données, **sans forcer l'existence d'un scénario** quand le modèle ou l'échantillon est insuffisant.
- Indication des matchs utilisés, de l'incertitude et des limites de calcul.
- Plus tard : comparaison historique, statistiques détaillées et indicateurs de calibration comme vraie valeur VIP (pas promesse d'augmenter les chances de gagner).

## Positionnement VIP : 9,90 €/mois envisagés
Fonctionnalités pouvant avoir une valeur d'abonnement, sous réserve de validation légale :
- Plus de filtres et de compétitions ; historique longitudinal et comparaisons.
- Favoris synchronisés, alertes d'événements sportifs, suivi de modèles calibrés.
- Exports de données autorisées et tableaux comparatifs personnalisés.

**À ne pas vendre comme tel** : « les meilleures probabilités de gagner de l'argent », « augmenter les chances de gagner », « pronostics rentables ». L'ANJ juge interdites les offres de conseils ou méthodes payantes affirmant augmenter les chances aux jeux d'argent : https://anj.fr/faq-professionnels .

## Choix proposés à valider
A. Palette neutre foncée / sable (préparée), ou neutre claire ?
B. Accueil : quatre affiches par compétition (préparé), ou trois affiches de plusieurs compétitions via une API agrégée avec quota à maîtriser ?
C. Un signal 1/N/2 simple + analyses approfondies (recommandé), ou trois cotes cibles toujours visibles ?
D. VIP : comparateurs et données étendues, sans conseils de mise (recommandé) ?
E. PWA gratuite en premier, stores natifs plus tard avec frais et paiements in-app imposés ?

## Déploiement
Ne pas promouvoir la branche de refonte en production avant contrôle fonctionnel et validation utilisateur. Le site `cotego.fr` reste indépendant de cette proposition.
