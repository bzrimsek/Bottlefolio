# Bottlefolio

A whiskey collection app. One file, `index.html`, about 1.9 MB, plus a
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

```
python3 bump.py "what changed, in full sentences"
```

That is the **only** way to set a version (rule 9). It writes five places
and the changelog entry. Never edit a version by hand.

Then the gate, all ten, in this order:

```
python3 audit.py          # the named lock matches index.html
node lint.js              # nothing undefined, duplicated, unreachable
node killer-bs-test.js    # ~4,600 assertions
node consistency.js       # ~66 wiring checks
node screens.js           # 21 screens draw
node render.js            # screens agree with the engine
node twotab.js            # two devices, merge holds
node gscheck.js           # Apps Script wiring
node browser.js           # the walk, a real browser  (~45s)
node sync.js              # push, load, reload, refuse (~78s)
```

All ten must pass. Report each one as it lands rather than running the
loop silently (rule 25c) — and read the whole output of each, not the last
line; a check once sat broken for several builds because the failure was
thirty lines above a blank final line.

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

**Read what a function returns before using it.** Twice in one day a return
shape was assumed rather than opened — `postWithRetry` answers a fetch
`Response`, `askForCandidates` answers `{all, capped}`. Both broke a screen.

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
| `CHANGELOG.md` | what changed and why, every build |
| `DEV-RULES.md` | **the working agreement — read it** |
