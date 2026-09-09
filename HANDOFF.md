# Bottlefolio — handoff at v1.9.18

Written 2026-09-08, late, replacing the v1.9.10 version.

---

## 0. START HERE — ONE ZIP, NO ASKING

**Begin every session with a single zip of the whole working directory.**
The v1.9.10 session cost four separate uploads and a rebuilt harness because
this file listed only part of what was needed. It lists all of it now.

Zip **everything** in the folder. The exact list, none of it optional:

| File | Why |
|---|---|
| `index.html`, `sw.js` | the app |
| `bottlefolio-v<latest>.html` + `-sw.js` | the audit compares against these |
| `killer-bs-test.js` | the unit suite |
| `consistency.js` | wiring checks |
| `browser.js` | the walk |
| `sync.js` | the sync cycle |
| `fake-firebase.js` | **sync.js will not run without it** |
| `audit.py` | the delivery gate |
| `bump.py` | the only way versions change |
| `ship.py` | runs the gate end to end |
| `CHANGELOG.md` | the audit fails without an entry for the current version |
| `BACKLOG.md`, `DEV-RULES.md`, `HANDOFF.md` | rules and what is open |
| `data.json` | shipped catalogue — suite and audit both read it |
| `map.json` | the map — the suite reads it |
| `bz-bottles.json`, `bz-flights.json` | **BZ's real shelf; the suite will not start without them** |
| `shared-catalog.json` | shared library snapshot |
| `manifest.json`, `mark.png`, `icon-192.png`, `icon-512.png`, `zxing.min.js` | the audit checks all are precached |
| `firebase-rules.json` | pasted by hand; never deploys |
| `lookup.gs`, `label.gs`, `shelf.gs`, `recap.gs`, `recap-handler.gs` | the Apps Script side |

Most of it is also in the repo and can be fetched directly:

    curl -sL -o repo.tar.gz \
      https://codeload.github.com/bzrimsek/Bottlefolio/tar.gz/refs/heads/main

**The repo is not authoritative for the harnesses.** On 2026-09-08 its
`consistency.js` was two checks behind, `CHANGELOG.md` stopped at v1.8.45,
`map.json` could not place France, and `fake-firebase.js`, `bz-bottles.json`
and `bz-flights.json` were not in it at all. Take `index.html` and `sw.js`
from the repo to reconcile; take the rest from the zip and push the
difference back.

**Never ask BZ for a file without checking the repo first.**

---

## 1. RECONCILE FIRST (rule 32)

    curl -s -o live.html https://raw.githubusercontent.com/bzrimsek/Bottlefolio/main/index.html
    grep -m1 "const APP_VERSION" live.html
    grep -m1 "const APP_VERSION" index.html

They must match, or `bump.py` collides with a number that already shipped.

---

## 2. THE GATE

In order, reporting each as it lands (rule 25c), never silently:

    node killer-bs-test.js     # 3459 assertions at v1.9.18
    node consistency.js        # 27 checks
    node sync.js               # nine scenarios — SEE SECTION 5
    node browser.js            # the walk
    python3 audit.py           # 26 checks; refuses if the locks differ

Playwright is present, the browser binary is not: `npx playwright install
chromium` once per container.

Delivery is `index.html` + `sw.js` + both lock files. Hand over only what
changed.

---

## 3. WHERE THE BUILD IS

- **v1.9.18** — 3459 assertions, 27 consistency checks, 26 audit checks,
  walk green.
- `sync.js` has **not run since v1.9.10**. See section 5.
- Nothing is half-shipped.

---

## 4. WHAT IS OPEN, IN BZ'S ORDER

### 4a. Cross-buddy — do this first

Asked four times, deferred four times.

Today the Buddies tab shows a folder tab per person **who shares with you**,
and a separate "Tasting buddies" card above listing people **you share
with**. Different sets — so one person can appear twice, or once as an
unnamed row and once as a named tab. That is the disconnect BZ keeps
photographing.

**One tab per person, union of both directions**, each showing where you
stand both ways: they can see yours (with the toggle), you can see theirs,
ask them to share back. The Tasting buddies card dissolves into the tabs.
Everyone keeps the room, the invite and the directory.

- `fbSharesMine()` is async, returns `[{uid, name}]`. Cache onto
  `SHARED.outList` (today only the count survives, as `SHARED.out`) so tabs
  render before the fetch lands and re-render when it does.
- Tab ids = union of `Object.keys(SHARED.shelves)` and that list.
- `buddiesOnePanel` gains the status block. Someone who shares with you but
  cannot see yours gets the comparison plus an Ask; the reverse gets the
  toggle plus a line saying they have not shared back.
- `renderBuddies` keeps only what belongs on Everyone.
- `browser.js` already drives the panels at three buddies — extend that
  step, do not write a second one.

### 4b. The profile

- **Style scarcity constants.** Approved, not built. `The Loyalist` fires on
  Buffalo Trace's 26 over Laphroaig's 24 because a raw count treats a
  bourbon-soaked market as neutral. Weight the chip's own evidence by
  category scarcity — bourbon 1.0, rye 1.3, Scotch 1.6, Irish 2.0, Japanese
  2.6, world 3.0. **These numbers are invented, not measured** (rule 26b):
  a claim about the US market, and the constant must say so, because the
  library can measure real base rates once enough shelves exist. Apply only
  to chips naming a category — `house`, `region`. Never `peat`, `repeat`,
  `sealed`, `rare`: smoke is smoke whatever the market does.
- **`STORY_OPENERS` has no set-title entries**, so a set falls back to its
  leading chip's opener. `L.TITLE_LINES` covers the subtitle; the opener
  still does not.
- **The veto has no control.** `L.portraitPick(earned, dismissed)` takes a
  map of dismissed titles and nothing sets it. BZ asked for "not me": a
  veto, never a picker — a title must be earned, so choosing your own is
  flattery. `deadGaps` is the pattern and it already syncs.

### 4c. The library — held at BZ's word, confirm before starting

- **A delete does not stick.** `offerLookupToLibrary` fires on every lookup
  by anyone and, for an admin, writes **straight in with no review** — so an
  admin can delete an entry and resurrect it in one search. `fbContribute`
  re-offers it too. Neither checks whether a human removed it. Needs
  `shared/catalog/removed/<key>` as a tombstone, skipped by both automatic
  paths, cleared only by a deliberate Add. **Rules change — rule 33.**
- **Lookup-to-fill-blanks in the library editor.** Started, unfinished.
  `editLibraryEntry` wants a button that looks the entry up and fills only
  EMPTY inputs, so an admin reviews before it reaches everybody.
  `askLookup(name, ms, need)` then `L.parseLookup` is the primitive. Do NOT
  fire `libraryFillStart` from inside the editor — it writes to the library
  behind the open form.

### 4d. The lookup URL must be an admin setting

BZ: "this must be an app wide setting set by admin." Today
`DEFAULT_LOOKUP_URL` is a constant in the file, so rotating the Apps Script
URL means shipping a new version to everyone.

`bz-apps/whisky/shared/config` holding `lookupUrl`, admin-writable and
world-readable, read once beside the catalogue stamp. Precedence: the user's
own setting, then the shared config, then the shipped constant as a floor
for a first paint or an offline start. **Rules change — rule 33** — so
`firebase-rules.json` ships as its own file with its own walkthrough and BZ
pastes it BEFORE the build lands.

### 4e. Carried, untouched

- `deleted` syncs by replacement — same class as the wishlist bug fixed in
  v1.8.81, but it can *shrink*, so a plain union would resurrect a deletion
  somebody undid. Tombstones; a decision, not a patch.
- The empty-opening-block walk step is **not verified against its bug**.
- `parseUpcListing` retained unwired; `pickFromList` rebuilt in the harness.
- 13 untested helpers on a ratchet that can only shrink.
- Performance: `boot()` draws 8 screens when 1 is visible (67ms wasted);
  84–177ms document parse. Diagnosed, never touched.
- Camera in the other moments; library export to CSV/Excel under shelf
  settings; good/better/best hints; `sub: world` has no blend in `L.TYPES`.
- The orphan shelf: `LFp1OyZG3EfmhiIfUSXTfwzetJ22` carries 347 bottles and
  has no Auth account — uids are per-project and did not travel from
  `bottle-tracker-7d3a1`. BZ's business, not the app's.

---

## 5. sync.js — WHY IT HAS NOT RUN IN EIGHT BUILDS

`fake-firebase.js` was lost with the v1.9.10 container. It is **rebuilt and
in the repo**, but **not proven, and the harness still does not run.**

The failure: the app never reaches auth against it. `index.html` asks
gstatic for **three** compat scripts — app, auth, database, around line
32295 — and `sync.js` answers only the first with the fake; the other two
get empty bodies. Something in that sequence stops firebase installing.
Debug by loading the page against the fake and reading `FB.user` and
`firebase.__store.log`; on 2026-09-08 both were empty, so the fake installed
and nothing ever called it.

**When it runs, do not trust it green.** Break each of the nine fixes in
turn and confirm the matching scenario goes red. Two earlier attempts were
unknowingly hitting the real server and proved nothing; a green from an
unproven stub is worth less than an honest red.

Interface: `window.makeFakeFirebase(seed, opts)` returning a compat-shaped
object with `__store.data` (the tree) and `__store.log` (every operation,
carrying `op`, `path`, `bytes`, `keys`). Seeds are **nested objects**, not
slash paths.

---

## 6. A PASTE IS NOT A DEPLOY

Any delivery with a `.gs` file is half done when BZ pastes it. Apps Script
serves the **deployed** version, not the saved one.

**Deploy → Manage deployments → pencil on the EXISTING deployment → New
version → Deploy.** Not "New deployment", which mints a URL the app is not
pointing at.

Call it **Code.gs** in the handover; it ships as `lookup.gs` and lives in
his project as Code.gs. `label.gs`, `shelf.gs`, `recap.gs` match both sides.

`probeWiring` cannot catch a stale deployment — it runs in the editor
against saved code and reports every mode present while the live web app
runs months-old code.

---

## 7. WHAT WENT WRONG ON 2026-09-08

- **A helper's shape is part of its contract.** `importAudit` read
  `houseVariants`' groups as arrays when they are `{spellings:[...]}`. It
  fires only on a shelf that HAS two spellings of one house — BZ's has none
  — so the whole gate passed while the first shelf that had them crashed on
  the first press.
- **A shared helper's blast radius includes the references it leaves
  behind.** `L.clearFacets` returned a new object; assigning it over
  `S.filters` orphaned every held reference and the shelf lost its back
  button. Both callers were measured. The references were not.
- **Two functions must not answer one question.** `guessSub` reads a
  category from words; a house-based reader was nearly built beside it. They
  were measured against each other first — 61 rows where both fired, zero
  disagreements — and folded into one.
- **A default that only reaches an empty device is not a default.**
  `DEFAULT_LOOKUP_URL` lived in the initial state object, so 91KB of older
  localStorage beat it on every account that ever signed in there.
- **The obvious guesses find nothing on a curated shelf.** BZ's 325 carry no
  ABVs in the proof field, no impossible ages, no two-country houses. The
  population with bad data is the one that arrives.
- **A column can be read from the wrong place and look fine.**
  `matchColumns` took the first header matching a field's aliases; an Only
  Drams export carries both `Category` and `Subcategory` and 220 of 228
  whiskies landed as bourbon.

---

## 8. WORKING FILES

`/home/claude/bottlefolio/`. It was `/home/claude/kb/` in sessions 3–4 and
`/home/claude/dram/` in 1–2; `complexity.js` still hardcodes
`/home/claude/kb/`. Outputs stage to `/mnt/user-data/outputs/`.
