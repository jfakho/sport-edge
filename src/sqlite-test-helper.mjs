import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

export function auditDatabase() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../db/cotego-audit.sql',import.meta.url),'utf8'));
  const prepare=sql=>({bind(...params){return {
    async all(){return {results:sqlite.prepare(sql).all(...params)};},
    async first(){return sqlite.prepare(sql).get(...params)??null;},
    async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}};},
    _sql:sql,_params:params,
  };}});
  return {sqlite,prepare,async batch(statements){
    sqlite.exec('BEGIN');
    try {const results=statements.map(s=>{const r=sqlite.prepare(s._sql).run(...s._params);return {meta:{changes:Number(r.changes)}};});sqlite.exec('COMMIT');return results;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
}
