/* Hunting the KINDS of fault this app keeps producing.
 *
 * Almost every real bug found on 2026-09-04 was found by BZ looking at a
 * screen: an id that did not exist, a field parsed and then dropped, a
 * state key that never synced, a literal \u2014 in a string, a dead
 * function left behind. Every one of those is visible in the source
 * without running anything — the suite could not see them because it
 * tests behaviour through L, and these live in the wiring.
 *
 * This reads index.html as text and asks the questions that would have
 * caught them.
 */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
let bad = 0, checks = 0;
const fail = (what, detail) => {
  bad++;
  console.log('  \u2716 ' + what);
  (detail || []).slice(0, 8).forEach(d => console.log('      ' + d));
};
const ok = what => console.log('  \u2713 ' + what);
const check = (what, offenders) => {
  checks++;
  if (offenders && offenders.length) fail(what, offenders);
  else ok(what);
};

/* 1. An element id that is written to but never exists in the markup.
      This is the brandActs bug: the dot was inserted into a container
      that had never been there, so it silently never appeared. */
const declared = new Set();
(src.match(/\bid="([A-Za-z0-9_-]+)"/g) || []).forEach(m =>
  declared.add(m.slice(4, -1)));
(src.match(/\.id = '([A-Za-z0-9_-]+)'/g) || []).forEach(m =>
  declared.add(m.split("'")[1]));
// setAttribute('id', ...) declares one just as much as .id does.
(src.match(/setAttribute\('id',\s*'([A-Za-z0-9_-]+)'\)/g) || []).forEach(m =>
  declared.add(m.split("'")[3]));
const used = new Set();
(src.match(/getElementById\('([A-Za-z0-9_-]+)'\)/g) || []).forEach(m =>
  used.add(m.split("'")[1]));
(src.match(/\$\('#([A-Za-z0-9_-]+)'\)/g) || []).forEach(m =>
  used.add(m.split('#')[1].split("'")[0]));
check('every id the code reaches for exists',
  [...used].filter(id => !declared.has(id)));

/* 2. A literal \u escape inside a string. Written by a heredoc that
      escaped the backslash, so the app prints \u2014 instead of a dash. */
check('no literal unicode escapes in output strings',
  (src.match(/\\\\u[0-9a-fA-F]{4}/g) || []));

/* 3. An L function defined and never called anywhere. L.peatScale was
      built when Smoke came off the radar, then Smoke came back. */
const defined = (src.match(/^L\.([a-zA-Z_][a-zA-Z0-9_]*) = function/gm) || [])
  .map(m => m.match(/^L\.([a-zA-Z0-9_]+)/)[1]);
/* The TEST file counts as a use. bottleGaps was reported dead, removed,
   and the suite immediately stopped running: it had assertions and no
   caller in the app, which is a different fault — built and never wired,
   like the admin badge writing to an element that no longer existed. That
   is worth knowing about, and it is not the same as unused. */
const tests = fs.readFileSync(__dirname + '/killer-bs-test.js', 'utf8');
const dead = [], unwired = [];
defined.forEach(fn => {
  const inApp = src.split('L.' + fn).length - 1;
  if (inApp > 1) return;
  (tests.indexOf('L.' + fn) >= 0 ? unwired : dead).push(fn);
});
check('no L function is defined and never used', dead);

/* 3b. And plain top-level functions, which the check above did not see.
       reviewLibraryFill was replaced by writeLibraryFill and sat there
       whole, 2,600 characters of it, because it is not an L function. */
const plainDead = (src.match(/^function (\w+)\(/gm) || [])
  .map(m => m.match(/^function (\w+)/)[1])
  .filter(fn => src.split(new RegExp('\\b' + fn + '\\b')).length - 1 <= 1)
  .filter(fn => src.indexOf("'" + fn + "'") < 0);   // not called by name
check('no plain function is defined and never called', plainDead);
check('no L function is tested but never wired into the app', unwired);

/* 4. Every axis has a search phrase. The axis list and AXIS_ASK drifted
      apart when Origin became World and the phrase still said Scotch. */
/* Only the SHELF_AXES block, not every object literal in the file that
   happens to have an id — the first pass matched `{ id: 'got', label:`
   from unrelated code and reported eight axes that do not exist. */
const axBlock = src.slice(src.indexOf('L.SHELF_AXES = ['),
  src.indexOf('L.SHELF_AXES = [') + 1200);
const axisIds = (axBlock.match(/\{ id: '([a-z]+)'/g) || [])
  .map(m => m.split("'")[1]);
const askBlock = src.slice(src.indexOf('L.AXIS_ASK'),
  src.indexOf('L.AXIS_ASK') + 1400);
check('every axis has a search phrase',
  axisIds.filter(id => askBlock.indexOf(id + ':') < 0));

/* 5. Every state key initialised in the default shelf is either synced or
      deliberately local. A key nobody listed is a key that silently does
      not follow the account — which is how libLedger and tastingsSeen
      were per-device. */
const defBlock = src.slice(src.indexOf('refGroup:'), src.indexOf('refGroup:') + 2600);
const stateKeys = (defBlock.match(/^\s{10,14}([a-zA-Z][a-zA-Z0-9_]*):/gm) || [])
  .map(m => m.trim().replace(':', ''));
const syncBlock = src.slice(src.indexOf('L.SYNC_KEYS'),
  src.indexOf('L.SYNC_KEYS') + 700);
/* Deliberately per-device: screen state, the sync bookkeeping itself, and
   the spend meter, which is a guard on THIS device rather than a fact
   about the account. */
const LOCAL_ON_PURPOSE = ['filters', 'fflt', 'shop', 'shopMode', 'shopDim',
  'lastList', 'updated', 'pushedAt', 'lookupTally', 'axisTurn', 'base',
  'lookupUrl', 'libLedgerAt', 'reelState', 'seenTips', 'installDismissed',
  'offerText', 'barSort', 'log', 'reels', 'held'];
check('every stored key is synced or marked local on purpose',
  stateKeys.filter(k => syncBlock.indexOf("'" + k + "'") < 0
    && LOCAL_ON_PURPOSE.indexOf(k) < 0));

/* 6. Anything L.SYNC_MERGE declares must actually be in L.SYNC_KEYS, or
      the declaration is a comment. libLedger sat like that for weeks. */
const mergeBlock = src.slice(src.indexOf('L.SYNC_MERGE'),
  src.indexOf('L.SYNC_MERGE') + 500);
const mergeKeys = (mergeBlock.match(/'([a-zA-Z]+)'/g) || [])
  .map(m => m.replace(/'/g, ''));
check('every mergeable key is actually synced',
  mergeKeys.filter(k => syncBlock.indexOf("'" + k + "'") < 0));

/* 7. Three lists must agree: the state defaults, what is written to this
      device (KEYS), and what follows the account (L.SYNC_KEYS). A key in
      the defaults and not in KEYS does not survive a reload — which is
      how six keys added in one day were living in memory only, including
      the record of which tastings had already been applied. */
const keysBlock = src.slice(src.indexOf('const KEYS = ['),
  src.indexOf('const KEYS = [') + 900);
check('every stored key survives a reload',
  stateKeys.filter(k => keysBlock.indexOf("'" + k + "'") < 0
    && ['filters', 'fflt', 'shop', 'shopMode', 'shopDim', 'lastList',
        'base', 'reels', 'held', 'offerText', 'reelState', 'seenTips',
        'installDismissed', 'libLedgerAt'].indexOf(k) < 0));

/* 8. And anything that follows the account must be written down first. */
check('everything synced is also saved locally',
  (syncBlock.match(/'([a-zA-Z]+)'/g) || []).map(m => m.replace(/'/g, ''))
    .filter(k => keysBlock.indexOf("'" + k + "'") < 0));

/* 11. Two functions with the SAME NAME. The later definition silently
       replaces the earlier one and the app calls the wrong body — which is
       exactly what broke the browser walk when a split reused the name
       shopBottleView, and it cost a revert and two two-minute runs to
       find. JavaScript does not complain, so something has to. */
const names = (src.match(/^function (\w+)\(/gm) || [])
  .map(m => m.match(/^function (\w+)/)[1]);
const seen = {}, dupes = [];
names.forEach(n => {
  if (seen[n]) { if (dupes.indexOf(n) < 0) dupes.push(n); }
  seen[n] = 1;
});
check('no two functions share a name', dupes);

/* 12. And the same for L, where a collision would silently replace a
       tested helper with an untested one. */
const lNames = (src.match(/^L\.(\w+) = function/gm) || [])
  .map(m => m.match(/^L\.(\w+)/)[1]);
const lSeen = {}, lDupes = [];
lNames.forEach(n => {
  if (lSeen[n]) { if (lDupes.indexOf(n) < 0) lDupes.push(n); }
  lSeen[n] = 1;
});
check('no two L helpers share a name', lDupes);

/* 13. An id emitted by a function that runs many times per page must be
       unique. Every glass emitted id="cg", so a payline of three had the
       same id three times and url(#cg) resolved to whichever came first —
       the fill on every glass after it depended on one it did not own. */
const svgIds = (src.match(/<(?:clipPath|linearGradient|mask|filter) id="([^"]+)"/g) || [])
  .map(m => m.match(/id="([^"]+)"/)[1])
  .filter(id => !/'\s*\+|\+\s*/.test(id));   // built ids are fine
check('no fixed svg id is emitted by a repeated drawing',
  svgIds.filter(id => {
    const i = src.indexOf('id="' + id + '"');
    const fn = src.lastIndexOf('function ', i);
    // inside a function that returns markup: it will run more than once
    return fn > 0 && src.slice(fn, i).indexOf('return') >= 0;
  }));

/* 14. Every stored key needs a DEFAULT of the right shape.

       load() compares a stored value against the shape of S[k], so a key
       in KEYS with no entry in S is discarded as corrupt on every single
       load. That is not cosmetic: a discarded key forces "remote wins",
       so the account silently takes the device — and the only sign is a
       toast saying some local data would not read.

       bottleSaid shipped like that and cost a sync before BZ's log
       caught it. */
{
  const km = src.match(/const KEYS = \[([\s\S]*?)\];/);
  const sm = src.match(/const S = \{([\s\S]*?)\n\};/);
  const keys = km ? [...km[1].matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1]) : [];
  const defaults = sm ? sm[1] : '';
  check('every stored key has a default in S',
    keys.filter(k => !new RegExp('\\b' + k + ':').test(defaults)));
}

console.log('\n  ' + (bad ? '\u2716 ' + bad + ' of ' + checks + ' checks found something'
  : '\u2713 all ' + checks + ' consistency checks pass'));
