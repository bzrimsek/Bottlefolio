/* Run the app script in a stub DOM.
 *
 * node --check only PARSES. A const used before its declaration parses
 * perfectly and throws the moment it runs — which is how "Cannot access
 * 'tab' before initialization" reached BZ's screen and stopped the whole
 * app from starting. Only executing it catches that class.
 */
const fs = require('fs');
const h = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const src = h.slice(h.indexOf("'use strict';"), h.lastIndexOf('</script>'));

const noop = () => {};
const stub = () => new Proxy({
  style: {}, dataset: {}, children: [], files: [], value: '',
  textContent: '', innerHTML: '', hidden: false,
  classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
  appendChild: noop, setAttribute: noop, addEventListener: noop,
  insertBefore: noop, removeChild: noop, focus: noop, click: noop,
  querySelectorAll: () => [], querySelector: () => null
}, {
  get: (t, k) => (k in t ? t[k]
    : (typeof k === 'string' && /^on/.test(k) ? null : stub())),
  set: (t, k, v) => { t[k] = v; return true; }
});

global.window = { addEventListener: noop, location: { href: '' },
  matchMedia: () => ({ matches: false, addEventListener: noop }) };
/* The stub used to return an element for EVERY lookup, so code that reads
 * a missing element read a stub instead of throwing — which is how
 * "Cannot read properties of null" reached BZ while this reported the app
 * ran fine. Ids that exist in the markup resolve; anything else is null,
 * the way a browser answers.
 */
const ids = new Set([...h.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
global.document = {
  getElementById: id => (ids.has(id) ? stub() : null),
  querySelector: sel => {
    const m = /^#([\w-]+)$/.exec(sel);
    if (m) return ids.has(m[1]) ? stub() : null;
    return stub();
  },
  querySelectorAll: () => [], createElement: () => stub(),
  addEventListener: noop, body: stub(), documentElement: stub() };
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
global.navigator = { serviceWorker: { register: () => Promise.resolve(),
  addEventListener: noop }, mediaDevices: {} };
global.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });

/* Running the script only proves it STARTS. The screens are drawn by
 * handlers nobody calls at load, which is how a detached input — every
 * $('#shopQ') returning null — passed this and failed on BZ's phone.
 * So: run it, then call each render the way opening a tab would.
 */
let api;
try {
  api = new Function(src + '; return typeof renderShop === "function" ? {'
    + ['renderShop', 'renderHome', 'renderShelf', 'renderFlights',
       'renderReference', 'renderHistory', 'renderPayline']
      .map(f => f + ': typeof ' + f + ' === "function" ? ' + f + ' : null')
      .join(', ') + '} : null;')();
} catch (e) {
  console.log('  \u2717 THE APP WOULD NOT START: ' + e.message);
  process.exit(1);
}
console.log('  \u2713 the app script runs');

if (api) {
  let bad = 0;
  Object.keys(api).forEach(name => {
    if (!api[name]) return;
    try { api[name](); } catch (e) {
      console.log('  \u2717 ' + name + ' THROWS: ' + e.message);
      bad++;
    }
  });
  if (bad) process.exit(1);
  console.log('  \u2713 every screen draws');
}
