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
/* EVERY NAMED SET OPENS WITH ITS OWN ARGUMENT.

   STORY_OPENERS was keyed by chip only, so a shelf called Islay Lifer -
   earned by smoke, a house and a region together - opened with "This is a
   smoke drinker's shelf", naming neither Islay nor the house. The headline
   argued one case and the paragraph started somewhere else, and nothing
   could see it because both halves were correct on their own. A set added
   without an opener now fails here rather than quietly borrowing its
   loudest chip's line. */
{
  const setsBlock = (src.match(/L\.PORTRAIT_SETS = \[([\s\S]*?)\n\];/) || [])[1] || '';
  const openBlock = (src.match(/L\.STORY_OPENERS = \{([\s\S]*?)\n\};/) || [])[1] || '';
  const titles = (setsBlock.match(/title: '((?:[^'\\]|\\.)*)'/g) || [])
    .map(x => x.replace(/title: '|'$/g, ''));
  const missing = titles.filter(t =>
    openBlock.indexOf("'" + t + "'") < 0);
  check('every portrait set opens with its own line',
    titles.length ? missing : ['no set titles found to check']);
}

/* A LABEL READ SPEAKS BEFORE IT CONTRIBUTES.

   BZ photographed a bottle, saw it filling, then nothing for forty-five
   seconds - and nothing was broken. The name was in hand the moment the
   read returned, and the screen was queued behind fbPublishToLibrary: a
   read of the shared library and a write to it, on a phone, before a word
   was said. Two of the four capture paths did it, and both had no catch,
   so a library that never answered meant no sign the read had worked at
   all.

   The rule is the shape rather than the instance: any path that publishes
   to the shared library must say something to the person FIRST, and must
   catch. Checked by position - the first toast has to come before the
   publish - because that is the thing that was wrong, and it is invisible
   to every other harness here. */
{
  const problems = [];
  ['awayReadBottle', 'shopReadBottle', 'readTheLabel', 'productForm']
    .forEach(fn => {
      const i = src.indexOf('function ' + fn + '(');
      if (i < 0) { problems.push(fn + ' is gone'); return; }
      /* BRACE-MATCHED, not "up to the next function". The first version
         sliced to the next `\nfunction `, which for a function near the end
         of the file swept in hundreds of lines of somebody else's code -
         and the check then failed on the FIXED version, reporting a
         renderShop() that belonged to another function entirely. A reader
         that does not know where its subject ends is measuring the wrong
         thing in both directions. */
      let d = 0, end = i, started = false;
      for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; started = true; }
        else if (src[j] === '}') { d--; if (started && d === 0) { end = j; break; } }
      }
      /* COMMENTS STRIPPED FIRST. These functions explain themselves at
         length and the explanation NAMES fbPublishToLibrary - so the check
         found the word in the prose above the code and concluded that
         everything below it, including the code that runs first, came
         after the write. It failed on the fixed version for the second
         time in five minutes. A source-reading check has to read code. */
      const body = src.slice(i, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const pub = body.indexOf('fbPublishToLibrary');
      if (pub < 0) return;                    // nothing to wait on
      /* NOT "is there a toast before it" - the first version asked that,
         and passed when the success toast was deleted, because these
         functions all open with an error toast for an unreadable label.
         A guard that cannot fail is not a guard, and this one was proved
         by breaking it.

         So it asks the thing that was actually wrong: none of the work
         that ANSWERS the person may sit after the publish call. If the
         box, the redraw or the scroll is downstream of a shared-library
         write, the person waits on the network to find out their
         photograph worked. */
      const after = body.slice(pub);
      ['renderShop()', 'scrollIntoView', "$('#shopQ').value"]
        .forEach(work => {
          if (after.indexOf(work) >= 0) {
            problems.push(fn + ' does ' + work
              + ' only after the library write');
          }
        });
      if (!/fbPublishToLibrary\([\s\S]{0,400}?\.catch\(/.test(body)) {
        problems.push(fn + ' publishes with no catch');
      }
    });
  check('a label read speaks before it contributes', problems);
}

/* EVERY FILTER IS DECLARED, OR THE BACK BUTTON GOES AGAIN.

   Three times the shelf lost its way back from a filtered list, and BZ
   said so three times - the last of them "we had that exact conversation
   yesterday". Every fix was to a line. The fault was that the filter
   STATE, the test for whether anything is on, and the function that clears
   them were three hand-kept lists, so a filter added to the state and
   forgotten in the other two put somebody in a list with no way out.

   They are one declaration now, L.FILTERS. This is what stops it drifting
   back: a key in the filter state that is neither declared as a filter nor
   named in L.NOT_FILTERS fails the build. Adding a filter is a line in
   L.FILTERS; adding something that is not one is a line in L.NOT_FILTERS;
   forgetting is not an option that ships. */
{
  const st = (src.match(/filters: \{([\s\S]*?)\},\n/) || [])[1] || '';
  const stateKeys = [...new Set((st.match(/([a-zA-Z]+):/g) || [])
    .map(x => x.replace(':', '')))];
  const dec = (src.match(/L\.FILTERS = \[([\s\S]*?)\n\];/) || [])[1] || '';
  const declared = (dec.match(/k: '([a-zA-Z]+)'/g) || [])
    .map(x => x.replace(/k: '|'/g, ''));
  const notFilters = ((src.match(/L\.NOT_FILTERS = \[([^\]]*)\]/) || [])[1] || '')
    .split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  const problems = [];
  if (!stateKeys.length) problems.push('the filter state could not be read');
  if (!declared.length) problems.push('L.FILTERS could not be read');
  stateKeys.forEach(k => {
    if (declared.indexOf(k) < 0 && notFilters.indexOf(k) < 0) {
      problems.push(k + ' is in the filter state and in neither L.FILTERS '
        + 'nor L.NOT_FILTERS');
    }
  });
  declared.forEach(k => {
    if (stateKeys.indexOf(k) < 0) {
      problems.push(k + ' is declared a filter and is not in the state');
    }
  });
  check('every filter is declared, so the back button cannot go again',
    problems);
}

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
  /* An inventory check in progress is this device's business - it is a
     walk round one house, and merging two of them would invent a check
     nobody did. The furniture itself is NOT here: it syncs, beside
     shelfCaps, because it describes one room read from two devices. */
  'shelfTicks',
  'lookupUrl', 'lookupMine', 'libLedgerAt', 'reelState', 'seenTips',
  'installDismissed',
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
/* To the CLOSING BRACKET, not a fixed number of characters. This read the
   first 900 characters of the declaration, so the list silently lost its
   last entries the moment a comment inside it grew - which is exactly what
   happened when lookupMine was added, and it reported the two keys that
   fell off the end as unsaved rather than reporting itself. A truncating
   reader fails by under-reporting, which is the worst way for a check to
   fail: green while blind. */
const keysBlock = src.slice(src.indexOf('const KEYS = ['),
  src.indexOf('];', src.indexOf('const KEYS = [')));
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
  /* EMPTY, AND IT STAYS EMPTY. Every L function the app uses is asserted
     by something as of v1.9.36 - the last thirteen went in together, the
     heaviest of them by building the small world each needed rather than
     by waving them through. The check below fails on a stale name, so an
     allowance cannot outlive its need; this one fails on a NEW untested
     function, so the coverage cannot slip back. A function added without a
     test now stops the gate, which is the ratchet finally closed rather
     than merely tightened. */
  const KNOWN_UNTESTED = [];
  /* THE RATCHET TIGHTENED at v1.9.35: worldReach, isHardGap, noteText,
     hasFlavour, stripMarkup, varInText and byAvailability came off, and
     they cannot go back on - the check below fails on a name that no
     longer needs its allowance, so this list can only shrink. What is left
     is the set that needs a whole flight or a whole lookup around it to
     mean anything, which is a session of its own rather than a line. */
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
    'Let anyone find me by name', 'Invite a drinking buddy',
    /* Added with bulk marking, v1.9.21. A control named in the app and not
       in here is one the check cannot see. */
    'Mark bottles open or sealed',
    /* Added with the storage model, v1.9.29. */
    'Arranging the shelf', 'Inventory to check off',
    /* v1.9.32 */
    'Not me', 'Removing a library entry',
    /* v1.9.40 */
    'Text the list, or text a link'];
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
    /* `storage` is a LIST by shape and a SETTING by meaning: one
       description of one room. A union merge would be actively wrong -
       describe two bookcases on the desktop and three on the phone and a
       union gives you five pieces of furniture that do not exist, then
       plans bottles onto them. So the newer description wins whole, the
       same rule shelfCaps has always had, and this sentence is the
       decision the check asks for rather than a way around it. */
    'storage',
    'displayName', 'findable', 'fxRate', 'wishShared',
    'lookupUrl', 'lookupMine', 'admin', 'barSort', 'updated', 'pushedAt'];
  /* `deleted` used to sit here as a known gap: it cannot take a plain
     union, because a deletion undone on one device would be resurrected by
     the other. It got the tombstone treatment `wish` already had at
     v1.9.30 - union both sides, then lift the deletions somebody actually
     took back, recorded under 'd:' - so it is declared in SYNC_MERGE now
     and this list is empty. Empty is the point: a gap named here is a
     sentence somebody wrote, and nobody should have to write another one
     without meaning it. */
  const KNOWN_GAP = [];
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
      the check below it.

      THIS IS NO LONGER THE MAIN GUARD, and on its own it never was one. It
      was written around the three offenders that one scan happened to
      find, which makes it a whitelist rather than a rule, and the
      twenty-five catalogue-walking functions written since were checked by
      nothing at all. §341 in killer-bs-test.js is the rule now: every
      function a call site hands S.catalog is RUN twice, once against the
      whole library and once against a three-bottle shelf, and the answers
      must match. This stays because it is free and catches a regression at
      these three call sites by text before the suite runs. */
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
