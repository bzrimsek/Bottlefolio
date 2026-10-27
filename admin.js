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
  return { 'bz-apps': { whisky: whisky } };
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
      const box = document.getElementById('body');
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
