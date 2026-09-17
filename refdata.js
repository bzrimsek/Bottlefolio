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
  if (!p.ok) throw new Error('the permit list answered HTTP ' + p.status);
  fs.writeFileSync(path.join(CACHE, 'permits.csv'), await p.text());
  say('TTB permits: saved');
  const now = new Date();
  for (let y = now.getFullYear() - 14; y <= now.getFullYear(); y++) {
    for (let mo = 0; mo < 12; mo++) {
      const from = new Date(Date.UTC(y, mo, 1));
      if (from > now) break;
      const to = new Date(Date.UTC(y, mo + 1, 0));
      await ttbRange(from, to > now ? now : to, 0);
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
})().catch(e => { console.log('  ✖ refdata: ' + e.message); process.exit(1); });
