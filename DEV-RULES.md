App Development Rules — Last updated: 2026-09-05

PHILOSOPHY
1  Good structure + comments. Quality over speed.
2  Reuse before inventing — read existing code first. Leverage working solutions in the same codebase before writing new ones.
2a WHEN I NAME AN EXISTING BEHAVIOUR, OPEN THAT CODE AND CALL WHAT IT CALLS. "The same as the shopping search" means read renderShop, find the function, call it. Not something with the same shape, not the nearest similar thing elsewhere in the file. Building adjacent to a named behaviour and calling it done is the most expensive failure available: it looks finished, it passes tests, and it is wrong in a way only I can see.
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

LANGUAGE
26 Never use hedging language — "should", "likely", "probably", "might", "may". If unsure, say so directly or test it first. Be definitive. If it works, say it works. If it won't, say it won't.
26a NEVER SAY IT IS FIXED UNTIL IT IS VERIFIED, and say what was verified and against what. "Measured on your bottles: 200 to 190" is a claim. "This fixes it" is a hope with a full stop. A green gate is not evidence a feature does its job.

TESTING
27 Every new scoring function, calculation, or game logic path gets test cases in the same session it is built — not after, not on request. If a function computes something, it has tests. No exceptions.
28 Pre-compute all expected values independently (in Node, not by trusting the app) before writing assertions. A test that derives its expected value from the same code it is testing is not a test.
29 Test harness is delivered alongside index.html and sw.js on any session that adds or modifies tests. Three files becomes four.
30 Render/screen functions do templating only — no scoring, calculation, or business logic inline. Logic a screen needs goes in a named helper it calls (e.g. leagueSessionCtx, tripItineraryBody, tripBuildPublishMsg). The harness cannot call render functions, so logic buried in them ships untested. If you are computing inside an fsRender template, stop and extract.
30a Cross-consistency — when one fact (a match status, a leaderboard row, a settlement) is rendered by more than one path (first paint, in-place updater, stored summary, live viewer), test that the paths agree from a shared game state, not each path's formatting in isolation. Two separately-green formatting tests can still disagree — that is exactly how the Nassau hole-completion popup drifted from the banner. Drive the real render through the recording-DOM harness and compare its output to the shared engine. (See madgolf-test.js §148 Nassau / §174 DOC / §175 walk-off.)
30b The suite tests behaviour through the engine and cannot see the WIRING. An element id nobody declares, a literal escape in a string, a state key that does not persist, a helper defined and never called, two functions sharing a name — all invisible to it and all shipped. A text-level check of the source catches them in a second; keep adding to it whenever a bug turns out to have been visible in the file all along.
30c A check that asserts a label is testing the copy. Assert the behaviour — that the control leads somewhere, that the number matches the engine — so a rewording does not break the gate and a real fault does.

COMPLETION
31 No loose ends. Any item deferred during a task ("next bump", "follow-up", "queued") is tracked and closed before the feature that spawned it is called done. A feature with pending pieces is not finished. Never let deferred work carry silently across turns — surface it and finish it.
32 Sync the working copy from the delivered outputs at the start of every task, before editing. A stale APP_VERSION in the working file makes bump.py collide with an already-shipped version number.
33 A feature is not built until the thing it depends on exists. Shipping a call to a service mode nobody has implemented is half a feature, and making the error message honest is not the same as making it work.
