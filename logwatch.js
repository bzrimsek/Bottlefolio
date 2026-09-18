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

const say = s => console.log('  ' + s);

/* A line worth reading twice. */
const BAD = [/would not/i, /failed/i, /refused/i, /\berror\b/i, /not written/i,
  /gave up/i, /timed out/i, /\b(404|500|503)\b/i, /unreadable/i, /could not/i,
  /denied/i, /THERE IS NO/, /is not data/i, /no answer/i];

/* Noise: the app narrating a phone being a phone. */
const NOISE = [/keyboard: viewport/, /nav was 0/, /screen held awake/,
  /^\s*$/, /asked about/, /^.{0,20}fb push ok/];

/* THE SHAPE OF A LINE, with everything particular removed: the stamp, the
   device, numbers, quoted names, addresses, and whatever follows "on" or
   "for", which is where a bottle's name lands. */
function shapeOf(line) {
  return String(line)
    .replace(/^\d\d\/\d\d \d\d:\d\d:\d\d \[\w+\] /, '')
    .replace(/https?:\/\/\S+/g, '<address>')
    .replace(/"[^"]*"/g, '<name>')
    .replace(/\b(on|for|about) .*$/i, '$1 <name>')
    .replace(/\d+(\.\d+)?/g, 'N')
    .trim().slice(0, 120);
}

function findings(logs) {
  const out = {};
  logs.forEach(line => {
    const s = String(line);
    if (NOISE.some(r => r.test(s))) return;
    if (!BAD.some(r => r.test(s))) return;
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
  say(uids.length + ' account(s), ' + lines.length + ' log line(s)');

  const found = findings(lines);
  const seen = (await get('stats/logwatch/seen')) || {};
  const shapes = Object.keys(found);
  const fresh = shapes.filter(s => !seen[L64(s)]);
  shapes.forEach(s => { seen[L64(s)] = Date.now(); });

  await put('stats/logwatch/seen', seen);
  await put('stats/logwatch/report', { at: Date.now(),
    accounts: uids.length, lines: lines.length,
    findings: shapes.map(s => found[s]) });

  shapes.sort((a, b) => found[b].n - found[a].n).forEach(s => {
    say((fresh.indexOf(s) >= 0 ? 'NEW  ' : '     ') + String(found[s].n).padStart(3) + '  ' + s);
  });
  say(shapes.length + ' kind(s) of problem, ' + fresh.length + ' of them new');
  say('the lines themselves are in stats/logwatch/report, which only an admin reads');
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
