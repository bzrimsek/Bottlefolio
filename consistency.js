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
/* RETAINED ON PURPOSE, with the reason written down.

   L.parseUpcListing read a pasted distributor price list into barcode
   pairings. Its screen went in v1.8.88 — BZ, of that sheet, "sorry but who
   would do this?" — and the function is kept rather than deleted because
   removing its assertions is what broke the harness four times in one
   afternoon: a section there sits inside a GROUP, so the closing brace
   belongs to the group and never to the section beside it.

   It comes out with its tests the next time that file is reorganised on
   purpose. Until then it is a few lines nobody calls, which is cheaper than
   another afternoon of that. */
const KEPT_UNWIRED = ['parseUpcListing'];
check('no L function is tested but never wired into the app',
  unwired.filter(fn => KEPT_UNWIRED.indexOf(fn) < 0));

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
/* To the closing bracket, not a fixed 700 characters. Comments inside the
   list pushed bottleSaid past the window and the check reported a synced
   key as unsynced — a check that reads a fixed slice of a file it does not
   control will eventually be wrong about it. */
const syncBlock = src.slice(src.indexOf('L.SYNC_KEYS'),
  src.indexOf('];', src.indexOf('L.SYNC_KEYS')));
/* Deliberately per-device: screen state, the sync bookkeeping itself, and
   the spend meter, which is a guard on THIS device rather than a fact
   about the account. */
const LOCAL_ON_PURPOSE = ['filters', 'fflt', 'shop', 'shopMode', 'shopDim',
  'lastList', 'updated', 'pushedAt', 'lookupTally', 'axisTurn', 'base',
  'lookupUrl', 'libLedgerAt', 'reelState', 'seenTips', 'installDismissed',
  /* 'log' was here and is not any more: BZ asked for one user and one
     log, so it follows the account and merges. */
  /* When THIS device last opened the shelf tools. Per-device on purpose:
     the dot is about what somebody sitting here has looked at, and a
     desktop clearing it should not clear the phone's. */
  'toolsSeen',
  'offerText', 'barSort', 'reels', 'held'];
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

/* 15. US spelling on screen.

       BZ: it better not use UK english. Screen literals only — the data
       keys stay as they are, because 'colour' is a field name on 325
       catalogue entries and renaming it would break every one of them.
       This checks the strings a person reads, not the strings the code
       looks things up by. */
{
  const BR = /colour|flavour|favourite|neighbour|behaviour|centre|litre|grey/i;
  const KEYS = new Set(["'colour'", "'flavour'", "'flavoured'", "'grey'",
                        "'centre'", "'litre'", "'favourite'"]);
  const lines = src.split('\n');
  const found = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) return;
    const quoted = l.match(/'(?:[^'\\\n]|\\.)*'/g) || [];
    quoted.forEach(q => {
      if (KEYS.has(q)) return;            // a data key, not prose
      if (BR.test(q)) found.push((i + 1) + ': ' + q.slice(0, 50));
    });
  });
  check('screen text uses US spelling', found);
}

/* 16. The gap list and the weights that score it must agree.

      L.GAP_WORTH sums to 100 and entryScore is 100 minus what is missing,
      so a gap added to L.LIBRARY_GAPS without a weight is FREE — it costs
      nothing and the score quietly stops meaning "nothing left to get".
      Adding `mash` as a fifth gap was one line, and it was one more line
      before the score was wrong in a way no screen would have shown.

      Same shape as check 5: two lists that have to be edited together, and
      nothing making anyone do it. */
{
  const gapsM = src.match(/L\.LIBRARY_GAPS = \[([^\]]*)\]/);
  const worthM = src.match(/L\.GAP_WORTH = \{([^}]*)\}/);
  const gaps = gapsM ? [...gapsM[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]) : [];
  const worth = {};
  if (worthM) {
    [...worthM[1].matchAll(/([a-z]+)\s*:\s*(\d+)/g)]
      .forEach(m => { worth[m[1]] = +m[2]; });
  }
  check('every library gap has a weight',
    gaps.filter(g => worth[g] === undefined));
  const sum = Object.keys(worth).reduce((a2, k) => a2 + worth[k], 0);
  check('the gap weights total 100',
    sum === 100 ? [] : ['they total ' + sum]);
  check('no weight is declared for a gap that does not exist',
    Object.keys(worth).filter(k => gaps.indexOf(k) < 0));
}

/* 19. An L function nobody asserts anything about.

      Check 3 catches a helper DEFINED and never used, and the unwired
      check catches one tested and never called. Neither catches the third
      case: wired into the app, doing real work, and no test over it. A
      full review on 2026-09-07 found three — labelSame, labelLabel and
      labelShow — shipped across nine versions with nothing asserting
      anything about them, so a change to any would have been caught by
      nothing at all. That is rule 27, broken three times in one day
      without a single check noticing.

      Not every L member deserves a test: a constant is a constant. So this
      looks only at FUNCTIONS, and only at ones the app actually calls. */
{
  const fns = (src.match(/^L\.([a-zA-Z_][a-zA-Z0-9_]*) = function/gm) || [])
    .map(m => m.match(/^L\.([a-zA-Z0-9_]+)/)[1]);
  const untested = fns.filter(fn => {
    const usedInApp = src.split('L.' + fn).length - 1 > 1;
    if (!usedInApp) return false;               // check 3 owns that case
    return tests.indexOf('L.' + fn) < 0;
  });

  /* A RATCHET, not a wall.

     This check found 21 on the day it was written, of which 8 were fixed
     immediately and 13 were older than any of today's work. Failing the
     gate on all 13 would block every delivery until somebody paid a debt
     they did not incur, and a check that stands between you and shipping
     gets switched off rather than satisfied.

     So the known 13 are allowed BY NAME and anything else fails. The list
     only ever shrinks: delete a name when you write its tests, and never
     add one. A new helper with no assertions over it stops the build, which
     is the rule (27) working from today forward rather than retroactively.

     Coverage was 95% of 407 when this was drawn. judgeListing and
     fitUnlocks are the two worth doing first: both score a bottle against
     the shelf, which is arithmetic somebody acts on. */
  const KNOWN_UNTESTED = ['searchText', 'judgeListing', 'fitUnlocks',
    'deviceLabel', 'stripMarkup', 'varInText', 'findUrl', 'lessonBlocker',
    'blindTheme', 'blindGiven', 'worldReach',
    'isHardGap', 'noteText', 'hasFlavour', 'flavourOptions', 'flavourFlight',
    'flightRunRecord', 'flightPoured'];
  check('no NEW L function is used by the app and asserted by nothing',
    untested.filter(fn => KNOWN_UNTESTED.indexOf(fn) < 0));
  /* And the list may not rot: a name here that HAS tests now is a name to
     delete, or the ratchet loosens without anybody noticing. */
  check('the allowed-untested list has no stale entries',
    KNOWN_UNTESTED.filter(fn => tests.indexOf('L.' + fn) >= 0));
}

/* 21. A control the help does not know about.

      App use is 69 entries describing what each screen does, and it drifted
      twice in one day: it still told people to press "Fill in the rest"
      after that button was removed, and it called the Out screen "Poured
      somewhere else" after it was renamed. Both were caught by reading,
      not by any check.

      This is the reverse of the label check (30c): not whether a control
      matches its documented name, but whether a control somebody added has
      any documentation at all. Named buttons only, because a chip or an
      icon is not something anybody looks up. */
{
  const CONTROLS = ['Read the label', 'Export everything', 'Export for import',
    'Photograph it', 'Fill what is missing', 'Import a collection',
    'Back up everything', 'Add to the shelf',
    /* Added with the Buddies tab, 2026-09-07. App use said "Settings, set a
       display name, turn on findable" for a whole version after both moved
       to a tab — a help page naming a place that no longer holds the thing
       is worse than one saying nothing. */
    'Let anyone find me by name', 'Invite a drinking buddy'];
  const ref = src.slice(src.indexOf('L.FEATURES = ['),
    src.indexOf('L.REFERENCE') > 0 ? src.indexOf('L.REFERENCE') : undefined);
  check('every named control is described in App use',
    CONTROLS.filter(c => src.indexOf("'" + c + "'") >= 0
      && ref.indexOf(c) < 0));

  /* And every TAB, since a tab is the coarsest control there is and one of
     them went undocumented for a version. Read off the nav rather than a
     list, so adding a ninth cannot quietly skip this. */
  {
    const nav = src.slice(src.indexOf('<nav>'), src.indexOf('</nav>'));
    const tabs = (nav.match(/>([A-Za-z]+)<\/button>/g) || [])
      .map(m => m.replace(/>|<\/button>/g, ''));
    check('every nav tab is described in App use',
      tabs.filter(t => ref.indexOf("term: '" + t + "'") < 0));
  }
}

/* 23. A card that offers options its own sentence does not mention.

      BZ: text and options do not match. The Out card said "Photograph the
      shelf, or the list" while offering three chips — the sentence predated
      A bottle being added and nobody revisited it — and it said LIST where
      the chip says MENU.

      Same shape as check 21, one screen over: prose describing controls,
      drifting from the controls. This one reads the option labels out of
      AWAY_SUBJECTS and asks whether the card's own sentence names each. */
{
  const subs = (src.match(/AWAY_SUBJECTS = \[([\s\S]*?)\];/) || [])[1] || '';
  const labels = (subs.match(/label: '([^']+)'/g) || [])
    .map(m => m.replace(/label: '|'/g, ''));
  const card = src.slice(src.indexOf("'What\\u2019s in front of me'"));
  const intro = card.slice(0, 900);
  check('the Out card names every option it offers',
    labels.filter(l => {
      /* "A bottle" in a list reads as "a bottle", so compare on the noun
         rather than the chip's exact capitalisation. */
      const noun = l.replace(/^An? /i, '').toLowerCase();
      return intro.toLowerCase().indexOf(noun) < 0;
    }));
}

/* 24. Two elements with the same id.

      A second <section id="scr-buddies"> survived from before Buddies was a
      tab, and nothing saw it: the suite cannot, the audit did not, and it
      took a browser walk complaining about a strict-mode violation. Invalid
      HTML, and worse than untidy — getElementById and url(#id) both take
      whichever came first, so half the code was addressing one element and
      half the other.

      Rule 19b says an id emitted more than once is a fault. This is the
      static half of it, one line and a second to run. */
{
  const ids = (src.match(/\sid="[^"]+"/g) || [])
    .map(m => m.replace(/\sid="|"/g, ''));
  const seen = {}, dupes = {};
  ids.forEach(i => { if (seen[i]) dupes[i] = 1; seen[i] = 1; });
  check('no id is declared twice in the document', Object.keys(dupes));
}

/* 25. A COLLECTION THAT SYNCS BY REPLACEMENT LOSES CHANGES.

      BZ found this the hard way twice in one morning. The wishlist refused
      a removal — it accepted it, and the account's copy replaced the local
      one wholesale and put it back. The house merge looped — it wrote the
      library and not the shelf, and the next publish undid it. One shape:
      a fact kept in two places and updated in one.

      A scalar is fine to replace: last writer wins is what you want for a
      display name. A COLLECTION is not, because replacing it silently
      discards whatever the other side did to it.

      So every synced key that holds a collection must either merge by
      record (LISTS) or merge as a map (SYNC_MERGE). Anything else has to be
      named here as a scalar on purpose, which is a sentence somebody has to
      write and therefore a decision somebody has to make. */
{
  const SCALARS = ['shelfCaps',
    'displayName', 'findable', 'fxRate', 'wishShared',
    'lookupUrl', 'admin', 'barSort', 'updated', 'pushedAt'];
  /* deleted is a MAP and is deliberately not here: it is a known gap,
     recorded in BACKLOG rather than waved through. It cannot take a plain
     union — a deletion undone on one device would be resurrected by the
     other — so it needs the tombstone treatment `wish` got, and that is a
     decision rather than a patch. */
  const KNOWN_GAP = ['deleted'];
  const keys = (src.match(/L\.SYNC_KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
  const merge = (src.match(/L\.SYNC_MERGE = \[([\s\S]*?)\];/) || [])[1] || '';
  const lists = (src.match(/const LISTS = \[([\s\S]*?)\];/) || [])[1] || '';
  const named = t => (t.match(/'([a-zA-Z]+)'/g) || []).map(x => x.replace(/'/g, ''));
  const covered = named(merge).concat(named(lists))
    .concat(SCALARS).concat(KNOWN_GAP);
  check('every synced collection merges rather than replaces',
    named(keys).filter(k => covered.indexOf(k) < 0));
}

/* 26. A CLAIM ABOUT YOUR SHELF IS COUNTED FROM YOUR SHELF.

      BZ, after the map drew eight countries for a one-bottle shelf: can
      you scan the whole of things for this owned versus catalogue issue.
      The scan ran every catalogue-walking function twice — once against
      the full catalogue holding one bottle, once against a catalogue of
      just that bottle — and seven answered differently. Three were
      user-facing claims reading everything the app knows: the gap advice,
      the import check, and what you have to publish.

      S.catalog is the MERGED catalogue: the shipped seed, the shared
      library everybody adds to, and your own bottles. Handing it to
      something that speaks about "your shelf" asks has anybody heard of
      this whisky when the question is do you have one.

      So these three take ownedCatalog(). Named rather than pattern-matched,
      because the fix is a call site and a call site cannot be spotted by
      shape — but a name in this list that stops being used gets caught by
      the check below it. */
{
  const OWNED_ONLY = ['pendingForLibrary', 'importAudit', 'shelfGaps'];
  const wrong = OWNED_ONLY.filter(fn => {
    const re = new RegExp('L\\.' + fn + '\\(\\s*S\\.catalog');
    return re.test(src);
  });
  check('no claim about your shelf is counted from the whole catalogue',
    wrong.map(f => f + ' is handed S.catalog'));
  /* And the filter itself has to still exist, or the line above passes by
     accident the day somebody renames it. */
  check('the owned-only filter exists',
    /function ownedCatalog\(\)/.test(src) ? [] : ['ownedCatalog is gone']);
}

console.log('\n  ' + (bad ? '\u2716 ' + bad + ' of ' + checks + ' checks found something'
  : '\u2713 all ' + checks + ' consistency checks pass'));
