import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PREVIEW = 'feature/cotego-premium-ux';
const WORKER = 'cotego';
const SECRET = 'FOOTBALL_DATA_API_KEY';

// Runs inside Workers Builds, using its existing account authorization.
// Never read a secret back, write it to disk, or relay CLI diagnostics.
export function ensurePreviewSecret({env = process.env, run = spawnSync, cli} = {}) {
  if (env.WORKERS_CI !== '1' || env.WORKERS_CI_BRANCH !== PREVIEW) return 'skipped';
  const cliPath = cli ?? createRequire(import.meta.url).resolve('wrangler/bin/wrangler.js');
  const childEnv = {...env, WRANGLER_SEND_METRICS:'false', WRANGLER_LOG_SANITIZE:'true'};
  delete childEnv[SECRET];
  delete childEnv.WRANGLER_LOG;
  const invoke = (args, input) => {
    const result = run(process.execPath, [cliPath, 'preview', 'secret', ...args,
      '--name', PREVIEW, '--worker-name', WORKER], {
      env:childEnv, input, encoding:'utf8', timeout:45000,
      maxBuffer:1024 * 1024, stdio:['pipe','pipe','pipe'],
    });
    if (result.error || result.status !== 0) {
      throw new Error('Preview secret operation failed; deployment stopped. Check Cloudflare build permissions.');
    }
    return result.stdout;
  };
  const exists = () => {
    let list;
    try { list = JSON.parse(invoke(['list', '--json'])); }
    catch { throw new Error('Cannot verify Preview secrets; deployment stopped.'); }
    if (!Array.isArray(list)) throw new Error('Invalid Preview secret list; deployment stopped.');
    return list.some(x => x?.name === SECRET && x.type === 'secret_text');
  };
  if (exists()) return 'preserved';
  const value = env[SECRET];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Preview runtime secret missing and build secret unavailable; deployment stopped.');
  }
  invoke(['bulk'], JSON.stringify({[SECRET]:value}));
  if (!exists()) throw new Error('Preview secret restoration not confirmed; deployment stopped.');
  return 'restored';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`COTEGO Preview runtime secret: ${ensurePreviewSecret()}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
