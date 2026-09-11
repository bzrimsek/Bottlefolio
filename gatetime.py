#!/usr/bin/env python3
"""Time every step of the gate, and remember what it learned.

BZ, after I told him the walk takes 40 seconds when it took 70: how many
times have you done the walk? Dozens - and every one of those runs went
through a shell with a clock available while I piped the output through
grep -c and threw the timing away. So after dozens of runs I had no number,
and when asked I invented one.

So: instrument the whole process, track times, use them to keep him up to
date. Then measure actual against expected, then WHY, then learn for the
next go.

Every run appends to .gatetimes.json. The expectation for a step is the
MEDIAN of its last nine runs, which is BZ's own rule 13e - anything that
varies gets nine runs and a median. Under nine, it says so rather than
pretending to know.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, '.gatetimes.json')
KEEP = 30                      # per step, so a median of nine always exists

STEPS = [
    ('audit',       ['python3', 'audit.py', 'index.html']),
    ('tests',       ['node', 'killer-bs-test.js']),
    ('lint',        ['node', 'lint.js']),
    ('consistency', ['node', 'consistency.js']),
    ('screens',     ['node', 'screens.js']),
    ('render',      ['node', 'render.js']),
    ('sync',        ['node', 'sync.js']),
    ('twotab',      ['node', 'twotab.js']),
    ('walk',        ['node', 'browser.js']),
]


def history():
    try:
        with open(LOG) as f:
            return json.load(f)
    except Exception:
        return {}


def expected(h, step):
    runs = h.get(step, [])
    if len(runs) < 9:
        return None, len(runs)
    last = sorted(runs[-9:])
    return last[4], len(runs)


def main():
    only = sys.argv[1:] or None
    h = history()
    total_exp = 0
    for name, _ in STEPS:
        if only and name not in only:
            continue
        e, n = expected(h, name)
        if e:
            total_exp += e
    if total_exp:
        print('expected total: %.0fs (median of the last nine)' % total_exp)
    else:
        print('no expectation yet — fewer than nine runs on record')

    worst = []
    for name, cmd in STEPS:
        if only and name not in only:
            continue
        e, n = expected(h, name)
        t0 = time.time()
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
        took = time.time() - t0
        h.setdefault(name, []).append(round(took, 1))
        h[name] = h[name][-KEEP:]
        tail = [l for l in r.stdout.strip().split('\n') if l.strip()]
        last = tail[-1][:64] if tail else '(no output)'
        bad = r.returncode != 0 or '✖' in r.stdout or '✗' in r.stdout
        if e:
            drift = took - e
            mark = '' if abs(drift) < max(2.0, e * 0.25) \
                else '  <-- %+.0fs against %.0fs expected' % (drift, e)
            if mark:
                worst.append((name, e, took))
            print('%-12s %5.1fs  (expected %.0fs, %d runs)%s'
                  % (name, took, e, n, mark))
        else:
            print('%-12s %5.1fs  (no expectation, %d run%s on record)'
                  % (name, took, n + 1, '' if n == 0 else 's'))
        print('             %s %s' % ('FAIL' if bad else 'ok  ', last))
        if bad:
            print('\n'.join('             ' + l for l in tail[-12:]))
            break

    with open(LOG, 'w') as f:
        json.dump(h, f)

    if worst:
        print('\nOff expectation:')
        for name, e, took in worst:
            print('  %-12s %.1fs against %.0fs' % (name, took, e))


if __name__ == '__main__':
    main()
