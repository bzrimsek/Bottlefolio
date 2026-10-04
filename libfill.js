/* THE LIBRARY FILLS ITS OWN GAPS, once a night (BZ, 2026-09-28: "will I need
 * to keep pushing the button or can the library self heal?").
 *
 *   FIREBASE_SA=... GAS_LOOKUP_URL=... node libfill.js
 *   LIBFILL_BUDGET=100   how many lookups one run may spend (default 100)
 *   LIBFILL_DRY=1        work out what it would ask and write nothing
 *
 * Run nightly by .github/workflows/libfill.yml. Until this existed the only
 * thing that filled an entry already in the library was an admin pressing
 * "Look up N due" - the automatic intake handles OFFERS arriving, not gaps in
 * what is already there. So the library sat on 437 entries with something
 * findable missing and waited to be asked.
 *
 * IT ASKS THE SAME QUESTIONS THE BUTTON ASKS. L.libraryLists decides what is
 * due, L.lookupUrl builds the request, L.parseLookup reads the answer,
 * L.enhanceDiff works out what may be written and L.recordLookup keeps the
 * ledger - every one of them the door the app already uses, so the button and
 * the job cannot come to disagree about what "short of something" means.
 *
 * IT NEVER OVERWRITES. enhanceDiff fills what is absent and nothing else, and
 * the write is a PATCH of exactly those fields.
 *
 * THE LEDGER IS WHY ASKING FOR A CASK IS SAFE. Most whisky carries no finish,
 * so most of those questions come back empty - and L.shouldLookUp rests an
 * entry longer after each empty answer and stops asking at L.MISS_GIVE_UP. A
 * question with no answer costs a few lookups once, not a lookup every night.
 *
 * NOTHING PRIVATE IS PRINTED. The library is a shared catalogue of whiskies
 * and its names are public, but the workflow log is public too, so this prints
 * counts and a short sample rather than the run.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { token, DB } = require('./rules.js');
const { L } = require('./engine.js')();

const BUDGET = Math.max(1, Number(process.env.LIBFILL_BUDGET || 100));
const DRY = !!process.env.LIBFILL_DRY;
/* THE SERVICE'S OWN ADDRESS, built from the deployment the gate already
   deploys to rather than kept as a second secret that could drift from it.
   GAS_LOOKUP_URL still wins when it is set, for a one-off run against
   somewhere else. */
const BASE = process.env.GAS_LOOKUP_URL
  || (process.env.GAS_DEPLOYMENT_ID
    ? 'https://script.google.com/macros/s/' + process.env.GAS_DEPLOYMENT_ID
      + '/exec'
    : '');

const say = s => console.log('  ' + s);

/* AN IDENTITY FOR A JOB THAT HAS NOBODY SIGNED IN. The service asks who is
   calling: lookup.gs verifies a Firebase ID token and answers the account id,
   so a nightly run with no person behind it is refused, which is exactly what
   the first dry run came back with for every entry.

   The service account signs a custom token for a fixed job identity, Identity
   Toolkit exchanges it for an ID token, and that is what the service checks.
   Google's own flow, and no new dependency: crypto signs the JWT.

   The web API key is read out of index.html rather than kept as a secret. It
   identifies the project and authorises nothing - every protection rests on
   firebase-rules.json - which is why it can sit in a public file. The key that
   SIGNS is FIREBASE_SA, which the gate already holds. */
const JOB_UID = 'libfill-job';

function serviceAccount() {
  const raw = process.env.FIREBASE_SA
    || (process.env.FIREBASE_SA_FILE
      ? fs.readFileSync(process.env.FIREBASE_SA_FILE, 'utf8') : '');
  if (!raw) throw new Error('no key - set FIREBASE_SA or FIREBASE_SA_FILE');
  return JSON.parse(raw);
}

function webApiKey() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const m = html.match(/apiKey:\s*'([^']+)'/);
  if (!m) throw new Error('no apiKey in index.html');
  return m[1];
}

async function idToken() {
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.'
      + 'identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid: JOB_UID
  });
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body)
    .sign(sa.private_key, 'base64url');
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/'
    + 'accounts:signInWithCustomToken?key=' + webApiKey(),
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: head + '.' + body + '.' + sig,
        returnSecureToken: true }) });
  const j = await r.json();
  if (!r.ok || !j.idToken) {
    throw new Error('could not sign in as the job: '
      + ((j.error && j.error.message) || ('HTTP ' + r.status)));
  }
  return j.idToken;
}

/* The library's own corner of the database. The ledger lives beside the
   products so every device and this job read one answer to "when was this
   last asked", rather than each keeping a private opinion. */
const PRODUCTS = '/bz-apps/whisky/shared/catalog/products';
/* The canon, so a house is filed the way the library spells it rather than
   with its town and country appended (L.houseCanon). */
const REF = '/bz-apps/whisky/shared/ref';
const LEDGER = '/bz-apps/whisky/shared/catalog/fillLedger';

async function main() {
  if (!BASE) {
    throw new Error('no service address - set GAS_DEPLOYMENT_ID '
      + 'or GAS_LOOKUP_URL');
  }
  const t = await token();
  const at = p => DB + p + '.json?access_token=' + t;
  /* Who the service will be told is asking. */
  const who = await idToken();

  const products = L.libraryFromValue(await (await fetch(at(PRODUCTS))).json())
    || {};
  /* NOT FATAL. Without the canon a house is written as the service spelled it,
     which is what happened before this read existed. */
  let ref = null;
  try { ref = await (await fetch(at(REF))).json(); } catch (e) { ref = null; }
  const ledger = (await (await fetch(at(LEDGER))).json()) || {};
  const rows = L.libraryRows(products);
  const today = L.todayISO();
  const lists = L.libraryLists(rows, ledger, today);

  say(rows.length + ' entries, ' + lists.done.length + ' complete, '
    + lists.todo.length + ' due, ' + lists.waiting.length + ' resting');
  if (!lists.todo.length) { say('nothing to ask'); return; }

  /* The thinnest first: L.libraryLists scores each row, and an entry that is
     short of more is worth more when the night's budget runs out. */
  const due = lists.todo.slice().sort((a, b) => a.score - b.score)
    .slice(0, BUDGET);
  say('asking about ' + due.length + ' of them'
    + (DRY ? ' (dry run, nothing written)' : ''));

  let filled = 0, empty = 0, failed = 0, kept = 0;
  const wrote = {};
  for (const row of due) {
    const p = products[row.k];
    let res = null;
    try {
      /* CASK RIDES ALONG. It is not a library gap - most whisky has no
         finish, and calling 327 entries incomplete for ever would be the same
         absent-is-missing fault - but the service may know one, and naming it
         here steers the search at no extra cost: this request was being made
         anyway, and enhanceDiff writes any field the entry lacks. Two thirds
         of BZ's shelf had no cask recorded, which capped the winey reading on
         his taste profile (2026-09-28). */
      const want = row.missing.concat(p && p.fin ? [] : ['cask']);
      const r = await fetch(L.lookupUrl(BASE, row.name, want)
        + '&idToken=' + encodeURIComponent(who));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      res = L.parseLookup(await r.json(), { name: row.name,
        needIdentity: false });
    } catch (e) {
      failed++;
      ledger[row.k] = L.recordLookup(ledger, row.k, 'empty', today)[row.k];
      continue;
    }
    /* WHAT MAY BE WRITTEN: what the entry does not already say, and nothing
       else. The same door the bottle page uses. */
    /* AND THE CANON, so a house arrives spelled the way the library files it
       rather than with its town and country appended. */
    const add = res ? L.enhanceDiff(p, res, ref) : null;
    /* AND THE ONE TRY A VAGUE NOTE GETS IS SPENT, whatever the answer was.
       Asked against the entry as it would stand, so a run that improved the
       note writes no mark and the note is simply not vague any more; one that
       answered "dark fruits" again settles it, and the entry stops being
       offered on every run for ever (BZ, 2026-10-03: "One try at improving
       vague then done"). */
    const settled = L.keptVague(Object.assign({}, p, add || {}));
    if (!add || !Object.keys(add).length) {
      empty++;
      ledger[row.k] = L.recordLookup(ledger, row.k, 'empty', today)[row.k];
      if (settled) { wrote[row.k] = settled; kept++; }
      continue;
    }
    filled++;
    wrote[row.k] = settled ? Object.assign({}, add, settled) : add;
    if (settled) kept++;
    ledger[row.k] = L.recordLookup(ledger, row.k, 'found', today)[row.k];
  }
  if (kept) say(kept + ' vague note(s) kept after their one try');

  say(filled + ' filled, ' + empty + ' had nothing to add, ' + failed
    + ' would not answer');
  const fields = {};
  Object.keys(wrote).forEach(k => Object.keys(wrote[k])
    .forEach(f => { fields[f] = (fields[f] || 0) + 1; }));
  if (Object.keys(fields).length) {
    say('fields written: ' + Object.keys(fields).sort()
      .map(f => f + ' ' + fields[f]).join(', '));
  }
  if (DRY) { say('dry run: nothing written'); return; }

  /* One PATCH per entry, of exactly the fields that were absent. A whole-entry
     write would put back whatever this job happened to read at the start, and
     a person may have edited it since. */
  for (const k of Object.keys(wrote)) {
    const r = await fetch(DB + PRODUCTS + '/' + encodeURIComponent(k)
      + '.json?access_token=' + t,
      { method: 'PATCH', body: JSON.stringify(wrote[k]) });
    if (!r.ok) throw new Error('writing ' + k + ': HTTP ' + r.status);
  }
  const lr = await fetch(DB + LEDGER + '.json?access_token=' + t,
    { method: 'PUT', body: JSON.stringify(ledger) });
  if (!lr.ok) throw new Error('writing the ledger: HTTP ' + lr.status);
  say('written, and the ledger now holds ' + Object.keys(ledger).length
    + ' entries');
}

main().catch(e => {
  console.error('libfill failed: ' + ((e && e.message) || e));
  process.exit(1);
});
