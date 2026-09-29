/**
 * recap.gs — the written recap, for Bottlefolio's Taste screen.
 *
 * A companion to lookup.gs in the SAME project. It uses that file's json(),
 * apiHeaders_(), API and FLIGHT_MODEL, so there is nothing to configure and
 * no key to set: if bottle lookups work, this works.
 *
 * WHAT ARRIVES
 * Counts only, never the log. No dates, no log entries, nothing about who
 * was there, no note anybody wrote — the app strips all of that before it
 * posts. What is being asked for is the shape in a tally, which is the one
 * thing arithmetic cannot do: a month where every Irish whiskey was drunk
 * out somewhere is a real observation and no count states it.
 *
 *   { mode:'recap', span:'the last month',
 *     pours:16, different:11, flights:2, away:3, home:13,
 *     again:4, notForMe:1,
 *     whiskies:[{name,n}…], houses:[{name,n}…],
 *     places:[{name,n}…],  kinds:[{name,n}…], cities:[{name,n}…] }
 *
 * WHY SONNET
 * Same reasoning as designFlight: this is judgement across a shelf's worth
 * of habit, not a fact lookup. It runs when somebody presses a button, not
 * once per bottle, so the cost is a rounding error.
 *
 * WHAT IT WILL NOT DO
 * The prompt forbids inventing a whisky, a place or a number that is not in
 * the counts, and forbids reading the numbers back — the app already shows
 * those above it. An empty string is a valid answer: the app then says the
 * service could not write one, rather than showing an error as though it
 * were a recap.
 */

/* WHO HE IS, AND WHAT HE MAY SAY. The voice is BZ's brief; every rule under it
   is one this app already lived by, said to a model rather than to a person. */
var GUIDE_MODEL = 'claude-sonnet-5';

function guideRules_() {
  return [
    'You are Cooper: a Scottish cooper and blender, an old hand who has been',
    'making barrels and filling them for forty years. You are talking to one',
    'person about whisky, in a whisky app they own.',
    '',
    'VOICE:',
    '1. Scottish and plain-spoken, not a pantomime. The rhythm and the',
    '   vocabulary of a tradesman who knows his trade — "aye", "a dram",',
    '   "the wood gives that back" — never phonetic spelling, never "och",',
    '   never dialect written out as an accent.',
    '2. Short. Two to five sentences. You are talking, not writing an',
    '   article: no headings, no bullets, no markdown, no sign-off.',
    '3. Answer the question that was asked. If they ask WHY something is so,',
    '   explain the cause; do not read them a definition and stop.',
    '',
    'WHAT YOU MAY SAY:',
    '4. You have been given this app\'s ENTIRE reference below - every',
    '   definition, every piece of knowledge, the tasting vocabulary, how',
    '   each screen works, and the eight quiz questions it asks. Answer from',
    '   it. You do not need to look anything up in it; you have all of it.',
    '5. NEVER a whisky, a distillery, a person, a place, a proof, an age or',
    '   a price that is not in what you were given. Not one. If you want to',
    '   name an example and none was given, name none.',
    '6. If what you were given does not answer it, say so in a sentence and',
    '   stop. "I have nothing on that one, and I would rather say so than',
    '   guess" is a good answer. A guide who bluffs is worse than no guide.',
    '7. Never recommend a flavored whiskey. It is stock on a shelf; it is',
    '   not whisky.',
    '',
    'THE THINGS YOU ARE FOR:',
    '8. THE QUIZ. Entries marked [Quiz] are questions this app asks its own',
    '   user. Answer them properly, and say what makes the question',
    '   interesting rather than just settling it.',
    '9. HOW IT IS MADE. When you are given the steps, walk them in the order',
    '   they are given — that order is the process.',
    '10. TASTING. STEPS is the walk this app runs: pour, colour, nose, body,',
    '    palate, finish. Describe it in that order when asked, and offer to',
    '    walk it with them by saying they can tell you "taste one with me".',
    '11. WHETHER THEY WILL LIKE IT. If a VERDICT line is given, it is this',
    '    app\'s own judgement of their shelf, already made. Say it in your',
    '    own words and do not argue with it or add to it. If there is no',
    '    VERDICT line, you do not know their shelf — say so.'
  ].join('\n');
}

/* What he was handed, laid out for reading. */
function guideFacts_(r) {
  var out = [];
  if (r.verdict) out.push('VERDICT (this app\'s own, already decided): '
    + r.verdict, '');
  var entries = r.entries || [];
  if (entries.length) {
    out.push('ENTRIES:');
    entries.forEach(function (e) {
      out.push('- ' + e.term + ' [' + (e.where || '') + '] — ' + e.def);
    });
    out.push('');
  }
  var rows = r.rows || [];
  if (rows.length) {
    out.push('BOTTLES in their library that match:');
    rows.forEach(function (b) {
      var bits = [b.name];
      if (b.dist) bits.push('by ' + b.dist);
      if (b.age) bits.push(b.age + ' years');
      if (b.proof) bits.push(b.proof + ' proof');
      if (b.sub) bits.push(b.sub);
      if (b.fin) bits.push('cask: ' + b.fin);
      if (b.msrp) bits.push('$' + b.msrp);
      if (b.tasting) bits.push('(' + b.tasting + ')');
      out.push('- ' + bits.join(', '));
    });
    out.push('');
  }
  if ((r.steps || []).length) {
    out.push('STEPS of a tasting, in order: ' + r.steps.join(', '), '');
  }
  var said = r.said || [];
  if (said.length > 1) {
    out.push('WHAT HAS BEEN SAID so far, oldest first:');
    said.forEach(function (m) {
      out.push((m.who === 'you' ? 'THEM: ' : 'YOU: ') + m.text);
    });
    out.push('');
  }
  out.push('THEY ASK: ' + (r.asked || ''));
  return out.join('\n');
}

/**
 * Carry one turn of Cooper's conversation to the model and back.
 *
 * A RELAY AND NOT A BRAIN. The app sends the conversation so far and the list
 * of doors it is willing to open; this forwards both and returns either what
 * he said or which door he wants opened with what. Nothing is remembered here
 * between calls - the app carries the thread - so a dropped request costs one
 * turn and never a conversation, and two devices cannot get different ideas
 * about what was said.
 *
 * The doors run on the device, because that is where somebody's shelf is and
 * where it stays. What a door returns comes back through here on the next
 * call, and that is the whole of what travels about a person: what it took to
 * answer what they asked.
 *
 * Returns { said } when he has answered, { tool } when he wants a door, or
 * { said: '' } on any failure - which the app reads as "answer it yourself".
 */
function answerGuide_(r) {
  var body = r || {};
  var msgs = body.messages;
  if (!msgs || !msgs.length) {
    /* No conversation given: the older shape, one question and its facts. */
    msgs = [{ role: 'user', content: guideFacts_(body) }];
  }
  /* THE BOOK AS ITS OWN BLOCK, MARKED CACHED. It is the whole of the app's
     reference, identical on every call and a quarter of the cost of the
     conversation if it were paid for each time: written once per session,
     read at a tenth after that. The rules stay uncached and first, because a
     block before a cached one is part of what is cached. */
  var system = [{ type: 'text', text: guideRules_() }];
  if (body.book) {
    system.push({ type: 'text', text: String(body.book),
      cache_control: { type: 'ephemeral' } });
  }
  var ask = {
    model: GUIDE_MODEL,
    max_tokens: 700,
    system: system,
    messages: msgs
  };
  if ((body.tools || []).length) ask.tools = body.tools;

  var res = UrlFetchApp.fetch(API, {
    method: 'post',
    contentType: 'application/json',
    headers: apiHeaders_(),
    muteHttpExceptions: true,
    payload: JSON.stringify(ask)
  });

  if (res.getResponseCode() !== 200) {
    Logger.log('guide: API %s \u2014 %s', res.getResponseCode(),
      res.getContentText().slice(0, 300));
    return { said: '' };
  }

  var data = JSON.parse(res.getContentText());
  var blocks = data.content || [];

  /* A DOOR HE WANTS OPENED. Everything he said alongside it travels too, so
     the app can put the whole assistant turn back into the conversation -
     a tool_result that does not answer a tool_use is refused by the API. */
  var want = null;
  blocks.forEach(function (b) {
    if (b.type === 'tool_use' && !want) {
      want = { id: b.id, name: b.name, input: b.input || {} };
    }
  });

  var said = blocks
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join(' ')
    .replace(/<\/?cite[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (want) return { tool: want, blocks: blocks, said: said };
  return { said: said };
}

function writeRecap_(r) {
  /* LATELY (BZ, 2026-09-19): the same door, given sessions instead of counts,
     for the paragraph under Recent pours on Home. */
  var lately = !!(r && r.sessions);
  var system = lately ? LATELY_RULES_ : [
    'You write two or three sentences for somebody about their own whisky',
    'drinking over a stretch of time. You are given counts and nothing',
    'else.',
    '',
    'RULES:',
    '1. Say something the counts do not already say. A pattern, a contrast,',
    '   a change of habit, a thing they may not have noticed. The app has',
    '   already shown them the numbers directly above your sentences, so',
    '   reading them back is wasted space.',
    '2. Two or three sentences. No heading, no bullets, no preamble, no',
    '   sign-off, no markdown.',
    '3. Address them as "you". Write plainly. No tasting-note flourish, no',
    '   "it seems", no "appears to", no "interestingly".',
    '4. NAME THINGS. A bottle, a distillery, a bar, a city — if it is in',
    '   the counts, say it. "You went back to Laphroaig twice" is worth',
    '   reading; "you favoured peated expressions" is a horoscope. Be as',
    '   specific as the counts let you be.',
    '5. But NEVER name a whisky, a place, a house or a number that is not',
    '   in the counts below. Everything you say has to be traceable to a',
    '   line you were given — naming things is only worth doing if every',
    '   name is real.',
    '6. If the counts are thin, say so briefly and stop. Padding a quiet',
    '   month into a paragraph is worse than a short honest line.',
    '7. Return the sentences as plain text. Nothing else.'
  ].join('\n');

  var user = lately ? latelyFacts_(r) : [
    'THE STRETCH: ' + (r.span || 'this stretch'),
    '',
    recapFacts_(r)
  ].join('\n');

  var res = UrlFetchApp.fetch(API, {
    method: 'post',
    contentType: 'application/json',
    headers: apiHeaders_(),
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: FLIGHT_MODEL,
      max_tokens: 400,
      system: system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (res.getResponseCode() !== 200) {
    // Empty rather than an error string: the app checks the length and
    // tells them the service could not answer, which is the truth. An
    // error message shown as a recap would read as one.
    Logger.log('recap: API %s — %s', res.getResponseCode(),
      res.getContentText().slice(0, 200));
    return '';
  }

  var data = JSON.parse(res.getContentText());
  return (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join(' ')
    // Same citation strip the other handlers use: the model annotates its
    // sources inline and they render as literal angle brackets.
    .replace(/<\/?cite[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* WHAT SOMEBODY HAS BEEN DRINKING LATELY, from their last few sessions.
   Rewritten 2026-09-19 (BZ): reading the list back is not insight, and the
   first version said "tonight" of a glass logged hours after it was had. */
var LATELY_RULES_ = [
  'You write a short read, two sentences and three at most, on what somebody',
  'has been drinking lately - or over THE STRETCH, when one is named - from',
  'their own log: their sessions, most recent first, each bottle with what it',
  'is and how it tastes.',
  '',
  'RULES:',
  '1. RESTATING THE LOG IS THE FAILURE. The log sits directly under your',
  '   sentences: every bottle, every place, every count. A sentence that',
  '   names what they drank and stops has told them nothing they cannot',
  '   already see. Before you write a sentence, ask whether the list above',
  '   would do the same job. If it would, it is not worth printing.',
  '2. HOW TO OPEN IS TOLD TO YOU, under OPENING. Obey it.',
  '   OPENING: newest - the reader has just logged that session, and a',
  '   paragraph opening on an older habit reads as though nothing happened:',
  '   one man logged three pours, read the first line, and thought the app',
  '   had missed them. So the newest session is visible in the first clause -',
  '   as the thing you are making a point ABOUT, never as a list of it. Name',
  '   AT MOST ONE bottle from it, and make the point out of something the',
  '   lines below actually say about that bottle: the cask it was finished',
  '   in, its strength, its house, what it tastes of, and how that sits with',
  '   the sessions under it.',
  '   OPENING: blended - do NOT open on the newest session. Over a stretch',
  '   this long the newest evening is not the story, and opening on it made',
  '   every window read alike, because the newest session is the same one',
  '   whichever window is chosen. Open on what is true of the WHOLE stretch,',
  '   and mention the newest session only if it is part of that.',
  '   OPENING: arc - this is a long stretch, and what only a long stretch',
  '   can show is what CHANGED. Compare the sessions at the end of the list',
  '   against the ones at the start and say how the drinking moved:',
  '   a house or a style or a strength arrived, or fell away, or a run of one',
  '   thing gave way to another. Say plainly if it did not move. A thread',
  '   across the whole of somebody\'s drinking is a horoscope; a turn in it',
  '   is the only finding this window has that the narrower ones do not.',
  '3. THE THREAD IS THE PARAGRAPH, and it is not finished without one. What',
  '   runs through the stretch - a house they keep returning to, a cask, a',
  '   strength, a style, a flavor the notes keep reaching for, a place they',
  '   drink away from home - or the TURN, where the latest session breaks',
  '   from the ones before it. Say what it adds up to, not what it was.',
  '4. Name at most three bottles in total, and only where a name is the',
  '   evidence for the point you are making. A name that is not evidence is',
  '   the list again.',
  '5. NO TIME WORDS AT ALL. You are not told when anything happened, on',
  '   purpose: a pour is often logged long after it was drunk. Never write',
  '   tonight, today, this morning, this evening, last night, yesterday, the',
  '   day before, this week, last week, a weekday, a date, or "a big day".',
  '   The only order you may state is "most recently" and "before that".',
  '6. A flight is one planned tasting, not a habit, and ONLY a session that',
  '   lists "the flight" is one. Several bottles at home is a session, never',
  '   a flight. Mention a real flight by its title, if at all, and do not',
  '   treat its bottles as favourites.',
  '7. Name only bottles, places and flights given below, and state nothing',
  '   about a bottle that its line does not say. Never invent.',
  '8. NEVER COUNT ACROSS SESSIONS, and never place anything in a sequence:',
  '   no "the fourth Barton bottle", no "your third visit", no "the first',
  '   time". You are shown at most sixteen sessions and at most twelve pours',
  '   from each, so the list stops before you can see its end and any total',
  '   you reach is over a window with no edges. A tally here is a guess',
  '   wearing a number, and the app rejects a paragraph containing one.',
  '9. NEVER SAY HOW A BOTTLE CAME TO BE SOMEWHERE. You are told where a pour',
  '   happened, never who supplied it: a bar is not somewhere anybody',
  '   brought a bottle. No brought, carried or took.',
  '10. Write plainly, to "you". No tasting-note flourish, no hedging, no',
  '   heading, no markdown, no sign-off.',
  '11. If there is too little to find a thread in, say so in one sentence.'
].join('\n');

function latelyFacts_(r) {
  /* The recap names its stretch; Lately is simply lately. */
  var out = (r.span && r.span !== 'lately') ? ['THE STRETCH: ' + r.span, ''] : [];
  /* Which opening the app asked for. Told rather than inferred from the
     label: the service should not be parsing English to find out. */
  var OPENINGS = { blended: 1, arc: 1, newest: 1 };
  out.push('OPENING: ' + (OPENINGS[r.opening] ? r.opening : 'newest'), '');
  (r.sessions || []).forEach(function (s) {
    out.push((s.order || 'a session') + ', ' + s.where + ':');
    (s.flights || []).forEach(function (f) {
      out.push('  the flight "' + f.title + '" (' + f.n + ' pours)');
    });
    (s.pours || []).forEach(function (p) { out.push('  ' + p); });
  });
  out.push('', '(No dates or times are given, on purpose. Do not name any.)');
  return out.join('\n');
}

/** The counts as lines a model can read, and nothing else. */
function recapFacts_(r) {
  var out = [];
  out.push('pours: ' + (r.pours || 0));
  out.push('different whiskies: ' + (r.different || 0));
  if (r.flights) out.push('flights run: ' + r.flights);
  out.push('poured at home: ' + (r.home || 0)
    + ' — poured somewhere else: ' + (r.away || 0));
  if (r.again || r.notForMe) {
    out.push('would pour again: ' + (r.again || 0)
      + ' — would not: ' + (r.notForMe || 0));
  }
  out.push(recapList_('most poured', r.whiskies));
  out.push(recapList_('distilleries', r.houses));
  out.push(recapList_('places', r.places));
  out.push(recapList_('kinds of place', r.kinds));
  out.push(recapList_('cities', r.cities));
  return out.filter(String).join('\n');
}

function recapList_(label, rows) {
  if (!rows || !rows.length) return '';
  return label + ': ' + rows.slice(0, 8).map(function (x) {
    return x.name + (x.n > 1 ? ' (' + x.n + ')' : '');
  }).join(', ');
}

/**
 * Run this from the editor BEFORE deploying.
 *
 * A paragraph in the log means the deployment will work. Nothing in the log
 * means it will not, and the app would have shown you the same "does not
 * answer this yet" message without telling you why.
 */
function probeRecap() {
  var sample = {
    mode: 'recap', span: 'the last month',
    pours: 16, different: 11, flights: 2, away: 3, home: 13,
    again: 4, notForMe: 1,
    whiskies: [{ name: 'Connemara 12 Year Peated', n: 2 },
               { name: 'Glen Scotia 12 Year Old', n: 2 },
               { name: 'Laphroaig 10 Cask Strength', n: 2 }],
    houses: [{ name: 'Glen Scotia', n: 2 }, { name: 'Kilbeggan', n: 2 },
             { name: 'Laphroaig', n: 2 }],
    places: [{ name: 'The Bucket Shop, Atlanta, GA', n: 2 },
             { name: 'Jack Rose, Washington, DC', n: 1 }],
    kinds: [{ name: 'bar', n: 3 }],
    cities: [{ name: 'Atlanta', n: 2 }, { name: 'Washington', n: 1 }]
  };
  var out = writeRecap_(sample);
  Logger.log(out ? 'WORKS:\n\n' + out
                 : 'NOTHING CAME BACK — do not deploy. The lines above say why.');
}

/* ------------------------------------------------------------------ */
/* A BOTTLE, in the context of the shelf. mode:'bottle'.               */
/*                                                                     */
/* The app can already say "one of 12 from Laphroaig". What it cannot  */
/* say is that this is the fourth Cairdeas, or that it is the one that */
/* tests whether you like the wood or the spirit, or that it completes */
/* a run — those need the whole picture held at once, which is the one */
/* thing counting cannot do.                                           */
/*                                                                     */
/* What arrives is the bottle and everything owned from its house. No  */
/* prices, no notes, no provenance: where a bottle came from is a fact */
/* about the owner, and this is a question about the whisky.           */
/* ------------------------------------------------------------------ */

function writeBottle_(r) {
  var b = r.bottle || {};
  /* A WHISKY THEY DO NOT OWN is read as a prospect: what it WOULD be here
     (BZ, 2026-09-19). Everything else about the job is the same. */
  var system = r.prospect ? [
    'You write ONE or TWO sentences about a whisky somebody is looking at',
    'and does NOT own, given what is already on their shelf.',
    '',
    'RULES:',
    '1. Say what it WOULD BE on their shelf: the position it would take in',
    '   its house, the comparison it would make possible against a bottle',
    '   they already have, or the gap it would fill. Write "would", never',
    '   "your" as though they had it.',
    '2. The most interesting thing is usually a PAIR it would complete: two',
    '   bottles differing in one way and otherwise the same. Name both.',
    '3. If their shelf already covers what it offers, say so plainly. That',
    '   is worth more than a reason to buy it.',
    '4. NEVER state a fact not in the data below - no history, no release',
    '   years, no awards, no tasting notes, no prices.',
    '5. One or two sentences, to "you", plainly. No heading, no preamble,',
    '   no markdown, no sign-off.',
    '6. Return the sentences as plain text and nothing else.'
  ].join('\n') : [
    'You write ONE or TWO sentences about what a whisky is, to the person',
    'who owns it, given what else is on their shelf.',
    '',
    'RULES:',
    '1. Say what this bottle IS relative to the others from its house. A',
    '   series and its position ("your fourth Cairdeas"), a run it',
    '   extends, a comparison it makes possible, the one variable it',
    '   changes against a bottle they already have.',
    '2. The most interesting thing is usually a PAIR: two bottles that',
    '   differ in one way and are otherwise the same. Name both.',
    '3. NEVER state a fact not in the data below — no history of the',
    '   distillery, no release years, no awards, no tasting notes. If you',
    '   are not certain from what you were given, do not say it.',
    '4. One or two sentences. No heading, no preamble, no markdown.',
    '   Address them as "you". Plain language.',
    '5. If there is nothing interesting to say, say one plain sentence',
    '   about where it sits and stop. Do not invent significance.',
    '6. Return the sentences as plain text and nothing else.'
  ].join('\n');

  var lines = [];
  lines.push('THE BOTTLE: ' + b.name);
  lines.push('  distillery: ' + (b.distillery || 'unknown')
    + ' \u00b7 proof: ' + (b.proof || '?')
    + ' \u00b7 age: ' + (b.age || 'none stated')
    + ' \u00b7 finish: ' + (b.finish || 'none')
    + ' \u00b7 category: ' + (b.category || '?')
    + (b.region ? ' \u00b7 region: ' + b.region : ''));
  lines.push('');
  lines.push('EVERYTHING THEY OWN FROM THAT DISTILLERY:');
  (r.fromTheSameHouse || []).forEach(function (x) {
    lines.push('  - ' + x.name + ' \u00b7 ' + (x.proof || '?') + ' proof'
      + (x.age ? ' \u00b7 ' + x.age + ' years' : '')
      + (x.fin ? ' \u00b7 ' + x.fin + ' finish' : ''));
  });
  lines.push('');
  if (r.strongestOfItsHouse) lines.push('It is the strongest of them.');
  if (r.oldestOfItsHouse) lines.push('It is the oldest of them.');
  if (r.onlyOfItsFinish) {
    lines.push('Nothing else on the shelf carries that finish.');
  } else if (r.sameFinishCount) {
    lines.push(r.sameFinishCount + ' others share that finish.');
  }
  lines.push('Their shelf holds ' + (r.shelfSize || '?') + ' whiskies.');

  var res = UrlFetchApp.fetch(API, {
    method: 'post', contentType: 'application/json',
    headers: apiHeaders_(), muteHttpExceptions: true,
    payload: JSON.stringify({
      model: FLIGHT_MODEL, max_tokens: 300,
      system: system,
      messages: [{ role: 'user', content: lines.join('\n') }]
    })
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('bottle: API %s \u2014 %s', res.getResponseCode(),
      res.getContentText().slice(0, 200));
    return '';
  }
  return (JSON.parse(res.getContentText()).content || [])
    .filter(function (x) { return x.type === 'text'; })
    .map(function (x) { return x.text; })
    .join(' ').replace(/<\/?cite[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Run from the editor before deploying. BZ's real Cairdeas case. */
function probeBottle() {
  var sample = {
    mode: 'bottle',
    bottle: { name: 'Laphroaig Cairdeas 2026', distillery: 'Laphroaig',
              proof: 104.6, age: null, finish: 'Madeira',
              category: 'scotch', region: 'Islay' },
    fromTheSameHouse: [
      { name: 'Laphroaig Cairdeas Cask Favourites 10 Year Old', proof: 104.8 },
      { name: 'Laphroaig Cairdeas Pedro Ximinez Cask 2021', proof: 117.8,
        fin: 'PX' },
      { name: 'Laphroaig Cairdeas Warehouse 1', proof: 104.4 },
      { name: 'Laphroaig Cairdeas White Port & Madeira Cask', proof: 104.6,
        fin: 'Port' },
      { name: 'Laphroaig 10 Year Cask Strength', proof: 117.2, age: 10 },
      { name: 'Laphroaig 10 Year Old', proof: 80, age: 10 }
    ],
    sameFinishCount: 3, sameCategoryCount: 81,
    strongestOfItsHouse: false, oldestOfItsHouse: false,
    onlyOfItsFinish: false, shelfSize: 325
  };
  var out = writeBottle_(sample);
  Logger.log(out ? 'WORKS:\n\n' + out : 'NOTHING CAME BACK \u2014 do not deploy.');
}
