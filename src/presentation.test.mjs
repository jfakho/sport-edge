import test from 'node:test';
import assert from 'node:assert/strict';
import view from '../public/cotego-presentation.js';
test('team-specific wording preserves the home/away side and goal threshold',()=>{
 const match={home:'LOSC',away:'Olympique Lyonnais'};
 for(const [code,expected] of [['hg05','LOSC marque au moins un but'],['ag05','Olympique Lyonnais marque au moins un but'],['hg15','LOSC marque au moins deux buts'],['ag15','Olympique Lyonnais marque au moins deux buts'],['home','LOSC gagne'],['away','Olympique Lyonnais gagne'],['1X','LOSC ou match nul'],['X2','Olympique Lyonnais ou match nul']]){
  const market=Object.freeze({code,p:.51});assert.equal(view.marketLabel(market,match),expected);assert.equal(market.p,.51);
 }
});
test('unrecognized markets retain the source wording without inventing a scenario',()=>{
 assert.equal(view.marketLabel({code:'u25',name:'Moins de 2,5 buts'},{}),'Moins de 2,5 buts');
 assert.equal(view.marketLabel(null,{}),'Données insuffisantes');
});
