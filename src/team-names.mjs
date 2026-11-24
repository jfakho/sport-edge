/** Display labels keyed by football-data.org identity, never by a fuzzy name.
 * Ligue 1 labels checked against the LFP 2026/27 fixture publication:
 * https://ligue1.com/fr/articles/l1_article_5284-ligue-1-mcdonald-s-le-calendrier-de-la-saison-26-27
 * Other teams retain their provider's full name, including legitimate FC/AFC.
 * Applying these labels in every competition keeps European fixtures consistent.
 */
export const TEAM_DISPLAY_NAMES = Object.freeze({
  511:'Toulouse FC', 512:'Stade Brestois 29', 516:'Olympique de Marseille',
  519:'AJ Auxerre', 521:'LOSC', 522:'OGC Nice', 523:'Olympique Lyonnais',
  524:'Paris Saint-Germain', 525:'FC Lorient', 529:'Stade Rennais FC',
  531:'ESTAC Troyes', 532:'Angers SCO', 533:'Havre AC', 535:'Le Mans FC',
  546:'RC Lens', 548:'AS Monaco', 576:'RC Strasbourg Alsace', 1045:'Paris FC',
});

export function teamDisplayName(id, providerName) {
  return TEAM_DISPLAY_NAMES[id] ?? String(providerName ?? '').trim();
}
