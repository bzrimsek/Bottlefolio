/* WHAT THE APP'S LOG SAYS WENT WRONG, read once a night (BZ, 2026-09-17).
 *
 *   FIREBASE_SA=... node logwatch.js
 *
 * Every signed-in account keeps the tail of its log on its own node. This
 * reads them all, keeps the lines that say something failed, and reduces
 * each to a SHAPE - the sentence with its numbers, names and addresses
 * taken out - so the same fault twenty times is one finding.
 *
 * NOTHING FROM A SHELF IS PRINTED. The repository is public and so is a
 * workflow log, so this prints counts and shapes only, and writes the full
 * lines to stats/logwatch/report in the database, which only an admin can
 * read. A shape already reported stays quiet until it happens again after
 * the report was cleared; the job fails when something new turns up, which
 * is what sends the mail.
 */
const { token, DB } = require('./rules.js');

/* A LOOK THAT DOES NOT DISARM THE ALARM.
 *
 * Marking every shape seen is what makes "new" mean anything - but it is
 * also what makes a second reader useless, and worse than useless: BZ runs
 * a routine on his PC at 08:05 and the cloud job runs at 08:20 UTC, both
 * this same script against the same `seen` node. Whichever got there first
 * consumed the novelty, so on 2026-10-11 the routine ran at 12:36 UTC, the
 * cloud ran at 14:56 and passed, and a new fault that morning would have
 * reached nobody - the cloud's FAILURE is the mail.
 *
 * So: only the job that owns the alarm marks. Everybody else peeks. A peek
 * still SAYS what is new and still exits 0, because it is a report, not a
 * gate.
 */
const PEEK = process.argv.indexOf('--peek') >= 0;

const say = s => console.log('  ' + s);

/* A line worth reading twice. */
const BAD = [/would not/i, /failed/i, /refused/i, /\berror\b/i, /not written/i,
  /gave up/i, /timed out/i, /\b(404|500|503)\b/i, /unreadable/i, /could not/i,
  /denied/i, /THERE IS NO/, /is not data/i, /no answer/i,
  /* THE BAR AGAINST THE VIEWPORT (2026-09-30). navSelfHeal has written this
     line for weeks - 84 of them - and not one was ever read here, because it
     says neither "failed" nor "could not". Every one was the no-box case,
     which is noise below and cannot happen from v2.6.41; a line that gets
     past that filter now is a REAL mismatch, which is the thing the bar's
     self-healing exists for and has never yet had to do. */
  /re-measured/];

/* HOW FAR BACK A FAULT STILL COUNTS. A log holds six hundred lines, which
   on a quiet account reaches back weeks; a stale deployment fixed nine days
   ago is not news (BZ, 2026-09-17). */
const DAYS_BACK = 30;

/* A line's date. The stamp is MM/DD with no year, so a date ahead of today
   belongs to last year. Returns the days since, or null when there is no
   stamp to read - and an unstamped line is kept rather than dropped. */
function daysOld(line, now) {
  const m = /^(\d\d)\/(\d\d) /.exec(String(line));
  if (!m) return null;
  const today = now || new Date();
  let when = new Date(Date.UTC(today.getUTCFullYear(), +m[1] - 1, +m[2]));
  if (when.getTime() > today.getTime() + 86400000) {
    when = new Date(Date.UTC(today.getUTCFullYear() - 1, +m[1] - 1, +m[2]));
  }
  return Math.floor((today.getTime() - when.getTime()) / 86400000);
}

/* THE STAMP EVERY LINE CARRIES: date, time, device. One copy, because the
   noise filter below and shapeOf both have to strip it and they disagreed.
   `/^.{0,20}fb push ok/` was the old filter and it could never match: the
   stamp is twenty-ONE characters, "10/15 10:12:46 [and] ". So every push line
   was read as a finding, and on 2026-10-16 `fb push ok: 404 bytes, lately`
   was reported as a new kind of problem - because a BYTE COUNT contained
   404. Found 2026-10-27, by reading the report rather than the shapes. */
const STAMP = /^\d\d\/\d\d \d\d:\d\d:\d\d \[\w+\] /;

/* Noise: the app narrating a phone being a phone. Tested against the line
   with its stamp removed, so an anchored pattern means what it says. */
const NOISE = [/keyboard: viewport/, /nav was 0/, /screen held awake/,
  /^\s*$/, /asked about/, /^fb push ok/];

/* THE SHAPE OF A LINE, with everything particular removed: the stamp, the
   device, numbers, quoted names, addresses, and whatever follows "on" or
   "for", which is where a bottle's name lands. */
function shapeOf(line) {
  return String(line)
    .replace(STAMP, '')
    .replace(/https?:\/\/\S+/g, '<address>')
    /* A PAYLOAD IS NOT A SHAPE, and the header above promises nothing from a
       shelf is printed. The fill lines carry the whole entry they are about -
       `fill one Tottori (all) <- {"name":...,"dist":"Matsui Shuzo",...}` - and
       its escaped quotes get past the <name> rule below, so 120 characters of
       somebody's bottle went to a PUBLIC workflow log. Everything from the
       first brace or bracket goes, which also means two fills of different
       bottles reduce to one finding, as they should (2026-10-27). */
    .replace(/[{]|\[\s*[{"']/, '<data>').replace(/<data>[\s\S]*$/, '<data>')
    .replace(/"[^"]*"/g, '<name>')
    /* AND A BOTTLE NAMED WITHOUT ONE OF THOSE WORDS. `fill one Tottori (all)`
       puts it straight after "one", so "one" joins the list rather than a
       Japanese whisky going to a public log on its own (2026-10-27). */
    .replace(/\b(on|for|about|one) .*$/i, '$1 <name>')
    .replace(/\d+(\.\d+)?/g, 'N')
    .trim().slice(0, 120);
}

function findings(logs) {
  const out = {};
  logs.forEach(line => {
    const s = String(line);
    /* The stamp off FIRST, or an anchored pattern can never fire - see
       STAMP. The raw line is still what daysOld reads. */
    const said = s.replace(STAMP, '');
    if (NOISE.some(r => r.test(said))) return;
    if (!BAD.some(r => r.test(said))) return;
    const age = daysOld(s);
    if (age !== null && age > DAYS_BACK) return;
    const shape = shapeOf(s);
    const f = out[shape] || (out[shape] = { shape: shape, n: 0, lines: [] });
    f.n++;
    if (f.lines.length < 5) f.lines.push(s);
  });
  return out;
}

(async () => {
  const tok = await token();
  const get = async p => (await fetch(DB + '/bz-apps/whisky/' + p + '.json',
    { headers: { Authorization: 'Bearer ' + tok } })).json();
  const put = async (p, v) => {
    const r = await fetch(DB + '/bz-apps/whisky/' + p + '.json',
      { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify(v) });
    if (!r.ok) throw new Error(p + ' refused: HTTP ' + r.status);
  };

  const root = await get('') || {};
  const uids = Object.keys(root).filter(u => /^[A-Za-z0-9]{20,}$/.test(u));
  let lines = [];
  uids.forEach(u => {
    const log = (root[u] || {}).log;
    lines = lines.concat(Array.isArray(log) ? log : Object.values(log || {}));
  });
  say(uids.length + ' account(s), ' + lines.length + ' log line(s), '
    + 'reading the last ' + DAYS_BACK + ' days');

  const found = findings(lines);
  const seen = (await get('stats/logwatch/seen')) || {};
  const shapes = Object.keys(found);
  const fresh = shapes.filter(s => !seen[L64(s)]);
  if (!PEEK) {
    shapes.forEach(s => { seen[L64(s)] = Date.now(); });
    await put('stats/logwatch/seen', seen);
    await put('stats/logwatch/report', { at: Date.now(),
      accounts: uids.length, lines: lines.length,
      findings: shapes.map(s => found[s]) });
  }

  shapes.sort((a, b) => found[b].n - found[a].n).forEach(s => {
    say((fresh.indexOf(s) >= 0 ? 'NEW  ' : '     ') + String(found[s].n).padStart(3) + '  ' + s);
  });
  say(shapes.length + ' kind(s) of problem, ' + fresh.length + ' of them new');
  say('the lines themselves are in stats/logwatch/report, which only an admin reads');
  if (PEEK) {
    say('a peek: nothing marked seen, so the nightly job still has the alarm');
    return;
  }
  if (fresh.length) {
    console.log('  \u2716 ' + fresh.length + ' new kind(s) of problem in the log');
    process.exit(1);
  }
})().catch(e => {
  const c = e.cause || {};
  console.log('  \u2716 logwatch: ' + e.message
    + (c.code ? ' (' + c.code + ')' : ''));
  process.exit(1);
});

/* A key a database path will take: the shape, base64, without the padding
   or the characters a Firebase path refuses. */
function L64(s) {
  return Buffer.from(String(s)).toString('base64')
    .replace(/[+/=]/g, '').slice(0, 60);
}
