/* The Apps Script side has never had a gate. This is it.
 *
 * BZ, after a flight design that 404'd and a recap that came back as an
 * HTML error page: any more instances like this we can improve? The cause
 * was recap-handler.gs, an old scaffold that defines its OWN doPost - and
 * Apps Script keeps whichever loads last. Its version handles only
 * mode:'recap' and then calls handleExistingLookup_, which exists nowhere
 * in the project, so every other mode fell off the end.
 *
 * Nothing could have caught that. Every check built for this app reads
 * index.html, and the four files that actually answer the app had no
 * checker of any kind. Two shapes matter here and both are cheap:
 *
 *   a name defined twice   - one silently wins, and which one depends on
 *                            file order, which nobody controls
 *   a name called and never defined - a ReferenceError at runtime, which
 *                            the app reports as a broken feature rather
 *                            than an absent one
 *
 * It reads the files, calls nothing and costs nothing.
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
/* The four that make up the deployed project. recap-handler.gs is
   deliberately NOT here: it is the thing to delete, and listing it would
   make this check argue with its own advice. */
const FILES = ['lookup.gs', 'recap.gs', 'label.gs', 'shelf.gs'];

/* Every mode the app can ask for, and what has to answer it. Kept here so
   a mode added to the app without a handler fails this rather than
   failing in somebody's hand at a bar. */
const MODES = [
  ['flight', 'designFlight'],
  ['candidates', 'suggestBottles'],
  ['recap', 'writeRecap_'],
  ['guide', 'answerGuide_'],
  ['bottle', 'writeBottle_'],
  ['label', 'readLabel_'],
  ['shelf', 'readShelf_'],
  ['sheet', 'writeShelfSheet_']
];

const GLOBALS = new Set(['JSON', 'Object', 'Array', 'String', 'Number',
  'Math', 'Date', 'RegExp', 'Error', 'Set', 'Map', 'Promise', 'Logger',
  'UrlFetchApp', 'PropertiesService', 'ContentService', 'DriveApp',
  'SpreadsheetApp', 'Utilities', 'ScriptApp', 'LockService', 'MimeType',
  'CacheService', 'Session', 'parseInt', 'parseFloat', 'isFinite', 'isNaN',
  'encodeURIComponent', 'decodeURIComponent', 'eval', 'Boolean',
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof',
  'new', 'else', 'do', 'try', 'var']);

const failures = [];
const defined = {};
let all = '';

FILES.forEach(f => {
  const p = path.join(HERE, f);
  if (!fs.existsSync(p)) {
    failures.push(f + ' is missing from the project folder');
    return;
  }
  const t = fs.readFileSync(p, 'utf8');
  all += '\n' + t;
  (t.match(/^function\s+([A-Za-z_][\w]*)/gm) || []).forEach(m => {
    const n = m.replace(/^function\s+/, '');
    (defined[n] = defined[n] || []).push(f);
  });
  /* A LOCAL IS STILL DEFINED. `var pick = function (...)` inside
     runEnrich_ is a perfectly good function and the first version of this
     reported it missing, because it only counted top-level `function
     name`. Locals are collected separately: they cannot collide across
     files, so they count as defined without counting as duplicates. */
  (t.match(/(?:var|let|const)\s+([A-Za-z_][\w]*)\s*=\s*(?:function|\()/g)
    || []).forEach(m => {
      const n = m.replace(/^(?:var|let|const)\s+/, '')
        .replace(/\s*=[\s\S]*$/, '');
      if (!defined[n]) defined[n] = ['(local)'];
    });
});

/* 1. A NAME DEFINED TWICE. */
Object.keys(defined).forEach(n => {
  if (defined[n].length > 1 && defined[n].indexOf('(local)') < 0) {
    failures.push('"' + n + '" is defined in ' + defined[n].join(' AND ')
      + ' — Apps Script keeps only the one that loads last, and which that '
      + 'is depends on file order');
  }
});

/* 2. A NAME CALLED AND DEFINED NOWHERE.

      Strings and comments go first, because prose mentioning get_bottle is
      not a call. The first version of this stripper worked line by line and
      four names walked straight through it - verdict, get_bottle, position
      and detail, every one of them inside a Logger line or a column
      heading. Stripping has to happen across the WHOLE text, or a string
      that runs to the end of its line is only half removed. */
const code = all
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
const called = new Set();
const re = /(^|[^.\w$])([A-Za-z_][\w]*)\s*\(/g;
let m;
while ((m = re.exec(code))) called.add(m[2]);
[...called].forEach(n => {
  if (defined[n] || GLOBALS.has(n)) return;
  failures.push('"' + n + '" is called and defined in none of these files'
    + ' — a ReferenceError the app reports as a broken feature');
});

/* 2b. A HANDLER THAT ANSWERS AN OBJECT IS NOT WRAPPED IN ANOTHER ONE.
   BZ, 2026-09-28: every question Cooper was asked came back as the glossary,
   because answerGuide_ grew from returning a string to returning { said } and
   the router went on wrapping it - { said: { said: 'Aye...' } }. The app asks
   whether `said` is a string, found an object, and fell back without a word.

   Nothing could see it: this file knew the mode was wired, and browser.js
   stubs the service, so it only ever proved the app reads what the STUB sends.
   Neither compared the shape the service answers with the shape the app reads,
   which is the seam the fault lived in. */
{
  const routes = fs.readFileSync(path.join(HERE, 'lookup.gs'), 'utf8');
  const bodies = {};
  FILES.map(f => fs.readFileSync(path.join(HERE, f), 'utf8')).forEach(src => {
    /* A top-level function and everything up to the next one. */
    const re = /^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/gm;
    let m;
    while ((m = re.exec(src))) {
      const from = m.index;
      const next = src.slice(from + m[0].length).search(/^function\s/m);
      bodies[m[1]] = next < 0 ? src.slice(from)
        : src.slice(from, from + m[0].length + next);
    }
  });
  MODES.forEach(([mode, fn]) => {
    const body = bodies[fn] || '';
    /* Does it answer an object? */
    if (!/return\s*\{/.test(body)) return;
    const route = new RegExp("body\\.mode === '" + mode
      + "'\\) return json\\(([^;]*)\\);").exec(routes);
    if (!route) return;
    if (/^\s*\{/.test(route[1])) {
      failures.push(fn + ' answers an object and the router wraps it again ('
        + route[1].trim().slice(0, 48) + ') \u2014 the app reads the fields at '
        + 'the top level, so every answer arrives as the wrong shape');
    }
  });
}

/* 3. EVERY MODE THE APP ASKS FOR HAS SOMETHING TO ANSWER IT. */
/* AND THE PROJECT'S OWN LIST SAYS THE SAME. probeWiring reports what is
   wired to whoever is standing in the Apps Script editor, and it reported
   six of eight for a fortnight because its list was typed out separately. */
{
  const raw = fs.readFileSync(path.join(HERE, 'lookup.gs'), 'utf8');
  const block = /var MODES_ = \[([\s\S]*?)\];/.exec(raw);
  if (!block) {
    failures.push('lookup.gs has no MODES_ list, so probeWiring cannot '
      + 'know what this project answers');
  } else {
    const said = [...block[1].matchAll(/\['([a-z]+)',\s*'([A-Za-z_]+)'/g)]
      .map(m => m[1] + '>' + m[2]).sort().join(', ');
    const want = MODES.map(([m, f]) => m + '>' + f).sort().join(', ');
    if (said !== want) {
      failures.push('probeWiring answers for [' + said + '] and the app asks '
        + 'for [' + want + ']');
    }
  }
}

MODES.forEach(([mode, fn]) => {
  if (!defined[fn]) {
    failures.push('mode "' + mode + '" needs ' + fn + ' and nothing '
      + 'defines it');
  }
  /* Against the RAW source: the stripped copy has had every string
     emptied, so looking for mode === 'flight' in it can only ever fail.
     The first version did exactly that and reported all six modes
     missing on a file that wires all six. */
  if (!new RegExp("mode === '" + mode + "'").test(all)) {
    failures.push('doPost never handles mode "' + mode + '"');
  }
});

console.log('');
if (failures.length) {
  failures.forEach(f => console.log('  \u2717 ' + f));
  console.log('\n  \u2716 ' + failures.length + ' problem(s) in the Apps '
    + 'Script files\n');
  process.exit(1);
}
console.log('  \u2713 ' + FILES.length + ' Apps Script files: no name '
  + 'defined twice, nothing called that is missing, all '
  + MODES.length + ' modes wired\n');
