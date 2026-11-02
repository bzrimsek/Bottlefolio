/* THE ENGINE, OUT OF index.html, WITHOUT A BROWSER.
 *
 * Everything on `L.` from `const L = {};` down to the STATE + RENDER banner
 * is pure, and three tools need it: the assertions, the wiring checks and
 * the nightly popular count. Each carried its own copy of these lines until
 * 2026-09-16; a third copy was about to be written, which is the moment to
 * have one.
 *
 *   const { L, source } = require('./engine.js')();
 */
const fs = require('fs');
const path = require('path');

const BANNER = '/* =====================================================================\n   STATE + RENDER';

/* AND BZ'S SHELF, WHICH IS THREE FILES AND NOT ONE. The harnesses drive
   the app with his bottles; the app's catalog is data.json merged with what
   only his account knows, which is what rebuildCatalog() does at runtime.
   A harness that sets S.bottles and not S.custom is testing a shelf 34
   products poorer than his, quietly.

     const { bottles, custom, flights } = require('./engine.js').shelf();
*/
module.exports.shelf = function (dir) {
  const here = dir || __dirname;
  const read = n => JSON.parse(fs.readFileSync(path.join(here, n), 'utf8'));
  const shelf = { bottles: read('bz-bottles.json'), custom: read('bz-custom.json') };
  /* HOW OLD THE SHELF IS, said once, because rule 13d wants the population with
     the measurement and this IS the population. On 2026-10-03 I reported fourteen
     faults off files written on 20 September, against a shelf that had moved on by
     two weeks - his screen said 328 whiskies where I kept quoting 339, and nothing
     anywhere said the files were old. It never fails a build: a stale shelf is a
     fact about what the numbers describe, not a fault in them. */
  shelf.asOf = [path.join(here, 'bz-bottles.json'),
    path.join(here, 'bz-custom.json')]
    .filter(f => fs.existsSync(f))
    .reduce((t, f) => Math.max(t, fs.statSync(f).mtimeMs), 0);
  if (shelf.asOf) {
    const days = Math.floor((Date.now() - shelf.asOf) / 86400000);
    console.log('  shelf files as of '
      + new Date(shelf.asOf).toISOString().slice(0, 10)
      + (days > 1 ? ' (' + days + ' days old)' : '')
      + ' \u2014 ' + shelf.bottles.length + ' bottles'
      + (days > 21 ? '  <- refresh it: node snapshot.js --write' : ''));
  }
  /* Flights are optional: two harnesses do not draw one. */
  const f = path.join(here, 'bz-flights.json');
  shelf.flights = fs.existsSync(f) ? read('bz-flights.json') : [];
  /* AND THE SHARED LIBRARY, WHICH IS MOST OF HIS CATALOGUE (2026-11-02).
     Without it this function handed back a catalogue of 322 entries in which
     53 of his 356 owned bottlings did not exist, and nine harnesses graded
     his real shelf against it - answers.js and says.js among them, the two
     written precisely to catch a screen saying a false thing. His app joins
     754 published entries into S.base; setupState below is the door that
     does the joining, and the comment there has warned since 2026-10-05 that
     a probe skipping it measures a catalogue hundreds of entries short. The
     warning was right and this function was the one ignoring it.
     The graves ride along because LIB.graves is how a renamed entry still
     answers to its old name. */
  const lf = path.join(here, 'bz-library.json');
  const lib = fs.existsSync(lf) ? read('bz-library.json') : {};
  shelf.library = lib.products || {};
  shelf.graves = lib.graves || {};
  if (!fs.existsSync(lf)) {
    console.log('  NO bz-library.json - this shelf is being graded against'
      + ' data.json alone. Run: node snapshot.js --write');
  }
  return shelf;
};

/* THE STATE THE APP WOULD HAVE, ASSEMBLED THE WAY THE APP ASSEMBLES IT.
 * Runs IN THE PAGE - pass it straight to page.evaluate with the data as its
 * one argument. It closes over nothing, so it survives being serialised.
 *
 *   const { setupState, account } = require('./engine.js');
 *   const data = await account(uid);
 *   await page.evaluate(setupState, data);
 *
 * THE LIBRARY JOINS S.base UNDER EACH ENTRY'S DISPLAY NAME. That is what the
 * app does when it reads the library (index.html, where `np.k = np.name`),
 * and every probe that set LIB.products and called rebuildCatalog without it
 * measured a catalogue 400 entries short - which is where five wrong reports
 * to BZ came from on 2026-10-05.
 */
module.exports.setupState = function setupState(data) {
  const d = data || {};
  S.bottles = d.bottles || [];
  S.custom = d.custom || {};
  S.edits = d.edits || {};
  S.deleted = d.deleted || {};
  if (d.flights) S.customFlights = d.flights;
  if (d.favs) S.favs = d.favs;
  if (d.history) S.history = d.history;
  LIB.products = d.library || {};
  LIB.graves = d.graves || {};
  const base = Object.assign({}, S.base);
  Object.values(d.library || {}).forEach(e => {
    if (!e || !e.name) return;
    const np = Object.assign({}, e);
    np.k = np.name;
    base[np.k] = np;
  });
  S.base = base;
  rebuildCatalog();
  save_();
  /* SAID BACK, so a probe can see at a glance whether it loaded a real shelf
     or an empty one - the difference between 326 and 723 is the whole of the
     fault this exists to stop. */
  return { bottles: S.bottles.length,
    catalog: Object.keys(S.catalog).length,
    library: Object.keys(LIB.products).length,
    graves: Object.keys(LIB.graves).length };
};

/* HIS CATALOGUE, WITHOUT A PAGE (2026-11-02). The node-side twin of what
 * setupState does in the browser: data.json, the shared library joined over
 * it under each entry's display name, then his edits, his custom products
 * and his deletions through L.mergeCatalog.
 *
 *   const cat = eng.catalogFor(eng.shelf(dir), dir);
 *
 * TWO HARNESSES BUILT THIS THEMSELVES and both left the library out, so
 * mine.js graded his shelf as 53 bottlings poorer than it is and papers.js
 * printed flight papers against a catalogue his app does not have. The join
 * is four lines, which is exactly why it got skipped twice.
 *
 * THERE ARE STILL TWO SPELLINGS OF THE JOIN - this one and setupState's,
 * which has to be serialisable to run inside page.evaluate and so cannot
 * call out here. The one fix that removes the second is an L. function in
 * index.html that both call; it is written down as the follow-up rather
 * than smuggled into this build.
 */
module.exports.catalogFor = function (shelf, dir) {
  const L = ownL();
  const here = dir || __dirname;
  const base = JSON.parse(fs.readFileSync(path.join(here, 'data.json'), 'utf8'))
    .catalog || {};
  const joined = Object.assign({}, base);
  Object.values(shelf.library || {}).forEach(e => {
    if (!e || !e.name) return;
    joined[e.name] = Object.assign({}, e, { k: e.name });
  });
  return L.mergeCatalog(joined, shelf.edits || {}, shelf.custom || {},
    shelf.deleted || {});
};

/* HIS SHELF INTO A PAGE, ONE DOOR (2026-11-02).
 *
 *   const eng = require('./engine.js');
 *   const shelf = eng.shelf(dir);
 *   await eng.loadShelf(p, shelf);                 // the whole shelf
 *   await eng.loadShelf(p, shelf, someSubset);     // or part of it
 *
 * WHY. Nine harnesses wrote their own version of this - `S.bottles = bs;
 * S.custom = cu; save_(); rebuildCatalog();` and six other spellings - and
 * not one of them joined the shared library, because joining it is four
 * lines and lives in setupState. So every one of them graded his real shelf
 * against a catalogue of 322 entries where 53 of his 356 owned bottlings did
 * not exist, while his app runs 769 entries with none missing. answers.js
 * and says.js were two of the nine, which is the sharp end: both exist to
 * catch a screen saying a false thing, and both were asking a screen about a
 * library it could not see. That is the shape rule 30d is for - one question,
 * one door - and the door already existed.
 *
 * IT CHECKS WHAT IT LOADED. setupState says back what landed, and a shelf
 * whose owned bottles outrun its catalogue is the fault above coming back,
 * so this throws rather than grading anything.
 */
module.exports.loadShelf = async function (page, shelf, bottles) {
  const data = Object.assign({}, shelf);
  if (bottles) data.bottles = bottles;
  delete data.asOf;
  const got = await page.evaluate(module.exports.setupState, data);
  if (got.catalog < 400) {
    throw new Error('loadShelf: the page holds a catalogue of only '
      + got.catalog + ' entries and ' + got.library + ' library entries.'
      + ' His app runs about 769. Run: node snapshot.js --write');
  }
  return got;
};

/* A LIVE ACCOUNT, IN THE SHAPES THE PAGE WANTS. Needs a service-account key in
 * FIREBASE_SA_FILE or FIREBASE_SA, exactly as rules.js does; required lazily so
 * a harness with no credentials still loads this file.
 *
 * KEYS ARE AS FIREBASE HOLDS THEM. Maps keyed by a bottle key keep their
 * escapes - `.` is stored `~d` - and the app decodes them on the way in with
 * L.unFbKey. Reading them raw and calling the difference a fault is one of the
 * mistakes this file exists to stop, so anything comparing those keys to the
 * catalogue decodes first.
 */
/* THE ENGINE, ONCE, FOR THIS FILE'S OWN USE. account() has to decode a
   Firebase key the way the app does, and L.unFbKey is that door; loading
   the engine is not cheap, so it is done at most once per process. */
let _ownL = null;
const ownL = () => (_ownL = _ownL || module.exports().L);

/* WHOSE ACCOUNT, said once (2026-11-02). Three tools wrote his uid out for
   themselves and a fourth was about to; BF_UID still overrides, which is how
   a probe reads somebody else's account. */
module.exports.myUid = () => process.env.BF_UID
  || 'cv2EMNKszFehDrNP1yf8O9e1siP2';

module.exports.account = async function (uid) {
  const { token, DB } = require('./rules.js');
  const tok = await token();
  const get = async p => {
    const r = await fetch(DB + p + '.json',
      { headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error('read ' + p + ' gave HTTP ' + r.status);
    return r.json();
  };
  const mine = await get('/bz-apps/whisky/' + uid);
  const library = await get('/bz-apps/whisky/shared/catalog/products');
  const renamed = await get('/bz-apps/whisky/shared/renamed');
  /* THE GRAVES, FLATTENED ONCE. Every probe wrote this loop again, which is
     three chances to write it differently. */
  const graves = {};
  Object.keys(renamed || {}).forEach(k => {
    const rec = renamed[k];
    const to = (rec && typeof rec === 'object') ? rec.to : rec;
    /* DECODED like the app does: a grave for a key holding a dot or a
       slash is written through L.fbKey. */
    if (to && typeof to === 'string') graves[ownL().unFbKey(k)] = to;
  });
  const bottles = Array.isArray(mine.bottles)
    ? mine.bottles : Object.values(mine.bottles || {});
  return { bottles: bottles, custom: mine.custom || {}, edits: mine.edits || {},
    deleted: mine.deleted || {}, flights: mine.customFlights || {},
    favs: mine.favs || {}, history: mine.history || [],
    library: library || {}, graves: graves, node: mine };
};

module.exports = Object.assign(function loadEngine(file) {
  const html = fs.readFileSync(file || path.join(__dirname, 'index.html'), 'utf8');
  const start = html.indexOf('const L = {};');
  const end = html.indexOf(BANNER);
  if (start < 0 || end < 0) throw new Error('logic block not found in index.html');
  const m = { exports: {} };
  new Function('module', html.slice(start, end) + '\nmodule.exports = L;')(m);
  return { L: m.exports, source: html };
}, module.exports);
