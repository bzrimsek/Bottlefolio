/* THE FIREBASE SDK, ANSWERED LOCALLY AND SIGNED OUT.
 *
 *   require('./fake-sdk.js').offline(page)      // or a BrowserContext
 *
 * WHY THIS EXISTS, 2026-10-27. index.html used to fetch the SDK only when
 * somebody pressed Sign in, so eleven harnesses - browser, screens, render,
 * shots, seq, ios, answers, says, papers, twotab, update - never asked
 * gstatic for anything and ran with no network at all. Then the first press
 * turned out to be unfixable that way: a popup opened from a load callback is
 * refused by iOS Safari, so the auth half is now warmed at boot, and all
 * eleven would have started fetching 50KB from gstatic and calling
 * initializeApp against the PRODUCTION config on every page they open.
 *
 * Three things wrong with letting that happen, and the third is the one that
 * matters: it is slow, it builds a real app object pointing at BZ's live
 * database, and it makes eleven deliberately offline checks depend on
 * gstatic being up - a flaky red teaches you to ignore red.
 *
 * So they answer the request themselves. SIGNED OUT, with no user, which is
 * what those harnesses were already testing: the fake installs, FB.ready
 * goes true, no auth watcher is attached and no screen says anything
 * different. sync.js and admin.js route gstatic their own way, with a user,
 * because their scenarios are about what a signed-in device does.
 *
 * ONE DOOR, because eleven copies of a route block is how two of them end up
 * disagreeing about what the SDK is (rule 30d).
 */
const fs = require('fs');
const path = require('path');

/* The fake, read once. */
function fakeSource() {
  return fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');
}

/* Answer every gstatic request. The compat SDK arrives as three scripts and
   index.html loads app-compat first, so the fake is installed there and the
   other two are answered empty - they have nothing left to add. */
async function offline(target, opts) {
  const seed = (opts && opts.seed) || {};
  const user = (opts && opts.user) || null;
  await target.route('https://www.gstatic.com/**', route => {
    const url = route.request().url();
    let body = '';
    if (url.indexOf('firebase-app-compat') >= 0) {
      body = fakeSource()
        + '\n;window.firebase = window.makeFakeFirebase('
        + JSON.stringify(seed) + ',' + JSON.stringify({ user: user }) + ');';
    }
    return route.fulfill({ status: 200, contentType: 'text/javascript',
                           body: body });
  });
}

module.exports = { offline: offline };
