/* THE DAILY LOG READ, AS ONE COMMAND (BZ, 2026-10-11).
 *
 *   FIREBASE_SA_FILE=... node logcheck.js
 *
 * His routine used to describe three steps in prose and leave the third -
 * "read the lines out of Firebase, use ./rules.js for the token" - to be
 * written fresh each morning. A command nobody has run before cannot match
 * a saved approval, so every run stopped and asked: "it can't seem to run
 * w/o approvals of various steps". Improvisation is unapprovable by
 * construction. One named command is approved once.
 *
 * It PEEKS. logwatch.js marks every shape it reports as seen, which is what
 * makes "new" mean anything - and means the first reader of the day
 * disarms the rest. The nightly cloud job owns that alarm, because its
 * FAILURE is what sends the mail. This only ever looks.
 *
 * NOTHING FROM A SHELF IS PRINTED: accounts are named by their first six
 * characters, the way logwatch does it, and no bottle or person is named.
 */
const { execFileSync } = require('child_process');
const { token, DB } = require('./rules.js');
const { L } = require('./engine.js')();

const say = s => console.log('  ' + s);
const head = s => console.log('\n' + s);

const REPO = 'bzrimsek/Bottlefolio';
const DAYS_BACK = 7;

/* WHAT A PERSON ACTUALLY SAW GO WRONG, as against a retry that recovered.
   A retry line says it is trying again; a failure line is the end of the
   road. */
const SEEN_BY_A_PERSON = [
  /label fill failed/i, /label read failed/i, /fill failed for/i,
  /failure shown in plain words/i, /gave up/i, /did not answer in time/i,
  /popup failed/i, /not data/i
];

/* NOT A FINDING - BZ has ruled on each of these, and a report that repeats
   them every morning teaches him to stop reading it.
   - usage is never a finding (2026-09-24)
   - the one-time answer URL 404 on iPhone is a lost answer and has not
     switched a mode off since v2.5.15; it counts only if the RATE worsens
   - "not an admin" on his second account is that account's normal state
   - a barcode seen for the first time is unknown until the label is read */
const RULED_ON = [
  /one-time answer URL/i, /googleusercontent\.com\/macros\/echo/i,
  /not an admin/i, /unknown barcode/i, /first sight/i
];

const hit = (line, set) => set.some(re => re.test(String(line)));

/* A line's age in days. The stamp is MM/DD with no year, so a date ahead of
   today belongs to last year. */
function daysOld(line, now) {
  const m = /^(\d\d)\/(\d\d) /.exec(String(line));
  if (!m) return null;
  const today = now || new Date();
  let when = new Date(Date.UTC(today.getUTCFullYear(), +m[1] - 1, +m[2]));
  if (when > today) when = new Date(Date.UTC(today.getUTCFullYear() - 1,
    +m[1] - 1, +m[2]));
  return Math.floor((today - when) / 86400000);
}

/* The device tag the app writes, [iph] / [and] / [win]. */
const deviceOf = l => (/^\d\d\/\d\d [\d:]+ \[([a-z]+)\]/.exec(String(l))
  || [, '?'])[1];

(async () => {
  /* ---- 1. the shapes, without disarming anything -------------------- */
  head('WHAT KINDS OF PROBLEM (logwatch --peek)');
  try {
    const out = execFileSync(process.execPath, ['logwatch.js', '--peek'],
      { cwd: __dirname, encoding: 'utf8', env: process.env });
    out.split('\n').filter(Boolean).forEach(l => console.log(l));
  } catch (e) {
    say('x logwatch would not run: ' + (e.message || e).split('\n')[0]);
  }

  /* ---- 2. did the nightly alarm go off? ----------------------------- */
  head('THE NIGHTLY JOB (its FAILURE is the mail)');
  try {
    const runs = execFileSync('gh', ['run', 'list', '-R', REPO,
      '--workflow=logwatch.yml', '-L', '3',
      '--json', 'conclusion,createdAt,databaseId'],
      { encoding: 'utf8' });
    JSON.parse(runs).forEach(r => say(
      (r.conclusion === 'success' ? '      ' : '  RED ')
      + String(r.createdAt).slice(0, 16).replace('T', ' ')
      + '  ' + r.conclusion + '   ' + r.databaseId));
    const red = JSON.parse(runs).filter(r => r.conclusion !== 'success');
    if (red.length) {
      say('a red run means a NEW kind of problem that morning. Read it:');
      say('  gh run view ' + red[0].databaseId + ' -R ' + REPO
        + ' --log | grep NEW');
    }
  } catch (e) {
    say('x could not ask GitHub: ' + (e.message || e).split('\n')[0]);
  }

  /* ---- 3. what a person actually saw, and out of how many ----------- */
  head('WHAT SOMEBODY SAW FAIL, last ' + DAYS_BACK + ' days');
  const tok = await token();
  const get = async p => (await fetch(DB + '/bz-apps/whisky/' + p + '.json',
    { headers: { Authorization: 'Bearer ' + tok } })).json();
  const root = await get('') || {};
  const uids = Object.keys(root).filter(u => /^[A-Za-z0-9]{20,}$/.test(u));

  const now = new Date();
  let kept = 0, scanned = 0;
  const by = {};
  uids.forEach(u => {
    const log = (root[u] || {}).log;
    const lines = Array.isArray(log) ? log : Object.values(log || {});
    lines.forEach(l => {
      const age = daysOld(l, now);
      if (age !== null && age > DAYS_BACK) return;
      scanned++;
      if (!hit(l, SEEN_BY_A_PERSON)) return;
      if (hit(l, RULED_ON)) return;
      kept++;
      /* THE POPULATION IS THE ACCOUNT AND THE DEVICE, which is how the
         iPhone one-time-URL 404s were found: a rate on one device, not a
         count across everybody (rule 13d). */
      const who = u.slice(0, 6) + ' [' + deviceOf(l) + ']';
      (by[who] = by[who] || []).push(String(l).slice(0, 150));
    });
  });

  if (!kept) {
    say('nothing. ' + scanned + ' line(s) across ' + uids.length
      + ' account(s) in the window, none of them a failure a person saw.');
  } else {
    say(kept + ' of ' + scanned + ' line(s) across ' + uids.length
      + ' account(s):');
    Object.keys(by).sort((a, b) => by[b].length - by[a].length)
      .forEach(who => {
        console.log('\n  ' + who + '  ' + by[who].length);
        by[who].slice(0, 5).forEach(l => console.log('      ' + l));
        if (by[who].length > 5) {
          console.log('      ...and ' + (by[who].length - 5) + ' more');
        }
      });
  }
  /* ---- 4. a shelf bottle that reaches no library entry -------------- */
  /* THE LIBRARY IS A SUPERSET (BZ, 2026-10-08): a bottle on a shelf that
     reaches no entry is a fault, not a curiosity.
     ASKED OF THE SHELF, NOT OF THE LOG. The app logs "N of your bottles are
     not in the library: a, b, c" and that line is a trap twice over: it was
     written by whatever build the device was running, which may be months
     old, and the names are comma-separated while "Colonel E.H. Taylor, Jr.
     Small Batch" has a comma in it. So ask L.keyForBottle - the app's own
     door - against TODAY's library.

     That is not hypothetical. On 2026-10-11 the routine reported two
     stranded names off those log lines and could not tell whether they were
     still stranded; both had in fact been resolved by v2.8.15, so the
     finding was three days stale when it reached BZ.
*/
  head('SHELF BOTTLES THAT REACH NO LIBRARY ENTRY (today\'s library)');
  const [lib, gravesRaw] = await Promise.all([
    get('shared/catalog/products'), get('shared/renamed')]);
  /* THE VALUE IS rec.to, A STRING, and the key is decoded - exactly as the
     app builds it at load. A probe that passed the whole {at,to} record got
     a record back from L.mergedInto, found library[record] undefined, and
     called two resolved names stranded. */
  const graves = {};
  Object.keys(gravesRaw || {}).forEach(k => {
    const rec = gravesRaw[k];
    const to = (rec && typeof rec === 'object') ? rec.to : rec;
    if (to && typeof to === 'string') graves[L.unFbKey(k)] = to;
  });

  let shelved = 0, lost = 0;
  const stranded = {};
  uids.forEach(u => {
    const bs = (root[u] || {}).bottles;
    const list = (Array.isArray(bs) ? bs : Object.values(bs || {}))
      .filter(Boolean);
    list.forEach(b => {
      if (!b.k) return;
      shelved++;
      const at = L.keyForBottle(b, lib || {}, graves, null);
      if ((lib || {})[at]) return;
      lost++;
      (stranded[u.slice(0, 6)] = stranded[u.slice(0, 6)] || []).push(b.k);
    });
  });
  if (!lost) {
    say('none. ' + shelved + ' bottle(s) across ' + uids.length
      + ' shelf/shelves, every one reaching an entry.');
  } else {
    say(lost + ' of ' + shelved + ' bottle(s) reach nothing:');
    Object.keys(stranded).sort((a, b) => stranded[b].length
      - stranded[a].length).forEach(who => {
      console.log('\n  ' + who + '  ' + stranded[who].length);
      stranded[who].slice(0, 8).forEach(k => console.log('      ' + k));
      if (stranded[who].length > 8) {
        console.log('      ...and ' + (stranded[who].length - 8) + ' more');
      }
    });
    say('');
    say('each one needs a library entry or a grave pointing at one.');
  }

  console.log('');
})().catch(e => {
  console.log('  x logcheck: ' + e.message);
  process.exit(1);
});
