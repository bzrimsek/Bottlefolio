/* WHICH CHECKS A CHANGE NEEDS - asked here, and by the gate.
 *
 *   node check.js                 run what the change touches
 *   node check.js --list          say what it would run, and run nothing
 *   node check.js --all           every local check
 *   node check.js --names         print the names only, one per line
 *   node check.js --files a,b,c   judge THESE files rather than looking
 *   node check.js --since REF     judge what git says differs from REF
 *
 * BZ, 2026-10-01: "Every cycle all of them have to run even if we only changed
 * one page. We need a better, more streamlined method", and then, of a command
 * he would have to type: "I was not asking for manual tasks."
 *
 * So this is not a habit to remember. gate.py asks it with --since and runs what
 * it answers, which is why the ANSWER lives here and the table it reads lives in
 * checks.json: two readers, one rule. Written twice they drift, and the one that
 * drifts is the one that stops running.
 *
 * THE BASELINE MATTERS. The gate asks what differs from main, which is the true
 * question. Here there is no git, so it compares index.html against the newest
 * named lock - the copy that was shipped - and everything else against a stamp
 * kept OUTSIDE the repository, where nothing can publish it by accident.
 *
 * IT SAYS WHAT IT SKIPPED, every run. A check nobody is told was skipped has
 * quietly stopped existing, which is the fault this project keeps finding in its
 * own guards. And when it cannot tell what changed, it runs everything.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const BANNER = '/* =====================================================================\n   STATE + RENDER';
const STAMP = path.join(process.env.LOCALAPPDATA || process.env.HOME || HERE,
  'bottlefolio-check-stamp.json');

const TABLE = JSON.parse(fs.readFileSync(path.join(HERE, 'checks.json'), 'utf8'));
const CHECKS = TABLE.checks;
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const read = f => { try { return fs.readFileSync(path.join(HERE, f), 'utf8'); }
                    catch (e) { return null; } };
const arg = n => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : null;
};
const has = n => process.argv.indexOf(n) >= 0;

function halves(html) {
  if (html === null) return null;
  const start = html.indexOf('const L = {};');
  const end = html.indexOf(BANNER);
  if (start < 0 || end < 0) return null;
  return { engine: html.slice(start, end), screens: html.slice(end) };
}

function newestLock() {
  return fs.readdirSync(HERE)
    .filter(f => /^bottlefolio-v[\d.]+\.html$/.test(f))
    .map(f => ({ f: f, v: f.replace(/[^\d.]/g, '').split('.').map(Number) }))
    .sort((a, b) => (b.v[0] - a.v[0]) || (b.v[1] - a.v[1]) || (b.v[2] - a.v[2]))
    .map(x => x.f)[0] || null;
}

/* WHAT KIND OF CHANGE EACH FILE IS. index.html is asked separately, because
   which HALF of it moved is the whole point. */
/* WHICH HALF OF index.html A DIFF TOUCHED. The hunk headers give the lines that
   moved in the BASE file, and the banner's line in that same base says which
   side of it each one is. Answers null when git cannot say, and the caller then
   assumes both - never neither. */
function halvesChanged(ref) {
  let base = '', diff = '';
  try {
    base = String(execFileSync('git', ['show', ref + ':index.html'],
      { cwd: HERE, maxBuffer: 1 << 28 }));
    diff = String(execFileSync('git', ['diff', '-U0', ref, '--', 'index.html'],
      { cwd: HERE, maxBuffer: 1 << 28 }));
  } catch (e) { return null; }
  const at = base.indexOf(BANNER);
  if (at < 0) return null;
  const bannerLine = base.slice(0, at).split('\n').length;
  const out = { engine: false, screens: false };
  const hunks = diff.match(/^@@ -(\d+)(?:,(\d+))? /gm) || [];
  if (!hunks.length) return null;
  hunks.forEach(h => {
    const m = h.match(/^@@ -(\d+)(?:,(\d+))? /);
    const from = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    /* A HUNK THAT SPANS THE BANNER counts as both, which is the safe way to be
       wrong. */
    if (from < bannerLine) out.engine = true;
    if (from + len >= bannerLine) out.screens = true;
  });
  return (out.engine || out.screens) ? out : null;
}

function kindOf(f) {
  if (/\.gs$/.test(f) || /appsscript\.json$/.test(f)) return 'script';
  if (f === 'sw.js') return 'worker';
  if (f === 'firebase-rules.json') return 'rules';
  if (f === 'data.json' || f === 'map.json') return 'data';
  return null;
}

const kinds = new Set();
const why = [];
const named = new Set();          // a harness that changed runs itself
let everything = false;

/* --files and --since name what moved; otherwise look. */
let changed = null;
const files = arg('--files');
const since = arg('--since');
if (files) changed = files.split(',').map(s => s.trim()).filter(Boolean);
if (since) {
  try {
    changed = String(execFileSync('git', ['diff', '--name-only', since],
      { cwd: HERE })).split('\n').map(s => s.trim()).filter(Boolean)
      .map(s => s.replace(/^.*\//, '') === s ? s : s);
  } catch (e) {
    everything = true;
    why.push('git could not say what differs from ' + since + ' - everything');
  }
}

if (!everything && changed) {
  changed.forEach(f => {
    const base = f.replace(/^.*\//, '');
    if (base === 'index.html') {
      /* WHICH HALF, from the diff itself. A change to index.html is the common
         one, and by filename alone it means both halves and therefore every
         check - which is the whole thing this was built to stop. With a git ref
         to compare against, the hunk headers say where the change landed and
         the banner says which side of it that is. */
      const half = since ? halvesChanged(since) : null;
      if (!half) {
        kinds.add('engine'); kinds.add('screens');
        why.push('index.html changed (which half is unknown)');
        return;
      }
      if (half.engine) { kinds.add('engine'); why.push('the engine changed'); }
      if (half.screens) { kinds.add('screens'); why.push('the screens changed'); }
      return;
    }
    const k = kindOf(base);
    if (k) { kinds.add(k); why.push(base + ' changed'); return; }
    const stem = base.replace(/\.js$/, '');
    if (stem === 'engine' || base === 'checks.json') {
      everything = true;
      why.push(base + ' changed - everything reads it');
      return;
    }
    const own = CHECKS.filter(c => c.harness === base)[0];
    if (own) { named.add(own.name); why.push(base + ' changed'); }
  });
}

if (!everything && !changed) {
  /* NOTHING NAMED IT, so look: each half of index.html against the shipped
     copy, and everything else against the stamp. */
  const lock = newestLock();
  const nowH = halves(read('index.html'));
  const wasH = lock ? halves(read(lock)) : null;
  if (!nowH || !wasH) {
    everything = true;
    why.push(lock ? 'index.html will not split on the banner - everything'
      : 'no lock file to compare against - everything');
  } else {
    if (sha(nowH.engine) !== sha(wasH.engine)) {
      kinds.add('engine'); why.push('the engine changed');
    }
    if (sha(nowH.screens) !== sha(wasH.screens)) {
      kinds.add('screens'); why.push('the screens changed');
    }
  }
}

let stamp = {};
let fresh = {};
if (!changed) {
  try { stamp = JSON.parse(fs.readFileSync(STAMP, 'utf8')); } catch (e) {}
  fs.readdirSync(HERE)
    .filter(f => /\.(js|gs|json)$/.test(f) && !/^bottlefolio-v/.test(f))
    .forEach(f => {
      const body = read(f);
      if (body === null) return;
      fresh[f] = sha(body);
      if (stamp[f] === fresh[f]) return;
      const k = kindOf(f);
      if (k) { kinds.add(k); why.push(f + ' changed'); return; }
      const stem = f.replace(/\.js$/, '');
      if (stem === 'engine' || f === 'checks.json') {
        everything = true; why.push(f + ' changed - everything reads it'); return;
      }
      const own = CHECKS.filter(c => c.harness === f)[0];
      if (own) { named.add(own.name); why.push(f + ' changed'); }
    });
}

/* THE ANSWER. Always-run checks, anything a changed kind reaches, and any
   harness that changed itself. */
const wanted = CHECKS.filter(c => everything || c.always || named.has(c.name)
  || (c.reaches || []).some(k => kinds.has(k)));

/* NAMES ONLY, for the gate. */
if (has('--names')) {
  console.log(wanted.map(c => c.name).join('\n'));
  process.exit(0);
}

/* LOCALLY, audit.py and rulestest are not run by this: the audit is push.py's
   job and the rules need Java. */
const LOCAL_SKIP = { audit: 1, rules: 1 };
const run = (has('--all') ? CHECKS : wanted).filter(c => !LOCAL_SKIP[c.name]);
const skipped = CHECKS.filter(c => !LOCAL_SKIP[c.name])
  .filter(c => run.indexOf(c) < 0);
const secs = l => Math.round(l.reduce((t, c) => t + c.secs, 0));

if (has('--all')) { why.length = 0; why.push('--all'); }
if (!why.length) why.push('nothing has changed since the last clean run');
console.log('\n  ' + why.join('\n  '));
console.log('\n  running ' + run.length + ' (' + secs(run) + 's)'
  + (skipped.length ? ', skipping ' + skipped.length + ' (' + secs(skipped)
    + 's): ' + skipped.map(c => c.name).join(' ') : ''));
console.log('  the cloud gate decides for itself, from what differs from main\n');

if (has('--list')) process.exit(0);

let bad = 0;
for (const c of run) {
  const t = Date.now();
  process.stdout.write('  ' + c.name.padEnd(13));
  let out = '', threw = false;
  try {
    out = String(execFileSync('node', [path.join(HERE, c.harness)],
      { stdio: ['ignore', 'pipe', 'pipe'] }) || '');
  } catch (e) {
    threw = true;
    out = String((e.stdout || '') + (e.stderr || ''));
  }
  /* THE OUTPUT DECIDES, NOT THE EXIT CODE. consistency.js prints its failures
     and exits 0, so the first version of this said ok on a real one and only
     audit.py stopped the push.

     AND "0 failed" IS NOT A FAILURE: the version after that matched the word
     anywhere and called killer-bs-test's own "6529 passed, 0 failed" a red run.
     A check that cannot pass is as useless as one that cannot fail. */
  const SAYS_BAD = /✖|✗|^\s*FAIL\b|[1-9]\d* fail|Error:/m;
  if (!threw && !SAYS_BAD.test(out)) {
    console.log('ok   ' + Math.round((Date.now() - t) / 1000) + 's');
  } else {
    bad++;
    console.log('FAILED');
    out.split('\n').filter(l => SAYS_BAD.test(l)).slice(0, 12)
      .forEach(l => console.log('      ' + l.trim()));
  }
}

/* THE STAMP ONLY MOVES ON A CLEAN RUN, so a failure cannot teach this that the
   file is already checked. */
if (!bad && !changed) {
  try { fs.writeFileSync(STAMP, JSON.stringify(fresh, null, 1)); } catch (e) {}
}
console.log('\n  ' + (bad ? '✖ ' + bad + ' failed'
  : '✓ ' + run.length + ' passed') + '\n');
process.exit(bad ? 1 : 0);
