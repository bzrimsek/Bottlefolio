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

module.exports = function loadEngine(file) {
  const html = fs.readFileSync(file || path.join(__dirname, 'index.html'), 'utf8');
  const start = html.indexOf('const L = {};');
  const end = html.indexOf(BANNER);
  if (start < 0 || end < 0) throw new Error('logic block not found in index.html');
  const m = { exports: {} };
  new Function('module', html.slice(start, end) + '\nmodule.exports = L;')(m);
  return { L: m.exports, source: html };
};
