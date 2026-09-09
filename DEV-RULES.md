App Development Rules — Last updated: 2026-09-05

PHILOSOPHY
1  Good structure + comments. Quality over speed.
2  Reuse before inventing — read existing code first. Leverage working solutions in the same codebase before writing new ones.
2a WHEN I NAME AN EXISTING BEHAVIOUR, OPEN THAT CODE AND CALL WHAT IT CALLS. "The same as the shopping search" means read renderShop, find the function, call it. Not something with the same shape, not the nearest similar thing elsewhere in the file. Building adjacent to a named behaviour and calling it done is the most expensive failure available: it looks finished, it passes tests, and it is wrong in a way only I can see.
2b A PLACE, A ROUTE OR A SCOPE I NAME IS THE ACCEPTANCE TEST. 2a covers a named BEHAVIOUR; this covers the other three ways I say what I want, and all three were ignored on 2026-09-09 while I was agreeing with you. "The bottom of the shelf page, under You Keep Buying" is a PLACE — it went into the Wanted view, behind a filter pill that hides itself when the list is empty, so the thing I asked to see on the shelf was in the one place it could not be seen. "See the whole shelf, click a book" are ROUTES — the fix was driven through the filter pills instead, so it held on the route you checked and failed on both routes I use, twice, over two days. "Is that camera fix for all instances" is a SCOPE — one of four callers had been fixed. So: before building, restate the place, the route or the scope in your own words, and say plainly if you think it is wrong — I do not mind debate on the idea, I mind being ignored, and a disagreement I can see costs one message while a substitution I cannot costs a round. After building, the check drives THAT: the named screen, the named route, every named caller, in the harness that fails the build. A feature verified by any route other than the one I named is unverified. And prove the check by breaking the thing on purpose and watching it go red — a guard that cannot fail is not a guard.
3  Occam's razor — simplest solution that works. If two approaches solve the problem, take the simpler one.
3a A fix that adds a moving part to something that already has several is usually the wrong fix. If each change makes the thing harder to describe, stop changing it and describe what it SHOULD be.
4  Security and performance by default. No shortcuts that create vulnerabilities or degrade UX.

SCOPE
5  Ask before assuming — never build unsolicited changes, never remove a feature, never change scope without being explicitly asked. Iterative dev is welcome; unasked changes are not.
5a Never fold an unrequested change into work I asked for, and never build one in the middle of a delivery gate.
6  Tidy up dead code after every change. Flag any dead code that can't be cleaned immediately. Never let it accumulate silently.
7  No regressions — if a feature worked before your change, confirm it still works after.
7a A shared helper has a blast radius. Before changing one, list every caller; after changing it, measure each one. A fix aimed at one caller silently changed four others and it was only luck that they survived.
8  Never add production code to fix a preview-only problem. Preview limitations are accepted constraints.

DOCUMENTATION
9z App use is updated with every build, alongside the changelog and the
   version bump. BZ: remember to update App Use with each build. A help
   page describing a screen that has been rebuilt is worse than one saying
   nothing, and consistency.js only checks the controls it has been told
   about — so a new named control goes in BOTH the App use entry and the
   CONTROLS list that guards it.

VERSIONING
9  bump.py is the only way to bump versions. It reads the system clock — never write timestamps manually, never ask the user for the time. Fix bump.py if it fails; don't work around it.
10 Version bump hits five locations automatically via bump.py: file header, APP_VERSION, BUILD_TIME, UI string, sw.js CACHE_NAME. Versions are three-part major.minor.patch (patch rolls to the next minor at 100). Paths: madgolf → outputs/madgolf/; friday → friday-game/; foursome → foursome-game/; extras → outputs/ root. bump.py writes the changelog entry once, to the single canonical header block.
11 Changelog entry must be filled in before delivery — never leave [describe changes here]. Write it before bumping, not after. No blank entries anywhere in the file.

DIAGNOSIS BEFORE FIXING
12 Read the actual code before touching anything — no blind fixes. For any bug, identify the specific line causing it before writing a fix. When two apps diverge, read both side by side before touching either.
13 When a fix fails twice, stop. Write out: (a) what you read, (b) what you observe, (c) your diagnosis. Only then propose attempt three. No exceptions.
13a THE THIRD ATTEMPT MUST QUESTION THE DESIGN, NOT THE INSTANCE. Two failures in one area means the shape is wrong, not that the last patch missed. Ask what single structure would make all of these impossible.
13b AND ASK ME. After the second failure in the same area, say what you think is happening and ask what I am seeing. I am watching it fail on real data you cannot reach, and I have usually spotted the pattern before you have. Ten rounds of "found it, fixed it" is not persistence.
13c NEVER REASON ABOUT DATA YOU CANNOT SEE. My library, my deployed build, my log, my device. Every confident claim about any of those has been wrong. Instrument, ship, and read what comes back — a build that logs its decision per item settles in one round what inference does not settle in six.

13d A MEASUREMENT WITHOUT ITS POPULATION IS AN ANECDOTE. 13c says do not reason about data you cannot see. This is the other half: state which data you DID see, in the sentence, every time. Not "325 entries have a proof" but "325 entries on BZ's filled-in shelf, which is the end state of a shelf and not the one somebody imports tomorrow". Written that way the overreach is visible while you are writing it. Every time this was skipped the conclusion was wrong — an empty shelf said renders cost 8ms when they cost 112, a filled shelf said an enrichment feature had no users, and a stale catalogue said three bottles were missing that were not.

13e ANYTHING THAT VARIES GETS NINE RUNS AND A MEDIAN. Three runs said boot was 358ms; nine said 254. Timings, and anything else with spread, are not facts until they are a median of nine. A number taken any other way does not go in a doc, a changelog or a sentence to me.
14 Layout bugs: after two failed CSS attempts, read the working equivalent element's CSS — the fix is almost always already there. Never guess a third time without reading the working equivalent first.
15 For any async-dependent feature: trace the execution order before writing. Ask "when is this value available relative to when it is used?" Answer it before writing code.
16 When a Python edit script hits an AssertionError on any step, the file is in a partial state. Stop, re-read the file, confirm what was and wasn't applied, then fix cleanly. Never assume subsequent steps ran.
16a An edit script that asserts on several patterns writes NOTHING if a later assert fails. After any failed edit, verify the change is actually in the file before reporting it. A change reported and not applied has cost a whole round more than once.

LAYOUT & SCREEN PATTERNS
17 Before writing any new screen, modal, or layout element: read how the nearest equivalent working screen handles display/hide, flex, overflow, z-index, and height. Document what you find before writing.
18 Game tab show/hide: display:'flex' to show, display:'none' to hide — never display:''. Hide all siblings before showing target.
19 Z-index stack (low → high): content < modal-overlay 200 < nav 250 (always tappable) < confirmModal 300 < toast 400 < authScreen 500. Before any modal/overlay work, read all fixed-position z-index values and confirm the new element's layer against this stack.
19a A pseudo-element used for decoration paints OVER unpositioned content. Anything drawn with ::before or ::after needs a stacking context and a negative z-index, or it hides the thing it was meant to frame. A touch-target fix erased two icons this way and nothing caught it, because the button was still there and still tappable.
19b An id emitted by a function that draws more than once per page must be unique per call. Duplicate ids in one document are invalid and url(#id) resolves to whichever came first.

FIREBASE
20 Before any new Firebase operation, verify method, path, and writeKey payload align with existing security rules.
21 Never write to Firebase before the load completes (_fbLoaded guard). Check hasRemoteData includes all critical state fields (players, games, activeSession, sessions).
21a Every uid-keyed node is writable only by its owner. When a feature needs one account to affect another, the owner records it and the other side applies it — never a cross-account write, however convenient.

STATE
22a Three lists must agree: the state defaults, what is written to this device, and what follows the account. A key in one and not the others silently does not survive a reload or does not follow the account. Anything declared mergeable must actually be synced.

DELIVERY
22 Run the pre-delivery audit script before every delivery. All checks must pass. No exceptions, no skipping.
23 Named output files always built from the working index.html — never from uploads or prior named files.
24 Compress chat before context bloat. Prepare handoff comments before they're needed.
25 Every delivery = index.html + sw.js + named lock file (e.g. friday-game-v13.34.html). All three. No exceptions.
25a MY WORK SHIPS THE MOMENT IT IS WRITTEN, not with the drop. Apps Script, Firebase rules, anything I paste into another tool — hand it over as its own file with its own walkthrough so I can do it while the gate runs. And say plainly when a piece of it depends on an app version I have not installed yet.
25b Write the walkthrough for somebody who has not opened that tool in a month. Real menu names, real button names, the actual block of code I will be looking at and what it should read afterwards. "Add two lines to your existing doPost" is not an instruction.
25c Report the gate one check at a time, as each lands. Never run the loop silently and report at the end, and never say "running the gate" with no result attached. Read the whole output of each check, not the last line — a check once sat broken for several builds because the failure was thirty lines above a blank final line.

25f CALL THE APPS SCRIPT FILE Code.gs. It is delivered from the container as lookup.gs and it lives in my project as Code.gs, and two names for one file is how a paste lands in the wrong place. Say Code.gs when handing it over. label.gs and shelf.gs match on both sides and keep their names.

25e A PASTE IS NOT A DEPLOY, AND SAYING SO IS MY JOB EVERY TIME. Apps Script serves the DEPLOYED version, not the saved one, so a pasted file changes nothing until Deploy → Manage deployments → pencil on the existing deployment → New version. This has already cost a whole debugging round: BZ had pasted Code.gs, I confirmed the file contained the mash rule, and we both concluded the service was fine while the live web app ran months-old code. probeWiring cannot catch it either — it runs in the editor against saved code and will happily report every mode present while the deployment is stale. So whenever a delivery includes a .gs file, the handover says PASTE AND DEPLOY, names the menu path, and repeats it at the top of the next session until BZ confirms it. Do not assume a paste mentioned yesterday was deployed.

25d NEVER HAND ME A FILE THAT NEEDS EDITING AFTER I PASTE IT. Anything I have to hand-edit after a paste will eventually be edited wrong, and a dropped line usually fails SILENTLY — doPost lost a mode twice, and the app reports a missing mode as a broken feature rather than an absent one. Ship the whole file with every line already in it, and ship a probe I can run that says whether the wiring is right before I deploy. If a file genuinely cannot be shipped whole, say which line I must add and what the block must read afterwards (25b), and give me the probe anyway.

LANGUAGE
26 Never use hedging language — "should", "likely", "probably", "might", "may". If unsure, say so directly or test it first. Be definitive. If it works, say it works. If it won't, say it won't.
26a NEVER SAY IT IS FIXED UNTIL IT IS VERIFIED, and say what was verified and against what. "Measured on your bottles: 200 to 190" is a claim. "This fixes it" is a hope with a full stop. A green gate is not evidence a feature does its job.

TESTING
26b A CLAIM IN A DOC THAT NOBODY CHECKED IS MARKED AS UNCHECKED. HANDOFF said a mash bill is printed on the back of most American whiskey. Six photographs disproved it in twenty minutes and the whole feature was built to the wrong brief until then. If a backlog entry rests on a fact nobody has verified, say so in the entry — an unmarked assumption becomes a requirement by the time somebody reads it back.

27 Every new scoring function, calculation, or game logic path gets test cases in the same session it is built — not after, not on request. If a function computes something, it has tests. No exceptions.
28 Pre-compute all expected values independently (in Node, not by trusting the app) before writing assertions. A test that derives its expected value from the same code it is testing is not a test.
28a A RULE WITH NO CHECK BEHIND IT IS A SUGGESTION. Rule 27 was broken three times in one day and nothing noticed until a review went looking. When a rule turns out to have been broken, add the check that would have caught it IN THE SAME SESSION, before moving on. And where the debt is older than today's work, make the check a RATCHET rather than a wall: allow the known offenders by name, fail anything new, and add a second check so the allowed list cannot rot. A check that stands between me and shipping gets switched off rather than satisfied.

29 Test harness is delivered alongside index.html and sw.js on any session that adds or modifies tests. Three files becomes four.
30 Render/screen functions do templating only — no scoring, calculation, or business logic inline. Logic a screen needs goes in a named helper it calls (e.g. leagueSessionCtx, tripItineraryBody, tripBuildPublishMsg). The harness cannot call render functions, so logic buried in them ships untested. If you are computing inside an fsRender template, stop and extract.
30a Cross-consistency — when one fact (a match status, a leaderboard row, a settlement) is rendered by more than one path (first paint, in-place updater, stored summary, live viewer), test that the paths agree from a shared game state, not each path's formatting in isolation. Two separately-green formatting tests can still disagree — that is exactly how the Nassau hole-completion popup drifted from the banner. Drive the real render through the recording-DOM harness and compare its output to the shared engine. (See madgolf-test.js §148 Nassau / §174 DOC / §175 walk-off.)
30b The suite tests behaviour through the engine and cannot see the WIRING. An element id nobody declares, a literal escape in a string, a state key that does not persist, a helper defined and never called, two functions sharing a name — all invisible to it and all shipped. A text-level check of the source catches them in a second; keep adding to it whenever a bug turns out to have been visible in the file all along.
30c A check that asserts a label is testing the copy. Assert the behaviour — that the control leads somewhere, that the number matches the engine — so a rewording does not break the gate and a real fault does.

30e THE GATE TESTS UNITS, FILES AND ONE PASS. IT DOES NOT TEST SEQUENCES OR SECOND RENDERS. BZ, after finding five bugs in a morning: we have a whole series of gates and tests, I periodically ask for code reviews, and yet. Right, and every one of those bugs was an interaction between two things that were each individually correct. The wishlist removal worked and the sync replaced it. The house merge was right and the publish undid it. The camera block drew perfectly the first time. The modal was correct and so was the nav. A unit test cannot see any of that, a text check reads one file, the walk takes ONE path through each screen, and a code review reads code rather than orderings. So: when a fix touches how two features meet, the test is a SEQUENCE — do it, sync it, reload it, do the other thing, look again — and any screen that appends anything gets rendered TWICE with the elements counted. And a check written for a bug must be run against that bug with the fix removed: my first two attempts at the second-render step passed with the stacking deliberately put back, once because it rendered the wrong branch and once because a headless browser has no camera so the branch never ran.

30d TWO FUNCTIONS MUST NOT ANSWER ONE QUESTION FROM DIFFERENT EVIDENCE. Before adding a helper, search for one that already answers what it answers. L.mashbill read a whisky's recipe off its NAME for months; L.mashShape was added to read the same recipe off its PERCENTAGES, and neither knew about the other. They agreed only while no bottle carried a mash bill, and would have begun disagreeing silently the day the fill landed — the taste profile and the bottle screen saying different things about the same whisky. 30a catches two paths RENDERING one fact; this is two paths DECIDING it. Nothing in the suite can see it, because both are correct in isolation. When it happens, one source wins and says so in a comment, and it answers in the vocabulary the existing callers already expect.

COMPLETION
31 No loose ends. Any item deferred during a task ("next bump", "follow-up", "queued") is tracked and closed before the feature that spawned it is called done. A feature with pending pieces is not finished. Never let deferred work carry silently across turns — surface it and finish it.
32 Sync the working copy from the delivered outputs at the start of every task, before editing. A stale APP_VERSION in the working file makes bump.py collide with an already-shipped version number.
33 A feature is not built until the thing it depends on exists. Shipping a call to a service mode nobody has implemented is half a feature, and making the error message honest is not the same as making it work.
