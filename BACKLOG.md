# Backlog

Open work, in the order BZ set on 2026-09-03: security, then performance,
then finding the bottle. Exercising sharing with a second person came off
the top because it is not something he controls — it waits on somebody else
turning up. Everything under Closed is kept for the reasoning rather than
the task, and still carries the numbers the code comments refer to.

Last reconciled **2026-09-09, at v1.9.41**, entry by entry against the
source. The line before that said 2026-09-07 at v1.8.51, and before that it
said v1.26.19 — a version from before the scheme was reset and higher than
anything that exists, because a header claiming to be current while naming a
version nobody can find is worse than one with no version at all.

**WHY THIS PASS HAPPENED, and how to repeat it.** On 2026-09-09 BZ asked
what was left. SEVEN entries turned out to describe work already shipped:
camera propagation into the other capture moments, `sub: world`, the Google
button, gifts, receipt reading, the lookup budget, and the advent calendar —
which was not a feature at all. Each one cost him a round of being told
about work that was already done, and by then this file was less reliable
than the code it describes.

The cause is the same every time: a status read off an entry's HEADLINE
instead of the source. So the rule for this file is the rule the app's own
tests follow — before an entry is called open, open the code. Every item
below has been checked that way, and each one that changed says what was
checked and on what date. Where an entry names a function, the check is
whether it is defined and whether anything calls it; where it names a
behaviour, the check is the call site. Anything that could not be checked
from the source says so rather than being left to look decided.

Three kinds of entry live here now, and they are not the same kind of open:
work waiting on CODE, work waiting on a DECISION from BZ, and work waiting
on somebody or something outside the app — a second person in a room, a
fill that has not run, an inbox that does not exist. Only the first is ever
something to pick up and start.

## WHAT IS ACTUALLY OPEN, 2026-09-09 — the short list

Everything else below is either shipped, ruled on, or waiting on the world.
Three kinds, because they are not the same kind of open.

**Waiting on code — nothing.** There is no item on this list that somebody
could pick up and start today without an answer from BZ or an event outside
the app. That is worth stating plainly rather than leaving somebody to
discover it by reading four hundred lines.

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

## The shelf organizer needs work — LOW PRIORITY, BZ 2026-09-09

BZ: backlog that we need to work on the shelf organizer, low priority for
now. Raised while looking at the Buddies rebuild, so it is his judgement of
the feature rather than a fault report — no specific complaint is recorded
and nobody should invent one. Ask what is wrong with it before touching it
(rule 13b); it is `showShelfPlan`, reached from Shelf tools, Storing, "How
to arrange it", and it lays bottles out against the shelf capacities in
S.shelfCaps.

## CORRECTION: sync.js was never asserting one thing (v1.9.30)

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
data - the catalogue IS the shelf - so the ranking stands and the claim came
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

## 2. Performance

**THE DOCUMENT PARSE IS MEASURED AND RULED ON — BZ, 2026-09-09: don't.**
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

Not open. If it is ever raised again, raise it with a number: the untouched
halves are 104KB of CSS and 21KB of markup, and data.json already loads
separately.

**The shelf redraws whole, and counts by scanning.** — DONE 2026-09-04.
`L.ownedCounts` builds the key-to-count map in one pass and the search box
is debounced at 150ms, with the filter chips still redrawing immediately.

What was still open on 2026-09-04 was the same fault in newer code: the
recommender, the portrait and the shape chart each filtered the whole
catalogue with a per-product `ownedCount`, which is the 111,800-comparison
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

**TEST COVERAGE IS 95%, AND THE GAP IS NAMED.** 407 L functions, all used
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
three flights turn on recipe and the catalogue stored only a category. It
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
population. Decide afterwards, from counts:

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
**Road trip planner** — blocked on a routing decision (item 8).
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
the source.
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

**A trip** — the road trip planner is deferred on a routing decision
(item 8). Listed here because a trip is an occasion before it is a feature:
what it needs is a shape for "a run of pours away from the shelf", which
the away pour already half is.

## Two from 2026-09-07, both about other people

**What have your buddies been drinking** (BZ, 2026-09-07 — not started).

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

**What's popular** (BZ, 2026-09-07 — not started). App-wide and anonymous,
in his words. The only idea discussed all day that gets BETTER as more
people use it, and the only one where the unit is not one shelf.

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

**Sharing has never run end to end with another person.** The library, the
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

**The candidate finder has never put a bottle in BZ's hands.** Not a club
item strictly, but the same class of unproven: until a suggestion is
followed through to a purchase the feature is untested in the only way that
counts.

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
- Flights built around a flavour — "can you find the caramel?"
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

### An axis at 100% still has something to buy — DONE 2026-09-04
Built. Every node opens the list, whatever the score, and the toast is
gone. A node searches the AXIS rather than one gap: the three nearest
things it wants, asked together and pooled into one deduped list, each
bottle labelled with the gap it answers. A full axis asks for more of its
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
the listing stated, which is labelled a guess and never outranks the other
two.

Two things found while building it. `L.paidFor` returns `{ avg, n }` and
the verdict was being handed the object, so the strongest comparison never
fired. And `paid` had no way into the app but a CSV import, which is why 3
of 344 bottles carried one — see the receipts entry below.

Original entry follows.


### Nothing reads the tasting notes
The largest unused asset in the app. 930 note fields on BZ's shelf, and the
flavour vocabulary is sitting in them: spice 145, sweet 140, fruit 134,
vanilla 118, caramel 111, honey 63, chocolate 50, smoke 50.

Every recommendation reasons from STRUCTURE — house, wood, proof, region,
age, mashbill. None reasons from FLAVOUR, which is the thing a person
actually tastes and the axis they think in. "You have written caramel on
111 bottles and this one is described the same way" is a different argument
from "same distillery", and probably a better one.

What it needs:
- A flavour profile beside `L.tasteProfile`: which words recur, how often,
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
The sharing feature that has not been built. `L.shelfAxes` run twice
answers a question neither shelf answers alone: what can I taste at their
house that I cannot at mine. That is the reason to open the app while
standing in somebody's kitchen, and it needs no new data.

It also gives the flights somewhere to go: a flight neither of you can run
alone but both of you can run together is the strongest argument for
sharing a shelf that this app could make.



### Editable reference data — DEFERRED, and BZ is right to be wary
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
Forward a receipt to a dedicated Gmail account; Apps Script polls every
fifteen minutes, parses it, and drops the acquisition into a pending queue
for confirmation. No domain needed. Parsers are per retailer, so it grows
one shop at a time. Same script project as item 2.



### 8. Road trip planner
You backlogged this yourself, and the data side is now finished: all 56 US
distilleries, 23 Scottish and 18 Irish carry real coordinates.

The open question is routing. Straight-line ordering with distances costs
nothing and works offline but is not roads; real driving directions need an
API, a key and a proxy, and no free router handles the Islay ferry well.
Nearest-neighbour ordering is fine for six stops.



### 10. Tasting night
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
  on the card and go in afterwards if they go in at all.
- Guests scoring blind on their phones. Deferred.
- A live reveal. Deferred, and pointless without the one above.

The post-night summary still stands on its own: whatever gets typed in
afterwards is enough to say what the room got right.

**The blind column locks on submit.** An answer cannot be changed once
anyone has seen the reveal. This is the rule the whole thing turns on —
without it, blind scoring is not blind, and a late edit is invisible.

**Post-night summary.** What the room got right, and which pour fooled
everyone. Today the SMS carries the flight and its snacks, not what
happened.

Wants shared shelves exercised with a real second person first. That has
never been done.



### 11. A cap on what a lookup run can spend — DONE 2026-09-04
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
