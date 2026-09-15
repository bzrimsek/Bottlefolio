#!/usr/bin/env node
/* THE CHECK THAT WOULD HAVE CAUGHT BOTH.

   Two ReferenceErrors reached real users on 2026-09-10, in a build the
   eight-step gate passed: `arr` left behind by a removal, and a bare
   `user` in fbLoadAfterWipeCheck that stopped a shelf loading for anybody
   who followed an invite link. Neither is visible to anything the gate
   ran. A function defined and never called is visible in the source and
   consistency.js finds it; a variable that does not exist in its scope is
   not, and nothing looked.

   node --check will not do it either - both files parse perfectly. It
   takes a linter that builds scopes, so this is one.

   HOW IT READS THE APP. The script lives inside index.html, so it is cut
   out and linted as one module with the app's own globals declared: the
   browser's, the Firebase SDK's, and every top-level `function NAME` and
   `const NAME` the file declares, because they are all one scope at
   runtime and eslint cannot know that from a fragment.

   WHAT IT ASKS. no-undef and no-dupe-keys and the small set of rules that
   catch a fault rather than a style: an undefined variable, a duplicated
   object key, an unreachable statement, a case that falls through. Not
   formatting - this file has a house style and a linter is not the place
   to argue it.
*/
const fs = require('fs');
const path = require('path');
const { Linter } = require('eslint');

const file = path.join(__dirname, 'index.html');
const html = fs.readFileSync(file, 'utf8');

/* Every <script> without a src, in order, with the line it starts on so a
   report points at the real line of index.html. */
const blocks = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  blocks.push({ code: m[1], line: html.slice(0, m.index).split('\n').length });
}
if (!blocks.length) {
  console.log('  \u2716 lint: no inline script found in index.html');
  process.exit(1);
}

/* The app's own top-level names. They are one scope at runtime; a linter
   handed one block cannot know what another declared. */
const declared = new Set();
const all = blocks.map(b => b.code).join('\n');
/* TOP LEVEL ONLY - no leading whitespace. The first version allowed any
   indentation, so every function-LOCAL const in a 37,000-line file was
   declared a global: `user` and `arr` among them, which are precisely the
   two variables that crashed for real users. The check passed with both
   faults deliberately put back, which is the only reason I know it was
   worthless. A guard that cannot fail is not a guard. */
for (const r of [/^function\s+([A-Za-z_$][\w$]*)/gm,
                 /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
                 /^class\s+([A-Za-z_$][\w$]*)/gm]) {
  let x;
  while ((x = r.exec(all))) declared.add(x[1]);
}

const globals = {};
[...declared].forEach(n => { globals[n] = 'writable'; });
[/* the browser and the platform */
 'window', 'document', 'navigator', 'location', 'history', 'localStorage',
 'sessionStorage', 'console', 'setTimeout', 'clearTimeout', 'setInterval',
 'clearInterval', 'requestAnimationFrame', 'fetch', 'Blob', 'FileReader',
 'URL', 'Image', 'Audio', 'MouseEvent', 'Event', 'CustomEvent', 'DOMParser',
 'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'performance',
 'visualViewport', 'matchMedia', 'getComputedStyle', 'alert', 'confirm',
 'prompt', 'btoa', 'atob', 'crypto', 'AbortController', 'FormData',
 'TextDecoder', 'TextEncoder', 'BarcodeDetector', 'caches', 'indexedDB',
 /* the SDK, loaded from gstatic at runtime */
 'firebase', 'ZXing', 'module', 'require', 'process', 'globalThis'
].forEach(n => { globals[n] = 'readonly'; });

const linter = new Linter();
const config = {
  parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
  env: { browser: true, es2022: true },
  globals: globals,
  rules: {
    'no-undef': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-dupe-class-members': 'error',
    'no-unreachable': 'error',
    'no-fallthrough': 'error',
    'no-self-assign': 'error',
    'no-const-assign': 'error',
    'no-func-assign': 'error',
    'no-obj-calls': 'error',
    'no-sparse-arrays': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error'
  }
};

let problems = [];
blocks.forEach(b => {
  const msgs = linter.verify(b.code, config, { filename: 'index.html' });
  msgs.forEach(x => {
    problems.push({
      line: b.line + (x.line || 1) - 1,
      rule: x.ruleId || 'parse',
      text: x.message
    });
  });
});

/* Anything already in the file on the day this was added stays allowed by
   name, and nothing new may join it (rule 28a): a check that stands
   between BZ and shipping gets switched off rather than satisfied. The
   list is empty because the file was clean when it went in. */
const ALLOWED = [];
problems = problems.filter(p =>
  ALLOWED.indexOf(p.rule + ':' + p.text) < 0);

if (!problems.length) {
  console.log('  \u2713 nothing undefined, duplicated or unreachable in '
    + blocks.length + ' script block'
    + (blocks.length === 1 ? '' : 's'));
  process.exit(0);
}
problems.slice(0, 40).forEach(p => {
  console.log('  \u2717 index.html:' + p.line + '  ' + p.text
    + '  [' + p.rule + ']');
});
if (problems.length > 40) {
  console.log('  \u2026 and ' + (problems.length - 40) + ' more');
}
console.log('  \u2716 lint: ' + problems.length + ' problem(s)');
process.exit(1);
