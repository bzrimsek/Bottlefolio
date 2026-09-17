/* REFERENCE DATA FOR THE LIBRARY (BZ, 2026-09-16).
 *
 *   node refdata.js fetch    download the sources into refcache/ (slow, polite)
 *   node refdata.js build    read refcache/ and print what it would load
 *   FIREBASE_SA_FILE=... node refdata.js load   write it to the shared database
 *
 * Sources, all public and free:
 *   Wikidata   every distillery, with country and place
 *   TTB        every whisky label approval of the last 14 years (the US
 *              registry every bottle sold in the US passes through, imports
 *              included), as brand -> category and country
 *   TTB        the spirits producers list, permit -> distillery name
 *
 * Run on the 2nd of every month by .github/workflows/refdata.yml (BZ,
 * 2026-09-17), which keeps refcache/ between runs as an artifact so only the
 * month just finished is asked for.
 *
 * The shaping is the engine's (L.refHouses, L.refBrands, L.refFill), so the
 * app and this script cannot disagree about what a row means.
 */
const fs = require('fs');
const path = require('path');
const { L } = require('./engine.js')();

const CACHE = path.join(__dirname, 'refcache');
const WIKIDATA = 'https://query.wikidata.org/sparql';
const TTB = 'https://ttbonline.gov/colasonline/';
const PERMITS = 'https://www.ttb.gov/system/files/2025-04/FRL_Spirits_Producers_and_Bottlers_List.csv';
const UA = 'Bottlefolio/2.4 reference data (whiskey collection app)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = s => console.log('  ' + s);

async function fetchWikidata() {
  const r = await fetch(WIKIDATA + '?format=json&query='
    + encodeURIComponent(L.wikidataDistilleriesQuery()), { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('Wikidata answered HTTP ' + r.status);
  fs.writeFileSync(path.join(CACHE, 'wikidata.json'), await r.text());
  say('Wikidata: saved');
}

async function ttbSession() {
  const r = await fetch(TTB + 'publicSearchColasBasic.do', { headers: { 'User-Agent': UA } });
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
    .map(c => c.split(';')[0]).join('; ');
}

const mmddyyyy = d => String(d.getUTCMonth() + 1).padStart(2, '0') + '/'
  + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear();

/* One month of whisky approvals as the registry's own CSV. The export stops
   at 1,000 rows, so a month over that is split in halves until it is not. */
async function ttbRange(from, to, depth) {
  const file = path.join(CACHE, 'ttb-' + from.toISOString().slice(0, 10) + '_'
    + to.toISOString().slice(0, 10) + '.csv');
  if (fs.existsSync(file)) return;
  const jar = await ttbSession();
  const body = new URLSearchParams({
    'searchCriteria.productOrFancifulName': '', 'searchCriteria.productNameSearchType': 'E',
    'searchCriteria.dateCompletedFrom': mmddyyyy(from), 'searchCriteria.dateCompletedTo': mmddyyyy(to),
    'searchCriteria.classTypeFrom': '100', 'searchCriteria.classTypeTo': '199',
    'searchCriteria.originCode': '' });
  const res = await fetch(TTB + 'publicSearchColasBasicProcess.do?action=search', {
    method: 'POST', body: body,
    headers: { Cookie: jar, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
  const html = await res.text();
  const m = /Total Matching Records: (\d+)/.exec(html.replace(/<[^>]*>/g, ' '));
  /* A PAGE WITH NO COUNT IS NOT AN EMPTY MONTH. Saved as one, a blocked or
     broken answer would sit in the cache as "no labels" for good. Every
     whisky month since 2012 has had approvals, so no count is a failure. */
  if (!m) {
    throw new Error('TTB did not answer a search for ' + mmddyyyy(from) + '-' + mmddyyyy(to)
      + ' (HTTP ' + res.status + ')');
  }
  const total = m ? +m[1] : 0;
  if (total > 1000 && depth < 6) {
    const days = Math.floor((to.getTime() - from.getTime()) / 86400000);
    const mid = new Date(from.getTime() + Math.floor(days / 2) * 86400000);
    const next = new Date(mid.getTime() + 86400000);
    await sleep(800);
    await ttbRange(from, mid, depth + 1);
    await sleep(800);
    await ttbRange(next, to, depth + 1);
    return;
  }
  let csv = '';
  if (total) {
    await sleep(800);
    const out = await fetch(TTB + 'publicSaveSearchResultsToFile.do?path=/publicSearchColasBasicProcess',
      { headers: { Cookie: jar, 'User-Agent': UA } });
    csv = await out.text();
  }
  fs.writeFileSync(file, csv);
  say('TTB ' + mmddyyyy(from) + '-' + mmddyyyy(to) + ': ' + total + (total > 1000 ? ' (capped)' : ''));
}

async function fetchAll() {
  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE);
  await fetchWikidata();
  const p = await fetch(PERMITS, { headers: { 'User-Agent': UA } });
  /* The permit list moves when TTB republishes it; the copy already here is
     kept rather than failing the month. */
  if (p.ok) {
    fs.writeFileSync(path.join(CACHE, 'permits.csv'), await p.text());
    say('TTB permits: saved');
  } else if (fs.existsSync(path.join(CACHE, 'permits.csv'))) {
    say('TTB permits: HTTP ' + p.status + ', kept the copy from last time');
  } else {
    throw new Error('the permit list answered HTTP ' + p.status);
  }
  /* FINISHED MONTHS ONLY. A month read part-way and read again once it ends
     would count its first weeks twice, so a part-month file is removed and
     the month waits until it is over. */
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  fs.readdirSync(CACHE).forEach(f => {
    const d = /^ttb-(\d{4}-\d{2}-\d{2})_/.exec(f);
    if (d && new Date(d[1] + 'T00:00:00Z') >= thisMonth) {
      fs.unlinkSync(path.join(CACHE, f));
      say('removed part-month ' + f);
    }
  });
  for (let y = now.getUTCFullYear() - 14; y <= now.getUTCFullYear(); y++) {
    for (let mo = 0; mo < 12; mo++) {
      const from = new Date(Date.UTC(y, mo, 1));
      if (from >= thisMonth) break;
      const to = new Date(Date.UTC(y, mo + 1, 0));
      const had = fs.readdirSync(CACHE).some(f => f.indexOf('ttb-' + from.toISOString().slice(0, 10)) === 0);
      if (had) continue;
      await ttbRange(from, to, 0);
      await sleep(800);
    }
  }
}

function build() {
  const wd = JSON.parse(fs.readFileSync(path.join(CACHE, 'wikidata.json'), 'utf8'));
  const houses = L.refHouses(((wd.results || {}).bindings) || []);
  const permits = L.permitNames(fs.readFileSync(path.join(CACHE, 'permits.csv'), 'utf8'));
  let rows = [];
  fs.readdirSync(CACHE).filter(f => /^ttb-.*\.csv$/.test(f)).forEach(f => {
    rows = rows.concat(L.ttbCsvRows(fs.readFileSync(path.join(CACHE, f), 'utf8')));
  });
  const brands = L.refBrands(rows, permits, houses);
  return { houses: houses, brands: brands, rows: rows.length, permits: Object.keys(permits).length };
}

async function load(ref) {
  const { token, DB } = require('./rules.js');
  const tok = await token();
  const put = async (p, v) => {
    const r = await fetch(DB + '/bz-apps/whisky/shared/' + p + '.json', {
      method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(v) });
    if (!r.ok) throw new Error(p + ' refused: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  };
  /* NEVER SMALLER BY MUCH. A fetch that lost months builds a thinner set, and
     loading it would quietly undo what the library was filled from. */
  const live = await (await fetch(DB + '/bz-apps/whisky/shared/ref/brands.json?shallow=true',
    { headers: { Authorization: 'Bearer ' + tok } })).json();
  const liveN = Object.keys(live || {}).length, newN = Object.keys(ref.brands).length;
  if (liveN && newN < liveN * 0.9) {
    throw new Error('refused: ' + newN + ' brands against ' + liveN + ' live - a fetch lost data');
  }
  const at = Date.now();
  await put('ref', { at: at, houses: ref.houses, brands: ref.brands });
  say('loaded ' + Object.keys(ref.houses).length + ' distilleries and '
    + Object.keys(ref.brands).length + ' brands');
  const lib = L.libraryFromValue(await (await fetch(DB + '/bz-apps/whisky/shared/catalog/products.json',
    { headers: { Authorization: 'Bearer ' + tok } })).json());
  const plan = L.refFill(lib, ref);
  const updates = {};
  Object.keys(plan.updates).forEach(k => Object.keys(plan.updates[k]).forEach(f => {
    updates[k + '/' + f] = plan.updates[k][f];
  }));
  /* A NEW STAMP on each entry filled, or devices that sync by stamp never see it. */
  Object.keys(plan.updates).forEach(k => { updates[k + '/at'] = Date.now(); });
  if (Object.keys(updates).length) {
    const r = await fetch(DB + '/bz-apps/whisky/shared/catalog/products.json', {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates) });
    if (!r.ok) throw new Error('library fill refused: HTTP ' + r.status);
    await put('stamp', Date.now());
  }
  say('filled ' + Object.keys(plan.updates).length + ' library entries; '
    + plan.conflicts.length + ' disagree (listed in Clean up)');
}

(async () => {
  const cmd = process.argv[2] || 'build';
  if (cmd === 'fetch') { await fetchAll(); return; }
  const ref = build();
  say(ref.rows + ' label approvals, ' + ref.permits + ' permits');
  say(Object.keys(ref.houses).length + ' distilleries, ' + Object.keys(ref.brands).length + ' brands, '
    + Math.round(JSON.stringify({ houses: ref.houses, brands: ref.brands }).length / 1024) + ' KB');
  if (cmd === 'load') await load(ref);
})().catch(e => {
  /* "fetch failed" alone says nothing; the cause names the refusal. */
  const c = e.cause || {};
  console.log('  ✖ refdata: ' + e.message + (c.code || c.message ? ' (' + [c.code, c.message].filter(Boolean).join(': ') + ')' : ''));
  process.exit(1);
});
