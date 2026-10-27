/* THE ADMIN PAGE, IN A REAL BROWSER.
 *
 * admin.html carries no engine, no Firebase config, no version and no SDK
 * url of its own - it reads all four out of index.html at boot. That makes
 * index.html's two engine anchors load-bearing in a second file, so this
 * harness asserts them and then BREAKS them on purpose: a page that silently
 * draws nothing when an anchor moves would be worse than the duplication it
 * exists to avoid.
 *
 * It also drives the three gate states (signed out / signed in and not an
 * admin / an admin) and the one irreversible action on the page, because a
 * Remove that stopped working after the move would be found by BZ and not
 * by a check.
 *
 *   node admin.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
/* THE CURRENT VERSION, OUT OF index.html, because a seed that spells it
   out goes stale at the next bump: this harness passed, bump.py moved the
   app to 2.9.12, and the account seeded as current suddenly read as one
   build behind - so the card said 2 on an older version and the check
   failed on the build it was written for. One source for the number,
   which is the same source admin.html itself uses. */
const NOW_V = (fs.readFileSync(path.join(HERE, 'index.html'), 'utf8')
  .match(/const APP_VERSION = '([^']+)'/) || [])[1] || '';
const failures = [];
const said = [];

function check(label, cond, saw) {
  if (cond) return true;
  failures.push(label + (saw === undefined ? '' : ' — saw: ' + saw));
  return false;
}

/* THE SDK AND THE FOLDER, answered from here. admin.html fetches index.html
   over http (a file:// fetch is refused), so the whole folder is served. */
async function wire(page, seed, fbOpts, doctor) {
  await page.route('https://www.gstatic.com/**', route => {
    const url = route.request().url();
    let body = '';
    if (url.indexOf('firebase-app-compat') >= 0) {
      body = fs.readFileSync(path.join(HERE, 'fake-firebase.js'), 'utf8')
        + '\n;window.firebase = window.makeFakeFirebase('
        + JSON.stringify(seed || {}) + ','
        + JSON.stringify(fbOpts || {}) + ');';
    }
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: body });
  });
  await page.route('http://app.local/**', route => {
    const name = route.request().url().split('app.local/')[1].split('?')[0]
      || 'admin.html';
    const p = path.join(HERE, name);
    if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(p);
    /* THE MUTANT LIVES HERE: index.html is served doctored, so the real file
       is never touched and the page meets exactly the fault being tested. */
    if (doctor && name === 'index.html') body = doctor(body.toString('utf8'));
    const type = name.endsWith('.json') ? 'application/json'
      : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.png') ? 'image/png' : 'text/html';
    return route.fulfill({ status: 200, contentType: type, body: body });
  });
}

const ADMIN_UID = 'bzuid';
const OTHER_UID = 'otheruid';
const THIRD_UID = 'thirduid';

/* A SHELF OF ACCOUNTS, in the shapes L.adminPeople actually reads: `at` is
   the last-seen stamp, not seenAt, and `version` is what makes a row stale. */
function seedWith(opts) {
  const o = opts || {};
  const day = 86400000;
  const whisky = {
    stats: {
      [ADMIN_UID]: { name: 'BZ', email: 'bz@example.com', bottles: 384,
        pours: 912, flights: 40, at: Date.now(), version: NOW_V },
      [OTHER_UID]: { name: 'Kevrin', email: 'kev@example.com', bottles: 61,
        pours: 40, flights: 3, at: Date.now() - day * 2, version: '2.8.50' },
      [THIRD_UID]: { name: '', email: '', bottles: 0, at: 0, version: '' }
    },
    directory: { [OTHER_UID]: { name: 'Kevrin M' } }
  };
  if (o.admin !== false) whisky.admins = { [ADMIN_UID]: true };
  if (o.shares) whisky.shares = o.shares;
  if (o.sharedWith) whisky.sharedWith = o.sharedWith;
  if (o.requests) whisky.requests = o.requests;
  /* A LIBRARY WORTH JUDGING (2026-10-27). Not a filled-in one: one complete
     entry, one short of a proof, and TWO SPELLINGS OF ONE WHISKY - because a
     scan that reports nothing over a library with a real duplicate in it is
     the exact shape of a check that cannot fail, and this seed is what makes
     the duplicate assertion below mean something.

     The twelve plain entries are the fill's population, carried over from
     screens.js with the check that counts them. */
  if (o.library !== false) {
    /* THREE FINDINGS THE ENGINE ACTUALLY MAKES, read off it rather than
       guessed. The first seed carried two spellings of Weller 12 and the
       scan said "nothing contradicts itself" - correctly: BZ's own ruling
       is that a year, an age or a bare batch on ONE side is not a
       difference, and Gray Label Seagrass is not plain Seagrass. A seed
       that does not trip the rules makes every assertion about the scan
       vacuous, which is the shape of a check that cannot fail.

       Two of the three have a mechanical fix, so the mend buttons have
       something to drive and not only something to list. */
    const products = {
      lagavulin_16: { name: 'Lagavulin 16 Year Old', dist: 'Lagavulin',
        proof: 86, sub: 'scotch', region: 'Islay', fin: 'ex-bourbon',
        tn: { nose: 'smoke', palate: 'peat', finish: 'long' }, mash: 'malt' },
      ardbeg_10: { name: 'Ardbeg 10 Year Old', dist: 'Ardbeg',
        sub: 'scotch', region: 'Islay' },
      /* ONE BOTTLE, TWICE: the same name in two cases derives two keys. */
      ardbeg_dup: { name: 'ARDBEG 10 YEAR OLD', dist: 'Ardbeg',
        sub: 'scotch', region: 'Islay' },
      /* A FINISH HOLDING A SCARCITY, which is not a finish. */
      blantons: { name: 'Blanton\u2019s Single Barrel', dist: 'Buffalo Trace',
        proof: 93, sub: 'bourbon', fin: 'single barrel' },
      /* AND A PROOF LEFT IN A NAME. */
      stagg: { name: 'Stagg Jr 131 proof', dist: 'Buffalo Trace',
        sub: 'bourbon' }
    };
    for (let i = 0; i < 12; i++) {
      products['e' + i] = { name: 'Entry ' + i, proof: 100,
        dist: 'House ' + i, sub: 'scotch' };
    }
    whisky.shared = { catalog: { products: products }, removed: {},
      reviewed: {} };
    if (o.registry) whisky.shared.ref = o.registry;
  }
  /* AND AN OFFER, from somebody who is not the admin. */
  if (o.offer !== false) {
    whisky.contrib = { [OTHER_UID]: {
      four_roses_single_barrel: { name: 'Four Roses Single Barrel',
        dist: 'Four Roses', proof: 100, sub: 'bourbon',
        by: 'Kevrin', at: Date.now() }
    } };
  }
  return { 'bz-apps': { whisky: whisky } };
}

/* OPEN A TAB AND WAIT FOR IT TO HAVE DRAWN SOMETHING. Not a sleep: the
   library and the scan each wait on a read, and a guessed number is how a
   check comes to pass against a half-drawn page. */
async function openTab(page, name) {
  await page.evaluate(n => {
    const t = Array.from(document.querySelectorAll('#tabs .tab'))
      .find(x => x.getAttribute('data-go') === n);
    if (t) t.click();
  }, name);
  await page.waitForFunction(n => {
    const sec = document.getElementById('sec-' + n);
    if (!sec || !sec.classList.contains('on')) return false;
    const txt = (sec.innerText || '').trim();
    return txt.length > 0 && txt.indexOf('Reading the library') < 0
      && txt.indexOf('Loading') < 0;
  }, name, { timeout: 15000 }).catch(() => {});
  return page.evaluate(n => {
    const sec = document.getElementById('sec-' + n);
    return {
      showing: !!(sec && sec.classList.contains('on')),
      text: sec ? (sec.innerText || '').replace(/\s+/g, ' ').trim() : '',
      buttons: sec ? sec.querySelectorAll('button').length : 0,
      rows: sec ? sec.querySelectorAll('.item').length : 0
    };
  }, name);
}

async function open(browser, opts) {
  const o = opts || {};
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  await wire(page, o.seed, o.fbOpts, o.doctor);
  await page.goto('http://app.local/admin.html');
  /* WAIT FOR THE PAGE TO HAVE SETTLED ON AN ANSWER rather than sleeping a
     guessed number: either the gate says something or the people card drew. */
  await page.waitForFunction(() => {
    const g = document.getElementById('gate');
    const b = document.getElementById('everybodyCard');
    if (b && b.querySelector('.item')) return true;
    if (b && b.textContent.indexOf('Loading') < 0) return true;
    return g && !g.hidden && g.textContent.indexOf('Starting') < 0
      && g.textContent.indexOf('Reading the app') < 0
      && g.textContent.indexOf('Checking') < 0;
  }, { timeout: 15000 }).catch(() => {});
  return { page, errs };
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();

  /* ------------------------------------------------------------------
     1. AN ADMIN. The list draws, on the engine out of index.html.
     ------------------------------------------------------------------ */
  {
    const { page, errs } = await open(browser, {
      seed: seedWith({}),
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' } }
    });
    const r = await page.evaluate(() => ({
      engine: window.A && window.A.L ? Object.keys(window.A.L).length : 0,
      version: window.A ? window.A.version : '',
      project: window.A && window.A.config ? window.A.config.projectId : '',
      admin: window.A ? window.A.admin : null,
      gateHidden: document.getElementById('gate').hidden,
      rows: document.querySelectorAll('#everybodyCard .item').length,
      tags: Array.from(document.querySelectorAll('#everybodyCard .pourtag'))
        .map(t => t.textContent),
      text: document.getElementById('body').innerText
    }));
    check('an admin: no page error', !errs.length, errs.join(' | '));
    check('an admin: the engine came from index.html', r.engine > 1000, r.engine);
    check('an admin: the version came from index.html', /^\d+\.\d+\.\d+$/.test(r.version), r.version);
    check('an admin: the config came from index.html', r.project === 'bottlefolio', r.project);
    check('an admin: the gate stood down', r.gateHidden === true, r.gateHidden);
    check('an admin: three people listed', r.rows === 3, r.rows);
    check('an admin: the directory name wins over the stats name',
      r.text.indexOf('Kevrin M') >= 0, 'no "Kevrin M"');
    check('an admin: this sign-in is marked',
      r.text.indexOf('this sign-in') >= 0, 'no "this sign-in"');
    /* ASSERTED ON THE DOM, NOT innerText. .pourtag is text-transform:uppercase
       and Chromium's innerText returns RENDERED text, so this read "V2.8.50"
       and the check failed against a tag that was there all along. */
    check('an admin: an older version is called out',
      r.tags.indexOf('v2.8.50') >= 0, r.tags.join(','));
    /* AND THE SENTENCE ABOVE THE LIST. An account that has never reported is
       not on an older version; this said "2 on an older version" over a row
       reading "no report" until 2026-10-27. */
    check('an admin: only a reported version counts as older',
      /1 on an older version/.test(r.text),
      (r.text.split(String.fromCharCode(10))[1] || '').slice(0, 70));
    check('an admin: an empty shelf says so',
      r.text.indexOf('empty shelf') >= 0, 'no "empty shelf"');
    check('an admin: it says nobody’s bottles are read',
      r.text.indexOf('nobody’s bottles are read here') >= 0, 'claim missing');
    said.push('an admin sees ' + r.rows + ' people on engine v' + r.version);
    await page.close();
  }

  /* ------------------------------------------------------------------
     2. SIGNED IN, NOT AN ADMIN. A door nobody can open is the whole
        reason this page exists - so there must not be one.
     ------------------------------------------------------------------ */
  {
    const { page, errs } = await open(browser, {
      seed: seedWith({ admin: false }),
      fbOpts: { user: { uid: OTHER_UID, email: 'kev@example.com' } }
    });
    const r = await page.evaluate(() => ({
      admin: window.A ? window.A.admin : null,
      gate: document.getElementById('gate').innerText,
      bodyHidden: document.getElementById('body').hidden,
      card: !!document.getElementById('everybodyCard')
    }));
    check('not an admin: refused', r.admin === false, r.admin);
    check('not an admin: said plainly', /not an admin/i.test(r.gate), r.gate.slice(0, 80));
    check('not an admin: the node is named', /admins/.test(r.gate), r.gate.slice(0, 120));
    check('not an admin: no people card at all', !r.card, 'a card drew');
    check('not an admin: the body stays shut', r.bodyHidden === true, r.bodyHidden);
    check('not an admin: no page error', !errs.length, errs.join(' | '));
    said.push('a non-admin is told: ' + r.gate.split('\n')[0]);
    await page.close();
  }

  /* ------------------------------------------------------------------
     3. SIGNED OUT.
     ------------------------------------------------------------------ */
  {
    const { page, errs } = await open(browser, {
      seed: seedWith({}), fbOpts: { user: null }
    });
    const r = await page.evaluate(() => ({
      gate: document.getElementById('gate').innerText,
      btns: Array.from(document.querySelectorAll('#gate button')).map(b => b.textContent),
      out: document.getElementById('out').hidden,
      card: !!document.getElementById('everybodyCard')
    }));
    check('signed out: offers a sign-in',
      r.btns.some(b => /sign in with google/i.test(b)), r.btns.join(','));
    check('signed out: says what the page is for',
      /shared library|people with accounts/i.test(r.gate), r.gate.slice(0, 90));
    check('signed out: no sign-out button', r.out === true, r.out);
    check('signed out: no people card', !r.card, 'a card drew');
    check('signed out: no page error', !errs.length, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------
     4. THE ADMINS READ REFUSED. Refused is not the same as false, and
        telling somebody they are not an admin when the database would
        not say is a guess.
     ------------------------------------------------------------------ */
  {
    const { page } = await open(browser, {
      seed: seedWith({}),
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' },
                refOpts: { failReads: 'PERMISSION_DENIED' } }
    });
    const r = await page.evaluate(() => ({
      gate: document.getElementById('gate').innerText,
      admin: window.A ? window.A.admin : null,
      card: !!document.getElementById('everybodyCard')
    }));
    /* The stand-in may not implement failReads; if the read succeeded this
       says so rather than passing quietly on a capability nobody wrote. */
    if (r.admin === true) {
      said.push('NOTE: the Firebase stand-in has no failReads, so a refused '
        + 'admins read is not covered here');
    } else {
      check('refused read: not reported as "not an admin"',
        !/not an admin/i.test(r.gate), r.gate.slice(0, 80));
      check('refused read: no people card', !r.card, 'a card drew');
    }
    await page.close();
  }

  /* ------------------------------------------------------------------
     5. REMOVE, the one irreversible thing on the page. It must still
        demand the word and still wipe the right paths.
     ------------------------------------------------------------------ */
  {
    const { page, errs } = await open(browser, {
      seed: seedWith({
        shares: { [OTHER_UID]: { [ADMIN_UID]: { at: 1 } } },
        sharedWith: { [OTHER_UID]: { [ADMIN_UID]: { at: 1 } } },
        requests: { [OTHER_UID]: { [THIRD_UID]: { at: 1 } } }
      }),
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' } }
    });
    /* Open the Remove on somebody who is not this sign-in. */
    const opened = await page.evaluate(uid => {
      const items = Array.from(document.querySelectorAll('#everybodyCard .item'));
      const row = items.find(i => i.innerText.indexOf(uid) >= 0);
      if (!row) return 'no row for ' + uid;
      const rm = Array.from(row.querySelectorAll('button'))
        .find(b => b.textContent === 'Remove');
      if (!rm) return 'no Remove button';
      rm.click();
      return 'ok';
    }, OTHER_UID);
    check('remove: the button is on the row', opened === 'ok', opened);

    const dlg = await page.evaluate(() => ({
      text: document.getElementById('modalBox').innerText,
      hasField: !!document.getElementById('removeConfirm')
    }));
    check('remove: warns there is no undo', /no undo/i.test(dlg.text), dlg.text.slice(0, 100));
    check('remove: says the sign-in is not removed',
      /sign-in is not removed/i.test(dlg.text), 'warning missing');
    check('remove: asks for the word', dlg.hasField, 'no confirm field');

    /* THE WRONG WORD MUST DO NOTHING. */
    await page.evaluate(() => {
      document.getElementById('removeConfirm').value = 'yes';
      Array.from(document.querySelectorAll('#modalBox button'))
        .find(b => b.textContent === 'Remove their data').click();
    });
    await page.waitForTimeout(150);
    const afterWrong = await page.evaluate(uid => {
      const d = window.firebase.__store.data['bz-apps'].whisky;
      return { stillThere: !!(d.stats && d.stats[uid]),
               open: !document.getElementById('modalWrap').hidden };
    }, OTHER_UID);
    check('remove: the wrong word changes nothing', afterWrong.stillThere === true,
      'the account was wiped on "yes"');
    check('remove: the dialog stays open on the wrong word', afterWrong.open === true,
      afterWrong.open);

    /* AND THE RIGHT WORD WIPES. */
    await page.evaluate(() => {
      document.getElementById('removeConfirm').value = 'REMOVE';
      Array.from(document.querySelectorAll('#modalBox button'))
        .find(b => b.textContent === 'Remove their data').click();
    });
    await page.waitForTimeout(400);
    const after = await page.evaluate(uid => {
      const d = window.firebase.__store.data['bz-apps'].whisky;
      return {
        stats: !!(d.stats && d.stats[uid]),
        shelf: !!d[uid],
        dir: !!(d.directory && d.directory[uid]),
        shares: !!(d.shares && d.shares[uid]),
        wiped: !!(d.wiped && d.wiped[uid]),
        writes: window.firebase.__store.log.length
      };
    }, OTHER_UID);
    check('remove: the stats entry is gone', after.stats === false, 'stats remain');
    check('remove: the directory entry is gone', after.dir === false, 'directory remains');
    check('remove: a tombstone is left', after.wiped === true, 'no tombstone');
    check('remove: no page error', !errs.length, errs.join(' | '));
    said.push('Remove wiped the account and left a tombstone in '
      + after.writes + ' writes');
    await page.close();
  }

  /* ------------------------------------------------------------------
     6. SUSPEND, the only control for a live feature.
     ------------------------------------------------------------------ */
  {
    const { page, errs } = await open(browser, {
      seed: seedWith({}),
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' } }
    });
    const hit = await page.evaluate(uid => {
      const items = Array.from(document.querySelectorAll('#everybodyCard .item'));
      const row = items.find(i => i.innerText.indexOf(uid) >= 0);
      if (!row) return 'no row';
      const b = Array.from(row.querySelectorAll('button'))
        .find(x => x.textContent === 'Suspend');
      if (!b) return 'no Suspend button';
      b.click();
      return 'ok';
    }, OTHER_UID);
    check('suspend: the button is on the row', hit === 'ok', hit);
    await page.waitForTimeout(350);
    const got = await page.evaluate(uid =>
      !!(window.firebase.__store.data['bz-apps'].whisky.stats[uid] || {}).suspended,
      OTHER_UID);
    check('suspend: it wrote suspended', got === true, got);
    check('suspend: no page error', !errs.length, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------
     6b. THE LATE DATA REDRAW. Both of these came out of browser.js on
         2026-10-27 with the screen they test; they are not new.

         ONE EVERYBODY CARD, HOWEVER MANY TIMES IT PAINTS.
         BZ: "and I see 2 Everybody boxes." The sharing audit and each
         person's report arrive after the first paint and the redraw calls
         renderUsers again, which APPENDED rather than replaced. A render
         that cannot be called twice is a render that will be, because the
         whole point of this screen is that its data arrives late.

         AND THE LIST SITS UNDER ITS HEADING, AFTER THE DATA LANDS.
         BZ, three times: the People heading at the top with nothing under
         it and the list at the foot of the page. Two causes, both mine -
         the redraw appended rather than replaced, then replaced at the
         wrong index - and the headless check passed each time because it
         measured the FIRST paint, while what he saw was the screen after
         the sharing audit and the diagnostics arrived. So this renders,
         then redraws, and checks the position AFTER.
     ------------------------------------------------------------------ */
  {
    const { page, errs } = await open(browser, {
      seed: seedWith({}),
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' } }
    });
    const r = await page.evaluate(() => {
      /* ITS OWN SECTION since 2026-10-27, not the whole body: the library
         brought four surfaces and People is one of them. This read #body
         and looked for the card among its direct children, where it is now
         a grandchild - so the check said there was no card at all. The
         check was right and the host was stale. */
      const box = document.getElementById('sec-people');
      /* What actually happens: the late data triggers a redraw. */
      renderUsers(box);
      renderUsers(box);
      const kids = Array.from(box.children);
      const card = box.querySelector('#everybodyCard');
      const head = box.querySelector('#peopleHead');
      return { at: kids.indexOf(card), head: kids.indexOf(head),
               of: kids.length,
               cards: box.querySelectorAll('#everybodyCard').length };
    });
    if (r.at < 0) {
      failures.push('people: no Everybody card after a redraw');
    } else if (r.head < 0) {
      failures.push('people: no People heading to sit under');
    } else if (r.at !== r.head + 1) {
      failures.push('people: the list is at position ' + r.at + ' of '
        + r.of + ' while its heading is at ' + r.head
        + ' - it must sit directly under it');
    }
    check('redraw: one Everybody card after a redraw', r.cards === 1, r.cards);
    check('redraw: no page error', !errs.length, errs.join(' | '));

    /* AND THREE RENDERS INTO A HOST OF ITS OWN. */
    const t = await page.evaluate(() => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      renderUsers(host);
      renderUsers(host);
      renderUsers(host);
      const cards = host.querySelectorAll('#everybodyCard').length;
      const heads = Array.from(host.querySelectorAll('h3'))
        .filter(h => /Everyone/.test(h.textContent || '')).length;
      host.remove();
      return { cards: cards, heads: heads };
    });
    check('redraw: three renders leave one card', t.cards === 1, t.cards);
    check('redraw: three renders leave one heading', t.heads === 1, t.heads);
    said.push('three renders of the people list leave ' + t.cards
      + ' card and ' + t.heads + ' heading');
    await page.close();
  }

  /* ------------------------------------------------------------------
     7. NO SECOND COPY OF ANYTHING. Structural, and the cheapest guard
        here: if admin.html ever grows its own engine or config, this is
        what notices.
     ------------------------------------------------------------------ */
  {
    const src = fs.readFileSync(path.join(HERE, 'admin.html'), 'utf8');
    /* MATCHED AT A LINE START, not anywhere in the file: admin.html names
       both of these INSIDE its own slicer - the engine anchor it searches for
       and the version pattern it matches - so a plain indexOf found them and
       these two checks failed against the very code that proves there is one
       copy. A declaration is at column 0; a mention is not. */
    const lines = src.split(String.fromCharCode(10));
    const declares = p2 => lines.some(l => l.indexOf(p2) === 0);
    check('one engine: admin.html declares no L of its own',
      !declares('const L = {}'), 'it declares one');
    check('one config: admin.html holds no apiKey',
      src.indexOf('apiKey') < 0, 'it holds a key');
    check('one config: admin.html holds no databaseURL',
      src.indexOf('databaseURL') < 0, 'it holds a url');
    check('one version: admin.html declares no APP_VERSION of its own',
      !declares('const APP_VERSION'), 'it sets one');
    check('one sdk: admin.html hardcodes no gstatic url',
      src.indexOf('gstatic.com/firebasejs') < 0, 'it hardcodes one');
    /* AND IT IS NOT IN THE SERVICE WORKER: desktop only, so a stranger's
       browser never caches it (BZ, 2026-10-27). */
    const sw = fs.readFileSync(path.join(HERE, 'sw.js'), 'utf8');
    check('desktop only: admin.html is not precached',
      sw.indexOf('admin.html') < 0, 'sw.js names it');
  }

  /* ------------------------------------------------------------------
     8. THE MUTANTS. Each breaks one thing admin.html reads out of
        index.html and demands that the page SAY so. A page that drew an
        empty screen instead would be the worst outcome of this split.
     ------------------------------------------------------------------ */
  const mutants = [
    ['the engine anchor', h => h.replace('const L = {};', 'const LL = {};')],
    ['the engine banner', h => h.replace(
      '/* =====================================================================\n   STATE + RENDER',
      '/* ---- nothing ----')],
    ['the config block', h => h.replace('config: {', 'cfg: {')],
    ['index.html itself', null]
  ];
  for (const [what, doctor] of mutants) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e)));
    if (doctor) {
      await wire(page, seedWith({}),
        { user: { uid: ADMIN_UID, email: 'bz@example.com' } }, doctor);
    } else {
      /* index.html missing entirely: every other route still answers. */
      await page.route('https://www.gstatic.com/**', r =>
        r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
      await page.route('http://app.local/**', route => {
        const name = route.request().url().split('app.local/')[1].split('?')[0];
        if (name === 'index.html') return route.fulfill({ status: 404, body: '' });
        const p = path.join(HERE, name || 'admin.html');
        if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: 'text/html',
                               body: fs.readFileSync(p) });
      });
    }
    await page.goto('http://app.local/admin.html');
    await page.waitForFunction(() => {
      const g = document.getElementById('gate');
      return g && !g.hidden && g.textContent.indexOf('Starting') < 0
        && g.textContent.indexOf('Reading the app') < 0;
    }, { timeout: 15000 }).catch(() => {});
    const r = await page.evaluate(() => ({
      gate: document.getElementById('gate').innerText,
      hidden: document.getElementById('gate').hidden,
      card: !!document.getElementById('everybodyCard')
    }));
    check('mutant (' + what + '): the page says it cannot boot',
      !r.hidden && r.gate.trim().length > 10
      && !/^(Starting|Checking)/.test(r.gate.trim()), r.gate.slice(0, 70));
    check('mutant (' + what + '): it does not draw a people list',
      !r.card, 'a card drew anyway');
    said.push('mutant ' + what + ' → "' + r.gate.split('\n')[0] + '"');
    await page.close();
  }

  /* ------------------------------------------------------------------
     THE LIBRARY, MOVED IN ON 2026-10-27. Eighty-five functions, four
     surfaces, and every fault the move produced was a screen that said
     nothing or said the wrong number while the static checks were green.
     So these read what the screens SAY.
     ------------------------------------------------------------------ */
  {
    const REG = { brands: {
      lagavulin: { name: 'Lagavulin', house: 'Lagavulin' },
      ardbeg: { name: 'Ardbeg', house: 'Ardbeg' },
      weller: { name: 'W.L. Weller', house: 'Buffalo Trace' }
    }, houses: {} };
    const { page, errs } = await open(browser, {
      seed: seedWith({ registry: REG }),
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' } }
    });

    /* EVERY TAB DRAWS SOMETHING. The Clean up tab drew nothing at all for
       one build of this move - no page error, no empty state, an empty
       section - because it still looked for the app's screen element. A
       browser found it in one load and nothing static could have. */
    const tabs = {};
    for (const nm of ['library', 'offers', 'scan', 'people']) {
      tabs[nm] = await openTab(page, nm);
      check('tab ' + nm + ': it is showing', tabs[nm].showing, 'hidden');
      check('tab ' + nm + ': it drew something',
        tabs[nm].text.length > 20, '"' + tabs[nm].text + '"');
    }

    /* THE LIBRARY. Sixteen entries went in, and the count and the score come
       off the library that was READ - against an unread one the score is 0%
       complete and every entry looks empty, which is the oldest fault in
       this family. */
    check('library: it counts the entries that were read',
      /17 entries/.test(tabs.library.text), tabs.library.text.slice(0, 90));
    check('library: the score is not nothing',
      /\d+% complete/.test(tabs.library.text)
      && !/\b0% complete/.test(tabs.library.text),
      tabs.library.text.slice(0, 90));
    check('library: the way in is the types, not sixty names',
      /Scotch|Bourbon/i.test(tabs.library.text), tabs.library.text.slice(0, 90));
    check('library: it offers export and import',
      /Export/.test(tabs.library.text) && /Import/.test(tabs.library.text),
      tabs.library.text.slice(-60));

    /* A ROW OPENS THE EDITOR, which is the whole difference between this
       page and the app's browse. Searched for, because the way in is the
       type tiles. */
    await page.evaluate(() => {
      const q = document.querySelector('#sec-library input.field');
      q.value = 'Lagavulin';
      q.dispatchEvent(new Event('input'));
    });
    await page.waitForFunction(
      () => document.querySelectorAll('#sec-library .item').length > 0,
      { timeout: 8000 }).catch(() => {});
    const hit = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#sec-library .item'));
      return { n: rows.length, first: rows[0] ? rows[0].innerText : '' };
    });
    check('library: a search finds the entry', hit.n === 1, hit.n);
    check('library: and names it', /Lagavulin 16/.test(hit.first), hit.first);
    const editor = await page.evaluate(() => {
      const row = document.querySelector('#sec-library .item');
      if (row) row.click();
      const box = document.getElementById('modalBox');
      return { text: box ? (box.innerText || '').replace(/\s+/g, ' ') : '',
               fields: box ? box.querySelectorAll('input').length : 0 };
    });
    check('library: the row opens the EDITOR, not a read-only look',
      editor.fields > 6, editor.fields + ' input(s)');
    check('library: the editor offers the notes a described whisky has',
      /Nose/.test(editor.text) && /Palate/.test(editor.text),
      editor.text.slice(0, 110));
    await page.evaluate(() => closeModal());

    /* THE OFFERS QUEUE. One offer, and the queue says what it would DO with
       it - the plan, not just a row. An offer that reads as "nothing needs
       you" when it needs a decision is the fault this queue is for. */
    check('offers: it counts what is offered',
      /1 offered/.test(tabs.offers.text), tabs.offers.text.slice(0, 110));
    check('offers: it says what would happen to it',
      /go in|needs you|settled/.test(tabs.offers.text),
      tabs.offers.text.slice(0, 140));
    const badge = await page.evaluate(() =>
      (document.getElementById('offerN') || {}).textContent);
    check('offers: the tab carries the count', badge === '1', badge);

    /* THE SCAN, WITH THE REGISTRY. The duplicate rules consult the taxonomy,
       so the two spellings of Weller 12 must be found. A scan that says
       "nothing contradicts itself" over a real duplicate is the exact shape
       of a check that cannot fail, which is why the seed carries one. */
    /* THE THREE SEEDED FINDINGS, BY NAME. "it found something" would pass
       on any one of them and would not notice two going quiet, which is
       what a scan with three rules and one working rule looks like. */
    check('scan: it found the bottle that appears twice',
      /appears twice/.test(tabs.scan.text), tabs.scan.text.slice(0, 200));
    check('scan: it found the finish holding a class',
      /special class/.test(tabs.scan.text), tabs.scan.text.slice(0, 200));
    check('scan: it found the proof left in a name',
      /carry a proof|carries a proof/.test(tabs.scan.text),
      tabs.scan.text.slice(0, 200));
    check('scan: so it does not say the library is clean',
      !/Nothing contradicts itself/.test(tabs.scan.text),
      tabs.scan.text.slice(0, 160));
    /* AND A FINDING WITH A MECHANICAL FIX OFFERS IT. A list of things wrong
       with no way to put them right is not a finding (BZ). */
    check('scan: a mechanical fault offers its fix',
      /Fix|Clear/.test(tabs.scan.text), tabs.scan.text.slice(0, 200));
    check('scan: and offers the whole list to take away',
      /Copy the whole list/.test(tabs.scan.text), tabs.scan.text.slice(0, 120));
    check('scan: it says what is still missing',
      /missing|Look up/i.test(tabs.scan.text), tabs.scan.text.slice(0, 120));

    /* THE FILL, TWICE OVER - ported from screens.js with its reason. The
       sheet once offered two entries out of 422, because the snapshot was
       keyed on a field the rows do not carry and every row collapsed into
       one bucket. Asking the list helper would not have caught it: the
       fault sat between the helper and the screen, so this reads the
       heading a person sees. */
    const fill = await page.evaluate(() => {
      try {
        libraryFillStart(LIB.products, () => {});
        const box = document.getElementById('modalBox');
        const n = box ? box.querySelectorAll('button,input,textarea').length : 0;
        const head = (box ? box.innerText : '').match(/\d+/);
        return { drew: n, offered: head ? Number(head[0]) : 0 };
      } catch (e) { return { threw: String(e.message || e) }; }
    });
    check('fill: the sheet opens without throwing', !fill.threw, fill.threw);
    check('fill: and draws controls', fill.drew > 0, fill.drew);
    /* Fourteen of the sixteen are short of something; the two complete ones
       are not offered, which is the point of the number. */
    check('fill: it offers the ones that are short, not all of them',
      fill.offered > 0 && fill.offered < 17, fill.offered + ' of 17');
    await page.evaluate(() => closeModal());

    check('the library surfaces: no page error', !errs.length, errs.join(' | '));
    said.push('four tabs drew; the scan named its three findings; the fill '
      + 'offered ' + fill.offered + ' of 17');
    await page.close();
  }

  /* ------------------------------------------------------------------
     ACCEPTING AN OFFER, with a full stop in the name.

     sync.js used to press "Publish N" in the app and assert the entry
     landed under the key the library reads, escaped but not mangled. The
     app does not publish any more, so that half of the check lives here,
     where the write does. A dot in a name is the hazard that cost an
     afternoon on Octomore 16.1: a write that escapes a separator buries
     the entry under a key no reader asks for.

     AND IT IS THE ONE THING ON THIS PAGE THAT REACHES EVERYBODY, which is
     reason enough to drive it from the queue rather than calling the
     writer.
     ------------------------------------------------------------------ */
  {
    const seed = seedWith({ library: false, offer: false });
    const w = seed['bz-apps'].whisky;
    /* A BUFFALO TRACE ENTRY ALREADY IN, so the house is one this app has
       seen: an unknown house sends an offer to the web first and it never
       reaches a button. Found by reading what the queue actually said -
       "1 goes out to the web first, nothing needs you". */
    w.shared = { stamp: 1, removed: {}, reviewed: {},
      catalog: { products: {
        ardbeg_10: { name: 'Ardbeg 10', proof: 92, dist: 'Ardbeg',
          sub: 'scotch', at: 1 },
        eagle_rare_10: { name: 'Eagle Rare 10 Year Old', proof: 90,
          dist: 'Buffalo Trace', sub: 'bourbon', region: 'Kentucky',
          fin: 'new oak', mash: '75% corn',
          tn: { nose: 'oak', palate: 'toffee', finish: 'long' }, at: 1 } } } };
    /* AND AN OFFER THAT NEEDS A DECISION, which is the only kind that gets
       an Add button: a complete one goes in on its own and appears under
       "settled without you". This one carries a scarcity in its finish,
       which is a fault one rule names and a person settles. */
    w.contrib = { [OTHER_UID]: { elmer_t_lee_single_barrel: {
      name: 'Elmer T. Lee Single Barrel', dist: 'Buffalo Trace', proof: 90,
      sub: 'bourbon', region: 'Kentucky', fin: 'single barrel',
      mash: '75% corn',
      tn: { nose: 'caramel', palate: 'orange', finish: 'short' },
      by: 'Kevrin', at: Date.now() } } };

    const { page, errs } = await open(browser, {
      seed: seed,
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' } }
    });
    const before = await openTab(page, 'offers');
    check('accept: the offer is in the queue',
      /1 offered/.test(before.text), before.text.slice(0, 120));

    /* THE WRITE, DRIVEN DIRECTLY, and here is why it is not a button press.

       The Add control is for an offer the app cannot settle on its own: one
       that contradicts itself, or that another person offered differently.
       An offer it CAN settle goes in by itself and appears under "settled
       without you"; one it cannot judge at all goes to the web first. Both
       of those are buttonless on purpose, and which bucket an offer lands in
       turns on whether its house is known - which turns on the registry,
       which the queue does not read on its first draw.

       What this scenario is FOR is the KEY: a full stop in a name, escaped
       in its segment with the separators left alone, which is the hazard
       that cost an afternoon on Octomore 16.1. The key does not depend on
       which button started the write. The queue's own drawing, and what it
       says it would do, are pinned by the four-tabs scenario above. */
    const wrote = await page.evaluate(async () => {
      try {
        const rows = (await readOffers()).filter(r => !r.entry.dropped);
        const list = rows.map(r => ({ row: r,
          product: A.L.intakeProduct(r.entry) }));
        await contribAddMany(list, null);
        return { ran: list.length };
      } catch (e) { return { threw: String(e.message || e) }; }
    });
    check('accept: the write ran', !wrote.threw, wrote.threw);
    check('accept: it had the one offer', wrote.ran === 1, wrote.ran);
    await page.waitForTimeout(1200);

    const after = await page.evaluate(() => {
      const d = window.firebase.__store.data['bz-apps'].whisky;
      return { keys: Object.keys(d.shared.catalog.products || {}).sort(),
               left: Object.keys((d.contrib || {}).otheruid || {}) };
    });
    /* THE KEY, ESCAPED BUT NOT MANGLED: one entry, under one key, with the
       full stop handled in the segment and the separators left alone. */
    /* ESCAPED IN ITS SEGMENT, SEPARATORS LEFT ALONE: one new key beside the
       two seeded ones, and the full stop in "Elmer T. Lee" arrives as a
       single underscore rather than splitting the name into three. */
    check('accept: it lands under the key the library reads',
      after.keys.join(',')
        === 'ardbeg_10,eagle_rare_10,elmer_t_lee_single_barrel',
      after.keys.join(','));
    check('accept: and the offer leaves the queue',
      after.left.length === 0, after.left.join(','));
    check('accept: no page error', !errs.length, errs.join(' | '));
    said.push('an offer with a dot in its name was accepted as '
      + (after.keys.filter(k => k.indexOf('elmer') === 0)[0] || 'NOTHING'));
    await page.close();
  }

  /* ------------------------------------------------------------------
     THE DECLARED DOOR. L.ACTIONS says this page reaches the lookup service
     through adminService and consistency.js fails any call that goes round
     it - but a declaration is only worth having if the page actually asks.
     So the service is answered here and the ask is watched.
     ------------------------------------------------------------------ */
  {
    const { page, errs } = await open(browser, {
      seed: seedWith({}),
      fbOpts: { user: { uid: ADMIN_UID, email: 'bz@example.com' } }
    });
    const asked = [];
    await page.route('**/macros/s/**', route => {
      asked.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ name: 'Entry 0', proof: 100,
          dist: 'House 0', mash: '70% corn' }) });
    });
    const got = await page.evaluate(async () => {
      try {
        const r = await adminService('Entry 0', 8000, ['mash']);
        return { ok: true, mash: r && r.mash };
      } catch (e) { return { ok: false, why: String(e.message || e) }; }
    });
    check('the door: it reached the service', got.ok, got.why);
    check('the door: and read the answer', got.mash === '70% corn', got.mash);
    check('the door: it asked the address out of index.html',
      asked.length === 1 && asked[0].indexOf('/macros/s/') > 0,
      asked.join(' | ') || 'nothing was asked');
    check('the door: the question travelled',
      (asked[0] || '').indexOf('Entry') > 0, asked[0]);
    /* AND IT SPENDS THE DAY'S BUDGET, which is inside the door here rather
       than in a wrapper around it. A door that does not count is how an
       import run spends a month of somebody's API key. */
    const spent = await page.evaluate(() =>
      Object.keys(A.tally || {}).length);
    check('the door: the day is counted', spent > 0, spent);
    check('the door: no page error', !errs.length, errs.join(' | '));
    said.push('the declared door asked the service and counted the day');
    await page.close();
  }

  await browser.close();

  console.log('');
  said.forEach(s => console.log('  ' + s));
  console.log('');
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (failures.length) {
    console.log('admin.js FAILED (' + failures.length + ') in ' + secs + 's');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('admin.js: the admin page holds, in ' + secs + 's');
})().catch(e => { console.log('admin.js THREW: ' + (e && e.stack || e)); process.exit(1); });
