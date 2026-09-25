/* Hunting the KINDS of fault this app keeps producing.
 *
 * Almost every real bug found on 2026-09-04 was found by BZ looking at a
 * screen: an id that did not exist, a field parsed and then dropped, a
 * state key that never synced, a literal \u2014 in a string, a dead
 * function left behind. Every one of those is visible in the source
 * without running anything — the suite could not see them because it
 * tests behavior through L, and these live in the wiring.
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

/* A DEFINITION IS READ IN A LIST AND ASKED ON ITS OWN (BZ, 2026-09-20).
   "At least 51% wheat, new charred oak, the same proof limits" is clear
   under the bourbon entry and means nothing as a question, because the
   limits it refers to are on another line. An entry that leans on its
   neighbours cannot be asked, so it must not be written that way. */
check('no definition leans on the entry above it', (() => {
  const found = [];
  const DANGLE = /\bthe same (?:rules|proof limits|limits)\b|\bas (?:above|before)\b/i;
  /* The definitions are quoted strings on `def:` lines in the reference. */
  const re = /\bdef:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src))) {
    if (DANGLE.test(m[1])) {
      found.push('line ' + src.slice(0, m.index).split('\n').length + ': '
        + m[1].slice(0, 70) + '\u2026');
    }
  }
  return found;
})());

/* A CHIP IS A CONTROL; A LABEL IS A PILL (BZ, 2026-09-20). .chip carries
   min-height:40px so that a thumb can hit it, and a label wearing it spends
   that height for nothing - four of them cost 88px of a phone screen on
   Home, which is a tenth of the screen on four short words. Anything not
   pressable is .pill, which has no target size to keep. */
check('no label is dressed as a chip', (() => {
  const found = [];
  const re = /el\(\s*'(div|span|p|li)'\s*,\s*'([^']*\bchip\b[^']*)'/g;
  let m;
  while ((m = re.exec(src))) {
    found.push('line ' + src.slice(0, m.index).split('\n').length + ': a '
      + m[1] + " with class '" + m[2] + "' \u2014 a chip is a control, so "
      + 'use pill for a label');
  }
  return found;
})());

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
const codeOnly = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
/* THE ENGINE ITSELF, so the inventory check below reads the app's own
   declaration rather than a copy of it kept in this file. A contract
   restated in two places is the very fault these checks exist to find. */
const ENGINE = require('./engine.js')().L;

const tests = fs.readFileSync(__dirname + '/killer-bs-test.js', 'utf8');
/* THE NIGHTLY JOBS CALL THE ENGINE TOO. popular.js adds everybody's lists up
   with L.popularTotals, which the app never does - on purpose, because no
   device may read anybody else's list. A use there is a use. */
const JOBS = ['popular.js', 'refdata.js'].map(f => fs.existsSync(__dirname + '/' + f)
  ? fs.readFileSync(__dirname + '/' + f, 'utf8') : '').join('\n');
const dead = [], unwired = [];
defined.forEach(fn => {
  /* AGAINST THE CODE, NOT THE SOURCE. This counted mentions in `src`, so a
     function named in its own explanatory comment looked called — which is
     the same fault the plain-function check below already had fixed, three
     lines away, with the reason written out. L.isCleanup and L.pendingUpcs
     both hid here for as long as their comments existed. A checker that
     reads comments is checking the wrong file. */
  const inApp = codeOnly.split('L.' + fn).length - 1
    + JOBS.split('L.' + fn).length - 1;
  if (inApp > 1) return;
  (tests.indexOf('L.' + fn) >= 0 ? unwired : dead).push(fn);
});
check('no L function is defined and never used', dead);

/* 3b. And plain top-level functions, which the check above did not see.
       reviewLibraryFill was replaced by writeLibraryFill and sat there
       whole, 2,600 characters of it, because it is not an L function. */
/* COMMENTS STRIPPED FIRST, because they count as uses otherwise and this
   check has been blind to exactly that. fbContribute lost its caller,
   offered nothing to the library for however long, and this passed the
   whole time - the name appears in the changelog header inside index.html
   and in its own explanatory comment, so it looked called. Second time
   today a source-reading check has read prose as code; a checker that
   reads comments is checking the wrong file. */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const plainDead = (code.match(/^function (\w+)\(/gm) || [])
  .map(m => m.match(/^function (\w+)/)[1])
  .filter(fn => code.split(new RegExp('\\b' + fn + '\\b')).length - 1 <= 1)
  .filter(fn => code.indexOf("'" + fn + "'") < 0);   // not called by name
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

/* NO HELP ENTRY IS WRITTEN TWICE.

   Rule 9z says App use is updated with every build, and two builds running
   added an entry that was already there - `Scan the library for
   inconsistencies` and `Sharing check` were each in twice, same term and
   same source. It cost more than tidiness: an anchor that matches twice
   makes every later edit to that file fail its own uniqueness check, which
   is how the copy-diagnostics entry silently never landed at all in
   v2.0.16 while the button shipped.

   Term AND source together, because a word can honestly appear in two
   glossaries - Proof and Finish are both a reel face and a label - and
   only the same word in the same place is a duplicate. */
{
  const seen = {}, dup = [];
  const re = /\{ term: '((?:[^'\\]|\\.)*)', src: '([^']*)'/g;
  let m;
  while ((m = re.exec(src))) {
    const k = m[1] + ' \u2014 ' + (m[2] || 'no source');
    if (seen[k]) dup.push(k);
    seen[k] = 1;
  }
  check('no App use entry is written twice', dup);
}

/* NO CSS RULE FOR A CLASS NOTHING EMITS.

   Rule 6 says tidy dead code after every change, and twelve dead classes
   had accumulated by 2026-09-10 - two of them mine from the Buddies
   rebuild that week, the rest older. A removal takes the code that emits a
   class and leaves the rule styling it, and nothing notices, because a
   stylesheet with an extra rule works perfectly.

   `buddyrow` is allowed by name: the only mention left is a comment
   explaining why it went, which is the kind of note worth keeping. */
{
  const styleEnd = src.indexOf('</style>');
  const css = src.slice(0, styleEnd);
  const body = src.slice(styleEnd);
  const ALLOWED_DEAD = ['buddyrow'];
  /* URLs and @imports stripped first: a font link contains
     `.googleapis`, which is not a class and was reported as a dead one the
     first time this ran. A checker that cries wolf gets ignored. */
  const clean = css
    .replace(/url\([^)]*\)/g, '')
    .replace(/@import[^;]*;/g, '')
    .replace(/https?:\/\/[^\s"')]+/g, '');
  const classes = [...new Set((clean.match(/\.[a-z][a-z0-9-]{2,}/gi) || [])
    .map(c => c.slice(1)))];
  const dead = classes.filter(c =>
    ALLOWED_DEAD.indexOf(c) < 0
    && !new RegExp('\\b' + c + '\\b').test(body));
  check('no CSS rule styles a class nothing emits', dead);
}

/* NOBODY COUNTS A SHELF BY HAND.

   BZ, comparing Home with the admin list: 346 on my devices, 348 here - I
   call BS. He was right. fbPushStats sent (S.bottles||[]).length, the raw
   array including every bottle ever retired, while Home asks L.shelfStats,
   which filters to what you actually own. The two disagreed by exactly the
   number he had given away or finished - and this is the worst place for
   that pair to exist, because it is the number an admin reads about
   SOMEBODY ELSE'S shelf and has no way to check.

   So: anything that reports a shelf size asks L.shelfStats. Counting the
   array is how the second answer gets born. */
{
  const bad = [];
  /* NEGATED USES ARE A DIFFERENT QUESTION and are allowed: `!(S.bottles ||
     []).length` asks whether anything has ever been added, which is what
     decides the empty-shelf welcome, and a shelf whose bottles have all
     been retired should still see it. Two live uses read that way and
     flagging them would have made this a check somebody switches off
     rather than satisfies. What is banned is REPORTING that number. */
  /* REPORTED, not tested. The count appears half a dozen times as a
     question - is there anything on this shelf at all - which decides the
     empty-shelf welcome and the nothing-open card, and a shelf whose
     bottles have all been retired should still see both. Those are fine.
     What is banned is putting that number in a PAYLOAD as the size of
     somebody's shelf, which is what fbPushStats did and what BZ read in
     the admin list. Two attempts at a broader rule flagged four correct
     lines, and a check that flags correct code is one somebody switches
     off rather than satisfies. */
  const re = /\b[a-zA-Z]+:\s*\(S\.bottles \|\| \[\]\)\.length/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    bad.push('index.html:' + line + ' reports a shelf size from the raw array');
  }
  check('nothing reports a shelf size by counting the array', bad);
}

/* ONE PHRASE FOR ONE ACT.

   BZ asked for a check on consistent tense across the app. It found three
   buttons doing one job - recording a glass already drunk - reading "I
   poured this", "I had that" and "Poured it" on three different screens.
   Nothing was broken and nobody would have reported it; it just made the
   app sound like three people wrote it.

   The distinction worth keeping is between DOING and RECORDING: "Pour it"
   pours one now, "I drank this" logs one you have had. This fails if a
   fourth way of saying either turns up. */
{
  const noC = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const labels = [...new Set([...noC.matchAll(
    /el\('button',\s*'[^']*',\s*'((?:[^'\\]|\\.)+)'/g)].map(m => m[1]))];
  /* THE ACT, NOT THE PRONOUN. The first version matched anything starting
     with "I" and reported "I would rather not say" and "I bought it",
     neither of which records a pour - and a checker that cries wolf is one
     somebody switches off rather than satisfies. */
  const past = labels.filter(x => /\b(poured|drank|had a glass)\b/i.test(x));
  const odd = past.filter(x => x !== 'I drank this');
  check('one phrase for recording a glass already drunk', odd);
}

/* NO CONSTANT IS DECLARED AND NEVER READ.

   BZ asked for old comments to be tightened on 2026-09-10, and the longest
   comment block in the file turned out to be sixty lines of reasoning for
   the shelf arrangement feature he had removed thirty builds earlier - with
   L.STORAGE_KINDS, L.STORAGE_LABEL and L.SCAR_RANK still sitting under it,
   each referenced exactly once, by its own declaration.

   The existing checks could not see it. One looks for L FUNCTIONS never
   called and these are objects and arrays; the linter cares that a name
   resolves, not that anybody wants it. A removal that takes the functions
   and leaves the data leaves exactly this shape behind, and the comment
   above it is the part that misleads: it reads as live reasoning. */
{
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  const dead = [];
  const re = /^L\.([A-Z][A-Z0-9_]{2,})\s*=/gm;
  let m;
  while ((m = re.exec(code))) {
    const n = m[1];
    const uses = (code.match(new RegExp('L\\.' + n + '\\b', 'g')) || []).length;
    /* A NAME THIS CHECKER READS OUT OF THE SOURCE IS NOT DEAD.
       L.NOT_FILTERS exists so the filter check can tell "not a filter"
       from "somebody forgot", and it is read here rather than by the app -
       so the first version of this reported the checker's own contract as
       rot. A checker that flags correct code gets switched off. */
    const readHere = require('fs')
      .readFileSync(__filename, 'utf8').indexOf('L.' + n) >= 0;
    /* AND SOME ARE READ BY NAME AS A STRING. L.REF_GROUPS carries
       { data: 'TASTING' } and the reference screen does L[g.data], so
       L.TASTING is read every time somebody opens Learn - and looking for
       `L.TASTING` finds nothing. Three false-positive classes now: read by
       this checker, read dynamically, and read by a harness. The rule for
       this check is that it reports; it does not drive a deletion on its
       own. */
    const namedAsString = new RegExp("'" + n + "'").test(code);
    /* AND SOME ARE READ ONLY BY A HARNESS, which is a legitimate reader:
       L.LOOKUP_MISS_LIMIT is asserted three times in the suite and used
       nowhere else, and a constant the tests pin is not rot. Fourth and
       last false-positive class. */
    let inTests = false;
    try {
      inTests = require('fs')
        .readFileSync(__dirname + '/killer-bs-test.js', 'utf8')
        .indexOf('L.' + n) >= 0;
    } catch (e) { /* no suite beside us, nothing to learn */ }
    if (uses <= 1 && !readHere && !namedAsString && !inTests) {
      dead.push('L.' + n + ' is declared and never read');
    }
  }
  check('no constant is declared and never read', dead);
}

/* TWO DOORS TO ONE ANSWER.

   BZ, after the consistency scan missed this: how did you miss the library
   consistency issue when I asked you to look for consistent things? Fair.
   I scanned for ten pairs I had written down by hand, so the one I had not
   thought of could not be found - a scan that confirms suspicions rather
   than one that looks. And the miss was a bad one: L.libraryAudit LITERALLY
   CALLS L.importAudit on its first line, adds four checks to the result,
   and both were being called from screens. The shelf got five checks and
   the library got nine, for no reason anybody chose.

   The shape, stated so a machine can find it: A returns what B returned,
   and the app calls BOTH. Then there are two ways to ask one question and
   they can drift - which is rule 30d, written after L.mashbill and
   L.mashShape did exactly this.

   THE NARROWING MATTERS. "A calls B" finds 251 pairs, nearly all of them
   helpers - L.shopNorm is called by ninety functions and is nobody's
   second opinion. Requiring B's answer to BECOME A's answer finds 23, and
   with tonight's bug put back, 24. A check that flags 251 correct pairs is
   one somebody switches off.

   A RATCHET, not a wall: the 23 here today are allowed by name, and
   anything new fails the build. Most are legitimate - a wrapper that
   relabels or clamps - but they are listed rather than reasoned about,
   because the point is to catch the NEXT one. */
const TWO_DOORS_OK = [
  /* A CALLER, NOT A SECOND ANSWER. A whisky nobody owns is asked about the
     same way as one on the shelf - L.bottleAsk measures it - and
     L.prospectAsk only hands it the prospect's context and marks the ask as
     one. A second way of measuring a bottle against the shelf would still
     fail this check. */
  'prospectAsk>bottleAsk',
  /* A CALLER, NOT A SECOND ANSWER. The flights line says where the whole
     programme stands - what is pourable tonight, what waits on one bottle -
     by asking L.flightReady about each flight, which stays the single door
     for whether a flight can be poured. The cards ask it directly for one
     flight; this asks it for all of them and writes a sentence. */
  'flightsLine>flightReady',
  /* A CALLER, NOT A SECOND ANSWER. L.roomNotes asks L.pourable whether a
     bottle both shelves own is open on both — so it QUOTES the single
     door rather than deciding openness itself. Named specifically, so a
     second way of deciding pourable would still fail this check. */
  'roomNotes>pourable',
  /* A CALLER, NOT A SECOND ANSWER. An empty reply that carries a service
     error IS a failure, so lookupEmptySay hands that case to
     lookupFailSay rather than wording it again. Named specifically, so a
     second way of phrasing a failure would still fail this check. */
  'lookupEmptySay>lookupFailSay',
  /* ONE SOURCE, TWO READERS. The audit names the release a bottle's name
     implies, and the suggestion offers to set it - both by asking
     L.guessScar, which is the single door. Rule 30d is about two
     functions DECIDING one fact from different evidence; these decide
     nothing, they quote. If a second way of reading a release ever
     appears, that is the thing to catch, and this entry does not hide
     it: it names guessScar specifically. */
  /* libraryAudit no longer reads guessScar itself: the five per-row
     findings it shared with the intake are L.rowFaults now, and that is
     the only caller. The suggestion still quotes the same single door. */
  'rowFaults>guessScar',
  /* THE ADVICE IS THE FIX, READ ALOUD. auditSuggestion used to work out the
     release and the proof-in-the-name itself, beside auditFix doing the same
     to offer its button - two readings of one finding. It now asks the fix
     and says what the button would do. Named specifically, so a sentence
     that works a finding out on its own again is still caught. */
  'auditSuggestion>auditFix',
  /* CALLERS THAT NARROW A DOOR. alreadyNamed asks libKeysNamed which keys
     hold a name and hands back the first entry; offerSig asks contribSig to
     sign an offer with its bookkeeping taken off. Neither decides the thing
     its door decides. */
  'alreadyNamed>libKeysNamed', 'offerSig>contribSig',
  /* A CALLER, NOT A SECOND ANSWER - and it did not use to be either. The
     body of libKeysNamed was COPIED into resolveLibKey eleven lines below
     it, which this check could not see: it finds duplicated call graphs,
     not duplicated expressions. Asking instead of copying is what turned
     it into a pair anybody can review, and naming libKeysNamed here leaves
     the check able to catch a genuinely second way of finding an entry by
     name. */
  'resolveLibKey>libKeysNamed',
  /* DIFFERENT QUESTIONS, one wrapping the other. L.fillSnap answers
     "what notch is this number", which the slider asks of a raw drag
     position. L.fillOf answers "what is this BOTTLE's level", which
     includes deciding that an unset one is full, and it asks fillSnap to
     finish the job. A screen calling both is a screen doing two things,
     not two answers to one question. */
  'fillOf>fillSnap',
  'ownedCount>myBottles', 'pourGlasses>reelMatches', 'viewFor>clampView',
  'zoomAbout>clampView', 'shopIsNewBottle>shopNorm',
  'parseDelimited>parseCSV', 'placeLine>titleCase', 'recap>lookupDaysSince',
  'awayPour>logEntry', 'contribSig>syncSig', 'axisLabel>titleCase',
  'addPour>relabel', 'removePour>relabel', 'movePour>relabel',
  'sortByProof>relabel', 'mashOf>mashByLaw', 'readFailSays>isNetworkFail',
  'shelfTodo>enhanceQueue',
  /* The two note queues ask one builder now; pourable is its to ask. */
  'lookupQueue>pourable', 'typedName>tidyName', 'suggestName>cleanName',
  'lookupAllowed>lookupTally',
  /* THE SAME QUESTION, ASKED AGAIN WITH MORE TO GO ON - which is the whole
     point of it. L.intakeSettle does not judge an offer; it takes what the
     search came back with, puts it on the row, and hands the row to
     L.intakeVerdict, which is the single door. A second way of deciding an
     offer's fate is exactly what this check should still catch, and naming
     intakeVerdict specifically leaves it able to. */
  'intakeSettle>intakeVerdict',
  /* And the budget asks the day's allowance how much of it is left, the
     same way lookupAllowed asks lookupTally above. */
  'intakeBudgetLeft>lookupTally', 'intakeBudgetLeft>intakeSpent',
  'countIntake>intakeSpent',
  /* resolveLibKey ASKS libKey and then checks the answer against the
     library, which is the point of it: a key worked out from a name can
     point at a node that is not there, and a delete against a node that is
     not there succeeds silently. The check is right that one calls the
     other; they do not answer the same question. Caught by the check added
     the same night, on its author, which is the best sort of proof. */
  'resolveLibKey>libKey'
];
{
  const cut = src.indexOf('STATE + RENDER');
  const engineSrc = src.slice(0, cut).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const appSrc = src.slice(cut).replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  const bodies = {};
  const fre = /^L\.([a-z][A-Za-z0-9]*)\s*=\s*function[\s\S]*?\n};/gm;
  let fm; while ((fm = fre.exec(engineSrc))) bodies[fm[1]] = fm[0];
  const fns = Object.keys(bodies);
  const inApp = n =>
    (appSrc.match(new RegExp('L\\.' + n + '\\(', 'g')) || []).length;
  const twin = [];
  fns.forEach(a2 => fns.forEach(b2 => {
    if (a2 === b2) return;
    const body = bodies[a2];
    if (body.indexOf('L.' + b2 + '(') < 0) return;
    if (!inApp(a2) || !inApp(b2)) return;
    const direct = new RegExp('return\\s+L\\.' + b2 + '\\(').test(body);
    let flows = false;
    const asg = new RegExp('(?:const|let|var)\\s+(\\w+)\\s*=\\s*L\\.'
      + b2 + '\\(', 'g');
    let am; while ((am = asg.exec(body))) {
      if (new RegExp('return\\s+' + am[1] + '\\b').test(body)) flows = true;
    }
    if (!direct && !flows) return;
    const pair = a2 + '>' + b2;
    if (TWO_DOORS_OK.indexOf(pair) >= 0) return;
    twin.push('L.' + a2 + ' returns what L.' + b2 + ' returned, and the '
      + 'screens call both \u2014 two ways to ask one question');
  }));
  check('no two functions answer one question for the screens', twin);

  /* And the allowed list cannot rot: a pair that no longer exists must
     come off it, or the list quietly stops meaning anything. */
  const stale = TWO_DOORS_OK.filter(p2 => {
    const ab = p2.split('>');
    return !bodies[ab[0]] || bodies[ab[0]].indexOf('L.' + ab[1] + '(') < 0;
  }).map(p2 => p2 + ' is allowed and no longer happens');
  check('the two-doors allowance has no stale entries', stale);
}

/* NO RULE IS WRITTEN OUT TWICE.

   The check above finds one function CALLING another and handing back its
   answer. It cannot see one function COPYING another - the same predicate
   typed out again - because there is no call to find. That is how four
   second answers were added to this file in one day with every check green,
   and how twenty-one engine functions came to spell out "these two names
   are one bottle" for themselves (BZ, 2026-09-16: "More different things
   doing the same thing. Rules were not followed very well").

   HOW. Every engine function is reduced to its shape: comments gone,
   strings and numbers made alike, every local name made alike, and the
   iterators that ask "is there one" (some, find, filter) made alike. Only
   the L. calls keep their names, because those are the part that makes two
   lines the SAME rule rather than similar code. A run of COPY_WINDOW tokens
   that appears in two functions, and holds at least one L. call and one
   comparison, is a rule written twice.

   Proven red before trusting it: on its first run it found sixteen groups,
   all of them real but one. */
const SCREEN_COPY_WINDOW = 14;
const SCREEN_COPIES_OK = [
  /* CALLERS OF ONE DOOR, each asking it the same question and branching on
     the answer. None of these decides the thing itself. */
  // Two different engine questions (L.tastingForGuest, L.readShelfQuestion)
  // that both take the shelf and give up on no answer. Shape, not a rule.
  'fbReadTastings + renderShopAsk',
  // A run stops at the day's limit without spending: the check, not a copy
  // of spendLookups, which is the only place that counts.
  'contribFillFirst + libraryFillRun', 'libraryFillRun + spendLookups',
  // Both sync paths and the push ask L.resetSide which side replaced a list.
  'fbLoadAfterWipeCheck + fbOnRemote + fbPush',
  // Three screens ask L.flavourOptions of the shelf and draw if it answers.
  'flightBuilder + renderShelfCharts', 'flightBuilder + renderShelfCharts + showLessons',
  'flightBuilder + showLessons', 'renderCandidateList + showLessons',
  // Three presses refuse with the one no-service sentence.
  'labelCapture + libraryFillStart + pickShelfPhotos',
  // The service answers, and L.parseLookup reads it.
  'productForm + shopAnswer',
  // What the shelf and the wishlist say about a bottle, asked of the engine.
  'readShelf + renderAway', 'renderAway + renderShopQuestion',
  // A name looked up in this device's catalog first.
  'renderAway + shopAnswer',
  // The shelf counts, asked once each.
  'renderShelf + renderShelfFilters'
];

const COPY_WINDOW = 12;
const COPIES_OK = [
  /* ONE DOOR, THREE DIFFERENT QUESTIONS. What a pour is (pourKind) decides
     how each of these answers - whether it can be poured, what to call it,
     what proof to place it at. They quote the door; none decides the
     kind. */
  'pourAvailable + pourLabel + pourProof'
];
/* THE SHAPE OF CODE, for finding the same rule written twice. Comments
   gone, strings and numbers made alike, local names made alike, the "is
   there one" iterators made alike - and the names that make two lines the
   SAME rule kept: engine calls, and the app's state roots. Shared by both
   copy checks below, so the checks are not themselves written twice. */
function copyGroups(text, fnRe, width, counts) {
  const KEY = new Set(['if', 'return', 'const', 'let', 'function', 'true',
    'false', 'null', 'undefined', 'typeof', 'new', 'else', 'for', 'of', 'in',
    'Object', 'String', 'Number', 'Math', 'Array', 'JSON', 'await', 'async']);
  const shape = body => {
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    const re = /L\.[A-Za-z0-9_]+|\.[A-Za-z_][A-Za-z0-9_]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\d+(?:\.\d+)?|[A-Za-z_$][A-Za-z0-9_$]*|===|!==|=>|&&|\|\||[<>]=?|[-+*/%!=?:;,(){}\[\]]/g;
    const out = [];
    let tk;
    while ((tk = re.exec(code))) {
      let x = tk[0];
      if (/^['"`]/.test(x)) x = 'S';
      else if (/^\d/.test(x)) x = 'N';
      else if (/^L\./.test(x)) { /* an engine call keeps its name */ }
      else if (/^(S|LIB|FB|firebase)$/.test(x)) { /* so does app state */ }
      else if (/^[A-Za-z_$]/.test(x) && !KEY.has(x)) x = 'id';
      if (x === '.some' || x === '.find' || x === '.filter') x = '.ITER';
      out.push(x);
    }
    return out;
  };
  const where = {};
  let fm;
  fnRe.lastIndex = 0;
  while ((fm = fnRe.exec(text))) {
    const tk = shape(fm[2]);
    for (let i = 0; i + width <= tk.length; i++) {
      const w = tk.slice(i, i + width);
      if (!counts(w)) continue;
      (where[w.join(' ')] = where[w.join(' ')] || new Set()).add(fm[1]);
    }
  }
  const groups = {};
  Object.keys(where).forEach(k => {
    const names = [...where[k]].sort();
    if (names.length < 2) return;
    const g = names.join(' + ');
    if (!groups[g]) groups[g] = k;
  });
  return groups;
}

{
  const cut = src.indexOf('STATE + RENDER');
  const engineGroups = copyGroups(src.slice(0, cut),
    /^L\.([A-Za-z0-9_]+)\s*=\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\n\};/gm,
    COPY_WINDOW,
    w => w.some(x => x.indexOf('L.') === 0)
      && w.some(x => x === '===' || x === '!==' || x === '<' || x === '>'));
  const copies = Object.keys(engineGroups).sort()
    .filter(g => COPIES_OK.indexOf(g) < 0)
    .map(g => g + ' write out one rule twice: ' + engineGroups[g].slice(0, 90));
  check('no rule is written out twice in the engine', copies);
  const staleCopies = COPIES_OK.filter(g => !engineGroups[g])
    .map(g => g + ' is allowed and no longer happens');
  check('the copies allowance has no stale entries', staleCopies);

  /* AND THE SCREENS, which is where most of today's copies were. BZ,
     2026-09-16: "Are you confident that all duplicate/similar functions have
     been consolidated?" Not while half the file went unscanned. The screens
     are mostly layout - "append a line with this text" is the same shape in
     three hundred places and means nothing - so a window only counts when it
     DECIDES something (a comparison or an if), reads the engine or the app's
     state at least twice, and is not DOM furniture. On its first run that
     found twenty-two groups: the lookup limit checked seven ways with four
     wordings, the no-service sentence seven ways, a publish path that
     silently failed for everybody but an admin, a scan fix that never
     reached other devices from one of its two screens. What is allowed
     below are callers of one engine function, which is a door being used,
     not a rule being copied. */
  const DOM = ['.appendChild', '.textContent', '.className', '.style',
    '.querySelector', '.querySelectorAll', '.onclick', '.dataset',
    '.marginTop', '.disabled', '.innerHTML', '.type', '.placeholder',
    '.value'];
  const screenGroups = copyGroups(
    src.slice(cut, src.lastIndexOf('</script>')),
    /^(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/gm,
    SCREEN_COPY_WINDOW,
    w => {
      const decides = w.some(x =>
        ['===', '!==', '<', '>', '<=', '>=', 'if'].indexOf(x) >= 0);
      const dom = w.filter(x => DOM.indexOf(x) >= 0).length;
      const reads = w.filter(x => x.indexOf('L.') === 0).length
        + w.filter((x, j) => (x === 'S' || x === 'LIB')
          && /^\./.test(w[j + 1] || '')).length;
      return decides && dom <= 1 && reads >= 2;
    });
  const screenCopies = Object.keys(screenGroups).sort()
    .filter(g => SCREEN_COPIES_OK.indexOf(g) < 0)
    .map(g => g + ' decide one thing the same way twice: '
      + screenGroups[g].slice(0, 90));
  check('no rule is written out twice in the screens', screenCopies);
  const staleScreen = SCREEN_COPIES_OK.filter(g => !screenGroups[g])
    .map(g => g + ' is allowed and no longer happens');
  check('the screen copies allowance has no stale entries', staleScreen);
}

/* NO BUTTON IS DISABLED BY DATA THE SCREEN HAS NOT FETCHED.

   BZ: the inconsistency scan button does not seem to do anything. Then, an
   hour later: why can't I export the library? Same fault, twice, and I
   fixed the first and walked past its neighbour sitting four lines away.

   Both read `!libCount` at RENDER time, and libCount comes from
   LIB.products, which is empty until somebody has opened the library. So
   on a fresh open both buttons were dead - and looked live, because this
   stylesheet had one :disabled rule in it and that was for .glass.

   A button that can fetch its own data has no business refusing to. */
{
  const dead = [];
  /* COMMENTS STRIPPED FIRST. The first version of this check fired on the
     clean file, because the comments ABOVE both fixes quote the line they
     replaced - so it reported the explanation as the offence. Third time
     tonight a source check has read prose as code, and the same one-line
     lesson every time. */
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, m2 =>
    m2.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, ' ');
  const re = /(\w+)\.disabled\s*=\s*!(\w*[Ll]ib\w*)/g;
  let dm;
  while ((dm = re.exec(codeOnly))) {
    const line = codeOnly.slice(0, dm.index).split('\n').length;
    dead.push('index.html:' + line + '  ' + dm[1]
      + ' is disabled by ' + dm[2] + ', which is empty until the library '
      + 'has been read');
  }
  check('no button is disabled by data the screen has not fetched', dead);
}

/* ONE HOUSE TEST, NOT FOUR.

   BZ's bottle screen said "This is your only bottle from Angel's Envy"
   above "Pour it against Angel's Envy Bourbon Madeira Cask Finish. Same
   house, same strength." He owns many. A label read had stored ANGELS
   ENVY beside Angel's Envy, and FOUR functions were asking whether two
   whiskies come from the same house - one through L.houseSame and three
   by comparing raw strings.

   It was found and fixed once, in bottleContext, and the other three were
   walked past. The worst of them fed the SERVICE, which wrote a true
   sentence from false facts and stored it, so the prose stayed wrong
   after the shelf changed.

   Rule 30d: two functions must not answer one question from different
   evidence. Nothing in the suite could see it - each was correct on its
   own - so it is a text check, which would have caught it in a second. */
{
  const raw = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, m2 =>
    m2.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, ' ');
  /* ANY comparison of a distillery, not just dist against dist. The
     first version of this matched only `x.dist === y.dist` and passed
     while five more sites compared a distillery to a plain value -
     `p.dist === d`, `x.dist === h.value` - which is the same fault
     wearing different clothes. */
  const re = /\.dist\s*===\s*[^;)\n]+/g;
  let dm;
  while ((dm = re.exec(code))) {
    const line = code.slice(0, dm.index).split('\n').length;
    raw.push('index.html:' + line + '  ' + dm[0]
      + ' \u2014 use L.houseSame, or ANGELS ENVY and Angel\'s Envy are '
      + 'two houses');
  }
  check('one house test, not four', raw);
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
  /* What the offered-library queue has spent vetting today. Per device for
     exactly the reason lookupTally is (BZ: "I think we need to keep the
     allowances separate") - it is drawn from that same per-device
     allowance, so a shared count would be an allowance with two meanings.
     The BUDGET it stops at is a preference and does sync. */
  'intakeTally',
  'lookupUrl', 'lookupMine', 'libLedgerAt', 'reelState', 'seenTips',
  'installDismissed',
  /* 'log' was here and is not any more: BZ asked for one user and one
     log, so it follows the account and merges. */
  /* When THIS device last opened the shelf tools. Per-device on purpose:
     the dot is about what somebody sitting here has looked at, and a
     desktop clearing it should not clear the phone's. */
  'toolsSeen',
  'offerText', 'barSort', 'reels', 'held',
  /* Which account-wide replacements THIS device has applied (L.resetSide).
     Synced, it would tell every device it had applied what only one had. */
  'resetSeen'];
check('every stored key is synced or marked local on purpose',
  stateKeys.filter(k => syncBlock.indexOf("'" + k + "'") < 0
    && LOCAL_ON_PURPOSE.indexOf(k) < 0));

/* 6. Anything L.SYNC_MERGE declares must actually be in L.SYNC_KEYS, or
      the declaration is a comment. libLedger sat like that for weeks. */
/* To the CLOSING BRACKET, the way the merge check further down reads it.
   This took the first 500 characters, and the declaration passed 1,300 once
   its comments grew: the seven keys from 'tastingsSeen' on were never
   looked at, and the check stayed green - the fault check 7 below
   describes, a truncating reader under-reporting. A declaration it cannot
   find fails, rather than passing with nothing to compare. */
const mergeBlock = (src.match(/L\.SYNC_MERGE = \[([\s\S]*?)\];/) || [])[1];
const mergeKeys = ((mergeBlock || '').match(/'([a-zA-Z]+)'/g) || [])
  .map(m => m.replace(/'/g, ''));
check('every mergeable key is actually synced',
  mergeBlock === undefined ? ['L.SYNC_MERGE = [ ... ]; is not in index.html']
    : mergeKeys.filter(k => syncBlock.indexOf("'" + k + "'") < 0));

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
       catalog entries and renaming it would break every one of them.
       This checks the strings a person reads, not the strings the code
       looks things up by. */
{
  /* EIGHT WORDS LET TWENTY-NINE THROUGH. BZ asked for a scan for any
     non-US English on 2026-09-10 and it found spelled, judgment, catalog
     and traveling all over the screen text - none of which this knew to
     look for. A check is only as good as its list, and a short list reads
     as a passing check rather than as an unasked question. */
  /* THE LIST ITSELF MUST STAY BRITISH. The US-spelling pass of 2026-09-10
     Americanised this array, so the checker started hunting for `judgment`
     and `color` and flagging every correct word on the screen. A checker
     that contains the thing it forbids is the one file a blanket
     find-and-replace must never touch. */
  const BR = new RegExp('\\b(' + [
    'colour', 'flavour', 'favourite', 'neighbour', 'honour', 'labour',
    'behaviour', 'harbour', 'rumour', 'organise[dr]?', 'recognise[d]?',
    'realise[d]?', 'apologise', 'summarise', 'analyse[d]?', 'catalogue',
    'dialogue', 'grey', 'travelling', 'travelled', 'cancelled', 'labelled',
    'modelling', 'centre', 'metre', 'litre', 'theatre', 'defence',
    'licence', 'whilst', 'amongst', 'learnt', 'spelt', 'burnt', 'storey',
    'jewellery', 'programme', 'sceptical', 'ageing', 'judgement',
    'acknowledgement', 'fulfil', 'instalment', 'enrol', 'maximise',
    'minimise', 'prioritise', 'customise', 'specialise'
  ].join('|') + ')\\b', 'i');
  /* DATA KEYS AND SOMEBODY ELSE'S STRINGS. `color` is a field name on 325
     catalog entries and renaming it orphans every tasting note; the
     Firebase error codes are not ours to spell. */
  /* A BRAND SPELLS ITSELF. Grey Goose is a name, not prose, and neither
     is it ours to Americanise - the same way the Firebase error codes
     below are not. The bare 'grey' was already allowed; the brand needed
     saying separately because the check matches whole strings. */
  const KEYS = new Set(["'colour'", "'flavour'", "'flavoured'", "'grey'",
                        "'grey goose'",
                        /* The pigment is called burnt umber in American
                           English too, the same as burnt sienna. */
                        "'burnt umber'",
                        "'centre'", "'litre'", "'favourite'",
                        "'auth/cancelled-popup-request'"]);
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

  /* AND THE LIST IS STILL THE BRITISH ONE. A blanket US-spelling pass
     Americanised this very array on 2026-09-10, so the check began hunting
     for `judgment` and `color` and flagged every correct word on the
     screen. A file that contains the thing it forbids is the one a
     find-and-replace must never touch, and nothing was watching. */
  check('the spelling list is still spelt the way it hunts',
    ['colour', 'behaviour', 'catalogue', 'judgement', 'centre']
      .filter(w => BR.source.indexOf(w) < 0)
      .map(w => w + ' has gone from the list it is meant to catch'));
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
  const CONTROLS = ['Photograph the label', 'Export everything', 'Export for import',
    'Photograph it', 'Fill what is missing', 'Import a collection',
    'Back up everything', 'Add to the shelf',
    /* Added with the portrait veto's way back, 2026-09-13. */
    'Put aside',
    /* Added with the drinks budget, 2026-09-13. */
    'Running a tasting',
    /* Added with the service build check, 2026-09-14. */
    'Check the service',
    /* Added with the tunable read ceiling, 2026-09-14. */
    'Shelf photo read limit',
    /* Added with the shelf question, 2026-09-15. */
    'Ask your shelf',
    /* Added with the Buddies tab, 2026-09-07. App use said "Settings, set a
       display name, turn on findable" for a whole version after both moved
       to a tab — a help page naming a place that no longer holds the thing
       is worse than one saying nothing. */
    'Let anyone find me by name', 'Invite a buddy',
    /* Added with bulk marking, v1.9.21. A control named in the app and not
       in here is one the check cannot see. */
    'Mark bottles open or sealed',
        /* v1.9.32 */
    'Not me', 'Removing a library entry',
    /* v2.0.9 */
    'Scan the library for inconsistencies',
    /* v1.9.40 */
    'Text the list, or text a link', 'Diagnostics by user',
    'With a guest', 'Whiskey only', 'The library', 'Add to wishlist',
  'How much is left', 'Another one?', 'Gone', 'Photograph fill levels',
  'Add to wishlist',
  'With a guest',
    /* v2.0.9 */
    'Scan the library for inconsistencies', 'Whose shelf counts',
    'Their shelf'];
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

    /* AND THE OTHER WAY ROUND. BZ: app use says 8 tabs, I count 7 - map
       is removed. Both true. The check above only ever asked whether a
       real tab was documented; nothing asked whether a documented tab was
       still real, so Map sat in the help for however long after the
       screen went, and the section still called them eight.

       A help page describing a screen that does not exist is worse than
       one saying nothing, which is rule 9z in BZ's own words. */
    /* THE TAB SECTION ONLY. The first version ran to the next `{ section:`
       and there is not one, so it swallowed the glossary and reported
       Color, Nose and Palate as tabs. A boundary that is not really a
       boundary is how a check invents work. */
    /* THE TAB SECTION, BOUNDED BY THE NEXT ONE. There IS a next section -
       "Shop, which is three screens" - and two versions of this check
       walked past it: the first searched for ' { section:' with a leading
       space that is not always there, the second started the search 14
       characters in, which is inside the heading it had just found. Both
       ran on into the glossary and reported Color, Nose and Palate as
       tabs. A boundary that is not a boundary is how a check invents
       work, and a check that cries wolf gets switched off. */
    const secRe = /section: 'The \w+ tabs'/.exec(src);
    const sec = secRe ? secRe.index : -1;
    const secEnd = sec > 0 ? src.indexOf('section:', sec + 30) : -1;
    const tabSec = sec > 0 && secEnd > sec ? src.slice(sec, secEnd) : '';
    /* IT MUST NOT PASS BY FINDING NOTHING. The first version anchored on
       the literal "The seven tabs", so renaming the heading to eight made
       the slice empty and the check below passed on an empty list - proved
       by putting a dead Map tab back and watching it stay green. A check
       that goes quiet when its anchor moves is worse than no check, so a
       missing section is now itself the failure. */
    check('the tab section in App use can be found',
      tabSec ? [] : ['no "The <n> tabs" section in App use']);
    const described = (tabSec.match(/\{ term: '([A-Za-z ]+)'/g) || [])
      .map(m => m.replace(/\{ term: '|'/g, ''))
      .filter(t => t !== 'Getting started');
    check('no tab is described that the nav does not have',
      described.filter(t => tabs.indexOf(t) < 0));

    /* And the number in the heading is the number of tabs. A count
       written in prose is a fact that goes stale silently. */
    const WORDS = { five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
    const said = /section: 'The (\w+) tabs'/.exec(src);
    check('the tab count in App use matches the nav',
      said && WORDS[said[1]] !== tabs.length
        ? ['App use says ' + said[1] + ' tabs; the nav has ' + tabs.length]
        : []);
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
  /* `shelfCaps` and `storage` stood here. The shelf arrangement feature
     they belonged to was removed whole at v2.0.14 - BZ: too many
     variables - so there is nothing left for either to describe. */
  /* SETTINGS, not collections: one value that the newer side simply wins.
     `shelfCaps` and `storage` stood here too and went with the shelf
     arrangement feature at v2.0.14 - BZ: too many variables. */
  const SCALARS = ['displayName', 'findable', 'wishShared', 'fxRate',
    /* showFill is a switch, not a collection: whether the fill gauge is
       drawn. The newer side wins, which is right - somebody turning it on
       at the shelf on their phone means it on, everywhere. */
    'showFill',
    /* How many lookups the offered-library queue may spend vetting on its
       own. One number somebody chose, not a collection to merge. */
    'intakeBudget',
    /* Whether this person's shelf counts toward what's popular. */
    'popularOn',
    /* Whether a sealed bottle may be poured for a guest: one answer, so
       the newer one wins like every other switch. */
    'guestSealed',
    /* The Google Sheet copy of the shelf: a switch, and its address. */
    'sheetOn', 'sheetUrl',
    /* The Lately paragraph and the recap's, whole: the newer one is kept. */
    'lately', 'recaps', 'quiz'];
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
      you scan the whole of things for this owned versus catalog issue.
      The scan ran every catalog-walking function twice — once against
      the full catalog holding one bottle, once against a catalog of
      just that bottle — and seven answered differently. Three were
      user-facing claims reading everything the app knows: the gap advice,
      the import check, and what you have to publish.

      S.catalog is the MERGED catalog: the shipped seed, the shared
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
      twenty-five catalog-walking functions written since were checked by
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
  check('no claim about your shelf is counted from the whole catalog',
    wrong.map(f => f + ' is handed S.catalog'));
  /* And the filter itself has to still exist, or the line above passes by
     accident the day somebody renames it. */
  check('the owned-only filter exists',
    /function ownedCatalog\(\)/.test(src) ? [] : ['ownedCatalog is gone']);
}

/* NO ENGINE FUNCTION IS DEFINED TWICE.

   Today L.noteMiss was defined a second time, for something completely
   different, and the second silently replaced the first. Nothing caught
   it: lint sees two valid assignments, and it only surfaced because a
   test written months ago for the ORIGINAL function started failing with
   "cannot read properties of undefined".

   Two functions with one name is rule 30d in its crudest form, and it is
   a one-line check that would have said so instantly. */
{
  const defs = (src.match(/^L\.([A-Za-z0-9_]+) = function/gm) || [])
    .map(m => m.replace(/^L\.| = function$/g, ''));
  const seen = {}, twice = [];
  defs.forEach(n => {
    if (seen[n] && twice.indexOf(n) < 0) twice.push(n);
    seen[n] = 1;
  });
  check('no engine function is defined twice',
    twice.map(n => 'L.' + n + ' is assigned more than once'));
}

/* EVERY FINDING'S ITEMS CARRY A KEY.

   BZ: any places that should have actions that do not? The `sizename`
   finding pushed bare STRINGS as its items while every other finding
   pushes {key, text} - so its rows could not identify the entry, which
   is why it was the one finding you could neither fix nor dismiss. A row
   without a key is a row that cannot do anything, and nothing said so. */
{
  const pushes = src.match(/items: [a-zA-Z]+\.map\(p => p\.name\)/g) || [];
  check('no finding lists bare names instead of keyed items',
    pushes.map(x => x + ' — items need { key, text }'));
}

/* A LOST ANSWER NEVER COUNTS AS A MISSING MODE. Apps Script redirects to a
   single-use URL, and a 404 there with a Google page in the body means the
   script RAN and its answer was lost coming back - which says nothing about
   whether the mode exists. Counted, two of them switch the mode off until
   reload, so a flaky phone takes away a feature that works (2026-09-24).
   Every place that tells the memory about a 404 must ask first. */
{
  const calls = src.match(/rememberMiss\(/g) || [];
  const guarded = src.match(/!\w+\.lostAnswer\)\s*rememberMiss\(/g) || [];
  check('a lost answer is never counted as a missing mode',
    calls.length && guarded.length === calls.length - 1 ? []
      : [guarded.length + ' of ' + (calls.length - 1) + ' rememberMiss calls '
         + 'ask L.lostAnswer first \u2014 an unguarded one switches a working '
         + 'mode off when a redirect is lost']);
}

/* HOW LONG A LOOKUP WAITS IS A NAMED THING. Four call sites typed 30000
   and askLookup defaulted to it, while L.LOOKUP_MS said 45000 - so the
   label fill and the library intake asked the same question with less
   patience than the screens, and a buddy's label fill gave up at 30s on an
   answer the service takes longer than that to give 4% of the time
   (2026-09-22). A literal is invisible to the copy checks, which compare
   the shapes of functions. */
{
  const bare = (src.match(/askLookup\([^)]*?,\s*\d{3,}/g) || [])
    .map(m => m.replace(/\s+/g, ' ').slice(0, 60));
  check('no lookup is given a bare number of milliseconds',
    bare.map(b => b + ' \u2014 name it, like L.LOOKUP_MS and '
      + 'L.INTAKE_LOOKUP_MS'));
  /* And the unattended one stays the shorter of the two, or its name is a
     lie about why it exists. */
  const ms = n => Number((src.match(new RegExp('L\\.' + n + ' = (\\d+)')) || [])[1]);
  check('the unattended lookup waits less than a person does',
    ms('INTAKE_LOOKUP_MS') && ms('LOOKUP_MS')
      && ms('INTAKE_LOOKUP_MS') < ms('LOOKUP_MS') ? []
      : ['L.INTAKE_LOOKUP_MS is ' + ms('INTAKE_LOOKUP_MS') + ' against '
         + 'L.LOOKUP_MS ' + ms('LOOKUP_MS')]);
}

/* EVERY SEALED FILE IS UNSEALED BY THE GATE. push.py seals BZ's shelf
   files and sends only the .gpg; the workflow decrypts them by name into a
   shell loop. Add one to push.py and not to the loop - which is what
   happened to bz-custom.json on 2026-09-20 - and the build passes here and
   dies in the cloud on a missing file. */
{
  const push = fs.existsSync('push.py') ? fs.readFileSync('push.py', 'utf8') : '';
  const yml = fs.existsSync('.github/workflows/gate.yml')
    ? fs.readFileSync('.github/workflows/gate.yml', 'utf8') : '';
  const sealed = ((push.match(/SHELF = \[([\s\S]*?)\]/) || [])[1] || '')
    .match(/'([^']+\.json)'/g) || [];
  const names = sealed.map(x => x.replace(/'/g, ''));
  check('every sealed shelf file is unsealed by the gate',
    names.length ? names.filter(n => yml.indexOf(n) < 0)
      .map(n => n + ' is sealed by push.py but the workflow never '
        + 'decrypts it') : ['push.py declares no shelf files at all']);
}

/* ONE NOTICE. It appears in Settings, at the foot of both printed papers
   and in LICENSE, and every one of them asks L.COPYRIGHT - because the
   year moves, and a notice typed out four times moves in one of them. */
{
  const m = src.match(/L\.COPYRIGHT = '([^']+)'/);
  check('the copyright notice exists once, in the engine',
    m ? [] : ['L.COPYRIGHT is gone \u2014 the papers and Settings ask it '
      + 'by name and would print nothing']);
  if (m) {
    const notice = m[1].replace('\\u00a9', '\u00a9');
    /* A second hand-typed copy anywhere in the app. */
    const typed = (src.match(/All rights reserved/g) || []).length;
    check('nothing spells the notice out for itself',
      typed > 1 ? [typed + ' copies of the notice in index.html \u2014 ask '
        + 'L.COPYRIGHT instead, so the year only has to move once'] : []);
    const lic = fs.existsSync('LICENSE')
      ? fs.readFileSync('LICENSE', 'utf8').split('\n')[0].trim() : null;
    check('LICENSE opens with the same notice the app shows',
      lic === notice ? []
        : ['LICENSE says ' + JSON.stringify(lic) + ', the app says '
           + JSON.stringify(notice)]);
  }
}

/* TWO RATCHETS, NOT TWO WALLS.

   BZ: what other hygiene checks can we run? These two found real debt -
   129 hard-coded hex colours and 2 !important - and both are too large to
   clear in one go. Rule 28a is explicit about what to do: allow the known
   offenders by NUMBER, fail anything new, so the debt can only shrink.

   A check that stands between somebody and shipping gets switched off
   rather than satisfied; a check that says "you added one more" gets
   fixed in the same minute. */
{
  /* EXCEPT the colour scale, whose colours ARE the content: they are what
     whisky looks like, printed beside the Color box on the room's sheet,
     and a CSS variable would be wrong for every one of them. Cut the table
     out before counting, so the allowance below still covers everything
     else at the number it always did. */
  const scale = src.match(/L\.COLOUR_SCALE = \[[\s\S]*?\n\];/);
  check('the colour scale is one table the counter can find',
    scale ? [] : ['L.COLOUR_SCALE is not where the hex ratchet looks for it '
      + '\u2014 its colours would be counted as theme debt']);
  const counted = scale ? src.replace(scale[0], '') : src;
  const hexes = (counted.match(/#[0-9A-Fa-f]{6}\b/g) || []).length;
  const HEX_TODAY = 129;
  /* And the excluded block holds colours and nothing else. */
  check('nothing hides inside the colour scale',
    scale && /(function|=>|document\.|S\.)/.test(scale[0])
      ? ['L.COLOUR_SCALE carries code, not just colours \u2014 the hex '
         + 'ratchet skips this block, so anything in it goes unchecked']
      : []);
  check('no new hard-coded colour outside the theme',
    hexes > HEX_TODAY
      ? [hexes + ' hard-coded hex colours, was ' + HEX_TODAY
         + ' — use a CSS variable so a theme change reaches it']
      : []);
  /* And the allowance cannot rot: if the debt is paid down, the number
     comes with it, or the ratchet stops ratcheting. */
  check('the colour allowance is not stale',
    hexes < HEX_TODAY - 5
      ? ['only ' + hexes + ' hard-coded colours now — lower HEX_TODAY '
         + 'to ' + hexes + ' so the ratchet keeps holding']
      : []);

  const bangs = (src.match(/!important/g) || []).length;
  /* THREE, not two: my first baseline counted LINES containing
     !important while the check counts occurrences, and one line carries
     two. A ratchet set from the wrong measurement fires on day one. */
  const BANG_TODAY = 3;
  check('no new !important',
    bangs > BANG_TODAY
      ? [bangs + ' uses of !important, was ' + BANG_TODAY
         + ' — a rule that cannot be overridden is a rule nobody can fix']
      : []);
}

/* EVERY MODAL HAS A WAY OUT. Sixty-three of them build their own body,
   and one without a close is a screen somebody is stuck on. */
{
  const opens = src.match(/openModal\([^,]{0,70}, (?:m|box|sheet) => \{/g)
    || [];
  const trapped = [];
  opens.forEach(o => {
    const at = src.indexOf(o);
    let d = 1, i = at + o.length;
    while (i < src.length && d > 0) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') d--;
      i++;
    }
    if (src.slice(at, i).indexOf('closeModal') < 0) {
      trapped.push(o.slice(11, 50) + ' has no way out');
    }
  });
  check('every modal can be closed', trapped);
}

/* EVERY WRITE THAT CREATES A LIBRARY ENTRY ASKS THE ONE GUARD.
 *
 * BZ, at the publish modal: "Worried that Penelope becomes a dupe." He was
 * right. Consolidating two entries DELETES the losing key, so every path
 * that asks "is this in the library" gets `no` for a key somebody buried on
 * purpose. The contributions path was taught to read the graves months ago
 * and three other paths were not, so the shelf kept offering the losing
 * side back and publishing it recreated it.
 *
 * L.libraryAccepts is the one question. This check says every path that
 * CREATES an entry asks it — a field update does not (the entry already
 * exists and nobody is resurrecting anything), and a delete obviously does
 * not.
 *
 * A RATCHET, not a wall: the one deliberate exception is named, and a new
 * unguarded creation fails. The companion check stops the exception list
 * from rotting.
 */
{
  const lines = src.split('\n');
  /* An admin's Undo restores the exact entry the admin just removed, in
     the same write that lifts the tombstone. That is a deliberate act by
     the only person who can do it, and guarding it would make undo
     impossible. Named, so it is a decision rather than an oversight. */
  const ALLOWED_UNGUARDED = ['lifts the tombstone'];
  const creations = [], unguarded = [];
  lines.forEach((l, i) => {
    if (!/catalog\/products\/'/.test(l)) return;
    if (/\+ '\/'/.test(l)) return;                         // field update
    if (/\/(style|dist|tn|tnSrc|name)'/.test(l)) return;   // named field
    if (/\]\s*=\s*null|:\s*null/.test(l)) return;          // a delete
    /* A READ IS NOT A CREATION. `ref.child('catalog/products/' + key)
       .once('value')` matched, once the guard it feeds sat five lines below
       it rather than one (2026-09-16). */
    if (/\.(once|on)\(\s*'value'/.test(l)) return;
    creations.push(i + 1);
    // The guard is asked within the same block of work, not a file away.
    const near = lines.slice(Math.max(0, i - 30), i + 4).join('\n');
    if (near.indexOf('libraryAccepts') >= 0) return;
    if (ALLOWED_UNGUARDED.some(a => near.indexOf(a) >= 0)) return;
    unguarded.push('index.html:' + (i + 1) + '  ' + l.trim().slice(0, 58)
      + '  — creates a library entry without asking L.libraryAccepts');
  });
  check('every write that creates a library entry asks the guard', unguarded);

  /* And the guard is only worth asking if it is TOLD about the merges.
     Passing three arguments leaves `graves` undefined, which reads as "no
     merges have ever happened" and is exactly the bug. */
  const calls = src.match(/L\.libraryAccepts\([^;]*?\);/g) || [];
  const blind = calls
    .filter(c => c.split(',').length < 4)
    .map(c => c.replace(/\s+/g, ' ').slice(0, 66) + '  — no graves argument');
  check('and every call tells it about the merges', blind);

  /* The allowance cannot rot. If the creation sites drop, the exception
     may already be gone with them. */
  const CREATIONS_TODAY = 5;
  check('the library-write allowance is not stale',
    creations.length < CREATIONS_TODAY
      ? ['only ' + creations.length + ' library creation sites now, was '
         + CREATIONS_TODAY + ' — lower CREATIONS_TODAY and re-check whether '
         + 'ALLOWED_UNGUARDED still names anything real']
      : []);
}

/* EVERY RUNG THE LADDER DECLARES IS PINNED BY AN ASSERTION, AND THE
 * CLASSIFIER IS DRIVEN WITH ITS SEED FIELDS MISSING.
 *
 * BZ, at the guest ladder seeded with a bottle that is not in the catalog:
 * why show Jack family in next door when clearly house. Because the seed
 * was typed in and came back with a name and no distillery, and the house
 * branch is guarded on the field being present on BOTH sides — so the
 * missing field did not fail, it fell through to a weaker answer. That is
 * the shape worth guarding, not the bottle: a classifier that downgrades
 * quietly when an optional input is absent.
 *
 * Two ratchets. A rung nobody asserts can be wrong for as long as nobody
 * looks, and the absent-seed cases are the ones that were missing when
 * this shipped, so the suite has to keep carrying them.
 */
{
  const ladderBlock = src.slice(src.indexOf('L.LADDER = ['),
    src.indexOf('L.LADDER = [') + 900);
  const rungs = [...new Set((ladderBlock.match(/\{ id: '([a-z]+)'/g) || [])
    .map(m => m.split("'")[1]))];
  const suite = fs.readFileSync(__dirname + '/killer-bs-test.js', 'utf8');
  check('every rung the ladder declares is pinned by an assertion',
    rungs.filter(r => suite.indexOf("'" + r + "'") < 0)
      .map(r => 'rung ' + r + ' is declared and no assertion expects it'));

  /* The classifier must still be driven with the seed fields absent. Named
     by the expected value rather than by the wording of the assertion, so
     a rewrite of the test prose does not break the gate (rule 30c). */
  const drivesEmpty = /L\.rungOf\(\s*\{\s*\}/.test(suite)
    && /L\.rungOf\(\s*\{\s*name:[^}]*\}\s*,/.test(suite);
  check('the rung classifier is still driven with its seed fields missing',
    drivesEmpty ? []
      : ['nothing calls L.rungOf with an empty seed and a name-only seed '
         + '\u2014 that pair is what caught a dist-less seed calling its '
         + 'own house "different maker"']);
}

/* AND THE INVENTORY ITSELF IS CHECKED.
 *
 * A declaration nobody validates rots into decoration. An action naming a
 * function that no longer exists enforces nothing and says it passed; an
 * `allow` entry for a screen that was deleted is a hole left open for a
 * reason that expired. Both fail silently and look green, which is the
 * exact shape of the problem the inventory was written to end.
 */
{
  const bad = [];
  const acts = ENGINE.ACTIONS || [];
  if (!acts.length) bad.push('the inventory is empty');
  acts.forEach(act => {
    if (!act.id) bad.push('an action with no name');
    (act.through || []).concat(act.pressed || [], act.inner || []).forEach(fn => {
      /* The function it names has to be real, and has to be DEFINED here
         rather than merely mentioned. */
      const def = new RegExp('(?:function |L\\.)' + fn + '\\s*[=(]');
      if (!def.test(codeOnly)) {
        bad.push('"' + act.id + '" routes through ' + fn
          + ', which is not defined anywhere');
      }
    });
    if (!(act.through || []).length) {
      bad.push('"' + act.id + '" names no shared function, so it enforces '
        + 'nothing');
    }
    Object.keys(act.allow || {}).forEach(who => {
      if (!act.allow[who] || act.allow[who].length < 12) {
        bad.push('"' + act.id + '" allows ' + who + ' with no reason given');
      }
    });
  });
  /* NO TWO ACTIONS SHARE A NAME, or one silently replaces the other. */
  const ids = acts.map(a => a.id);
  if (new Set(ids).size !== ids.length) {
    bad.push('two actions share a name');
  }
  check('the action inventory names real functions and gives its reasons',
    bad);
}

/* THE RETIRED ADDRESS.
 *
 * The repo was renamed from Bottle-Tracker to Bottlefolio, and GitHub Pages
 * does not follow a rename: https://bzrimsek.github.io/Bottle-Tracker/
 * answers 404. On 2026-09-15 two places still named it - the iPhone
 * sign-in help, which sent people to a dead page, and SHELF_URL in Code.gs,
 * which four enrichment jobs fetch their catalog from. Nothing caught
 * either, because nothing here read a URL. Now the app and every service
 * file are read for it.
 */
{
  const dead = 'github.io/Bottle-Tracker';
  const where = [];
  if (src.indexOf(dead) >= 0) where.push('index.html');
  ['Code.gs', 'lookup.gs', 'shelf.gs', 'label.gs', 'recap.gs'].forEach(f => {
    const p = __dirname + '/' + f;
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8').indexOf(dead) >= 0) {
      where.push(f);
    }
  });
  check('nothing points at the retired Bottle-Tracker address', where);
}

/* THE ACTION INVENTORY.
 *
 * BZ: why, after so many builds, so many tests and so many scans, did we
 * just find this now — literally the same stuff, 3x, done 3 ways.
 *
 * Because nothing here ever asked "is this the same as that?". Every check
 * anchors to a stated promise, and nobody had stated that three screens
 * photograph a bottle the same way. L.ACTIONS states it. This enforces it.
 *
 * For each declared action: find every site performing it, and fail any
 * that does not go through the one shared function. Sites that
 * legitimately differ are named in the action's `allow` WITH THE REASON,
 * so the exceptions are a short readable list rather than a silence.
 */
{
  const lines = codeOnly.split('\n');
  const srcLines = src.split('\n');
  const realLine = txt => {
    const t = txt.trim();
    const at = srcLines.findIndex(x => x.trim() === t);
    return at >= 0 ? (at + 1) : '?';
  };
  /* The enclosing function of a line, which is how a site is named. */
  const owner = i => {
    for (let j = i; j >= 0; j--) {
      const m = lines[j].match(/^(?:async )?function ([a-zA-Z0-9_]+)/);
      if (m) return m[1];
    }
    return '(top level)';
  };

  const bad = [];
  (ENGINE.ACTIONS || []).forEach(act => {
    const through = act.through[0];
    const rx = new RegExp('\\b' + through + '\\(');
    lines.forEach((l, i) => {
      if (!rx.test(l)) return;
      if (/^(?:async )?function /.test(l)) return;      // the definition
      const who = owner(i);
      /* A site named in `allow` is a deliberate exception and its reason
         is on record. */
      if (Object.keys(act.allow || {}).some(k =>
        who.toLowerCase().indexOf(k.split(' ')[0].toLowerCase()) >= 0)) return;
      const near = lines.slice(Math.max(0, i - 16), i + 40).join('\n');
      /* Only the ones a person pressed: a site that reports to a message
         element or a button is one somebody is waiting on. */
      const isPressed = /lookMsg|say\(|buttonWorking/.test(near);
      (act.pressed || []).forEach(need => {
        if (!isPressed) return;
        if (near.indexOf(need) >= 0) return;
        bad.push('index.html:' + realLine(l) + '  ' + who + ' performs "'
          + act.id + '" without ' + need);
      });
    });
  });
  check('every screen performs an action the one declared way', bad);
}

/* AND NOTHING GOES ROUND THE DOOR.
 *
 * The check above looks at the sites that USE an action's door. It never
 * saw a site that skipped it - which is exactly what NEXT-THREE #2 found on
 * v2.4.4: the offer reader said what the shelf thinks of a bottle in its
 * own words while the shop and the bar went through fitTwoWays. An action
 * that names `inner`, the answer living behind its door, makes a direct
 * call to that answer from anywhere but the door a failure - unless the
 * site is named in `allow`, with its reason.
 */
{
  const lines = codeOnly.split('\n');
  const srcLines = src.split('\n');
  const realLine = txt => {
    const tt = txt.trim();
    const at = srcLines.findIndex(x => x.trim() === tt);
    return at >= 0 ? (at + 1) : '?';
  };
  /* The enclosing function, whether declared plainly or on L. */
  const owner = i => {
    for (let j = i; j >= 0; j--) {
      const m = lines[j].match(/^(?:async )?function ([A-Za-z0-9_]+)/)
        || lines[j].match(/^L\.([A-Za-z0-9_]+)\s*=\s*function/);
      if (m) return m[1];
    }
    return '(top level)';
  };
  const bad = [];
  (ENGINE.ACTIONS || []).forEach(act => {
    (act.inner || []).forEach(fn => {
      const rx = new RegExp('\\bL\\.' + fn + '\\(');
      lines.forEach((l, i) => {
        if (!rx.test(l)) return;
        const who = owner(i);
        if ((act.through || []).indexOf(who) >= 0) return;
        if (Object.keys(act.allow || {}).indexOf(who) >= 0) return;
        bad.push('index.html:' + realLine(l) + '  ' + who + ' calls ' + fn
          + ' directly - "' + act.id + '" goes through ' + act.through[0]);
      });
    });
  });
  check('nothing answers a declared action by going round its door', bad);
}

/* EVERY LOOKUP BUTTON BEHAVES THE SAME.
 *
 * BZ: the bottle lookup for shop and taste are very different — and then,
 * on what he wanted instead: I'd prefer the look ups to operate the same
 * from a user pov even if one brings back or need more data. They had
 * drifted in three ways at once. One grew a filling bottle on its button
 * and the other still put a note at the far end of a row. One printed the
 * raw exception on screen, internals and all. And an answer with no bottle
 * in it was "nothing known yet, add it by name" on one and a red failure
 * on the other, for the same event.
 *
 * Whether a screen needs a proof to accept the answer is internal. What a
 * person sees is not, so the three user-facing pieces are shared and this
 * fails when a lookup handler stops using one of them.
 */
{
  /* REAL LINE NUMBERS. codeOnly has the comments stripped out, so its line
     numbers are not the file's — reporting them sent me to publishBatch
     looking for a lookup. The scan still runs on the stripped code, and
     the number is found by locating the line in the real source. */
  const lines = codeOnly.split('\n');
  const srcLines = src.split('\n');
  const realLine = txt => {
    const t = txt.trim();
    const at = srcLines.findIndex(x => x.trim() === t);
    return at >= 0 ? (at + 1) : '?';
  };
  const bad = [];
  lines.forEach((l, i) => {
    if (!/await askLookup\(/.test(l)) return;
    /* The handlers a person presses: the ones that report to a message
       element. A background fill has nobody watching it. */
    const near = lines.slice(Math.max(0, i - 14), i + 40).join('\n');
    if (!/lookMsg|say\(/.test(near)) return;
    if (!/buttonWorking\(/.test(near)) {
      bad.push('index.html:' + realLine(l) + '  a lookup a person presses '
        + 'with no progress on its control');
    }
    if (!/lookupFailSay/.test(near)) {
      bad.push('index.html:' + realLine(l) + '  a lookup that reports its '
        + 'failure in its own words rather than the shared sentence');
    }
  });
  check('every lookup a person presses behaves the same', bad);
}

/* EVERY SERVICE CALL GOES THROUGH THE ONE DOOR.
 *
 * BZ: check everywhere for this same shape. postWithRetry carries the
 * timeout, the 404 retry, the wake lock and the service queue. askService
 * used a raw fetch because it asks with its question in the URL rather
 * than in a body — so it alone had none of the four, which is why a shelf
 * upload recovered from a 404 and a lookup gave up on the identical one.
 * The door takes a GET now.
 *
 * A raw fetch of a LOCAL file is not this: map.json, data.json and a blob
 * URL are not the service and have nothing to retry.
 */
{
  const lines = codeOnly.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (!/\bfetch\(/.test(l)) return;
    const near = lines.slice(Math.max(0, i - 3), i + 3).join('\n');
    if (/postWithRetry/.test(near)) return;        // the door itself
    if (/'\.\/|"\.\//.test(l)) return;              // a file beside the app
    if (/blob|dataURL|createObjectURL/.test(near)) return;
    if (/lookupUrl|S\.lookupUrl|script\.google/.test(near)) {
      bad.push('index.html:' + (i + 1) + '  ' + l.trim().slice(0, 50)
        + '  \u2014 the service reached without the retry, the wake lock '
        + 'or the queue');
    }
  });
  check('every service call goes through the one door', bad);
}

/* NO LOOKUP IS GIVEN LESS TIME THAN THE SERVICE TAKES.
 *
 * BZ typed Yellowstone and was told the lookup timed out — at twelve
 * seconds. Every button in the app that looks a bottle up had a ceiling
 * below the service's floor: three at 15000 and one at 12000, against a
 * log where the real lookups answered at 18.1, 24.1, 49.7, 67.3, 82.7 and
 * 86.9 seconds and not one came back under 15. A timeout beneath the
 * ordinary answering time cannot protect anybody — it only guarantees the
 * slow answers are discarded, and the slow ones are the searches that had
 * work to do.
 *
 * The version check is the deliberate exception: it asks for a string the
 * deployment already holds and answered in 0.8 to 8.3 seconds every time.
 */
{
  const rx = /(askService|askLookup)\(([^;]{0,140}?)(\d{4,6})\s*[,)]/g;
  const mean = [];
  let m;
  while ((m = rx.exec(codeOnly)) !== null) {
    const ms = Number(m[3]);
    if (ms >= 20000) continue;
    mean.push('a lookup given only ' + ms + 'ms \u2014 this service answers '
      + 'in 18 to 87 seconds, so the ceiling is under the floor');
  }
  check('no lookup is given less time than the service takes', mean);
}

/* A SERVICE ERROR IS LOGGED WITH ITS EVIDENCE.
 *
 * BZ photographed a two-page menu and got nothing. The log said "shelf
 * read: bad json from the model" and no more — while the service had
 * already sent back the unreadable text as `raw`, which the app threw
 * away. The one fact that identifies a truncation is that the text STOPS
 * rather than being wrong at the start, so the discarded part was the
 * whole diagnosis.
 *
 * Handlers that read .error must log something alongside it. Costs
 * nothing, and turns a six-round guess into a one-round read.
 */
{
  const lines = codeOnly.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (!/appLog\(/.test(l)) return;
    if (!/\.error\b/.test(l)) return;
    const near = lines.slice(i, i + 4).join('\n');
    /* EVIDENCE BEYOND THE VERDICT. The first version of this excused any
       handler whose window contained the word `raw` — which every one of
       them does, because the verdict is `raw.error`. Every handler
       excused itself and the check was green against the bug it was
       written for. It wants the BODY: raw.raw, a tail, a slice, a
       stringify. */
    if (/raw\.raw|\btail\b|slice\(|JSON\.stringify/.test(near)) return;
    bad.push('index.html:' + (i + 1) + '  ' + l.trim().slice(0, 52)
      + '  \u2014 logs the verdict and drops what the service sent with it');
  });
  check('a service error is logged with what came back', bad);
}

/* NOTHING RELOADS THE PAGE TO "BE SURE".
 *
 * BZ: if I click Check for An Update, it actually goes back a version.
 * reg.update() resolves when the new sw.js has been FETCHED, not when the
 * worker built from it has installed, so reg.waiting was still null and
 * the code concluded there was no update and reloaded anyway. That reload
 * is served by the OLD worker out of the OLD cache — a freshly uploaded
 * build replaced by the one before it.
 *
 * A reload is never a way to find something out. It serves what the cache
 * already holds, so at best it changes nothing and at worst it undoes an
 * install that was still in flight. The only legitimate reload is the one
 * controllerchange fires after a NEW worker has taken over.
 */
{
  /* AGAINST THE CODE, NOT THE PROSE. The first version of this allowed a
     reload whose neighbourhood mentioned controllerchange — and the
     comment explaining the fix says that word, so restoring the bug left
     the check green. Twice in one day a checker has read comments and
     believed them. */
  const lines = codeOnly.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (!/location\.reload\(/.test(l)) return;
    const near = lines.slice(Math.max(0, i - 14), i + 3).join('\n');
    /* The two reloads that are the point: a new worker taking over, and a
       deliberate cache wipe somebody confirmed. */
    if (/controllerchange|_swReloading|clean reload|confirmDelete/.test(near)) return;
    bad.push('index.html:' + (i + 1) + '  ' + l.trim().slice(0, 46)
      + '  \u2014 a reload serves the cache, so it can only repeat or undo');
  });
  check('nothing reloads the page hoping to find a newer build', bad);
}

/* EVERY SERVICE ANSWER IS READ THROUGH readService.
 *
 * BZ pressed Check the service on a deployment he had just pasted and was
 * told it was too old to answer. Wrong, and mine: postWithRetry resolves
 * to the fetch RESPONSE, so reading a field straight off it is always
 * undefined — and the check reported every deployment, correct or not, as
 * stale. A false accusation about somebody's deployment is worse than no
 * check, because it sends them to redeploy something already right.
 *
 * The unit tests covered the verdict and the verdict was never the broken
 * part. This is the wiring, which is what the suite cannot see: a
 * postWithRetry whose result is used without readService between them.
 */
{
  const lines = src.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (!/=\s*await postWithRetry\(|postWithRetry\(/.test(l)) return;
    const name = (l.match(/(?:const|let)\s+([a-zA-Z0-9_]+)\s*=\s*await postWithRetry/) || [])[1];
    if (!name) return;                       // a .then chain, checked below
    const near = lines.slice(i, i + 12).join('\n');
    if (near.indexOf('readService(' + name) >= 0) return;
    bad.push('index.html:' + (i + 1) + '  ' + l.trim().slice(0, 52)
      + '  \u2014 the response is used without readService, so every field '
      + 'read off it is undefined');
  });
  check('every service answer is parsed before it is read', bad);
}

/* THE TWO BUILD STAMPS AGREE.
 * Code.gs states which build it is and the app states which it needs. They
 * live in different files edited in different sessions, which is exactly
 * the pair that drifts. If they disagree the app would report a correct
 * deployment as stale, or worse, a stale one as current.
 */
{
  const gsB = (fs.readFileSync(__dirname + '/lookup.gs', 'utf8')
    .match(/var GS_BUILD = '([^']+)'/) || [])[1];
  const appB = (src.match(/L\.GS_BUILD = '([^']+)'/) || [])[1];
  check('the app and Code.gs agree which service build is current',
    (gsB && appB && gsB === appB) ? []
      : ['Code.gs says ' + (gsB || '(none)') + ' and the app expects '
         + (appB || '(none)') + ' \u2014 bump both together']);
}

/* THE SERVICE IS OFFERED THE SAME CATEGORIES THE APP CARRIES.
 *
 * BZ: we already widened the taxonomy. It was — L.TYPES carries rum,
 * vodka, gin, mezcal, liqueur, brandy and other — and the lookup prompt
 * was not widened with it, so the model was asked to file a gin into a
 * whisky taxonomy and nulled what would not fit, the distillery among it.
 * Thirteen of the fourteen entries his library scan reported had arrived
 * through that prompt.
 *
 * Two files, one list, and they are edited in different sessions by
 * different hands. This is the check that makes them stay equal.
 */
{
  const gs = fs.readFileSync(__dirname + '/lookup.gs', 'utf8');
  const appList = (src.match(/L\.TYPES = \[([\s\S]*?)\]/) || [])[1] || '';
  /* 'other' IS DELIBERATELY NOT OFFERED. It is the category somebody
     chooses by hand when nothing fits, and the prompt forbids the service
     from ever answering it.
     This check used to pass on it for the worst possible reason: it read
     600 characters past the enumeration, which swept in the sentence
     "Never answer other" — so the word appearing in its own PROHIBITION
     counted as the category being offered. Narrowing the window to the
     enumeration exposed it. A check satisfied by a word in a sentence
     forbidding that word was green and meant nothing. */
  const appTypes = [...appList.matchAll(/'([^']+)'/g)].map(m => m[1])
    .filter(t => t !== 'other');
  /* ONLY THE ENUMERATION. The prompt now explains, after the list, that a
     category outside it is allowed as a last resort — so reading 600
     characters past "sub is one of" swept that prose in and reported
     sentences as missing categories. The list ends at the full stop that
     closes it. */
  const gsBlock = (gs.match(/sub is one of:([\s\S]*?)\./) || [])[1] || '';
  /* `other` is SELECTABLE, NEVER GUESSED — the app says so where the list
     is declared, and a bottle the model cannot place must stay null so it
     can be filled in later. The prompt forbids it by name, so it is the
     one category that must NOT be offered. */
  const missing = appTypes
    .filter(t => t !== 'other')
    .filter(t => gsBlock.indexOf(t) < 0);
  /* And the forbidding has to still be there. */
  if (!/Never answer "other"/.test(gs)) {
    missing.push('the prompt no longer forbids answering "other"');
  }
  check('the lookup prompt offers every category the app carries',
    missing.map(t => t + ' is in L.TYPES and not in the lookup.gs prompt '
      + '\u2014 the service will never return it'));
}

/* SEAMS: AN ACTION THAT ONLY SOME OF ITS PLACES FINISH.
 *
 * BZ: I keep finding these little seams of inconsistent capability - can
 * you scan for this? Four of them turned up in one day and every one was
 * the same shape. A lookup answered and kept the answer, while every other
 * lookup offered it to the library. The publish modal wrote a key without
 * asking the merge record, while the contributions path asked. Both accept
 * paths did the same. None of them failed — each did something slightly
 * weaker, which is why they survived a green gate for months.
 *
 * A unit test cannot see this: every one of those paths is correct on its
 * own. What is wrong is that the SET disagrees. So the check is a registry
 * of "wherever X happens, Y happens near it", and the value is that adding
 * a pair takes one line, so every seam found by hand from here becomes a
 * seam found by the gate.
 */
{
  const SEAMS = [
    /* TWO DOORS TO ONE SERVICE, which is where this whole family of seams
       comes from. askLookup counts the lookup against the daily cap,
       refuses when the cap is spent, and offers the answer to the shared
       library. askService does none of the three. Every caller of the raw
       door silently gets a free, uncounted lookup whose answer is thrown
       away, and each one looks perfectly correct on its own.
       Allowed by name, so the four that exist today are a decision and a
       fifth is a failure (rule 28a). */
    { what: 'a lookup that goes round the counted door',
      when: /\bawait askService\(/g, must: 'THIS_IS_THE_COUNTED_DOOR',
      within: 8,
      allow: ['Through the one door, like every other question',
              'AN ARRAY. L.lookupUrl does',
              'this is not the shop',
              'lookMsg.textContent'],
      why: 'askLookup counts the cap and teaches the library; askService '
         + 'does neither. A caller on the raw door gets an uncounted '
         + 'lookup and discards what came back.' },
    /* CREATIONS ONLY. A write to catalog/products/<key>/<field> updates an
       entry that already exists and resurrects nothing, which is the same
       line the creation check above draws. Without it this reported four
       field updates and taught nobody anything. */
    { what: 'a library write that does not ask the guard',
      when: /catalog\/products\/' \+ [a-zA-Z][a-zA-Z0-9_.]*\](?!\s*=\s*null)/g,
      must: 'libraryAccepts',
      within: 32, allow: ['lifts the tombstone'],
      why: 'Consolidating deletes the losing key, so a path that does not '
         + 'read the graves offers to put it back.' }
  ];
  SEAMS.forEach(seam => {
    const hits = [];
    let m;
    seam.when.lastIndex = 0;
    while ((m = seam.when.exec(src)) !== null) {
      const at = m.index;
      const line = src.slice(0, at).split('\n').length;
      const lines = src.split('\n');
      const near = lines.slice(Math.max(0, line - 1 - seam.within),
        line - 1 + seam.within).join('\n');
      if (near.indexOf(seam.must) >= 0) continue;
      if ((seam.allow || []).some(a => near.indexOf(a) >= 0)) continue;
      hits.push('index.html:' + line + '  ' + lines[line - 1].trim().slice(0, 52)
        + '  \u2014 no ' + seam.must + ' within ' + seam.within + ' lines');
    }
    check(seam.what, hits);
  });
}

/* THE SIZE RATCHET: THE SCREEN HALF STOPS GROWING.
 *
 * Review item 35, 2026-09-15. The architecture pass measured 19 top-level
 * functions over 150 code lines, 16 of them screens, and 43 over 100. The
 * largest was libraryAdminCard, one function holding ten Firebase calls.
 * Rule 30 says a screen lays things out and hands the computing to a named
 * L. helper \u2014 a 450-line screen is not laying anything out, and every line
 * of arithmetic inside it ships untested because the harness loads only the
 * engine half.
 *
 * This is a RATCHET, not a wall (rule 28a): a wall across debt this size
 * gets switched off rather than satisfied. Every function that is already
 * over the ceiling is allowed BY NAME at exactly the size it is today, so
 * the existing debt ships and cannot grow by one line, and anything new
 * over the ceiling fails on the day it is written.
 *
 * THE CEILING IS 100 CODE LINES, from the measured distribution of the 854
 * top-level functions in this file: 803 of them are at or under 100 (94%),
 * the median is 12, and the count thins out steadily from there \u2014 131 over
 * 50, 103 over 60, 73 over 75, 51 over 100. A hundred is where the curve
 * has already flattened, so it fails the outliers and not the ordinary
 * screens, and it is the same line the review drew.
 *
 * A CODE LINE is a line that is not blank and is not comment-only. This
 * file comments heavily on purpose and a ratchet that counted comments
 * would punish the thing it wants more of.
 *
 * TO UPDATE THE LIST, run:
 *
 *     node consistency.js --sizes
 *
 * which prints BIG_TODAY exactly as it should read for the file as it
 * stands now. Paste it over the block below. That is the whole procedure,
 * and it is deliberately one command, because a ratchet whose list is
 * annoying to update gets its ceiling raised instead.
 *
 * AND THE LIST CANNOT ROT. Four checks, not one:
 *   - a listed function that GREW is a failure, by any amount;
 *   - an UNLISTED function over the ceiling is a failure (nothing new);
 *   - a listed name that is no longer in the file is a failure, so a
 *     rename or a removal cleans the list instead of leaving a ghost that
 *     silently allows a future function of the same name;
 *   - a listed function that SHRANK by more than 5 lines is a failure that
 *     says which number to write, so the allowance follows the work down.
 *     Five lines of slack, the same slack the colour ratchet above uses,
 *     because a one-line tidy should not turn the gate red.
 */
{
  const ls = src.split('\n');
  /* A top-level function: the declaration starts at column 0. Anything
     nested is measured as part of its parent, which is correct \u2014 a screen
     does not get smaller by moving its arithmetic into a closure inside
     itself. Four shapes exist at column 0 in this file: `function f(`,
     `async function f(`, `L.f = function` / `L.f = (`, and
     `const f = function` / `const f = (`. */
  const OPEN = /^(?:async\s+function\s+([A-Za-z0-9_$]+)\s*\(|function\s+([A-Za-z0-9_$]+)\s*\(|(?:L|LIB)\.([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function\b|\()|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function\b|\())/;
  /* The closing brace at column 0 ends it: `}`, `};`, `})`, `});`, `})();`.
     A declaration that reaches the next column-0 declaration without one is
     not measured rather than measured wrongly. */
  const CLOSE = /^\}[)\];(\s]*$/;
  const isCode = s => {
    const t = s.trim();
    return !!t && !t.startsWith('//') && !t.startsWith('/*')
      && !t.startsWith('*');
  };
  const sized = new Map();
  for (let i = 0; i < ls.length; i++) {
    const m = OPEN.exec(ls[i]);
    if (!m) continue;
    const name = m[1] || m[2] || m[3] || m[4];
    let end = -1;
    for (let j = i + 1; j < ls.length; j++) {
      if (CLOSE.test(ls[j])) { end = j; break; }
      if (OPEN.test(ls[j])) break;
    }
    if (end < 0) continue;
    let n = 0;
    for (let j = i; j <= end; j++) if (isCode(ls[j])) n++;
    /* One name, one size. lint.js already fails a name defined twice; if
       one ever slips through, the ratchet holds the larger of the two
       rather than whichever came last. */
    const was = sized.get(name);
    if (!was || n > was.n) sized.set(name, { name, n, line: i + 1 });
    i = end;
  }

  const SIZE_CEILING = 100;
  const SIZE_SLACK = 5;

  /* TODAY'S OFFENDERS, measured 2026-09-15. Regenerate with
     `node consistency.js --sizes` \u2014 never edit a number here by hand, the
     same way a version is never edited by hand. */
  const BIG_TODAY = {
    showBottle: 513,
    likelyToLike: 466,
    openLibraryCleanUp: 380,
    productForm: 360,
    renderShelf: 325,
    renderAway: 306,
    showShelfTools: 255,
    shopAnswer: 243,
    renderLookupSetup: 231,
    renderSettings: 211,
    renderGuest: 157,
    renderHome: 199,
    libraryAudit: 173,
    renderGaps: 170,
    renderShelfCharts: 165,
    shelfPortrait: 165,
    renderUsers: 163,
    shelfAxes: 163,
    flightEditor: 153,
    editLibraryEntry: 152,
    showCandidates: 147,
    postWithRetry: 128,
    showEnhance: 142,
    renderLibrary: 138,
    fbLoadAfterWipeCheck: 130,
    shelfBuildSheet: 131,
    awayLookingCard: 128,
    flightBuilder: 128,
    renderOffer: 128,
    roomNotes: 120,
    shelfFit: 128,
    renderShop: 126,
    renderBuddies: 125,
    showFlight: 123,
    renderFlights: 112,
    renderBuddiesTab: 113,
    showImportCheck: 112,
    renderShelfFilters: 100,
    showBulkStatus: 107,
    tastingPapers: 43,
    renderDiag: 105,
    renderFromUrl: 103,
    vennSvg: 103,
    exploreAxis: 102,
    receiptsDialog: 101,
    renderRecap: 101
  };

  if (process.argv.indexOf('--sizes') >= 0) {
    const block = [...sized.values()]
      .filter(f => f.n > SIZE_CEILING)
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
      .map(f => '    ' + f.name + ': ' + f.n)
      .join(',\n');
    console.log('\n  const BIG_TODAY = {\n' + block + '\n  };');
    process.exit(0);
  }

  const grew = [], ghosts = [], shrank = [];
  Object.keys(BIG_TODAY).forEach(name => {
    const f = sized.get(name);
    if (!f) {
      ghosts.push(name + ' is in BIG_TODAY and is not a top-level function '
        + 'in index.html \u2014 drop the line, or the name is free to come '
        + 'back at any size');
      return;
    }
    if (f.n > BIG_TODAY[name]) {
      grew.push('index.html:' + f.line + '  ' + name + ' is ' + f.n
        + ' code lines, allowed ' + BIG_TODAY[name] + ' \u2014 move the '
        + (f.n - BIG_TODAY[name]) + ' new line(s) into a named L. helper '
        + '(rule 30). The allowance does not go up.');
    } else if (f.n < BIG_TODAY[name] - SIZE_SLACK) {
      shrank.push(name + ' is down to ' + f.n + ' from ' + BIG_TODAY[name]
        + ' \u2014 write ' + f.n + ' so the ratchet keeps holding '
        + '(node consistency.js --sizes)');
    }
  });
  const fresh = [...sized.values()]
    .filter(f => f.n > SIZE_CEILING && !(f.name in BIG_TODAY))
    .sort((a, b) => b.n - a.n)
    .map(f => 'index.html:' + f.line + '  ' + f.name + ' is ' + f.n
      + ' code lines, over the ' + SIZE_CEILING + '-line ceiling \u2014 a '
      + 'screen lays things out and calls a named L. helper for the rest '
      + '(rule 30)');

  check('no function over the ceiling has grown', grew);
  check('no new function over the ' + SIZE_CEILING + '-line ceiling', fresh);
  check('the size list has no ghosts', ghosts);
  check('the size list has ratcheted down', shrank);
}

console.log('\n  ' + (bad ? '\u2716 ' + bad + ' of ' + checks + ' checks found something'
  : '\u2713 all ' + checks + ' consistency checks pass'));
