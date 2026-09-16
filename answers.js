/* The answers themselves, graded.
 *
 *   node answers.js [index.html]
 *
 * WHAT THIS IS FOR. On 2026-09-15 BZ asked what he was missing from
 * Penelope. The screen answered "nothing" and the card directly under it
 * offered "a stronger Penelope". The same day he asked about a
 * Manzanilla-cask whisky and was told the bottle "may not exist" — about a
 * finish that exists and is for sale.
 *
 * Every one of 4,700 assertions passed. lint, consistency, screens,
 * render, the walk and the sync all passed. Nothing was broken: the
 * FUNCTIONS were right and the SENTENCES were wrong, and no check in this
 * project had ever read a sentence.
 *
 * So this one reads them. It drives the planning answer with real
 * questions against BZ's real shelf and asks three things of what comes
 * back:
 *
 *   1. Does the screen contradict itself? Two panels may not answer "do
 *      you have any" differently about one subject.
 *   2. Does it say something it may not say? Nothing this app can see
 *      establishes that a whisky does not exist, and nobody asking about
 *      Penelope wants to hear about a library.
 *   3. Does it answer the question that was asked? A house on the shelf
 *      may not come back as a house he does not own.
 *
 * The register it reads is ANSWER_SAID, which renderShopAsk fills as it
 * draws. The app itself only writes those findings to the log — a wrong
 * sentence is not worth an exception in front of somebody pouring a
 * drink. Here they fail the build.
 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const dir = __dirname;

/* THE QUESTIONS, IN BZ'S WORDS. Two of them are the ones that failed.
   `have` is the answer his shelf makes true and is checked against the
   shelf file below, not against the code being tested. */
const ASKS = [
  { q: 'what am i missing from penelope', subject: 'Penelope', have: true },
  { q: 'what am i missing from woodford', subject: 'Woodford', have: true },
  { q: 'what am i missing from buffalo trace', subject: 'Buffalo Trace',
    have: true },
  { q: 'what am i missing from lagavulin', subject: 'Lagavulin' },
  { q: 'what am i missing from ardbeg', subject: 'Ardbeg' },
  { q: 'what bourbon am i missing', subject: 'bourbon', have: true },
  { q: 'what rye am i missing', subject: 'rye', have: true },
  { q: 'what scotch am i missing', subject: 'scotch', have: true },
  { q: 'what am i missing from islay', subject: 'Islay' },
  { q: 'what am i missing from speyside', subject: 'Speyside' },
  { q: 'what american single malt am i missing',
    subject: 'american single malt' },
  { q: 'what am i missing from heaven hill', subject: 'Heaven Hill' }
];

let fails = 0, checks = 0;
function ok(what) { checks++; console.log('  ✓ ' + what); }
function bad(what, detail) {
  checks++; fails++;
  console.log('  ✖ ' + what);
  if (detail) String(detail).split('\n').forEach(l => console.log('      ' + l));
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 860 } });
  const threw = [];
  p.on('pageerror', e => threw.push(e.message));
  await p.route('http://app.local/**', r => {
    const n = r.request().url().split('app.local/')[1].split('?')[0]
      || 'index.html';
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const t = n.endsWith('.json') ? 'application/json'
      : n.endsWith('.js') ? 'text/javascript'
      : n.endsWith('.png') ? 'image/png' : 'text/html';
    r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) });
  });
  await p.goto('http://app.local/index.html');
  await p.waitForTimeout(1200);

  const bots = JSON.parse(fs.readFileSync(path.join(dir, 'bz-bottles.json'),
    'utf8'));

  /* THE CHECK ITSELF, PROVEN TO FAIL FIRST. A guard that has never gone
     red is a guard nobody has tested, and several in this project were
     green for the wrong reason. This builds a card that says both of the
     forbidden things and asserts the page catches them. */
  const selfTest = await p.evaluate(() => {
    answerStarts('the self-test');
    claimOwn('Penelope', 0, 'whiskies', 'one panel');
    claimOwn('A stronger Penelope', 2, 'whiskies', 'the other panel');
    const card = document.createElement('div');
    const line = document.createElement('div');
    line.textContent = 'That bottling may not exist.';
    card.appendChild(line);
    const two = document.createElement('div');
    two.textContent = 'Nothing from Penelope in the library that you do '
      + 'not own.';
    card.appendChild(two);
    const said = answerChecked(card);
    return { bad: said.bad.length, banned: said.banned.length,
      why: (said.bad[0] || {}).why || '' };
  });
  if (selfTest.bad === 1 && /have some/.test(selfTest.why)) {
    ok('the contradiction check goes red on a screen that contradicts itself');
  } else {
    bad('the contradiction check did not catch a planted contradiction',
      JSON.stringify(selfTest));
  }
  if (selfTest.banned === 2) {
    ok('and the sentence check goes red on both kinds of forbidden sentence');
  } else {
    bad('the sentence check caught ' + selfTest.banned + ' of 2 planted '
      + 'sentences');
  }

  /* NOW THE REAL SHELF. */
  await p.evaluate(bs => {
    S.bottles = bs; save_(); rebuildCatalog();
    S.shopMode = 'plan'; S.shopDim = null; S.shop = {};
  }, bots);

  for (const ask of ASKS) {
    const got = await p.evaluate(q => {
      const box = document.getElementById('shopAskQ');
      box.value = q;
      const out = document.createElement('div');
      try {
        renderShopAsk(out);
      } catch (e) {
        return { threw: (e && e.message) || String(e) };
      }
      return {
        claims: ANSWER_SAID.claims,
        bad: ANSWER_SAID.bad,
        banned: ANSWER_SAID.banned,
        said: ANSWER_SAID.said,
        drew: out.textContent.length
      };
    }, ask.q);

    const head = '"' + ask.q + '"';
    if (got.threw) { bad(head + ' threw', got.threw); continue; }
    if (!got.drew) { bad(head + ' drew nothing at all'); continue; }

    if (got.bad.length) {
      bad(head + ' contradicts itself', got.bad.map(c =>
        c.subject + ': ' + c.why + ' (' + c.where.join(' vs ') + ')')
        .join('\n'));
    } else {
      ok(head + ' agrees with itself');
    }

    if (got.banned.length) {
      bad(head + ' says something it may not', got.banned.map(f =>
        f.why + '\n  "' + f.said + '"').join('\n'));
    } else {
      ok(head + ' says nothing it may not');
    }

    /* AND IT ANSWERS THE QUESTION THAT WAS ASKED. A house on the shelf may
       not come back as one he does not own — which is exactly what
       Penelope did. */
    if (ask.have) {
      const own = got.claims.filter(c => c.where === 'the count line'
        && c.unit === 'whiskies')[0];
      if (!own) {
        bad(head + ' never said how much of it is on the shelf');
      } else if (!own.has) {
        bad(head + ' says none, and the shelf has some',
          'the count line claimed 0 ' + ask.subject);
      } else {
        ok(head + ' counts the ' + own.n + ' on the shelf');
      }
    }
  }

  /* A SHELF FED BY THE LIBRARY, which is what volume looks like. Every
     entry the shared library publishes is filed under libKey — a slug, not
     its name — and the bottle count on the answer was read out of a map
     keyed the other way, so it silently answered nothing. Invisible today,
     because BZ's catalog and his shelf are the same 325 rows. */
  const keyed = await p.evaluate(() => {
    const k = L.libKey('Penelope Wheated Straight Bourbon Whiskey');
    S.base = {}; S.edits = {}; S.custom = {}; S.deleted = {};
    S.custom[k] = { k: k, name: 'Penelope Wheated Straight Bourbon Whiskey',
      dist: 'Penelope Bourbon', sub: 'bourbon', proof: 94 };
    S.bottles = [{ id: 'x1', k: k, status: 'open' },
                 { id: 'x2', k: k, status: 'sealed' }];
    rebuildCatalog();
    const read = L.readShelfQuestion('what am i missing from penelope',
      S.catalog, S.bottles, {});
    return read ? { whiskies: read.owned.length, bottles: read.ownedBottles }
      : null;
  });
  if (keyed && keyed.whiskies === 1 && keyed.bottles === 2) {
    ok('a shelf fed by the library still counts its bottles (1 whisky, 2 '
      + 'bottles)');
  } else {
    bad('a library-keyed shelf miscounts', JSON.stringify(keyed));
  }

  if (threw.length) bad('the page threw while answering', threw.join('\n'));

  await b.close();
  console.log('\n' + (fails ? '✖ ' + fails + ' of ' + checks
    + ' answer checks found something'
    : '✓ all ' + checks + ' answer checks pass'));
  process.exit(fails ? 1 : 0);
})();
