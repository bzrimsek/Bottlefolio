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
  /* ONE SOURCE, TWO READERS. The audit names the release a bottle's name
     implies, and the suggestion offers to set it - both by asking
     L.guessScar, which is the single door. Rule 30d is about two
     functions DECIDING one fact from different evidence; these decide
     nothing, they quote. If a second way of reading a release ever
     appears, that is the thing to catch, and this entry does not hide
     it: it names guessScar specifically. */
  'libraryAudit>guessScar', 'auditSuggestion>guessScar',
  'ownedCount>myBottles', 'pourGlasses>reelMatches', 'viewFor>clampView',
  'zoomAbout>clampView', 'shopIsNewBottle>shopNorm',
  'parseDelimited>parseCSV', 'placeLine>titleCase', 'recap>lookupDaysSince',
  'awayPour>logEntry', 'contribSig>syncSig', 'axisLabel>titleCase',
  'addPour>relabel', 'removePour>relabel', 'movePour>relabel',
  'sortByProof>relabel', 'mashOf>mashByLaw', 'readFailSays>isNetworkFail',
  'shelfTodo>enhanceQueue', 'flightNoteQueue>pourable',
  'enhanceQueue>pourable', 'typedName>tidyName', 'suggestName>cleanName',
  'lookupAllowed>lookupTally',
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
  const KEYS = new Set(["'colour'", "'flavour'", "'flavoured'", "'grey'",
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
        /* v1.9.32 */
    'Not me', 'Removing a library entry',
    /* v2.0.9 */
    'Scan the library for inconsistencies',
    /* v1.9.40 */
    'Text the list, or text a link', 'Diagnostics by user',
    'With a guest', 'Whisky only', 'The library', 'Add to the wishlist',
  'How much is left', 'Another one?', 'Gone', 'Photograph fill levels',
  'Add to the list',
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
    'showFill'];
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

console.log('\n  ' + (bad ? '\u2716 ' + bad + ' of ' + checks + ' checks found something'
  : '\u2713 all ' + checks + ' consistency checks pass'));
