/* Every screen, driven directly, in seconds.
 *
 * The gap this fills. browser.js walks the app like a person — clicking
 * nav, waiting for selectors — and takes two minutes, so it is run at the
 * end and a failure in it is expensive to diagnose. Most of what it
 * catches is a screen that THREW while drawing, and that does not need
 * clicking: calling the render function is enough.
 *
 * Written after a split of renderShop broke the walk and the cause took
 * two full runs and a revert to find. The cause was a NAME COLLISION —
 * the new function reused a name that already existed, so the app called
 * the wrong body. This probe reproduced it in seven seconds, and
 * consistency.js now refuses a build with two functions sharing a name.
 *
 * It does not replace the walk. It catches the throw; the walk catches the
 * button that no longer leads anywhere.
 */
const { chromium } = require('playwright');
const path=require('path'), fs=require('fs');
/* The folder this file is IN, not a path typed once and outlived. It said
   /home/claude/kb, which was the container path in an earlier session and
   has not existed for weeks - so this scan threw on its own data file and
   stayed broken for however long nobody ran it. A scan that cannot run is
   worse than one that fails, because a failure is reported and this was
   not. Found 2026-09-09 when BZ asked for all of them to be run. */
const dir = __dirname;
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:900,height:900}});
  const threw=[];
  p.on('pageerror',e=>threw.push(e.message));
  await p.route('http://app.local/**', r=>{
    const n=r.request().url().split('app.local/')[1].split('?')[0]||'index.html';
    const f=path.join(dir,n);
    if(!fs.existsSync(f)) return r.fulfill({status:404,body:''});
    const t=n.endsWith('.json')?'application/json':n.endsWith('.js')?'text/javascript':n.endsWith('.png')?'image/png':'text/html';
    r.fulfill({status:200,contentType:t,body:fs.readFileSync(f)});
  });
  await p.goto('http://app.local/index.html'); await p.waitForTimeout(1200);
  const { bottles: bots, custom } = require('./engine.js').shelf(dir);
  // drive the screen directly: no clicking, no waiting on selectors
  const out = await p.evaluate(([b, cu])=>{
    S.bottles=b; S.custom=cu; save_(); rebuildCatalog();
    const r={};
    ['store','plan','offer','online'].forEach(m=>{
      S.shopMode=m; S.shop={}; S.shopFound=null;
      const box=document.getElementById('shopQ'); if(box) box.value='';
      try { renderShop(); r[m]=document.querySelectorAll('#scr-shop .sheet,#scr-shop .modetile').length; }
      catch(e){ r[m]='THREW '+e.message; }
    });
    /* Every OTHER screen, called directly. The walk clicks its way to
       these and takes two minutes; a screen that throws while drawing
       does not need clicking to prove it. */
    [['home', 'renderHome'], ['shelf', 'renderShelf'],
     ['flights', 'renderFlights'], ['settings', 'renderSettings'],
     ['library', 'renderLibraryScreen'],
     /* ['shared', 'renderShared'] stood here. The screen was deleted in
        thread 6 when the Buddies tab replaced it, and this list kept
        asking for it - reported as "shared MISSING renderShared" on every
        run, which nobody saw because the scan itself had been unable to
        start since its data path went stale. */
     ['pour', 'renderReels'], ['info', 'renderReference'],
     ['map', 'renderMap'], ['log', 'renderHistory']].forEach(([nm, fn]) => {
      if (typeof window[fn] !== 'function') { r[nm] = 'MISSING ' + fn; return; }
      try { window[fn](); r[nm] = 'ok'; }
      catch (e) { r[nm] = 'THREW ' + e.message; }
    });

    /* The MODALS, which nothing else opens.

       Every screen check draws a page; none of them opens the sheets that
       sit on top, and that is where a whole day of bugs lived — a fill
       that offered two entries, a take-back with no detail, a finder that
       looked like an explainer. Opening one and counting what it drew is
       enough to catch a throw or an empty sheet. */
    LIB.products = {};
    for (let i = 0; i < 12; i++) {
      LIB.products['e' + i] = { name: 'Entry ' + i, proof: 100,
        dist: 'House ' + i, sub: 'scotch' };
    }
    LIB.admin = true;
    S.lookupUrl = 'https://example.invalid/lookup';
    [['fill', () => libraryFillStart(LIB.products, () => {})],
     ['import', () => importDialog()],
     ['receipts', () => receiptsDialog()],
     ['bottle form', () => productForm(null)]].forEach(([nm, open]) => {
      try {
        open();
        const m2 = document.getElementById('modal');
        const n = m2 ? m2.querySelectorAll('button,input,textarea').length : 0;
        r['modal:' + nm] = n ? 'ok(' + n + ')' : 'EMPTY';
        closeModal();
      } catch (e) { r['modal:' + nm] = 'THREW ' + e.message; }
    });
    /* The fill must offer the RIGHT NUMBER, read off the sheet it draws.

       It offered two when the library held 422, because the snapshot was
       keyed on a field the rows do not carry and they all collapsed into
       one bucket. Asking the list helper directly would not have caught
       it — the fault was in the snapshot, between the helper and the
       screen — so this reads the heading the person actually sees. */
    try {
      libraryFillStart(LIB.products, () => {});
      const head = document.querySelector('#modal .modalhd h2');
      const said = head ? (head.textContent.match(/\d+/) || ['0'])[0] : '0';
      r.fillOffers = (Number(said) === 12)
        ? 'ok(12)' : 'THREW the sheet offered ' + said + ' of 12';
      closeModal();
    } catch (e) { r.fillOffers = 'THREW ' + e.message; }

    /* THE GRAIN BLOCK: TWICE, AND IN SEQUENCE (rule 30e).

       A published bill and a category rule must not read the same, and the
       second bottle opened must not wear the first one's label. Rendered
       twice as well, because this block appends into the sheet and a
       doubled render is how appended blocks fail. */
    try {
      const mk = (k, name, extra) => Object.assign(
        { k: k, name: name, sub: 'scotch', style: 'single malt', proof: 92 },
        extra || {});
      /* One with nothing printed - the category rule applies - and one with
         a bill the producer published. */
      S.custom = Object.assign({}, S.custom, {
        zzLaw: mk('zzLaw', 'Rule Only 12'),
        zzSaid: mk('zzSaid', 'Printed Bill 12',
          { mash: '80% malted barley, 20% rye' })
      });
      S.bottles = (S.bottles || []).concat([
        { id: 'zb1', k: 'zzLaw', status: 'open' },
        { id: 'zb2', k: 'zzSaid', status: 'open' }
      ]);
      save_(); rebuildCatalog();

      const words = () => {
        const d = document.getElementById('scr-detail');
        return d ? d.textContent : '';
      };
      const tags = () => {
        const d = document.getElementById('scr-detail');
        return d ? d.querySelectorAll('.tag.grain').length : 0;
      };
      const SAYS_RULE = /What the category requires/;

      show('detail'); showBottle('zzLaw');
      const lawOnce = tags();
      if (!SAYS_RULE.test(words())) {
        r.mashLabel = 'THREW a by-law bill is not labelled as the rule';
      } else if (/80% malted barley/.test(words())) {
        r.mashLabel = 'THREW the rule bottle shows another bottle\u2019s bill';
      } else {
        /* SECOND RENDER, same bottle: appended blocks double or they do not. */
        showBottle('zzLaw');
        r.mashLabel = tags() === lawOnce
          ? 'ok(' + lawOnce + ' tags)'
          : 'THREW the grain tags doubled on a second render: '
            + lawOnce + ' then ' + tags();
      }

      /* THE SEQUENCE. Rule bottle, then printed bottle, then back. */
      showBottle('zzSaid');
      const saidWords = words();
      showBottle('zzLaw');
      const backWords = words();
      r.mashSeq =
        SAYS_RULE.test(saidWords)
          ? 'THREW a published bill is called the category rule'
        : !/80% malted barley/.test(saidWords)
          ? 'THREW a published bill is not shown'
        : !SAYS_RULE.test(backWords)
          ? 'THREW the rule label is lost after another bottle'
        : /80% malted barley/.test(backWords)
          ? 'THREW the previous bottle\u2019s bill survived the next render'
          : 'ok';
    } catch (e) { r.mashLabel = 'THREW ' + e.message; }

    /* THE TASTE LINE: TWICE, AND IN SEQUENCE (rule 30e, v2.5.46).

       It is appended into the tasting card, which is how a doubled render
       shows up, and it must not carry the previous bottle's flavours into
       the next one. A bottle whose notes say only a colour and a finish
       must show no line at all, because neither is a taste - that is the
       case a screen gets wrong by showing an empty label. */
    try {
      const mk = (k, name, tn) => ({ k: k, name: name, sub: 'bourbon',
        style: 'straight bourbon', proof: 100, tn: tn });
      S.custom = Object.assign({}, S.custom, {
        zzTaste: mk('zzTaste', 'Tastes Of Things',
          { nose: 'Vanilla and toasted oak', palate: 'Caramel, cinnamon',
            finish: 'Long, drying' }),
        zzPeat: mk('zzPeat', 'Peated Thing',
          { nose: 'Peat smoke and sea salt', palate: 'Iodine' }),
        zzMute: mk('zzMute', 'Nothing To Say',
          { colour: 'Deep amber', finish: 'Long and smooth' })
      });
      S.bottles = (S.bottles || []).concat([
        { id: 'zb3', k: 'zzTaste', status: 'open' },
        { id: 'zb4', k: 'zzPeat', status: 'open' },
        { id: 'zb5', k: 'zzMute', status: 'open' }
      ]);
      save_(); rebuildCatalog();

      const lines = () => Array.prototype.slice.call(
        document.querySelectorAll('#scr-detail #palateLine, '
          + '#scr-detail [id="palateLine"]')).map(n => n.textContent);

      show('detail'); showBottle('zzTaste');
      const once = lines();
      showBottle('zzTaste');
      const twice = lines();
      showBottle('zzPeat');
      const peat = lines().join(' ');
      showBottle('zzMute');
      const mute = lines();

      r.tasteLine =
        once.length !== 1
          ? 'THREW the taste line is not on the bottle: ' + once.length
            + ' found'
        : !/vanilla/i.test(once[0]) || !/caramel/i.test(once[0])
          ? 'THREW the line does not name what the notes say: ' + once[0]
        : /amber|long/i.test(once[0])
          ? 'THREW a colour or a finish length is offered as a taste: '
            + once[0]
        : twice.length !== 1
          ? 'THREW the line doubled on a second render: ' + twice.length
        : !/peat/i.test(peat)
          ? 'THREW the next bottle does not get its own flavours: ' + peat
        : /vanilla|caramel/i.test(peat)
          ? 'THREW the previous bottle’s flavours survived: ' + peat
        : mute.length
          ? 'THREW a colour and a finish alone produced a taste line: '
            + mute[0]
          : 'ok(' + once[0] + ')';
    } catch (e) { r.tasteLine = 'THREW ' + e.message; }

    /* THE TASTE PAIR CARD: TWICE, AND IN SEQUENCE (rule 30e, v2.5.56).
       It redraws itself after every answer, into a container it empties
       first - which is the arrangement an appended card gets wrong. */
    try {
      S.tasteAB = {};
      show('pour');
      renderPourWhere();
      const cards = () => document.querySelectorAll('#tasteShapeBody .sheet').length;
      const chips = () => document.querySelectorAll('#tasteShape .chip').length;
      const first = cards();
      renderPourWhere();
      const twice = cards();
      const before = document.getElementById('tasteShape')
        ? document.getElementById('tasteShape').textContent : '';
      const chip = document.querySelector('#tasteShape .chip');
      if (chip) chip.click();
      const after = document.getElementById('tasteShape')
        ? document.getElementById('tasteShape').textContent : '';
      r.tastePair =
        first !== 1 ? 'THREW the card is not drawn once: ' + first
        : twice !== 1 ? 'THREW it doubled on a second render: ' + twice
        : chips() < 3 ? 'THREW it offers fewer than two flavours and neither'
        : cards() !== 1 ? 'THREW answering it stacked a second card'
        : !Object.keys(S.tasteAB).length ? 'THREW the answer was not kept'
        : before === after ? 'THREW it asked the same thing again'
        : 'ok';
    } catch (e) { r.tastePair = 'THREW ' + e.message; }

    /* ICONS THAT ARE ACTUALLY VISIBLE.

       A touch-target fix gave the masthead buttons a ::before carrying the
       visible box. The pseudo-element is positioned and the gear glyph is
       not, so the box painted over the top and both buttons came out
       blank — a fix that deleted the icons, and nothing caught it because
       the button was still there, still 44px, still tappable.

       Anything that is a button with no text needs something inside it a
       person can see. */
    const blind = [];
    document.querySelectorAll('button').forEach(el2 => {
      const r2 = el2.getBoundingClientRect();
      if (!r2.width || !r2.height) return;
      const hasText = el2.textContent.trim().length > 0;
      const hasSvg = !!el2.querySelector('svg, img');
      /* The sync dot is a colored circle by design — it IS the icon, drawn
         in CSS, and it carries an aria-label. Excluded by name rather than
         by weakening the rule to "or has a background", which would let a
         genuinely blank button through. */
      if (el2.id === 'syncDotMast') return;
      if (!hasText && !hasSvg) {
        blind.push(el2.id || el2.className || 'button');
      }
    });
    r.blankButtons = blind.length ? 'THREW ' + blind.slice(0, 4).join(', ')
      : 'ok';

    /* THE BUDDY TAB, WITH A SHELF ON IT.

       Half of that tab only exists once a buddy's copy has landed - the
       Venn, the write-up, the pooled flight - and every check here left
       SHARED.shelves empty, so the panel returned at its wait notice and
       none of it was ever drawn. The pooled flight moved onto this tab on
       2026-09-24, which moved it into code nothing ran.

       One buddy holding eighty bottles the host has not got open, which is
       what it takes for pooling to gain a flight: with twelve the sheet came
       up empty and this check passed anyway, on a button count that was
       really the two ways out of an empty sheet. */
    try {
      /* What the host cannot pour, which is what a buddy is for: bottles
         he owns but has not opened count, because a sealed bottle is not in
         the pool and the buddy's copy is then the only pourable one. On his
         shelf the ones he does not own at all come to two. */
      const have = L.openKeys(S.bottles);
      const their = { catalog: {}, bottles: [] };
      Object.keys(S.catalog).filter(k2 => !have[k2]).slice(0, 80)
        .forEach(k2 => {
          their.catalog[k2] = S.catalog[k2];
          their.bottles.push({ id: 'b-' + k2, k: k2, status: 'open' });
        });
      SHARED.names.bud1 = 'Dale';
      SHARED.shelves.bud1 = their;
      const pane = el('div');
      document.body.appendChild(pane);
      buddiesOnePanel(pane, 'bud1', SHARED.names,
        { id: 'me', name: 'You',
          map: L.shelfSet({ catalog: S.catalog, bottles: S.bottles }) },
        null);
      const btn = Array.prototype.slice.call(pane.querySelectorAll('button'))
        .filter(x => /both shelves|cannot pour alone/.test(x.textContent))[0];
      if (!btn) {
        r.pairPool = 'THREW no pooled-flight button on the buddy tab';
      } else {
        btn.click();
        const m3 = document.getElementById('modal');
        /* A FLIGHT TO PRESS, not a button count: the count was satisfied by
           the corner cross and the Close button of an empty sheet. */
        const found = m3 ? m3.querySelectorAll('.find').length : 0;
        r.pairPool = found ? 'ok(' + found + ')'
          : 'THREW the pooled sheet offered no flights';
        /* AND THE ROW LEADS TO THE FLIGHT, not to a form. Every row led to
           the designer, which asked again for the variable the row had
           already named and cast it afresh from a different group - so the
           cast the row was judged on never reached the screen (BZ,
           2026-09-24). A form has a variable picker; a flight does not. */
        const row = m3 && m3.querySelector('.find');
        if (!row) {
          r.pairRow = 'THREW the pooled sheet has no flight to press';
        } else {
          row.click();
          const m4 = document.getElementById('modal');
          const asks = m4 ? m4.querySelectorAll('select').length : 0;
          /* THE BOTTLES. A proposal with none of them still draws its
             question, what it holds still and its warnings, which is what
             the pooled sheet was showing: the pours are keyed on the POOL
             and were being looked up on the host's own shelf, so every row
             was skipped. */
          const pours = m4 ? m4.querySelectorAll('.recent .item').length : 0;
          /* AND WHOSE THEY ARE. The sheet says how many the buddy brings;
             the pours have to say WHICH, or the host cannot act on it. */
          const marks = m4 ? Array.prototype.slice
            .call(m4.querySelectorAll('.recent .item *'))
            .filter(t => /brings this/.test(t.textContent)
              && !t.querySelector('*')) : [];
          /* AND NOT INSIDE THE NAME, which is clamped to two lines: the
             longest names ate both and the label was clipped away, so a
             borrowed bottle read as the host's own (BZ, 2026-09-25). */
          const clipped = marks.filter(t => t.closest('.nm')).length;
          r.pairRow = asks ? 'THREW the row opened a form, not a flight'
            : pours < 4 ? 'THREW the flight drew ' + pours + ' bottles'
            : !marks.length ? 'THREW no pour says who brings it'
            : clipped ? 'THREW who brings it sits inside the clamped name'
            : 'ok(' + pours + ' pours, ' + marks.length + ' borrowed)';
        }
        closeModal();
      }
      /* ONE TILE PER BUDDY, including one who never shared back. The tiles
         are the only way to a person's tab now and the ask lives there, so
         a tile that does not draw is an ask nobody can reach (BZ,
         2026-09-25). */
      SHARED.names.bud2 = 'Nobody Back';
      SHARED.outList = [{ uid: 'bud1', name: 'Dale' },
        { uid: 'bud2', name: 'Nobody Back' }];
      const tiles = el('div');
      document.body.appendChild(tiles);
      const rws = L.buddyRows(SHARED.shelves, SHARED.outList, SHARED.names,
        SHARED.granted);
      buddyTiles(tiles, rws, SHARED.names,
        { id: 'me', name: 'You',
          map: L.shelfSet({ catalog: S.catalog, bottles: S.bottles }) });
      const drawn = tiles.querySelectorAll('.roomcell').length;
      const numbers = Array.prototype.slice
        .call(tiles.querySelectorAll('.rc-n'))
        .filter(x => /^[0-9]+$/.test(x.textContent.trim())).length;
      r.budTiles = drawn !== rws.length
        ? 'THREW ' + drawn + ' tiles for ' + rws.length + ' buddies'
        : numbers ? 'ok(' + drawn + ' tiles, ' + numbers + ' counted)'
        : 'THREW no tile carries a number';
      /* And the one who never shared back still gets a panel that says so
         rather than the wait notice for a shelf that is coming. */
      const back = el('div');
      document.body.appendChild(back);
      buddiesOnePanel(back, 'bud2', SHARED.names,
        { id: 'me', name: 'You', map: {} },
        rws.filter(x => x.uid === 'bud2')[0]);
      r.budNoShare = /has not shared back/.test(back.textContent)
        ? 'ok' : 'THREW the panel does not say they never shared';
      tiles.remove();
      back.remove();
      pane.remove();
      delete SHARED.shelves.bud1;
      delete SHARED.names.bud1;
      delete SHARED.names.bud2;
    } catch (e) { r.pairPool = 'THREW ' + e.message; }

    // and a named bottle, which is the half being extracted
    try {
      S.shopMode='store'; document.getElementById('shopQ').value='Ardbeg Ten';
      renderShop();
      r.named=document.querySelectorAll('#scr-shop .sheet').length;
      r.backs=document.querySelectorAll('#shopBack').length;
    } catch(e){ r.named='THREW '+e.message; r.where=(e.stack||'').split('\n')[1]; }
    return r;
  },[bots, custom]);
  const bad = Object.keys(out).filter(k => /THREW/.test(String(out[k])));
  if (bad.length || threw.length) {
    bad.forEach(k => console.log('  \u2716 ' + k + ': ' + out[k]));
    threw.forEach(t => console.log('  \u2716 threw while loading: ' + t));
    process.exitCode = 1;
  } else {
    const missing = Object.keys(out).filter(k => /MISSING/.test(String(out[k])));
    missing.forEach(k => console.log('  \u00b7 ' + k + ' ' + out[k]));
    console.log('  \u2713 ' + (Object.keys(out).length - missing.length)
      + ' screens draw without throwing, a named bottle answers ('
      + out.named + ' sheets, ' + out.backs + ' back)');
  }
  await b.close();
})();
