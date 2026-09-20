# Bottlefolio

A whiskey collection app. It knows what you own, what you have poured, what
you have tasted and what you are missing, and it runs on a phone from the
home screen with no network.

Live at **https://bzrimsek.github.io/Bottlefolio/**.

---

## The shape of it

**One file.** `index.html` is about 1.9 MB and is the whole app — markup,
CSS, engine and screens. No build step, no framework, no bundler: what is in
that file is what runs.

The file is two halves, and which half code belongs in is not a matter of
taste:

- **The engine** — everything on `L.`, from `const L = {};` down to the
  `STATE + RENDER` banner. Pure functions: no DOM, no `S.`, no network. The
  test harness loads only this half, so logic outside it ships untested.
- **The screens** — everything after that banner. Templating only. A render
  function that computes something extracts the computing into a named `L.`
  helper and calls it.

`S` is the app state, `LIB` the shared library, `L` the engine.

Beside it: `sw.js` (the service worker — precaches the shell, serves the
data files network-first), four Apps Script files that run as a deployed web
app and answer lookups, label photographs and write-ups, and
`firebase-rules.json` for the database.

The site serves **eleven files** and nothing else — `index.html`, `sw.js`,
`manifest.json`, `mark.png`, the four icons, `zxing.min.js` (the barcode
decoder, for browsers with no `BarcodeDetector`, which means every iPhone),
`data.json` and `map.json`. That list is every same-origin file `index.html`
and `sw.js` name, and it is what the publish workflow packages.

---

## Running the checks

Ten of them, and all ten must pass. `gate.py` runs them in the right groups
and times each one:

```
python gate.py            # all ten
python gate.py --fast     # the eight quick ones
python gate.py --slow     # the walk and sync
python gatetime.py        # what each step takes, median of the last nine
```

Individually, in gate order:

```
python audit.py index.html   # the named lock file matches index.html
node killer-bs-test.js       # 5,344 assertions against the engine
node lint.js                 # nothing undefined, duplicated, unreachable
node consistency.js          # 80 wiring checks
node screens.js              # 21 screens draw
node answers.js              # what the answers SAY, on a real shelf
node shots.js                # every screen at 390px, photographed
node seq.js                  # screens in pairs, for what one leaves behind
node papers.js               # both papers, one landscape page each
node render.js               # the screens agree with the engine
node twotab.js               # two devices, merge holds
node gscheck.js              # Apps Script wiring
node browser.js              # the walk, in a real browser   (~45s)
node sync.js                 # push, load, reload, refuse    (~78s)
```

Report each one as it lands, and read the whole output of each rather than
the last line — a check once sat broken for several builds because the
failure was thirty lines above a blank final line.

`consistency.js` also carries the size ratchet: every top-level function in
`index.html` is measured in code lines, today's oversized ones are allowed by
name at today's size, and anything that grows fails. When one shrinks, run

```
node consistency.js --sizes
```

and paste the block it prints over `BIG_TODAY` in `consistency.js`.

### On BZ's PC

Run Python as the real interpreter, not the one on `PATH`:

```
%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe
```

The `python` on `PATH` is the WindowsApps alias, which cannot see the
Playwright browsers, so under it the audit's browser checks crash — and
since 2026-09-15 a crash fails the audit, so the push stops there.

---

## Building and shipping

Two commands:

```
python bump.py "what changed, in full sentences"
python push.py "short subject for the commit"
```

`bump.py` is the **only** way to set a version. It writes five places —
the file header, `APP_VERSION`, `BUILD_TIME`, the UI string and `sw.js`'s
`CACHE_NAME` — and the changelog entry. Never edit a version by hand.

`push.py` audits here, re-seals BZ's shelf files if they changed, sends
every changed file to the `build` branch as ONE commit, and then watches the
cloud gate and prints each step as it lands.

```
python push.py --dry-run   # list what would go; send nothing, write nothing
python push.py --no-wait   # push and return without watching the run
```

`push.py` refuses to run unless `audit.py` has passed, and refuses to push
while an earlier gate run on `build` is still queued or running.

### The cloud gate

`.github/workflows/gate.yml` runs on every push to `build`, on GitHub's
servers, with the clock pinned to UTC. In order:

1. all ten checks;
2. a refusal if `main` has moved since this build was made;
3. the Apps Script service, if any of `Code.gs`, `label.gs`, `recap.gs`,
   `shelf.gs` or `apps-script/appsscript.json` changed — pushed with clasp
   and redeployed on the SAME deployment, so the URL never changes, then
   asked which build it is running;
4. the Firebase rules, if `firebase-rules.json` changed — `rules.js deploy`
   swaps in this app's branch and nothing else, and reads it back to prove
   it;
5. `main` moves to this build;
6. the eleven site files are packaged and published to GitHub Pages;
7. the live site is polled until it serves the new version.

A red gate leaves the live site, service and rules exactly as they were. The
service goes before the site, because a page that needs a new service must
never arrive first.

**A delivery is `index.html` + `sw.js` + both named lock files.**

---

## Where the docs live

| | |
|---|---|
| `DEV-RULES.md` | **the working agreement — read all of it first** |
| `CLAUDE.md` | how this repository works, and the facts that are easy to get wrong |
| `CHANGELOG.md` | what changed and why, every build — the reliable record |
| `BACKLOG.md` | what is open; baselined at v2.0.48 and behind the build |
| `_superseded/` | retired papers, kept as the record and not current |

---

## The data rules

- **BZ's shelf never goes up in the clear.** `bz-bottles.json` and
  `bz-flights.json` go to the public repo ONLY as `.gpg`. The key is
  `%USERPROFILE%\.bottlefolio\shelf.key`, outside OneDrive, and the same key
  is the repo secret `SHELF_KEY`. `push.py` refuses to send a plain shelf
  file, a CSV, the database export, a Firebase key file or `_superseded/`.
  The site does not serve the sealed files either: neither `index.html` nor
  `sw.js` mentions them.
- **`data.json` ships an empty shelf on purpose.** 325 catalogue entries,
  0 bottles, 0 flights — a new user starts empty.
- **The Firebase web API key in `index.html` is not a secret.** It
  identifies the project and authorises nothing. Every protection rests on
  `firebase-rules.json`. The project is `bottlefolio`;
  `bottle-tracker-7d3a1` is the old, dormant one.
- To compare the live rules with the file, on BZ's PC:

  ```
  FIREBASE_SA_FILE=%USERPROFILE%\.bottlefolio\firebase-admin.json node rules.js diff
  ```

  The admin key lives only there and in the `FIREBASE_SA` secret.
