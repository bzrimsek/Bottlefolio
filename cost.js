#!/usr/bin/env node
/* WHAT THE ENGINE COSTS, against a budget that ratchets down.
 *
 * BZ, 2026-10-01, after the scan he asked for turned up a 13.8-SECOND backfill
 * I had shipped two builds earlier: "im a bit bothered by the performance issue
 * you built and then only uncovered after my scan request - how can we build it
 * better the first time?"
 *
 * The honest answer was that nothing could have caught it. Every other check
 * here proves the code RUNS or that a screen SAYS the right thing; gatetime.py
 * times the gate's own steps, not the app's. So "too slow" was not a red gate,
 * it was something a person had to go looking for.
 *
 * L.brandOf walked all 15,280 registry keys for every name it was asked about.
 * Stamping a library of 714 entries therefore cost about eleven million
 * shopNorm calls. On a desktop that is 13.8 seconds; the housekeeping chain runs
 * it, so on a phone it is minutes. The fix was an index - six probes instead of
 * fifteen thousand scans - and the same mistake will be made again in a
 * different function, which is why this exists rather than a note to be careful.
 *
 * A SYNTHETIC LOAD, NOT THE REAL ONE. A budget measured against live data moves
 * when the data moves, so a ratchet on it means nothing and a quiet regression
 * hides behind a library that happened to shrink. The fixture here is generated
 * from a fixed seed, at a scale ABOVE today's, and it carries no shelf data at
 * all - so this check can run anywhere, including a public gate.
 *
 * THE CEILING RATCHETS, exactly like the function-line ceilings in
 * consistency.js: when an operation gets faster the allowance is written down
 * and it can never drift back up. `node cost.js --budget` prints the table to
 * paste when something has genuinely improved.
 *
 * CI CLOCKS ARE NOISY, so each operation runs several times and the MEDIAN is
 * judged, and the allowance carries real headroom over the measured figure. A
 * check that goes red when a shared runner is busy is a check somebody turns
 * off within a fortnight.
 */
const path = require('path');
const APP = __dirname;
const { L } = require(path.join(APP, 'engine.js'))(path.join(APP, 'index.html'));

/* THE ALLOWANCE, AS A MULTIPLE OF THIS MACHINE'S OWN SPEED. Not milliseconds: a
   number of ms is a fact about a CPU, and this check is for an algorithmic
   regression, which is a fact about the code. The first run in the cloud failed
   because the budget was set on an idle desktop - shelfSet measured 41ms here
   and 377ms on the runner, nine times over - and because it ran beside ten other
   checks on a two-core machine.

   A reference loop below times a fixed amount of the same work the engine does,
   and every figure here is a multiple of it. A slower machine scales the
   reference and every allowance with it.

   Written down when an operation improves; never raised to make a build pass. */
const BUDGET = {
  'brandOf, one name': 1,
  'bottleIdentity, one entry': 1,
  'identBackfill, 1000 entries': 9,
  'adoptCandidates, one name': 2,
  'shelfSet, 400 bottles': 51,
  'a five-shelf overlap': 249,
  'dupeFindings, 1000 entries': 44,
  'importAudit, 400 products': 3,
  'rowFaults, 1000 entries': 6
};

/* HOW FAST THIS MACHINE IS, in the engine's own terms. A fixed corpus through
   the function every one of these operations leans on, so a runner three times
   slower reports a reference three times larger and every budget moves with it.

   Run before the fixtures are built, so a cold cache does not flatter it. */
function reference() {
  const corpus = [];
  for (let i = 0; i < 400; i++) {
    corpus.push("Angel's Envy Bottled-in-Bond Cask Strength Bourbon " + i);
  }
  const t = process.hrtime.bigint();
  for (let r = 0; r < 25; r++) corpus.forEach(x => L.shopNorm(x));
  return Number(process.hrtime.bigint() - t) / 1e6;
}
const REF = Math.max(0.5, reference());

/* A FIXED SEED, so the fixture is the same on every machine and every run. */
let seed = 20261001;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = a => a[Math.floor(rnd() * a.length)];

const HOUSES = ['Buffalo Trace', 'Heaven Hill', 'MGP', 'Beam', 'Brown-Forman',
  'Wild Turkey', 'Four Roses', 'Laphroaig', 'Ardbeg', 'Midleton',
  'Bruichladdich', 'Springbank', 'Suntory', 'Nikka', 'Glenfiddich'];
const BRANDS = ['Weller', 'Blanton', 'Elmer', 'Stagg', 'Eagle', 'Redbreast',
  'Octomore', 'Lagavulin', 'Hibiki', 'Barrell', 'Penelope', 'Jefferson',
  'Angel', 'Bardstown', 'Willett', 'Michter', 'Booker', 'Knob', 'Smoke',
  'Yellowstone'];
const WORDS = ['Silver', 'Oak', 'Reserve', 'Harvest', 'Cuvee', 'Dovetail',
  'Seagrass', 'Campfire', 'Lore', 'Beastie', 'Harmony', 'Select', 'Origin',
  'Legacy', 'Cask', 'Private', 'Heritage', 'Founders'];
const SUBS = ['bourbon', 'rye', 'scotch', 'irish', 'japanese', 'wheat'];

/* A REGISTRY THE SIZE OF THE REAL ONE, which is the whole point: the fault this
   check exists for was a function that walked all of it per name. */
function makeBrands(n) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const name = pick(BRANDS) + ' ' + pick(WORDS) + (i % 7 ? '' : ' ' + i);
    out[name.toLowerCase().replace(/[^a-z0-9]+/g, '_')] = { name: name, n: 1 };
  }
  /* The plain brands too, so a prefix has something shorter to beat. */
  BRANDS.forEach(b => { out[b.toLowerCase()] = { name: b, n: 9 }; });
  return out;
}

function makeLibrary(n) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const name = pick(BRANDS) + ' ' + pick(WORDS) + ' ' + pick(WORDS)
      + (i % 5 ? '' : ' ' + (10 + (i % 20)) + ' Year');
    const k = name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + i;
    out[k] = { k: k, name: name + ' ' + i, dist: pick(HOUSES), sub: pick(SUBS),
      proof: 80 + Math.floor(rnd() * 60), style: pick(SUBS),
      age: i % 3 ? null : 4 + (i % 18),
      fin: i % 4 ? null : pick(['Oloroso', 'Pedro Ximenez', 'tawny port']),
      scar: pick(['standard', 'limited', 'batched', 'exclusive']) };
  }
  return out;
}

function makeShelf(library, n) {
  const keys = Object.keys(library);
  const catalog = {};
  const bottles = [];
  for (let i = 0; i < n; i++) {
    /* Most bottles name a library entry; one in eight names something the
       library has never heard of, which is what the read-time resolution has
       to work on and therefore what must be measured. */
    const own = i % 8 === 0;
    const name = own ? (pick(BRANDS) + ' ' + pick(WORDS) + ' Pick ' + i)
      : library[keys[i % keys.length]].name;
    catalog[name] = { k: name, name: name, dist: pick(HOUSES), sub: pick(SUBS),
      proof: 80 + Math.floor(rnd() * 60) };
    bottles.push({ id: 'B' + i, k: name,
      status: i % 3 === 0 ? 'open' : 'sealed' });
  }
  return { catalog: catalog, bottles: bottles };
}

/* THE MEDIAN OF NINE, which is rule 13e: anything that varies gets nine runs
   and a median, because three runs said boot was 358ms and nine said 254. A
   shared runner's clock is noisy, and a check that goes red when the machine is
   busy is one somebody switches off within a fortnight. */
function timed(fn) {
  const n = 9;
  const seen = [];
  for (let i = 0; i < n; i++) {
    const t = process.hrtime.bigint();
    fn();
    seen.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  seen.sort((a, b) => a - b);
  return seen[Math.floor(seen.length / 2)];
}

/* ONE merge record, shared. Passing a fresh {} per call is the exact mistake
   this check exists to catch: L.libraryWords is keyed on the object's identity,
   so a new one every call misses the cache and measures a worse engine than the
   app runs. The app passes LIB.graves, which is one object. */
const NO_MERGE = {};

const brands = makeBrands(15000);
const library = makeLibrary(1000);
const rows = L.libraryRows(library);
const shelves = [];
for (let i = 0; i < 5; i++) shelves.push(makeShelf(library, 400));
const mine = shelves[0];

const ops = [
  ['brandOf, one name', () => L.brandOf('Weller Silver Oak 12 Year', brands)],
  ['bottleIdentity, one entry', () => L.bottleIdentity(rows[0], brands)],
  ['identBackfill, 1000 entries', () => L.identBackfill(rows, brands)],
  ['adoptCandidates, one name',
    () => L.adoptCandidates([{ k: 'Weller Silver Oak', status: 'open' }],
      library, NO_MERGE)],
  ['shelfSet, 400 bottles', () => L.shelfSet(mine, false, library, NO_MERGE)],
  ['a five-shelf overlap', () => {
    const a = L.shelfSet(mine, false, library, NO_MERGE);
    shelves.slice(1).forEach(s => {
      const b = L.shelfSet(s, false, library, NO_MERGE);
      Object.keys(b).filter(k => a[k]).length;
    });
  }, 3],
  ['dupeFindings, 1000 entries', () => L.dupeFindings(rows)],
  ['importAudit, 400 products',
    () => L.importAudit(mine.catalog, mine.bottles)],
  ['rowFaults, 1000 entries', () => rows.forEach(r => L.rowFaults(r)), 3]
];

const got = {};
ops.forEach(([label, fn]) => { got[label] = timed(fn); });

if (process.argv.indexOf('--budget') >= 0) {
  /* The table to paste when something has genuinely improved. Headroom of
     three times the measured figure, and NEVER ABOVE WHAT IS ALREADY SET: a
     ratchet only turns one way, or the first noisy run on a busy machine
     writes itself a bigger allowance and the check stops meaning anything
     (rule 28a - a ratchet, not a wall). */
  console.log('const BUDGET = {');
  ops.forEach(([label], i) => {
    const room = Math.max(1, Math.ceil(got[label] / REF * 3));
    const now = BUDGET[label];
    const want = now === undefined ? room : Math.min(now, room);
    console.log("  '" + label + "': " + want
      + (i === ops.length - 1 ? '' : ','));
  });
  console.log('};');
  process.exit(0);
}

console.log('\n  the engine against a synthetic load: 15,000 brands, '
  + '1,000 library entries, five shelves of 400.');
console.log('  budgets are multiples of this machine’s own speed — '
  + 'the reference took ' + REF.toFixed(1) + ' ms\n');
let bad = 0;
let slack = [];
ops.forEach(([label]) => {
  const ms = got[label];
  const cap = BUDGET[label];
  const capMs = cap === undefined ? 0 : cap * REF;
  if (cap === undefined) {
    console.log('  ✗ ' + label + ' has no allowance — add one');
    bad++;
    return;
  }
  const over = ms > capMs;
  if (over) bad++;
  console.log('  ' + (over ? '✗' : '✓') + ' ' + label.padEnd(30)
    + (ms / REF).toFixed(1).padStart(7) + '× of ' + String(cap).padStart(5)
    + '   (' + ms.toFixed(1) + ' ms)' + (over ? '   OVER' : ''));
  /* A ratchet, not a wall (rule 28a): an operation now far under its
     allowance has the allowance written down, so a regression cannot hide in
     the slack it left behind. */
  if (!over && cap > 2 && ms / REF * 6 < cap) slack.push(label);
});

/* AN ALLOWANCE THAT NOTHING USES IS A GHOST. */
Object.keys(BUDGET).forEach(k => {
  if (got[k] === undefined) {
    console.log('  ✗ the budget names "' + k + '", which nothing measures');
    bad++;
  }
});

if (slack.length) {
  console.log('\n  ' + slack.length + ' operation(s) are far under their '
    + 'allowance — run `node cost.js --budget` and paste the table, so the '
    + 'ratchet keeps holding:');
  slack.forEach(k => console.log('      ' + k + '  '
    + (got[k] / REF).toFixed(1) + '× of ' + BUDGET[k]));
}

if (bad) {
  console.log('\n  ✖ ' + bad + ' operation(s) cost more than they may\n');
  process.exit(1);
}
console.log('\n✓ every operation is inside its budget\n');
