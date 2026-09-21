/* THE ENGINE, OUT OF index.html, WITHOUT A BROWSER.
 *
 * Everything on `L.` from `const L = {};` down to the STATE + RENDER banner
 * is pure, and three tools need it: the assertions, the wiring checks and
 * the nightly popular count. Each carried its own copy of these lines until
 * 2026-09-16; a third copy was about to be written, which is the moment to
 * have one.
 *
 *   const { L, source } = require('./engine.js')();
 */
const fs = require('fs');
const path = require('path');

const BANNER = '/* =====================================================================\n   STATE + RENDER';

/* AND BZ'S SHELF, WHICH IS THREE FILES AND NOT ONE. The harnesses drive
   the app with his bottles; the app's catalog is data.json merged with what
   only his account knows, which is what rebuildCatalog() does at runtime.
   A harness that sets S.bottles and not S.custom is testing a shelf 34
   products poorer than his, quietly.

     const { bottles, custom, flights } = require('./engine.js').shelf();
*/
module.exports.shelf = function (dir) {
  const here = dir || __dirname;
  const read = n => JSON.parse(fs.readFileSync(path.join(here, n), 'utf8'));
  const shelf = { bottles: read('bz-bottles.json'), custom: read('bz-custom.json') };
  /* Flights are optional: two harnesses do not draw one. */
  const f = path.join(here, 'bz-flights.json');
  shelf.flights = fs.existsSync(f) ? read('bz-flights.json') : [];
  return shelf;
};

module.exports = Object.assign(function loadEngine(file) {
  const html = fs.readFileSync(file || path.join(__dirname, 'index.html'), 'utf8');
  const start = html.indexOf('const L = {};');
  const end = html.indexOf(BANNER);
  if (start < 0 || end < 0) throw new Error('logic block not found in index.html');
  const m = { exports: {} };
  new Function('module', html.slice(start, end) + '\nmodule.exports = L;')(m);
  return { L: m.exports, source: html };
}, module.exports);
