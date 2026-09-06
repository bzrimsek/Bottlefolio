/* Two tabs of the app, open at once.
 *
 * BZ, 2026-09-03, from Diagnostics — the same line, hundreds of times:
 *   "another tab changed log; took its copy"
 *
 * The storage listener adopted another tab's change and called appLog to
 * say so; appLog writes kb.log straight into localStorage; the other tab
 * saw that as a change to adopt, logged it, wrote, and back it came. Two
 * tabs was a loop with no end, redrawing every screen each round — which is
 * why nothing on his PC could be clicked and the nav vanished on his phone.
 *
 * Playwright pages in one context share an origin, so they fire real
 * storage events at each other. That is the only way to see this at all.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const file = path.resolve(process.argv[2] || 'index.html');
const dir = path.dirname(file);
const failures = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const route = page => page.route('http://app.local/**', r => {
    const n = r.request().url().split('app.local/')[1].split('?')[0]
      || path.basename(file);
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const t = n.endsWith('.json') ? 'application/json'
      : n.endsWith('.js') ? 'text/javascript'
      : n.endsWith('.png') ? 'image/png' : 'text/html';
    return r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(f) });
  });

  const a = await ctx.newPage(); await route(a);
  await a.goto('http://app.local/' + path.basename(file));
  await a.waitForTimeout(1000);
  const b = await ctx.newPage(); await route(b);
  await b.goto('http://app.local/' + path.basename(file));
  await b.waitForTimeout(1000);

  // One change in tab A. Tab B should take it, once, and stop.
  await a.evaluate(() => {
    S.bottles = [{ id: 'B1', k: 'Ardbeg 10', status: 'open' }];
    save_();
  });
  await a.waitForTimeout(2500);

  const logs = k => k.evaluate(() => (S.log || [])
    .filter(l => /another tab changed/.test(l)).length);
  const la = await logs(a), lb = await logs(b);
  const gotIt = await b.evaluate(() => (S.bottles || []).map(x => x.id));

  if (gotIt.join() !== 'B1') {
    failures.push('the second tab did not take the change: ' + gotIt.join());
  }
  // One adoption, coalesced. The loop showed as dozens within seconds.
  if (lb > 2) failures.push('tab B logged ' + lb + ' adoptions, want 1');
  if (la > 0) failures.push('tab A logged ' + la + ' adoptions of its own write');

  // And it must be over: nothing more after a quiet second.
  const before = await logs(b);
  await a.waitForTimeout(1500);
  const after = await logs(b);
  if (after !== before) {
    failures.push('still logging after the change settled: '
      + before + ' -> ' + after);
  }

  // The app must still be usable in both, which is what the loop cost.
  for (const [name, page] of [['A', a], ['B', b]]) {
    const ok = await page.evaluate(() => {
      const nav = document.querySelector('nav').getBoundingClientRect();
      return nav.bottom <= window.innerHeight + 2 && nav.height > 10;
    });
    if (!ok) failures.push('tab ' + name + ': the nav is gone');
  }

  /* AND: two devices, each with a change, and neither loses the other's.
   *
   * Found in BZ's own logs, both showing "local wins" against an account
   * that was NEWER. A winner is the right question for a setting and the
   * wrong one for a list — replacing wholesale is what lost a bottle added
   * on the phone when the desktop had one unsent change of its own.
   *
   * Driven through the real merge on a real page rather than against the
   * helper, because the fault was in the WIRING: the helper never existed
   * and the call site chose a winner instead. */
  const merged = await a.evaluate(() => {
    const phone = [{ id: 'B001', k: 'a', status: 'open' },
                   { id: 'B999', k: 'phone-added', status: 'open' }];
    const desk = [{ id: 'B001', k: 'a', status: 'gone' },
                  { id: 'B777', k: 'desk-added', status: 'open' }];
    const out = L.mergeRecords('bottles', desk, phone, true);
    return {
      count: out.length,
      hasPhone: out.some(b => b.id === 'B999'),
      hasDesk: out.some(b => b.id === 'B777'),
      shared: (out.filter(b => b.id === 'B001')[0] || {}).status
    };
  });
  if (merged.count !== 3 || !merged.hasPhone || !merged.hasDesk) {
    failures.push('a merge lost a bottle: ' + JSON.stringify(merged));
  }
  if (merged.shared !== 'gone') {
    failures.push('the winner did not keep its own version of a shared '
      + 'record: ' + merged.shared);
  }

  await browser.close();
  if (failures.length) {
    failures.forEach(f => console.log('  \u2717 ' + f));
    console.log('\n  \u2716 ' + failures.length + ' two-tab failure(s)\n');
    process.exit(1);
  }
  console.log('  \u2713 two tabs: one adoption, no loop, both usable, '
    + 'and a merge keeps both devices\u2019 work');
})();
