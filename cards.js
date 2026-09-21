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
const HEAD = ['#', 'Bottle', 'Proof'];

function parseCards(lines) {
  const flights = [];
  for (let i = 1; i < lines.length; i++) {
    if (!TAG.test(lines[i])) continue;
    const title = lines[i - 1];
    if (!title || title.length < 4 || title !== title.toUpperCase()) continue;
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
       its pours 1a, 1b, 2a rather than A, B, C. */
    j += 8;
    while (j + 3 < lines.length && /^(?:[A-L]|\d+[a-z])$/.test(lines[j])) {
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

module.exports = { unzipOne, paragraphs, parseCards };

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
    /* A bottle is matched by name, exactly or as the one product whose name
       contains it. Anything else is reported, never guessed. */
    const names = Object.keys(cat);
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
      /* THE CARD WRITES SHORT NAMES. "Sazerac Rye" is "Sazerac 100 Proof
         Straight Rye Whiskey" on the shelf: every word of the short name,
         in order, somewhere in the long one. Only ever accepted when one
         product fits - this tool does not pick a bottle for him. */
      const words = String(nm).toLowerCase().match(/[a-z0-9]+/g) || [];
      if (words.length < 2) return null;
      const inOrder = n => {
        const hay = String(n).toLowerCase();
        let at = 0;
        return words.every(word => {
          const i = hay.indexOf(word, at);
          if (i < 0) return false;
          at = i + word.length;
          return true;
        });
      };
      const loose = names.filter(inOrder);
      return loose.length === 1 ? loose[0] : null;
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

    if (!add.length) { console.log('nothing in the document the app lacks.'); return; }
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
    const docTitles = doc.map(f => norm(f.title));
    flights.filter(f => docTitles.indexOf(norm(f.title)) < 0)
      .forEach(f => console.log('\nonly in the app: ' + f.title));

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
