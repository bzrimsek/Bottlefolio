/* One fact, every screen that draws it.
 *
 *   node render.js [index.html]
 *
 * The render half of this file is 8,913 lines with ZERO assertions against
 * it. killer-bs-test.js covers the logic; browser.js proves the screens
 * draw. Neither asks the question that rule 30a is about: when the same
 * fact is rendered by more than one path, do the paths AGREE?
 *
 * They are not compared to a hand-written expectation — that is just a
 * third copy of the same rule, and it rots. Each is compared to the shared
 * engine in L, and to each other. Two separately-correct formatters can
 * still disagree; that is exactly how the Nassau popup drifted from the
 * banner in MadGolf, and it is the fault this file has no other guard for.
 *
 * The app runs unmodified against BZ's real shelf. Firebase never loads,
 * because none of this needs it.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const file = path.resolve(process.argv[2] || 'index.html');
const dir = path.dirname(file);
const failures = [];

function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) failures.push(name + '\n      got  ' + g + '\n      want ' + w);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on('pageerror', e => failures.push('threw: ' + e.message));

  await page.route('http://app.local/**', route => {
    const name = route.request().url().split('app.local/')[1].split('?')[0]
      || path.basename(file);
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
    const type = name.endsWith('.json') ? 'application/json'
      : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.png') ? 'image/png' : 'text/html';
    return route.fulfill({ status: 200, contentType: type,
                           body: fs.readFileSync(p) });
  });

  await page.goto('http://app.local/' + path.basename(file));
  await page.waitForTimeout(1200);

  // BZ's real shelf and his real flights, because a fixture of three
  // bottles cannot disagree with itself.
  await page.evaluate(([b, f]) => {
    /* global S, save_, rebuildCatalog, renderShelf, renderShelfFilters,
              renderHome, renderFlights, renderPayline */
    S.bottles = b;
    S.customFlights = f;
    S.filters.status = 'all';
    // The shelf opens on the type tiles, which are a way IN rather than a
    // list; there is nothing to compare until it is listing.
    S.shelfSub = 'all';
    save_(); rebuildCatalog();
    renderShelf(); renderShelfFilters(); renderHome();
    renderFlights(); renderPayline();
  }, [JSON.parse(fs.readFileSync(path.join(dir, 'bz-bottles.json'), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(dir, 'bz-flights.json'), 'utf8'))]);
  await page.waitForTimeout(500);

  /* 1. THE SHELF ROW against the engine.
     Every row on screen, read back and checked against L for the same
     product: the name it shows, the proof, and how many you own. If a row
     ever renders a count the engine does not agree with, the shelf is
     lying about the shelf. */
  {
    const rows = await page.evaluate(() => {
      /* global L, prod */
      const out = [];
      document.querySelectorAll('#shelfList .item').forEach(r => {
        const nm = r.querySelector('.nm');
        const cells = [...r.querySelectorAll('.pf')].map(x => x.textContent.trim());
        if (!nm) return;
        const name = nm.textContent.trim();
        const key = Object.keys(S.catalog).filter(k =>
          (S.catalog[k].name || '') === name)[0];
        if (!key) { out.push({ name: name, unknown: true }); return; }
        const p = S.catalog[key];
        out.push({
          name: name,
          shownProof: cells[0],
          enginePro: String(p.proof || '\u2014'),
          // The Have cell reads "2 · 1s" — two bottles, one of them sealed.
          // The count is the leading number; the rest is the sealed tail.
          shownHave: (/^\d+/.exec(cells[2] || '') || [''])[0],
          engineHave: String(L.ownedCounts(S.bottles)[key] || 0)
        });
      });
      return out;
    });
    check('every shelf row names a whisky the catalog knows',
      rows.filter(r => r.unknown).map(r => r.name), []);
    check('every row shows the proof the engine holds',
      rows.filter(r => r.shownProof !== r.enginePro)
        .map(r => r.name + ': ' + r.shownProof + ' vs ' + r.enginePro), []);
    check('and the count the engine holds',
      rows.filter(r => r.shownHave !== r.engineHave)
        .map(r => r.name + ': ' + r.shownHave + ' vs ' + r.engineHave), []);
    if (rows.length < 100) failures.push('only ' + rows.length + ' rows drew');
  }

  /* 2. THE SHELF ROW against THE BOTTLE SCREEN.
     Two render paths, one whisky. The row says a proof and a count; the
     bottle screen says a proof and lists the bottles. This is the pairing
     rule 30a describes, and nothing in this repo has ever checked it. */
  {
    const disagree = await page.evaluate(async () => {
      const out = [];
      const rows = [...document.querySelectorAll('#shelfList .item')].slice(0, 25);
      for (const r of rows) {
        const nm = r.querySelector('.nm');
        const cells = [...r.querySelectorAll('.pf')].map(x => x.textContent.trim());
        const rowName = nm.textContent.trim();
        const rowProof = cells[0];
        const rowHave = (/^\d+/.exec(cells[2] || '') || [''])[0];
        r.click();
        await new Promise(res => setTimeout(res, 30));
        const head = document.querySelector('#scr-detail h2');
        const body = document.getElementById('detailBody');
        if (!head || !body) { out.push({ name: rowName, why: 'no bottle screen' }); continue; }
        const text = body.innerText || '';
        const proofLine = /Proof\s*\n?\s*([\d.]+)/.exec(text);
        // "B346 · Open" lines, one per bottle you hold.
        const bottleLines = (text.match(/\bB\d{3,}\s*\u00b7/g) || []).length;
        if (head.textContent.trim() !== rowName) {
          out.push({ name: rowName, why: 'screen says ' + head.textContent.trim() });
        }
        if (proofLine && rowProof !== '\u2014' && proofLine[1] !== rowProof) {
          out.push({ name: rowName,
                     why: 'proof ' + rowProof + ' on the row, ' + proofLine[1] + ' on the screen' });
        }
        if (bottleLines && String(bottleLines) !== rowHave) {
          out.push({ name: rowName,
                     why: 'have ' + rowHave + ' on the row, ' + bottleLines + ' listed on the screen' });
        }
        history.back();
        await new Promise(res => setTimeout(res, 30));
      }
      return out;
    });
    check('the shelf row and the bottle screen agree', disagree, []);
  }

  /* 3. THE HOME TILES against the engine.
     Six numbers, each of which is a claim about the shelf. They are
     computed inside renderHome, which is where rule 30 says they should
     not be — so this is the guard until they are extracted. */
  {
    const tiles = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#homeBody > .tiles > .tile')]
        .map(x => ({ v: x.querySelector('.v').textContent.trim(),
                     l: x.querySelector('.l').textContent.trim() }));
      const counts = L.ownedCounts(S.bottles);
      return {
        tiles: t,
        engine: {
          bottles: String(S.bottles.filter(L.isOwned).length),
          open: String(S.bottles.filter(L.isOpen).length),
          products: String(Object.keys(S.catalog)
            .filter(k => counts[k]).length),
          flights: String(allFlights().length)
        }
      };
    });
    /* THE TILES ARE GONE, so what is checked is that they stay gone.
       BZ: these are vanity stats really - open and pourable are the same
       and ready to pour should equal open. Two of them printed the SAME
       number for two different questions and one counted flights, so it
       could never equal open. Four already live on the shelf header,
       where the engine formats them once.

       Kept as a check rather than deleted: a tile row quietly returning
       would bring the disagreement back with it. */
    check('home draws no tile row', String(tiles.tiles.length), '0');
    /* "Flights designed" was removed from the tiles: BZ called it a
       meaningless number and he was right — 36 of the 38 were designed by
       the app, so it was the shelf counting its own output. "Ready to pour
       tonight" is the one that says something. */
  }

  /* 4. THE FLIGHT LADDER against the flight.
     The ladder draws one row per pour, in the flight's own order, with the
     proof each pour carries. A cast that renders short is the fault BZ hit
     when pour 5 vanished — and the ladder showed it happily. */
  {
    const bad = await page.evaluate(async () => {
      const out = [];
      const cards = [...document.querySelectorAll('#scr-flights .fcard')].slice(0, 8);
      for (const c of cards) {
        c.click();
        await new Promise(res => setTimeout(res, 40));
        const title = (document.querySelector('#scr-detail h2') || {}).textContent;
        const f = allFlights().filter(x =>
          L.sentenceCase(x.title) === (title || '').trim()
          || x.title === (title || '').trim())[0];
        const drawn = document.querySelectorAll('#detailBody .ladder .lrow').length
          || document.querySelectorAll('#detailBody .lrow').length;
        if (f && drawn && drawn !== (f.core || []).length) {
          out.push({ flight: f.title, drawn: drawn, cast: (f.core || []).length });
        }
        history.back();
        await new Promise(res => setTimeout(res, 40));
      }
      return out;
    });
    check('every flight draws one row per pour in its cast', bad, []);
  }

  await browser.close();

  if (failures.length) {
    failures.forEach(f => console.log('  \u2717 ' + f));
    console.log('\n  \u2716 ' + failures.length + ' render disagreement(s)\n');
    process.exit(1);
  }
  console.log('  \u2713 the screens agree with the engine and with each other');
})();
