#!/usr/bin/env python3
"""The whole gate in one command, so there is no gap for me to stall in.

BZ, after a build that went well: that build process was way better, but it
seems to me like I needed to prompt you to continue. He did - twice in one
run. The pattern is always the same: I finish a step, report it, and then
write a sentence describing what comes NEXT instead of running it. "Walk
next, 43s" is a promise, not a step.

So the steps stop being separate turns. This runs all nine, prints each as
it lands with actual against expected, and stops at the first failure with
enough of its output to act on. One call, no gaps.

The cost is honest and worth saying: output only appears when a command
finishes, so this is ~145 seconds with nothing on screen and then
everything at once. The alternative - a call per step - shows progress and
gives me nine chances to stop. Chunked mode is still there for when
somebody wants to watch it:

    python3 gate.py              everything, one call
    python3 gate.py --fast       the seven quick ones only (25s)
    python3 gate.py --slow       walk and sync only (120s)

Expectations come from gatetime.py's record: the median of the last nine
runs, which is rule 13e. Under nine it says so rather than inventing one.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, '.gatetimes.json')

FAST = [
    ('audit',       ['python3', 'audit.py', 'index.html']),
    ('tests',       ['node', 'killer-bs-test.js']),
    ('lint',        ['node', 'lint.js']),
    ('consistency', ['node', 'consistency.js']),
    ('screens',     ['node', 'screens.js']),
    ('render',      ['node', 'render.js']),
    ('twotab',      ['node', 'twotab.js']),
    # The four .gs files that answer the app. Added after a duplicate
    # doPost in recap-handler.gs broke two features and nothing on this
    # side could see it, because every check ever written for this app
    # reads index.html.
    ('appsscript',  ['node', 'gscheck.js']),
]
SLOW = [
    ('walk',  ['node', 'browser.js']),
    ('sync',  ['node', 'sync.js']),
]

# SYNC IN THREE, AT ONCE.
#
# The seventeen sync scenarios are independent by construction - each has
# its own page and its own seeded database - which is what made slicing
# possible in the first place. Running the slices as three PROCESSES needs
# no restructuring of the six hundred lines inside: 76 seconds becomes 53.
#
# Two slices was the obvious split and gave 62, because scenario 8 is much
# heavier than the rest and one half carried it alone. Three balances
# better. Measured, not guessed, like everything else in this file.
SYNC_SLICES = [(1, 6), (7, 12), (13, 18)]


def history():
    try:
        with open(LOG) as f:
            return json.load(f)
    except Exception:
        return {}


def expected(h, step):
    runs = h.get(step, [])
    if len(runs) < 9:
        return None
    return sorted(runs[-9:])[4]


def main():
    args = sys.argv[1:]
    steps = FAST + SLOW
    if '--fast' in args:
        steps = FAST
    elif '--slow' in args:
        steps = SLOW

    h = history()
    total = sum(expected(h, n) or 0 for n, _ in steps)
    print('running %d steps, about %.0fs expected\n' % (len(steps), total))

    t_all = time.time()
    bad = None
    for name, cmd in steps:
        e = expected(h, name)
        t0 = time.time()
        if name == 'sync':
            # Three at once. Each slice reports its own pass line; the step
            # fails if any of them does.
            procs = []
            for lo, hi in SYNC_SLICES:
                env = dict(os.environ)
                env['SYNC_FROM'] = str(lo)
                env['SYNC_TO'] = str(hi)
                procs.append(subprocess.Popen(
                    cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, cwd=HERE, env=env))
            outs = [p2.communicate()[0] for p2 in procs]
            codes = [p2.returncode for p2 in procs]
            r = subprocess.CompletedProcess(
                cmd, max(codes) if codes else 0, '\n'.join(outs), '')
        else:
            r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
        took = time.time() - t0
        h.setdefault(name, []).append(round(took, 1))
        h[name] = h[name][-30:]

        lines = [l for l in r.stdout.strip().split('\n') if l.strip()]
        last = lines[-1].strip()[:60] if lines else '(no output)'
        failed = r.returncode != 0 or '\u2716' in r.stdout \
            or '\u2717' in r.stdout
        mark = 'FAIL' if failed else 'ok  '
        against = ('%5.1fs against %.0fs' % (took, e)) if e \
            else ('%5.1fs (no expectation yet)' % took)
        print('%-12s %s  %s  %s' % (name, mark, against, last))

        if failed:
            bad = name
            print('')
            print('\n'.join('    ' + l for l in lines[-16:]))
            break

    with open(LOG, 'w') as f:
        json.dump(h, f)

    print('')
    if bad:
        print('\u2716 STOPPED AT %s after %.0fs \u2014 DO NOT SHIP'
              % (bad, time.time() - t_all))
        sys.exit(1)
    print('\u2714 all %d steps passed in %.0fs'
          % (len(steps), time.time() - t_all))


if __name__ == '__main__':
    main()
