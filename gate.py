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
    python3 gate.py --fast       the eight quick ones only, all at once
    python3 gate.py --slow       walk and sync only

Expectations come from gatetime.py's record: the median of the last nine
runs, which is rule 13e. Under nine it says so rather than inventing one.
"""
import json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, '.gatetimes.json')

FAST = [
    ('audit',       ['python3', 'audit.py', 'index.html']),
    ('tests',       ['node', 'killer-bs-test.js']),
    ('lint',        ['node', 'lint.js']),
    ('consistency', ['node', 'consistency.js']),
    ('screens',     ['node', 'screens.js']),
    # The sentences, and the phone. Every other check proves the code runs;
    # these two ask what it SAID and how wide it was - the two faults that
    # reached BZ on 2026-09-15 with 4,700 assertions green.
    ('answers',     ['node', 'answers.js']),
    ('shots',       ['node', 'shots.js']),
    # SCREENS IN SEQUENCE, not one at a time. shots.js draws each screen
    # alone and photographs it; this draws them in PAIRS and asks what the
    # one before left behind. Added 2026-09-20, after a flight opened from
    # a bottle page inherited the bottle's two-column layout and was drawn
    # in strips a few words wide, and the detail header collected a More
    # button on every redraw - neither of which a single screen can show.
    ('sequence',    ['node', 'seq.js']),
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
    # The Firebase rules, run in Google's emulator rather than read
    # (2026-09-16). Needs Java, which the cloud runner has.
    ('rules', ['node', 'rulestest.js']),
]

# EACH GROUP RUNS AT ONCE, AND THE NEXT WAITS FOR IT TO PASS.
#
# Review item 29, 2026-09-15: the cloud gate took 91 seconds and the eight
# fast checks spent 21 of them waiting for each other. None of them shares
# anything with another. Each reads the project's files, and the ones that
# drive a browser serve those files to a browser of their own on a fake
# origin through Playwright's router, so there is no port to collide on.
# Nothing is written that another reads: the audit's scratch copy of the
# script is its own, and .gatetimes.json is written by this file after
# every step has finished. So they start together, and a group takes as
# long as its slowest member rather than the sum of them all.
#
# The results still PRINT IN THIS ORDER, one line each, whatever order they
# finish in (rule 35), because a list that reorders itself every run cannot
# be read against the last one. And nothing in a group starts until every
# step in the group before it has passed, as before: a build that fails the
# half-second suite is not worth a minute of browser.
#
# EXCEPT THE SUITE, WHICH GOES FIRST WITH THE AUDIT AND NOTHING ELSE. §385
# in killer-bs-test.js queues four jobs of a 5ms timer each and then waits
# a fixed 120ms for all four; started beside five Chromiums it counted three
# (2026-09-15, one run in three on four CPUs). The queue was right - the
# wait was the wall clock, and a loaded machine stretches it. The suite
# takes half a second, so running it where nothing competes costs less than
# a flaky gate, and the printed order is unchanged.
#
# AND THE WALK AND SYNC SIDE BY SIDE, which is the one that needed proving.
# The walk sleeps a fixed time in about 130 places and a busy machine could
# make it flaky, so this was adopted only after NINE CONSECUTIVE RUNS of
# the whole gate passed with the two together, pinned to four CPUs - the
# size of GitHub's runner - on 2026-09-15. Walk 51.9s against 50.9 on its
# own, sync 23.2 against 22.8, the pair 51.9 against 73.7 one after the
# other (medians of nine and five). If the walk ever starts failing on a
# timing alone, this is the first thing to split back: [FAST[:2], FAST[2:],
# SLOW[:1], SLOW[1:]] runs them one after the other again.
GROUPS = [FAST[:2], FAST[2:], SLOW]

# The audit runs consistency.js and screens.js itself, for push.py's local
# audit. Here both are steps of their own, so the audit's copies ran the
# same two harnesses a second time in every gate. This tells the audit to
# leave them out. It is set on the audit's own process only, never on this
# one, so no other harness can see it.
HAND_OVER = 'GATE_RUNS_CONSISTENCY_AND_SCREENS'

# WHAT THE AUDIT JUDGED THAT THIS FILE DID NOT. Once the audit hands those
# two over, they must be judged here at least as hard as the audit judged
# them. consistency.js reports a finding with a mark and exits 0 either
# way, so the audit also failed it for ending without its pass line: that is
# a harness that stopped early and did not say so. And the audit read the
# marks on stderr as well as stdout, for both.
MUST_SAY = {'consistency': 'consistency checks pass',
            # A skip is not a pass: without this line the rules were not run.
            'rules': 'all rules checks pass'}
BOTH_STREAMS = ('consistency', 'screens')

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


def failed(name, r):
    """A step fails on a non-zero exit or a failure mark, and the two the
    audit handed over are judged by its rules as well (MUST_SAY above)."""
    out = r.stdout or ''
    if name in BOTH_STREAMS:
        out += '\n' + (r.stderr or '')
    if r.returncode != 0 or '✖' in out or '✗' in out:
        return True
    return name in MUST_SAY and MUST_SAY[name] not in out


def record(h, name, took):
    h.setdefault(name, []).append(round(took, 1))
    h[name] = h[name][-30:]


def group_key(group):
    """A group of one is its step. A group of several keeps its own record
    under all its names joined, because its time is the slowest member's
    under contention and matches no single step's."""
    return '+'.join(n for n, _ in group)


def run_step(name, cmd, env):
    """One step, timed by itself, so each step's time is its own even while
    others run beside it."""
    t0 = time.time()
    if name == 'sync':
        r = run_sync(cmd)
    else:
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE,
                           env=env)
    return r, time.time() - t0


def run_group(group, hand_over):
    """Every step in the group at once. The results come back in the
    group's own order, never the order they finished in."""
    jobs = []
    for name, cmd in group:
        env = dict(os.environ)
        if name == 'audit' and hand_over:
            env[HAND_OVER] = '1'
        jobs.append((name, cmd, env))
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = [pool.submit(run_step, *job) for job in jobs]
        return [f.result() for f in futures]


def main():
    args = sys.argv[1:]
    # By what the groups HOLD, never by their position: the fast steps are
    # two groups, and taking the first group as "fast" ran two of the eight
    # and passed a build with a broken twotab (found by breaking it on
    # purpose, 2026-09-15).
    groups = GROUPS
    if '--fast' in args:
        groups = [g for g in GROUPS if all(s in FAST for s in g)]
    elif '--slow' in args:
        groups = [g for g in GROUPS if all(s in SLOW for s in g)]
    steps = [s for g in groups for s in g]
    names = [n for n, _ in steps]
    # Only when this run includes both steps the audit would leave out.
    hand_over = all(n in names for n in ('audit', 'consistency', 'screens'))

    # The whole run's expectation is the sum of its GROUPS, since a group
    # takes as long as its slowest member. Until every group has nine runs
    # on record it says so rather than adding up the ones it has.
    h = history()
    exp = [expected(h, group_key(g)) for g in groups]
    if all(exp):
        print('running %d steps, about %.0fs expected\n'
              % (len(steps), sum(exp)))
    else:
        print('running %d steps, no expectation yet (under nine runs '
              'on record)\n' % len(steps))

    t_all = time.time()
    bad = []
    for group in groups:
        t0 = time.time()
        results = run_group(group, hand_over)
        took_all = time.time() - t0

        for (name, cmd), (r, took) in zip(group, results):
            e = expected(h, name)
            record(h, name, took)
            lines = [l for l in (r.stdout or '').strip().split('\n')
                     if l.strip()]
            last = lines[-1].strip()[:60] if lines else '(no output)'
            no = failed(name, r)
            mark = 'FAIL' if no else 'ok  '
            against = ('%5.1fs against %.0fs' % (took, e)) if e \
                else ('%5.1fs (no expectation yet)' % took)
            print('%-12s %s  %s  %s' % (name, mark, against, last))
            if no:
                bad.append((name, r, lines))

        if len(group) > 1:
            e = expected(h, group_key(group))
            record(h, group_key(group), took_all)
            print('%-12s       %.1fs for these %d at once%s'
                  % ('', took_all, len(group),
                     (', against %.0fs' % e) if e else ''))

        if bad:
            for name, r, lines in bad:
                print('')
                print('%s:' % name)
                print('\n'.join('    ' + l for l in lines[-16:]))
                # THE ERROR IS THE USEFUL PART. A crash writes to stderr and
                # this printed stdout only, so the cloud gate reported "tests
                # FAIL 0.0s (no output)" for a harness that had thrown at
                # load (2026-09-15, CRLF from bump.py on Windows).
                err = [l for l in (r.stderr or '').strip().split('\n')
                       if l.strip()]
                if err:
                    print('\n'.join('    ' + l for l in err[-16:]))
                if name in MUST_SAY and r.returncode == 0 \
                        and MUST_SAY[name] not in (r.stdout or ''):
                    print('    ended without saying "%s"' % MUST_SAY[name])
            break

    with open(LOG, 'w') as f:
        json.dump(h, f)

    print('')
    if bad:
        print('✖ STOPPED AT %s after %.0fs — DO NOT SHIP'
              % (', '.join(n for n, _, _ in bad), time.time() - t_all))
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
