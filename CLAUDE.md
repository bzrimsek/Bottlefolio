# Bottlefolio

A whiskey collection app. One file, `index.html`, about 1.75 MB, plus a
service worker and four Apps Script files. No build step, no framework, no
bundler — what is in `index.html` is what runs.

---

## The rules

**The rule book is `..\DEV-RULES.md`, one for every app** (BZ, 2026-10-03).
It lives in `Apps I've Built\`, beside this folder, and `..\CLAUDE.md` imports
it, so it is loaded in full at the start of every session. This file does
not repeat it and must never start to: two copies of one rule set is exactly
the fault those rules exist to prevent (30d), and the day they disagree is
the day neither is trusted.

There is no copy in this folder. `push.py` publishes the shared book into the
repo as `DEV-RULES.md`; that copy is never edited. If a rule turns out to be
wrong or missing, propose the change to the rules session (it owns the shared
book). Do not write a second version of it here.

---

## Bottlefolio's own rules

Moved out of the shared rule book on 2026-10-03 because they name
Bottlefolio's code and no other app has the thing they govern. They keep
their numbers, because `consistency.js` and `says.js` cite them.

**9z** App use is updated with every build, alongside the changelog and the
version bump. BZ: remember to update App Use with each build. A help page
describing a screen that has been rebuilt is worse than one saying nothing,
and consistency.js only checks the controls it has been told about — so a
new named control goes in BOTH the App use entry and the CONTROLS list that
guards it.

**25f** CALL THE APPS SCRIPT FILE Code.gs. It is delivered from the
container as lookup.gs and it lives in my project as Code.gs, and two names
for one file is how a paste lands in the wrong place. Say Code.gs when
handing it over. label.gs and shelf.gs match on both sides and keep their
names.

Two shared rules, as they apply here:

- **22b, the linter:** `lint.js` is one of the twenty checks below, and
  its `ALLOWED` list is empty.
- **30f, the size ratchet:** it measures `index.html` AND `admin.html` by
  one definition since 2026-10-27 — a function that moves between them is
  still measured, which is what stopped `renderUsers` walking out of the
  ratchet with the admin split. The allowances are `BIG_TODAY` in
  `consistency.js`, measured 2026-09-15 with 51 functions over 100 code lines;
  39 were still over on 2026-10-03. Regenerate with `node consistency.js
  --sizes`, never by hand.
- **35, timing the gate:** `gatetime.py` keeps the last thirty runs and
  gives the median of nine. The checks themselves are run by `check.js`,
  described under Building below.

---

## Shape of the file

`index.html` is two halves, and which half code belongs in is not a matter
of taste:

- **The engine** — everything on `L.`, from `const L = {};` down to the
  `STATE + RENDER` banner. Pure functions. No DOM, no `S.`, no network.
  The test harness loads only this half, so **logic outside it ships
  untested** (rule 30).
- **The screens** — everything after that banner. Templating only. If a
  render function is computing something, extract it to a named `L.`
  helper and call it.

`S` is the app state, `LIB` the shared library, `L` the engine.

---

## Building

Two commands, on BZ's Windows PC (`python`, not `python3`). Run push.py
(and audit.py or gate.py) with the Python install's own
`%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe`. The `python` on PATH
is the WindowsApps alias, which cannot see the Playwright browsers, so under
it the audit's browser checks crash. Since 2026-09-15 a crash fails the
audit, so the push stops there:

```
python bump.py "what changed, in full sentences"
python push.py "short subject for the commit"
```

`bump.py` is the **only** way to set a version (rule 9). It writes five
places and the changelog entry. Never edit a version by hand.

`push.py` does the rest and prints each step as it lands — relay them
(rule 25c): the audit here; BZ's shelf files re-sealed if they changed;
every changed file to the `build` branch as ONE commit; then the gate below
runs on GitHub's servers (`.github/workflows/gate.yml`), and only a green
gate moves `main` — which is what https://bzrimsek.github.io/Bottlefolio/
serves. A red gate leaves the live site untouched and push.py prints the
failing log. `python push.py --dry-run` lists what would go without sending,
and writes nothing here — not even the sealed shelf files. push.py refuses
to push while an earlier gate run on `build` is still queued or running,
and prints that run's link; the gate itself refuses, before deploying
anything, a build whose `main` has moved since it was pushed.

Credentials: BZ's `gh auth login` (Windows Credential Manager). The shelf
files `bz-bottles.json` / `bz-flights.json` go to the public repo ONLY as
`.gpg`; the key is `%USERPROFILE%\.bottlefolio\shelf.key`, outside OneDrive,
and the same key is the repo secret `SHELF_KEY`. push.py refuses to send a
plain shelf file, a CSV, the database export or `_superseded/`.

The gate, all twenty, in this order — `gate.py` runs them in the cloud
with the clock pinned to UTC. Nothing depends on that any more: §351 used to
fail on BZ's PC and pass in the cloud, because it stamped a date at midnight
UTC and `L.todayISO` answers the LOCAL calendar day on purpose — so the one
instant that lands on a different day everywhere west of Greenwich. It stamps
noon now and passes in Ohio, UTC and Tokyo alike (2026-09-27). A standing red
check locally is worth removing: it teaches you to ignore red.

```
python3 audit.py index.html  # the named lock matches index.html
node killer-bs-test.js    # 8,269 assertions
node lint.js              # nothing undefined, duplicated, unreachable
node consistency.js       # 123 wiring checks, incl. rules copied twice
node screens.js           # 39 screens draw
node answers.js           # what the answers SAY, on BZ's real shelf
node shots.js             # every screen at 390px, photographed
node seq.js               # screens in PAIRS: what the last one left behind
node papers.js            # both papers, one landscape page each
node render.js            # screens agree with the engine
node twotab.js            # two devices, merge holds
node gscheck.js           # Apps Script wiring
node browser.js           # the walk, a real browser  (~45s)
node sync.js              # push, load, reload, refuse (~78s)
node ios.js               # the app in WebKit, at iPhone size (~25s)
node says.js              # what every screen SAYS, on BZ's real shelf
node update.js            # an old worker installed, a new build landing
node admin.js             # the admin page, and index.html's anchors broken
node cost.js              # what the engine COSTS, against a ratcheting budget
node rulestest.js         # the Firebase rules, run in the emulator
```

`rulestest.js` needs Java, so it runs in the cloud gate only (BZ,
2026-09-16); on BZ's PC it prints SKIPPED, which is not a pass. It also runs
the suite against rules broken on purpose and fails if it misses one.

All twenty must pass. Report each one as it lands rather than running the
loop silently (rule 25c) — and read the whole output of each, not the last
line; a check once sat broken for several builds because the failure was
thirty lines above a blank final line.

**One command runs them, four at a time:**

```
node check.js --all          # 62s, where one after another is 203s
node check.js                # only what this change can break
```

It reads `checks.json`, the same table `gate.py` reads, so both agree about
which check a change can break. It judges by what a harness SAYS, not its exit
code — `consistency.js` prints its failures and exits 0. Longest first, four
lanes, each a separate process: nothing shared, because the Firebase in the walk
and in sync is an in-page stub and the only harness that writes anything writes
into `shots/`. Sixty-two seconds IS the floor — sync alone is that long, and
eight lanes measured the same as four (2026-10-02).

Picking checks by what changed saves less than it looks: any edit to
`index.html` reaches `engine` or `screens`, which is 15 of the 17 and every
expensive one. Running them at once is what actually shortened it. The cloud
gate has run its groups in parallel since it was split.

A delivery is `index.html` + `sw.js` + `admin.html` + **three** named lock
files — `bottlefolio-vX.Y.Z.html`, `-sw.js` and `-admin.html`. The admin lock
joined on 2026-10-27, the day after the page itself did: for one day
`audit.py` could prove the delivered app was the tested file and nothing
proved it for the admin page, which is the exact fault a lock exists to
catch. Rule 25 still says three files in total; the wording is the rules
session's to change, not this one's, and the proposal is on the table —
*"every file the app serves + the named lock files its bump script writes,
listed in the app's CLAUDE.md"*, which stays true for MadGolf and Extras
Manager, neither of which has an admin page.

`push.py` sends a finished build to the repo and refuses to run unless
`audit.py` has passed.

---

## The admin half

`admin.html` is a second page beside the app, added 2026-10-27 in two
builds. It holds **four tabs**: People — everybody with an account, each
person's published report, the four-record sharing check and its repair,
Suspend and Remove — and then the whole library: **Library** (browse,
search, the entry editor, export and import), **Offered** (the queue, with
its count on the tab) and **Clean up** (the contradiction scan and the
lookup fill). The automatic intake runs there too, started from the gate
four seconds in and then on a timer; `fbCheckAdmin` used to start it and
exists in no file now, because the gate already reads `admins/<uid>` and two
places answering one question is the fault rule 30d is for. All of that used to be inside `index.html`, behind `S.admin` — which
is a local switch anybody may flip, not a permission — so every installed
copy of the app carried screens whose every read the database refused. BZ:
separate out admin functions. It matters more now the app is headed for the
stores, where the people installing it are strangers.

**It keeps no second copy of anything.** At boot it fetches `index.html`
and slices four things out of it: the `L.` engine (between `const L = {};`
and the `STATE + RENDER` banner, the same two anchors `engine.js` uses), the
Firebase config, `APP_VERSION`, and the three SDK urls. So 32,052 engine
lines stay written in one place and the two pages can never disagree about a
rule — and **`index.html`'s engine anchors are now load-bearing in a second
file**. It slices a fifth thing since build 2: the lookup address.
`admin.js` breaks each anchor on purpose and demands the page say it cannot
boot; `audit.py` refuses a delivery where `LIB.admin` or any of twenty-four
moved names is back in `index.html` as code, or where `admin.html` has grown
an engine, a config or a version of its own.

**Desktop only, by decision** (BZ, 2026-10-27). No manifest, no icons, no
phone layout, and deliberately NOT in `sw.js` — a stranger's browser must
never cache a page it can never use. It is published with the site because
same origin is what lets it read the engine; it is public and harmless,
since without a uid under `bz-apps/whisky/admins` every read it makes is
refused, `admins/$uid` is `write:false`, and the Firebase web key was never
a secret.

**Build 2, the same day, moved the library whole.** The offers queue, the
automatic intake, the entry editor, taking entries out and putting them
back, export and import, the lookup fill and the contradiction scan: 85
functions, 2,819 lines out of `index.html`. It does not split — every cut
tried duplicated a decision. `pickLibraryEntry` is wanted by the editor AND
the queue, `libraryMergeWrite` by the editor AND the scan, and the scan is
the only door to the fill, which is the only thing there that needs the
lookup service. One web, or nothing.

**Nothing in `index.html` reads `LIB.admin` any more**, and that is the
acceptance test rather than a hope: `audit.py` refuses a delivery where the
field or any of twenty-four moved names is back in the app as code. The
field itself is gone from `LIB`, because a field nothing ever sets is a trap
for the next reader. BZ's own rule is finally true of the code: only an
admin writes the shared library, everybody else offers.

**So two things became everybody's**, which is what made the move possible
(BZ, 2026-10-27, asked which way it should go):

- **`reviewBatch` offers where it published.** "Offer marked", not "Publish
  marked". An admin's own corrections travel the same road as anybody
  else's, through `offerToLibrary`, and are accepted on the admin page.
  `publishBatch` and `publishMineIfAdmin` are gone from both files — the
  second published on every shelf save, silently, for one account.
- **Tidy your shelf**, on Settings › Shelf, is the shelf-crossing half of
  the old Clean up page, drawn for every user: bottles the library has never
  held, facts of yours that belong in it, invented flight notes that reached
  it, and a flight asking for a bottle you own. The badge on Home counts one
  population now — what your shelf holds that the library does not — and
  anybody can act on it.

**One finding did not survive and it is worth knowing which.**
`shelfJoinFinding` — "this bottle is not filed under the entry it reads as"
— has exactly one repair, and that repair writes a forwarding address in the
library. Nothing in the app may write the library, and the admin page has no
shelf to read. A finding with no way to act is not a finding (BZ), so rather
than draw a dead row it went. It comes back when the admin page can read a
shared shelf, or when the app can offer a filing for an admin to accept.
`mergeHouseOnShelf` and `clearMineToo` went with it, for a better reason:
both tidied an admin's own rows straight after that admin wrote the library,
and a shelf follows the library on its own through the merge record.

**The admin page has its own door to the lookup service, declared.**
`L.ACTIONS` carries `reach the lookup service from the admin page`, through
`adminService`, `where: 'admin.html'` — because `postWithRetry`'s retry, lane
queue and wake lock all exist for a phone that suspends a backgrounded tab,
and copying 135 lines of them onto a desktop page would be a second copy of
the most-tested path in the app rather than a second door to a service. Rule
30d got STRONGER, not waived: before that entry existed the two action
checks read `index.html` only, so every call `admin.html` made was outside
every guard in `consistency.js`. Three more checks followed the code there —
the library-creation guard, the unused-constant check, and a copy check over
`admin.html`'s own 3,000 lines of screens. That last one passed on its first
run and a mutant proved it vacuous: `copyGroups` keeps an engine call's name
by matching `L.`, and on that page the engine is `A.L.`

**`index.html`'s lookup address is the fifth thing the page slices out**,
beside the engine, the config, the version and the SDK urls, for the same
reason: `DEFAULT_LOOKUP_URL` has never changed and a second spelling of it is
how it comes to be changed in one place only.

One thing it says twice on purpose: the `bz-apps/whisky` node paths. They
are gathered in one `NODE` map at the top of `admin.html` rather than
scattered, because `index.html` names them too — 67 sites across 25 distinct
paths, with no shared table to read from. One shared path table in the engine is
the fix and is its own job; half-migrating 67 call sites would leave two
doors, which is worse than one flagged copy.

---

## The Apps Script half

Four files — `lookup.gs` (delivered as **Code.gs**, rule 25f), `shelf.gs`,
`label.gs`, `recap.gs` — run as a deployed web app and answer lookups,
photograph reads and write-ups.

**A paste is not a deploy.** Apps Script serves the DEPLOYED version, not
the saved one. Deploy → Manage deployments → pencil → New version. This
has cost a whole debugging round: a file was pasted, the file was
confirmed to contain the fix, and the live service ran months-old code
anyway (rule 25e).

`lookup.gs` carries `GS_BUILD` and `index.html` carries `L.GS_BUILD`. When
the service changes, both move together — `consistency.js` fails if they
disagree, and the **Check the service** button in Settings asks the live
deployment which build it is actually running.

**Deployed by the cloud gate since 2026-09-15.** When `Code.gs`,
`label.gs`, `recap.gs`, `shelf.gs` or `apps-script/appsscript.json`
changes, `gate.yml` sends exactly those five — the live project's file set,
script "Enrich Bottles", checked by cloning it — with clasp, runs
`update-deployment` on the SAME deployment so the app's URL never changes,
and asks the live service for its build before the site moves. That is a
paste AND a deploy, so rule 25e is satisfied by the machine. `lookup.gs` is
a second copy of `Code.gs` and `recap-handler.gs` is not in the project;
neither is ever sent, because either would define every function twice.
A hand paste is now only the fallback. Credentials: secrets `CLASPRC`,
`GAS_SCRIPT_ID`, `GAS_DEPLOYMENT_ID`.

---

## How the site gets published

Since 2026-09-15 the gate packages the twelve files the site serves - the
app, the worker, the manifest, the icons, the barcode decoder, data.json,
map.json and .nojekyll - and deploys THAT, rather than GitHub rebuilding the
whole repository (805KB changelog, the harnesses, ten superseded lock
copies) with Jekyll twice per release.

Two settings make it work, and both are already set:

- **Settings -> Pages -> Source: GitHub Actions** (`build_type: workflow`).
- **The `github-pages` environment must allow the `build` branch.** The gate
  runs on `build`, and by default that environment only allows the default
  branch: the publish job is then refused before a single step runs, in two
  seconds, with no log. That is what a red run with a green gate looks like.

`gate.yml` carries both publish jobs and picks by reading the live setting,
so neither switch is assumed: `publish` deploys the artifact, and
`publish-from-branch` asks for a branch build instead.

---

## Firebase rules

`firebase-rules.json` holds this app's branch, `rules → bz-apps → whisky`,
which on 2026-09-15 was the whole database. When the file changes, the
cloud gate runs `node rules.js deploy`: it swaps in that branch and nothing
else, refuses if the live rules carry comments a rewrite would lose, and
reads the rules back to prove the branch matches and nothing else moved —
before the site publishes. Never paste the whole file over the console
again; that is what `rules.js` exists to stop.

The database is the one the app uses: `rules.js` reads `databaseURL` and
`projectId` from index.html's Firebase config and refuses a key for any other
project. The project is `bottlefolio`. `bottle-tracker-7d3a1` is the old,
dormant one, and the first automated deploy went there by mistake
(2026-09-15). The admin Remove person flow reads another user's
`shares/{uid}` and `requests/{uid}`; keep those admin reads.

To compare live with the file at any time, on BZ's PC:
`FIREBASE_SA_FILE=%USERPROFILE%\.bottlefolio\firebase-admin.json node rules.js diff`.
The admin key lives only there and in the `FIREBASE_SA` secret; push.py
refuses any key file.

---

## Facts that are easy to get wrong

Carried out of `HANDOVER.md`, `HANDOFF.md` and `REVIEW.md` when those four
papers were retired to `_superseded/2026-09-15/` on 2026-09-15. Each was
re-checked against the file that day rather than copied forward.

- **`data.json` ships an empty shelf on purpose.** 325 catalogue entries,
  **0 bottles and 0 flights** — a new user starts empty. BZ's own shelf
  lives beside the app in `bz-bottles.json` / `bz-flights.json` and is
  never shipped.
- **The bar shelf is inventory, and `L.isWhisky` / `L.NOT_WHISKY` are the
  one place that says which is which.** Rum, vodka, gin, mezcal, tequila,
  liqueur and FLAVORED count as bottles and are excluded from every
  analysis. Flavored joined on 2026-09-24, on the law: 27 CFR 5.151 makes
  flavored spirits a class of their own and 5.155 redesignates the class
  once more than 2.5% is added, so a flavoured whiskey is a flavored spirit
  whose base was whisky. It is stock on the shelf; it is not whiskey, and it
  is never recommended (BZ: NEVER RECOMMEND FLAVORED).
- **The guest rules are BZ's, not derivable.** Five things hold them, and
  they are a ladder: `L.POUR_RUNGS` is the rungs, `L.rungOf` puts a bottle
  on one, `L.ADJACENT_TYPES` says which types are down the road, and once a
  pick has crossed the pond `L.POND_ORDER` and `L.pondRank` say who greets
  it. He corrected them five times in one sitting; three of five attempts to
  reason them out from first principles were wrong. Read them, do not
  re-derive them.
- **Two doors to the service, and both read through `readService`.**
  `postWithRetry` for POSTs, `askService` for questions. `readService`
  turns a stale Apps Script deployment into a sentence rather than a parser
  error. `consistency.js` fails a third door.
- **The Firebase web API key in `index.html` is not a secret.** It
  identifies the project and authorises nothing; every protection rests on
  `firebase-rules.json`, which is why the rules review matters and the key
  does not.
- **A described whisky has a nose AND a palate.** BZ decided it on
  2026-09-16; `L.slotOpen(p, 'notes')` holds the whole rule and every notes
  question asks it. A person's note short of a part is added to, never
  replaced (`L.noteMerge`).
- **The library intake acts on its own.** Offers are sorted, looked up
  within a daily budget (Settings, default 100) and complete ones added
  without a press, stamped `autoIn` and listed for a fortnight with a take
  back. It reads the library fresh every run and judges nothing if the read
  is empty, because against an empty library every offer looks new.
- **Only an admin writes the shared library** (rules, v2.4.17). Everybody
  else offers through `offerToLibrary`, which files the offer in `contrib`;
  an old comment or paper that says anybody may create a library entry
  predates that.
- **One search, one house key.** Every search box asks `L.matchesSearch`;
  every "same distillery?" asks `L.houseSame`, which asks `L.houseKey`.
- **A signed-in account's own node is deliberately unbounded.**
  `bz-apps/whisky/$uid` bounds who writes and not what shape, because a
  `.validate` on a node whose shape changes with every feature would break
  weekly. Accepted with its eyes open (REVIEW.md §1.3, 2026-09-03), and the
  only unbounded write in the app.

---

## What this app has learned the hard way

Short list, because each one cost a day. The detail is in `CHANGELOG.md`,
which is the reliable record — `BACKLOG.md` baselines at v2.0.48 and the
build is far past it, so a good deal of what it lists as open is done.

**One thing, done one way.** `L.ACTIONS` declares each fundamental user
action and the single function every screen must go through to perform it;
`consistency.js` fails any screen that invents its own. This exists because
looking a bottle up had grown five different shapes across seven places and
photographing something had three — every one correct on its own, which is
why nothing caught them. A test that drives one path at a time cannot see
two screens disagreeing.

**Never reason about data you cannot see.** The user's shelf, the deployed
build, the log, the device. Every confident claim about any of those has
been wrong. Instrument, ship, read what comes back — a build that logs its
decision per item settles in one round what inference does not settle in
six (rule 13c).

**State the population with the measurement** (rule 13d). Not "325 entries
have a proof" but "325 entries on a filled-in shelf, which is the end state
of a shelf and not the one somebody imports tomorrow". Written that way the
overreach is visible while you are writing it.

**A check that cannot fail is not a check.** Break the thing on purpose and
watch it go red before trusting a guard. Several have been green for the
wrong reason: one was satisfied by a word appearing inside the sentence
that *forbade* it; another excused every caller because the excuse pattern
matched the thing being tested.

**A passing build can still lie.** Every check in this project proved
that the code RUNS. On 2026-09-15 two screens said false things with all
4,700 assertions green: a Penelope question answered "nothing" above a card
offering "a stronger Penelope", and a Manzanilla ask said the bottle "may
not exist". `answers.js` reads the sentences — it drives the planning
answer with real questions against BZ's real shelf and fails on a screen
that contradicts itself, on a sentence from `L.SAYS_NEVER` (nothing this
app can see establishes that a whisky does not exist) or `L.SAYS_NOT_HERE`
(an answer does not explain itself by naming the library), and on a house
on the shelf coming back as one he does not own. The screens register what
they claim in `ANSWER_SAID`; in the app that only writes to the log.

**A check that finds calls cannot find copies.** The two-doors check
fires when one function calls another and returns its answer, so a rule
typed out a second time was invisible to it - four were added in one day
with every check green, twenty-one engine functions spelled out "these two
names are one bottle" for themselves, and the lookup limit was checked in
seven places with four wordings. `consistency.js` now reduces every function
to its shape and fails any decision that appears in two functions, in the
engine AND the screens (2026-09-16). What it still cannot see is a rule
written *differently* twice - `enhanceDiff` kept its own notes rule that way
and it was found by reading. When two things answer one question, one of
them asks the other; there is always a door to route through (`sameName`,
`sameBottle`, `rowFaults`, `slotOpen`, `spendLookups`, `offerToLibrary`).

**Read what a function returns before using it.** Twice in one day a return
shape was assumed rather than opened — `postWithRetry` answers a fetch
`Response`, `askForCandidates` answers `{all, capped}`. Both broke a screen.

**Comments say why, not the story** (BZ, 2026-09-16). The story of a fix
goes in CHANGELOG.md; a comment keeps what the code does when that is not
obvious, why the obvious alternative breaks, and BZ's rules. On 2026-09-16
comment text was cut from 751KB to 434KB with every code token proven
unchanged.

**An edit script that asserts on several patterns writes nothing if a later
assert fails** (rule 16a). Verify the change is in the file before
reporting it. One edit per script is the cheap way to avoid this.

---

## Files worth knowing

| | |
|---|---|
| `index.html` | the app |
| `admin.html` | **the admin page** — a desktop page beside the app that reads the engine out of `index.html` rather than copying it. See The admin half |
| `admin.js` | the admin page's check, including index.html's anchors broken on purpose |
| `sw.js` | service worker, cache name bumps with the version |
| `lookup.gs` `shelf.gs` `label.gs` `recap.gs` | the service |
| `data.json` | the shipped catalog, ~325 products |
| `map.json` | regions and distillery geography |
| `killer-bs-test.js` | the assertions |
| `consistency.js` | the wiring checks |
| `browser.js` | the walk |
| `answers.js` | what the answers say, graded against the real shelf |
| `engine.js` | loads the `L.` engine out of index.html for every tool |
| `popular.js` | the nightly what's-popular count (`.github/workflows/popular.yml`) |
| `shots.js` | every screen at phone size, into `shots/` |
| `check.js` `checks.json` | **the one way to run the checks** — four at a time, longest first, only the ones a change can break; the table both it and `gate.py` read |
| `cost.js` | **what the engine costs** — a synthetic load and a budget that ratchets down. Every other check proves the code RUNS; this one proves it runs fast enough |
| `ios.js` | **the app in WebKit, the engine iOS ships** — every other browser check drives Chromium, so a WebKit-only fault was invisible until 2026-09-29 |
| `DOORS.md` | **every question the engine answers, and what answers it** — generated by `doors.js`, checked by `consistency.js`. Search it before writing a function |
| `CHANGELOG.md` | what changed and why, every build |
| `..\DEV-RULES.md` | **the working agreement, shared by every app** — loaded automatically; published into the repo by push.py |
| `README.md` | what the app is, and how to run the checks and ship |

Four papers were retired on 2026-09-15 and are in `_superseded/2026-09-15/`:
`HANDOVER.md` (written at v1.26.0, when the app was called Bottle Tracker
and lived in another repo and another Firebase project), `HANDOFF.md`
(v2.0.48, superseded by this file and `README.md`), `REVIEW.md` (a v1.5.0
code review whose own status line says all six recommendations shipped in
v1.5.1) and `RECAP-SETUP.md` (a walkthrough for a one-line Apps Script edit
that is in `Code.gs` and has been deployed since). Everything in them that
was still true is above, in `DEV-RULES.md`, or in `README.md`. They are kept
because they are the record, not because they are current — do not take a
fact from one of them without checking it against the file first.
