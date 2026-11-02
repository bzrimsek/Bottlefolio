/* WHAT IS WRONG WITH BZ'S OWN SHELF.
 *
 *   node mine.js            everything
 *   node mine.js --faults   only the rows that contradict themselves
 *
 * WHY. Every other check in this project grades the CODE. This one grades the
 * DATA, which nothing did - and on 2026-10-03 reading the screens turned up
 * three faults that were his shelf rather than the app:
 *
 *   Pinnacle Whipped, a whipped-cream vodka, filed as whiskey at 70 proof -
 *   which the law says cannot be a whiskey, so the row contradicts itself.
 *   Seven bottles with no category at all, every one of them bar stock.
 *   A custom entry carrying no key, which made a Woodford he owns invisible
 *   to the taste profile, the fingerprint and every recommendation.
 *
 * All three were already findable: L.rowFaults and L.libraryAudit have said
 * these things about the shared library for weeks. Nobody had ever pointed them
 * at his own shelf.
 *
 * IT REPORTS AND NEVER FAILS A BUILD. His shelf is his, not a build artifact,
 * and a check that stops a release because a bottle is missing its tasting
 * notes is a check somebody switches off. It exits 0 whatever it finds.
 */
const fs = require('fs'), path = require('path');
const eng = require('./engine.js');
const L = eng().L;
const dir = __dirname;
const only = process.argv.indexOf('--faults') >= 0;

/* THROUGH THE ONE CATALOGUE DOOR (2026-11-02). This built the catalogue
   itself out of data.json and his custom products, which left the shared
   library out - 53 of his 356 owned bottlings had no entry at all, and this
   is the check whose whole job is to say which of his rows are wrong. */
const shelf = eng.shelf(dir);
const bottles = shelf.bottles;
const cat = eng.catalogFor(shelf, dir);
const owned = L.ownedCounts(bottles);
const mine = Object.keys(owned).map(k => cat[k]).filter(Boolean);

const head = t => console.log('\n' + t + '\n' + '-'.repeat(t.length));
const none = () => console.log('  nothing');

console.log('Bottlefolio - what is wrong with this shelf');
console.log('  ' + bottles.filter(L.isOwned).length + ' owned bottles, '
  + mine.length + ' bottlings, '
  + L.ownedWhiskies(cat, bottles).length + ' whiskies');

/* 1. ROWS THAT CONTRADICT THEMSELVES. L.rowFaults is the door: a fact in the
   wrong field, a grain bill on something not made from grain, a bonded bottle
   at the wrong proof, a strength outside what a whiskey can be bottled at. */
head('Rows that contradict themselves');
let faulty = 0;
mine.forEach(p => {
  const f = L.rowFaults(p);
  if (!f.length) return;
  faulty++;
  console.log('  ' + p.name);
  f.forEach(x => console.log('      ' + x.say));
});
if (!faulty) none();

/* 2. WHAT THE SHELF CANNOT SHOW. A bottle whose key has no catalogue entry is
   on the shelf in the data and nowhere on the page - no card, no total,
   nothing to pour, edit or search. L.unlistedBottles is that door. */
head('Bottles the shelf cannot show you');
const unlisted = L.unlistedBottles(cat, bottles);
if (unlisted.length) {
  unlisted.slice(0, 20).forEach(b => console.log('  ' + (b.k || '(no key)')));
  if (unlisted.length > 20) console.log('  ... and ' + (unlisted.length - 20) + ' more');
} else none();

/* 3. BOTTLES THE APP CANNOT CLASSIFY. A blank category is not an error - a
   bottle added a minute ago has none yet, and it must stay blank so a lookup
   can fill it in - but on a settled shelf it is usually bar stock nobody got
   round to filing, and every one of them counts as whisky until it is filed
   (L.isWhisky answers by elimination, on purpose). */
if (!only) {
  head('No category set');
  const blank = mine.filter(p => !p.sub);
  if (blank.length) {
    blank.forEach(p => console.log('  ' + p.name));
    console.log('  — these count as whisky in every analysis until they '
      + 'are filed, because a blank category is read as "not one of the '
      + 'other spirits"');
  } else none();
}

/* 4. WHAT IS THIN. L.libraryGaps says what an entry is short of, and these are
   the facts every bottle has rather than the ones only some do. */
if (!only) {
  head('Thin entries');
  const gaps = {};
  mine.forEach(p => (L.libraryGaps(p) || []).forEach(g => {
    (gaps[g] = gaps[g] || []).push(p.name);
  }));
  const kinds = Object.keys(gaps).sort((a, b) => gaps[b].length - gaps[a].length);
  if (kinds.length) {
    kinds.forEach(g => {
      console.log('  ' + String(gaps[g].length).padStart(4) + '  missing ' + g);
      gaps[g].slice(0, 3).forEach(n => console.log('          ' + n));
      if (gaps[g].length > 3) console.log('          ...');
    });
  } else none();
}

/* 5. AND WHAT THE AUDIT MAKES OF IT, which is the same reading the library gets
   - two names for one whisky, one house spelled two ways, a proof that is also
   in the name. It is given the brand registry, because a pair claim without one
   is a claim against data nobody has read (2026-10-02). */
if (!only) {
  head('What the audit says about it');
  const brands = {};
  mine.forEach(p => {
    const g = p.dist && L.houseKey ? L.houseKey(p.dist) : null;
    if (g) brands[g] = { name: p.dist };
  });
  const found = L.libraryAudit(L.ownedCatalog(cat, bottles), {}, Date.now(), brands);
  if (found.length) {
    found.forEach(f => {
      console.log('  ' + f.n + '  ' + f.title);
      (f.items || []).slice(0, 3).forEach(i =>
        console.log('        ' + String(i.text || '').slice(0, 90)));
      if ((f.items || []).length > 3) console.log('        ...');
    });
  } else none();
}

/* 7. ONE DISPLAY NAME, TWO CATALOGUE ENTRIES. Found on 2026-11-02, the day
   the harnesses first loaded the shared library: data.json ships "Angel's
   Envy Bourbon Madeira Cask Finish" whose name was later corrected to the
   library's longer one, so the catalogue carries that display name twice -
   once under the old key with nothing owned, once under the new key with his
   bottle. The app then offers him a bottle he already has, and a check that
   resolves a row by its name reads whichever copy comes first.
   WHY NOT JUST RENAME THE KEY: one account holds a bottle under one of the
   two old keys, and renaming the entry out from under it would make an owned
   bottle invisible, which is the one thing that may never happen. The repair
   is a forwarding address - a grave from the old key to the new name, which
   an admin writes - so this names the keys rather than guessing. */
head('One display name, two catalogue entries');
{
  const byName = {};
  Object.keys(cat).forEach(k => {
    const n = ((cat[k] || {}).name || '').trim();
    if (n) (byName[n] = byName[n] || []).push(k);
  });
  const twice = Object.keys(byName).filter(n => byName[n].length > 1);
  if (twice.length) {
    twice.forEach(n => {
      console.log('  ' + n);
      byName[n].forEach(k => console.log('      filed under "' + k + '"'
        + '   you own ' + (owned[k] || 0)));
    });
    console.log('  \u2014 the repair is a forwarding address from the old '
      + 'key to the new name, written by an admin; renaming the entry '
      + 'instead would orphan anybody holding a bottle under the old key');
  } else none();
}

/* 8. TWO BOTTLES OF ONE WHISKY BOTH OPEN. BZ's stocking rule, and it lived in
   killer-bs-test as a build-failing assertion until 2026-11-02 - where it went
   red because he opened a second Woodford, which is a gate anybody would turn
   off. It is about his data, so it reports here and stops nothing. */
head('Two bottles of one whisky, both open');
{
  const byKey = {};
  bottles.forEach(b => { if (b && b.k) (byKey[b.k] = byKey[b.k] || []).push(b); });
  const twoOpen = Object.keys(byKey)
    .filter(k => byKey[k].filter(b => b.status === 'open').length > 1);
  if (twoOpen.length) {
    twoOpen.forEach(k => console.log('  ' + k + '   '
      + byKey[k].filter(b => b.status === 'open').length + ' open'));
    console.log('  \u2014 close one, or the pour picker offers you the same '
      + 'whisky twice');
  } else none();

  /* AND A FINISHED BOTTLE WHOSE ENTRY HAS GONE. Not inventory nobody can see -
     he has drunk it - but the row still carries the key, and two of his name a
     library key rather than a display name, which is the thing to watch: that
     is how a bottle gets added today and it would be invisible if it were
     still open. */
  head('Finished bottles whose entry has gone');
  const lost = bottles.filter(b => b && b.k && !L.isOwned(b) && !cat[b.k]);
  if (lost.length) {
    lost.forEach(b => console.log('  ' + b.id + '  ' + b.status
      + '   "' + b.k + '"'));
    console.log('  \u2014 nothing is hidden by these, but a key shaped like '
      + 'a library slug on an OPEN row would be');
  } else none();
}

/* 9. HIS BOTTLES WITH NO PIN ON THE MAP. Found on 2026-11-02 when the
   harnesses first loaded the shared library and the map counts FELL while his
   shelf grew: map.json pins a distillery by the name data.json used, and the
   library names the distillery that actually MADE the whiskey, so Spot,
   Powers and Redbreast became Midleton and Angel's Envy became Louisville
   Distilling.

   WHAT IS LEFT AFTER L.geoFor. 47 of the 78 were a code fault and the door
   fixed them the same day by reading the house key and then the brand; this
   asks the door, so what it lists now is a house map.json has never held a
   point for under any name. Asking the raw table instead would keep naming
   houses the app places perfectly well, which is how a report earns being
   ignored.

   ONLY WHERE THERE IS A LAYER TO BE ON. The app draws Scotland, the United
   States and Ireland; a Japanese or Caribbean bottle is absent from those
   three by design, and listing Bacardi as unplaced is noise. A blend whose
   "distillery" is a blender with no single place (Johnnie Walker, Dewar's,
   Diageo) has no pin on purpose and is listed, because the difference
   between that and a gap is worth seeing. */
if (!only) {
  head('Owned bottlings with no pin on the map');
  const map = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'));
  const LAYERS = [['scotch', 'distilleries'], ['irish', 'ieDistilleries']]
    .concat(L.US_SUBS.map(s => [s, 'usDistilleries']));
  const layerOf = {};
  LAYERS.forEach(([sub, table]) => { layerOf[sub] = table; });
  const geo = {};
  Object.keys(map).forEach(t => {
    if (map[t] && typeof map[t] === 'object' && !Array.isArray(map[t])) {
      geo[t] = L.geoIndex(map[t]);
    }
  });
  /* BY HOUSE, THE WAY THE MAP ASKS IT. L.mapPins places a house and then
     puts all of its bottlings on that one pin, so a brandless Redbreast PX
     rides Midleton's point even though the bottling alone answers nothing.
     Asking per bottling listed three rows the map draws perfectly well. */
  const mine = {};
  Object.keys(owned).forEach(k => {
    const p = cat[k];
    if (!p || !p.dist) return;
    const table = layerOf[p.sub];
    if (!table) return;                 // no layer draws this category
    const id = table + ' ' + L.houseKey(p.dist);
    const h = mine[id] = mine[id] || { placed: false, rows: [] };
    if (L.geoFor(p, geo[table])) h.placed = true;
    h.rows.push(p);
  });
  const byDist = {};
  Object.values(mine).forEach(h => {
    if (h.placed) return;
    h.rows.forEach(p => {
      const row = byDist[p.dist] = byDist[p.dist] || { n: 0, bottles: 0 };
      row.n++;
      row.bottles += owned[p.k];
    });
  });
  const names = Object.keys(byDist)
    .sort((a, b) => byDist[b].bottles - byDist[a].bottles);
  if (names.length) {
    names.forEach(d => console.log('  ' + d.slice(0, 40).padEnd(42)
      + byDist[d].n + ' bottling(s), ' + byDist[d].bottles + ' bottle(s)'));
    console.log('  \u2014 ' + names.reduce((n, d) => n + byDist[d].n, 0)
      + ' bottlings over ' + names.length + ' distilleries, on the three '
      + 'maps the app draws. The repair is a pin in map.json for each one '
      + 'that has a place');
  } else none();
}

console.log('\n  a report, not a check - nothing here stops a build.');
