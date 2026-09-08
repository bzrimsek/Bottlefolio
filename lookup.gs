/**
 * lookup.gs — Killer B's Bottle Tracker lookup backend.
 *
 * Two jobs, one deployment:
 *   1. doGet(?name=…)        one bottle, for the Shop and Add a bottle forms.
 *   2. doPost({mode:'flight'}) designs a flight against the shelf you send.
 *   3. fillMissingNotes()    a batch run that sources tasting notes for the
 *                            bottles that have none, and writes a CSV to
 *                            your Drive for review.
 *
 * WHY IT IS A SCRIPT AND NOT IN THE APP
 * An API key in a page served from GitHub Pages is a public API key. This
 * runs on Google's side, holds the key in Script Properties, and the app
 * only ever sees the JSON that comes back.
 *
 * SETUP
 *   1. script.google.com → New project → paste this in.
 *   2. Project Settings → Script Properties → add
 *        ANTHROPIC_KEY = sk-ant-…
 *   3. Deploy → New deployment → Web app
 *        Execute as: Me.   Who has access: Anyone with the link.
 *   4. Copy the /exec URL into the app: Info → Our data → Bottle lookup.
 *
 * COST
 * A lookup is roughly 500 input and 250 output tokens. On Haiku that is a
 * fraction of a cent; the 138 missing notes cost well under a dollar in
 * total, and every answer is cached in your catalog so no bottle is ever
 * paid for twice.
 *
 * WHAT IT WILL NOT DO
 * The prompt tells the model to return null rather than guess, and every
 * field is range-checked again in the app before it is shown. A blank field
 * is the correct answer when the truth is not known — an invented proof or a
 * plausible-sounding tasting note is worse than nothing, because you cannot
 * tell it from a real one afterwards.
 */

var MODEL = 'claude-haiku-4-5-20251001';
// Designing a flight is judgement across 300 bottles, not a fact lookup, so
// it gets the larger model. It runs once per flight, not once per bottle.
var FLIGHT_MODEL = 'claude-sonnet-4-6';
var API = 'https://api.anthropic.com/v1/messages';

/**
 * Design a flight. POSTed because the shelf goes with the request.
 *
 * The model is given ONLY what is open, plus the house rules, and is told to
 * pick from that list and nothing else. Everything it returns is checked
 * against the real shelf in the app before a drop of it is shown: a bottle
 * that is not there is dropped and reported, not poured. So the worst a bad
 * answer can do is produce a short flight and a list of rejects.
 */
/**
 * IS EVERYTHING HERE? Run this from the editor after any paste.
 *
 * Four files have to be in this project and doPost has to reach all of
 * them. Pasting one file over another has, more than once, quietly dropped
 * a line from doPost — and a dropped line does not break anything visibly:
 * the app asks for a mode, gets "unknown mode" back, and reports the
 * feature as broken rather than as absent.
 *
 * This checks the wiring only. It calls nothing and costs nothing.
 */
function probeWiring() {
  var need = [
    ['flight', 'designFlight', 'Code.gs (this file)'],
    ['candidates', 'suggestBottles', 'Code.gs (this file)'],
    ['recap', 'writeRecap_', 'recap.gs'],
    ['bottle', 'writeBottle_', 'recap.gs'],
    ['label', 'readLabel_', 'label.gs'],
    ['shelf', 'readShelf_', 'shelf.gs']
  ];
  var missing = [];
  need.forEach(function (row) {
    var there = false;
    try { there = (eval('typeof ' + row[1]) === 'function'); } catch (e) {}
    Logger.log((there ? 'OK   ' : 'GONE ') + row[0] + '  \u2192  ' + row[1]
      + '   (' + row[2] + ')');
    if (!there) missing.push(row[2]);
  });
  try {
    if (typeof labelShrink_ !== 'function') missing.push('label.gs');
  } catch (e) { missing.push('label.gs'); }

  if (!missing.length) {
    Logger.log('');
    Logger.log('ALL SIX MODES WIRED. Deploy: pencil on the existing '
      + 'deployment, Version = New version, Deploy.');
    return;
  }
  Logger.log('');
  Logger.log('MISSING: ' + missing.join(', ') + ' \u2014 that file is not in '
    + 'the project, or the paste dropped part of it. Do not deploy yet.');
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ error: 'bad request body' });
  }
  /* EVERY MODE THE APP CALLS, listed here so this file can be pasted whole
     without anybody having to remember what was added to it since.

     Each of these lives in its own file in the same project — writeRecap_
     and writeBottle_ in recap.gs, readLabel_ in label.gs, readShelf_ in
     shelf.gs — and each was added to this block by hand at the time. That
     is four chances to lose one on the next paste, and losing one is
     silent: the app gets "unknown mode" and reports the feature as broken
     rather than as missing.

     A mode whose file is not in the project throws a ReferenceError, which
     the catch below turns into a readable error rather than a 500. */
  try {
    if (body.mode === 'flight') return json(designFlight(body));
    if (body.mode === 'candidates') return json(suggestBottles(body));
    if (body.mode === 'recap') return json({ recap: writeRecap_(body) });
    if (body.mode === 'bottle') return json({ recap: writeBottle_(body) });
    if (body.mode === 'label') return json(readLabel_(body));
    if (body.mode === 'shelf') return json(readShelf_(body));
  } catch (err) {
    return json({ error: String(err) });
  }
  return json({ error: 'unknown mode' });
}

/**
 * Name actual bottles that would fill a described gap.
 *
 * "A finished Buffalo Trace" and "A Campbeltown Scotch" are descriptions,
 * not things you can search a shop for. This turns one into a handful of
 * real bottles with prices.
 *
 * It is told what BZ already owns in that corner, so it does not suggest
 * something already on the shelf, and it is told to stay near a budget
 * because the useless answer to every gap is an expensive famous bottle.
 */
function suggestBottles(req) {
  var shape = '{"bottles":[{"name":string,"distillery":string,"proof":number,'
    + '"price_usd":number,"why":string,"source":string,"confident":boolean}],'
    + '"note":string}';

  var system = [
    'You name real, currently purchasable whisky bottles that satisfy a',
    'described gap in somebody\'s collection.',
    'Return ONLY a JSON object matching: ' + shape,
    'No prose, no markdown fences.',
    '',
    'RULES:',
    '1. Three to five bottles, real ones that a US retailer stocks.',
    '2. NEVER suggest anything in the ALREADY OWNED list.',
    '2b. An empty bottles array is a valid and useful answer. A substitute',
    '    from another distillery is not — it will be rejected before it is',
    '    shown, so it wastes the answer.',
    '2b. For EVERY suggestion give a "find" value, which is how hard it is',
    '   to actually buy in the United States right now:',
    '     shelf     — a liquor store of any size has it most weeks',
    '     hunt      — real but you would ring round or wait for a drop',
    '     allocated — a lottery, a list, or secondary at a multiple',
    '   Judge the BOTTLING, not the brand: Weller Special Reserve is',
    '   allocated while Weller 12 is a different answer again. A bottle',
    '   somebody cannot buy is not a recommendation, it is a taunt, so say',
    '   which it is and let them decide.',
    '3. Prefer bottles under the stated budget, but NEVER return an empty',
    '   list because of price. If nothing fits the budget, return the',
    '   cheapest bottles that fit the GAP and let the app say they are over.',
    '   An empty answer tells somebody the thing does not exist; a dear one',
    '   tells them what it would cost, which is the question they asked.',
    '3b. An expensive famous bottle',
    '   is the useless answer to every question; a good cheap one that',
    '   actually fills the gap is the useful one.',
    '4. why is one line saying what THIS bottle brings to that gap,',
    '   specifically, not a general description of the whisky.',
    '5. price_usd is typical US retail. Use null if you do not know it',
    '   rather than guessing.',
    '5b. EVERY bottle needs a source: the retailer, review or distillery',
    '   page where you found it, as a domain. A bottle you cannot source',
    '   is a bottle you are inventing, and it will be dropped.',
    '5c. Do not assemble a name from real parts. Old Forester 1920 is real;',
    '   Old Forester 1920 Smoked Cinnamon Malt is not, and returning it is',
    '   worse than returning nothing, because somebody will go looking.',
    '6. note is one line if there is something worth saying about the gap',
    '   itself, otherwise an empty string.',
    '7. confident is true ONLY if you saw this exact bottle named on a page',
    '   you retrieved. If you are reasoning that it probably exists, it is',
    '   false. Half the value here is knowing which is which.'
  ].join('\n');

  var owned = (req.owned || []).slice(0, 60).join('; ');
  // The hard constraint, stated separately from the prose. A distillery and
  // its flagship bottle share a name, and asked in prose for "a finished
  // Buffalo Trace" the answer came back as an Old Forester, a 1792 and a
  // Russell's — three substitutes from three other houses.
  var must = [];
  if (req.dist) {
    must.push('The bottle MUST be made by ' + req.dist + '. Not a similar '
      + 'house, not a sister distillery, not something with a comparable '
      + 'profile. If ' + req.dist + ' does not make one, say so in note and '
      + 'return an empty bottles array rather than substituting.');
  }
  if (req.region) must.push('It MUST be from ' + req.region + '.');
  if (req.sub) must.push('It MUST be ' + req.sub + '.');

  var user = [
    'THE GAP: ' + (req.gap || ''),
    req.why ? 'WHY IT MATTERS: ' + req.why : '',
    must.length ? '\nHARD CONSTRAINTS:\n' + must.join('\n') : '',
    req.axis ? '\nDIMENSION: the person is exploring ' + req.axis
             + '. Every suggestion must move them along THAT axis.' : '',
    '\nPRICE: no budget. Return a spread from cheap to dear and give a '
    + 'price for every one, because the app sorts them cheapest first and '
    + 'a bottle with no price sinks to the bottom.',
    '',
    'ALREADY OWNED in this corner of the shelf, do not suggest these:',
    owned || '(nothing)'
  ].filter(String).join('\n');

  var res = UrlFetchApp.fetch(API, {
    method: 'post', contentType: 'application/json',
    headers: apiHeaders_(), muteHttpExceptions: true,
    payload: JSON.stringify({
      model: MODEL, max_tokens: 2000, system: system,
      messages: [{ role: 'user', content: user }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
    })
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('API ' + res.getResponseCode() + ': '
      + res.getContentText().slice(0, 200));
  }
  var data = JSON.parse(res.getContentText());
  var text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n').replace(/```json|```/g, '')
    // Citation markup leaked into 28 of 128 notes: the model annotates its
    // sources inside the values, and they render as literal angle brackets
    // on a tasting card. The source already has its own field.
    .replace(/<\/?cite[^>]*>/g, '')
    .trim();
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0) throw new Error('no JSON in the reply: ' + text.slice(0, 160));
  return JSON.parse(text.slice(a, b + 1));
}

function designFlight(req) {

  var shelf = (req.shelf || []).map(function (b) {
    return [b.n, b.pf + 'pf', b.t, b.f || '', b.r || '',
            b.a ? b.a + 'yr' : '', b.o, b.pr ? '$' + b.pr : ''].join(' | ');
  }).join('\n');

  var shape = '{"title":string,"variable":string,"premise":string,'
    + '"pours":[{"name":string,"note":string}],"why":[string],'
    + '"buy":{"name":string,"why":string}}';

  var system = [
    'You design blind whisky tasting flights for one specific shelf.',
    'Return ONLY a JSON object matching: ' + shape,
    'No prose, no markdown fences.',
    '',
    'HOUSE RULES:',
    (req.rules || []).map(function (r, i) { return (i + 1) + '. ' + r; }).join('\n'),
    '',
    'pours[].name MUST be copied EXACTLY from the shelf list, character for',
    'character. A name not on that list will be rejected and the flight will',
    'come up short. Order the pours as they should be served.',
    'pours[].note says what that pour is doing in the flight, in one line.',
    'why gives three or four short paragraphs on why it is built this way,',
    'in the voice of someone hosting the night.',
    'buy names ONE bottle NOT on the shelf that would improve the flight, and',
    'says what it would add. Omit buy entirely if nothing would.'
  ].join('\n');

  var user = [
    'THE VARIABLE: ' + (req.variable || '(choose one that this shelf supports)'),
    req.premise ? 'THE PREMISE: ' + req.premise : '',
    '',
    'THE SHELF (name | proof | type | finish | region | age | recognition | price).',
    'These are the ONLY bottles you may use:',
    shelf
  ].filter(String).join('\n');

  var res = UrlFetchApp.fetch(API, {
    method: 'post',
    contentType: 'application/json',
    headers: apiHeaders_(),
    payload: JSON.stringify({
      model: FLIGHT_MODEL,
      max_tokens: 2000,
      system: system,
      messages: [{ role: 'user', content: user }]
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('API ' + res.getResponseCode() + ': '
      + res.getContentText().slice(0, 200));
  }
  var data = JSON.parse(res.getContentText());
  var text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n').replace(/```json|```/g, '')
    // Citation markup leaked into 28 of 128 notes: the model annotates its
    // sources inside the values, and they render as literal angle brackets
    // on a tasting card. The source already has its own field.
    .replace(/<\/?cite[^>]*>/g, '')
    .trim();
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('no JSON in the reply');
  return JSON.parse(text.slice(a, b + 1));
}

/** One bottle, for the Add a bottle form. */
function doGet(e) {
  var name = (e && e.parameter && e.parameter.name) || '';
  if (!name || name.length < 3) return json({ error: 'name required' });
  try {
    return json(askAbout(name, false));
  } catch (err) {
    return json({ error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ask for one bottle. notesOnly narrows the answer to the four sensory
 * columns, which is what the batch run needs.
 */
/**
 * Headers for the Anthropic API.
 *
 * An identity-linked key — the "Workspace (legacy)" type — will not
 * authenticate without also naming the workspace it acts in, and fails with
 * a 400 saying anthropic-workspace-id is required. Set
 * ANTHROPIC_WORKSPACE_ID in Script Properties alongside the key; it is
 * ignored when absent, so a plain key still works untouched.
 */
function apiHeaders_() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ANTHROPIC_KEY');
  if (!key) throw new Error('ANTHROPIC_KEY is not set in Script Properties');
  var h = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  var ws = props.getProperty('ANTHROPIC_WORKSPACE_ID');
  if (ws) h['anthropic-workspace-id'] = ws.trim();
  return h;
}

function askAbout(name, notesOnly) {

  var shape = notesOnly
    ? '{"name":string,"colour":string|null,"nose":string|null,' +
      '"palate":string|null,"finish":string|null,"source":string|null}'
    : '{"name":string,"dist":string|null,"proof":number|null,' +
      '"sub":string|null,"age":number|null,"fin":string|null,' +
      '"msrp":number|null,"scar":string|null,"region":string|null,' +
      '"mash":string|null,' +
      '"colour":string|null,"nose":string|null,"palate":string|null,' +
      '"finish":string|null,"source":string|null}';

  var rules = [
    'Return ONLY the JSON object. No prose, no markdown fences.',
    'Use null for anything you do not actually know. Never estimate, never',
    'infer from a similar bottling, never write a plausible-sounding tasting',
    'note. A null is the correct answer when the fact is not established.',
    'proof is US proof (twice ABV), not ABV.',
    'sub is one of: bourbon, tennessee, rye, wheat, american single malt,',
    'scotch, irish, canadian, japanese, world, flavored, tequila.',
    'scar is one of: standard, batched, limited, exclusive.',
    'region applies to Scotch only: Islay, Speyside, Highland, Islands,',
    'Lowland, Campbeltown.',
    'colour, nose, palate and finish must come from the producer or a named',
    'published review, not from your impression of what it probably tastes',
    'like. Keep each under 90 characters.',
    'source names where the tasting notes came from, or null.',
    'mash is the grain bill EXACTLY as the producer publishes it, e.g.',
    '"75% corn, 21% rye, 4% malted barley". Most bottlings do not publish',
    'one and null is then the correct and common answer. Do NOT derive it',
    'from the category: a single malt does not publish "100% malted barley"',
    'and you must not write it, and a bourbon is not "51% corn" because the',
    'law requires at least that much. A partial bill is worth having as',
    'printed - "51% corn, rest undisclosed" is a real thing producers say.',
    'This field is written to a shared library as fact, so an invented',
    'grain bill is worse than a missing one.'
  ].join(' ');

  var body = {
    model: MODEL,
    // With server-side web search the reply carries the model's own
    // reasoning as well as the answer, and 1000 tokens can run out before
    // the closing brace of the JSON.
    max_tokens: 4000,
    system: 'You answer with a single JSON object matching: ' + shape + ' ' + rules,
    messages: [{ role: 'user', content: 'Whisky bottling: ' + name }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
  };

  var res = UrlFetchApp.fetch(API, {
    method: 'post',
    contentType: 'application/json',
    headers: apiHeaders_(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  }

  // Find the text blocks by type rather than by position: with web search on,
  // the response interleaves tool use and results around the answer.
  var data = JSON.parse(res.getContentText());
  var text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();
  var start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < 0) {
    // Say what actually came back. "no JSON in the reply" on its own cost a
    // round trip every time it happened during the enrichment work.
    throw new Error('no JSON in the reply. stop_reason='
      + (data.stop_reason || '?') + ' text=' + text.slice(0, 200));
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error('JSON did not parse: ' + text.slice(start, start + 200));
  }
}

/**
 * Call the single-bottle lookup once and print everything it returns.
 *
 * doGet has never actually run — every hour of enrichment went through
 * doPost, which is different code. Run this before assuming the endpoint is
 * broken; first contact has found a bug every time so far.
 */
function probeLookup() {
  var name = 'Springbank 15';
  var props = PropertiesService.getScriptProperties();
  Logger.log('key present: %s', !!props.getProperty('ANTHROPIC_KEY'));
  Logger.log('workspace id set: %s  (needed for an identity-linked key)',
    !!props.getProperty('ANTHROPIC_WORKSPACE_ID'));
  try {
    var out = askAbout(name, false);
    Logger.log('PARSED OK: %s', JSON.stringify(out));
  } catch (e) {
    Logger.log('THREW: %s', e);
  }
}

/**
 * Batch: source tasting notes for the bottles that have none.
 *
 * Paste the missing names into MISSING below (the app can hand you the list:
 * Info → Our data → Bottle lookup shows the count, and the browser console
 * command is printed there). Run this from the editor. It writes
 * killer-bs-notes.csv to your Drive root for review before anything is
 * merged, because nothing should reach the shelf unread.
 *
 * Apps Script caps a run at six minutes. LIMIT keeps each run inside that;
 * run it again and it picks up where it stopped, since already-done names
 * are skipped by re-reading the CSV.
 */
// Not a count. A bottle takes five or six seconds because the model
// searches the web for each one, so any fixed number is a guess that
// eventually exceeds the six-minute execution limit — and when it does,
// the whole batch is lost, because the file is only written at the end.
// Watch the clock instead and stop while there is still time to save.
var LIMIT = 200;              // an upper bound, not the real control
var BUDGET_MS = 4 * 60 * 1000;   // stop after four minutes
var SAVE_EVERY = 10;             // and write the file as we go
var OUT = 'killer-bs-notes.csv';

/**
 * Write tasting notes for every bottle that has none.
 *
 * Reads the shelf from the deployed data.json rather than a list pasted in
 * here — the list went stale the moment a bottle was added, and keeping it
 * in sync was a copy button in Settings that nobody should have to press.
 *
 * Notes come back with a source named. They are the model's reading of what
 * is published rather than somebody's own tasting, so they are written to a
 * review file first and marked as model-sourced when applied.
 */
// Write the file. Called as the run goes rather than only at the end, so
// an execution that is killed still leaves everything it managed.
function saveNotes_(rows) {
  var csv = rows.map(function (r) {
    return r.map(function (c) {
      return '"' + String(c).replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\n');
  var old = DriveApp.getFilesByName(OUT);
  while (old.hasNext()) old.next().setTrashed(true);
  DriveApp.createFile(OUT, csv, MimeType.CSV);
}

function fillMissingNotes() {
  var shelf = fetchJson_(SHELF_URL);
  var MISSING = Object.keys(shelf.catalog)
    .filter(function (k) { return !shelf.catalog[k].tn; })
    .map(function (k) { return shelf.catalog[k].name; });
  Logger.log(MISSING.length + ' bottles have no notes');

  var done = {};
  var files = DriveApp.getFilesByName(OUT);
  var rows = [];
  if (files.hasNext()) {
    var existing = Utilities.parseCsv(files.next().getBlob().getDataAsString());
    existing.forEach(function (r, i) {
      if (i === 0) return;
      done[r[0]] = true;
      rows.push(r);
    });
  }
  // The header was being written only when the file was new, and then read
  // back as data on the next run — so the finished CSV had no header at all.
  if (!rows.length || rows[0][0] !== 'name') {
    rows.unshift(['name', 'colour', 'nose', 'palate', 'finish', 'source']);
  }

  var started = Date.now();
  var count = 0;
  for (var i = 0; i < MISSING.length && count < LIMIT; i++) {
    // Leave time to write what has been done. Running out mid-batch used to
    // throw away every bottle in it.
    if (Date.now() - started > BUDGET_MS) {
      Logger.log('time budget reached, saving what is done');
      break;
    }
    var name = MISSING[i];
    if (done[name]) continue;
    try {
      var r = askAbout(name, true);
      rows.push([name, r.colour || '', r.nose || '', r.palate || '',
                 r.finish || '', r.source || '']);
      Logger.log('ok   ' + name);
    } catch (err) {
      // Record the failure rather than dropping it, so a rerun can see it.
      rows.push([name, '', '', '', '', 'ERROR: ' + err]);
      Logger.log('fail ' + name + ' — ' + err);
    }
    count++;
    // Save periodically as well, so an unexpected kill costs ten bottles
    // rather than everything since the run began.
    if (count % SAVE_EVERY === 0) saveNotes_(rows);
    Utilities.sleep(600);
  }

  saveNotes_(rows);

  // How many are still untouched, so a scheduled run knows when to stop.
  var left = 0;
  for (var k = 0; k < MISSING.length; k++) {
    if (!done[MISSING[k]]) left++;
  }
  left -= count;
  if (left < 0) left = 0;
  Logger.log('wrote ' + (rows.length - 1) + ' rows to ' + OUT
             + ' (' + count + ' this run, ' + left + ' still to do)');
  return left;
}


/* ═══════════════════════════════════════════════════════════════════
   ENRICHMENT — check the shelf against outside sources
   ═══════════════════════════════════════════════════════════════════

   Same source chain and the same trust rules the single-bottle lookup
   uses, run over the whole shelf. This is the "one resolver" rule: the
   batch run and the Shop lookup are the same code, not a copy that drifts.

   HOW TO RUN
     1. Paste this whole file into script.google.com (new project).
     2. Run  enrichProbe   from the dropdown at the top, click Run.
        Authorise when asked — it needs Drive (to write the sheet) and
        external requests (to reach the two sources).
     3. It opens a Google Sheet with the results. Read it.
     4. If it looks good, run  enrichFull. It works in batches to stay
        inside Apps Script's six-minute limit; just run it again until it
        says DONE. Progress is saved, so nothing is repeated.

   It never changes your shelf. It writes a sheet. When you have reviewed
   it, download as CSV and send it to me, and I apply it and ship.

   NO API KEY NEEDED for either source. ANTHROPIC_KEY is only used by the
   lookup and flight features above.
*/

var SHELF_URL = 'https://bzrimsek.github.io/Bottle-Tracker/data.json';
var WE_BASE = 'https://thewhiskyedition.com/api/whisky-reviews';
var PP_MCP = 'https://nqnigdqkcvrziwcbgily.supabase.co/functions/v1/mcp';
var SHEET_NAME = "Killer B's — enrichment review";

// Two thresholds, not one. No single cutoff separates "Green Spot
// Montelena" from "Green Spot Leoville Barton" — same two-word brand,
// nothing else, identical score. Anything in between is reported as WEAK
// with the matched name beside it, and is never treated as a fact.
var MATCH_FLOOR = 0.6;
var MATCH_SURE = 0.85;
var MIN_SHARED = 2;      // one word in common is a brand, not a match
var BATCH = 70;          // bottles per run, to stay under six minutes
// 700ms between every call was over-cautious: Pour Picks allows 60 a minute
// and we alternate two independent services, so each was seeing well under
// half its allowance. 350ms is still under one call per second per source.
var DELAY = 350;
// A second query only helps when the first found little. Asking again after
// 20 good results was pure cost.
var ENOUGH = 8;

var STOP = {the:1, a:1, whisky:1, whiskey:1, scotch:1, bourbon:1, single:1,
            malt:1, straight:1, kentucky:1, year:1, old:1, yr:1, aged:1,
            cask:1, edition:1, release:1, ml:1};

function normName_(s) {
  var w = String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
  var out = [];
  for (var i = 0; i < w.length; i++) if (w[i] && !STOP[w[i]]) out.push(w[i]);
  return out;
}

/**
 * Agreement between two names, measured against the SHORTER one.
 * Our names carry everything off the label while a source may hold three
 * words; dividing by the longer scored Booker's Beam House at 0.25 against
 * its own short form and would have thrown a correct match away.
 */
// Words that name a DIFFERENT bottling of the same whisky. If one name has
// one of these and the other does not, they are not the same liquid however
// well the rest of the words agree.
// Words that genuinely name a DIFFERENT bottling. Kept deliberately tight.
//
// The first version also held barrel, reserve, small, batch, finish and
// finished — words that appear inconsistently in almost every name, so one
// side having "Barrel Finish" and the other "Cask Finish" zeroed the pair.
// That took 147 of 148 near-misses to exactly 0.00, including
// "Angel's Envy Port Wine Barrel Finish" against "Angel's Envy Bourbon Port
// Cask Finish", which is very likely the same whiskey. A gate that rejects
// everything is not a gate.
//
// What stays: strength claims, and the wood or wine that IS the expression.
// Port against Madeira is a different bottle; Barrel against Cask is the
// same bottle described twice.
var STRENGTH_MARKERS = ['strength', 'proof', 'bonded', 'bond', 'overproof',
                        'navy', 'cask strength', 'barrelproof',
                        'sherry', 'oloroso', 'px', 'pedro', 'ximenez',
                        'port', 'madeira', 'sauternes', 'rum', 'cognac',
                        'armagnac', 'zinfandel', 'bordeaux', 'burgundy',
                        'peated', 'smoky', 'toasted', 'virgin', 'mizunara'];

function markersIn_(tokens) {
  var out = {};
  for (var i = 0; i < tokens.length; i++) {
    if (STRENGTH_MARKERS.indexOf(tokens[i]) >= 0) out[tokens[i]] = 1;
    // ANY token carrying a digit, not just a bare number: 100th, ab16 and
    // 2024 all name a specific bottling. Requiring a pure number let
    // "Green Spot Mitchel & Sons 100th Anniversary" match plain "Green Spot".
    if (/\d/.test(tokens[i])) out['#' + tokens[i]] = 1;
  }
  return out;
}

/**
 * Agreement between two names.
 *
 * Scored against the shorter name for recall, but with a hard gate first:
 * a number or an expression word present in one name and absent from the
 * other means a different bottling, whatever the rest of the words say.
 *
 * Without that gate, dividing by the shorter name made every SOURCE name
 * that is a PREFIX of ours a perfect match — "Maker's Mark" scored 1.00
 * against "Maker's Mark 101" and returned 90 proof for a 101-proof bottle.
 * The full-shelf run produced 69 proof conflicts that way, every one of them
 * at a 1.00 match, and every one of them wrong.
 */
function nameScore_(a, b) {
  var x = normName_(a), y = normName_(b);
  if (!x.length || !y.length) return 0;

  // The gate: distinguishing tokens must agree on both sides.
  var mx = markersIn_(x), my = markersIn_(y), k;
  for (k in mx) if (!my[k]) return 0;
  for (k in my) if (!mx[k]) return 0;

  var set = {}, shared = 0, i;
  for (i = 0; i < x.length; i++) set[x[i]] = 1;
  var seen = {};
  for (i = 0; i < y.length; i++) {
    if (set[y[i]] && !seen[y[i]]) { shared++; seen[y[i]] = 1; }
  }
  if (shared < MIN_SHARED) return 0;

  var lo = Math.min(x.length, y.length), hi = Math.max(x.length, y.length);
  var score = shared / lo;

  // A PREFIX match: every word of the shorter name appears in the longer,
  // and the longer has more to say. That is the same brand, a different
  // expression — "High West" against "High West Double Rye", or "Green Spot"
  // against "Green Spot Montelena". The marker gate above misses these
  // because the distinguishing word is a NAME rather than a number, and one
  // source record was matching four different High West bottles that way.
  // Never a certainty; capped into the band that gets reviewed by hand.
  if (score === 1 && hi > lo) return Math.min(0.75, MATCH_SURE - 0.05);
  return score;
}

/**
 * What to actually type into a search box.
 *
 * Our names carry the whole label — "Aberlour Double Cask Matured Batch
 * AB16 3-21 16 Year Old Single Malt Scotch Whisky", fourteen words. No
 * full-text search matches that, which is why the first probe returned one
 * hit in twenty and the one that hit, Ardbeg An Oa, was three words long.
 *
 * So search the way a person would: the distillery, which every bottle on
 * the shelf has and which is one to three words, then score everything that
 * comes back against the FULL name. High recall, and the scoring does the
 * precision.
 */
function queriesFor_(name, dist) {
  var out = [];
  if (dist) out.push(String(dist).replace(/\s+(Distillery|Distillers|Distilling|Company|Co\.?|Spirits|Whiskey|Whisky)$/i, ''));
  // Then the first couple of distinctive words of the name itself, which
  // catches a bottling filed under a brand rather than its distillery.
  var toks = normName_(name).slice(0, 2);
  if (toks.length) {
    var short = toks.join(' ');
    if (out.indexOf(short) < 0) out.push(short);
  }
  return out;
}

function fetchJson_(url, payload, extraHeaders) {
  var opt = {muteHttpExceptions: true, headers: {'Accept': 'application/json'}};
  if (extraHeaders) for (var k in extraHeaders) opt.headers[k] = extraHeaders[k];
  if (payload) {
    opt.method = 'post';
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  var r = UrlFetchApp.fetch(url, opt);
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
  return parseBody_(r.getContentText());
}

/**
 * Parse a response that may be plain JSON or Server-Sent Events.
 *
 * The Pour Picks endpoint is a STREAMABLE HTTP MCP server, so it answers in
 * SSE frames:
 *     event: message
 *     data: {"result":{...}}
 * Calling JSON.parse on that whole body throws, which is why every Pour
 * Picks lookup came back a miss — the endpoint was working perfectly and
 * the reply was being thrown away unread.
 */
function parseBody_(text) {
  var t = String(text || '').trim();
  if (!t) return {};
  if (t.charAt(0) === '{' || t.charAt(0) === '[') return JSON.parse(t);

  // SSE: take the LAST data: frame that parses. A stream may carry several,
  // and the final one holds the result.
  var lines = t.split(/\r?\n/), out = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf('data:') !== 0) continue;
    var chunk = line.slice(5).trim();
    if (!chunk || chunk === '[DONE]') continue;
    try { out = JSON.parse(chunk); } catch (e) { /* keep the last good one */ }
  }
  if (out === null) throw new Error('no JSON in response: ' + t.slice(0, 120));
  return out;
}

/** Source 1: WHISKY:EDITION. Free, official, CC-BY. Carries the notes. */
function weLookup_(name, sub, dist) {
  var queries = queriesFor_(name, dist);
  var best = null, bestScore = -1, seen = 0, tried = [];

  for (var q = 0; q < queries.length; q++) {
    var res;
    tried.push(queries[q]);
    try {
      res = fetchJson_(WE_BASE + '?per_page=25&q=' + encodeURIComponent(queries[q]));
    } catch (e) { return {miss: 'error: ' + e}; }
    var items = res.items || [];
    seen += items.length;
    for (var i = 0; i < items.length; i++) {
      var s = nameScore_(name, items[i].name || '');
      if (s > bestScore) { bestScore = s; best = items[i]; }
    }
    // Stop asking once there is a sure match, or once the first query has
    // returned plenty to score against.
    if (bestScore >= MATCH_SURE || seen >= ENOUGH) break;
    Utilities.sleep(DELAY);
  }

  if (!seen) return {miss: 'no hit for [' + tried.join('] [') + ']'};
  if (bestScore < MATCH_FLOOR) {
    return {miss: 'searched [' + tried.join('] [') + '], ' + seen
      + ' seen, best ' + bestScore.toFixed(2) + ': ' + (best.name || '')};
  }
  // The detail response is {ok, lang, item} — the record is one level down.
  // Reading the top level returned null every time, which is why the ceiling
  // test found 13 of 14 bottles and not one tasting note.
  var detail = {};
  if (best.slug && bestScore >= MATCH_FLOOR) {
    try {
      Utilities.sleep(DELAY);
      var d = fetchJson_(WE_BASE + '/' + encodeURIComponent(best.slug));
      detail = d.item || d;
    } catch (e) { detail = {}; }
  }
  var meta = detail.metadata || best.metadata || {};
  var notes = detail.tasting_notes || {};
  var out = {_source: 'whiskyedition', _match: bestScore, _name: best.name};
  if (meta.abv) out.proof = Math.round(Number(meta.abv) * 2 * 10) / 10;
  if (meta.age) out.age = meta.age;
  if (notes.nose) out.tn_nose = notes.nose;
  if (notes.palate) out.tn_palate = notes.palate;
  if (notes.finish) out.tn_finish = notes.finish;
  return out;
}

/** Source 2: Pour Picks, over its streamable HTTP endpoint. Bourbon-heavy. */
var _ppId = 0;
function ppCall_(tool, args) {
  _ppId++;
  var res = fetchJson_(PP_MCP,
    {jsonrpc: '2.0', id: _ppId, method: 'tools/call',
     params: {name: tool, arguments: args}},
    {'Accept': 'application/json, text/event-stream'});
  // Find the payload by BLOCK TYPE, never by position: the envelope order
  // is not guaranteed.
  var content = (res.result && res.result.content) || [];
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === 'text') {
      try { return JSON.parse(content[i].text); } catch (e) { return {}; }
    }
  }
  return {};
}

var PP_CATEGORY = {
  bourbon: 'bourbon', rye: 'rye', tennessee: 'tennessee', wheat: 'wheat',
  'american single malt': 'american_single_malt', scotch: 'scotch_single_malt',
  irish: 'irish', japanese: 'japanese', canadian: 'canadian',
  world: 'world_whisky', tequila: 'tequila'
};

function ppItems_(res) {
  return res.bottles || res.results || res.items || res.data
    || (res.data && res.data.bottles) || [];
}

function ppLookup_(name, sub, dist) {
  var queries = queriesFor_(name, dist);
  var cat = (sub && PP_CATEGORY[sub]) || null;
  var best = null, bestScore = -1, seen = 0, tried = [];

  for (var q = 0; q < queries.length; q++) {
    var args = {query: queries[q], limit: 25};
    if (cat) args.category = cat;
    tried.push(queries[q] + (cat ? '/' + cat : ''));
    var res;
    try { res = ppCall_('search_bottles', args); }
    catch (e) { return {miss: 'error: ' + e}; }
    var items = ppItems_(res);
    // A blended scotch is filed under scotch_blend, not single malt.
    if (!items.length && cat === 'scotch_single_malt') {
      try {
        args.category = 'scotch_blend';
        items = ppItems_(ppCall_('search_bottles', args));
      } catch (e) {}
    }
    // Still nothing? The category may be wrong for this bottle; ask without
    // it rather than concluding the database has never heard of it.
    if (!items.length && cat) {
      try {
        delete args.category;
        items = ppItems_(ppCall_('search_bottles', args));
      } catch (e) {}
    }
    seen += items.length;
    for (var i = 0; i < items.length; i++) {
      var s = nameScore_(name, items[i].name || '');
      if (s > bestScore) { bestScore = s; best = items[i]; }
    }
    if (bestScore >= MATCH_SURE || seen >= ENOUGH) break;
    Utilities.sleep(DELAY);
  }

  if (!seen) return {miss: 'no hit for [' + tried.join('] [') + ']'};
  if (bestScore < MATCH_FLOOR) {
    return {miss: 'searched [' + tried.join('] [') + '], ' + seen
      + ' seen, best ' + bestScore.toFixed(2) + ': ' + (best.name || '')};
  }
  // No detail call: the search record already carries everything, and
  // get_bottle came back empty. Fields taken from the real response rather
  // than guessed at:
  //   id, name, distillery, category, region, proof, age_years, price_usd,
  //   flavors, pairings, profile{body,sweetness,char_level}, description,
  //   popularity_tier, data_last_updated
  var full = best;
  var out = {_source: 'pourpicks', _match: bestScore, _name: full.name};
  if (full.proof) out.proof = full.proof;
  if (full.age_years) out.age = full.age_years;
  if (full.price_usd) out.msrp = full.price_usd;

  // Pour Picks has NO nose/palate/finish. What it has is flavour tags, a
  // body/sweetness/char profile and a one-line description — useful, but a
  // different kind of thing, so it is never written into a notes column.
  if (full.flavors && full.flavors.length) out.flavors = full.flavors.join(', ');
  if (full.description) out.pp_description = full.description;
  var pr = full.profile || {};
  if (pr.body || pr.sweetness || pr.char_level) {
    out.pp_profile = 'body ' + (pr.body || '?') + ', sweetness '
      + (pr.sweetness || '?') + ', char ' + (pr.char_level || '?')
      + ' (' + (pr.scale || '1-5') + ')';
  }
  // popularity_tier is a real measure of how widely known a bottle is —
  // far better than the obscurity I seeded from distillery footprint and
  // never corrected on any of the 325.
  if (full.popularity_tier) out.popularity_tier = full.popularity_tier;
  if (full.data_last_updated) out._fresh = full.data_last_updated;
  return out;
}

/**
 * Sort each finding into a bucket. CONFLICT is the one that justifies the
 * whole exercise: a stored value a source disagrees with — internally
 * consistent and wrong, the class no self-check can see. Ardbeg Wee Beastie
 * was exactly this.
 */
/**
 * Sort each finding into a bucket.
 *
 * PROOF IS NEVER A CONFLICT. The full-shelf run produced 69 proof conflicts
 * and every single one was the source being wrong: Maker's Mark 101 came
 * back as 90, Sazerac 100 Proof as 90, Kilchoman 100% Islay as 116. The
 * name gate above catches most of those now, but Blue Spot matched the
 * right record and still returned 92 for a 117-proof whiskey — so even a
 * correct match is not evidence about strength.
 *
 * Our proofs came off labels and off OHLQ, and four bottles that state
 * their proof in their own name confirmed ours against the source's every
 * time. So a disagreement about proof is reported as INFO, to be glanced
 * at, and can never be applied.
 */
function reconcile_(prod, found) {
  var rows = [], tol = {proof: 0.2, age: 0, msrp: 5};
  ['proof', 'age', 'msrp'].forEach(function (f) {
    var got = found[f];
    if (got === undefined || got === null || got === '') return;
    got = Number(got);
    if (!isFinite(got)) return;
    var have = prod[f];
    if (have === undefined || have === null || have === '') {
      rows.push(['FILL', f, '', got]);
    } else if (Math.abs(Number(have) - got) > tol[f]) {
      // Proof disagreements are the source's error, not ours. Reported,
      // never actionable.
      rows.push([f === 'proof' ? 'INFO' : 'CONFLICT', f, have, got]);
    } else {
      rows.push(['CONFIRM', f, have, got]);
    }
  });
  // Things only Pour Picks has. They are reported for review, never
  // silently merged, and none of them is a tasting note.
  if (found.flavors) rows.push(['INFO', 'flavors', '', found.flavors]);
  if (found.pp_profile) rows.push(['INFO', 'profile', '', found.pp_profile]);
  if (found.pp_description) {
    rows.push(['INFO', 'description', prod.notes || '', found.pp_description]);
  }
  if (found.popularity_tier) {
    // 5 is a household name, 1 is barely distributed. Our scale is the
    // other way round, so it is offered as a suggestion to check.
    var tier = found.popularity_tier;
    var suggest = tier >= 4 ? 'known' : (tier >= 2 ? 'niche' : 'obscure');
    if (suggest !== prod.obsc) {
      rows.push(['CONFLICT', 'obscurity', prod.obsc + ' (seeded)',
                 suggest + ' (tier ' + tier + ')']);
    } else {
      rows.push(['CONFIRM', 'obscurity', prod.obsc, suggest]);
    }
  }

  var hasNotes = !!prod.tn;
  ['colour', 'nose', 'palate', 'finish'].forEach(function (k) {
    var v = found['tn_' + k];
    if (!v) return;
    // A sourced note beats a prompt written for a flight card, but that is
    // BZ's call — offered, not taken.
    rows.push([hasNotes ? 'SUPERSEDE' : 'FILL', 'tn.' + k,
               (prod.tn && prod.tn[k]) || '', v]);
  });
  return rows;
}

function getSheet_() {
  var files = DriveApp.getFilesByName(SHEET_NAME);
  var ss = files.hasNext() ? SpreadsheetApp.open(files.next())
                           : SpreadsheetApp.create(SHEET_NAME);
  var sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(['bucket', 'bottle', 'field', 'stored', 'found', 'source',
                  'match', 'source_name', 'would_be']);
    sh.setFrozenRows(1);
  }
  return {ss: ss, sh: sh};
}

function runEnrich_(limit, label) {
  var shelf = fetchJson_(SHELF_URL);
  var keys = Object.keys(shelf.catalog).sort();

  var props = PropertiesService.getScriptProperties();
  var doneList = JSON.parse(props.getProperty('ENRICH_DONE') || '[]');
  var done = {};
  doneList.forEach(function (k) { done[k] = 1; });

  if (label === 'probe') {
    // Weighted the way the shelf is, so the hit rate means something:
    // ten American, five Scotch, five Irish, all from the ones with no
    // notes today.
    var pick = function (subs, n) {
      var out = [];
      for (var i = 0; i < keys.length && out.length < n; i++) {
        var p = shelf.catalog[keys[i]];
        if (!p.tn && subs.indexOf(p.sub) >= 0) out.push(keys[i]);
      }
      return out;
    };
    keys = pick(['bourbon', 'rye', 'tennessee'], 10)
      .concat(pick(['scotch'], 5), pick(['irish'], 5));
    done = {};
  }

  var s = getSheet_(), rows = [], processed = 0;
  for (var i = 0; i < keys.length && processed < limit; i++) {
    var key = keys[i];
    if (done[key]) continue;
    var prod = shelf.catalog[key];
    var any = false;
    var why = [];

    [['whiskyedition', weLookup_], ['pourpicks', ppLookup_]].forEach(function (pair) {
      Utilities.sleep(DELAY);
      var found = pair[1](prod.name, prod.sub, prod.dist);
      if (found.miss) { why.push(pair[0] + ': ' + found.miss); return; }
      any = true;
      var weak = found._match < MATCH_SURE;
      reconcile_(prod, found).forEach(function (r) {
        // A confident bucket on an unconfident match is a lie.
        rows.push([weak ? 'WEAK' : r[0], prod.name, r[1], r[2], r[3],
                   found._source, Math.round(found._match * 100) / 100,
                   found._name, weak ? r[0] : '']);
      });
    });
    // The reason goes in the sheet. A MISS that says "no hit" is coverage;
    // one that says "HTTP 400" is my bug, and they need opposite responses.
    if (!any) {
      rows.push(['MISS', prod.name, '', '', '', why.join(' | '), '', '', '']);
    }

    done[key] = 1;
    processed++;
  }

  // Sort so the rows needing a decision come first. Written in bottle order,
  // a CONFLICT would sit somewhere among 325 bottles and never be found.
  var ORDER = ['CONFLICT', 'WEAK', 'FILL', 'SUPERSEDE', 'INFO', 'CONFIRM', 'MISS'];
  rows.sort(function (a, b) {
    var d = ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]);
    return d !== 0 ? d : String(a[1]).localeCompare(String(b[1]));
  });
  if (rows.length) {
    s.sh.getRange(s.sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
    // A count per bucket in the log, so the shape of the run is visible
    // without opening the sheet.
    var tally = {};
    rows.forEach(function (r) { tally[r[0]] = (tally[r[0]] || 0) + 1; });
    var parts = [];
    ORDER.forEach(function (b) { if (tally[b]) parts.push(b + ' ' + tally[b]); });
    Logger.log('this batch: ' + parts.join(', '));
  }
  if (label !== 'probe') {
    props.setProperty('ENRICH_DONE', JSON.stringify(Object.keys(done)));
  }

  var remaining = 0;
  for (var j = 0; j < keys.length; j++) if (!done[keys[j]]) remaining++;
  Logger.log('processed ' + processed + ' bottles, ' + rows.length
             + ' rows written, ' + remaining + ' remaining');
  Logger.log(remaining ? 'RUN enrichFull AGAIN to continue, or enrichOvernight'
                         + ' to let it finish by itself'
                       : 'DONE — open the sheet: ' + s.ss.getUrl());
  // The count of what is left, so a scheduled run knows when to stop.
  return remaining;
}

/** Twenty bottles. Decides whether the full run is worth doing. */
function enrichProbe() {
  runEnrich_(20, 'probe');
}

/**
 * Show what each source ACTUALLY returns for one bottle, raw.
 *
 * Run this when a probe comes back mostly MISS. Guessing at a response
 * shape from a README is how the Pour Picks handler was written, and this
 * is the cheapest way to find out whether the guess was right.
 */
function probeRaw() {
  // Buffalo Trace: confirmed to hit BOTH sources at 1.00 in the ceiling
  // test, so anything missing from these records is a field-name problem,
  // not a coverage one.
  var name = 'Buffalo Trace';

  Logger.log('════ WHISKY:EDITION — search ════');
  var slug = null;
  try {
    var we = UrlFetchApp.fetch(
      WE_BASE + '?per_page=3&q=' + encodeURIComponent(name),
      {muteHttpExceptions: true, headers: {'Accept': 'application/json'}});
    Logger.log('HTTP %s', we.getResponseCode());
    var wj = parseBody_(we.getContentText());
    var it = (wj.items || [])[0] || {};
    Logger.log('first item keys: %s', Object.keys(it).join(', '));
    Logger.log('slug: %s', it.slug);
    slug = it.slug;
    Logger.log(JSON.stringify(it).slice(0, 700));
  } catch (e) { Logger.log('threw: %s', e); }

  // The notes live on the DETAIL record, not the list. If this call is
  // failing the list still looks fine and the notes silently never arrive,
  // which is exactly what the ceiling test showed.
  Logger.log('');
  Logger.log('════ WHISKY:EDITION — detail (where tasting_notes live) ════');
  if (!slug) {
    Logger.log('NO SLUG on the list item — the detail call can never happen.');
  } else {
    try {
      var d = UrlFetchApp.fetch(WE_BASE + '/' + encodeURIComponent(slug),
        {muteHttpExceptions: true, headers: {'Accept': 'application/json'}});
      Logger.log('HTTP %s', d.getResponseCode());
      var dj = parseBody_(d.getContentText());
      Logger.log('detail keys: %s', Object.keys(dj).join(', '));
      Logger.log('tasting_notes: %s', JSON.stringify(dj.tasting_notes));
    } catch (e) { Logger.log('threw: %s', e); }
  }

  Logger.log('');
  Logger.log('════ POUR PICKS — search ════');
  var id = null;
  try {
    var s = ppCall_('search_bottles', {query: name, limit: 3});
    Logger.log('top-level keys: %s', Object.keys(s).join(', '));
    var items = ppItems_(s);
    Logger.log('items found: %s', items.length);
    if (items.length) {
      Logger.log('first item keys: %s', Object.keys(items[0]).join(', '));
      Logger.log(JSON.stringify(items[0]).slice(0, 700));
      id = items[0].id;
    }
  } catch (e) { Logger.log('threw: %s', e); }

  Logger.log('');
  Logger.log('════ POUR PICKS — get_bottle (the full record) ════');
  if (!id) {
    Logger.log('no id from the search, so no detail call');
  } else {
    try {
      var b = ppCall_('get_bottle', {id: id});
      Logger.log('top-level keys: %s', Object.keys(b).join(', '));
      var rec = b.bottle || b;
      Logger.log('record keys: %s', Object.keys(rec).join(', '));
      // Print the whole thing. The field carrying the notes is in here
      // under a name I have been guessing at.
      Logger.log(JSON.stringify(rec).slice(0, 2500));
    } catch (e) { Logger.log('threw: %s', e); }
  }
}

/**
 * The ceiling test: how do these sources do on bottles they REALLY should
 * have?
 *
 * The first probe sampled bottles with no notes, alphabetically, and handed
 * itself three Barrell Craft Spirits and three Angel's Envy single barrels.
 * That measures the hardest corner of the shelf and says nothing about
 * whether the sources work at all.
 *
 * This picks the most widely distributed bottles instead: known, standard
 * release, no single barrels, ONE PER DISTILLERY so it cannot cluster, and
 * cheapest first, because cheap and standard is the best available proxy
 * for widely stocked.
 *
 * If these hit, the sources are fine and simply do not reach the bottles we
 * need. If these miss too, the sources are thin and we stop.
 */
function enrichCeiling() {
  var shelf = fetchJson_(SHELF_URL);
  var cat = shelf.catalog;

  var pool = [];
  Object.keys(cat).forEach(function (k) {
    var p = cat[k];
    if (p.obsc !== 'known' || p.scar !== 'standard') return;
    if (/single barrel|store pick|private select|barrel select/i.test(p.name)) return;
    if (p.name.split(/\s+/).length > 6) return;
    if (!p.msrp) return;
    pool.push(p);
  });
  pool.sort(function (a, b) { return a.msrp - b.msrp; });

  var wantPer = {bourbon: 4, scotch: 4, irish: 3, rye: 2, tennessee: 1};
  var got = {}, seenDist = {}, picked = [];
  for (var i = 0; i < pool.length; i++) {
    var p = pool[i];
    if (!wantPer[p.sub] || (got[p.sub] || 0) >= wantPer[p.sub]) continue;
    if (seenDist[p.dist]) continue;      // never two from one distillery
    seenDist[p.dist] = 1;
    got[p.sub] = (got[p.sub] || 0) + 1;
    picked.push(p);
  }

  Logger.log('Ceiling test — ' + picked.length
    + ' of the most widely stocked bottles:');
  Logger.log('');
  var hits = 0, withNotes = 0;
  for (var j = 0; j < picked.length; j++) {
    var prod = picked[j];
    Utilities.sleep(DELAY);
    var we = weLookup_(prod.name, prod.sub, prod.dist);
    Utilities.sleep(DELAY);
    var pp = ppLookup_(prod.name, prod.sub, prod.dist);
    if (!we.miss || !pp.miss) hits++;
    var notes = (!we.miss && (we.tn_nose || we.tn_palate))
             || (!pp.miss && (pp.tn_nose || pp.tn_palate));
    if (notes) withNotes++;
    Logger.log('  WE %s   PP %s   %s%s',
      we.miss ? 'miss' : 'HIT ' + we._match.toFixed(2),
      pp.miss ? 'miss' : 'HIT ' + pp._match.toFixed(2),
      prod.name.slice(0, 40), notes ? '   [notes]' : '');
  }
  Logger.log('');
  Logger.log(hits + ' of ' + picked.length + ' found; ' + withNotes
    + ' came with tasting notes');
  Logger.log(hits >= picked.length * 0.6
    ? 'The sources work. The question is only whether they reach the 138.'
    : 'Thin even on the easy bottles. Stop here — this is not the answer.');
}


/** The whole shelf, in batches. Run repeatedly until it says DONE. */
function enrichFull() {
  runEnrich_(BATCH, 'full');
}

/**
 * Run the rest of the shelf unattended.
 *
 * Apps Script kills a single execution at six minutes, which is why the
 * full run works in batches. But it can also schedule itself: this installs
 * a trigger that fires every five minutes, does a batch, and removes the
 * trigger once the shelf is finished. Start it and walk away.
 *
 * Progress is the same saved list enrichFull uses, so this picks up wherever
 * the manual runs stopped, and running enrichFull by hand afterwards is
 * harmless.
 */
function enrichOvernight() {
  // Never stack triggers — a second one would double every lookup.
  stopOvernight_();
  ScriptApp.newTrigger('enrichTick_')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('Scheduled. A batch runs every minute until the shelf is done,');
  Logger.log('then it stops itself. Close this tab; it runs on Google.');
  Logger.log('To stop early, run stopOvernight.');
  enrichTick_();            // do the first batch now rather than in 5 minutes
}

/**
 * One scheduled batch. Removes the schedule when there is nothing left.
 *
 * A minute-by-minute trigger will fire again while the previous batch is
 * still running, and two runs at once would double every lookup and race on
 * the saved progress. The lock makes the extra ticks no-ops.
 */
function enrichTick_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;          // already running; do nothing
  try {
    var left = runEnrich_(BATCH, 'full');
    if (left === 0) {
      stopOvernight_();
      Logger.log('Shelf finished — schedule removed.');
    }
  } finally {
    lock.releaseLock();
  }
}

function stopOvernight_() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'enrichTick_') {
      ScriptApp.deleteTrigger(all[i]);
    }
  }
}

/** Stop an overnight run early. Safe to call at any time. */
function stopOvernight() {
  stopOvernight_();
  Logger.log('Overnight schedule removed. Progress is kept.');
}

/**
 * Collapse the WEAK rows into one decision per bottle.
 *
 * A weak match produces a row per field — proof, flavors, profile,
 * description, age — but they are all consequences of ONE judgement: is
 * their record the same whisky as ours? 169 rows turned out to be 39
 * decisions, so the sheet was asking the same question 4.3 times.
 *
 * Writes a "Decisions" tab: our name, their name, the source, and what it
 * would affect. Put Y or N in the verdict column. Nothing is applied here —
 * this is the reading you do before anything is written.
 */
function buildDecisions() {
  var s = getSheet_();
  var last = s.sh.getLastRow();
  if (last < 2) { Logger.log('Nothing to review yet.'); return; }
  var vals = s.sh.getRange(2, 1, last - 1, 9).getValues();

  var by = {}, order = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (r[0] !== 'WEAK' || !r[1]) continue;
    var key = r[1] + ' \u2192 ' + r[7];
    if (!by[key]) {
      by[key] = { ours: r[1], theirs: r[7], source: r[5], match: r[6],
                  fields: [], notes: false };
      order.push(key);
    }
    if (by[key].fields.indexOf(r[2]) < 0) by[key].fields.push(r[2]);
    if (String(r[2]).indexOf('tn.') === 0) by[key].notes = true;
  }
  if (!order.length) { Logger.log('No weak matches to decide.'); return; }

  var ss = s.ss;
  var tab = ss.getSheetByName('Decisions');
  if (tab) ss.deleteSheet(tab);
  tab = ss.insertSheet('Decisions', 0);
  tab.appendRow(['verdict (Y/N)', 'your bottle', 'their record', 'source',
                 'match', 'carries notes', 'would affect']);
  tab.setFrozenRows(1);

  // Rows carrying tasting notes first: those are the ones worth the most,
  // and a run of easy rejections at the top wastes the attention.
  order.sort(function (a, b) {
    if (by[a].notes !== by[b].notes) return by[a].notes ? -1 : 1;
    return (by[b].match || 0) - (by[a].match || 0);
  });

  var out = order.map(function (k) {
    var d = by[k];
    return ['', d.ours, d.theirs, d.source, d.match,
            d.notes ? 'YES' : '', d.fields.join(', ')];
  });
  tab.getRange(2, 1, out.length, 7).setValues(out);
  tab.setColumnWidth(2, 300);
  tab.setColumnWidth(3, 300);
  tab.setColumnWidth(7, 260);

  var withNotes = order.filter(function (k) { return by[k].notes; }).length;
  Logger.log(out.length + ' decisions, down from ' + vals.filter(function (r) {
    return r[0] === 'WEAK'; }).length + ' weak rows.');
  Logger.log(withNotes + ' of them would bring tasting notes — read those first.');
  Logger.log('Mark Y or N in column A, then send the sheet.');
}

/**
 * Retry only the bottles that came back MISS, and keep everything already
 * found.
 *
 * Worth running after a matching change: the marker list was too broad and
 * took 147 of 148 near-misses to exactly 0.00, so bottles that had a real
 * candidate were discarded without ever being shown. Re-running the whole
 * shelf to improve a third of it is waste; this does only the third.
 *
 * Reads the MISS names out of the existing sheet, clears them from the done
 * list, and hands back to the normal batching. Run enrichFull or
 * enrichOvernight afterwards, or just run this and then enrichOvernight.
 */
function enrichRetryMisses() {
  var s = getSheet_();
  var last = s.sh.getLastRow();
  if (last < 2) { Logger.log('No sheet yet — run enrichProbe or enrichFull first.'); return; }

  var vals = s.sh.getRange(2, 1, last - 1, 2).getValues();
  var missNames = {}, keepRows = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === 'MISS') missNames[vals[i][1]] = 1;
  }
  var n = Object.keys(missNames).length;
  if (!n) { Logger.log('No misses to retry.'); return; }

  // Drop the MISS rows so the retry does not sit beside its own failure.
  var all = s.sh.getRange(2, 1, last - 1, 9).getValues();
  for (var j = 0; j < all.length; j++) {
    if (all[j][0] !== 'MISS') keepRows.push(all[j]);
  }
  // Delete the rows rather than blanking them. clearContent leaves the
  // sheet's dimension where it was, so max_row keeps reporting the old size
  // and anything counting rows reads it wrong — which is exactly what
  // happened when 819 was quoted as a row count and 761 was the truth.
  s.sh.deleteRows(2, last - 1);
  if (keepRows.length) {
    s.sh.getRange(2, 1, keepRows.length, 9).setValues(keepRows);
  }

  // Take those bottles off the done list so the batching picks them up.
  var shelf = fetchJson_(SHELF_URL);
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('ENRICH_DONE') || '[]');
  var kept = [];
  for (var k = 0; k < done.length; k++) {
    var prod = shelf.catalog[done[k]];
    if (!prod || !missNames[prod.name]) kept.push(done[k]);
  }
  props.setProperty('ENRICH_DONE', JSON.stringify(kept));

  Logger.log(n + ' missed bottles queued for another try.');
  Logger.log((done.length - kept.length) + ' removed from the done list; '
    + kept.length + ' findings kept.');
  Logger.log('Now run enrichOvernight, or enrichFull a few times.');
}

/**
 * Fill every missing note unattended, the same way the enrichment does.
 * Runs a batch a minute, and removes its own trigger when nothing is left.
 */
function notesOvernight() {
  stopNotes_();
  ScriptApp.newTrigger('notesTick_').timeBased().everyMinutes(1).create();
  Logger.log('Scheduled. Close the tab; it runs on Google.');
  notesTick_();
}

function notesTick_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;      // a tick arriving mid-batch is a no-op
  try {
    var left = fillMissingNotes();
    if (left === 0) {
      stopNotes_();
      Logger.log('All notes written — schedule removed.');
    }
  } finally {
    lock.releaseLock();
  }
}

function stopNotes_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'notesTick_') ScriptApp.deleteTrigger(t);
  });
}

/** Stop a notes run early. Safe at any time. */
function stopNotes() { stopNotes_(); Logger.log('Stopped. Progress is kept.'); }

/** Start the full run over from the beginning. */
function enrichReset() {
  PropertiesService.getScriptProperties().deleteProperty('ENRICH_DONE');
  var files = DriveApp.getFilesByName(SHEET_NAME);
  while (files.hasNext()) files.next().setTrashed(true);
  Logger.log('reset — sheet trashed, progress cleared');
}
