import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

test('beta journal keeps all three targets visible without inventing paid gating',()=>{
 const source=readFileSync(new URL('../public/cotego-platform.js',import.meta.url),'utf8');
 assert.match(source,/\[1\.5,2,3\]\.map\(target=>/);
 assert.match(source,/Non disponible/);
 assert.doesNotMatch(source,/journal-pick-locked">Plus</);
 assert.match(source,/data-journal-detail/);
});


test('mobile prediction journal uses accessible compact cards while preserving audit metadata',()=>{
 const source=readFileSync(new URL('../public/cotego-platform.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../public/cotego-rework.css',import.meta.url),'utf8');
 assert.match(source,/class="journal-record"/,'Each fixture needs its own card');
 assert.match(source,/class="journal-record-head"/,'Fixture identity must remain visible');
 assert.match(source,/class="journal-kickoff"/,'Kickoff time must remain visible');
 assert.match(source,/class="journal-record-footer"/,'Audit details must remain available');
 assert.match(source,/time\(r\.createdAt\)/,'Original prediction timestamp must remain visible');
 assert.match(source,/time\(r\.kickoffUtc\)/,'Original kickoff timestamp must remain visible');
 assert.match(source,/r\.finalScore\?/,'Pending fixtures must not be presented as finished');
 assert.match(source,/\[1\.5,2,3\]\.map\(target=>/,'All three beta tiers must be rendered');
 assert.match(source,/data-journal-detail/,'Users must be able to open the archived analysis');
 assert.doesNotMatch(source,/class="history-table"/,'The archived journal must not regress to a horizontal six-column table');
 assert.match(styles,/\.journal-records\{display:grid/);
 assert.match(styles,/@media\(max-width:600px\)/,'Small screens must have a dedicated card layout');
});
