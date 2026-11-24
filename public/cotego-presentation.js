/* Presentation only: keeps the forecast's event, probability and saved record intact. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CotegoPresentation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function marketLabel(market,match){
    if(!market)return 'Données insuffisantes';
    const home=match?.home||'L’équipe à domicile',away=match?.away||'L’équipe à l’extérieur';
    const labels={home:home+' gagne',away:away+' gagne',draw:'Match nul','1X':home+' ou match nul','X2':away+' ou match nul','12':'Pas de match nul',hg05:home+' marque au moins un but',ag05:away+' marque au moins un but',hg15:home+' marque au moins deux buts',ag15:away+' marque au moins deux buts',notbtts:'Au moins une équipe ne marque pas'};
    return labels[market.code]||market.name||'Données insuffisantes';
  }
  function marketGroup(market){
    if(['home','draw','away','1X','X2','12'].includes(market?.code))return 'Résultat du match';
    if(['hg05','hg15','ag05','ag15'].includes(market?.code))return 'Buts d’une équipe';
    if(['btts','notbtts'].includes(market?.code))return 'Buts des deux équipes';
    return 'Total de buts';
  }
  return Object.freeze({marketLabel,marketGroup});
});
