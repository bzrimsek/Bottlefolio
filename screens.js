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
  const bots=JSON.parse(fs.readFileSync(path.join(dir,'bz-bottles.json'),'utf8'));
  // drive the screen directly: no clicking, no waiting on selectors
  const out = await p.evaluate(b=>{
    S.bottles=b; save_(); rebuildCatalog();
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

    // and a named bottle, which is the half being extracted
    try {
      S.shopMode='store'; document.getElementById('shopQ').value='Ardbeg Ten';
      renderShop();
      r.named=document.querySelectorAll('#scr-shop .sheet').length;
      r.backs=document.querySelectorAll('#shopBack').length;
    } catch(e){ r.named='THREW '+e.message; r.where=(e.stack||'').split('\n')[1]; }
    return r;
  },bots);
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
