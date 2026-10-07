/* APPLYING A CHANGE TO THE ACCOUNT FROM OFF-DEVICE.
 *
 * BZ keeps the flights in a spreadsheet and hands over the file (2026-10-06:
 * "the upload is the master", and "since I started the flights with another
 * thread in excel, i'm gonna keep it there for now and feed you updates").
 * Applying that by hand took four goes in one evening and got the same thing
 * wrong three times, so it is a door now rather than a script written afresh
 * each time.
 *
 *   node remote.js plan.json            say what would change, write nothing
 *   node remote.js plan.json --apply    do it
 *
 * THE PLAN IS DATA, and names what to set rather than how:
 *
 *   { "pours":  [{ "flight": "ONE BARREL OR MANY?", "at": 2,
 *                  "to": "Four Roses Single Barrel Barrel Strength OBSV" }],
 *     "exits":  [{ "id": "B010", "exit": "adjusted" }],
 *     "blends": [{ "flight": "WHO'S YOUR DADDY?", "at": 2,
 *                  "parts": ["W.L. Weller 12 ...", "Weller Antique 107 ..."] }] }
 *
 * WHAT IT REFUSES, because every one of these was a real mistake:
 *
 *  - a pour pointed at a bottle that is not OPEN on the shelf. A pour naming
 *    nothing is worse than the one it replaces.
 *  - a pour pointed at a bottle the same flight ALREADY pours. "One Barrel or
 *    Many?" sets a single barrel beside a small batch on purpose, and a join
 *    collapsed the two - the flight's whole premise - because nothing asked.
 *  - a flight the account does not hold, or an `at` outside its pours.
 *  - an exit reason that is not one of L.EXITS.
 *
 * AND IT CLAIMS THE REPLACEMENT. A write made off-device IS a replacement
 * made on another device, which is what L.resetSide exists for; without
 * `resets` the next load merges it as a stale copy and the device wins.
 * Three writes were lost that way before this was understood.
 *
 * It snapshots first, writes once, and reads back, because a write that is
 * not verified is a claim.
 */
const fs = require('fs');
const path = require('path');
const { token, DB } = require('./rules.js');
const { L } = require('./engine.js')();

const UID = process.env.BF_UID || 'cv2EMNKszFehDrNP1yf8O9e1siP2';
const file = process.argv[2];
const apply = process.argv.indexOf('--apply') > 0;

const say = (ok, line) => console.log('  ' + (ok ? '✓' : '✗') + ' ' + line);

if (!file) {
  console.log('  usage: node remote.js <plan.json> [--apply]');
  process.exitCode = 1;
  return;
}

(async () => {
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t = await token();
  const get = async p => (await fetch(DB + '/bz-apps/whisky/' + UID + p + '.json',
    { headers: { Authorization: 'Bearer ' + t } })).json();

  const flights = (await get('/customFlights')) || {};
  const shelf = (await get('/bottles')) || {};

  /* THE SHELF AS THE APP READS IT: a bottle can be poured when it is open. */
  const open = {};
  Object.keys(shelf).forEach(i => {
    const b = shelf[i];
    if (b && b.k && b.status === 'open') open[b.k] = 1;
  });
  const byTitle = {};
  Object.keys(flights).forEach(i => {
    const f = flights[i];
    if (f && f.title) byTitle[L.shopNorm(f.title)] = { at: i, f: f };
  });

  const faults = [];
  const writes = {};
  const lines = [];

  const flightAt = name => {
    const hit = byTitle[L.shopNorm(String(name || ''))];
    if (!hit) faults.push('no flight called ' + name);
    return hit || null;
  };

  (plan.pours || []).forEach(p => {
    const hit = flightAt(p.flight);
    if (!hit) return;
    const core = hit.f.core || [];
    if (!core[p.at]) { faults.push(p.flight + ' has no pour ' + p.at); return; }
    if (!open[p.to]) { faults.push('not open on the shelf: ' + p.to); return; }
    /* TWO POURS OF ONE FLIGHT ARE TWO WHISKIES BY THE FLIGHT'S OWN SAY-SO. */
    if (core.some((q, i) => i !== p.at && q && q.k === p.to)) {
      faults.push(hit.f.title + ' already pours ' + p.to
        + ' - two pours of one flight are two whiskies');
      return;
    }
    writes['customFlights/' + hit.at + '/core/' + p.at + '/k'] = p.to;
    lines.push(hit.f.title + '  [' + p.at + ']  '
      + ((core[p.at] || {}).k || (core[p.at] || {}).name || '(empty)')
      + '\n        -> ' + p.to);
  });

  (plan.blends || []).forEach(b => {
    const hit = flightAt(b.flight);
    if (!hit) return;
    const core = hit.f.core || [];
    if (!core[b.at]) { faults.push(b.flight + ' has no pour ' + b.at); return; }
    const missing = (b.parts || []).filter(k => !open[k]);
    if (missing.length) {
      faults.push('blend part not open: ' + missing.join(', '));
      return;
    }
    /* THE PARTS ONLY, where the pour is already a blend: his own note for it
       is worth more than anything this would write over it. */
    if ((core[b.at] || {}).kind === 'blend') {
      (b.parts || []).forEach((k, i) => {
        writes['customFlights/' + hit.at + '/core/' + b.at + '/parts/' + i] = k;
      });
    } else {
      writes['customFlights/' + hit.at + '/core/' + b.at] = {
        kind: 'blend', name: b.name || (core[b.at] || {}).name || 'Blend',
        parts: b.parts, ratio: b.ratio || b.parts.map(() => 1)
      };
    }
    lines.push(hit.f.title + '  [' + b.at + ']  blend: ' + b.parts.join('  +  '));
  });

  (plan.exits || []).forEach(e => {
    const at = Object.keys(shelf).filter(i => shelf[i] && shelf[i].id === e.id);
    if (!at.length) { faults.push('no bottle with id ' + e.id); return; }
    if (L.EXITS.indexOf(e.exit) < 0) {
      faults.push('not a reason a bottle leaves: ' + e.exit);
      return;
    }
    at.forEach(i => {
      writes['bottles/' + i + '/exit'] = e.exit;
      lines.push(shelf[i].k + '  ' + (shelf[i].exit || '?') + ' -> ' + e.exit);
    });
  });

  console.log('\n' + lines.length + ' change(s):\n');
  lines.forEach(l => console.log('   ' + l));
  if (faults.length) {
    console.log('');
    faults.forEach(f => say(false, f));
    console.log('\n  ✖ REFUSED: nothing written.');
    process.exitCode = 1;
    return;
  }
  if (!lines.length) { console.log('\n  nothing to do.'); return; }
  if (!apply) {
    console.log('\n  a dry run writes nothing. Add --apply to send it.');
    return;
  }

  /* THE SNAPSHOT, BEFORE ANYTHING MOVES. */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  /* OUTSIDE THE REPO. This is his whole shelf, and the folder it would
     otherwise land in is a public repository and a website. It goes where
     shelf.key and the admin key go, which is outside OneDrive too. */
  const vault = path.join(process.env.USERPROFILE || process.env.HOME || '.',
    '.bottlefolio', 'remote-snapshots');
  fs.mkdirSync(vault, { recursive: true });
  const keep = path.join(vault, 'remote-' + stamp + '.json');
  fs.writeFileSync(keep, JSON.stringify(
    { customFlights: flights, bottles: shelf }, null, 1));
  console.log('\n  snapshot: ' + keep);

  /* AND THE CLAIM, so a device takes these keys whole rather than merging
     them as somebody else's stale copy (L.resetSide). */
  const now = Date.now();
  const touched = {};
  Object.keys(writes).forEach(p => { touched[p.split('/')[0]] = 1; });
  writes.resets = {};
  Object.keys(touched).forEach(k => { writes.resets[k] = now; });
  writes.updated = now;

  const r = await fetch(DB + '/bz-apps/whisky/' + UID + '.json',
    { method: 'PATCH',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify(writes) });
  if (!r.ok) {
    console.log('  ✖ HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    process.exitCode = 1;
    return;
  }

  /* READ IT BACK. */
  const f2 = (await get('/customFlights')) || {};
  const b2 = (await get('/bottles')) || {};
  let ok = 0, bad = 0;
  Object.keys(writes).forEach(p => {
    if (p === 'resets' || p === 'updated') return;
    const parts = p.split('/');
    let v = parts[0] === 'bottles' ? b2 : f2;
    parts.slice(1).forEach(seg => { v = v === undefined ? v : v[seg]; });
    const want = writes[p];
    const same = typeof want === 'object'
      ? JSON.stringify(v) === JSON.stringify(want) : v === want;
    if (same) ok++; else { bad++; say(false, p + ' did not take'); }
  });
  say(bad === 0, ok + ' of ' + (ok + bad) + ' confirmed on the account');
  say(true, 'claimed: ' + Object.keys(touched).join(', '));
  console.log('\n  Reload Bottlefolio; a device that has pushed takes these.');
  if (bad) process.exitCode = 1;
})().catch(e => { console.log('  ✖ ' + e.message); process.exitCode = 1; });
