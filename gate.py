#!/usr/bin/env python3
"""The whole gate in one command, so there is no gap for me to stall in.

BZ, after a build that went well: that build process was way better, but it
seems to me like I needed to prompt you to continue. He did - twice in one
run. The pattern is always the same: I finish a step, report it, and then
write a sentence describing what comes NEXT instead of running it. "Walk
next, 43s" is a promise, not a step.

So the steps stop being separate turns. This runs all ten, prints each as
it lands with actual against expected, and stops at the first failure with
enough of its output to act on. One call, no gaps.

The cost is honest and worth saying: output only appears when a command
finishes, so this is ~145 seconds with nothing on screen and then
everything at once. The alternative - a call per step - shows progress and
gives me ten chances to stop. Chunked mode is still there for when
somebody wants to watch it:

    python3 gate.py              everything, one call
    python3 gate.py --fast       the eight quick ones only (25s)
    python3 gate.py --slow       walk and sync only (120s)

Expectations come from gatetime.py's record: the median of the last nine
runs, which is rule 13e. Under nine it says so rather than inventing one.
"""
import json, os, re, subprocess, sys, time

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
# The sync scenarios are independent by construction - each has its own
# page and its own seeded database - which is what made slicing possible
# in the first place. Running the slices as three PROCESSES needs no
# restructuring of the six hundred lines inside: 76 seconds becomes 53.
#
# Two slices was the obvious split and gave 62, because scenario 8 is much
# heavier than the rest and one half carried it alone. Three balances
# better. Measured, not guessed, like everything else in this file.
#
# THE LAST SLICE RUNS TO THE END. It read (13, 18) while sync.js grew to
# nineteen scenarios, so scenario 19 never ran in the gate and the step was
# green without it - sync.js said so itself, "scenarios 13-18 of 19", on a
# line nothing read. sync.js takes SYNC_TO=0 as no upper bound (SLICE_TO is
# 0 and inSlice() reads 0 as the end), so a scenario added later joins the
# last slice on its own. And run_sync() reads that line back from every
# slice and fails if any scenario from 1 to sync.js's own total went unrun,
# so the next gap is a red gate rather than a quiet one.
SYNC_SLICES = [(1, 6), (7, 12), (13, 0)]


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


def sync_coverage(outs):
    """What the slices left out, as a sentence, or None when every scenario
    ran. The total comes from sync.js's own 'scenarios 13-19 of 19' line and
    never from a number written here: a count typed into this file is the
    thing that went stale."""
    total, ran = None, set()
    for (lo, hi), out in zip(SYNC_SLICES, outs):
        m = re.search(r'scenarios (\d+)-(\d+) of (\d+)', out)
        if not m:
            return ('the %d-%s slice never said which scenarios it ran'
                    % (lo, hi or 'end'))
        first, last, n = (int(g) for g in m.groups())
        if total is not None and n != total:
            return ('the slices disagree on how many scenarios sync.js has '
                    '(%d and %d)' % (total, n))
        total = n
        ran.update(range(first, last + 1))
    missing = [n for n in range(1, (total or 0) + 1) if n not in ran]
    if missing:
        return ('scenario %s of %d never ran - SYNC_SLICES does not cover '
                'sync.js' % (', '.join(str(n) for n in missing), total))
    return None


def run_sync(cmd):
    """Three at once. Each slice reports its own pass line; the step fails
    if any of them does, or if between them they left a scenario out."""
    procs = []
    for lo, hi in SYNC_SLICES:
        env = dict(os.environ)
        env['SYNC_FROM'] = str(lo)
        env['SYNC_TO'] = str(hi)
        procs.append(subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, cwd=HERE, env=env))
    outs = [p2.communicate()[0] for p2 in procs]
    code = max(p2.returncode for p2 in procs) if procs else 0
    gap = sync_coverage(outs)
    if gap:
        outs.append('  ✖ ' + gap)
        code = code or 1
    return subprocess.CompletedProcess(cmd, code, '\n'.join(outs), '')


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
            r = run_sync(cmd)
        else:
            r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
        took = time.time() - t0
        h.setdefault(name, []).append(round(took, 1))
        h[name] = h[name][-30:]

        lines = [l for l in r.stdout.strip().split('\n') if l.strip()]
        last = lines[-1].strip()[:60] if lines else '(no output)'
        failed = r.returncode != 0 or '✖' in r.stdout \
            or '✗' in r.stdout
        mark = 'FAIL' if failed else 'ok  '
        against = ('%5.1fs against %.0fs' % (took, e)) if e \
            else ('%5.1fs (no expectation yet)' % took)
        print('%-12s %s  %s  %s' % (name, mark, against, last))

        if failed:
            bad = name
            print('')
            print('\n'.join('    ' + l for l in lines[-16:]))
            # THE ERROR IS THE USEFUL PART. A crash writes to stderr and this
            # printed stdout only, so the cloud gate reported "tests FAIL
            # 0.0s (no output)" for a harness that had thrown at load
            # (2026-09-15, CRLF from bump.py on Windows).
            err = [l for l in (r.stderr or '').strip().split('\n') if l.strip()]
            if err:
                print('\n'.join('    ' + l for l in err[-16:]))
            break

    with open(LOG, 'w') as f:
        json.dump(h, f)

    print('')
    if bad:
        print('✖ STOPPED AT %s after %.0fs — DO NOT SHIP'
              % (bad, time.time() - t_all))
        sys.exit(1)
    print('✔ all %d steps passed in %.0fs'
          % (len(steps), time.time() - t_all))

    # AND PUSH, IF ASKED. BZ: can't we automate that push after a build?
    #
    # The push hangs off the END of the gate rather than being its own
    # command, because that is the only ordering where a red build cannot
    # reach the repo: the failure path above exits 1 and never arrives
    # here. A separate push command is one somebody can run first.
    #
    # Off by default. `python3 gate.py --push` is a decision, and a build
    # that goes to the repo the moment it goes green is a build nobody
    # looked at.
    if '--push' in sys.argv:
        print('')
        r = subprocess.run([sys.executable, 'push.py'], cwd=HERE)
        if r.returncode:
            print('✖ the gate passed and the push did not')
            sys.exit(1)


if __name__ == '__main__':
    main()
