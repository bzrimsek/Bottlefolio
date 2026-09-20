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
  ['bottle', 'writeBottle_'],
  ['label', 'readLabel_'],
  ['shelf', 'readShelf_'],
  ['sheet', 'writeShelfSheet_'],
  ['feedback', 'sendFeedback_']
];

const GLOBALS = new Set(['JSON', 'Object', 'Array', 'String', 'Number',
  'Math', 'Date', 'RegExp', 'Error', 'Set', 'Map', 'Promise', 'Logger',
  'UrlFetchApp', 'PropertiesService', 'ContentService', 'DriveApp',
  'SpreadsheetApp', 'Utilities', 'ScriptApp', 'LockService', 'MimeType',
  'CacheService', 'Session', 'MailApp', 'parseInt', 'parseFloat', 'isFinite', 'isNaN',
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

/* 3. EVERY MODE THE APP ASKS FOR HAS SOMETHING TO ANSWER IT. */
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
