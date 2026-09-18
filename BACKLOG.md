# Backlog

Open work, in the order BZ set on 2026-09-03: security, then performance,
then finding the bottle — with one class placed above all three on
2026-09-15: **stored data that is wrong comes first**. Everything else here
is code that can be fixed forward; a wrong value already in somebody's shelf
cannot.

Last reconciled **2026-09-15, at v2.4.4**, entry by entry against
`index.html` (APP_VERSION 2.4.4, line 2531), `Code.gs`, `consistency.js`,
`sync.js`, `sw.js`, `firebase-rules.json`, and every CHANGELOG entry from
v2.0.49 to v2.4.4. The pass before was 2026-09-10 at v2.0.48, about a
hundred and fifty builds back — and one entry it called "not started" had
already shipped at v1.9.33 (the boot renders), which is the fault below
happening again.

## How this file works — three rules

1. **Open the code before calling an entry open.** A status read off a
   headline has been wrong here more often than right (see "How the previous
   passes read", below). Where an entry names a function, the check is
   whether it is defined and whether anything calls it; where it names a
   behavior, the check is the call site.
2. **Close in place. Never delete.** A closed entry keeps its text and gains
   a status line at the top: CLOSED, which version, and what was checked.
   "Closed at v2.0.14" is useful to the next reader; a line that vanished
   looks like an oversight and gets raised again.
3. **An unchecked premise says so (rule 26b).** Any entry resting on a fact
   nobody verified carries **UNCHECKED:** and names the fact. HANDOFF once
   said a mash bill is printed on most American whiskey; six photographs
   disproved it in twenty minutes, and a feature had been built to the wrong
   brief until then. An unmarked assumption becomes a requirement by the
   time somebody reads it back.

Five kinds of open, not one: stored DATA that is wrong, a DEPLOY waiting on
one button, CODE, a DECISION from BZ, and the WORLD — a second person, a log
line that has not recurred, a fill that has not run. Only code is something
to pick up and start; the deploy is one press.

---

## WHAT IS ACTUALLY OPEN, 2026-09-15 — the short list

### 0. Stored data that is wrong — FIRST

**Dragged fill levels were saved inverted from v2.3.17 to v2.3.35, and no
repair exists.** Checked 2026-09-15.
**CLOSED 2026-09-15 — BZ: close the issue, I believe it is ok; I'll re-open if
there are other issues.** Nothing was repaired or rewritten, because the
log could not name a single target. If a wrong level turns up, a full
bottle wrongly saved nearly empty shows in the Shop's Running low list;
dragging it now saves the right value.

What happened (CHANGELOG v2.3.35): the gauge's range used
`writing-mode:vertical-lr` with `direction:ltr`, which puts the MINIMUM at
the top, so every level set by dragging stored 110 minus what was meant. A
bottle set near full stored 10, and Shop correctly called it nearly out.
Fixed FORWARD at v2.3.35: `direction:rtl` is back (index.html:804) and the
walk clicks each end and reads the value back.

The window, checked against the shipped files rather than taken from the
changelog: v2.3.15 still set the range vertical with
`-webkit-appearance:slider-vertical`; v2.3.17 removed that (its own entry
says so); v2.3.20 carries `direction:ltr`; v2.3.35 carries `direction:rtl`.
In time: 2026-09-12, 07:33 AM to 09:25 PM ET. Levels read from a photograph
write a percentage directly and were never affected.
**UNCHECKED:** that v2.3.15's `slider-vertical` put the minimum at the foot
in BZ's browser. That is inferred from the property, not clicked, and the
v2.3.16 file is not in this folder.

Nothing repairs the stored values. Checked 2026-09-15: nothing in
index.html rewrites a stored fill.

**Why the repair cannot be a formula.** `b.fill` is a bare number with no
source and no timestamp. The drag writes `b.fill = L.fillSnap(sl.value)`
(index.html:21198) and a photograph writes `b.fill = r.now`
(index.html:23818) — same field, same shape. So the stored data cannot tell
a value dragged inside the window from one set before it, one read from a
photograph, or one re-dragged since v2.3.35 and already right. Un-inverting
every fill would corrupt every one of those that was always correct. **A
repair that cannot identify its targets does not guess.**

**The only discriminator is the log.** A drag logs `fill: <key> at N%`
(index.html:21201); a photograph logs `fill: set n level(s) from a
photograph` (index.html:23822). A drag inside the window, on a bottle with
no later drag or photograph, is a proven target, and its correct value is
110 minus the logged number. So the honest options are exactly two:
**repair what the log proves and leave the rest, or ask BZ** about any
bottle the log cannot settle. There is no third option, and "un-invert
everything in the range" is not one.

**THE LOG CANNOT SETTLE IT — checked 2026-09-15.** BZ copied the log on
2026-09-15 at 12:33. It holds 600 lines (`S.log` is capped there,
index.html:37925), its oldest line is 09/14 10:21:01, and there is not one
`fill:` line in it. The copy in Firebase is no older: `fbPushDiag`
overwrites one document per account with the tail of the same log
(index.html:38953–38959). Nothing the app keeps reaches 2026-09-12. So the
log proves no targets, the repair it can justify is **nothing**, and the
decision is BZ's — it is in §4.

What that day did hold: a photographed levels read went through on
2026-09-12 (CHANGELOG v2.3.20), and a photograph writes the correct value.
Some levels set that day are right and look exactly like the wrong ones —
the case against a blanket repair, in his own data.

**UNCHECKED:** how many bottles are affected, and whether any device of his
ran a build inside the window at all — the gauge is opt-in (v2.3.0). The
values ride the account sync, so wherever they are wrong they are wrong on
every device.

**A category stored as bourbon when nothing was known.** Three places read
`sub || 'bourbon'`, and on the shop path that WROTE bourbon for a label read
that came back with no category (CHANGELOG v2.3.21). Fixed forward at
v2.3.21: all three guess from the name and otherwise say Not sure. No
cleanup was written. **UNCHECKED:** whether any stored bottle actually
carries a bourbon that came from this; the v2.3.21 entry does not say when
the shop write began, so the window is open at the start. Same rule as the
fill levels: a real bourbon looks identical, so nothing changes without
evidence per bottle. `L.guessSub` disagreeing with a stored bourbon is a
lead, not proof.

### 1. The deploy — Code.gs CLOSED, two files still unchecked

**CLOSED 2026-09-15 for Code.gs: the live service answers build 2.4.0,
current.** BZ pressed Check the service after this entry was written. The
deployment matches `GS_BUILD` in Code.gs and `L.GS_BUILD` in index.html, so
the v2.4.0 prompt change (the open category list) is live. What the button
cannot see is still open — the last bullet below. The entry is kept as it was
written.

**Is Code.gs 2.4.0 live?** Press **Check the service** in Settings. It asks
the live deployment which build it is running (`mode: 'version'`,
Code.gs:130), which is the only thing that can answer — a paste, a saved
file and a green `probeWiring` all run against saved code.

- The file: `GS_BUILD = '2.4.0'` (Code.gs:40), matching
  `L.GS_BUILD = '2.4.0'` (index.html:18748). Checked 2026-09-15.
- BZ deployed through **2.3.93**. v2.4.0 changed Code.gs again — the prompt
  stopped closing the category list at eighteen, so a single grain Scotch, a
  rice whisky or a genever can come back (CHANGELOG v2.4.0) — and no deploy
  has been confirmed since.
- If the button answers 2.3.93: paste **Code.gs**, then Deploy → Manage
  deployments → pencil on the existing deployment → New version, and press
  the button again. A paste is not a deploy (rule 25e).
- **GS_BUILD 2.4.0 against APP_VERSION 2.4.4 is correct, not drift.** The
  service version moves only when a .gs file changes; consistency.js checks
  that the two GS_BUILD values agree with each other, not that either
  matches APP_VERSION. Leave it.
- ~~The `lookup.gs` in this folder carries no GS_BUILD at all, so it is older
  than the Code.gs beside it.~~ **CORRECTED 2026-09-15:** that was the
  folder's stale copy. The repo's `lookup.gs` (committed 2026-09-15 with the
  v2.4.4 suite) is now in the folder, and it is byte-for-byte identical to
  `Code.gs`, both at GS_BUILD 2.4.0. Code.gs is still the name to paste
  under (rule 25f).
- The confirming line, from BZ's log: `09/15 12:33:30 service build:
  deployment says 2.4.0, app needs 2.4.0 — current`. On 09/14 at 10:45 the
  same check said 2.3.70.
- What the version check cannot see: GS_BUILD lives in Code.gs only, so the
  button proves which Code.gs is live and nothing about the other files.
  What BZ's log of 09/14–09/15 shows about them:
  - **`shelf.gs` — its modes answer.** A bar shelf read succeeded on
    09/14 at 16:51 (31 bottles, 9 owned), and a photographed levels read
    succeeded on 2026-09-12 (CHANGELOG v2.3.20). **UNCHECKED:** whether the
    deployed `shelf.gs` is the latest file (paste-and-deploy flagged at
    v2.1.0, v2.2.0, and v2.3.2). A mode answering proves the mode exists,
    not which version of it.
  - **The recap route was NOT live on 09/14.** At 11:46, on deployment
    2.3.70, a recap came back "as if this were a single-bottle lookup rather
    than a recap" — the deployed doPost did not route the recap mode, which
    is the fault the `recap-handler.gs` duplicate-doPost fix (v2.0.73) was
    for. A second recap at 12:30 got a 404 after 81.9s. **UNCHECKED:**
    whether the route is live on 2.4.0 — no recap was asked for after the
    2.3.93 or 2.4.0 deploys. The next recap's log line answers it: a
    single-bottle answer means the route is still missing; a recap means it
    is there.
  - **CLOSED 2026-09-15 — both of the above, by cloning the deployed
    project** with clasp (script "Enrich Bottles"). Deployed version 32 is
    byte-for-byte the current code, and every file matches this folder:
    `Code` = `Code.gs`, `label` = `label.gs`, `recap` = `recap.gs`,
    `shelf` = `shelf.gs`. `Code.gs:133` routes `mode === 'recap'`, so the
    recap route IS live on 2.4.0; the 09/14 failure was the 2.3.70
    deployment. `recap-handler.gs` is not in the live project at all, and
    `lookup.gs` is a second copy of `Code.gs`. Neither is deployed by the
    cloud gate, which sends exactly the five files the live project holds
    (the four above plus `apps-script/appsscript.json`).

### 2. Waiting on code — mine

**A per-person daily limit on the lookup service itself — BZ, 2026-09-16:
"keep 1 on the back log".** The daily lookup cap lives in the app, so anybody
signed in who calls the Apps Script directly is not held to it, and every
call costs BZ. The fix is in `Code.gs`: count calls per verified account per
day (the id token is already checked there) and refuse past the cap, and
clamp the answer length the service asks the model for. A service change, so
it goes through the gate's Apps Script deploy.

**CLOSED 2026-09-16 (v2.4.25): the reads were removed, no writer built.** Every house merge the app offers joins spellings with the same `L.houseKey`, which already count as one house, so an alias could never change an answer. The seven `LIB.houseGraves` reads (always undefined) went; the engine's optional alias argument stays for the day two differently keyed houses need joining.

**House aliases have no writer — my loose end, not a decision.** v2.3.99
built the registry: `L.houseResolve` and `L.houseIndex` (index.html:11705,
11722), alias chains followed, cycles stopped, `snapHouse` asking the
registry. It shipped with nothing that records an alias. Checked
2026-09-15: `LIB.houseGraves` is read at index.html:20476, 28120, and 34102
and assigned nowhere, and firebase-rules.json has no node for it. Empty
aliases change nothing, which made it safe to ship — and a feature with
pending pieces is not finished however safe it is (rule 31). BZ declining
admin tables at v2.4.0 does not cover it: that ruling was about editing
reference tables, and this is the write half of a mechanism already in the
file. What it needs: the house merge, which still rewrites `dist` on every
affected bottle (v2.3.99), to record an alias instead, the way `LIB.graves`
does for products; and a rules node for it, checked against rule 20 before
anything writes. **Owner: me.**

**Two functions still answer "should I buy this".** v2.3.79 named it as the
thing to look at next: `L.wouldILike` answers from facts, `L.fitVerdict` from
findings. v2.3.80's `L.fitTwoWays` pairs `fitVerdict` with `judgeListing` on
Shop and did not retire the pair. Checked 2026-09-15: `wouldILike` is
defined at index.html:7431 and called at 12387, 33677, and 34105;
`fitVerdict` is defined at 5799 and called at 3022 and 5766. Rule 30d: one
wins, and says so in a comment. Deferred from a build, so mine (rule 31).

**An estimate before a lookup run, and a total after it.** Still absent,
checked 2026-09-15. The cap (`L.LOOKUP_CAP = 600`, index.html:18778) and the
breaker exist; this is the comfort half. Since the entry was written every
button lookup goes through `askLookup` with one 45-second ceiling (v2.3.83),
service calls share one lane (v2.3.40), and a question the app cannot place
is refused before it spends a lookup (v2.4.2).

**sync.js has no scenario for the tombstone / `wiped` merge.** Checked
2026-09-15: no scenario mentions either. Seventeen scenarios, run in slices
since v2.0.67 and in three processes since v2.3.13. The v1.9.29 storage keys
the old entry also named went with the shelf organizer (`shelfCaps` survives
only in a comment, sync.js:257), so that half is moot.

**The library fill gives a lookup 30 seconds, and the service routinely
needs more.** Found 2026-09-15 in BZ's log, 09/14 21:30–21:31 on his phone:
the fill asked about four entries, wrote one and lost three, and all three
were lost at 30.0–30.1s ("the lookup did not answer in time"); the one it
kept answered in 10.9s. The fill asks with `askLookup(x.name, 30000,
x.missing)` (index.html:30234), and the label-gap fill after a single bottle
scan asks with 30000 too (index.html:38453). v2.3.83 moved the four BUTTON
lookups to `L.LOOKUP_MS = 45000` (index.html:18776) on the evidence that
answers take 18 to 87 seconds; these two paths were not among the four, and
consistency.js's floor is 20 seconds, so 30 passes it. v2.3.83's own
argument applies unchanged: a ceiling below the ordinary answering time
throws the slow answers away, and the slow ones are the searches with work
to do. Mine, not yet built.

**Test §351 passes only on a UTC clock.** Found 2026-09-15, running the
suite on BZ's PC (Eastern): 4607 passed, 1 failed — "and when, as a date
rather than a number" got `2026-01-14` and wanted `2026-01-15`. With
`TZ=UTC` the same suite is 4608 of 4608. The fixture is
`Date.UTC(2026, 0, 15)`, midnight UTC, which is 7 pm on the 14th in
Eastern, and `L.libraryExportRows` writes the date through `L.todayISO`
(index.html:12125) in the machine's own time. The APP is right for BZ — a
contribution at 7 pm on the 14th is the 14th where he is — and the TEST
assumes the machine runs UTC. The cloud gate pins `TZ: UTC`
(.github/workflows/gate.yml), so it passes there. The fixture moved to
midday UTC would pass in every US zone. Mine, not changed without asking
(rule 5).

### 3. Waiting on evidence — each waits for a failure to recur with logging in place

The log holds 600 lines, and on 09/14–09/15 that was about 26 hours of use
(09/14 10:21 to 09/15 12:33). A failure is evidence only if the log is
copied within about a day of it.

- **Stagg: a lookup answered with five characters and stopped** (v2.3.92).
  **EVIDENCE ARRIVED 2026-09-15** in BZ's log of 09/14, 20:02–21:11, and it
  is three faults, not one:
  - *Prose after a search.* 20:02:39 and 20:03:14 on the phone, asking
    "Stag": `no JSON in the reply. stop_reason=end_turn text=Based on the
    search results, there are several "Stag" whisky bottlings…`. 21:03:50
    and 21:04:20 on the desktop: `stop_reason=end_turn
    blocks=server_tool_use+web_search_tool_result+text+…`. The model
    searched, got results and finished in prose. It did not hang and it did
    not fail to return, which answers the question v2.3.92 left open: prose.
    "Stag" is a real ambiguity, and the model said so in words instead of
    JSON.
  - *JSON the service could not parse.* 21:09:15: `JSON did not parse:
    {"name":"George T. Stagg",…`. **UNCHECKED:** what broke the parse — the
    log keeps 140 characters and the fault is past them.
  - *A real bottle rejected by the app* — the next entry.
  The v2.3.93 retry covers the first two, which arrive with no usable JSON.
  It does not cover the third, which is not an error at all.
  (The entry as written:) The cause is unknown and deliberately not guessed
  at a fourth time. The instrumented Code.gs records which block types came
  back. v2.3.93 asks once more when a reply has no JSON, and BZ confirmed
  Stagg answers on the second ask (v2.3.94). The retry keeps the screen
  working and hides the fault, so the log line is the only place it shows.
- **A lookup that answers and shows nothing** (v2.3.84). **CAUSE FOUND
  2026-09-15 from BZ's log; the decision is in §4.** Six replies on 09/14 —
  20:03:37, 20:03:56, 21:03:57, 21:08:45, 21:09:02 and 21:09:24 — carried a
  name (George T. Stagg, and once just Stagg) with Buffalo Trace as the
  distillery, and every one carried `"proof":null`. `L.parseLookup` treats a
  name and a proof together as the identity and returns null without both
  (index.html:4619), and both lookup screens log "lookup found nothing" on
  a null (index.html:28415, 35863). The app received a bottle and told BZ it
  found nothing. The same question succeeded at 21:08:34 and 21:09:56, and
  on that path a success means the reply carried a proof. So this entry and
  Stagg are partly one fault: the third of the three above.
  **UNCHECKED:** why the model returned no proof. The log shows the null,
  not the reason; George T. Stagg is a barrel-proof release whose proof
  changes by year, which fits, and nobody has asked. Also unchecked: whether
  the Yellowstone case that raised this entry was the same rule — its lines
  are older than the log.
  (The entry as written:) The lookup now logs the keys a reply came back
  with. Nothing was fixed, because nothing was known.
- **`had.forEach is not a function` in share enumeration** (v2.3.19). One gate
  run, not reproduced, explicitly not claimed fixed. An odd resolve no longer
  takes the buddies tab down, and the log line beside it names what was
  enumerated. Not in BZ's log of 09/14–09/15.
- **A shelf photograph that results in nothing** (v2.0.70). The backgrounding
  fix shipped that build; the harness reads a shelf end to end.
  **UNCHECKED:** whether BZ has seen it since v2.0.70. There is no report
  either way. His log of 09/14 has three shelf reads that failed, each with
  a named cause — a 404 at 12:10, bad JSON from the model at 11:47, a timeout
  at 130.7s at 12:32 — and one that succeeded at 16:51. None ended in
  silence.

### 4. Waiting on a decision from BZ

- ~~**The fill levels from 2026-09-12 (§0).**~~ **CLOSED 2026-09-15, BZ: close
  it, he believes they are ok and will re-open if not.** The log cannot name them, so
  there are two choices and both are his: check by eye the bottles whose
  gauge he dragged that day — he is the only record left — or leave them.
  Nothing is written without one of those.
- ~~**Is a name without a proof a bottle?**~~ **DECIDED 2026-09-15, BZ: if a
  lookup returns no proof prompt for it but let it in, because we can enrich
  it later. BUILT v2.4.6:** a name is the identity, the Shop and Add forms
  flag the proof field and say why, a bottle saves with the proof blank,
  and the library fill counts it as a gap (§434). (cause found 2026-09-15,
  §3). The
  identity rule at index.html:4619 rejects any reply without a proof, which
  throws away a barrel-proof release whose proof the model will not commit
  to. Loosening it lets entries with no proof into the library; keeping it
  keeps telling BZ "found nothing" about a bottle the service found. That is
  a change to a rule, so it is his call; the code after it is mine.
- **A public collection link** needs a Firebase node readable without sign-in
  and a rules change he would deploy (v2.3.0). His call.
- **Seven library Release mismatches** left for judgment (v2.3.26). The scan
  points rather than corrects, because a store pick of a small batch is
  arguably either.
- **The `diagnostics` node bounds who writes and not what.**
  firebase-rules.json:196–201: owner-write, admin-read, no `.validate`. It
  arrived after the 2026-09-03 check that found nothing else unbounded.
  Owner-only, so it is the `$uid` shape rather than the `upc` shape. Flagged,
  not ruled on.
- **Two of his 36 flights are over the drink budget** (v2.3.53: a 9-glass core
  at 6.45 standard drinks and a 6-glass one at 4.6). **UNCHECKED:** what the
  app does with a stored flight over budget. The cap is enforced in
  `L.buildFlight`, which sizes proposals, and the entry does not say whether
  a flight already on the shelf is trimmed, flagged, or left.
- **A spend limit on the Anthropic key — TABLED 2026-09-15, BZ: not worried
  yet.** The 2026-09-15 security review found the Apps Script endpoint answers
  anyone: it is deployed ANYONE_ANONYMOUS, and its address is public in
  index.html. So anyone who finds it can run paid lookups on his key. The
  cheap guard is a monthly limit at console.anthropic.com → Settings →
  Limits (his to set). The fuller fix, sign-in and per-user quotas on the
  service, is code. **UNCHECKED:** whether a limit is already set; nobody
  has looked.
- ~~**The 2026-09-15 review: what to build.**~~ **DECIDED 2026-09-15, BZ:
  approve 1 thru 30** of the review report (artifact "Bottlefolio Full
  Review"). They ship as two releases: 1–18, then 19–30. His answers to the
  four open questions:
  - **Clear my shelf, Restore and Reset my changes apply to the ACCOUNT**
    when signed in, on every device. Today they change one phone, and the
    next sync merges everything back.
  - **One verdict, the Shop's four sentences, everywhere.** At a bar the
    same verdict adds a line of bar advice ("Worth the glass rather than the
    bottle"). A bottle you own says "On your shelf".
  - **One name per action:** Add to wishlist → On your wishlist (message:
    Added to your wishlist); Log a pour; Look it up (paid step: Look
    further); Photograph. Each screen is titled with its tab's name.
  - **Photograph goes straight to the camera.** The sheet appears after the
    first photo, with Add another and Read.

  My defaults, told to him and not objected to:
  - A typed confirmation only for deleting the account and removing a
    person. Everything else gets Undo.
  - 12px as the smallest text.
  - Flight detail on a phone keeps Back and Pour visible, with the rest
    under More.
- **Review release 1 (items 1–18, and 30): CLOSED, LIVE v2.4.7,
  2026-09-15.** It went live 178s from the push, commit db41187, run
  35026182748. The cloud gate passed all ten checks in 91s; sync took 21s,
  down from about 50. The rules step ran with the new `bottlefolio` key and
  said "already live - nothing to deploy". What each item became is in
  CHANGELOG v2.4.7.
  - **Checked on BZ's PC before the push:** 4,690 assertions, 68 wiring
    checks, lint, 21 screens, render, two tabs, the walk, and all 19 sync
    scenarios. Every one passes.
  - **Guards shown red first:** the two new walk checks (the flight header
    at phone width, and the Shop note clearing) and each of the helper's
    six guards were run against a broken copy and failed before being
    trusted.
  - **Found on the way, now in CLAUDE.md:** on BZ's PC, `python` is the
    WindowsApps alias, which cannot see the Playwright browsers. So
    audit.py, now honest about a crashed check, fails at screens.js when run
    under it. push.py runs through
    `%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe`, which can.
  - **Still open from it:** L.SYNC_KEYS lists noteLedger and reviewed twice
    (index.html ~8734; item 36), and HANDOFF.md lists an old gate
    (item 39).
  - Release 2 is items 19–29.
- **Review release 2 (items 19–29): CLOSED, LIVE v2.4.8, 2026-09-15. BZ
  looked at the phone pictures first and said ship it.** It went live 142s
  from the push (it was 178s at v2.4.7), commit 10f70b8, run 35031599068.
  The gate step took 52s (it was 89s); that first run missed the browser
  cache, and later runs should hit it. What each item became is in
  CHANGELOG v2.4.8.
  - **Checked on BZ's PC:** 4,716 assertions, 68 wiring checks, lint,
    screens, render, the walk, and all 22 sync scenarios.
  - **Guards shown red first:**
    - The three new sync scenarios (20–22) failed on v2.4.7, where the
      cleared bottle came back.
    - The flight title-width walk check failed at 22px with Log the flight
      back in the header.
  - **Carried to release 3, said to BZ before shipping:**
    - Confirmations stay on the bulk and shared actions: clear, restore,
      reset, sharing, library removal, cache, dropped offers. Only the
      everyday deletes became Undo.
    - Double-tap guards are on sign-in, Let in/No, Save for everybody and
      Read it, not on every button.
    - "Log the flight" and "Log it" (several pours at once) keep their own
      names.
    - The facts lines agree on labels and units, but are not yet one
      function (item 24).
    - There are more text sizes than a six-step scale (item 25).
    - The three gear icons are unchanged (item 27).
  - **Also found and fixed:** a pour's Undo, the pour list's ×, and "I
    bought it" removed without a tombstone, so the sync put the pour or the
    wish back. They are stored-data bugs, fixed in this release.
- **Review release 3 (items 31–40): DECIDED 2026-09-15, BZ, "31-40 all make
  sense to me".**
  - **31, the lookup service:** require sign-in for lookups. The service
    verifies the caller is signed in to the app. Bigger build.
  - **33, the old project bottle-tracker-7d3a1:** BZ, "i just delete it".
    His to do in the Firebase console. Once it is gone, the old key in
    %USERPROFILE%\.bottlefolio is dead too.
  - **32 and 40, GitHub settings:** protect main against force-push and
    deletion, without requiring pull requests, which would block the
    gate's publish. BZ: "think the first, what is best practice". Told him
    it will be applied at the start of release 3 unless he objects.
    Publishing from the workflow is to be built and tested in release 3.
  - **34, diagnostics:** keep the upload, and Settings says plainly that it
    happens and why.
  - **40, DONE and live 2026-09-15.** BZ: "run it". Pages source switched to
    GitHub Actions and the `github-pages` environment taught to allow the
    `build` branch; proved by a hand-started run: gate green, publish green,
    the branch job skipped, the live site serving v2.4.9 from the artifact.
  - **35–39:** on defaults: a size ratchet, the synced-key table, comments
    pruned as code is touched, dead code and pasted rows, and stale docs
    moved to _superseded plus a README.
- Standing from before, both closed with their entries kept below:
  ~~road trip planner~~ DROPPED 2026-09-09; ~~shelf organizer~~ REMOVED
  WHOLE at v2.0.14.

### 5. Waiting on the world

- **The mash bill gap** waits on the fill having run and its counts being
  recorded. Checked 2026-09-15: `data.json` (the shipped catalog) carries no
  bill field. Bills live in the shared library, which this folder cannot
  see, and the library export is how they become countable. Since v2.0.48
  the reading has been repaired: the bill parser reads segments (v2.0.57), a
  bill that does not add up has Look it up on its row (v2.0.56), and a grain
  bill on agave or cane is flagged (v2.3.13). One case still flags by
  design: **95% rye alone**, the Angel's Envy gap, which is what Look it up
  is for. **UNCHECKED:** whether the fill has run at all.
- **The candidate finder has still never put a bottle in BZ's hands.** It has
  a front door in his own words since v2.4.2 ("what am I missing from
  Woodford"), and the crash he hit using it was fixed at v2.4.4. The crash is
  in his log at 09/15 10:15 (`SHELF_ASK.result.forEach is not a function`,
  on Home and on Shop). **UNCHECKED:** the fix in use — v2.4.4 booted on his
  desktop at 11:15, and no shelf question was asked after it.
- **Sharing with a second person — PARTLY STALE.** Shelves ARE shared with
  real people: BZ's diagnostics card read four grants out of his shares
  (v2.3.15), a real buddy's panel was in his screenshot at v2.3.54, and every
  boot in his log of 09/14–09/15 reads three accounts by name out of his
  `sharedWith` node (`enumerated 1, found 3 by name` — the enumeration is
  best-effort by design, v2.3.15).
  **UNCHECKED:** whether any of the rest has run with a second person — the
  contribution queue from a non-admin, the tastings node, a guest's device
  applying a tasting. Nothing this pass could read records any of them.
- **Pooled blind flights** and **advent with others** need other people.
- **Receipt ingest by email** needs an inbox. The reading half is built.
- **Tasting night on phones** — paper works, and BZ deferred the rest. Since
  v2.3.53 a Running a tasting guide sits behind an icon on Flights.

### 6. Not started and not asked for — noted so nobody mistakes them for loose ends

- **What's popular — BUILT v2.4.19** (see the Clubs entry below).
- **What have your buddies been drinking** and **what's popular** — neither
  has a node in firebase-rules.json (checked 2026-09-15). The design notes
  below stand.
- **Taste vs shelf — PASSED, BZ 2026-09-16.** A line on the portrait where
  verdicts disagree with the shelf, and verdicts weighting suggestions. BZ:
  "That level of data is not in there, at least not yet." Revisit once
  pours carry enough again / fine / not for me verdicts.
- **A flavor profile from the tasting notes** — search has read every word of
  the notes since v2.3.27; nothing builds a profile from them.
- **Two shelves side by side — CLOSED, exists.** BZ, 2026-09-16: it exists
  as the Venn on the Buddies tab. The note below predates him saying so.
- **Two shelves side by side** — v2.3.54 portrays the two shelves MERGED (BZ:
  run on ours). Nothing compares them, and nothing makes a flight runnable
  only together.
- **Per-buddy selection** in whose shelf counts — not wired, and v2.3.66
  declined to invent it as a feature nobody asked for.
- **navReport** was deleted at v2.4.4 because nothing called it; it is five
  minutes to rebuild the day a screen stops scrolling.
- **Debt ratchets** (v2.3.49): 129 hard-coded hex colors and 3 `!important`,
  allowed at today's count; anything new fails.

---

## WHAT 2026-09-15 CHANGED

Each of these is closed or corrected IN PLACE in the entry it names below.

- **v2.4.6 — three open decisions closed in one build** (BZ: open items
  complete with each build). (1) A lookup with no proof gets in and the
  proof is asked for: `L.parseLookup` identifies on the name,
  `L.validateProduct` allows a blank proof, both forms flag it
  (`L.proofPrompt`), and the library fill picks it up (§434; the walk's
  buy-with-no-proof check failed first). A lookup's impossible proof is
  dropped instead of refusing the bottle. (2) The Shelf box searches what
  you own and nothing else; asking moved to Shop's planning screen — a box
  in the markup like the store search, NOT ON YOUR SHELF YET from the
  library through the one door, free and instant, then Look further, the
  paid lookup (§435; the walk failed first). (3) The question reader hears
  bourbon, scotch and irish (§431). And the Sept 12 fill levels closed on
  BZ's word.
- **v2.4.5 — the first app release through the pipeline.** NEXT-THREE.md's
  three, each with a test that failed before its fix:
  (1) the offer reader keeps a line only on POSITIVE evidence that it names
  a whisky — a proof, age or size, a house, a whole-word catalog match, or a
  category beside a distinctive word (BZ's call: a category alone is not
  enough) — so "537 reviews", "star" and "Special Reserve Bourbon Bottle" are
  dropped and a genuinely new bottle is still caught (§429);
  (2) one bottle reads the same on the shop card, the bar and an offer row:
  `L.fitTwoWays` fills a bare name from the catalog and judges taste from
  everything it knows, offer rows carry its headline and two lines with the
  offer reader's own extras under them, "Nothing on your shelf speaks to this
  one either way" is gone, and `L.ACTIONS` declares the door with
  `inner: ['fitVerdict']` so a site going round it fails consistency —
  proven by removing the `wishEntry` exception on a scratch copy and
  watching it name index.html:3022 (§430, §432);
  (3) one box on the Shelf screen, with an Ask about … button right under
  it when the typing is a question naming something the shelf knows, and
  Enter presses it (§431; the walk failed at two inputs before the fix).
  Plus BZ's two from the same afternoon: a shelf read on the store screen
  gets the room — the walk measured 58px of a 780px phone before; the
  wishlist and the cameras now move into the scroll while a read is on
  screen — and IF YOU POUR ONE no longer crowns a read the reader rated low
  or a kind it called not whisky ("Buster Nolte"), with kept reads keeping
  `sure`, `sub` and `dist` so they pick the same way twice (§433). And the
  retired Bottle-Tracker address is gone from the iPhone help and from
  Code.gs's `SHELF_URL`, with a consistency check that fails on it; GS_BUILD
  2.4.1, so the gate redeploys the service. **UNCHECKED:** whether "Buster
  Nolte" was read as low. BZ is asked; if the reader rated it high, the
  confidence rule does not bench it and something else is wrong.
- **Found in passing — FIXED v2.4.6.** BZ: the Shelf box searches, and
  asking moves to Shop. The question box is on Shop's planning screen and
  reads a category from the words as typed (§431, §435). As found:
  `L.readShelfQuestion` could not see
  bourbon, scotch or irish as a category: it matches through `L.shopNorm`,
  which strips exactly those words, so `has('bourbon')` compares an empty
  string and "am I thin on bourbon" names no subject (read from the code;
  §427 tests rye only, which survives). Raised rather than folded into
  v2.4.5 (rule 5a).
- **Code.gs 2.4.0 — CLOSED, live.** BZ's Check the service answered build
  2.4.0, current, on 2026-09-15. `shelf.gs` answers its modes; the recap
  route was NOT live on 2.3.70 (09/14 11:46) and IS live on 2.4.0 — closed
  by cloning the deployed project (§1).
- **Deploys are automated end to end — BUILT 2026-09-15.** `python
  push.py` → one commit to `build` → the cloud gate (`.github/workflows/
  gate.yml`) → the Apps Script service if a service file changed → the
  Firebase rules if `firebase-rules.json` changed → `main` and the live
  site. Verified three ways on the first runs: the site (commit 11bdc14,
  live in 160s), the service (deployment redeployed @33, answering 2.4.0),
  the rules (below). Nothing moves on a red gate. How it works is in
  CLAUDE.md, Building.
- **CORRECTION, same day — WRONG PROJECT.** The rules below were read and
  deployed on Firebase project `bottle-tracker-7d3a1`, the OLD project named
  in DEPLOY.md. The app uses project `bottlefolio`, database
  `bottlefolio-default-rtdb` (index.html:37960). So the app's live rules were
  NOT changed: neither fix is live for the app, and the FIREBASE_SA secret and
  rules.js point at the old project. Found by the 2026-09-15 docs review.
  **REWIRED, same day.** A `bottlefolio` key replaced FIREBASE_SA. rules.js
  now reads the database and project from index.html and refuses a key for
  any other project (tried with the old key: refused). The real live rules,
  backed up to `%USERPROFILE%\.bottlefolio\rules-live-bottlefolio-before-
  2026-09-15.json`, ALREADY carried both fixes below, pasted by hand at some
  point. The file had removed admin READ of `shares/{uid}` and
  `requests/{uid}`, which the admin Remove person flow needs
  (removePersonData, index.html:31813), and admin READ of `sharedWith`,
  which the share audit reads (fbShareAudit, index.html:38962). All three
  are restored in the file. The file still differs from live in 2 places,
  both admin powers it takes away: an admin could WRITE anyone's `shares` and
  `sharedWith`, and so grant themselves a view of any shelf. The file lets an
  admin only delete there, which is all Remove person does.
  **CLOSED 2026-09-15 — DEPLOYED with BZ's go.** `rules.js deploy` from his
  PC: "deployed 2 change(s) to bz-apps/whisky; everything else unchanged",
  then `diff`: the live branch matches firebase-rules.json exactly. The
  entry as written follows; it describes the OLD project.
- **Live Firebase rules — TWO FIXES DEPLOYED, 2026-09-15, BZ's go.** Read
  with `rules.js diff`: the database holds only `bz-apps/whisky`, with no
  comments, and the live rules lacked two things the file already had. (1)
  `shares/$ownerUid/$withUid/name` — the app writes `{ at, name }` trimmed
  to 40 (index.html:39093), the live `$other: false` refused it, and the app
  fell back to saving every share WITHOUT the name. (2) The
  `diagnostics/$uid/.read` admin check read `whisky/shared/admins` while
  admins live at `whisky/admins` — the bug CHANGELOG records at its fix and
  that was never pasted, so an admin could never read anyone's diagnostics.
  Live rules backed up first to `%USERPROFILE%\.bottlefolio\
  rules-live-before-2026-09-15-1343.json`, deployed, read back: the branch
  matches the file exactly and nothing else moved. The `.validate` gap on
  `diagnostics` (§4) is a separate question and still open.
- **BZ's log of 09/14–09/15 was read line by line**, and it moved five
  entries:
  - **Fill levels:** the log's oldest line is 09/14 10:21 and the Firebase
    copy is the same tail, so nothing reaches 2026-09-12. The repair it can
    justify is nothing; the choice went to BZ (§0, §4).
  - **Lookup answers and shows nothing — CAUSE FOUND:** six replies carried
    a bottle with `"proof":null`, and `L.parseLookup` rejects a name without
    a proof (index.html:4619). The rule is BZ's call (§4).
  - **Stagg** is three faults: prose after a web search, one unparseable
    JSON, and the proof rule above (§3).
  - **The library fill's 30-second ceiling** lost three of four lookups at
    30.0s. New, mine (§2).
  - **The SHELF_ASK crash** is in the log at 10:15, and the v2.4.4 fix has
    not been used since (§5).
- **Boot renders — CLOSED at v1.9.33**, a day BEFORE the 2026-09-10 pass
  called it "not started". Home draws first and the rest on the next tick
  (index.html:40232). The bigger version, rendering on reveal by moving
  `TAB_RENDER` into `show()`, was deliberately declined in that comment
  (rule 3a). v2.3.47 measured nine cold boots at a median 242ms on BZ's 364
  bottles.
- **Untested L functions — CLOSED.** All 495 have a test (v2.3.47);
  `KNOWN_UNTESTED = []` (consistency.js:887) and the build fails on a new
  one.
- **Lookup cap — the 120 in item 11 was stale since v1.7.4**, which raised it
  to 600. The code says 600 (index.html:18778).
- **Comments — BZ's ask changed, the build did not.** At v2.3.60/61 he asked
  for only necessary comments: 2063KB to 1769KB, with the history moved to
  CHANGELOG. The 2026-09-09 ruling against a stripped BUILD stands, since
  there is still one file.
- **Security** — the v2.3.47 review found it sound, and `diagnostics` was
  added to the decisions above.
- **Nothing reads the tasting notes — PARTLY CLOSED** by search (v2.3.27).
- **Sharing never exercised — PARTLY STALE** (v2.3.15, v2.3.54).
- **A buddy tab — CLOSED, BUILT.** Buddies is a tab: `scr-buddies`
  (index.html:2282) with its own nav button (2490).
- **Editable reference data** — BZ declined admin tables at v2.4.0. New
  categories adapt without a build and the scan reports undeclared ones. The
  house registry's missing writer is an open item above, not part of this
  ruling.
- **The shelf organizer entry** that still read as open now carries its
  closure.
- **The Map tab is gone** (v2.3.7) and the map moved to the shelf (v2.3.31/32),
  so the boot entry's `show('map')` call site is history.

### Decided by BZ since 2026-09-10, kept for the reasoning

- Lookup allowances stay per device, so two devices get two (v2.3.66).
- No admin tables for reference data (v2.4.0).
- The last three wall and menu reads are kept; the photographs are not
  (v2.4.1).
- After a single bottle scan, one lookup fills only what the label left
  blank. Single scans only, because a menu of sixty is a bill (v2.3.81).
- Flights are capped in drinks: 4.5 standard, with a 10-glass ceiling
  (v2.3.53).
- Zero is back at the foot of the gauge (v2.3.35).
- No in-aisle barcode lookup (v2.3.0).
- Every release gets a new version number; a re-cut version never updated a
  phone (v2.2.0).
- The library lives under Shelf settings, admin-only (v2.0.49). Fixed-list
  fields are dropdowns (v2.0.55). A proof printed on the label stays in the
  name, and the duplicate matcher ignores it (v2.0.56).

---

## How the previous passes read — kept

A NOTE ON READING THIS FILE, written after nearly repeating its own
documented fault. On 2026-09-10 I scanned the HEADINGS, saw "The shelf
organizer needs work" and reported it as open work. It is not: the entry
under that heading says REMOVED WHOLE, at v2.0.14, with the list of what
went. The heading is the question the entry answered, not its status. Read
the entry. The line before that said 2026-09-07 at v1.8.51, and before that it
said v1.26.19 — a version from before the scheme was reset and higher than
anything that exists, because a header claiming to be current while naming a
version nobody can find is worse than one with no version at all.

**WHY THE 2026-09-09 PASS HAPPENED, and how to repeat it.** On 2026-09-09 BZ
asked what was left. SEVEN entries turned out to describe work already
shipped: camera propagation into the other capture moments, `sub: world`,
the Google button, gifts, receipt reading, the lookup budget, and the advent
calendar — which was not a feature at all. Each one cost him a round of
being told about work that was already done, and by then this file was less
reliable than the code it describes.

The cause is the same every time: a status read off an entry's HEADLINE
instead of the source. So the rule for this file is the rule the app's own
tests follow — before an entry is called open, open the code. Every item
below has been checked that way, and each one that changed says what was
checked and on what date. Where an entry names a function, the check is
whether it is defined and whether anything calls it; where it names a
behavior, the check is the call site. Anything that could not be checked
from the source says so rather than being left to look decided.

**AND 2026-09-15 FOUND IT ONCE MORE.** The boot-render entry said "not
started" through the 2026-09-10 pass while the deferral had shipped at
v1.9.33 the day before. It was checked against the source on 2026-09-10 for
its NUMBERS and not for its STATUS, which is the same fault in a new place.

## SUPERSEDED 2026-09-15 — the short list of 2026-09-09 and the changes of 2026-09-10

**SUPERSEDED by the 2026-09-15 short list above.** Kept as it read.

Everything else below is either shipped, ruled on, or waiting on the world.
Three kinds, because they are not the same kind of open.

**Waiting on code — nothing.** There is no item on this list that somebody
could pick up and start today without an answer from BZ or an event outside
the app. That is worth stating plainly rather than leaving somebody to
discover it by reading four hundred lines.
*(2026-09-15: no longer true — see §0 and §2 of the short list above.)*

**Waiting on a decision from BZ**
- ~~The **road trip planner**~~ **DROPPED, BZ 2026-09-09**: not useful
  without detailed route capability, and he is not there yet. It never had
  a line of code, so dropping it is this sentence.
- ~~The **shelf organizer**~~ **REMOVED WHOLE, BZ 2026-09-09**: just drop
  the shelf arrangement features, it's really a first world problem and
  there are too many variables. Rebuilt twice in one day - once to his
  furniture brief, once simplified to one question per piece - and the
  variables were the tell: a piece of furniture had a name, a purpose, a
  category list and a shelf count, each shelf had a capacity, and the
  answer still turned on how somebody actually reaches for a bottle, which
  no amount of description was going to capture. Gone at v2.0.14: the three
  screens, L.storagePlan and its helpers, L.shelfPlan and its grouping,
  L.shelfGroupOf, L.bottleSpecial, L.bottleCommon, the shelfCaps, storage
  and shelfTicks state, four test sections and the CSS. L.shelfBuild is NOT
  part of it and stays - it reads bottles off a photograph of a shelf. The
  reasoning is kept in CHANGELOG at v1.9.29 and v2.0.4 if it is ever
  wanted again.

**WHAT 2026-09-10 CHANGED**

- **With a guest** — BUILT AND SHIPPED, v2.0.40 to v2.0.47. Name something
  a visitor likes, pick how far to travel: keep it in the house, next door,
  down the road, across the pond. Corrected five times by BZ in one
  sitting, each correction narrowing it: down the road stays in the
  COUNTRY, American single malt is American, Canada is a drive rather than
  a flight, kinship is by spirit rather than passport, and proof is
  one-way. What the guest likes - the cask, the smoke, the strength -
  travels with them as an ORDER inside the rung rather than a gate, because
  a gate would empty a rung and send the ladder somewhere it should not go.
  *(2026-09-15: extended since — the house is inferred from the front of the
  name (v2.3.62/63), guest lookups feed the library (v2.3.64), and the
  ladder feeds the wishlist through L.awayWishable (v2.3.20).)*
- **The bar shelf is inventory** — RULED AND BUILT, v2.0.47. BZ: why not
  include inventory without all the bells and whistles. Rum, vodka, gin,
  mezcal, tequila, liqueur and brandy count as bottles, are searchable and
  pourable, and keep their category; they are left out of the profile, the
  radar, the gaps, the slot machine and the guest ladder. A Whisky only
  chip on the shelf hides them, and it only appears if you own any.
- **Ten service call sites became two doors** — v2.0.45. Seven had no
  retry, no timing and a bare .json(), so a stale deployment gave them a
  parser error rather than a sentence. Both doors are now driven by the
  walk, proved by breaking them.
- **US spelling everywhere**, 656 words across twelve files, data keys
  excluded by name.
- **Five dead constants removed** and a check added for declared-and-never-
  read. It took four attempts, because a constant can be read four ways a
  name search misses.

**Waiting on the world**
- The **mash bill gap** waits on the fill having run: zero of 325 shipped
  entries carry a bill, so the counts the ruling asked for do not exist yet.
  The library export added at v1.9.37 is how they become countable.
- The **candidate finder** has still never put a bottle in BZ's hands.
- **Pooled blind flights** and **advent with others** need other people.
- **Receipt ingest by email** needs an inbox to exist. The reading half is
  built.
- **Tasting night on phones** — paper works, and BZ deferred the rest.

**Small and real, if a session ever wants one**
- An **estimate before a lookup run** and a total after it. The cap and the
  circuit breaker both exist; this is the comfort half.
- **13 of 456** L functions were untested on the morning of 2026-09-09;
  that is now **zero**, and the check fails on a new one, so this line is
  here to be deleted rather than acted on.
  *(2026-09-15: CLOSED — 495 of 495 tested at v2.3.47. Kept rather than
  deleted, per rule 2 of this file.)*

## The shelf organizer needs work — LOW PRIORITY, BZ 2026-09-09

**CLOSED — REMOVED WHOLE at v2.0.14, BZ 2026-09-09.** Checked 2026-09-15:
`showShelfPlan`, `L.storagePlan` and `shelfCaps` appear in no HTML file in
this folder. The request is kept below as it was raised; the removal and its
reasons are in the superseded short list above.

BZ: backlog that we need to work on the shelf organizer, low priority for
now. Raised while looking at the Buddies rebuild, so it is his judgment of
the feature rather than a fault report — no specific complaint is recorded
and nobody should invent one. Ask what is wrong with it before touching it
(rule 13b); it is `showShelfPlan`, reached from Shelf tools, Storing, "How
to arrange it", and it lays bottles out against the shelf capacities in
S.shelfCaps.

## CORRECTION: sync.js was never asserting one thing (v1.9.30)

**STATUS 2026-09-15: HALF MOOT, HALF OPEN.** The v1.9.29 storage keys went
with the shelf organizer at v2.0.14. The tombstone merge is still not driven
through two browsers — it is in the short list, §2.

The v1.9.28 entry here said sync.js "asserts ONE composite thing". That was
wrong, and it was wrong in the way this project keeps catching: judged from
the OUTPUT rather than the file. `check()` prints nothing when it passes,
so three quiet lines meant every check had passed, not that there was one.
Instrumented and counted: **24 assertions across twelve scenarios** — newer
device against older account and the reverse, key escaping, the offline
queue, publishing to the library, a bottle arriving live, two devices each
adding one, wishlist removal against an unsent local change. Real coverage.

What it still does NOT cover is the storage keys added at v1.9.29 and the
tombstone merge added at v1.9.30 — both are asserted in the unit suite
against a real store, neither is driven through two browsers. Worth adding
a scenario each; not worth pretending they are untested.

## Decided by BZ on 2026-09-09, kept for the reasoning

**The house chip claims a count.** No rarity signal exists in this app's
data - the catalog IS the shelf - so the ranking stands and the claim came
down to what the number supports. "The Loyalist" became "Deep on One House"
and the reason carries the share of the shelf. BZ: fine.

**A buddy tab needs their shelf, not mutual sharing.** BZ had described
both-green turning into a Venn; gating on it would have removed a
comparison that worked. Left as built. BZ: fine.

**One cask-strength number.** The portrait's one-line summary had its own
0.25 while the chip and the verdict used 0.2. BZ: make same. It reads
L.CASK_DELIBERATE_SHARE now, which loosens that line slightly - a shelf
between 20 and 25 per cent says it too, which is what the other two already
said about the same shelf.

**Admin write on the sharing records stays.** Widened at v1.9.22 for the
Sharing check; it means an admin can grant themselves sight of any shelf.
BZ: keep, and it may expand. Recorded as a decision rather than left as a
debugging leftover.

## 1. Security

**STATUS 2026-09-15:** no rules change since 2026-09-04 that this pass
found. The v2.3.47 review found the rules sound: no node world-readable or
world-writable, and none of 95 `innerHTML` assignments fed by user data. One
node arrived after the check below and bounds WHO and not WHAT —
`diagnostics`, in the short list §4.

**A write ceiling on `upc`** — SHAPE DONE 2026-09-03, THE REST OPEN.
Every shared node bounded what may be written to it except the barcode
pairings, which any signed-in account could write anything to. The rule now
requires a key of exactly twelve digits, which is what upcKey produces; a
name that is a string between 2 and 100 characters; a timestamp that is a
number and not in the future; an optional price within a sane range and an
optional size under twenty characters; and nothing else at all. Writing over
an existing pairing is still admin-only, as it was.

What that does NOT do, and it is worth being plain about it: it stops junk
being stored, and it does not stop volume. Twelve digits is a trillion
possible keys and a determined account could still fill them one valid row
at a time. Realtime Database rules cannot express a rate limit.

DONE 2026-09-04. A learned pairing now goes to `contrib`, which is already
per-account and already reviewed, and `upc/$key` is admin-write-only like
the library. An admin still writes straight through, because a review step
where the reviewer is the author is a ceremony rather than a check. The
teach-it-once property is kept: the pairing is stored locally either way and
works offline immediately, it just is not shared until somebody looks at it.
Barcodes offered appears on the Library screen beside the products, with
Accept and Decline. Two people scanning the same bottle before either is
reviewed shows once, earliest offer winning. `contrib/$uid/upc` is bounded
to the same shape as the shared node, so nothing can be offered that could
not then be accepted.

Rules pasted 2026-09-04, and again at v1.6.36 (md5 20792bc8) for admin
delete-only writes and the `wiped` tombstone. `firebase-rules.json` does
not deploy with the app, so a paste is needed ONLY when that file changes —
say so then, and not on every delivery.

**Nothing else is unbounded.** Checked the whole file on 2026-09-03:
directory, requests, shares, sharedWith, shared, view, admins, stats and
contrib all bound both who may write and what shape it must be.
*(STALE as of 2026-09-15: `diagnostics` (firebase-rules.json:196–201) was
added later and has no `.validate`. The nine nodes named here still hold.)*

## 2. Performance

**STATUS 2026-09-15: nothing open.** v2.3.47, median of nine on BZ's real
364-bottle shelf: renderShelf 22ms as a list and 13ms as books, renderHome
17ms, renderShop 4ms, filtering under a millisecond, nine cold boots to an
interactive nav at a median 242ms. The boot-render fix below is CLOSED
(v1.9.33). The data.json caching note is still not done (sw.js:41–44 is
network-first) and still does not need doing.

**THE DOCUMENT PARSE IS MEASURED AND RULED ON — BZ, 2026-09-09: don't.**
*(2026-09-15: the ruling against a stripped BUILD stands. Separately, at
v2.3.60/61 BZ asked for only necessary comments in the source; 294KB came
out, 2063KB to 1769KB, with the history moved to CHANGELOG. The parse was
not re-measured after that cut.)*
Measured at v1.9.37, nine runs and a median, headless Chromium on an empty
shelf: responseEnd to domInteractive **147.4ms** (min 116.2, max 305.8).
The file is 1.64MB, 92.5% of it the script block, and **677KB of that —
40% of the whole file — is comments**. A copy with the comments stripped
measures **76.0ms** (min 60.8, max 105.7), so the reasoning in this file
costs about **71ms once per cold load**.

BZ ruled: don't. The trade is 71ms against a delivery model where the file
you upload is the file that runs, and the comments are the project's
memory — every session so far has been faster because the reasoning was in
the file rather than in somebody's head. Shipping a stripped build would
also mean rule 23 and audit.py both having to know which of two files they
mean.

Also worth keeping: the stripping used to get that 76.0ms was a regex that
does not understand string literals, so it is fit for MEASURING and unfit
for shipping. Anything that revisits this needs a real parser, which is a
moving part on its own.

RE-MEASURED 2026-09-10 at v2.0.47, nine runs and a median, on BZ's actual
344-bottle shelf rather than an empty one - which is the population that
was missing last time. First contentful paint **148ms**, DOM interactive
**190ms**. The engine is nowhere near being the problem: the shelf filter
over all 325 entries is **0.24ms**, filter plus text search **1.25ms**, the
library scan **1.49ms**, the guest ladder across all four rungs **2.08ms**,
shelf stats **0.07ms**. The file is now 1.77MB with 646KB of comments, and
the ruling stands unchanged.

The one thing worth doing if it is ever raised: data.json and map.json are
338KB fetched on every boot and almost never change. They are already
separate files, so caching them harder in sw.js is a real saving with no
cost to the source. Not done, because nothing is slow.

Not open. If it is ever raised again, raise it with a number: the untouched
halves are 104KB of CSS and 21KB of markup, and data.json already loads
separately.

**The shelf redraws whole, and counts by scanning.** — DONE 2026-09-04.
`L.ownedCounts` builds the key-to-count map in one pass and the search box
is debounced at 150ms, with the filter chips still redrawing immediately.

What was still open on 2026-09-04 was the same fault in newer code: the
recommender, the portrait and the shape chart each filtered the whole
catalog with a per-product `ownedCount`, which is the 111,800-comparison
shape again. `shelfAxes` was worse — it re-split every finish string once
per wood family and re-ran the peat match once per level, six and four full
passes for facts that do not change between them. Measured on BZ's 325
products and 344 bottles: tasteProfile 8.20ms to 4.33, shelfAxes 5.13 to
2.57, shelfGaps 14.08 to 12.44, and Home as a whole from about 15ms to 4.
Roughly ten times that on his phone. 2051 assertions unchanged, which is
the point: same answers, less work.

~~Still worth doing when it next matters: `shelfGaps` is 12ms and now the
slowest thing on the planning screen.~~

**MEASURED AGAIN 2026-09-07 AND WRONG.** `shelfGaps` is **2.05ms**, not
12.44. The 12.44 was taken before the `openKeys` fix in the SAME build that
took it, so the entry outlived its own repair. On BZ's 325 products, 344
bottles and 36 flights, warmed 200 iterations and timed over 100:
`shelfGaps` 2.05, `shelfAxes` 1.92, `tasteProfile` 1.10, `ownedCounts` 0.03.
Nothing on the planning screen is worth touching.

**WHERE THE TIME ACTUALLY GOES** (BZ: don't quit on performance gains — he
was right to push, the entry above was four helpers on one screen):

**CLOSED at v1.9.33 — the boot renders, and not the way this entry proposed.**
Checked 2026-09-15 against index.html:40232–40257: `boot()` draws Home, then
draws the other screens on the next tick (`setTimeout(rest, 0)`), so none of
them sits in front of the first paint. Moving `TAB_RENDER` into `show()` was
considered in that comment and DECLINED: rendering on demand would make
every screen track whether it had ever been drawn, which is seven new pieces
of state and not a performance fix (rule 3a). Because every screen is still
drawn once at boot, the three call sites below that rely on it are still
safe. Two of them have moved since: the Map tab is gone (v2.3.7) and the map
lives on the shelf (v2.3.31/32). The line numbers below are from the build
that measured them. This entry said "Not started" through the 2026-09-10
pass, a day after the fix shipped.

| | desktop |
|---|---|
| time to a usable shelf | 223ms |
| parsing the 1.3MB document | 84–177ms |
| the eight renders `boot()` runs | 111.9ms |

The parse is **40 to 90 times** the figure this section was worrying about,
and every screen pays it before anything draws. Shrinking the file does NOT
fix it: comments stripped saves ~10ms and full minification saves nothing
measurable (−2.4ms, inside the noise), because V8 pre-parses function bodies
lazily. The 488KB of comments cost 10ms, which is a fair price.

`boot()` renders EIGHT screens and only `scr-home` is visible — 67ms drawing
screens nobody is looking at, on a 344-bottle shelf. An empty-shelf
measurement says 8.2ms and is worthless; that gap is the whole finding.

**The fix is not deleting the boot renders.** `TAB_RENDER` already redraws
each tab on arrival, so they look redundant — but `show()` is called
directly 11 times bypassing the tab bar, and three of those render nothing
first and rely on boot having drawn the screen: line 15398 `show('shop')`
from Add one bottle, 16240 `show('shelf')` from Go to the shelf, 17137
`show('map')` from the home mini-map. Delete the boot renders and those
three break silently.

What it SHOULD be: move `TAB_RENDER` into `show()`, so a screen renders when
it is revealed however it was reached. Boot's eight become unnecessary, the
three fragile call sites become correct, and the tab bar stops rendering
twice. Projected boot render 112ms → ~44ms. Not started; `renderShelf` has
48 callers and `renderShelfFilters` 36, so the blast radius wants reading
before writing.

**Logic that ships untested** — DONE, and this entry was stale when it was
read on 2026-09-04. All three named here already delegate: `openSealed` to
`L.sealedPrompt`, `publishBatch` to `L.publishWrite`, and
`pendingForLibrary` to `L.pendingForLibrary`. Checked rather than assumed.

The rule still earned its keep the same day. Eleven more computations came
out of `renderShelf` and `renderShop` (§226, §227), and the ReferenceError
that had sat in `renderShop` through fourteen versions was exactly what
rule 30 predicts: the harness cannot call a render function, so anything
computed inside one ships untested however much of it is arithmetic.

## 3. Finding the bottle

**The Google button — ALREADY BUILT, verified 2026-09-09.** `L.findUrl`
has five callers: `findTag` (which IS the hunt and allocated tag),
`showBottle`, `wishCard`, `shopAnswer` and `buddiesWants`. Listed as open
from this entry's headline without checking the code, which is the third
stale item found in one scan. Kept for the reasoning below.

**The Google button.** One link, the bottle name already in it, on the
bottle view and on any hunt or allocated tag. Reasoning under item 15 below,
including the three larger designs that were rejected — the secondary
market, OHLQ alone, and a shop list with search templates and a price
comparison, which was right in outline and far too much machinery.

## 3b. What the review of 2026-09-07 found

Run at v1.8.56 with BZ away from a machine. Security, performance, rules
and quality, measured rather than opined.

**Clean, and worth not re-checking for a while.** Zero unauthenticated
paths in `firebase-rules.json` — every read and write requires
`auth != null`. No secret in the client: the only key is the Firebase web
apiKey, which is public by design, and the Anthropic key stays in Script
Properties. The XSS surface is closed by construction — `el()` writes
`textContent`, and all 20 non-empty `innerHTML` assignments are static
literals or SVG built from constant maps, with no user data interpolated.
No `console.log` in shipping code, no changelog placeholders, and the four
hedging phrases are all in comments rather than screen text.

**Performance held.** 254ms median to a usable shelf over nine runs, against
223ms at v1.8.47 — about 31ms for 64KB of new code across ten versions,
which is consistent with the earlier finding that bytes are cheap to parse.
A three-run sample said 358ms and was noise; nine runs is the number to
trust.

**TEST COVERAGE IS 95%, AND THE GAP IS NAMED.**
**CLOSED 2026-09-15 — all 495 L functions tested at v2.3.47, and
`KNOWN_UNTESTED = []` (consistency.js:887) fails the build on a new one.**
407 L functions, all used
by the app, 21 with no assertion over them. A nineteenth consistency check
now catches this class — check 3 catches a helper defined and never used,
the unwired check catches one tested and never called, and NEITHER caught
the third case: wired, doing real work, and asserted by nothing. It found
three I shipped today (`labelSame`, `labelLabel`, `labelShow`), which is
rule 27 broken three times in one day with nothing noticing.

Tested since: those three, plus `splitPours`, `isKeeper`, `sealedKeys`,
`offerTitle`, `fitByGroup`. **Still open, 13 of them**: `searchText`,
`judgeListing`, `fitUnlocks`, `deviceLabel`, `stripMarkup`, `varInText`,
`findUrl`, `lessonBlocker`, `blindTheme`, `blindGiven`, `peatLevel`,
`proofProfile`, `worldReach`, `isHardGap`, `noteText`, `hasFlavour`,
`flavourOptions`, `flavourFlight`, `flightRunRecord`, `flightPoured`.
`judgeListing` and `fitUnlocks` are the two worth doing first — both score
a bottle against the shelf, which is arithmetic somebody acts on.

**TWO FUNCTIONS ANSWER THE SAME QUESTION AND DO NOT KNOW IT.** The one
finding here that will bite.

`L.mashbill(p)` has existed for a long time and infers a recipe from the
bottle's NAME — wheated, high-rye, four-grain, malt, corn, rye — because
three flights turn on recipe and the catalog stored only a category. It
feeds `tasteProfile` (line ~11277) and the flight builder (~13093).

`L.mashShape(text)` was added on 2026-09-07 and returned wheated, high-rye
or rye-forward from the actual grain PERCENTAGES. **RESOLVED v1.9.38, BZ:
agree — the real bill wins and one source answers.** By then the
duplication had moved and got worse: `L.mashbill` already consulted the
printed bill, so the pair was `L.mashFromBill` and `L.mashShape`, two
readers of the SAME evidence in different vocabularies. `mashShape` is
deleted; the bottle screen calls `mashFromBill`, which has the fuller
vocabulary and is what `mashbill` already used. The merge moved one
boundary toward the law — 80% corn is corn whiskey — and that boundary is
now asserted with 79% beside it. The reasoning below is kept.

Same vocabulary, different evidence, neither aware of the other. They agree
today only because no entry carries a mash bill. They begin to disagree as
the fill lands: a bourbon named nothing in particular with 20% rye is null
to `mashbill` and high-rye to `mashShape`, and the taste profile and the
bottle screen would then say different things about the same whisky.

Not fixed, because which one wins is a decision rather than a repair. The
obvious answer — a real grain bill beats a guess from a name — is probably
right and is not obviously right: `mashbill` returns `malt` and `corn`,
which `mashShape` has no equivalent for, so one cannot simply replace the
other. Worth an hour and a conversation, before the fill makes it visible.

## 3c. The mash bill gap — LET THE RUN DECIDE

**STATUS 2026-09-15: STILL WAITING ON THE RUN.** **UNCHECKED:** whether the
fill has run at all — no counts have been recorded, and the shipped
`data.json` carries no bill field, so this folder cannot answer it. The
library export is the way to count.

Adding mash as a fifth gap on 2026-09-07 made 411 library entries "to do"
overnight. `lookup.gs` now asks for one, which it never did before, so the
run can at least succeed where a bill is published.

The open question was what to do about entries where none IS published: the
gap cannot close, so they rest a week, six months, a year, and come back for
ever. Three options were on the table — leave it, drop mash out of the fill
queue, or let an empty answer close the gap permanently the way `finc:
'stated'` closes a finish.

**BZ: when you say MOST I want to let it happen.**

That is the ruling and it is the right one. Every claim behind those options
rested on the word "most" — most American labels print a mash bill (wrong,
proved wrong by six photographs the same day), most Scotch does not (also
unmeasured). "Most" means there is no number, and a rule was written for it:
26 forbids exactly that word.

So: NOTHING IS BUILT HERE. The fill runs, and what comes back is the
population. Decide afterward, from counts:

- If the American entries mostly close, the unanswerable set is Scotch,
  Irish and Japanese, and option 3 is a small well-defined build.
- If they mostly do not, the gap itself was a bad idea and the question
  becomes whether mash should be a scored gap at all rather than how to
  close it.

What to record when the run finishes: how many of the 182 American entries
came back with a bill, how many of the 127 Scotch and Irish, and whether any
bill failed `mashNote`'s total — a wrong digit in a bulk run is exactly the
thing that slips past unnoticed, and it is the check that caught a misread
on Old Elk the same day.

## 4. Reading the label

**SHIPPED 2026-09-07, v1.8.48 through v1.8.51.** Kept here rather than in
Closed because the brief it replaced is still quoted in `HANDOFF.md` and
because three pieces of it are open.

**The brief was wrong and the bottles said so.** `HANDOFF.md` said
photograph the back label to get the mash bill, that a mash bill is printed
on the back of most American whiskey, and that the fill should run first
with photographs only for the remainder. BZ photographed six bottles on
2026-09-07 — Bardstown Collaborative Series, Knob Creek 18, Angel's Envy
Cellar Collection, Bunnahabhain Fèis Ìle 2024, Redbreast Kentucky Oak,
Heaven Hill Bottled-in-Bond. **None carried a mash bill. Four were
American.** A seventh, Old Elk Wheat N' Rye, did — printed as a table on a
side panel, not the back. So a mash bill is uncommon and turns up on
whichever panel the producer chose, which is an argument for reading the
whole label rather than for a mash-bill hunt.

**BZ's framing, which is the right one:** reading labels is an alternate to
bar code scanning — read the whole thing, and if there are mash bills,
great. The UPC digits are printed under the bars in plain text, so one
photograph yields the name AND the code together. A scanner reads a code and
needs somebody to type the name; a photograph brings both halves. That is
the pairing the library could never get on its own, and it happened for real
on 2026-09-07: `learned barcode 850030365156 = Old Elk Wheat N Rye`.

**And the correction case, which no gap can find.** Bardstown Silver Oak
scores 100 on `entryScore` and the bottle says Collaborative Series, a
blend, finished in Silver Oak Cabernet barrels, with a barcode the app never
held. `slotOpen` reads every slot as filled. A label read may therefore
CORRECT a filled field, marked `stated` so no later lookup overwrites it —
which is why the button does not hide itself the way Look up does.

**Open, from here:**

- **The other capture moments.** ~~The bottle screen is its only caller.~~
  **AWAY POUR DONE v1.8.52**, and it turned out to be the one that mattered
  — BZ: away pours let us build the library. It names the pour, teaches the
  pairing and offers the whisky to the shared library, all from one press on
  a bottle that goes back behind the bar. Doing it forced `labelCapture` out
  of `readTheLabel`, because an away pour has no entry to correct.
  ~~**Still open: the pour screen, the add form (slot 2 is drawn and
  empty), and the shop.**~~ **ALL DONE — verified 2026-09-09 by reading the
  callers rather than the button label.** `labelCapture` has four:
  `readTheLabel` (bottle), `productForm` (add), `shopReadBottle` (shop) and
  `awayReadBottle` (away, which IS the pour screen — `awayLookingCard`
  dispatches a bottle subject to it). The home half of the pour screen
  deliberately has none: you are choosing from a shelf the app already
  knows, and correcting an entry you own is the bottle screen's job. This
  line was written before away-pour existed and outlived it.
- ~~**Good, better, best — how to say it on the page**~~ **DONE v1.9.38,
  BZ: do subtly.** Built as the entry proposed rather than as a ranking:
  each way in already said what it is FOR at the point of choice (the shop
  says it under its two cameras; the bottle screen says it through
  `L.labelWorth` when an entry is short), and the missing half was the LOOP,
  which is now said once in App use as "Which way to add a bottle" — a
  label read is what teaches the barcode, so a photograph is the one that
  leaves the app better than it found it. No league table on any screen.
  (Original entry below, kept for the reasoning.)
- **Good, better, best — how to say it on the page** (BZ, 2026-09-07). He
  asked whether to hint at a ranking: label pics best, UPC better, type and
  search good. The counter-argument, not yet decided: the ranking mixes
  correctness with cost, the barcode is only cheap when the pairing is
  already known and half the shelf will never appear on a retail listing,
  and they are not competitors — the label read is what TEACHES the barcode,
  so ranking them hides the loop. Proposed instead: one line each saying
  what it is FOR at the point of choice, and the loop explained once in
  Info › Definitions. Not built. BZ's own steer: in 2027, mobile first.
- ~~**`sub` came back `world` for an American blend.**~~ **CLOSED
  2026-09-07, v1.8.55.** BZ ruled: leave it, blend lives in style not type.
  The shelf already agreed — 31 blend entries sit under seven types and
  every one is right, because a blended Scotch is still Scotch. `L.TYPES`
  is untouched at twelve; the LABEL PROMPT was the thing that did not know,
  so it now says give the base spirit as the type and put blend in style.
  (Original entry below, kept for the reasoning.)
- ~~`sub` came back `world` for an American blend of straight whiskeys.~~
  Not a misread — a hole in `L.TYPES`, which has no entry for a blend, so
  the model reached for the only catch-all there is. BZ's shelf files Old
  Elk Wheat N Rye as `rye` and Old Elk Cigar Cut Island Blend as `bourbon`
  for the same missing reason. A taxonomy change touches every entry that
  uses the type; it wants its own session.

**Do not rebuild these, they are done:** the multi-shot sheet (a phone
ignores `multiple` on a file input and gives one photo at a time, which cost
four paid calls in eighteen seconds before it existed); the 1600px
client-side resize (a phone photograph is 13.9MB against a 10MB ceiling);
rejecting a QR payload as a barcode (Bardstown's back panel carries one and
zxing stopped on it); `houseSame` (Co. versus Company would have been offered
as a correction on 36 of 109 houses, and ACCEPTING it forks a house in two
everywhere that groups by one); and `mashNote`, which states the total
because 57.6 + 38.0 + 4.4 is 100 and 57.6 + 30.0 + 4.4 is 92, and the
arithmetic was the only thing that could tell a right reading from a wrong
one.

(The old "Waiting on somebody else" section stood here. Both its entries
moved into ## Clubs on 2026-09-07, which is what that section is: work
blocked on a second human being rather than on code. Two copies of an entry
is how the two come to disagree.)

## Accrues on its own

**Barcode coverage.** The scanner works and knows nothing until a listing is
pasted or somebody names a miss. About half the shelf appears on a retail
listing; single barrels and festival bottlings never will. Nothing to build.

## Deferred features

~~**Gifts** — the wishlist pointed outward (item 5b).~~ **BUILT — verified
2026-09-09.** `L.giftList` and `L.giftText` exist and are wired at the
wishlist: five picks, a flight-finishing bottle first, no prices. Extended
at v1.9.40 with BZ's ask — the list can go as the message itself or as a
link carrying the names in the URL fragment.

~~**Receipt ingest by email** (item 7).~~ **PARTLY BUILT — verified
2026-09-09.** `receiptsDialog` is reachable from Settings and reads a
receipt you hand it, via `L.receiptColumns` and `L.receiptUpdates`. What
does NOT exist is the "by email" half, and that is not a build: it needs an
inbox somewhere for receipts to arrive at, which is infrastructure rather
than code. The entry named the delivery and hid the fact that the reading
was done.
~~**Road trip planner** — blocked on a routing decision (item 8).~~
**DROPPED, BZ 2026-09-09.** Not useful without detailed routing.
**Tasting night on phones** — paper works; the phone variants are deferred
(item 10).
**A budget on a lookup run** (item 11) — **HALF BUILT, verified
2026-09-09, and the open half is smaller than this entry implies.** The
circuit breaker stops a run after five consecutive errors, which was the
dangerous half. `L.LOOKUP_CAP` is 600 a day, enforced by `L.canLookUp`,
with the number left today shown on screen and a message when it is
reached — so a CAP exists as well as a breaker. What is genuinely missing
is only the ESTIMATE before a run starts and the total after it, which is
comfort rather than protection. Checked: there is no estimate anywhere in
the source. *(Re-checked 2026-09-15 at v2.4.4: still none. Cap still 600,
index.html:18778.)*
**Pooled flights cannot be fully blind** — noted, not blocking (item 12).

## Occasions

Named by BZ on 2026-09-07, alongside Clubs. Neither is a feature list.
These are REASONS the app would get used — a real thing in the calendar
that puts it to work — and they are kept separately because a reason
outlives the feature somebody guesses at from it.

An Occasion is time-shaped: it has a start, a length and an end, and one
person can do it alone. That shape is the requirement. Anything built here
TAKES A LENGTH rather than assuming one.

~~**Advent calendars**~~ **DONE v1.9.39 — and it was never a feature.**
BZ, when it came up again on 2026-09-09: calendars are POURS, not bottles.
A calendar is twenty-four samples you drink and never own, so nothing about
it belongs on a shelf. The away-pour machinery was already exactly right -
a typed name, no bottle created, the glass logged - and the only thing
missing was the word for it, plus letting the SOURCE stand without a name
the way L.bottleFrom already lets a lottery. Two lines in a list and a rule
about standing alone. It sat in the backlog as a feature for two days
because nobody asked what it was.

**Advent calendars** (BZ, 2026-09-07 — noted, not a plan). He is in one
every year, and his is the twelve days of Christmas rather than twenty-four,
which is the whole reason a length is a parameter. What he actually
described is small: a way to track your own tastes through a calendar. Not
a mode, not a reveal mechanic, not a group feature. The away pour already
logs a whisky he does not own; a calendar is a name and a day number on top
of that. He was explicit that he is unsure how useful it is — do not build
it on the strength of this note.

**Tasting night** — exists on paper and works. The phone variants are
deferred (item 10), and BZ was fine with paper as of 2026-09-01.

**A trip** — ~~the road trip planner is deferred on a routing decision
(item 8).~~ The planner was DROPPED 2026-09-09. Listed here because a trip
is an occasion before it is a feature: what it needs is a shape for "a run
of pours away from the shelf", which the away pour already half is.

## Two from 2026-09-07, both about other people

**What have your buddies been drinking** (BZ, 2026-09-07 — not started).
*(STATUS 2026-09-15: still not started — no node for it in
firebase-rules.json.)*

Attributed, consented, and therefore a Clubs item: it needs a second person
before it can be built OR tested, which is the constraint that whole section
exists for. The plumbing is largely there — `shares` and `sharedWith` are in
the rules, a tasting already travels to the people who were at it, and the
away pour already logs a whisky nobody owns.

What is NOT there is the question of what a buddy has consented to. Sharing
a shelf is not sharing a log: what somebody owns is a collection they chose
to show you, and what they drank on a Tuesday is a diary. Those are
different permissions and the rules currently have one. **Do not build this
by widening the existing share.**

**BUILT v2.4.19, BZ's design decisions of 2026-09-16.** Counts whiskies on
shelves and poured in the last 90 days. Opt-in, off by default: the switch is
in Buddies › How others see you. Each person's list is at
`popular/in/<uid>`, readable by its owner only - not by an admin. The nightly
GitHub job (`.github/workflows/popular.yml`, `popular.js`) is the only reader
and writes `popular/totals`, dropping anything under three people
(`L.POPULAR_FLOOR`). Shown as a line on a bottle's page and a Shop result,
and a Popular card on Shop. The open question below - distinct accounts
versus anonymity - was answered by keeping a per-person list private and
counting it in a job, which knows distinct people without any screen
knowing who.

**What's popular** (BZ, 2026-09-07 — not started). App-wide and anonymous,
in his words. The only idea discussed all day that gets BETTER as more
people use it, and the only one where the unit is not one shelf.
*(STATUS 2026-09-15: still not started — no node for it in
firebase-rules.json.)*

**The privacy design is the whole job and it is not a coding problem.**
Anonymous is a claim that has to survive somebody trying to break it, and
with a handful of users a popularity list is a list of what a handful of
people drank. Two accounts and one obscure bottle identifies a person
exactly. So:

- **Do not build it on `stats`.** That node exists, and it is per-uid,
  admin-read, and validated with a name in it. Counting across it produces
  a per-person record with a total on top, which is the opposite of
  anonymous however the screen presents it.
- **The count must not be reconstructible.** A shared counter incremented
  per pour, with no uid anywhere in the write, is the shape. Firebase rules
  cannot express "increment by one" — a transaction can, a rule can bound
  the value, and neither stops somebody writing a hundred. Worth deciding
  whether that matters before it is built.
- **A floor before anything is shown.** A whisky poured by fewer than some
  number of DISTINCT accounts should not appear at all — and distinct
  accounts is exactly what an anonymous counter cannot know. That tension
  is the real design question and it has no obvious answer.
- **It is not useful yet.** One user makes "what's popular" a mirror. It
  wants to exist BEFORE the circle grows, because anonymity cannot be
  retrofitted onto data already collected another way.

Worth pairing with the advent calendar under Occasions: both are reasons to
have the sharing paths working before anybody is invited, and neither is
worth building for an audience of one.

**A buddy tab, not a card in Settings** (BZ, 2026-09-07 — not started).
**CLOSED — BUILT.** Checked 2026-09-15: Buddies is a tab, `scr-buddies`
(index.html:2282) with its own nav button (index.html:2490). It carries the
room notes (v2.3.52), the merged portrait and Venn (v2.3.54), and the
whose-shelf pick list (v2.3.66). The entry is kept for the reasoning.

His words: I think we will eventually need a buddy tab, not in settings.
Right, and the evidence arrived the same evening. Everything about another
person is currently spread across three places — the name and findable
switch in Settings, the requests and shares in a card below them, and a
summary tile on Home — and none of them is where somebody goes when they
think about a buddy. Settings is where you go once; this is a thing you use.

It also hid a real fault for hours. Who can see your shelf was being read
from the wrong node, and because the answer only appeared in a card at the
bottom of Settings nobody looked at it long enough to notice it was always
nought.

Not started, and it wants the sharing paths to be right first — a tab is a
place to put things that work.

## Clubs

A Club is people-shaped: it does not exist with one person, which makes it
the test the app has never had. Everything in this section is blocked on a
second human being rather than on code, and none of it is actionable alone.

**Sharing has never run end to end with another person.**
**PARTLY STALE, 2026-09-15.** Shelves are shared with real accounts: BZ's
diagnostics card read four grants out of his shares (v2.3.15), and a real
buddy's panel was in his screenshot at v2.3.54. **UNCHECKED:** whether the
contribution queue, the tastings node or library publishing has run with a
second person. Nothing this pass could read records it.
The library, the
contribution queue, suspend, the shared shelves — all of it has only ever
been used by the account that owns it, and the week of 2026-09-03 shipped
six changes into exactly those paths. Two devices on ONE account was already
enough to find opposite Accept and Drop buttons. This is the same entry that
sits under "Waiting on somebody else"; it belongs here because a club is
what would finally exercise it.

**An advent calendar with other people.** The reason the calendar was raised
at all: a group doing the same thing on the same days is precisely the
sharing test, and it arrives on a date rather than when somebody gets round
to it. BZ was explicit that he is not sure how useful a shared setup is, so
this is a reason to have the sharing paths working by December — not a
brief to build a group mode.

**Pooled flights cannot be fully blind** — noted, not blocking (item 12).
Filed here because the constraint only bites with a room in it.

**v2.4.19: now measurable.** A bottle bought from a suggestion carries
`sugg` (the suggestion, from `L.suggestionTag`), and Shop says what the
suggestions you bought came to, judged by the pour verdict (BZ, 2026-09-16).
The same build fixed `L.discoveryFor`, which read `why`/`at` off wish entries
that L.wishAdd writes as `reason`/`added`, so no bottle wished for in the app
ever showed how you came across it.

**The candidate finder has never put a bottle in BZ's hands.** Not a club
item strictly, but the same class of unproven: until a suggestion is
followed through to a purchase the feature is untested in the only way that
counts. *(2026-09-15: a plain-language front door since v2.4.2, crash fixed
at v2.4.4. Still no purchase recorded.)*

## Closed

Built, measured or abandoned. Kept as a list rather than as pages, because the reasoning lives in CHANGELOG.md against the version that shipped it.

- 5b. Gifts — the wishlist pointed outward (v1.6.67)
- 15. Where a hard bottle can actually be got — shipped as Find it: L.findUrl, on the bottle screen and on candidate rows. The entry described the decision and outlived the build.
- Share what a flight tasted, and let it seed a wishlist (v1.6.66)
- Flights and the shape chart do not know about each other (v1.6.61)
- The map is disconnected from Origin (v1.6.61)
- An axis at 100% still has something to buy (v1.6.63)
- Score the shelf, and hand back a roadmap
- Fill the library's gaps in bulk
- Record what was actually poured, not what was designed
- Scan a barcode from the add-a-bottle form
- Does the recommender actually work
- Flights built around a flavor — "can you find the caramel?"
- 6. Barcode scanning
- 13a. Dimensions
- 1. Multi-user, sharing and tasting night
- 2. Turn on the lookup and design service
- 2b. Shared shelves, matched bottles, and Join Me Pour
- 2b-ii. An imported shelf needs enriching, and someone pays for it
- 2b-i. One resolver, not a batch script
- 2c. Where the missing tasting notes could come from
- 2c-ii. Pour Picks
- 2c-iii. Probe, then run the whole shelf
- 2d. Whiskybase via parse.bot
- 3. Old Elk Infinity Blend — closed
- 4. The 138 bottles with no tasting notes
- 5. Wishlist, and what is missing from the shelf
- 9. Flight re-instantiation
- 13. Paste a shop URL for a verdict
- 17. The shelf redraws whole, and counts by scanning
- Boot renders eight screens before the first paint — closed at v1.9.33 (added 2026-09-15)
- Untested L functions — closed at v2.3.47, 495 of 495 (added 2026-09-15)
- A buddy tab, not a card in Settings — built (added 2026-09-15)

### An axis at 100% still has something to buy — DONE 2026-09-04
Built. Every node opens the list, whatever the score, and the toast is
gone. A node searches the AXIS rather than one gap: the three nearest
things it wants, asked together and pooled into one deduped list, each
bottle labeled with the gap it answers. A full axis asks for more of its
thinnest rung, because every rung held means nothing MISSING rather than
nothing to buy.

Recorded because it took too long: BZ reported this three times over two
days and each time a symptom was fixed rather than the cause — a phrase
left over from when the axis meant Scotch regions, a hard list that
emptied the roadmap, a rotation so a second press asked something else.
The cause was that one gap became one phrase and one phrase is one search,
so an unlucky phrase made a whole axis look empty. Fixing symptoms three
times is what a backlog entry looks like when it should have been a build.

The cost is what was predicted: three lookups per press instead of one.
`deadGaps` still stops a phrase that came back empty being paid for twice,
and the spend cap below is now worth more than it was.

Original entry follows.


### An admin with an empty queue cannot tell they are an admin — DONE 2026-09-04
Both idle admin cards now say what they ARE as well as what they are not:
"Nothing waiting. You are an admin, so when somebody offers a bottle or a
barcode it appears here" — an empty list means nobody has offered
anything, not that the keys are gone.

Original entry follows.


### Share what a flight tasted, and let it seed a wishlist — DONE 2026-09-04
Built to the decisions above. The host records the evening under their OWN
uid naming who was there, and each guest's device reads it on next load and
applies it with their own credentials — so no account ever writes into
another, consent is attendance, and forwarding is impossible because a
device not on the list has nothing to read.

Owned bottles are logged as pours without asking. Everything else is
offered to the wishlist with the proof, the cask, where it was poured and
the note, which keeps its author's name.

`firebase-rules.json` gained a `tastings` node: owner-written,
readable by anybody the host shares a shelf with. REQUIRES A CONSOLE PASTE.

Untested with a second account, which is true of every sharing path in the
app.

Original entry follows.

### Is this offer actually a good price — DONE 2026-09-04
Built as specified: two verdicts, never blended; allocation as urgency
rather than a third axis; a manual rate that shows its working. Prices are
kept when parsing rather than discarded, a struck-through sale price reads
as the lower figure, and a shipping threshold is not mistaken for a bottle.

Three references in order — what YOU paid, then list price, then a price
the listing stated, which is labeled a guess and never outranks the other
two.

Two things found while building it. `L.paidFor` returns `{ avg, n }` and
the verdict was being handed the object, so the strongest comparison never
fired. And `paid` had no way into the app but a CSV import, which is why 3
of 344 bottles carried one — see the receipts entry below.

Original entry follows.


### Nothing reads the tasting notes
**PARTLY CLOSED, 2026-09-15.** Search reads every word of the tasting notes
since v2.3.27 ("something smoky" went from 0 results to an answer). No
flavor profile exists beside `L.tasteProfile`, and nothing matches a
candidate's description against one — both halves of "What it needs" below
are still unbuilt. Not asked for since; noted in the short list §6.

The largest unused asset in the app. 930 note fields on BZ's shelf, and the
flavor vocabulary is sitting in them: spice 145, sweet 140, fruit 134,
vanilla 118, caramel 111, honey 63, chocolate 50, smoke 50.

Every recommendation reasons from STRUCTURE — house, wood, proof, region,
age, mashbill. None reasons from FLAVOR, which is the thing a person
actually tastes and the axis they think in. "You have written caramel on
111 bottles and this one is described the same way" is a different argument
from "same distillery", and probably a better one.

What it needs:
- A flavor profile beside `L.tasteProfile`: which words recur, how often,
  and on what. Stop words and structure words ("palate", "long", "medium")
  are noise and have to come out; the list above is what survives that.
- Care about where a note CAME FROM. `tnSrc` and `tnFrom` already
  distinguish what somebody wrote from what a flight card prompted and what
  a model produced. A profile built from model-written notes is a profile of
  the model, and the app has been careful about this distinction everywhere
  else.
- The obvious use is matching a candidate's description against the
  profile. The subtler one is the portrait: what a shelf IS structurally
  versus what it TASTES like are two different sentences, and only one is
  currently written.



### Two shelves, side by side
**STATUS 2026-09-15: NOT BUILT AS DESCRIBED.** v2.3.54 runs the portrait on
the two shelves MERGED (`L.mergedShelf`; BZ: not run on theirs, run on
ours), which asks what the pair is together. It does not answer what one
house has that the other lacks, and nothing makes a flight runnable only
together. Not asked for since.

The sharing feature that has not been built. `L.shelfAxes` run twice
answers a question neither shelf answers alone: what can I taste at their
house that I cannot at mine. That is the reason to open the app while
standing in somebody's kitchen, and it needs no new data.

It also gives the flights somewhere to go: a flight neither of you can run
alone but both of you can run together is the strongest argument for
sharing a shelf that this app could make.



### Editable reference data — DEFERRED, and BZ is right to be wary
**RULED 2026-09-15 (v2.4.0): no admin tables.** BZ: not worth it for 2
tables, wanting to ensure new data adapts without a build. Measured at
v2.4.0: an unrecognised category renders, counts and lands in the portrait
without a build, and the library scan reports every undeclared category with
its count. Separately, v2.3.99 built a house registry with alias resolution
and **nothing that writes an alias** — that is an open item in the short
list §2 and not part of this ruling.

BZ, 2026-09-04: "should any of these scales and lists be settings to be
managed, populated now and then edited without a release?" Then, having
thought about it: "seems like trouble the more I think about it."

He is right, and the reason is that the lists are two different kinds of
thing wearing the same clothes.

**Reference data that grows with the world.** `worldDist` (house to
country), `PEAT_HOUSES`, `PEAT_EXTREME`, and arguably `COUNTRY_DEPTH`.
Distilleries open constantly — 20 houses were added by hand on 2026-09-04
and that list will be wrong again within a year. These are facts about the
world rather than judgments, and a wrong one is a small local error: a
bottle lands in the wrong country and nothing else moves.

**Scoring taxonomy.** `WOOD_FAMILIES`, `PROOF_BANDS`, `AGE_TIERS`,
`CORE_STYLES`, `FINISH_TIERS`, `PEAT_LABELS`, and the ladder-versus-set
split. Editing any of these silently rewrites what every score has ever
meant, retroactively, for everybody. Somebody nudges a proof band and a
shelf that read 100% on Strength yesterday reads 80% today with no bottle
having moved. That is not configuration, it is a schema change.

**If it is ever built, only the first kind, and not in Settings.** These
are not somebody's preferences, they are shared truth, so the home is the
LIBRARY — already shared, already admin-writable, already has review. A
house-to-country mapping is the same shape as a barcode pairing and should
travel the same path.

**And most of it need not be typed at all.** The lookup already returns a
distillery; it could learn the country the way it already learns proof and
cask, through the silent contribution path built on 2026-09-04.

**What stays in code, deliberately.** The taxonomy. A release is the right
amount of friction for a change that rewrites history, and the tests are
what stop a bad edit — `AGE_TIERS` has assertions behind it and a Firebase
field would not.

**Why it is deferred rather than queued.** The shared library has never
been used by two people. Adding a second shared, editable data path before
the first has met a real user means debugging both at once.

## Not looked at

The visual pass covered contrast, the liquid band, one dark surface per
screen and the type scale. Nothing else.
*(2026-09-15: since then, v2.3.47 swept tap targets and grew four controls
to 40px, and v2.3.51 put every tab's bar at the same top edge. Neither was a
visual pass.)*

## The library at volume, and the checks that read sentences — 2026-09-15

BZ, after two screens told him things that were not true: "how can we
uncover errors like I found and make the app more reliable and usable -
also, a one by one add/drop for the library once volume comes is crazy -
i'd hope the app can accept/reject most and I can just deal with the
rejections." Then: "I'd prefer to have every offering vetted as far as
possible before I have to get involved", and "Make sure I can accept and
deny efficiently not row by row only. A grid or a multiselect."

**His decisions.** Shadow mode for one release before the sorting acts on
its own. A dropped offer is held fourteen days with its reason, not erased.
Thin rows are enriched rather than handed to him. All four checks built.

**What the intake does now.** One pure verdict per offer, from checks that
already existed and were pointed the wrong way — `libraryAudit` found
nine kinds of fault in rows that were already IN. Four answers: `in`,
`fill` (goes in, and the fill-in run gets the rest), `ask`, `out`. Two
people offering one bottle are merged rather than raised as a question, and
every question the search could settle is put to the search first. Measured
on 457 real library rows offered into the shipped 325: 325 already in, 128
go in, and NOTHING reaches him until the web has tried — four
questions, all four of them sent to the search. The residue is a
multiselect grid: All / None / Add selected / Drop selected.

**Three faults found while building it**, each invisible today and each
appearing at volume:
- `L.gapOwned` — the list the paid search is told NOT to suggest —
  read the whole shared LIBRARY rather than the shelf. Every entry anybody
  had published counted as owned. On BZ's PC the library and the shelf are
  the same 325 rows, which is why it never showed; with eight Penelopes in
  the library he does not own, twelve names went out as owned and four were
  true. That is the empty Penelope answer.
- The same function matched on any word over three letters, so "An aged
  Woodford Reserve" matched everything with RESERVE in it: 23 Woodfords
  where he owns 6, 46 Islays where he owns 39. It now finds the house the
  way the planning question finds it.
- The bottle count on the planning answer read a name out of a map keyed by
  `libKey`. On a shelf fed by the library it answered 0 where the truth
  was 2.

And the contribution path threw away the contributor's own tasting notes
and region on the way in, so the note came back as a gap and was bought
again from the lookup.

**2026-09-16: switched on, and the consolidation.** BZ: "More different
things doing the same thing. Rules were not followed very well." Then his
decisions: hold the release until the duplicates are gone; a described whisky
has a nose AND a palate; fix the check first; take every duplicate; and the
sorting acts on its own now.

- The copy check (consistency.js) reduces functions to their shape and fails a
  decision written in two of them - engine and screens. First run: sixteen
  engine groups and twenty-two screen groups.
- One door each for: two names being one bottle (`sameName`, was 21 copies),
  two rows being one bottle (`sameBottle`: house, category, age, proof, cask),
  what a row contradicts (`rowFaults`, shared with the audit), already in the
  library (`alreadyNamed`), what needs notes (`slotOpen`, which `needsEnhancing`
  and `enhanceDiff` now ask), building a note from columns and adding to a
  person's note (`noteFromColumns`, `noteMerge`), the lookup queues
  (`lookupQueue`, and the two note queues no longer overlap), spending the
  day's lookups and saying the limit (`spendLookups`, `LOOKUP_LIMIT_SAY`, was
  seven places and four wordings), the missing-service sentence
  (`NO_SERVICE_SAY`, seven wordings), offering a bottle (`offerToLibrary`),
  applying a scan fix (`applyAuditFix`), and changing library fields
  (`libraryFieldWrite`).
- Faults the consolidation exposed: `fbPublishToLibrary` wrote to the admin-only
  library for everybody, so a label read by anybody but BZ was silently
  refused; a scan fix made from the shelf check never reached other devices;
  the shopping gaps counted the library as the shelf; a thin offer was
  re-looked-up every run until the budget ran out; under nose-and-palate the
  shelf fill would have paid for a palate and thrown it away.
- The sorting acts on its own: complete offers go in stamped `autoIn`, listed
  a fortnight with a take-back; the run reads the library fresh or judges
  nothing.

**Still open.** The shelf fill and the library fill remain two screens with
two progress vocabularies - they write different stores, and the rules they
share are now one. A rule written *differently* twice cannot be found by a
token check; those are found by reading.

**2026-09-16, after the scan: v2.4.16 to v2.4.18.** BZ: "Everything high and
medium", then "2 to 11 please - keep 1 on the back log".

- Sync (v2.4.16): a save records what it SENT, not what S held when the write
  came back; only the save that took the lock releases it; a change from
  another device arriving mid-save is read again after (`fbCatchUp`); a value
  taken from the account is recorded as pushed; sign-in and the live listener
  attach once; another account signing in on the same browser has the last
  one's shelf put away, not merged (`L.otherAccount`, `kb.owner`); a partial
  account delete stops syncing; stats are updated, not set, so a suspension
  survives; the shared view is marked sent only once sent; an update never
  reloads over a form; the worker installs from the network.
- Rules (v2.4.17, approved by BZ): only an admin writes the shared library;
  entries and offers carry bounded names and real timestamps; a contributor
  cannot write `vetted` or `dropped`; only an admin changes `suspended`.
  Known limit: a very old client's `set` on stats can still delete
  `suspended`, because a rule cannot refuse a delete by validation.
- One answer each (v2.4.18): the shelf status chips ask `L.statusCounts`
  (Gone counted "nothing open" and Sealed missed open-plus-spare); `houseSame`
  asks `houseKey` ("Jack Daniel's" was two houses to it and one to the
  registry; 0 of 109 shipped house pairs changed otherwise); `candidateFits`
  asks `houseSame`/`houseInText` instead of its own suffix list and substring;
  every search box asks `L.matchesSearch` (a buddy's shelf, Mark bottles and
  the flight picker each had a substring match of their own).
- Also v2.4.18: tap targets measured at 390px on every screen and sheet - the
  header barrel 44px, chips and toggles 40px, chart bars 28px touching rows
  (a deliberate trade against doubling the charts); no nested buttons found
  on any screen or the sheets checked. Eight messages reworded out of
  developer terms. Log lines pass through `L.redactSecrets`, so a sign-in token
  in a lookup address never reaches the synced log. gate.yml: read-only by
  default, each job asks for what it uses, and the checkout no longer leaves
  the token in .git/config for the test suite to read.

## A pattern worth keeping

Every serious fault in the week of 2026-09-03 was two functions holding one
rule with only one of them taught: parseLookup against cleanFinish, the reel
help against the reels, needsEnhancing against enhanceDiff, the parse
against the diff, bottleGaps against needsEnhancing, libraryEntry against
everything else. In every case both sides had tests and both passed, because
each was tested alone. The assertions that caught them test the PAIR, and
each is two lines at the end of a section that already exists: what the
queue asks about, the diff must be able to use; what the parse emits, the
diff must be able to read; what one screen publishes, another must not
immediately queue.

## Closed



### 5b. Gifts — the wishlist pointed outward — DONE 2026-09-04
Both halves, because they are different occasions. A short list — five,
flight-finishing bottle first — as a text for somebody who has never heard
of the app, with no prices on it. And a switch to let buddies see the list
standing, off by default because sharing a shelf means the shelf and a
wishlist is a different disclosure; when it is on it appears under What
they are after with Find it beside each bottle.

Anything already owned is dropped, matched by the same overlap the receipt
import uses, so "Ardbeg Ten" and "Ardbeg 10 Years Old" count as one.

Original entry follows.

### Import what you paid — DONE 2026-09-04
The manual half of receipt ingest, and much the cheaper half. BZ had a
spreadsheet of 39 orders with dates, prices and retailers, and no way to
get it in: `paid` arrived only through a CSV import that ADDS bottles, so
using it would have doubled his shelf.

Paste the sheet; it matches each line to a bottle already owned and fills
in the price and the date. It never adds a bottle — a receipt is evidence
about something you own. Matching is word overlap rather than exact name,
because a retailer writes "Barrell Bourbon Cigar Blend (750ml)" where the
library says "Barrell Craft Spirits Cigar Blend Bourbon Whiskey": exact
search matched 13 of his 39, overlap matches 27 strongly and 10 more worth
a look. Strong matches are ticked, probable ones are not, and nothing is
written until the list has been read.

On his own data it took the shelf from 3 priced bottles to 21.


### 7. Receipt ingest by email
**STATUS 2026-09-15: READING HALF BUILT, EMAIL HALF WAITING ON AN INBOX.**
See Deferred features above.

Forward a receipt to a dedicated Gmail account; Apps Script polls every
fifteen minutes, parses it, and drops the acquisition into a pending queue
for confirmation. No domain needed. Parsers are per retailer, so it grows
one shop at a time. Same script project as item 2.



### 8. Road trip planner
**DROPPED, BZ 2026-09-09.** Not useful without detailed route capability.
It never had a line of code. Kept for the data note and the routing
reasoning.

You backlogged this yourself, and the data side is now finished: all 56 US
distilleries, 23 Scottish and 18 Irish carry real coordinates.

The open question is routing. Straight-line ordering with distances costs
nothing and works offline but is not roads; real driving directions need an
API, a key and a proxy, and no free router handles the Islay ferry well.
Nearest-neighbor ordering is fine for six stops.



### 10. Tasting night
**STATUS 2026-09-15: PHONE VARIANTS STILL DEFERRED; PAPER WORKS.** Since
v2.3.53 flights are capped at 4.5 standard drinks and 10 glasses, a Running
a tasting guide sits behind an icon on Flights, and the printed sheets carry
a responsible-drinking line (v2.3.58).

Split out of item 1, which is otherwise done. Nothing here is built. The
specification below is BZ's, from early on, and was nearly lost when item 1
was closed with a one-line summary.

**BZ is fine with paper for now (2026-09-01), which changes the order.**
The phone variants were always the expensive half — blind submission, a
locked column, a synchronised reveal, and every one of them needing shared
shelves to work with people who are in the room rather than across the
country. Paper needs none of it.

- Host-only with paper. **The one worth building.** The app prints or shows
  the flight, the pours in order, and what to write down; the answers live
  on the card and go in afterward if they go in at all.
- Guests scoring blind on their phones. Deferred.
- A live reveal. Deferred, and pointless without the one above.

The post-night summary still stands on its own: whatever gets typed in
afterward is enough to say what the room got right.

**The blind column locks on submit.** An answer cannot be changed once
anyone has seen the reveal. This is the rule the whole thing turns on —
without it, blind scoring is not blind, and a late edit is invisible.

**Post-night summary.** What the room got right, and which pour fooled
everyone. Today the SMS carries the flight and its snacks, not what
happened.

Wants shared shelves exercised with a real second person first. That has
never been done.



### 11. A cap on what a lookup run can spend — DONE 2026-09-04
**CORRECTED 2026-09-15: the cap is 600 a day, not 120.** v1.7.4 raised it —
a ceiling that stops deliberate work is set wrong, and a fill is not an
accident. The code says `L.LOOKUP_CAP = 600` (index.html:18778). Since then:
per device on purpose, BZ's call (v2.3.66); every button lookup counted
through `askLookup` (v2.3.83). The 120 below is kept as it was written.

120 lookups a day, counted on the device, enforced at all three callers —
askLookup, the pooled radar search which spends three a press, and the
flight designer. Two of those reached the service directly and would have
made the cap decorative.

Honest about what it is: a guard against ACCIDENT rather than abuse. The
count is local and anybody determined could clear it; it stops an import
running away and a pocket press costing a fortune, which is the failure
that will actually happen among friends. Real enforcement belongs in the
Apps Script, where the key is.

Original entry follows.


### 12. Pooled flights cannot be fully blind
**STATUS 2026-09-15: UNCHANGED.** Noted, not blocking; needs a room with
people in it.

Raised 2026-09-01, after it was built. Marcus knows what he brought, so a
flight cast across the room is at best partly blind for whoever supplied
the pours. This is a real limit, not a bug.

**What it does not affect.** Most of the value is in flights where nothing
is being guessed: a house comparison, a cask lesson, anything whose point is
what you learn rather than what you spot. Those lose nothing at all.

**If a pooled flight does need to be blind**, the way tasting clubs handle
it is to bring MORE than is needed and let the host choose. Marcus brings
four, two make the cut, and he does not know which — the only thing he knows
is that some of his might be in there, which is true of the host as well.
That needs nothing from the app beyond casting from a wider pool than the
flight uses, so it is a small change if it is ever wanted.

**Not building it yet.** BZ was unsure the pooled flight would get used at
all. If it is not reached for in three months that is an answer, and it cost
an hour.



### 16. Firebase write ceilings
**CLOSED 2026-09-04.** `upc` is admin-write-only and a learned pairing goes
through `contrib` — see Security above. Kept for the reasoning.

Raised again 2026-09-03. Every shared node has a rule bounding what may be
written to it except `upc`, the barcode pairings, which anybody signed in
may write to without limit. A single script could fill it, and the cost
lands on this project's account rather than on whoever wrote it.

What the other nodes do that this one does not: bound the payload, bound
the key, and require the fields to be the shape the app writes. A barcode
pairing is a code and a name, so the rule is small — a key of digits within
a plausible length, a value of a name under a hundred characters and a
timestamp, and nothing else accepted.

Worth doing before the app is shared with anybody outside the current
circle, and not urgent while it is not.



### Also worth naming, from the week of 2026-09-03
Every serious fault this week was the same shape: two functions holding one
rule, and only one of them taught. parseLookup against cleanFinish. The
reel help against the reels. needsEnhancing against enhanceDiff. The parse
against the diff. bottleGaps against needsEnhancing. libraryEntry against
everything else. In each case both sides had tests and both sides passed,
because each was tested alone.

The tests that caught these assert the PAIR: what the queue asks about, the
diff must be able to use; what the parse emits, the diff must be able to
read; what one screen publishes, another must not immediately queue. That
is the pattern worth keeping, and it is cheap — every one of those is two
lines at the end of a section that already exists.


### Parked, 2026-09-17: finding faults before BZ does
Everything that escaped on 2026-09-17 had one shape: the code ran, every
check passed, and the app was wrong on BZ's real data or his real device.
Region blank on every bottle, Campbeltown showing 1 of 6, a whiskey the
library knew that the add form refused, a bottle page that kept the old
name after a rename, a synced switch that a second device turned off, a
write lost when Android backgrounded the app, a cropped splash icon, a
search box with no room around it.

Four answers, cheapest first. BZ parked the decision.

1. A SHELF REPORT on every build: load the real shelf and library and fail
   on what should never be true - a field the library holds and the app
   drops, a field blank for everything, a bottle whose product is missing,
   counts that swing more than a few percent between builds. Catches the
   region, Campbeltown and custom-copy faults.
2. A ROUND TRIP ON EVERY FIELD: fill every field a whiskey can have, push
   it through load, merge and export, fail on any that arrives empty. This
   is exactly how region was lost.
3. JOURNEY TESTS for what BZ does: add a bottle the library already knows,
   rename a bottle while standing on its page, switch a setting while a
   second device holds an older copy.
4. LOOK AT THE PICTURES: shots.js already photographs every screen at phone
   size and nobody reads them. Compare each release against the last and
   look at what moved.

### Parked, 2026-09-17: two fields the flights chat asked for
Both derivable from what the library already stores, no lookups:

1. SINGLE BARREL / SMALL BATCH / BLEND as a field of its own. Today it is
   read off the product NAME by whoever needs it, which is why "One Barrel
   or Many?" cannot be built against data. `style` and `scar` already carry
   most of it (single barrel, small batch, batched, blended).
2. FINISHED vs FULLY MATURED as a flag. `fin` says what the finishing cask
   was and `finc` whether a person stated it, so a bottle with a finish is
   finished and one without is not - except where the cask named IS the
   maturation. That exception is the whole of the work.

BZ parked the decision on 2026-09-17, with Region done and the rest of the
chat's asks answered.
