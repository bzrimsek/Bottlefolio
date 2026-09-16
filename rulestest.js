/* THE FIREBASE RULES, RUN - not read.
 *
 *   node rulestest.js
 *
 * Starts the Firebase database emulator with firebase-rules.json and tries,
 * as a stranger, a signed-in person, somebody else and an admin, everything
 * each may and may not do - and the sequences that matter, like a share
 * granted and then read, then revoked and read again.
 *
 * WHY. Until 2026-09-16 every rules change was checked by reading it. The
 * emulator is Google's own rules engine, so a rule that reads right and
 * behaves wrong fails here before it deploys.
 *
 * AND IT IS PROVEN ABLE TO FAIL: the same suite runs a second time against
 * rules broken on purpose, and must catch each break.
 *
 * Then syncemu.js drives two devices through the sync faults that have cost
 * the most, against the same emulator.
 *
 * Needs Java. BZ, 2026-09-16: it runs in the cloud gate only; on a machine
 * without Java it says it was skipped, never that it passed. In the cloud
 * (CI set) a missing Java is a failure.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT = 'demo-bottlefolio';

if (process.argv.indexOf('--inner') < 0) {
  const java = spawnSync('java', ['-version']);
  if (java.error || java.status !== 0) {
    if (process.env.CI) {
      console.log('  ✖ rules: no Java on this runner, so the rules were not tested');
      process.exit(1);
    }
    console.log('  · rules: SKIPPED here - no Java. The cloud gate runs them.');
    process.exit(0);
  }
  const bin = path.join(__dirname, 'node_modules', '.bin',
    process.platform === 'win32' ? 'firebase.cmd' : 'firebase');
  const r = spawnSync(bin, ['emulators:exec', '--only', 'database,auth',
    '--project', PROJECT, 'node rulestest.js --inner'],
    { cwd: __dirname, stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(r.status === null ? 1 : r.status);
}

const { initializeTestEnvironment, assertSucceeds, assertFails } =
  require('@firebase/rules-unit-testing');
const { ref, get, set, update, remove } = require('firebase/database');

const RULES = fs.readFileSync(path.join(__dirname, 'firebase-rules.json'), 'utf8');
const W = 'bz-apps/whisky/';

/* Every check, as [name, expected: 'ok'|'refused', async (as) => promise]. */
async function suite(env) {
  const results = [];
  const as = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
  const seed = async (p, v) => env.withSecurityRulesDisabled(c => set(ref(c.database(), W + p), v));
  const check = async (name, want, fn) => {
    try {
      await (want === 'ok' ? assertSucceeds(fn()) : assertFails(fn()));
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, why: String((e && e.message) || e).slice(0, 160) });
    }
  };
  const at = () => Date.now();
  const r = (uid, p) => ref(as(uid), W + p);

  await env.clearDatabase();
  await seed('admins/admin', true);

  /* A PERSON'S OWN SHELF. */
  await check('you can write your own shelf', 'ok', () => set(r('alice', 'alice/bottles'), [{ id: 'B1', k: 'a' }]));
  await check('you can read your own shelf', 'ok', () => get(r('alice', 'alice')));
  await check('nobody else can read it', 'refused', () => get(r('bob', 'alice')));
  await check('nobody else can write it', 'refused', () => set(r('bob', 'alice/bottles'), []));
  await check('an admin cannot read it', 'refused', () => get(r('admin', 'alice')));
  /* Real data: an empty list is no data, which Firebase reads as a delete. */
  await check('an admin cannot write into it', 'refused', () => set(r('admin', 'alice/bottles'), [{ id: 'B9', k: 'x' }]));
  await check('an admin can delete it', 'ok', () => remove(r('admin', 'alice')));
  await check('a stranger cannot read anything', 'refused', () => get(r(null, 'alice')));

  /* THE SHARED LIBRARY. */
  const entry = { name: 'Ardbeg Ten', at: at() };
  await check('anybody signed in can read the library', 'ok', () => get(r('alice', 'shared/catalog/products')));
  await check('a stranger cannot read the library', 'refused', () => get(r(null, 'shared/catalog/products')));
  await check('a signed-in person cannot create a library entry', 'refused', () => set(r('alice', 'shared/catalog/products/ardbeg_ten'), entry));
  await check('an admin can', 'ok', () => set(r('admin', 'shared/catalog/products/ardbeg_ten'), entry));
  await check('a person cannot change one', 'refused', () => update(r('alice', 'shared/catalog/products/ardbeg_ten'), { proof: 92 }));
  await check('nor delete one', 'refused', () => remove(r('alice', 'shared/catalog/products/ardbeg_ten')));
  await check('an admin can change a field', 'ok', () => update(r('admin', 'shared/catalog/products/ardbeg_ten'), { proof: 92 }));
  await check('an entry needs a timestamp', 'refused', () => set(r('admin', 'shared/catalog/products/x'), { name: 'No Stamp' }));
  await check('a name over 200 characters is refused', 'refused', () => set(r('admin', 'shared/catalog/products/y'), { name: 'x'.repeat(201), at: at() }));
  await check('a timestamp in the future is refused', 'refused', () => set(r('admin', 'shared/catalog/products/z'), { name: 'Later', at: at() + 3600000 }));
  await check('a person cannot write the removals', 'refused', () => set(r('alice', 'shared/removed/ardbeg_ten'), { at: at() }));

  /* OFFERS TO THE LIBRARY. */
  const offer = { name: 'Springbank 10', at: at(), by: 'Alice' };
  await check('you can offer a bottle', 'ok', () => set(r('alice', 'contrib/alice/springbank_10'), offer));
  await check('an offer cannot carry its own verdict', 'refused', () => set(r('alice', 'contrib/alice/x1'), Object.assign({ vetted: { verdict: 'in' } }, offer)));
  await check('an offer name over 300 characters is refused', 'refused', () => set(r('alice', 'contrib/alice/x2'), { name: 'x'.repeat(301), at: at() }));
  await check('a key that is not a slug is refused', 'refused', () => set(r('alice', 'contrib/alice/Not A Slug'), offer));
  await check('you cannot offer in somebody else’s name', 'refused', () => set(r('bob', 'contrib/alice/y'), offer));
  await check('you cannot drop your own offer as if an admin', 'refused', () => set(r('alice', 'contrib/alice/springbank_10/dropped'), { why: 'x', at: at() }));
  await check('an admin can drop it', 'ok', () => set(r('admin', 'contrib/alice/springbank_10/dropped'), { why: 'adds nothing', at: at() }));
  await check('an admin can read every offer', 'ok', () => get(r('admin', 'contrib')));
  await check('nobody else can read your offers', 'refused', () => get(r('bob', 'contrib/alice')));
  await check('a barcode offer with a real code is taken', 'ok', () => set(r('alice', 'contrib/alice/upc/012345678905'), { name: 'Ardbeg Ten', at: at() }));
  await check('a barcode that is not twelve digits is refused', 'refused', () => set(r('alice', 'contrib/alice/upc/1234'), { name: 'Ardbeg Ten', at: at() }));

  /* WHO IS HERE, AND WHO IS SUSPENDED. */
  const stats = { name: 'Alice', at: at(), version: '2.4.22' };
  await check('you can write your own stats', 'ok', () => set(r('alice', 'stats/alice'), stats));
  await check('an admin can suspend you', 'ok', () => set(r('admin', 'stats/alice/suspended'), true));
  await check('you cannot lift your own suspension', 'refused', () => set(r('alice', 'stats/alice/suspended'), false));
  await check('your next save does not lift it either', 'ok', () => update(r('alice', 'stats/alice'), { at: at() }));
  await check('and it is still there', 'ok', async () => {
    let v = null;
    await env.withSecurityRulesDisabled(async c => {
      v = (await get(ref(c.database(), W + 'stats/alice/suspended'))).val();
    });
    if (v !== true) throw new Error('suspension was lost');
  });
  await check('you cannot read somebody else’s stats', 'refused', () => get(r('bob', 'stats/alice')));
  await check('an admin can read them', 'ok', () => get(r('admin', 'stats')));

  /* WHAT'S POPULAR. */
  const list = { at: at(), shelf: { ardbeg_ten: 'Ardbeg Ten' }, poured: {} };
  await check('you can save your popular list', 'ok', () => set(r('alice', 'popular/in/alice'), list));
  await check('a key that is not a library key is refused', 'refused', () => set(r('alice', 'popular/in/alice'), { at: at(), shelf: { 'Bad Key': 'x' } }));
  await check('a list carries nothing but its parts', 'refused', () => set(r('alice', 'popular/in/alice'), Object.assign({ extra: 1 }, list)));
  await check('nobody else can read your list', 'refused', () => get(r('bob', 'popular/in/alice')));
  await check('an admin cannot read your list either', 'refused', () => get(r('admin', 'popular/in/alice')));
  await check('nobody can write somebody else’s list', 'refused', () => set(r('bob', 'popular/in/alice'), list));
  await check('anybody signed in can read the totals', 'ok', () => get(r('bob', 'popular/totals')));
  await check('a stranger cannot', 'refused', () => get(r(null, 'popular/totals')));
  await check('no person can write the totals', 'refused', () => set(r('alice', 'popular/totals'), { people: 99 }));
  await check('not even an admin', 'refused', () => set(r('admin', 'popular/totals'), { people: 99 }));

  /* SHARING, AS A SEQUENCE. */
  await check('you can publish your shelf view', 'ok', () => set(r('alice', 'view/alice'), { name: 'Alice', bottles: [] }));
  await check('a buddy cannot read it before a share', 'refused', () => get(r('bob', 'view/alice')));
  await check('you can grant a share', 'ok', () => set(r('alice', 'shares/alice/bob'), { at: at() }));
  await check('now the buddy can read it', 'ok', () => get(r('bob', 'view/alice')));
  await check('somebody else still cannot', 'refused', () => get(r('carol', 'view/alice')));
  await check('the buddy cannot grant a share on your behalf', 'refused', () => set(r('bob', 'shares/alice/carol'), { at: at() }));
  await check('you can revoke it', 'ok', () => remove(r('alice', 'shares/alice/bob')));
  await check('and then the buddy cannot read it', 'refused', () => get(r('bob', 'view/alice')));

  /* ASKING TO SHARE. */
  await check('you can ask somebody', 'ok', () => set(r('bob', 'requests/alice/bob'), { from: 'bob', name: 'Bob', at: at() }));
  await check('you cannot ask in somebody else’s name', 'refused', () => set(r('bob', 'requests/alice/carol'), { from: 'carol', name: 'Carol', at: at() }));
  await check('the person asked can read it', 'ok', () => get(r('alice', 'requests/alice')));
  await check('nobody else can', 'refused', () => get(r('carol', 'requests/alice')));

  /* THE DIRECTORY. */
  await check('you can list yourself', 'ok', () => set(r('alice', 'directory/alice'), { uid: 'alice', name: 'Alice', key: 'alice' }));
  await check('not as somebody else', 'refused', () => set(r('bob', 'directory/bob'), { uid: 'alice', name: 'Bob', key: 'bob' }));
  await check('with nothing extra', 'refused', () => set(r('bob', 'directory/bob'), { uid: 'bob', name: 'Bob', key: 'bob', email: 'x' }));

  /* TASTINGS. */
  const tasting = { flight: 'Islay night', at: '2026-09-16', who: { alice: true }, pours: [{ k: 'ardbeg_ten' }] };
  await check('you can record a tasting you hosted', 'ok', () => set(r('alice', 'tastings/alice/t1'), tasting));
  await check('somebody without a share cannot read it', 'refused', () => get(r('carol', 'tastings/alice')));
  await check('nobody else can write your tastings', 'refused', () => set(r('bob', 'tastings/alice/t2'), tasting));

  /* THE REST. */
  await check('you can mark your own account wiped', 'ok', () => set(r('alice', 'wiped/alice'), at()));
  await check('nobody else can', 'refused', () => set(r('bob', 'wiped/alice'), at()));
  await check('you can write your own diagnostics', 'ok', () => set(r('alice', 'diagnostics/alice'), { at: at() }));
  await check('an admin can read them', 'ok', () => get(r('admin', 'diagnostics/alice')));
  await check('nobody else can', 'refused', () => get(r('bob', 'diagnostics/alice')));
  await check('nobody can make themselves an admin', 'refused', () => set(r('alice', 'admins/alice'), true));
  await check('a person cannot write the shared barcodes', 'refused', () => set(r('alice', 'upc/012345678905'), { name: 'Ardbeg Ten', at: at() }));
  await check('an admin can', 'ok', () => set(r('admin', 'upc/012345678905'), { name: 'Ardbeg Ten', at: at() }));

  return results;
}

/* RULES BROKEN ON PURPOSE, and the check that must catch each. */
function mutants() {
  const base = () => JSON.parse(RULES);
  const w = d => d.rules['bz-apps'].whisky;
  const out = [];
  let d = base();
  w(d).shared.catalog.products.$key['.write'] = 'auth != null';
  out.push(['anybody may create a library entry', d, 'a signed-in person cannot create a library entry']);
  d = base();
  w(d).popular.in.$uid['.read'] = "auth != null && ($uid === auth.uid || root.child('bz-apps/whisky/admins').child(auth.uid).exists())";
  out.push(['an admin may read a popular list', d, 'an admin cannot read your list either']);
  d = base();
  delete w(d).stats.$uid.suspended;
  out.push(['a person may lift their own suspension', d, 'you cannot lift your own suspension']);
  d = base();
  delete w(d).contrib.$uid.$slug.vetted;
  out.push(['an offer may carry its own verdict', d, 'an offer cannot carry its own verdict']);
  return out;
}

(async () => {
  let failed = 0;
  const env = await initializeTestEnvironment({
    projectId: PROJECT, database: { rules: RULES, host: '127.0.0.1', port: 9000 } });
  const res = await suite(env);
  await env.cleanup();
  res.forEach(x => {
    if (x.ok) return;
    failed++;
    console.log('  ✖ ' + x.name + '\n      ' + x.why);
  });
  if (!failed) console.log('  ✓ the rules do what they say: ' + res.length + ' checks as a stranger, a person, somebody else and an admin');

  /* PROVEN ABLE TO FAIL. */
  const ms = mutants();
  for (let i = 0; i < ms.length; i++) {
    const [what, rules, mustFail] = ms[i];
    const menv = await initializeTestEnvironment({
      projectId: PROJECT + '-mutant' + i,
      database: { rules: JSON.stringify(rules), host: '127.0.0.1', port: 9000 } });
    const mres = await suite(menv);
    await menv.cleanup();
    const hit = mres.filter(x => x.name === mustFail)[0];
    if (!hit) { failed++; console.log('  ✖ self-test: no check named "' + mustFail + '"'); }
    else if (hit.ok) { failed++; console.log('  ✖ self-test: rules where ' + what + ' passed "' + mustFail + '"'); }
  }
  if (!failed) console.log('  ✓ and it catches rules broken on purpose (' + ms.length + ' of ' + ms.length + ')');

  /* AND SYNC, against the same emulator with the real SDK (syncemu.js). */
  failed += await require('./syncemu.js')();
  console.log(failed ? '✖ ' + failed + ' rules check(s) failed' : '✓ all rules checks pass');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('  ✖ rules: ' + ((e && e.stack) || e)); process.exit(1); });
