/* BZ'S SHELF, FETCHED FRESH INTO THE THREE FILES THE HARNESSES READ.
 *
 *   node snapshot.js            say what would change, write nothing
 *   node snapshot.js --write    write bz-bottles / bz-custom / bz-flights
 *
 * WHY THIS EXISTS. Six harnesses say they grade "BZ's real shelf" - answers,
 * says, papers, mine, screens, killer-bs - and every one of them reads three
 * files on this disk. Nothing had ever refreshed them. On 2026-11-02 they
 * held 380 bottles against his 389, with 23 rows carrying names he had since
 * corrected, and bz-custom.json was six weeks old; engine.js printed the age
 * and no more, because a stale shelf is a fact about what the numbers
 * describe rather than a fault in them (its own comment says so, and that
 * stands). What was missing was a way to make it NOT stale in one command,
 * so refreshing stopped being a script written afresh each time - the same
 * reason remote.js is a door and not a note.
 *
 * READ ONLY AGAINST THE ACCOUNT. It fetches and writes local files; it never
 * writes the database. Off-device changes go through remote.js, which is the
 * one door for that and asks for the reset claim.
 *
 * IT DOES NOT TOUCH THE .gpg. push.py re-seals a shelf file whose plaintext
 * has changed, and that is the only thing that may; a plain shelf file never
 * leaves this PC (CLAUDE.md, Building).
 *
 * Needs the admin key, like rules.js and dups.js:
 *   FIREBASE_SA_FILE=%USERPROFILE%\.bottlefolio\firebase-admin.json
 */
const fs = require('fs'), path = require('path');
const eng = require('./engine.js');
const dir = __dirname;
const write = process.argv.indexOf('--write') >= 0;

/* WHAT GOES IN WHICH FILE, and in the shape the file already holds - an
   array for the bottles, an object for the other two. engine.shelf() hands
   each straight to S.bottles / S.custom / S.flights, so a shape change here
   would be a shape change in every harness at once. */
const FILES = [
  ['bz-bottles.json', 'bottles', 'array'],
  ['bz-custom.json', 'custom', 'object'],
  ['bz-flights.json', 'flights', 'array'],
  ['bz-library.json', 'library', 'object']
];

/* THE SAME DATA, WHATEVER ORDER THE KEYS CAME BACK IN. A plain stringify
   called 40 untouched flights "changed" on the first run, because Firebase
   hands an object's fields back in its own order and the file was written in
   another. A 200KB rewrite to reorder keys is churn, and churn re-seals a
   .gpg and lands in a commit. */
const stable = v => JSON.stringify(v, (k, val) =>
  (val && typeof val === 'object' && !Array.isArray(val))
    ? Object.keys(val).sort().reduce((o, kk) => { o[kk] = val[kk]; return o; }, {})
    : val);

const count = v => Array.isArray(v) ? v.length
  : Object.keys((v && v.products) || v || {}).length;

/* THE ROWS THE HARNESSES ACTUALLY READ, and nothing else. His account node
   carries history, favs, edits, deleted, log lines and whatever the next
   feature adds; a snapshot that took the lot would put his reading history
   on this disk for no test's benefit, and would be re-sealed and shipped as
   .gpg forever after. Bottles keep the four fields the file already holds. */
const BOTTLE_FIELDS = ['id', 'k', 'paid', 'status'];
const slimBottle = b => {
  const out = {};
  BOTTLE_FIELDS.forEach(f => { if (b[f] !== undefined) out[f] = b[f]; });
  return out;
};

(async () => {
  const data = await eng.account(eng.myUid());
  const fresh = {
    bottles: (data.bottles || []).filter(Boolean).map(slimBottle),
    custom: data.custom || {},
    flights: data.flights || {},
    /* AND THE SHARED LIBRARY, which is the fourth file and the reason this
       tool was written at all. His app joins 754 published entries into
       S.base; nine harnesses that say they grade "BZ's real shelf" joined
       none, so answers.js graded a 322-entry catalogue in which 53 of his
       356 owned bottlings did not exist. The graves ride with it because
       LIB.graves is how a renamed entry still answers to its old name, and
       a library without them forwards nothing. */
    library: { products: data.library || {}, graves: data.graves || {} }
  };

  console.log('Bottlefolio - refresh the shelf snapshot'
    + (write ? '' : '  (say --write to write)'));

  let moved = 0;
  FILES.forEach(([name, key, shape]) => {
    const f = path.join(dir, name);
    const was = fs.existsSync(f)
      ? JSON.parse(fs.readFileSync(f, 'utf8'))
      : (shape === 'array' ? [] : {});
    const now = fresh[key];
    const days = fs.existsSync(f)
      ? Math.floor((Date.now() - fs.statSync(f).mtimeMs) / 86400000)
      : null;
    const same = stable(was) === stable(now);
    console.log('\n  ' + name
      + (days === null ? '  (absent)' : '  ' + days + ' days old'));
    console.log('      ' + count(was) + ' -> ' + count(now)
      + (same ? '   identical' : ''));

    /* WHICH ROWS MOVED, not just how many. A count alone hid 23 renamed
       bottles behind "380 -> 389" on the day this was written. */
    if (!same && shape === 'array') {
      /* KEYED BY WHATEVER THAT FILE'S ROWS ARE KEYED BY. The bottles carry
         an id; the flights carry a title and no id, and keying them on id
         alone reported "0 new, 0 gone, 0 changed" over 21 flights that had
         genuinely moved - a diff that cannot see a difference is the same
         fault as a check that cannot fail. */
      const by = a => { const m = {}; (a || []).forEach((x, i) => {
        if (x) m[x.id || x.title || ('#' + i)] = x; }); return m; };
      const A = by(was), B = by(now);
      const gone = Object.keys(A).filter(k => !B[k]);
      const added = Object.keys(B).filter(k => !A[k]);
      const edited = Object.keys(B).filter(k => A[k]
        && stable(A[k]) !== stable(B[k]));
      console.log('      ' + added.length + ' new, ' + gone.length
        + ' gone, ' + edited.length + ' changed');
      added.slice(0, 10).forEach(k =>
        console.log('        + ' + (B[k].k || k).slice(0, 56)));
      gone.slice(0, 10).forEach(k =>
        console.log('        - ' + (A[k].k || k).slice(0, 56)));
      edited.slice(0, 10).forEach(k => console.log('        ~ '
        + ((A[k].k || A[k].title || k) + '').slice(0, 30)
        + '  ->  ' + ((B[k].k || B[k].title || k) + '').slice(0, 30)));
    } else if (!same) {
      /* THE LIBRARY FILE WRAPS ITS ENTRIES, so the diff looks inside rather
         than reporting "products, graves" as two rows that changed. */
      const un = v => (v && v.products) || v || {};
      const A = un(was), B = un(now);
      const gone = Object.keys(A).filter(k => !B[k]);
      const added = Object.keys(B).filter(k => !A[k]);
      console.log('      ' + added.length + ' new, ' + gone.length + ' gone');
      added.slice(0, 10).forEach(k => console.log('        + ' + k));
      gone.slice(0, 10).forEach(k => console.log('        - ' + k));
    }

    if (same) return;
    moved++;
    if (!write) return;
    fs.writeFileSync(f, JSON.stringify(now, null, 2) + '\n');
    console.log('      written');
  });

  console.log('\n' + (moved === 0 ? 'The snapshot already matches his account.'
    : write ? moved + ' file(s) refreshed. The .gpg copies are re-sealed by'
        + ' push.py on the next build.'
      : moved + ' file(s) would change. Run again with --write.'));
})().catch(e => {
  console.log('\nFAILED: ' + e.message);
  console.log('If that is a credentials error, the admin key is wanted:'
    + '  FIREBASE_SA_FILE=%USERPROFILE%\\.bottlefolio\\firebase-admin.json');
  process.exit(1);
});
