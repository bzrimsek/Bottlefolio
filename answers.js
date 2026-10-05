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

  /* THROUGH THE ONE SHELF LOADER, which every other harness already uses. This
     read the file itself, which is a second door to one question - and the door it
     skipped is the one that says how old the shelf is, so this check alone never
     said what it was grading (2026-10-03). */
  const bots = require('./engine.js').shelf(dir).bottles;

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

  /* AND NOTHING OFFERED IS SOMETHING HE ALREADY OWNS (BZ, 2026-10-04). He
     asked Cooper what to buy and was offered an Aberlour 18 and a New Riff
     Silver Grove off his own shelf, and found it by chance. The engine's own
     suggestion doors, driven against the shelf he actually has. */
  const offers = await p.evaluate(() => {
    const fp = L.shelfFingerprint(L.tasteProfile(S.catalog, S.bottles, S.favs));
    const picks = L.fingerprintPicks(S.catalog, S.bottles, fp, 12,
      LIB.products, LIB.graves, null);
    const owned = picks.filter(x => L.haveAlready(S.catalog[x.k], S.bottles,
      S.catalog, LIB.products, LIB.graves, null));
    return { n: picks.length, owned: owned.map(x => x.name || x.k) };
  });
  if (!offers.n) {
    bad('the picks offered nothing at all, so this proves nothing',
      'a check that cannot fail is not a check');
  } else if (offers.owned.length) {
    bad('the picks offer ' + offers.owned.length + ' bottle(s) he already owns',
      offers.owned.join('\n  '));
  } else {
    ok('none of the ' + offers.n + ' bottles offered is one he already owns');
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

  /* WHAT COOPER IS HANDED. His words are the model's and cost money, so nothing
     can read them every build - but the bottles he is allowed to name are picked
     here, by L.guideGround, and that is where the fault was (BZ, 2026-10-03: "I'm
     not sure the shape of the answer is correct given the relative scarcity of the
     suggestions"). */
  {
    /* THE REAL SHELF BACK. An earlier scenario empties S.base on purpose to prove
       a library-keyed shelf still counts, and these run after it - so without this
       Cooper is handed nothing and all three pass on an empty list. */
    await p.evaluate(([bs, base]) => {
      S.base = base; S.edits = {}; S.custom = {}; S.deleted = {};
      S.bottles = bs; save_(); rebuildCatalog();
    }, [bots, JSON.parse(fs.readFileSync(path.join(dir, 'data.json'),
      'utf8')).catalog || {}]);

    const GENERAL = ['If I like beer where should I start with whiskey',
      'what should I try first', 'I am new to whiskey what do you recommend',
      'something smoky to start with'];
    /* MATCHED BY NAME, because L.guideRow answers a row carrying no key and no
       obsc - so looking a product up by r.k missed every time, every bottle took
       the default reach and the measure was flat. Found by breaking the ranking
       and watching this pass. */
    const handed = await p.evaluate(qs => {
      const byName = {};
      Object.values(S.base).forEach(x => { if (x && x.name) byName[x.name] = x; });
      return qs.map(q => ({
        q: q,
        rows: (L.guideGround(q, S.base, S.bottles).rows || []).map(r => {
          const p2 = byName[r.name] || {};
          return { name: r.name, reach: L.guideReach(p2),
            /* JUDGED INDEPENDENTLY of L.neverOffer, which is the function this
               is meant to guard: asking it whether it was right is agreeing with
               whatever it says. L.NOT_WHISKY is a list, not a decision. */
            notWhisky: L.NOT_WHISKY.indexOf(
              String(p2.sub || '').toLowerCase()) >= 0 };
        })
      }));
    }, GENERAL);

    /* NOT VACUOUS. Three assertions over an empty list all pass, which is the
       trap this project keeps meeting - so the list is checked for being a list
       first. */
    const rowCount = handed.reduce((n, h) => n + h.rows.length, 0);
    if (rowCount < 8) {
      bad('Cooper is handed bottles at all',
        rowCount + ' rows across ' + handed.length + ' questions - every check '
        + 'below would pass on an empty list');
    } else {
      ok('Cooper is handed bottles at all (' + rowCount + ' rows)');
    }

    /* 1. NOTHING HE MAY NOT RECOMMEND. */
    const offered = handed.filter(h => h.rows.some(r => r.notWhisky));
    if (offered.length) {
      bad('Cooper is never handed something that is not whiskey',
        offered.map(h => h.q + ' \u2014 '
          + h.rows.filter(r => r.notWhisky).map(r => r.name).join(', ')).join('\n'));
    } else {
      ok('Cooper is never handed something that is not whiskey');
    }

    /* 2. A GENERAL QUESTION IS ANSWERED WITH BOTTLES SOMEBODY CAN FIND. Half,
       not all: a question about a rare thing may fairly return rare things, and
       the bar has to be one a real shelf can clear. */
    /* THE BAR IS THE MEAN, AND IT IS MEASURED IN BOTH STATES. Per question
       nothing separates a working ranking from a broken one - "what should I try
       first" comes back 8 of 12 findable either way - so a per-question bar
       either fails that one always or passes the regression. On BZ's shelf, the
       share of what Cooper is handed that somebody can buy:

         with the tie-break   0.92  0.67  0.92  1.00   mean 0.88
         without it           0.75  0.67  0.67  0.92   mean 0.75

       0.70 sits between them, with room on both sides. RE-MEASURED when a
       word landing only in a tasting note stopped counting unless the app can
       taste it: the old figures were taken over lists that still held noise,
       and "what should I try first" now returns ONE row rather than twelve, so
       it leaves the mean entirely. The smoky question sits at 0.56 in both
       states - genuinely peaty whiskies are often obscure, which is an answer
       rather than a fault. A floor against the ranking regressing, not a
       standard anybody designed to. */
    const shares = handed.filter(h => h.rows.length >= 4)
      .map(h => h.rows.filter(r => r.reach <= 1).length / h.rows.length);
    const mean = shares.length
      ? shares.reduce((a, b) => a + b, 0) / shares.length : 1;
    if (mean < 0.70) {
      const worst = handed.filter(h => h.rows.length >= 4)
        .sort((a, b) => a.rows.filter(r => r.reach <= 1).length / a.rows.length
          - b.rows.filter(r => r.reach <= 1).length / b.rows.length)[0];
      bad('questions that name nothing are answered with findable bottles',
        'mean ' + mean.toFixed(2) + ' across ' + shares.length
        + ' questions, against a floor of 0.70. Worst: ' + worst.q + ' \u2014 '
        + worst.rows.filter(r => r.reach > 1).slice(0, 3)
          .map(r => r.name).join(', '));
    } else {
      ok('questions that name nothing are answered with findable bottles (mean '
        + mean.toFixed(2) + ')');
    }

    /* 3. AND THE QUESTION STILL OUTRANKS THE TIE-BREAK. */
    const named = await p.evaluate(() => {
      const obscure = Object.values(S.base)
        .filter(x => x && x.obsc === 'obscure' && x.dist)[0];
      if (!obscure) return null;
      const rows = L.guideGround(obscure.dist, S.base, S.bottles).rows || [];
      return { asked: obscure.dist, first: (rows[0] || {}).name || '' };
    });
    if (!named) {
      ok('nothing obscure on this shelf to ask about');
    } else if (named.first && new RegExp(named.asked.split(/\s+/)[0], 'i')
        .test(named.first)) {
      ok('naming an obscure house still brings it back first ('
        + named.asked + ')');
    } else {
      bad('naming an obscure house still brings it back first',
        'asked ' + named.asked + ', was handed ' + named.first);
    }
  }

  if (threw.length) bad('the page threw while answering', threw.join('\n'));

  await b.close();
  console.log('\n' + (fails ? '✖ ' + fails + ' of ' + checks
    + ' answer checks found something'
    : '✓ all ' + checks + ' answer checks pass'));
  process.exit(fails ? 1 : 0);
})();
