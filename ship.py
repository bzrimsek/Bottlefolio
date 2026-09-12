#!/usr/bin/env python3
"""ship.py — Killer B's Bottle Tracker pre-ship gate.

Runs the pre-delivery audit AND the test harness. Refuses to ship unless BOTH
pass. This is the single gate: run `python3 ship.py` before every push.
Nothing ships red.

Usage: python3 ship.py [path/to/index.html]     check, and list what to upload
       python3 ship.py --shipped                record that you HAVE uploaded

Exit 0 = safe to ship.  Exit 1 = do not ship.

Checking never records. An earlier version recorded on every run, so a
verification run before a bump marked files as shipped that had not been
uploaded, and the next run then called them unchanged. Recording is an
explicit act now, because only you know when the files actually went up.

Expects audit.py, killer-bs-test.js, sw.js and index.html in the same folder.
"""
import sys, os, re, json, hashlib, subprocess

# What actually goes to the web host. The tooling (bump, audit, ship,
# validate, lookup.gs) and the notes never do.
DEPLOYABLE = ['index.html', 'sw.js', 'manifest.json', 'data.json', 'map.json',
              'mark.png', 'icon-192.png', 'icon-512.png',
              # Maskable, with a safe zone, so Android's circular crop
              # does not cut the B's edge off the home screen.
              'icon-mask-192.png', 'icon-mask-512.png']
STATE = '.shipstate.json'


def digest(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def changed_since_last_ship(base, ver):
    """Which deployable files differ from the last successful ship.

    Recorded rather than remembered: after a long session it is very easy to
    re-upload eight files when two changed, or worse, to miss one."""
    now = {}
    for name in DEPLOYABLE:
        p = os.path.join(base, name)
        if os.path.exists(p):
            now[name] = digest(p)
    for lock in ('killer-bs-v%s.html' % ver, 'killer-bs-v%s-sw.js' % ver):
        if os.path.exists(os.path.join(base, lock)):
            now[lock] = 'lock'

    path = os.path.join(base, STATE)
    prev = {}
    if os.path.exists(path):
        try:
            prev = json.load(open(path, encoding='utf-8')).get('files', {})
        except Exception:
            prev = {}
    changed = [n for n, h in now.items()
               if n.startswith('killer-bs-v') or prev.get(n) != h]
    return now, changed, bool(prev)


def record_ship(base, ver, now):
    json.dump({'version': ver, 'files': now},
              open(os.path.join(base, STATE), 'w'), indent=1)

HERE = os.path.dirname(os.path.abspath(__file__))


def locate(name, alt_dir):
    for d in (HERE, alt_dir):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    index = os.path.abspath(args[0] if args else os.path.join(HERE, 'index.html'))
    base = os.path.dirname(index)

    if not os.path.exists(index):
        print(f'\n  \u2716 index.html not found at {index}\n')
        return 1

    audit = locate('audit.py', base)
    tests = locate('killer-bs-test.js', base)

    m = re.search(r"APP_VERSION\s*=\s*'([\d.]+)'", open(index, encoding='utf-8').read())
    ver = m.group(1) if m else '?'

    print(f'\n\u2550\u2550\u2550\u2550\u2550\u2550 ship gate \u2014 Killer B\u2019s Bottle Tracker v{ver} \u2550\u2550\u2550\u2550\u2550\u2550\n')
    ok = True

    # 1) Audit ────────────────────────────────────────────────
    if not audit:
        print('  \u2716 audit.py not found alongside index.html'); ok = False
    else:
        print('\u25b8 audit')
        r = subprocess.run(['python3', audit, index], capture_output=True, text=True)
        if r.returncode != 0:
            sys.stdout.write(r.stdout + r.stderr)
            print('  \u2716 AUDIT FAILED'); ok = False
        else:
            print('  \u2713 audit passed')

    # 2) Data QA ──────────────────────────────────────────────
    qa = locate('validate.py', base)
    if qa:
        print('▸ data')
        r = subprocess.run(['python3', qa, os.path.join(base, 'data.json'), '--strict'],
                           capture_output=True, text=True)
        if r.returncode != 0:
            sys.stdout.write(r.stdout + r.stderr)
            print('  ✖ DATA QA FAILED'); ok = False
        else:
            line = next((l.strip() for l in r.stdout.splitlines() if 'errors' in l), '')
            print(f'  ✓ {line}')

    # 3) Tests ────────────────────────────────────────────────
    if not tests:
        print('  \u2716 killer-bs-test.js not found alongside index.html'); ok = False
    else:
        print('\u25b8 tests')
        r = subprocess.run(['node', tests], capture_output=True, text=True, cwd=base)
        out = r.stdout + r.stderr
        if r.returncode != 0:
            sys.stdout.write(out)
            print('  \u2716 TESTS FAILED'); ok = False
        else:
            summary = next((l.strip() for l in out.splitlines() if 'passed' in l),
                           'tests passed')
            print(f'  \u2713 {summary}')

    # The sync cycle ──────────────────────────────────────────
    # Dark from v1.9.10 to v1.9.27 because the fake could not build a
    # reference — every ref() built its parent, down to a root that built
    # itself for ever — and the failure read as though the app never
    # reached auth. It was never in the gate, so nothing noticed for
    # seventeen builds. It is in the gate now: this covers the merge, which
    # decides which copy of a shelf survives, and that is the last place
    # anybody should be running on trust.
    sync = locate('sync.js', base)
    if not sync:
        print('  \u25b8 sync — sync.js not found, skipped')
    else:
        print('\u25b8 sync')
        r = subprocess.run(['node', sync], capture_output=True, text=True, cwd=base)
        out = r.stdout + r.stderr
        if r.returncode != 0 or '\u2716' in out:
            sys.stdout.write(out)
            print('  \u2716 SYNC FAILED'); ok = False
        else:
            summary = next((l.strip() for l in out.splitlines()
                            if 'cycle holds' in l), 'sync passed')
            print(f'  \u2713 {summary}')

    # The linter ──────────────────────────────────────────────
    # Two ReferenceErrors reached real users on 2026-09-10 in a build this
    # gate had passed, and nothing here could see either: a variable that
    # does not exist in its scope is invisible to a text check, to
    # node --check (both files parse), and to every harness that never
    # executes that line. This is the check that catches them. Proved by
    # putting both faults back and watching it name them.
    lint = locate('lint.js', base)
    if not lint:
        print('  \u25b8 lint \u2014 lint.js not found, skipped')
    else:
        print('\u25b8 lint')
        r = subprocess.run(['node', lint], capture_output=True, text=True,
                           cwd=base)
        sys.stdout.write(r.stdout)
        if r.returncode != 0:
            print('  \u2716 LINT FAILED'); ok = False

    # The scans that were not in the gate ─────────────────────
    # Four harnesses existed and this ran none of them. It cost exactly
    # what you would expect: screens.js had been pointing at
    # /home/claude/kb, a container path from an earlier session, so it
    # threw before doing anything and had been unable to run for weeks —
    # and nothing said so, because nothing asked it to run. It was also
    # still expecting renderShared, a screen deleted in thread 6.
    #
    # A scan that cannot start is worse than one that fails: a failure gets
    # reported. Found 2026-09-09 when BZ asked for all of them to be run,
    # and the fix is not to remember to run them — it is this.
    #
    # browser.js is the slow one, about a minute. That is the price of a
    # gate that covers the walk, and it is cheaper than the round it takes
    # to discover a dead screen from a screenshot.
    for name, label, want in (
            ('screens.js', 'screens', 'screens draw'),
            ('render.js', 'render', 'agree with the engine'),
            ('twotab.js', 'two tabs', 'two tabs'),
            ('browser.js', 'walk', 'loads, every screen draws')):
        path = locate(name, base)
        if not path:
            print(f'  \u25b8 {label} \u2014 {name} not found, skipped')
            continue
        print(f'\u25b8 {label}')
        r = subprocess.run(['node', path], capture_output=True, text=True,
                           cwd=base)
        out = r.stdout + r.stderr
        if r.returncode != 0 or '\u2716' in out:
            sys.stdout.write(out[-4000:])
            print(f'  \u2716 {label.upper()} FAILED'); ok = False
        else:
            summary = next((l.strip() for l in out.splitlines()
                            if want in l), f'{label} passed')
            print(f'  \u2713 {summary[:150]}')

    # Verdict ─────────────────────────────────────────────────
    print()
    if ok:
        print(f'  \u2714 SAFE TO SHIP \u2014 v{ver}')
        now, changed, had_state = changed_since_last_ship(base, ver)
        print('\n  UPLOAD THESE:')
        for name in sorted(changed):
            print('    ' + name)
        if not had_state:
            print('\n    (first recorded ship \u2014 everything above is listed;'
                  ' later ships list only what changed)')
        else:
            same = sorted(set(now) - set(changed))
            if same:
                print('\n  unchanged, leave them alone:')
                print('    ' + ', '.join(same))
        tests = os.path.join(base, 'killer-bs-test.js')
        if os.path.exists(tests):
            print('\n    (+ killer-bs-test.js if tests changed this session'
                  ' \u2014 rule 29)')
        if '--shipped' in sys.argv:
            record_ship(base, ver, now)
            print('\n  recorded as shipped \u2014 the next run compares against this.')
        else:
            print('\n    run  python3 ship.py --shipped  once they are uploaded,')
            print('    so the next run can tell you what changed.')
        print()
        return 0
    print('  \u2716 DO NOT SHIP \u2014 fix the failure(s) above\n')
    return 1


if __name__ == '__main__':
    sys.exit(main())
