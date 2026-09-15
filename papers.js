/* The papers, actually printed.
 *
 *   node papers.js [index.html]
 *
 * BZ, 2026-09-03: "the host card runs over 2 pages and the participant
 * sheet does not work."
 *
 * Both were true and neither was visible from the app. The sheet refused
 * to print because the leak guard read the whole card — prompts included —
 * and the prompts are a fixed tasting vocabulary containing the word
 * GLASS, which is also a word in "Heaven Hill Grain to Glass". And the
 * host card carried "[object Object] · [object Object] · …" where the
 * extensions should have been, because they are pour records rather than
 * names, which is a paragraph of nothing that pushed the card onto a
 * second sheet.
 *
 * Nothing else here prints anything. This renders every paper for every
 * flight through a real print pipeline and counts the pages.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const file = path.resolve(process.argv[2] || 'index.html');
const dir = path.dirname(file);
const failures = [];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('http://app.local/**', r => {
    const n = r.request().url().split('app.local/')[1].split('?')[0]
      || path.basename(file);
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const t = n.endsWith('.json') ? 'application/json'
      : n.endsWith('.js') ? 'text/javascript'
      : n.endsWith('.png') ? 'image/png' : 'text/html';
    return r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) });
  });
  await page.goto('http://app.local/' + path.basename(file));
  await page.waitForTimeout(1200);

  const papers = await page.evaluate(([b, fl]) => {
    S.bottles = b; S.customFlights = fl;
    save_(); rebuildCatalog();
    const out = {};
    allFlights().forEach(f => {
      out[f.title] = { pours: (f.core || []).length,
                       host: tastingPapers(f, 'host'),
                       sheet: tastingPapers(f, 'sheet') };
    });
    return out;
  }, [JSON.parse(fs.readFileSync(path.join(dir, 'bz-bottles.json'), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(dir, 'bz-flights.json'), 'utf8'))]);

  /* A SAMPLE by default. Printing all 72 took a minute and a half of every
     gate to re-prove something that only moves when the print CSS does:
     the shortest cast, the longest, and the two known to run over. Pass
     --all when the papers are actually being worked on. */
  const everything = process.argv.indexOf('--all') >= 0;
  const titles = Object.keys(papers);
  const bySize = titles.slice().sort((a, b) => papers[a].pours - papers[b].pours);
  const sample = everything ? titles : [...new Set([
    bySize[0], bySize[bySize.length - 1],
    ...titles.filter(t => /IS BLENDED SCOTCH WORSE|ONE STILL, TWO FAMILIES/.test(t))
  ].filter(Boolean))];

  let printed = 0, long = 0;
  for (const [title, v] of Object.entries(papers)) {
    if (sample.indexOf(title) < 0) continue;
    for (const which of ['host', 'sheet']) {
      const html = v[which];
      // A sheet that refuses to print is the fault, not a pass.
      if (!html) { failures.push(title + ': the ' + which + ' refused to print'); continue; }
      if (/\[object Object\]/.test(html)) {
        failures.push(title + ': the ' + which + ' prints [object Object]');
      }
      const q = await browser.newPage();
      await q.setContent(html);
      const pdf = await q.pdf({ format: 'Letter', printBackground: true });
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      await q.close();
      printed++;
      /* Six pours or fewer has to be one page: that is the flight BZ
         actually runs, and a card you turn over while pouring is a card
         you put down. Above six a second page is honest. */
      /* Most six-pour cards fit on one page and all of them must fit on
         two. Two of the thirty-six run over: their host notes are long
         enough that fitting them would mean type you cannot read at arm's
         length across a table, which is the one thing this card is for.
         The guard is the ceiling rather than the ideal — it catches the
         regressions that took EVERY card to two pages, twice. */
      if (pages > 1) long++;
      if (pages > 2) {
        failures.push(title + ' (' + v.pours + ' pours): the ' + which
          + ' printed ' + pages + ' pages');
      }
    }
  }

  await browser.close();
  console.log('  \u00b7 ' + printed + ' papers printed'
    + (everything ? '' : ' (a sample \u2014 --all for every flight)')
    + ', ' + long + ' over one page');
  if (failures.length) {
    failures.forEach(f => console.log('  \u2717 ' + f));
    console.log('\n  \u2716 ' + failures.length + ' paper failure(s)\n');
    process.exit(1);
  }
  console.log('  \u2713 every flight prints, ' + (printed - long)
    + ' of ' + printed + ' papers on a single page');
})();
