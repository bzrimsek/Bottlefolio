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

const numProof = p => {
  const n = parseFloat(String(p == null ? '' : p).replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};

/* TWO NAMES THAT ARE THE SAME WORDS, which beats anything fuzzy and so is
   asked first by every caller. */
const sameName = (a, b) => String(a).toLowerCase().trim()
  === String(b).toLowerCase().trim();

module.exports = { unzipOne, paragraphs, parseCards,
  short, inOrder, nameFits, cardBottle, numProof, sameName };

/* ---- run it ---------------------------------------------------------- */

if (require.main === module) {
  const file = process.argv[2];
  const WRITE = process.argv.indexOf('--write') >= 0;
  if (!file) {
    console.log('usage: node cards.js <tasting-flight-cards.docx> [--write]');
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
    console.log(flights.length + ' flights in the app, '
      + Object.keys(cat).length + ' products to match against\n');

    const norm = s => L.shopNorm(String(s || ''));
    const have = {};
    flights.forEach(f => { have[norm(f.title)] = f; });
    const names = Object.keys(cat);
    /* A bottle is matched by name, exactly or as the one product whose name
       contains it. Anything else is reported, never guessed. */
    const keyOf = nm => {
      const w = norm(nm);
      if (!w) return null;
      /* THE NAME AS WRITTEN, first. L.shopNorm strips the category words,
         so "Sazerac Rye" and "Sazerac 100 Proof Straight Rye Whiskey" come
         down to the same thing and the normalised match finds two. A card
         that writes a product's name exactly means that product. */
      const literal = names.filter(n =>
        n.toLowerCase().trim() === String(nm).toLowerCase().trim());
      if (literal.length === 1) return literal[0];
      const exact = names.filter(n => norm(n) === w);
      if (exact.length === 1) return exact[0];
      const part = names.filter(n => norm(n).indexOf(w) === 0);
      if (part.length === 1) return part[0];
      /* AND ONLY EVER A SINGLE WINNER: this tool does not pick a bottle
         for him. */
      const fits = names.filter(n => nameFits(nm, n));
      return fits.length === 1 ? fits[0] : null;
    };

    const add = [];
    doc.forEach(f => {
      if (have[norm(f.title)]) return;
      const missing = [];
      const core = f.cards.map((c, i) => {
        const k = keyOf(c.bottle);
        if (!k) missing.push(c.bottle);
        return { card: c.bottle, k: k, letter: c.letter, ord: i + 1,
                 role: 'core' };
      });
      /* THE BENCH DOES NOT BLOCK A FLIGHT. It is what you pour if the
         night has legs; the core is the flight itself. */
      const dropped = [];
      const ext = f.ext.map(n => {
        const k = keyOf(n);
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

    if (!WRITE) { console.log('\nDry run. Pass --write.'); return; }
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
    console.log('\n' + ready.length + ' flight(s) added. ' + at
      + ' in the app.');
  })().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
}
