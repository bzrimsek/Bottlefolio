# Bottlefolio

A whiskey collection app. One file, `index.html`, about 1.75 MB, plus a
service worker and four Apps Script files. No build step, no framework, no
bundler — what is in `index.html` is what runs.

---

## The rules

**Read `DEV-RULES.md` first. All of it.** It is the working agreement and
it is current. This file does not repeat it and must never start to: two
copies of one rule set is exactly the fault those rules exist to prevent
(30d), and the day they disagree is the day neither is trusted.

If a rule turns out to be wrong or missing, change `DEV-RULES.md`. Do not
write a second version of it here.

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

The gate, all seventeen, in this order — `gate.py` runs them in the cloud
with the clock pinned to UTC. Nothing depends on that any more: §351 used to
fail on BZ's PC and pass in the cloud, because it stamped a date at midnight
UTC and `L.todayISO` answers the LOCAL calendar day on purpose — so the one
instant that lands on a different day everywhere west of Greenwich. It stamps
noon now and passes in Ohio, UTC and Tokyo alike (2026-09-27). A standing red
check locally is worth removing: it teaches you to ignore red.

```
python3 audit.py index.html  # the named lock matches index.html
node killer-bs-test.js    # ~5,300 assertions
node lint.js              # nothing undefined, duplicated, unreachable
node consistency.js       # 80 wiring checks, incl. rules copied twice
node screens.js           # 21 screens draw
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
node cost.js              # what the engine COSTS, against a ratcheting budget
node rulestest.js         # the Firebase rules, run in the emulator
```

`rulestest.js` needs Java, so it runs in the cloud gate only (BZ,
2026-09-16); on BZ's PC it prints SKIPPED, which is not a pass. It also runs
the suite against rules broken on purpose and fails if it misses one.

All seventeen must pass. Report each one as it lands rather than running the
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

A delivery is `index.html` + `sw.js` + both named lock files (rule 25).

`push.py` sends a finished build to the repo and refuses to run unless
`audit.py` has passed.

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
- **The guest rules are BZ's, not derivable.** `L.ROAD_TO`,
  `L.ROAD_NEIGHBOURS` and `L.POND_ORDER` hold them. He corrected them five
  times in one sitting; three of five attempts to reason them out from
  first principles were wrong. Read them, do not re-derive them.
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
| `DEV-RULES.md` | **the working agreement — read it** |
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
