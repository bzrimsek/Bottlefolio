#!/usr/bin/env python3
"""audit.py — Killer B's Bottle Tracker pre-delivery audit.
Usage: python3 audit.py [path/to/index.html]
Must pass with 0 failures before every delivery. No exceptions.

Checks:
   1. JS syntax (node --check) on the inline script
   2. APP_VERSION present and valid
   3. Header carries a headline for this version, non-blank
   4. CHANGELOG.md carries the full entry for this version
   5. Header holds no more than KEEP_IN_HEADER versions
   6. BUILD_TIME present and in Eastern Time format
   7. UI version string matches APP_VERSION
   8. sw.js CACHE_NAME matches APP_VERSION
   9. sw.js parses, honours SKIP_WAITING, and precaches every asset
  10. Page requests SKIP_WAITING and reloads on controllerchange
  11. Install prompt captured; manifest valid with a maskable icon
  12. data.json and map.json parse and hold what the app expects
  13. Storage availability is probed rather than assumed
  14. Named lock files exist AND match index.html / sw.js byte for byte
"""
import sys, re, os, json, subprocess

KEEP_IN_HEADER = 10
ASSETS = ['mark.png', 'icon-192.png', 'icon-512.png', 'data.json', 'map.json',
          # The barcode decoder for browsers with no BarcodeDetector, which
          # is every iPhone. Precached because scanning happens in shops.
          'zxing.min.js']

failures = 0


def fail(msg):
    global failures
    failures += 1
    print(f'  \u2716 FAIL: {msg}')


def ok(msg):
    print(f'  \u2713 {msg}')


def run_check(label, cmd, timeout):
    """Run one harness, and fail the audit if it exits non-zero whatever it
    printed.

    The audit judged a harness by the marks in its output. One that CRASHED
    - threw at load, missed a file - prints a stack to stderr and no mark at
    all, and the audit read that silence as a pass: "All checks passed"
    over a check that never ran. The consistency step ignored the exit code
    entirely, and the screens step noticed it and then only failed on a
    printed mark. The exit code is the one thing a crash cannot forget.

    UTF-8 by name: on BZ's Windows PC Python reads a child's output as
    cp1252 unless PYTHONUTF8 is set, and the mark this looks for arrives as
    three other characters. push.py sets it; a hand run does not."""
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8',
                       errors='replace', timeout=timeout)
    if r.returncode != 0:
        fail(f'{label} exited {r.returncode}')
        said = [ln for ln in (r.stderr or '').split('\n') if ln.strip()] \
            or [ln for ln in (r.stdout or '').split('\n') if ln.strip()]
        for ln in said[-20:]:
            print(f'      {ln}')
    return r


def run_audit(html_path):
    global failures
    failures = 0
    base = os.path.dirname(os.path.abspath(html_path)) or '.'
    print(f'\nAudit: {html_path}\n')

    if not os.path.exists(html_path):
        fail(f'index.html not found at {html_path}')
        return False
    html = open(html_path, encoding='utf-8').read()

    # ── 1. JS syntax ──────────────────────────────────────────────
    blocks = re.findall(
        r'<script(?![^>]*\bsrc\b)(?![^>]*type=["\']module["\'])[^>]*>([\s\S]*?)</script>', html)
    # The system's temp folder, not /tmp: /tmp exists on the Linux runner
    # and in the old container, and not on BZ's Windows PC. UTF-8 because
    # the script carries ✓ and ✖, which Windows' default encoding cannot
    # write.
    import tempfile
    tmp = os.path.join(tempfile.gettempdir(), 'audit_killerbs.js')
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write('\n'.join(blocks))
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    if r.returncode != 0:
        fail('JS syntax error:\n' + r.stderr[:400])
    else:
        # node --check only PARSES. `FBLOG = []` with no declaration parses
        # perfectly and throws ReferenceError at load under strict mode,
        # which blanked the app and shipped past a green audit.
        #
        # Executing the file would catch it, but not without a real DOM:
        # the app wires its handlers before that line is reached and dies on
        # a null element first. So check the thing itself — a top-level
        # assignment to a name that is never declared anywhere in the file.
        js = '\n'.join(blocks)
        declared = set(re.findall(
            r'(?:^|[\s;{(])(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)', js))
        declared |= set(re.findall(r'function\s+([A-Za-z_$][\w$]*)', js))
        # Parameters and loop variables too, so a match is a real finding.
        declared |= set(re.findall(r'([A-Za-z_$][\w$]*)\s*(?:,\s*[\w$]+\s*)*=>', js))
        declared |= set(re.findall(r'\(([^)]{0,120})\)\s*(?:=>|{)', js) and [] or [])
        undeclared = []
        for m in re.finditer(r'^([A-Za-z_$][\w$]*)\s*=(?!=)', js, re.M):
            name = m.group(1)
            if name in declared:
                continue
            if name in ('module', 'exports', 'globalThis'):
                continue
            undeclared.append(name)
        if undeclared:
            fail('assigned without declaring (throws under strict mode): '
                 + ', '.join(sorted(set(undeclared))[:5]))
        else:
            ok('no undeclared assignments')
        ok('JS syntax valid')

    # ── 2. APP_VERSION ────────────────────────────────────────────
    m = re.search(r"const APP_VERSION\s*=\s*'([\d.]+)'", html)
    version = m.group(1) if m else None
    if not version:
        fail('APP_VERSION not found')
    else:
        ok(f'APP_VERSION = {version}')

    if version:
        esc = re.escape(version)

        # ── 3. Header headline ────────────────────────────────────
        if not re.search(rf'//\s*v{esc}\s+\d{{4}}-\d{{2}}-\d{{2}}\s+.{{5,}}', html):
            fail(f'No header changelog headline for v{version}')
        else:
            ok(f'Header headline for v{version}')

        # ── 4. CHANGELOG.md full entry ────────────────────────────
        cl = os.path.join(base, 'CHANGELOG.md')
        if not os.path.exists(cl):
            fail('CHANGELOG.md not found')
        elif not re.search(rf'^##\s*v{esc}\s', open(cl, encoding='utf-8').read(), re.M):
            fail(f'CHANGELOG.md has no entry for v{version}')
        else:
            ok(f'CHANGELOG.md entry for v{version}')

        # ── 7. UI version string ──────────────────────────────────
        if f'<span id="verString">v{version}</span>' not in html:
            fail(f'UI version string does not read v{version}')
        else:
            ok('UI version string matches')

    # ── 5. Header not bloated ─────────────────────────────────────
    entries = re.findall(r'^// v[\d.]+\s', html, re.M)
    if len(entries) > KEEP_IN_HEADER:
        fail(f'Header holds {len(entries)} versions, limit is {KEEP_IN_HEADER}')
    else:
        ok(f'Header holds {len(entries)} versions')
    if re.search(r'\[describe changes here\]', html):
        fail('Changelog placeholder left in the file')
    else:
        ok('No changelog placeholder')

    # ── 6. BUILD_TIME ─────────────────────────────────────────────
    bt = re.search(r"const BUILD_TIME\s*=\s*'([^']+)'", html)
    if not bt:
        fail('BUILD_TIME not found')
    elif not re.match(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2} (AM|PM) ET$', bt.group(1)):
        fail(f'BUILD_TIME is not Eastern Time format: {bt.group(1)}')
    else:
        ok(f'BUILD_TIME = {bt.group(1)}')

    # ── 8/9. Service worker ───────────────────────────────────────
    sw_path = os.path.join(base, 'sw.js')
    if not os.path.exists(sw_path):
        fail('sw.js not found')
    else:
        sw = open(sw_path, encoding='utf-8').read()
        r = subprocess.run(['node', '--check', sw_path], capture_output=True, text=True)
        if r.returncode != 0:
            fail('sw.js syntax error:\n' + r.stderr[:300])
        else:
            ok('sw.js syntax valid')
        swm = re.search(r"CACHE_NAME\s*=\s*'bottlefolio-v([\d.]+)'", sw)
        if not swm:
            fail('Could not parse sw.js CACHE_NAME')
        elif version and swm.group(1) != version:
            fail(f'sw.js CACHE_NAME v{swm.group(1)} != APP_VERSION v{version}')
        else:
            ok(f'sw.js CACHE_NAME matches v{version}')
        if 'SKIP_WAITING' not in sw:
            fail('sw.js does not honour SKIP_WAITING — updates would stall')
        else:
            ok('sw.js honours SKIP_WAITING')
        for a in ASSETS:
            if a not in sw:
                fail(f'{a} is not precached in sw.js')
        else:
            ok(f'All {len(ASSETS)} assets precached in sw.js')

    # ── 10. Update handshake on the page ──────────────────────────
    for needle, label in [('SKIP_WAITING', 'page requests SKIP_WAITING'),
                          ('controllerchange', 'page reloads on controllerchange'),
                          ('beforeinstallprompt', 'install prompt captured'),
                          ('CAN_STORE', 'storage availability probed')]:
        if needle not in html:
            fail(f'missing: {label}')
        else:
            ok(label)

    # ── 10b. The mark must be transparent ─────────────────────────
    # A white-backed logo shows as a white square on the parchment page.
    mark = os.path.join(base, 'mark.png')
    if os.path.exists(mark):
        try:
            import struct, zlib
            with open(mark, 'rb') as f:
                head = f.read(26)
            colour_type = head[25]
            if colour_type not in (4, 6):
                fail('mark.png has no alpha channel — it will show as a box')
            else:
                ok('mark.png carries transparency')
        except Exception as e:
            fail('could not read mark.png: %s' % e)

    # ── 10c. Anything a model returns must be verified ────────────
    # The safety story for the AI features is that nothing reaches the screen
    # without being checked against the real shelf.
    if 'verifyProposal' in html:
        for needle, why in [
            ("L.PROPOSAL_MATCH", 'proposal name matching has no threshold'),
            ("not on the shelf", 'proposals are not checked against the shelf'),
            ("'not open'", 'proposals are not checked for pourability')]:
            if needle not in html:
                fail('AI proposals: ' + why)
        else:
            ok('model proposals are verified against the shelf')

    # ── 10d. The nav must not be able to cover content ────────────
    # A fixed bar over a scrolling page overlays content at every scroll
    # position, and bottom padding only lets you reach the last element.
    # MadGolf's structure: body is a fixed-height flex column, the active
    # screen scrolls inside it, the nav is the last item in the column.
    css = html.split('</style>')[0]

    # A SECOND .screen.on rule is as dangerous as a missing one. The correct
    # rule was present the whole time the nav was invisible on a phone — a
    # duplicate later in the file won the cascade and did not carry flex:1,
    # so the screen stopped filling the column and the bar went off the
    # bottom. Checking that the good rule exists cannot catch that.
    n_screen = css.count('.screen.on{display:block')
    if n_screen != 1:
        fail('.screen.on is defined %d times; a later one overrides the '
             'layout rule and drops the nav' % n_screen)

    # Never detach an element that something else looks up by id.
    #
    # I moved the search row by removing it from the document, and every
    # $('#shopQ') in the file — eight of them, one on the first line of
    # renderShop — started returning null. The app failed to start. A smoke
    # test cannot catch it, because a static stub cannot model a runtime
    # removal; the rule can be checked directly.
    for m in re.finditer(r'removeChild\((\w+)\)', html):
        var = m.group(1)
        near = html[max(0, m.start() - 400):m.start()]
        idm = re.search(r"getElementById\('([^']+)'\)", near)
        if not idm:
            continue
        eid = idm.group(1)
        # Does anything look up an id that lives INSIDE that element?
        seg = html.split('id="%s"' % eid)
        if len(seg) > 1:
            inner = re.findall(r'id="([^"]+)"', seg[1][:600])
            for child in inner:
                if html.count("'#%s'" % child) + html.count(
                        "getElementById('%s')" % child) > 1:
                    fail('#%s is detached but #%s inside it is looked up '
                         'elsewhere; detaching makes those return null'
                         % (eid, child))

    # The shelf header and its rows must share ONE grid definition. They
    # were separate elements with the columns copied between them, so every
    # change to a row had to be mirrored by hand and was not — BZ reported
    # the misalignment four times.
    if '.shelfgrid,.item{' not in css:
        fail('the shelf header and rows no longer share one grid rule')
    head = html.split('class="listhead shelfgrid"')
    if len(head) != 2:
        fail('the shelf header does not carry the shared grid class')
    else:
        # A header cell is a plain label OR a sort button. Counting only
        # <b> meant the first sortable header read as five missing columns.
        block = head[1].split('</div>')[0]
        cells = block.count('<b>') + block.count('class="sorthead"')
        cols = css.split('.shelfgrid,.item{')[1].split('}')[0]
        n = len(cols.split('grid-template-columns:')[1]
                .split(';')[0].strip().split())
        if cells != n:
            fail('the shelf header has %d cells against %d columns'
                 % (cells, n))

    layout = [
        ('height:100dvh', 'body is not a fixed-height column'),
        ('.screen.on{display:block;flex:1', 'the active screen does not scroll'),
        ('overflow-y:auto', 'nothing scrolls inside the body'),
        # A scrolling box slices whatever row meets its bottom edge, which
        # reads as content hidden behind the nav. The fade makes the cut
        # deliberate.
        ('mask-image:linear-gradient(to bottom', 'the scroll edge does not fade'),
        # The nav is above the overlay by rule 19, so a bottom-anchored
        # modal must pad for it or its last buttons sit behind the bar.
        # The modal used to clear the nav with bottom padding; it is centred
        # now and clears it with a margin instead. Check the PROPERTY — that
        # it accounts for the bar at all — rather than one way of doing it.
        ('margin-bottom:var(--nav-h)', 'the modal does not clear the nav'),
        # A row that overflows horizontally widens the page, and a page
        # wider than the viewport pushes the nav bar off the bottom. That
        # shipped once; the guard is one line and it cannot ship again.
        # The page must not be able to grow wider than the screen, and the
        # BODY must not scroll — the active screen is the only scroller.
        # Both matter: a wide page pushed the nav off the bottom once, and
        # overflow-x on body pushed it off again, because when one axis is
        # not visible the other computes to auto and the body scrolls.
        ('html,body{max-width:100%}',
         'the page can be widened past the viewport'),
        ('body{overflow:hidden}',
         'the body can scroll, which takes the nav bar with it'),
    ]
    bad = [why for needle, why in layout if needle not in css]
    if 'position:fixed;left:0;right:0;bottom:0' in css:
        bad.append('the nav is fixed over the page again')
    if bad:
        for why in bad:
            fail('layout: ' + why)
    else:
        # Renamed 2026-09-09. It said "nav cannot overlay content", which
        # is a claim about the RESULT, and it tests the CSS TEXT - so it
        # passed happily while BZ had multiple reports of the bar sitting
        # over content on an iPhone. A check that names an outcome it
        # cannot see is the kind that teaches you to trust it wrongly.
        # The real one is in browser.js, which scrolls a screen to the
        # bottom on a phone viewport and measures.
        ok('the layout declarations for the nav are intact (text only)')

    # ── 11. Manifest ──────────────────────────────────────────────
    mf = os.path.join(base, 'manifest.json')
    if not os.path.exists(mf):
        fail('manifest.json not found')
    else:
        try:
            man = json.load(open(mf, encoding='utf-8'))
            if not any(i.get('purpose') == 'maskable' for i in man.get('icons', [])):
                fail('manifest.json has no maskable icon')
            else:
                ok('manifest.json valid with a maskable icon')
        except Exception as e:
            fail(f'manifest.json does not parse: {e}')

    # ── 12. Data payloads ─────────────────────────────────────────
    for name, keys in [('data.json', ['catalog', 'bottles', 'flights']),
                       ('map.json', ['world', 'states', 'coast', 'distilleries'])]:
        p = os.path.join(base, name)
        if not os.path.exists(p):
            fail(f'{name} not found')
            continue
        try:
            d = json.load(open(p, encoding='utf-8'))
            missing = [k for k in keys if k not in d]
            if missing:
                fail(f'{name} is missing {", ".join(missing)}')
            else:
                ok(f'{name} parses and holds {", ".join(keys)}')
        except Exception as e:
            fail(f'{name} does not parse: {e}')

    # ── 14. Lock files ────────────────────────────────────────────
    #
    # Existing is not enough. The lock file is the record of what shipped as
    # this version, and bump.py writes it FROM index.html at bump time — so
    # any edit made after the bump leaves the two different, silently, and
    # the named file BZ uploads is not the file that was tested. That
    # happened on 2026-09-03: a layout fix landed in index.html after
    # v1.26.38 was cut, and every check still passed.
    if version:
        pairs = [(f'bottlefolio-v{version}.html', 'index.html'),
                 (f'bottlefolio-v{version}-sw.js', 'sw.js')]
        for lock, source in pairs:
            lp = os.path.join(base, lock)
            if not os.path.exists(lp):
                fail(f'lock file missing: {lock}')
                continue
            with open(lp, 'rb') as f:
                locked = f.read()
            with open(os.path.join(base, source), 'rb') as f:
                current = f.read()
            if locked != current:
                fail(f'{source} has changed since v{version} was cut: '
                     f'{lock} is {len(locked)} bytes against {len(current)}. '
                     f'Bump, so the named file is the file that was tested.')
            else:
                ok(f'lock file {lock} matches {source}')

    # The wiring check. It reads index.html as text and asks the questions
    # the suite structurally cannot: an element id nobody declares, a
    # literal \u escape in a string, a state key that does not survive a
    # reload, a helper defined and never called. It found three real
    # defects in its first two runs, including a badge that had been
    # writing to a missing element since the Library moved into Settings.
    # Part of the gate rather than a thing to remember to run.
    try:
        r = run_check('consistency.js',
                      ['node', os.path.join(base, 'consistency.js')], 120)
        out = r.stdout or ''
        bad = [ln.strip() for ln in out.split('\n') if '\u2716' in ln]
        # The summary line counts the others and must not be counted as one
        # itself. A first pass filtered on the leading mark, which every
        # line has, so it swallowed the lot and reported clean.
        fired = [b for b in bad if 'checks found something' not in b]
        if fired:
            for b in fired:
                fail('consistency: ' + b.lstrip('\u2716 ').strip())
        elif r.returncode == 0 and 'consistency checks pass' not in out:
            # Exit 0 with no summary is a harness that stopped early and
            # did not say so. Silence is not a pass.
            fail('consistency.js ended without saying its checks passed')
        elif r.returncode == 0:
            ok('the wiring is consistent (consistency.js)')
    except Exception as e:
        fail(f'consistency.js did not run: {e}')

    # Every screen, drawn directly. browser.js walks the app like a person
    # and takes two minutes; most of what it catches is a screen that THREW
    # while drawing, and that does not need clicking to prove. Added after
    # a name collision broke the walk and cost two full runs to find.
    try:
        r = run_check('screens.js',
                      ['node', os.path.join(base, 'screens.js')], 180)
        out = (r.stdout or '') + (r.stderr or '')
        marks = [ln for ln in out.split('\n') if '\u2716' in ln]
        for ln in marks:
            fail('screens: ' + ln.strip().lstrip('\u2716 ').strip())
        if r.returncode == 0 and not marks:
            ok('every screen draws without throwing (screens.js)')
    except Exception as e:
        fail(f'screens.js did not run: {e}')

    # ── Line endings ──────────────────────────────────────────
    # bump.py wrote CRLF on BZ's Windows PC (2026-09-15): text-mode writes
    # translate \n there, the test harness splits the engine on a marker
    # containing \n, and the cloud gate's tests died at load with 'logic
    # block not found'. This audit passed that build, because nothing here
    # looked at line endings. Now it looks.
    crlf = []
    names = ['index.html', 'sw.js', 'CHANGELOG.md']
    if version:
        names += ['bottlefolio-v%s.html' % version, 'bottlefolio-v%s-sw.js' % version]
    for name in names:
        p = os.path.join(base, name)
        if os.path.exists(p) and b'\r\n' in open(p, 'rb').read():
            crlf.append(name)
    if crlf:
        fail('Windows line endings (CRLF) in ' + ', '.join(crlf)
             + ' - the test harness cannot find the engine in them')
    else:
        ok('line endings are LF')

    print()
    if failures == 0:
        print('  \u2714 All checks passed — safe to deliver\n')
    else:
        print(f'  \u2716 {failures} check(s) failed — DO NOT DELIVER\n')
    return failures == 0


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else \
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
    sys.exit(0 if run_audit(path) else 1)
