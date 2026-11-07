/* THE FLIGHT CARDS DOCUMENT, READ BACK INTO THE APP.
 *
 * BZ keeps his flights in a Word document - the pours, the proofs, the
 * reasoning, what happened when it was run - and the app keeps them in
 * customFlights. The two drifted: on 2026-09-20 the document held three
 * flights the app did not (Where's Scotty?, Well Well Well What Do We Have
 * Here?, To PX or Not to PX?) and one title read differently. He asked for
 * this to be repeatable rather than a one-off read, so that he can hand
 * over the same file again and be told what is new.
 *
 *   node cards.js <file.docx>            say what differs
 *   node cards.js <file.docx> --write    add the flights the app lacks
 *
 * It never edits a flight the app already has. A cast that has changed is
 * reported and left alone: the app is where he edits them, and a tool that
 * overwrites his edits from a document is a tool that loses work.
 *
 * No dependencies: a .docx is a zip, and the only member wanted is
 * word/document.xml.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---- the document ---------------------------------------------------- */

/* Enough zip to find one file. The central directory is at the end, after
   a header whose signature we scan back for. */
function unzipOne(buf, want) {
  let end = -1;
  for (let i = buf.length - 22; i >= 0 && end < 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) end = i;
  }
  if (end < 0) throw new Error('not a zip: no end-of-directory record');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad directory');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const at = buf.readUInt32LE(p + 42);
    if (name === want) {
      const method = buf.readUInt16LE(at + 8);
      const nLen = buf.readUInt16LE(at + 26);
      const xLen = buf.readUInt16LE(at + 28);
      const size = buf.readUInt32LE(p + 24);
      const from = at + 30 + nLen + xLen;
      const raw = buf.slice(from, from + buf.readUInt32LE(p + 20));
      return method === 0 ? raw : zlib.inflateRawSync(raw, { maxOutputLength: size * 2 + 4096 });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(want + ' is not in this file');
}

function paragraphs(xml) {
  return xml.split(/<w:p[ >]/).slice(1).map(p => {
    const t = (p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [])
      .map(x => x.replace(/<[^>]+>/g, '')).join('');
    return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").trim();
  });
}

/* ---- the flights inside it ------------------------------------------- */

/* A page opens with its title in capitals and a tag line that counts the
   pours. Everything after that is positional, which is why the tag line is
   what identifies a page rather than the title: a title can be anything. */
const TAG = /^\d+\s+(?:core|pours)\b.*·/i;
/* A TITLE IS SHOUTED, BUT A LABEL CAN KEEP ITS OWN SPELLING. "WHAT GRAIN
   ON YOUR BiB?" is a card title and is not equal to its own uppercase,
   because BiB is how a bottled-in-bond is written - so an == test against
   toUpperCase() dropped that whole flight and the tool then reported it as
   a flight only the app had (2026-10-10). Count the lowercase instead: a
   title has a letter or two of them, prose has dozens. */
const SHOUTED = t => /[A-Z]/.test(t) && (t.match(/[a-z]/g) || []).length <= 2;
const HEAD = ['#', 'Bottle', 'Proof'];

function parseCards(lines) {
  const flights = [];
  for (let i = 1; i < lines.length; i++) {
    if (!TAG.test(lines[i])) continue;
    const title = lines[i - 1];
    if (!title || title.length < 4 || !SHOUTED(title)) continue;
    const f = { title: title, tag: lines[i], premise: '', why: [],
                room: '', prereq: '', cards: [], ext: [] };
    let j = i + 1;
    for (; j < lines.length && lines[j] !== HEAD[0]; j++) {
      const l = lines[j];
      if (/^PREREQ\b/.test(l)) f.prereq = l;
      else if (/^FROM THE ROOM:/.test(l)) f.room = l;
      else if (!f.premise && l.length > 40) f.premise = l;
    }
    /* The header row, then eight lines per pour. A paired flight letters
       its pours 1a, 1b, 2a rather than A, B, C - AND SOME CARDS NUMBER
       THEM 1, 2, 3, starting at 0 where pour zero is the wine itself
       rather than a whisky. Without the bare number those cards parsed a
       title and no pours at all, which read as a flight the document had
       emptied (2026-10-10, Take Your PX and Where Does Peat Live). */
    j += 8;
    while (j + 3 < lines.length && /^(?:[A-L]|\d+[a-z]?)$/.test(lines[j])) {
      f.cards.push({ letter: lines[j], bottle: lines[j + 1],
                     proof: lines[j + 2], wood: lines[j + 3] });
      j += 8;
    }
    for (; j < lines.length && !TAG.test(lines[j]); j++) {
      if (/^WHY IT IS BUILT THIS WAY$/.test(lines[j])) {
        for (j++; j < lines.length && !/^EXTENDING THE NIGHT$/.test(lines[j])
             && !TAG.test(lines[j]); j++) {
          if (lines[j].length > 30) f.why.push(lines[j]);
        }
      }
      if (/^EXTENDING THE NIGHT$/.test(lines[j])) {
        /* Three header cells, then rows of three: the bottle or bottles,
           the proof, and what it adds. The MIDDLE cell is what says this is
           still a row - a proof, or two of them where the cell names two
           bottles. Without that test the closing instruction paragraph
           reads as a bottle name. */
        const PROOF = /^[\d.]+(?:\s*\/\s*[\d.]+)*$/;
        for (j += 4; j + 1 < lines.length && PROOF.test(lines[j + 1]); j += 3) {
          /* A cell can name two bottles - by a middot, or as a pair with
             "vs" between them - and can carry a count. */
          lines[j].split(/\s*·\s*|\s+vs\.?\s+/i).forEach(n => {
            const nm = n.replace(/\s*[x×]\s*\d+\s*$/i, '').trim();
            if (nm) f.ext.push(nm);
          });
        }
      }
      if (TAG.test(lines[j])) break;
    }
    flights.push(f);
    i = j - 1;
  }
  return flights;
}

/* ONE PLACE THAT SAYS TWO NAMES ARE THE SAME BOTTLE.
 *
 * The card writes a bottle shorter than the shelf does - "Sazerac Rye" for
 * "Sazerac 100 Proof Straight Rye Whiskey" - or longer, "Redbreast PX
 * Edition" for "Redbreast Px". So try it both ways round, in word order. It
 * answers whether two names CAN be one bottle; who decides what to do when
 * several fit is the caller's business.
 *
 * AT MODULE SCOPE AND EXPORTED, because flightfix.js kept a second copy and
 * teaching this one that "bonded" is "bottled in bond" did not reach it -
 * the Davidson pour then matched here and matched nothing there (rule 30d,
 * 2026-10-11). Anything that reconciles a card to the app asks these.
 */
const short = t => String(t).toLowerCase()
  /* PX is an abbreviation the app already knows (L.CASE_FIXED), and his
     library spells it Ximinez. */
  .replace(/pedro\s*xim[ie]n[ei]z/g, 'px')
  /* BONDED IS BOTTLED IN BOND. Not a guess about words: the app's own
     L.NOT_A_STYLE holds "bottled[\s-]*in[\s-]*bond|bonded" in one
     alternation, so the engine already says these are one thing, and 27 CFR
     5.88 is why - "Bonded" is the label's permitted short form. A card
     writes the short one and the library the long one. */
  .replace(/\bbonded\b/g, 'bottled in bond')
  .match(/[a-z0-9]+/g) || [];

const inOrder = (needles, hay) => {
  let at = 0;
  return needles.every(word => {
    const i = hay.indexOf(word, at);
    if (i < 0) return false;
    at = i + word.length;
    return true;
  });
};

const nameFits = (cardName, prodName) => {
  const cardWords = short(cardName);
  if (cardWords.length < 2) return false;
  const prodWords = short(prodName);
  return inOrder(cardWords, prodWords.join(' '))
    || (prodWords.length > 1 && inOrder(prodWords, cardWords.join(' ')));
};

/* A CARD CELL CARRIES MORE THAN A NAME: a star for a blind pour, a
   parenthetical instruction, a note after an em dash. */
const cardBottle = t => String(t || '').replace(/\s*\([^)]*\)/g, '')
  .replace(/\s*[\u2014\u2013]\s.*$/, '').replace(/[*\u2020]/g, '').trim();

/* THE FIRST NUMBER IN THE CELL, and only the first. A proof cell often
   names two - "140 to 100" is a cask-strength bottle and the strength it
   is watered to - and stripping everything that is not a digit welded
   them into 140100, or turned 131.54 into 131.541. Every proof test in
   this file then failed silently on exactly the flights that print both,
   which is how a flight whose six pours all matched to the decimal was
   refused over five of them. */
const numProof = p => {
  const m = String(p == null ? '' : p).match(/[0-9]+([.][0-9]+)?/);
  const n = m ? parseFloat(m[0]) : NaN;
  return isFinite(n) && n > 0 ? n : null;
};

/* THE CARD ROUNDS. Barrell Vantage is 114.44 in the library and 114.4 on
   the card, which is the same whiskey. */
const sameProof = (a, b) => a != null && b != null && Math.abs(a - b) < 0.1;

/* THE FIRST WORD OF A NAME IS THE HOUSE SAYING ITS OWN NAME. Read once,
   here, because both matchers below want it: the one that builds a new
   flight and the one that checks a flight both files hold. */
const brandWord = t => (String(t).toLowerCase().match(/[a-z0-9]+/g)
  || [''])[0];

/* TWO NAMES THAT ARE THE SAME WORDS, which beats anything fuzzy and so is
   asked first by every caller. */
const sameName = (a, b) => String(a).toLowerCase().trim()
  === String(b).toLowerCase().trim();

/* IS THIS DOCUMENT FLIGHT A RENAME OF ONE THE APP ALREADY HOLDS?
 *
 * A flight is matched to the app BY TITLE, so renaming one in the document
 * makes it read as a flight the app lacks - and writing it then leaves TWO,
 * the new title beside the old. That is not a theory: six flights were
 * reconciled by hand on 2026-10-10 and two of them renamed, and BZ's next
 * open showed 42 flights where there had been 40. His device still held the
 * two under their old titles, matched nothing on the server and pushed its
 * copies back.
 *
 * So ask what the app matches on everywhere else: the POURS, not the title.
 * More than half the card's core already in one app flight means the same
 * flight under a new name. Half, rather than all, because a rename usually
 * arrives in the same edit as a pour swap.
 *
 * `appFlights` is [{ title, keys }] - the keys as the app resolves them.
 */
const renamedFrom = function (cardKeys, appFlights) {
  const want = {};
  (cardKeys || []).forEach(k => { if (k) want[k] = 1; });
  const n = Object.keys(want).length;
  if (!n) return [];
  return (appFlights || []).map(fl => {
    let shared = 0;
    (fl.keys || []).forEach(k => { if (k && want[k]) shared++; });
    return { title: fl.title, shared: shared, of: n };
  }).filter(x => x.shared * 2 > x.of);
};

/* TWO SPELLINGS OF ONE BOTTLE ARE ONE CANDIDATE. The catalogue every
   matcher reads is keyed both ways - the shelf files by display name, the
   shared library by slug - so a merged list holds each product twice and
   any rule demanding "only one winner" is answered by one bottle wearing
   two names. Takes its catalogue and its normaliser so it can be tested
   without one. Returns the DISPLAY-NAME key, which is what a pour carries:
   237 of the 237 pours in his flights are keyed that way. */
const oneProduct = (list, cat, norm) => {
  const prodName = n => ((cat || {})[n] && cat[n].name) || n;
  const entry = n => (cat || {})[n] || null;
  const sameEntry = (a, b) => (entry(a) && entry(a) === entry(b))
    || norm(prodName(a)) === norm(prodName(b));
  const kept = [];
  list.forEach(n => {
    if (!kept.some(m => sameEntry(m, n))) kept.push(n);
  });
  if (kept.length !== 1) return null;
  const all = list.filter(n => sameEntry(n, kept[0]));
  return all.filter(n => n === prodName(n))[0] || kept[0];
};

module.exports = { unzipOne, paragraphs, parseCards, short, inOrder,
  nameFits, cardBottle, numProof, sameName, renamedFrom, oneProduct,
  sameProof, brandWord };

/* ---- run it ---------------------------------------------------------- */

if (require.main === module) {
  const file = process.argv[2];
  const WRITE = process.argv.indexOf('--write') >= 0;
  /* Claiming customFlights is a bigger thing than adding a flight - it
     replaces the list on every device - so it is never implied. */
  const RESET = process.argv.indexOf('--reset') >= 0;
  /* THE THREE FAULTS THAT REFUSED A FLIGHT WHOSE EVERY POUR WAS ON THE
     SHELF, each held here so none of them can come back quietly. This file
     had no test of any kind, and all three were silent: the report simply
     said a bottle was unmatched, which is what it says when a bottle really
     is. What it does NOT cover is the document reader or the write - those
     need a .docx and an account. Stated rather than implied. */
  if (process.argv.indexOf('--selftest') >= 0) {
    const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const cat = { 'Barrell Whiskey Sweet Peat': { name: 'Barrell Whiskey Sweet Peat', proof: 142.34 },
      barrell_whiskey_sweet_peat: { name: 'Barrell Whiskey Sweet Peat', proof: 142.34 },
      'Eagle Rare 10 Year': { name: 'Eagle Rare 10 Year', proof: 90 } };
    const cases = [
      ['a proof cell naming two proofs reads the first',
        numProof('140 ' + String.fromCharCode(8594) + ' 100'), 140],
      ['and keeps its decimals',
        numProof('131.54 ' + String.fromCharCode(8594) + ' 100'), 131.54],
      ['one proof still reads', numProof('114.4'), 114.4],
      ['a proof with words round it reads', numProof('100 proof'), 100],
      ['no proof is no proof', numProof('n/a'), null],
      ['two spellings of one bottle are one candidate',
        oneProduct(['Barrell Whiskey Sweet Peat', 'barrell_whiskey_sweet_peat'],
          cat, norm), 'Barrell Whiskey Sweet Peat'],
      ['and the display name is the one returned',
        oneProduct(['barrell_whiskey_sweet_peat', 'Barrell Whiskey Sweet Peat'],
          cat, norm), 'Barrell Whiskey Sweet Peat'],
      ['two different bottles are still two',
        oneProduct(['Barrell Whiskey Sweet Peat', 'Eagle Rare 10 Year'],
          cat, norm), null],
      ['the card rounds and the library does not',
        sameProof(114.4, 114.44), true],
      ['but a different bottle is a different proof',
        sameProof(114.4, 115.0), false],
      ['the house is the first word it says',
        brandWord('Barrell Gray Label Dovetail 16 Year'), 'barrell']];
    let bad = 0;
    cases.forEach(c => {
      const ok = JSON.stringify(c[1]) === JSON.stringify(c[2]);
      if (!ok) bad++;
      console.log('  ' + (ok ? 'ok  ' : 'FAILED  ') + c[0]
        + (ok ? '' : '   got ' + JSON.stringify(c[1])
          + ', want ' + JSON.stringify(c[2])));
    });
    console.log('  ' + (bad ? bad + ' of ' : 'all ') + cases.length
      + ' selftest case(s) ' + (bad ? 'FAILED' : 'pass'));
    process.exit(bad ? 1 : 0);
  }
  if (!file) {
    console.log('usage: node cards.js <tasting-flight-cards.docx> [--write]');
    console.log('       node cards.js --selftest');
    process.exit(1);
  }
  const dir = __dirname;
  const { L } = require('./engine.js')();
  const xml = unzipOne(fs.readFileSync(file), 'word/document.xml').toString('utf8');
  const doc = parseCards(paragraphs(xml).filter(Boolean));
  console.log(doc.length + ' flights in ' + path.basename(file));

  (async () => {
    const { token, DB } = require('./rules.js');
    const tok = await token();
    const get = async p => (await fetch(DB + '/bz-apps/whisky/' + p + '.json',
      { headers: { Authorization: 'Bearer ' + tok } })).json();
    const uid = Object.keys(await get('admins') || {})[0];
    const [live, custom, lib] = await Promise.all([
      get(uid + '/customFlights'), get(uid + '/custom'),
      get('shared/catalog/products')]);
    const flights = Array.isArray(live) ? live : Object.values(live || {});
    const shipped = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
    const cat = {};
    [Object.values(shipped.catalog || {}), Object.values(custom || {}),
     Object.values(lib || {})].forEach(set =>
      set.forEach(p => { if (p && p.name) cat[p.name] = p; }));
    /* AND BY THE LIBRARY'S OWN KEY. The shelf keys a bottle by its display
       name and the library by a slug, so a flight pour stored as
       `high_west_distillery_a_midwinter_night_s_dram` found nothing here:
       L.pourLabel fell back to the slug and its proof read as null, which
       took the proof tiebreak away and reported a pour that was perfectly
       correct as a disagreement (2026-10-12). Keyed both ways, either
       finds it. */
    Object.keys(lib || {}).forEach(k => {
      if (lib[k] && !cat[k]) cat[k] = lib[k];
    });
    console.log(flights.length + ' flights in the app, '
      + Object.keys(cat).length + ' products to match against\n');

    const norm = s => L.shopNorm(String(s || ''));
    const have = {};
    flights.forEach(f => { have[norm(f.title)] = f; });
    const names = Object.keys(cat);
    /* A bottle is matched by name, exactly or as the one product whose name
       contains it. Anything else is reported, never guessed. */
    /* ONE BOTTLE, TWO SPELLINGS, AND THAT IS WHY NOTHING MATCHED. The
       catalogue this tool matches against is keyed BOTH ways - the shelf
       files key a product by its display name and the shared library keys
       it by a slug - so merging them put every bottle in the list twice:
       "Barrell Whiskey Sweet Peat" and "barrell_whiskey_sweet_peat". Every
       rung below demands a single winner, and a single bottle answered as
       two. What Drops with Drops was refused over five pours that were all
       on his shelf. Two spellings of one product are one candidate here.
       THE DISPLAY NAME IS THE KEY A POUR CARRIES - 237 of the 237 pours in
       his forty flights are keyed that way - so that is the one returned
       when both spellings fit. */
    const onlyOne = list => oneProduct(list, cat, norm);
    const keyOf = (nm, proof) => {
      const w = norm(nm);
      if (!w) return null;
      /* THE NAME AS WRITTEN, first. L.shopNorm strips the category words,
         so "Sazerac Rye" and "Sazerac 100 Proof Straight Rye Whiskey" come
         down to the same thing and the normalised match finds two. A card
         that writes a product's name exactly means that product. */
      const literal = names.filter(n =>
        n.toLowerCase().trim() === String(nm).toLowerCase().trim());
      const oneLiteral = onlyOne(literal);
      if (oneLiteral) return oneLiteral;
      const exact = names.filter(n => norm(n) === w);
      const oneExact = onlyOne(exact);
      if (oneExact) return oneExact;
      const part = names.filter(n => norm(n).indexOf(w) === 0);
      const onePart = onlyOne(part);
      if (onePart) return onePart;
      /* AND ONLY EVER A SINGLE WINNER: this tool does not pick a bottle
         for him. */
      const fits = names.filter(n => nameFits(nm, n));
      const oneFit = onlyOne(fits);
      if (oneFit) return oneFit;
      /* THE SAME HOUSE AT THE SAME STRENGTH, last, and only once every
         name test has failed to produce one winner. The card prints the
         proof of every pour and the library prints it too, so a house
         name and a proof to the decimal name one bottle where the words
         cannot: the card says "Barrell Gray Label Dovetail 16 Year" and
         the library says "Barrell Craft Spirits Gray Label Dovetail 16
         Year", which no name rule can join without also joining the four
         other Gray Labels. THIS RUNG ALREADY EXISTED for the flights both
         files hold, three hundred lines down, and not here - so a cast
         this tool could check it could not build, and What Drops with
         Drops was refused over four bottles whose proofs matched to the
         decimal. One question, one door. It still demands a single
         candidate. */
      const pr = numProof(proof);
      if (pr != null) {
        const b = brandWord(nm);
        const byProof = names.filter(n => b && brandWord(n) === b
          && sameProof(pr, numProof((cat[n] || {}).proof)));
        const oneProof = onlyOne(byProof);
        if (oneProof) return oneProof;
      }
      return null;
    };

    const add = [];
    doc.forEach(f => {
      if (have[norm(f.title)]) return;
      const missing = [];
      const core = f.cards.map((c, i) => {
        const k = keyOf(c.bottle, c.proof);
        if (!k) missing.push(c.bottle);
        return { card: c.bottle, k: k, letter: c.letter, ord: i + 1,
                 role: 'core' };
      });
      /* THE BENCH DOES NOT BLOCK A FLIGHT. It is what you pour if the
         night has legs; the core is the flight itself. */
      const dropped = [];
      const ext = f.ext.map(n => {
        const k = keyOf(n);   // a bench row carries no proof of its own

        if (!k) { dropped.push(n); return null; }
        return { card: n, k: k, ord: 0, role: 'extension' };
      }).filter(Boolean);
      add.push({ f: f, core: core, ext: ext, missing: missing,
                 dropped: dropped });
    });

    if (!add.length) console.log('nothing in the document the app lacks.');
    add.forEach(a => {
      console.log('NEW  ' + a.f.title);
      console.log('     ' + a.core.length + ' core, ' + a.ext.length + ' bench, '
        + a.f.why.length + ' reasons'
        + (a.f.prereq ? ', a prereq' : '') + (a.f.room ? ', a room note' : ''));
      /* WHICH BOTTLE EACH POUR LANDED ON, before anything is written.
         A count of pours says a flight is buildable and not what it will
         pour, and the card writes a bottle the way it is said out loud
         while the library writes it the way the label does - so the two
         names differ on most rows and the matching is the thing worth
         reading. */
      a.core.filter(c => c.k).forEach(c =>
        console.log('     ' + c.letter + '  ' + c.card
          + (norm(c.card) === norm(c.k) ? '' : '   ->   ' + c.k)));
      a.missing.forEach(m =>
        console.log('     CORE BOTTLE UNMATCHED: ' + m));
      a.dropped.forEach(m =>
        console.log('     bench pour left out, nothing matches: ' + m));
    });

    /* Titles that differ only in wording are worth seeing but never
       rewritten: he renames them in the app on purpose. */
    /* AND SAID EVEN WHEN NOTHING IS NEW, which is the usual case once the
       document and the app have met: the early return above answered "is
       there anything to add" and took this report down with it, so handing
       over a document that differed only in what the APP held printed
       "nothing the app lacks" and stopped (2026-10-10). */
    const docTitles = doc.map(f => norm(f.title));
    flights.filter(f => docTitles.indexOf(norm(f.title)) < 0)
      .forEach(f => console.log('\nonly in the app: ' + f.title));

    /* AND WHAT THE TWO SAY DIFFERENTLY ABOUT A FLIGHT THEY BOTH HOLD.
       A NAME-LEVEL DIFF IS MOSTLY FALSE POSITIVES - the cards use display
       shorthand ("Rittenhouse Rye") where the app holds the full title, and
       several flights differ only in the ORDER they pour. So this reports
       the two things that are real whatever the wording: a flight that
       pours a different NUMBER of core whiskies, and a card bottle the
       shelf cannot match at all. */
    const byTitle = {};
    flights.forEach(fl => { byTitle[norm(fl.title)] = fl; });
    const notes = [];
    doc.forEach(d => {
      const app = byTitle[norm(d.title)];
      if (!app) return;
      /* BOTH SIDES DOWN TO LIBRARY KEYS, which is the only comparison
         that holds: the card writes display shorthand where the app holds
         the full product name, and several flights pour the same set in a
         different order. A key set answers both. parseCards fills `cards`,
         not `core` - `core` is what THIS tool builds for a flight the app
         lacks, and reading it off a document flight compared every card
         against nothing and said "the card pours 0" for all forty
         (2026-10-10). */
      /* AGAINST THIS FLIGHT'S OWN POURS, not against the whole catalogue.
         keyOf chooses among 746 products and rightly refuses when two fit -
         "Laphroaig 10 Year" fits both the 10 Year Old and the Cairdeas 10
         Year - so asking it flight by flight reported ONE bottle as two
         faults ("nothing matches Laphroaig 10 Year" above "the app pours
         Laphroaig 10 Year Old..., the card does not"), forty times over,
         and a report that cries wolf on every line is no report at all
         (2026-10-10). Inside one flight there are six candidates, and the
         card prints the PROOF of every pour, which settles the pair that
         names alone cannot.

         NAME AND PROOF FIRST, across every pour, before name alone takes
         anything: pairing greedily in one pass lets a loose name claim the
         bottle that the proof would have matched exactly. */
      /* A POUR IS NOT ALWAYS A SHELF BOTTLE. L.pourKind knows three: a
         shelf pour keyed by product, a WISH typed by name for something he
         does not own, and a BLEND of other pours. Reading `k` off all
         three counted only the shelf ones, so Who's Your Daddy - which
         holds both Van Winkles as wishes and Poor Man's Pappy as a blend,
         exactly as it should - read as three pours against the card's six
         and was reported as a flight missing half its pours (2026-10-10).
         L.pourLabel and L.blendProof are the doors that already know. */
      const mine = (app.core || []).filter(Boolean).map(c => {
        const kind = L.pourKind(c);
        const k = L.pourLabel(c, cat) || c.k || c.name || '';
        const proof = kind === 'blend' ? L.blendProof(c, cat)
          : numProof((cat[k] || {}).proof);
        return { k: k, kind: kind, proof: numProof(proof), taken: false };
      }).filter(p => p.k);
      const theirs = (d.cards || []).map(c => ({
        name: cardBottle(c.bottle), raw: c.bottle, proof: numProof(c.proof),
        letter: c.letter, pair: null }))
        /* POUR ZERO IS NOT A WHISKY. Take Your PX opens with the wine
           itself - its own meta line calls it that - so no shelf bottle
           will ever match it and it is not a difference. */
        .filter(c => c.name && String(c.letter) !== '0');

      const claim = (c, test) => {
        if (c.pair) return;
        const fits = mine.filter(p => !p.taken && test(c, p));
        if (fits.length !== 1) return;
        fits[0].taken = true;
        c.pair = fits[0];
      };
      const byName = (c, p) => nameFits(c.name, p.k);
      const sameProof = (a, b) => a != null && b != null
        /* THE CARD ROUNDS. Barrell Vantage is 114.44 in the library and
           114.4 on the card, which is the same whiskey. */
        && Math.abs(a - b) < 0.1;
      const brand = t => (String(t).toLowerCase().match(/[a-z0-9]+/g)
        || [''])[0];
      theirs.forEach(c => claim(c, (x, p) => byName(x, p)
        && sameProof(x.proof, p.proof)));
      theirs.forEach(c => claim(c, byName));
      /* THE SAME HOUSE AT THE SAME STRENGTH, once the names have had their
         turn. A card writes a bottle the way you say it out loud and the
         library writes it the way the label does: "Cask Favorites" for
         "Cask Favourites", "PX 2021" for "Pedro Ximinez Cask 2021", "ASM"
         for "American Single Malt", "Curiositas 10 Year" for "10 Year
         Curiositas". Word order and spelling defeat every name test, and
         all eight of them agreed on brand and proof to the decimal. It
         runs LAST and still demands a single candidate, so the pour a
         name matched outright is already claimed and out of the way. */
      theirs.forEach(c => claim(c, (x, p) => sameProof(x.proof, p.proof)
        && brand(x.name) && brand(x.name) === brand(p.k)));

      theirs.filter(c => !c.pair).forEach(c =>
        notes.push(d.title + ': the card pours "' + c.raw + '"'
          + (c.proof != null ? ' at ' + c.proof : '')
          + ', and nothing in the app\'s own pours matches it'));
      mine.filter(p => !p.taken).forEach(p =>
        notes.push(d.title + ': the app pours ' + p.k
          + ', and no card row matches it'));
    });
    if (notes.length) {
      console.log('\nflights both hold, where they do not agree:');
      notes.forEach(n => console.log('  ' + n));
    } else {
      console.log('\nevery flight both hold agrees on how many it pours, '
        + 'and every card bottle matches something.');
    }

    /* WHAT WOULD BE ADDED THAT IS REALLY A RENAME. Said on a dry run too,
       because the point is to see it before writing anything. */
    const held = flights.map(fl => ({ title: fl.title,
      keys: (fl.core || []).filter(Boolean)
        .map(p => L.pourLabel(p, cat) || p.k || p.name || '') }));
    const renames = [];
    add.forEach(a => {
      renamedFrom(a.core.map(c => c.k), held).forEach(x =>
        renames.push({ doc: a.f.title, app: x.title,
          shared: x.shared, of: x.of }));
    });
    if (renames.length) {
      console.log('\nTHESE LOOK LIKE RENAMES, not new flights:');
      renames.forEach(x => console.log('  "' + x.app + '" is already in the '
        + 'app with ' + x.shared + ' of this card\'s ' + x.of
        + ' pours\n      the document calls it "' + x.doc + '"'));
      console.log('  Writing them adds a SECOND copy, and the old title is '
        + 'what\n  every device matches on, so the stale one comes back. '
        + 'Pass --reset\n  to claim customFlights, which replaces the list '
        + 'whole everywhere.');
    }

    if (!WRITE) { console.log('\nDry run. Pass --write.'); return; }
    if (renames.length && !RESET) {
      console.log('\nREFUSED: a rename needs --reset. Nothing written.');
      process.exitCode = 1;
      return;
    }
    /* ONE BLOCKED FLIGHT DOES NOT HOLD THE OTHERS BACK. A flight whose
       core names a bottle nothing matches cannot be built; the rest can,
       and refusing all of them over it helps nobody. */
    const blocked = add.filter(a => a.missing.length);
    const ready = add.filter(a => !a.missing.length);
    blocked.forEach(a => console.log('\nnot added, ' + a.f.title
      + ': no product matches ' + a.missing.join(', ')));
    if (!ready.length) { console.log('\nnothing could be added.'); return; }
    let at = flights.length;
    for (const a of ready) {
      const body = { title: a.f.title, tag: a.f.tag, premise: a.f.premise,
        why: a.f.why, cards: a.f.cards, core: a.core, ext: a.ext };
      const r = await fetch(DB + '/bz-apps/whisky/' + uid + '/customFlights/'
        + at + '.json', { method: 'PUT',
        headers: { Authorization: 'Bearer ' + tok,
                   'Content-Type': 'application/json' },
        body: JSON.stringify(body) });
      if (!r.ok) throw new Error(a.f.title + ': ' + r.status + ' ' + await r.text());
      console.log('written: ' + a.f.title);
      at++;
    }
    /* AND CLAIM THE KEY, so every device takes customFlights whole rather
       than merging its own copy under the old title back in. L.markReset
       and L.RESETTABLE are the app's own door for this (L.resetSide reads
       it on the next load). */
    if (renames.length) {
      const now = Date.now();
      const was = await get(uid + '/resets') || {};
      const next = L.markReset(was, ['customFlights'], now);
      const rr = await fetch(DB + '/bz-apps/whisky/' + uid + '/resets.json',
        { method: 'PUT', headers: { Authorization: 'Bearer ' + tok,
          'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!rr.ok) throw new Error('resets: ' + rr.status);
      console.log('claimed customFlights at ' + now
        + ' - every device takes the account copy whole on its next load.');
    }
    console.log('\n' + ready.length + ' flight(s) added. ' + at
      + ' in the app.');
  })().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
}
