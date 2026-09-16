/* WHAT'S POPULAR, COUNTED. Run nightly by .github/workflows/popular.yml.
 *
 *   FIREBASE_SA=<key json> node popular.js           count and write the totals
 *   FIREBASE_SA_FILE=<path> node popular.js --dry-run   count, write nothing
 *
 * BZ, 2026-09-16: each person who switches it on keeps a private list at
 * bz-apps/whisky/popular/in/<uid> - readable by its owner and nobody else,
 * not an admin either. This job is the only reader. It adds the lists up
 * with L.popularTotals, which drops anything fewer than three people have,
 * and writes totals only to popular/totals. It never prints a list, a uid
 * or a name from one - only how many people and how many whiskies.
 *
 * Signs in with the same key and the same code as rules.js.
 */
const { L } = require('./engine.js')();
const { token, DB } = require('./rules.js');

const NODE = DB + '/bz-apps/whisky/popular';

async function main() {
  const dry = process.argv.indexOf('--dry-run') >= 0;
  const tok = await token();
  const headers = { Authorization: 'Bearer ' + tok };
  const r = await fetch(NODE + '/in.json', { headers });
  if (!r.ok) throw new Error('reading the lists gave HTTP ' + r.status);
  const lists = Object.values((await r.json()) || {});
  const totals = L.popularTotals(lists, L.POPULAR_FLOOR);
  const shown = Object.keys(totals.items).length;
  console.log('  popular: ' + totals.people + ' people counted, ' + shown
    + ' whiskies at ' + L.POPULAR_FLOOR + ' or more');
  if (dry) { console.log('  dry run - nothing written'); return; }
  const w = await fetch(NODE + '/totals.json', {
    method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify(Object.assign({ at: Date.now() }, totals))
  });
  if (!w.ok) throw new Error('writing the totals gave HTTP ' + w.status);
  console.log('  ✓ totals written');
}

main().catch(e => { console.log('  ✖ popular: ' + e.message); process.exit(1); });
