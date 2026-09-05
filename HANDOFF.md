# Killer B's Bottle Tracker — handoff

Written 2026-09-03, end of a long session. Working copy is at **v1.6.12**
and does **not** pass the gate: one bug, mine, described in full below.
The last build BZ can safely deploy is **v1.6.11**.

Read this, then `BACKLOG.md`, then the dev rules in BZ's preferences. The
rules are instructions, not guidance — he has said so explicitly.

---

## 1. Do this first

**Fix the open bug.** `index.html`, in `fbFirstLoad`, around line 16247:

```js
FB.pushed = L.pushedFromRemote(SYNC_KEYS, S, remote);
if (remote.lookupUrl && remote.lookupUrl === S.lookupUrl) {   // <-- throws
  FB.pushed.lookupUrl = S.lookupUrl;
}
```

`remote` is null when the account has nothing in it. That line sits
OUTSIDE the `if (hasRemote)` block above it, so on an empty account it
throws, `fbFirstLoad` dies immediately after `FB.loaded = true`, and
nothing is ever pushed. The fix is a guard:

```js
if (remote && remote.lookupUrl && remote.lookupUrl === S.lookupUrl) {
```

Confirm with `node sync.js` — scenario 4 ("a name with a full stop")
currently fails with `Cannot read properties of undefined (reading
'whisky')`, which is the test reading an account nothing wrote to.

Then run the gate (§3) and deliver as v1.6.13.

**Why it exists:** it was added minutes earlier to fix a real thing — the
first push of every session wrote 154 bytes with an empty key list,
because `lookupUrl` is pushed but is not a SYNC_KEY, so it was never
seeded as already-sent. The fix is right; it is in the wrong scope.

---

## 2. What this app is

A single-file PWA for BZ's whisky collection: 344 bottles, 325 products,
36 designed tasting flights. GitHub Pages, `bzrimsek/Bottle-Tracker`,
no build step. Firebase for sync and a shared library everyone reads.

`index.html` is ~17,000 lines: an `L` object of ~240 pure functions
(the logic half) and ~190 render functions below it. The split matters —
`killer-bs-test.js` can only reach `L`.

### The files

| file | what it is |
|---|---|
| `index.html` | the whole app |
| `sw.js` | service worker; `CACHE_NAME` written by bump.py |
| `bump.py` | the ONLY way to change a version (rule 9) |
| `ship.py` | the delivery gate; runs everything below |
| `audit.py` | static checks: syntax, versions, lock files, help text |
| `smoke.js` | does the script run, does every screen draw |
| `killer-bs-test.js` | 1794 assertions over `L` |
| `browser.js` | real Chromium walk of every screen |
| `sync.js` + `fake-firebase.js` | the push/load CYCLE against an in-memory Firebase |
| `render.js` | screens compared to the engine and to each other |
| `twotab.js` | two tabs of the app at once |
| `papers.js` | prints the host card and participant sheet, counts pages |
| `firebase-rules.json` | pasted into the console BY HAND; does not deploy |
| `data.json`, `map.json`, `bz-bottles.json`, `bz-flights.json` | shipped data and BZ's real shelf |

---

## 3. Delivering

```
python3 bump.py "what changed, in full sentences"   # never edit a version by hand
python3 ship.py                                     # all eight checks
```

Every delivery is four files: `index.html`, `sw.js`, and the two named
lock files. Plus any harness that changed (rule 29).

**The gate takes ~3 minutes.** BZ cannot see progress inside a single
command and reads silence as a hang — he said so repeatedly and it cost a
lot of goodwill. Run the steps separately and report each:

```
python3 audit.py          # seconds
node smoke.js             # seconds
node twotab.js            # ~10s
node papers.js            # ~2s   (--all prints all 72, ~90s)
node killer-bs-test.js    # ~10s
node sync.js              # ~30s
node render.js            # ~30s
node browser.js           # ~60s
```

`audit.py` fails if `index.html` differs from the lock file by a byte —
that is deliberate, it caught an unversioned edit.

---

## 4. What this session shipped (1.5.0 → 1.6.12)

Renumbered from 1.26.x to 1.5.0 at BZ's request, then forward.

**Sync, which was the week's real story.** Six faults in sequence, each
invisible to 1,700 passing unit tests because every one tested a function
alone and the fault was in the ORDER:

- a push that stamped its own clock, so the account was always "newer"
- a load that called `save_()` before `FB.loaded`, so it scheduled no push
- a merged map that never compared equal to itself (key order)
- keys containing `.` refused outright by Firebase — 18 of 325 product
  names — which is why a bought bottle and a flight pour vanished
- `undefined` in a pours array refusing the whole write
- update payloads keyed by PATH run through `fbEncode`, which escaped the
  slashes, so publishing wrote `catalog~fproducts~fweller_12` and
  reported success

`sync.js` exists because of this. It drives push and load together.

**A two-tab loop I introduced and then fixed.** The storage listener
adopted another tab's change and called `appLog`, which writes to
localStorage, which the other tab adopted... forever. It made BZ's PC
unclickable and his phone's nav vanish. `twotab.js` exists because of it.

**Bottle screen** rebuilt: nine controls in one row became a star beside
the name, Look up / Edit / Delete under the details, Pour it / Find it /
Another bottle under Your bottle. The internal id (`B199`) is gone —
"Open · added 2026-09-03", or "Bottle 2 of 2".

**Shop**: three drawn tiles instead of three sentences; Back beside Home;
the wishlist on the search screen; a category suggestion opens real
bottles instead of typing its own heading into the search box.

**Papers**: the participant sheet was refusing to print ("the sheet names
glass") because the leak guard read the prompts, which are a fixed
vocabulary; the host card printed `[object Object]` for extensions.

**Two things the app knew and never said:** what you pour against what you
own, and the 14 whiskies you have bought more than once.

**Ask ranking**: every lookup records whether real bottles came back, and
suggestions are ordered by that.

---

## 5. The pattern behind almost every bug

Two things holding one rule, only one of them taught. It is named in
`BACKLOG.md` and it caught us again and again this session:

- `variableOfId` against the flight tags it reads
- `fbEncode` against the path keys of a map delta
- `syncSig` against the three places that compare it
- the sort menu against the column headers
- `audit.py`'s header counter against the header it counts
- SHEET_SAFE against the prompt vocabulary it shadowed
- **a second `L.FIND_RANK` added 49 lines above the one that already
  existed, silently overriding it** — I did this while fixing something
  else

The test that catches this class asserts the PAIR, not each side. See
§198, §204, §206, §212, §215, §222.

**Before adding any function: grep for it.** Twice this session I wrote
something that already existed.

---

## 5b. Where this session ended — 2026-09-04

Shipped v1.6.21, gate green, 2051 assertions. What went in: the affinity
recommender and the wood taxonomy, the shelf portrait and the six-axis
shape with its roadmap, books on the shelf, the sealed fix, and the
renderAxis restoration.

**Two faults reported on BZ's device that were never reproduced here.** Say
so plainly rather than assuming they went away:

1. **The nav tabs vanish on his Pixel 10 Pro, Chrome, installed PWA.** Not
   reproducible at 390x700, 412x915, with emulated safe-area insets, on any
   of the seven screens, or scrolled to the bottom of Home — nav computes
   to the viewport floor every time. The layout is right in a desktop
   engine, so it is something the device does. The discriminating question,
   still unanswered: do the tabs come back on a tab-switch or a rotate, or
   are they gone for the session?
2. **The Library admin gear.** There is no gear on that screen and never
   was — the admin controls are inline buttons gated on there being work to
   do. His uid IS an admin. Filed as its own backlog item.

**Process, for whoever reads this next.** Several turns this session
returned empty and at least three of them ran commands that were never
reported. That is where the phantom v1.6.15 entry and a stray v1.6.20 lock
pair came from. Nothing shipped from those turns and the delivered lock
matches index.html byte for byte, but if something in the file looks
unaccounted for, that is the likeliest explanation. Check CHANGELOG.md
against the header block before trusting either.

## 6. Open, in priority order

**Needs BZ, not code**

1. ~~`firebase-rules.json` has not been pasted into the console.~~
   **Closed 2026-09-03: BZ confirmed he pasted the rules when asked.** Do
   not re-raise this. Any FUTURE change to `firebase-rules.json` still has
   to be pasted by hand — it does not deploy with the app — so a delivery
   that edits that file must say so explicitly.
2. ~~Recover the lost bottle.~~ **Closed 2026-09-04: BZ recovered the
   Heaven Hill grain-to-glass wheated bourbon and restored it as pour 5 of
   WHEAT, TURNED UP himself. Do not re-raise.**
3. ~~Verify on his devices: shelf type tiles and the library button.~~
   **Closed 2026-09-04: BZ confirmed both work. Do not re-raise.**

**Code**

4. `renderShop` is 330 lines and `renderShelf` 266; both still compute
   inline (rule 30). `S` is a 30-key global every render function reads
   directly — that is WHY logic keeps landing in render. Big change,
   nothing has needed it yet.
5. Sharing has never run end to end with a second person. A great deal
   shipped into those paths and only `fake-firebase.js` has exercised
   them.
6. The candidate finder has never actually put a bottle in his hands.

**Deferred by decision**: barcode pairings through `contrib` (waits until
the circle grows past people he knows), gifts, receipt ingest by email,
road trip planner, tasting night on phones.

---

## 7. Working with BZ

- **Status, constantly.** He cannot see inside a running command. Silence
  reads as broken, and he will ask — repeatedly, and with justification.
  Report after every step.
- **Action first.** The actions taken and the questions needing answers.
  No preamble, no recap.
- **He is right more often than not** about his own app. "The bottle ID is
  not something known to the user", "that happens when the bottle text is
  two lines", "if we don't know, it's not likely on shelves" — each was
  correct and each pointed straight at the fault.
- **Deploys cost him.** Do not use one as a diagnostic step. Fold
  everything into one build.
- **Rules 13 and 28 are the ones to actually keep.** Stop after two failed
  fixes and write out what you read, what you observe, your diagnosis.
  Compute expected values by hand BEFORE writing the assertion. I broke
  both repeatedly this session and it showed: the Taste box took four
  passes, the Shop back button broke twice in consecutive versions.

---

## 8. Two numbers worth keeping

An in-step load writes **59 bytes** (was 220,096). One corrected bottle
writes **56** (was 61,290). If either grows by orders of magnitude, the
delta logic has regressed — `sync.js` prints both on every run.

## Running the gate — SOP, set 2026-09-04

BZ: "almost every time I ask, you give me the same answer." He was right.
The gate takes several minutes and the habit was to run it silently and
report at the end, so every check-in got "running the gate now" — a status
line rather than an answer, and the reason he was asking at all.

**Status has to stay visible or it is not status.** BZ, watching the gate
run: the fault was never the number of lines, it was the gaps between
them. A check that takes a minute with nothing said is the same as a
hung app, and asking "ok?" is what somebody does when a screen has
stopped talking.

So: say what is STARTING as well as what finished, and name the slow ones
before they run rather than after. "Starting the browser walk, about a
minute" costs one line and removes the reason to ask.

**Run the checks ONE AT A TIME and report each as it lands.** One line per
check, as it finishes:

    1/8 smoke ✓
    2/8 tests ✓ 2577
    3/8 twotab ✓

Never run the whole loop in one command and report at the end. Never say
"running the gate now" without a result attached — if there is nothing to
report yet, say what is running and what came back last.

The order, and what each one is for:

1. `smoke.js` — the script parses and every screen draws
2. `killer-bs-test.js` — the assertions
3. `twotab.js` — two tabs do not fight
4. `papers.js` — the printable output
5. `render.js` — render functions do templating only
6. `sync.js` — push, load, reload, refuse, and the byte counts
7. `browser.js` — the walk through the real screens
8. `audit.py` — the pre-delivery audit

Read the WHOLE output of each, not the last line. `sync.js` timed out for
several builds and reported nothing, because the last line was blank and
the failure was thirty lines up: it had been clicking a Library pill that
moved into Settings. A gate reported green while one of its checks had not
run at all.

## Hand over BZ's work the moment it exists — SOP, set 2026-09-05

BZ: "separating that stuff saved me time — need more of that type of
behavior."

The recap needed an Apps Script change he makes in a different tool. It was
handed over as soon as it was written rather than bundled into the drop at
the end of a nine-check gate, so he was pasting and testing it while the
walk was still running. Two things happened at once instead of one after
the other.

**If a piece of work is BZ's and does not depend on the build, ship it the
moment it is written.** Not with the drop. That covers:

- Apps Script changes (recap.gs, lookup handlers)
- Firebase rules
- Anything he pastes into a spreadsheet, a console, or GitHub
- Instructions for a thing he does by hand

Each of those goes out as its own file with its own short walkthrough, and
he starts on it while the gate runs.

**The reverse matters as much.** When his piece DOES depend on an app
version, say so plainly, because a script deployed against a build he has
not installed will look broken and cost a round trip to explain.

**Write the walkthrough for somebody who has not opened that tool in a
month.** Real menu names, real button names, the actual block of code he
will be looking at and what it should read afterwards. "Add two lines to
your existing doPost" is not an instruction — it asks him to read and
understand a file he wrote once and has not seen since. That is our work,
not his.

## Four rules from the 2026-09-05 retro

These are not new principles. Each one is a rule that already existed and
was not followed, written here in the form the failure took, because the
abstract version did not stop it happening.

### 1. Two failures in one area — stop and ask

The library fill took TEN attempts. Nine of them fixed real bugs and none
fixed the problem, because the problem was structural: five separate things
could each decide a bottle needed no work, and they disagreed. BZ gave the
shape in one sentence — "three lists: done, needs done, waiting to do
again" — after hours of patching instances of it.

The signal is the repetition, not the bug. **Same corner, second failure:
stop fixing and go looking for the design fault. Third failure: ask BZ what
shape he sees**, because the person watching it fail knows something the
person patching it does not.

Ten rounds of "found it, fixed it" is not persistence, it is refusing to
re-read the problem.

### 2. Never reason about data you cannot see

His library. His deployed build. His log. Every confident claim made about
any of those was wrong, including twice asserting he was running an old
version when he was not.

**Instrument, ship, read what comes back.** A build that says WRITE or
WAITLIST per bottle settles in one round what six rounds of inference did
not. When the answer depends on data on his device, the honest move is a
diagnostic and a request, not a theory.

### 3. Verify before saying it is fixed

"This should work now" was said at least ten times before it did. A
simulation against data.json is not evidence about his library; a green
gate is not evidence a feature does its job.

**Say what was actually checked and against what.** "Measured on his
bottles: 200 to 190" is a claim. "This fixes it" is a hope with a full stop.

### 4. "The same as X" means read X and CALL it

BZ said "the same as the shopping search" FOUR times. Each time something
adjacent was built — the add form's search, then a shelf-only search, then
a library search — and each time it was wrong for the same reason.

**When he names an existing behaviour, open that code and call what it
calls.** Not something with the same shape. The shop searches shelf and
library and THEN offers a lookup when both miss, and the fourth attempt was
the first one that read renderShop to find that out.

Rule 2 in his dev rules already says reuse before inventing, read existing
code first. This is what ignoring it looks like.

### And one that is not a rule but a habit worth keeping

A change to a shared helper affects every caller. nameOverlap was fixed for
the bar-list case and silently changed the receipt import, the gift list,
the buddy shelf and the wishlist filter. It was measured afterwards — 27
strong matches to 25, and all 25 correct — but that measurement was luck,
not process. **Grep the callers before changing a helper, and measure each
one after.**
