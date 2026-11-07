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
/* A LINE OF THE JOINED SCRIPT AS A LINE OF index.html. The blocks are
   joined with one newline each, so a joined line sits in the block whose
   span contains it, offset by where that block opened in the file. eslint's
   own findings already go through this arithmetic (b.line + x.line - 1);
   the two engine reports did not, and with a second script block one day
   they would be wrong by the length of the first. */
const blockLines = blocks.map(b => b.code.split('\n').length);
const fileLine = function (joined) {
  let n = joined;
  for (let i = 0; i < blocks.length; i++) {
    if (n <= blockLines[i]) return blocks[i].line + n - 1;
    n -= blockLines[i] + 1;
  }
  return blocks[0].line;
};

/* THE ENGINE'S OWN NAMES, which eslint cannot check. L is one object, so a
   call to a function that was never defined is a member access on a declared
   variable and no-undef says nothing - which is how L.syncList shipped past a
   green lint on 2026-10-06, called and undefined, after the script meant to
   define it wrote nothing (rule 16a). The app would have thrown on its first
   sync; what caught it was a DIFFERENT check noticing a different function
   had gone unwired, which is luck rather than a guard.

   COMMENTS AND STRINGS BLANKED FIRST. A name written in a sentence is not a
   call, and a check satisfied by its own explanatory comment is how two of
   these have gone vacuous before. */
const bare = all
  /* KEEPING THE NEWLINES OF WHAT IT BLANKS, because the two reports below
     count lines in this string and nothing else does. Collapsing a 10-line
     comment to one space moved every line after it: the engine's own banner
     comment is 2,000 lines up from the first function, so engine-undefined
     has been pointing thousands of lines above the call it found since the
     day it was written - right about there BEING a fault, wrong about where,
     which is the worst kind of right. */
  .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
  .replace(/^(\s*)\/\/.*$/gm, '$1')
const engineDef = new Set();
/* AND WHERE EACH ONE WAS DEFINED, because a name defined twice is a name
   whose first definition has been silently thrown away (2026-11-02). A new
   L.brandIndex replaced the existing one - the index of the brands registry
   L.brandOf reads - and took twelve identity assertions down with it; this
   check passed, and so did `no-dupe-keys`, because these are assignments to
   a plain object and not keys in a literal. Fifty-eight engine names carry
   `house` or `brand` and more arrive every build, so a collision is a matter
   of when. Not a style rule: whichever definition loses, something that used
   to work stops.
   A FUNCTION OR AN ARROW ONLY. Reassigning a plain field is a normal thing
   to do - a counter, a memo cache - so only a definition whose right-hand
   side opens a function counts, which is what a door is. */
const engineWhere = new Map();
const engineTwice = new Map();
let dm;
const defRe = /\bL\.([A-Za-z0-9_]+)\s*=[^=]/g;
while ((dm = defRe.exec(bare))) {
  engineDef.add(dm[1]);
  const rest = bare.slice(dm.index + dm[0].length - 1, dm.index + 200);
  if (!/^\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z0-9_$]+\s*=>)/.test(rest)) {
    continue;
  }
  const line = fileLine(bare.slice(0, dm.index).split('\n').length);
  if (engineWhere.has(dm[1])) {
    engineTwice.set(dm[1], engineWhere.get(dm[1]) + ' and ' + line);
  } else {
    engineWhere.set(dm[1], String(line));
  }
}
/* A CALL, not a read: data is declared and read the same way, so only a
   name followed by ( is something that has to exist as a function. */
const engineMissing = new Map();
let cm;
const callRe = /\bL\.([A-Za-z0-9_]+)\s*\(/g;
while ((cm = callRe.exec(bare))) {
  if (engineDef.has(cm[1]) || engineMissing.has(cm[1])) continue;
  engineMissing.set(cm[1],
    fileLine(bare.slice(0, cm.index).split('\n').length));
}

let problems = [];
engineMissing.forEach((line, name) => {
  problems.push({ line: line, rule: 'engine-undefined',
    text: 'L.' + name + ' is called and never defined' });
});
engineTwice.forEach((lines, name) => {
  problems.push({ line: Number(String(lines).split(' and ')[1]) || 1,
    rule: 'engine-defined-twice',
    text: 'L.' + name + ' is defined twice, on lines ' + lines
      + ' - the second one replaces the first' });
});
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

/* AND THE ADMIN PAGE, WHICH NOTHING LINTED AT ALL. 4,500 lines of its own
   screens, and the only thing that ever read them was admin.js driving
   the page - which reports a broken file as whatever goes wrong first.
   A string literal left open by an edit took the whole page out and
   came back as "Cannot set properties of null" four hundred lines away,
   in a test about removing a person.

   ITS OWN SCOPE, NOT THE APP'S. admin.html cannot see index.html's
   names - it fetches the engine and hangs it on A - so its globals are
   the platform's and its own top-level declarations, and nothing else.

   AND THE ENGINE DOORS IT CALLS ARE CHECKED AGAINST THE ENGINE. The
   page reaches the app's engine as `A.L.`, so a door that does not
   exist is the fault engine-undefined catches in the app, one file
   over. This is what rule 30d asks for when code moves to a new file:
   the guard follows it. */
{
  const aHtml = fs.readFileSync(path.join(__dirname, 'admin.html'),
    'utf8');
  const aBlocks = [];
  const aRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let am;
  while ((am = aRe.exec(aHtml))) {
    aBlocks.push({ code: am[1],
      line: aHtml.slice(0, am.index).split('\n').length });
  }
  if (!aBlocks.length) {
    problems.push({ file: 'admin.html', line: 1, rule: 'parse',
      text: 'no inline script found in admin.html' });
  }
  const aAll = aBlocks.map(b => b.code).join('\n');
  const aGlobals = {};
  Object.keys(globals).forEach(n => {
    if (globals[n] === 'readonly') aGlobals[n] = 'readonly';
  });
  for (const r of [/^function\s+([A-Za-z_$][\w$]*)/gm,
                   /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
                   /^class\s+([A-Za-z_$][\w$]*)/gm]) {
    let x;
    while ((x = r.exec(aAll))) aGlobals[x[1]] = 'writable';
  }
  const aConfig = Object.assign({}, config, { globals: aGlobals });
  aBlocks.forEach(b => {
    linter.verify(b.code, aConfig, { filename: 'admin.html' })
      .forEach(x => {
        problems.push({ file: 'admin.html',
          line: b.line + (x.line || 1) - 1,
          rule: x.ruleId || 'parse', text: x.message });
      });
  });
  /* Comments and strings blanked first, for the reason the app's own
     scan gives: a name written in a sentence is not a call. */
  const aBare = aAll
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
  const aSeen = new Set();
  let ac;
  const aCall = /\bA\.L\.([A-Za-z0-9_]+)\s*\(/g;
  while ((ac = aCall.exec(aBare))) {
    if (engineDef.has(ac[1]) || aSeen.has(ac[1])) continue;
    aSeen.add(ac[1]);
    problems.push({ file: 'admin.html',
      line: (aBlocks.length ? aBlocks[0].line : 1)
        + aBare.slice(0, ac.index).split('\n').length - 1,
      rule: 'engine-undefined',
      text: 'A.L.' + ac[1] + ' is called and the engine does not '
        + 'define it' });
  }
}

/* Anything already in the file on the day this was added stays allowed by
   name, and nothing new may join it (rule 28a): a check that stands
   between BZ and shipping gets switched off rather than satisfied. The
   list is empty because the file was clean when it went in. */
const ALLOWED = [];
problems = problems.filter(p =>
  ALLOWED.indexOf(p.rule + ':' + p.text) < 0);

if (!problems.length) {
  console.log('  \u2713 nothing undefined, defined twice, duplicated or '
    + 'unreachable in the app or the admin page');
  process.exit(0);
}
problems.slice(0, 40).forEach(p => {
  console.log('  \u2717 ' + (p.file || 'index.html') + ':' + p.line + '  ' + p.text
    + '  [' + p.rule + ']');
});
if (problems.length > 40) {
  console.log('  \u2026 and ' + (problems.length - 40) + ' more');
}
console.log('  \u2716 lint: ' + problems.length + ' problem(s)');
process.exit(1);
