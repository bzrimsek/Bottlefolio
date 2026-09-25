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
      pane.remove();
      delete SHARED.shelves.bud1;
      delete SHARED.names.bud1;
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
