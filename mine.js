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

const { bottles, custom } = eng.shelf(dir);
const base = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'))
  .catalog || {};
const cat = L.mergeCatalog(base, {}, custom || {}, {});
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

console.log('\n  a report, not a check - nothing here stops a build.');
