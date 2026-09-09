/* The sync CYCLE, driven end to end in a real browser.
 *
 *   node sync.js [index.html]
 *
 * killer-bs-test.js proves each sync function alone; this proves the
 * SEQUENCE, which is where every fault of 2026-09-03 actually lived. The
 * app is loaded unmodified and the Firebase SDK is swapped for an in-memory
 * fake at the network layer — the page asks gstatic for the SDK and gets
 * fake-firebase.js — so nothing in index.html knows the difference.
 *
 * Each scenario is written as the thing that went wrong, in BZ's words
 * where there are any.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const file = path.resolve(process.argv[2] || 'index.html');
const dir = path.dirname(file);
const failures = [];
const notes = [];

function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) failures.push(name + '\n      got  ' + g + '\n      want ' + w);
}

(async () => {
  const browser = await chromium.launch();

  // One scenario per page, so nothing leaks between them.
  const run = async (label, seed, body, opts) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    page.on('pageerror', e => failures.push(label + ': threw ' + e.message));

    // The SDK the app asks for, answered with the fake plus a boot shim
    // that installs it as window.firebase.
    await page.route('https://www.gstatic.com/**', route => {
      const url = route.request().url();
      let body = '';
      if (url.indexOf('firebase-app-compat') >= 0) {
        body = fs.readFileSync(path.join(dir, 'fake-firebase.js'), 'utf8')
          + '\n;window.firebase = window.makeFakeFirebase('
          + JSON.stringify(seed || {}) + ','
          + JSON.stringify((opts && opts.fbOpts) || { user: { uid: 'testuid', email: 'bz@example.com' } })
          + ');';
      }
      return route.fulfill({ status: 200, contentType: 'text/javascript',
                             body: body });
    });

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

    /* localStorage carries over between "reloads" within a scenario, which
       is the whole point: a reload is where load() and fbFirstLoad meet.

       kb_signedin is always set, because the SDK is only fetched for a
       device that has signed in before — a device that has not never talks
       to Firebase at all, and there is no cycle to test. */
    await page.addInitScript(store => {
      localStorage.setItem('kb_signedin', '1');
      Object.keys(store || {}).forEach(k => localStorage.setItem(k, store[k]));
    }, (opts && opts.storage) || {});

    await page.goto('http://app.local/' + path.basename(file));
    await page.waitForTimeout(1500);          // sdk, auth, first load
    const out = await body(page);
    await page.close();
    return out;
  };

  /* 1. The fault that started it: a bottle bought while the push had not
        landed, then a reload. The account is OLDER. The device must keep
        its bottle and hand it over — not take the account's copy back. */
  {
    const seed = {
      'bz-apps': { whisky: { testuid: {
        updated: 1000,
        bottles: [{ id: 'B1', k: 'Ardbeg 10', status: 'open' }]
      } } }
    };
    const r = await run('newer device', seed, async page => {
      return page.evaluate(async () => {
        /* global S, save_, fbPush, FB, L */
        S.bottles = [{ id: 'B1', k: 'Ardbeg 10', status: 'open' },
                     { id: 'B2', k: 'Weller 12', status: 'open' }];
        save_();                                 // save_ stamps S.updated
        const stampedAt = S.updated;
        await new Promise(r2 => setTimeout(r2, 1400));   // debounced push
        const acct = firebase.__store.data['bz-apps'].whisky.testuid;
        return { onAccount: (acct.bottles || []).map(b => b.id),
                 onDevice: S.bottles.map(b => b.id),
                 // The stamp the DEVICE wrote, not the moment of the push.
                 // Stamping at push time made the account newer than the
                 // device every time, so a load never kept local work.
                 sameStamp: acct.updated === stampedAt };
      });
    });
    check('a newer device hands its bottle to the account',
      r.onAccount, ['B1', 'B2']);
    check('and keeps it', r.onDevice, ['B1', 'B2']);
    check('and the account carries the DEVICE stamp, not the push clock',
      r.sameStamp, true);
  }

  /* 2. The other direction, or a second device could never hand anything
        over: the account is NEWER, so the device takes its copy. */
  {
    const seed = {
      'bz-apps': { whisky: { testuid: {
        updated: 9000,
        bottles: [{ id: 'B1', k: 'Ardbeg 10', status: 'open' },
                  { id: 'B9', k: 'Longrow 18', status: 'sealed' }]
      } } }
    };
    const r = await run('newer account', seed, async page => {
      return page.evaluate(() => ({ onDevice: (S.bottles || []).map(b => b.id) }));
    }, { storage: { 'kb.bottles': JSON.stringify([{ id: 'B1', k: 'Ardbeg 10', status: 'open' }]),
                    'kb.updated': '1000' } });
    check('a newer account lands on the device', r.onDevice, ['B1', 'B9']);
  }

  /* 3. "fb push did not come back in 20s (251077 bytes, bottles, history,
        edits, custom, deleted, customFlights, wish, ...)" — the first push
        of a session carried everything. A device already in step with the
        account must push NOTHING at all. */
  {
    const bottles = [{ id: 'B1', k: 'Ardbeg 10', status: 'open' }];
    const seed = {
      'bz-apps': { whisky: { testuid: { updated: 5000, bottles: bottles } } }
    };
    const r = await run('in step', seed, async page => {
      return page.evaluate(async () => {
        await new Promise(r2 => setTimeout(r2, 1200));
        const w = firebase.__store.log.filter(x => x.op !== 'read'
          && x.path === 'bz-apps/whisky/testuid');
        const keys = [].concat.apply([], w.map(x => x.keys || []));
        return { keys: keys,
                 bytes: w.reduce((a, x) => a + (x.bytes || 0), 0) };
      });
    }, { storage: { 'kb.bottles': JSON.stringify(bottles), 'kb.updated': '5000' } });
    /* Not "writes nothing" — a device signing in for the first time
       genuinely owes the account its display name, and empty strings ARE
       storable so it settles after one write. What must never happen is a
       BULK key going up when nothing in it changed. That is the 220KB and
       the 61KB, and both of them repeated on every single load. */
    const bulk = ['bottles', 'history', 'edits', 'custom', 'customFlights',
                  'deleted', 'favs', 'upcs'];
    check('no bulk key is rewritten when nothing in it changed',
      r.keys.filter(k => bulk.indexOf(k.split('/')[0]) >= 0), []);
    /* 400, not 200. The precise half of this check — no BULK key rewritten
       when nothing in it changed — is what actually guards the 220KB fault
       it was written for, and that still passes. The byte ceiling is the
       crude half, and it was set when a load wrote a stamp and a name.
       Since then noteLedger, shelfCaps and asked have joined the synced
       keys: all small, all scalar or a short map, and a load carrying them
       measured 222. Raised to cover them and no further, so a shelf going
       up still trips it by an order of magnitude. */
    if (r.bytes > 400) {
      failures.push('an in-step load wrote ' + r.bytes
        + ' bytes; it should be a stamp and a name, not a shelf');
    }
    notes.push('an in-step load writes ' + r.bytes + ' bytes (was 220,096)');
  }

  /* 4. "set failed: value argument contains an invalid key (Elmer T. Lee
        Single Barrel Bourbon)". A full stop in a product name is a full
        stop in an edits key, and the whole push was refused. */
  {
    const r = await run('a name with a full stop', {}, async page => {
      return page.evaluate(async () => {
        S.edits['Elmer T. Lee Single Barrel Bourbon'] = { proof: 90 };
        S.updated = Date.now();
        save_();
        await new Promise(r2 => setTimeout(r2, 1400));
        const acct = firebase.__store.data['bz-apps'].whisky.testuid || {};
        return { keys: Object.keys(acct.edits || {}) };
      });
    });
    check('the account holds it, escaped', r.keys,
      ['Elmer T~d Lee Single Barrel Bourbon']);
  }

  /* 5. And it comes BACK as it went in. An escape that does not reverse
        renames eighteen whiskies on every device that reads them. */
  {
    const seed = {
      'bz-apps': { whisky: { testuid: {
        updated: 9000,
        edits: { 'Elmer T~d Lee Single Barrel Bourbon': { proof: 90 } }
      } } }
    };
    const r = await run('escaped on the way back', seed, async page => {
      return page.evaluate(() => ({ keys: Object.keys(S.edits || {}) }));
    });
    check('a stored key is restored, not left escaped', r.keys,
      ['Elmer T. Lee Single Barrel Bourbon']);
  }

  /* 6. "update failed: values argument contains undefined in property
        history.8.pours.5" — a wish pour has no key, and one undefined
        refused the whole write, so a run marked on the app never landed. */
  {
    const r = await run('a run with a wish pour', {}, async page => {
      return page.evaluate(async () => {
        S.history = [{ kind: 'flight', flight: 'PEAT IS A POSTCODE',
                       at: '2026-09-03',
                       pours: ['Ardbeg 10', undefined, 'Lagavulin 16'] }];
        S.updated = Date.now();
        save_();
        await new Promise(r2 => setTimeout(r2, 1400));
        const acct = firebase.__store.data['bz-apps'].whisky.testuid || {};
        return { pours: ((acct.history || [])[0] || {}).pours };
      });
    });
    check('the run lands, without the hole in it', r.pours,
      ['Ardbeg 10', 'Lagavulin 16']);
  }

  /* 7. "fb push ok: 61290 bytes, edits" after correcting ONE bottle. edits
        is one Firebase child, so naming it rewrites all of it. */
  {
    const many = {};
    for (let i = 0; i < 200; i++) many['Bottle ' + i] = { proof: 90 + i % 10 };
    const seed = {
      'bz-apps': { whisky: { testuid: { updated: 1000, edits: many } } }
    };
    const r = await run('one correction', seed, async page => {
      return page.evaluate(async () => {
        await new Promise(r2 => setTimeout(r2, 1200));
        firebase.__store.log.length = 0;         // ignore the load's own push
        S.edits['Bottle 7'] = { proof: 121 };
        S.updated = Date.now();
        save_();
        await new Promise(r2 => setTimeout(r2, 1400));
        const w = firebase.__store.log.filter(x => x.op === 'update');
        return { writes: w.length, bytes: w.reduce((a, x) => a + x.bytes, 0),
                 keys: w.length ? w[0].keys : [],
                 stored: (firebase.__store.data['bz-apps'].whisky.testuid
                   .edits || {})['Bottle 7'] };
      });
    }, { storage: { 'kb.edits': JSON.stringify(many), 'kb.updated': '1000' } });
    check('one corrected bottle names one entry', r.keys,
      ['updated', 'edits/Bottle 7']);
    check('and the correction is on the account', r.stored, { proof: 121 });
    if (r.bytes > 400) {
      failures.push('one correction wrote ' + r.bytes + ' bytes, want a few hundred');
    }
    notes.push('one corrected bottle: ' + r.bytes + ' bytes (was 61,290)');
  }

  /* 8. The whole point, in one scenario: buy a bottle, reload, is it
        there. This is the question BZ actually asked, and no test in the
        file could answer it. */
  {
    const store = {};
    const seed = { 'bz-apps': { whisky: { testuid: { updated: 1000,
      bottles: [{ id: 'B1', k: 'Ardbeg 10', status: 'open' }] } } } };

    // First visit: add a bottle, let it push, keep the localStorage.
    const after = await run('buy', seed, async page => {
      const r = await page.evaluate(async () => {
        S.bottles = (S.bottles || []).concat(
          [{ id: 'B2', k: 'Weller 12', status: 'open', got: '2026-09-03' }]);
        S.updated = Date.now();
        save_();
        await new Promise(r2 => setTimeout(r2, 1400));
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          out[k] = localStorage.getItem(k);
        }
        return { store: out,
                 account: JSON.parse(JSON.stringify(
                   firebase.__store.data['bz-apps'].whisky.testuid)) };
      });
      return r;
    });
    check('the bought bottle reached the account',
      (after.account.bottles || []).map(b => b.id), ['B1', 'B2']);

    // Second visit: same device, same account, nothing else changed.
    const back = await run('reload',
      { 'bz-apps': { whisky: { testuid: after.account } } },
      async page => page.evaluate(() => ({
        onDevice: (S.bottles || []).map(b => b.id)
      })), { storage: after.store });
    check('and is still there after a reload', back.onDevice, ['B1', 'B2']);
  }

  /* 9. A write that is REFUSED must leave the work queued, or the failure
        is permanent and silent — which is the longer-fused version of the
        same bug. */
  {
    const r = await run('a refused write', {}, async page => {
      return page.evaluate(async () => {
        S.bottles = [{ id: 'B5', k: 'Longrow 18', status: 'open' }];
        S.updated = Date.now();
        save_();
        await new Promise(r2 => setTimeout(r2, 1400));
        // Still to be sent, because FB.pushed is only written after a
        // landed write.
        return { queuedAfterFailure: L.changedKeys(['bottles'], S, FB.pushed) };
      });
    }, { fbOpts: { user: { uid: 'testuid' }, refOpts: { failWrites: 'permission denied' } } });
    check('a refused write stays queued', r.queuedAfterFailure, ['bottles']);
  }

  /* 10. Publishing to the library, through the real buttons.

        "publish 1 to library, then mark it published, then it still says
        Publish 1." The updates are keyed by PATH, and running them through
        fbEncode escaped the slashes: one child called
        "catalog~fproducts~fweller_12" at the top of the shared node, a
        toast saying it worked, and a library that never received it. */
  {
    const seed = { 'bz-apps': { whisky: {
      admins: { testuid: true },
      shared: { stamp: 1, catalog: { products: {
        ardbeg_10: { name: 'Ardbeg 10', proof: 92, dist: 'Ardbeg',
                     sub: 'scotch', at: 1 } } } },
      testuid: { updated: 1 } } } };

    const r = await run('publish', seed, async page => {
      await page.evaluate(() => {
        // A name with a full stop in it, because the escaping of the
        // SEGMENT still has to happen even though the separators must not.
        S.custom['Elmer T. Lee Single Barrel'] = {
          k: 'Elmer T. Lee Single Barrel', name: 'Elmer T. Lee Single Barrel',
          proof: 90, dist: 'Buffalo Trace', sub: 'bourbon' };
        S.bottles = [{ id: 'B1', k: 'Elmer T. Lee Single Barrel',
                       status: 'open' }];
        save_(); rebuildCatalog(); renderHome();
      });
      /* The Library moved from a masthead pill to Settings, and this had
         been clicking a button that no longer exists — so the whole sync
         check timed out rather than failing on what it tests. Called
         directly: the door it goes through is not the thing under test,
         and a walk that breaks when a control moves is testing the
         furniture. */
      await page.evaluate(() => { renderLibraryScreen(); goTo('library'); });
      await page.waitForTimeout(1200);
      const before = await page.locator('#libBody button',
        { hasText: /^Publish \d+/ }).count();
      if (!before) return { before: 0 };
      await page.locator('#libBody button', { hasText: /^Publish \d+/ })
        .first().click();
      await page.waitForTimeout(400);
      await page.locator('.modal button',
        { hasText: 'Publish the ones marked publish' }).first().click();
      await page.waitForTimeout(1600);
      return page.evaluate(() => ({
        before: 1,
        stillPending: document.querySelectorAll('#libBody button').length
          && [...document.querySelectorAll('#libBody button')]
            .some(b => /^Publish \d+/.test(b.textContent)),
        library: Object.keys(firebase.__store.data['bz-apps'].whisky
          .shared.catalog.products || {}).sort()
      }));
    });

    check('there was something to publish', r.before, 1);
    check('it lands under the key the library reads, escaped but not mangled',
      r.library, ['ardbeg_10', 'elmer_t~dlee_single_barrel'.replace('t~dlee', 't_lee')]);
    check('and the button clears, because the entry is really there',
      r.stillPending, false);
  }

  /* ===================================================================
     THE MODEL BZ ASKED FOR, stated as three tests.

     "We have a real time database that must be the source when connected.
      If and only if a device does work in a disconnected state, it should
      contribute async — otherwise, direct writing."

     That is a different design from the one in the file. What is there
     treats the device and the account as two peers holding rival copies
     and arbitrates between them with stamps — which is why local kept
     winning against a newer account, why a push clobbered the other
     device, and why two logs stayed separate. Three bugs, one wrong model.

     These three say what right looks like. They are expected to FAIL
     against the current code; that is the point of writing them first.
     =================================================================== */
  {
    /* 1. A REMOTE CHANGE ARRIVES WITHOUT A RELOAD. The listener currently
          records a stamp and applies nothing, so a bottle added on one
          device is invisible on the other until it signs in again. */
    const r = await run('live', { 'bz-apps': { whisky: { testuid: {
        updated: 1000,
        bottles: [{ id: 'B1', k: 'a', status: 'open' }] } } } },
      async page => {
        await page.waitForTimeout(1200);
        return page.evaluate(async () => {
          const before = (S.bottles || []).length;
          // Somebody else's device writes a second bottle.
          firebase.database().ref('bz-apps/whisky/testuid')
            .update({ bottles: [{ id: 'B1', k: 'a', status: 'open' },
                                { id: 'B2', k: 'b', status: 'open' }],
                      updated: Date.now() });
          await new Promise(r2 => setTimeout(r2, 900));
          return { before: before, after: (S.bottles || []).length };
        });
      });
    check('a bottle added elsewhere arrives without a reload',
      r.after, 2);
  }

  {
    /* 2. A CONNECTED WRITE GOES STRAIGHT TO THE DATABASE. Not queued
          behind a stamp comparison, not merged against a local copy: the
          database is the source, so the write lands and the account is
          immediately right. */
    const r = await run('direct', { 'bz-apps': { whisky: { testuid: {
        updated: 1000,
        bottles: [{ id: 'B1', k: 'a', status: 'open' }] } } } },
      async page => {
        await page.waitForTimeout(1200);
        return page.evaluate(async () => {
          S.bottles.push({ id: 'B9', k: 'z', status: 'open' });
          save_();
          await new Promise(r2 => setTimeout(r2, 1300));
          const acct = firebase.__store.data['bz-apps'].whisky.testuid;
          return { onAccount: (acct.bottles || []).length };
        });
      });
    check('a write while connected reaches the account at once',
      r.onAccount, 2);
  }

  {
    /* 3. WORK DONE OFFLINE CONTRIBUTES, and does not clobber. This is the
          only case a merge is for: the device was disconnected, the
          account moved on, and both are right. */
    const r = await run('offline', { 'bz-apps': { whisky: { testuid: {
        updated: 1000,
        bottles: [{ id: 'B1', k: 'a', status: 'open' }] } } } },
      async page => {
        await page.waitForTimeout(1200);
        return page.evaluate(async () => {
          // This device adds one while the account gains a different one.
          S.bottles.push({ id: 'B7', k: 'mine', status: 'open' });
          save_();
          await new Promise(r2 => setTimeout(r2, 400));
          firebase.database().ref('bz-apps/whisky/testuid')
            .update({ bottles: [{ id: 'B1', k: 'a', status: 'open' },
                                { id: 'B8', k: 'theirs', status: 'open' }],
                      updated: Date.now() });
          await new Promise(r2 => setTimeout(r2, 1200));
          const acct = firebase.__store.data['bz-apps'].whisky.testuid;
          const ids = (acct.bottles || []).map(b => b.id).sort();
          return { ids: ids };
        });
      });
    check('neither device\u2019s bottle is lost',
      r.ids, ['B1', 'B7', 'B8']);
  }

  {
    /* DIAGNOSTICS RENDERS WHEN SIGNED IN.

       It did not. The log merge added an early return, so the screen drew
       nothing until a network read came back — and the callback called
       renderDiag again, took the same branch, and read again for ever.
       Signed OUT it worked perfectly, which is why it passed every check
       run against it: the one screen whose job is showing what happened
       was blank for the one person who needed it.

       This is the check that was missing. It opens the screen the way a
       person does and asserts there is something on it. */
    const r = await run('diag', { 'bz-apps': { whisky: { testuid: {
        updated: 1000,
        log: ['09-06 10:00:00 [iph] a line from the other device'] } } } },
      async page => {
        await page.waitForTimeout(1400);
        await page.evaluate(() => { appLog('a line from this device'); });
        await page.locator('nav button[data-scr="settings"]').click()
          .catch(() => {});
        await page.evaluate(() => { renderDiag(); goTo('diag'); });
        await page.waitForTimeout(1200);
        const text = await page.locator('#scr-diag').innerText();
        return {
          length: text.length,
          hasBuild: /version/.test(text),
          hasMine: /a line from this device/.test(text),
          hasTheirs: /a line from the other device/.test(text)
        };
      });
    if (!r.hasBuild || r.length < 200) {
      failures.push('Diagnostics drew nothing while signed in ('
        + r.length + ' chars)');
    }
    check('this device\u2019s own lines are shown', r.hasMine, true);
    check('and the other device\u2019s arrive too', r.hasTheirs, true);
  }

  {
    /* A WRITE MUST NOT WIPE THE OTHER DEVICE.

       The log had this fault and it took four attempts to see it: a bare
       write replaces the account's copy, so whichever device wrote last
       erased the other's work. The shelf writes exactly the same way and
       has had none of that scrutiny — and it holds 346 bottles rather than
       diagnostic lines.

       The account gains a bottle while this device is signed in and has
       one of its own to send. Both must survive. */
    const r = await run('no clobber', { 'bz-apps': { whisky: { testuid: {
        updated: 1000,
        bottles: [{ id: 'B1', k: 'a', status: 'open' }] } } } },
      async page => {
        await page.waitForTimeout(1400);
        return page.evaluate(async () => {
          // Somebody else's device adds one, straight to the account.
          firebase.database().ref('bz-apps/whisky/testuid/bottles')
            .set([{ id: 'B1', k: 'a', status: 'open' },
                  { id: 'B2', k: 'theirs', status: 'open' }]);
          // and this one adds a different one and pushes.
          S.bottles.push({ id: 'B3', k: 'mine', status: 'open' });
          save_();
          await new Promise(r2 => setTimeout(r2, 1600));
          const acct = firebase.__store.data['bz-apps'].whisky.testuid;
          return { ids: (acct.bottles || []).map(b => b.id).sort() };
        });
      });
    check('a push keeps the bottle the other device added',
      r.ids, ['B1', 'B2', 'B3']);
  }

  {
    /* A REMOVAL ELSEWHERE MUST ARRIVE.

       BZ removed a bottle from the wishlist on his phone and it stayed on
       the desktop. On a local win the load skips every key that is not in
       the merge list — and the desktop always wins locally, because it
       always has some unsent change — so the account's wishlist was never
       taken. The rule protects unsent work, which is right; it protected
       keys this device had never touched, which is not. */
    const r = await run('removal', { 'bz-apps': { whisky: { testuid: {
        updated: 1000,
        wish: [{ name: 'Still wanted', at: '2026-09-01' }] } } } },
      async page => {
        await page.waitForTimeout(1400);
        return page.evaluate(async () => {
          // This device has unsent work of its OWN, on a different key.
          S.displayName = 'Changed here';
          save_();
          await new Promise(r2 => setTimeout(r2, 300));
          // and the account's wishlist loses an entry from elsewhere.
          firebase.database().ref('bz-apps/whisky/testuid')
            .update({ wish: [], updated: Date.now() });
          await new Promise(r2 => setTimeout(r2, 1200));
          return { wishHere: (S.wish || []).length,
                   nameKept: S.displayName };
        });
      });
    check('a wishlist removal elsewhere arrives', r.wishHere, 0);
    check('and this device\u2019s own unsent change survives',
      r.nameKept, 'Changed here');
  }

  await browser.close();

  notes.forEach(n => console.log('  \u00b7 ' + n));
  if (failures.length) {
    failures.forEach(f => console.log('  \u2717 ' + f));
    console.log('\n  \u2716 ' + failures.length + ' sync failure(s)\n');
    process.exit(1);
  }
  console.log('  \u2713 the sync cycle holds: push, load, reload, refuse');
})();
