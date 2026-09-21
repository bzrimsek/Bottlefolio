#!/usr/bin/env python3
"""Push a finished build to GitHub, gate it in the cloud, and wait until it is live.

BZ, after about twenty-five builds in a day: honestly we have so many
builds that I hate the process and want automation. Then, on 2026-09-15,
moving from the web container to his own PC: automation from build to
deploy to git, and not local - we need to push this live when we go.

So this is the whole road, in one command:

    python bump.py "what changed"      the version, as always (rule 9)
    python push.py                     everything below

  1. The audit runs here first. It is the check that says the named lock is
     the file that was tested (rule 25), and it takes seconds.
  2. No earlier gate run may still be going. This build is made on main as
     it is NOW, and a run still gating is about to move main - so a build
     pushed under it can never publish, and before gate.yml checked for
     that it could deploy its service and rules first and go half-live.
     Refused, with that run's link.
  3. BZ's shelf files are re-sealed if they changed. The repo is public and
     the suite needs them, so only encrypted copies ever leave this PC.
  4. Every changed file goes to the `build` branch as ONE commit. The old
     version of this script wrote one commit per file, and Pages redeployed
     after each - six half-updated sites in a row on the morning of
     2026-09-15.
  5. GitHub runs the full gate on that commit (.github/workflows/gate.yml).
     Green moves `main`, Pages serves it, and the run waits until the live
     site says the new version. Red stops before `main` moves: the live site
     is untouched.
  6. This script watches that run and prints each step as it finishes, so
     nobody waits in silence - for twenty minutes at most, after which it
     stops watching and says what to check.

Credentials: the `gh` command's own sign-in (`gh auth login`, stored in
Windows Credential Manager). This script never sees a token.

Usage:
    python push.py                 push, then watch the cloud gate to the end
    python push.py --no-wait       push and return without watching
    python push.py --dry-run       say what would be pushed; push nothing and
                                   write nothing here, sealed files included
"""

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

REPO = 'bzrimsek/Bottlefolio'
LIVE = 'https://bzrimsek.github.io/Bottlefolio/'
BRANCH = 'build'
HERE = os.path.dirname(os.path.abspath(__file__))
KEYFILE = os.path.join(os.path.expanduser('~'), '.bottlefolio', 'shelf.key')
SEALSTATE = os.path.join(HERE, '.sealstate.json')

# How long the watch follows a run before it stops and says what to check.
# The job's own limit in gate.yml is thirty minutes; this is shorter so the
# person at the keyboard hears something before GitHub gives up on it.
WATCH_LIMIT = 20 * 60

# What a passing fault looks like from gh: GitHub's own 5xx, or the network
# between here and it. Anything else - a 404, a 403, a malformed request -
# is an answer, and asking again would only get the same one.
TRANSIENT = re.compile(r'HTTP 5\d\d|timed out|timeout|connection (reset|refused)'
                       r'|error connecting|dial tcp|no such host|TLS handshake'
                       r'|unexpected EOF|temporar', re.I)

# What a delivery is. The app and its lock files (rule 25), the docs that
# teach the next session (CLAUDE.md is read at the start of every one), the
# gate and everything it needs to run in the cloud, and the service files so
# the repo is the whole project rather than a copy of part of it.
APP = ['index.html', 'sw.js', 'manifest.json', 'data.json', 'map.json',
       'mark.png', 'icon-192.png', 'icon-512.png', 'icon-mask-192.png',
       'icon-mask-512.png', 'zxing.min.js']
# README.md added 2026-09-15 with review item 39, when HANDOVER/HANDOFF/
# REVIEW/RECAP-SETUP were retired to _superseded (which NEVER blocks). It is
# the front door of a public repo, so a repo without it is a repo whose only
# description of itself is a 1.9MB file.
# LICENSE added 2026-09-20. The repo is public and carried none, which
# reads as help yourself - and the written content is the part worth
# protecting. A licence that stays on this PC protects nothing.
DOCS = ['CHANGELOG.md', 'CLAUDE.md', 'DEV-RULES.md', 'BACKLOG.md',
        'README.md', 'LICENSE']
TOOLING = ['killer-bs-test.js', 'consistency.js', 'browser.js', 'screens.js',
           'render.js', 'sync.js', 'twotab.js', 'lint.js', 'gscheck.js',
           # 2026-09-15: the two checks that read what the screen SAYS and
           # how wide it is. Everything else here proves the code runs.
           'answers.js', 'shots.js',
           # 2026-09-20: screens in sequence, for what one leaves behind.
           'seq.js',
           'fake-firebase.js', 'papers.js', 'smoke.js', 'audit.py',
           'bump.py', 'ship.py', 'gate.py', 'gatetime.py', 'push.py',
           'rules.js',
           # 2026-09-16: one engine loader for every tool, and the nightly
           # popular count that uses it.
           'engine.js', 'popular.js', '.github/workflows/popular.yml',
           # 2026-09-16: loads public reference data into shared/ref (run by hand).
           'refdata.js', '.github/workflows/refdata.yml',
           # 2026-09-17: the nightly read of what the app's log says
           # went wrong, on every account.
           'logwatch.js', '.github/workflows/logwatch.yml',
           # The rules, run in the emulator (cloud gate only).
           'rulestest.js', 'syncemu.js', 'firebase.json',
           'package.json', 'package-lock.json', '.github/workflows/gate.yml']
# The cloud gate deploys Code.gs, label.gs, recap.gs, shelf.gs and
# apps-script/appsscript.json - the live project's exact file set, checked by
# cloning it on 2026-09-15. lookup.gs and recap-handler.gs ride along for the
# record only; the workflow never sends them to Apps Script.
SERVICE = ['Code.gs', 'lookup.gs', 'shelf.gs', 'label.gs', 'recap.gs',
           'recap-handler.gs', 'apps-script/appsscript.json',
           'firebase-rules.json']
# bz-custom.json joined on 2026-09-20: the products only BZ's account knows,
# which the harnesses need to make sense of his shelf. His data, so sealed.
SHELF = ['bz-bottles.json', 'bz-flights.json',
         'bz-custom.json']                          # sealed, never plain

# NEVER, whatever the lists above say. The repo is public and main is a
# website: BZ's shelf, his exports and the database dump are his, and the
# key would unlock the sealed copies. A name matching any of these stops
# the push before anything leaves.
NEVER = [r'^bz-(bottles|flights|custom)\.json$', r'\.csv$', r'\.xlsx$',
         r'rtdb-export', r'shelf\.key$', r'^_superseded/', r'\.sealstate',
         # A Firebase admin key can rewrite the whole database. One landed in
         # this folder on 2026-09-15 on its way to ~/.bottlefolio.
         r'adminsdk', r'firebase-admin', r'\.clasprc', r'service.?account']


def gh_path():
    found = shutil.which('gh')
    if found:
        return found
    default = r'C:\Program Files\GitHub CLI\gh.exe'
    if os.path.exists(default):
        return default
    sys.exit('The gh command is not installed. See CLAUDE.md, "Building".')


GH = None


def gh(path, method='GET', body=None, quiet404=False, retry=False):
    """One GitHub API call through gh's own sign-in. Returns parsed JSON,
    or None for a 404 when asked to treat that as an answer.

    With retry, a passing fault - GitHub's own 5xx, or the network dropping
    for a moment - is asked again, four tries in all over about a minute.
    The watch asks for that: it polls for minutes, and one 502 in the
    middle used to print "GitHub refused" and end this script while the
    gate carried on with nobody watching it."""
    cmd = [GH, 'api', '-X', method, path]
    data = None
    if body is not None:
        cmd += ['--input', '-']
        data = json.dumps(body).encode()
    waits = [5, 15, 40] if retry else []
    tries = 0
    while True:
        tries += 1
        r = subprocess.run(cmd, input=data, capture_output=True)
        if not r.returncode:
            break
        err = (r.stderr or r.stdout).decode(errors='replace').strip()
        if quiet404 and 'HTTP 404' in err:
            return None
        if retry and TRANSIENT.search(err):
            if waits:
                wait = waits.pop(0)
                say('  (GitHub did not answer %s %s: %s - asking again in %ds)'
                    % (method, path.split('?')[0],
                       (err.splitlines() or ['?'])[0][:120], wait))
                time.sleep(wait)
                continue
            sys.exit('GitHub did not answer %s %s after %d tries: %s\n'
                     'This script has stopped; nothing on GitHub has. Follow '
                     'the run at https://github.com/%s/actions'
                     % (method, path, tries, err[:300], REPO))
        sys.exit('GitHub refused %s %s: %s' % (method, path, err[:300]))
    out = r.stdout.decode()
    return json.loads(out) if out.strip() else {}


def say(msg):
    print(msg, flush=True)


def version():
    with open(os.path.join(HERE, 'index.html'), encoding='utf-8') as fh:
        m = re.search(r"const APP_VERSION\s*=\s*'([\d.]+)'", fh.read())
    if not m:
        sys.exit('No APP_VERSION in index.html')
    return m.group(1)


def blob_sha(raw):
    """Git's own hash for a file, computed the same way GitHub computes it,
    so 'already there' is a comparison and not an upload."""
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\x00' + raw).hexdigest()


def audited():
    env = dict(os.environ, PYTHONUTF8='1')
    r = subprocess.run([sys.executable, 'audit.py', 'index.html'], cwd=HERE,
                       capture_output=True, text=True, encoding='utf-8',
                       errors='replace', env=env)
    out = r.stdout + r.stderr
    ok = r.returncode == 0 and 'All checks passed' in out
    if not ok:
        say(out[-1500:])
    return ok


def gate_busy():
    """The gate run on `build` that has not finished yet, or None.

    Two pushes close together are how a build could go half-live. This
    script makes each build on main as it is NOW and force-moves `build`
    onto it, so a second push while the first is still gating makes a
    commit on a main that is about to move. The first run publishes; the
    second could deploy its service and rules and then fail to move main.
    gate.yml now refuses that before deploying anything - this stops the
    stale build being made at all. Any status but completed counts:
    queued, waiting and in progress all mean main may yet move."""
    runs = gh('repos/%s/actions/workflows/gate.yml/runs?branch=%s&per_page=20'
              % (REPO, BRANCH))
    for run in runs.get('workflow_runs', []):
        if run.get('status') != 'completed':
            return run
    return None


def msys(p):
    """Git's gpg reads paths the Unix way: C:\\x becomes /c/x."""
    p = os.path.abspath(p).replace('\\', '/')
    return '/' + p[0].lower() + p[2:] if p[1:2] == ':' else p


def gpg_path():
    for p in (shutil.which('gpg'), r'C:\Program Files\Git\usr\bin\gpg.exe'):
        if p and os.path.exists(p):
            return p
    sys.exit('gpg not found - it comes with Git for Windows.')


def seal_shelf(dry=False):
    """Re-encrypt BZ's shelf files if they changed since they were last
    sealed. gpg output differs on every run (a fresh salt), so the decision
    is made on the PLAIN file's hash, recorded here and never pushed.

    A dry run only says what it WOULD seal. It used to seal for real and
    rewrite .sealstate.json on every run, dry or not, so "push nothing"
    still changed files in this folder - and the state file's date moved
    even when nothing had been sealed. Now a dry run writes nothing, and a
    real run writes the state only when it sealed something."""
    try:
        state = json.load(open(SEALSTATE, encoding='utf-8'))
    except Exception:
        state = {}
    due = []
    for name in SHELF:
        plain_path = os.path.join(HERE, name)
        if not os.path.exists(plain_path):
            continue
        with open(plain_path, 'rb') as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        if state.get(name) != digest or not os.path.exists(plain_path + '.gpg'):
            due.append(name)
    if not due:
        return
    if dry:
        for name in due:
            say('  would seal %s -> %s.gpg (changed since last push); '
                'dry run, left alone' % (name, name))
        return
    if not os.path.exists(KEYFILE):
        sys.exit('No shelf key at %s - the sealed files cannot be made.' % KEYFILE)
    key = open(KEYFILE, encoding='ascii').read().strip().encode()
    gpg = gpg_path()
    home = tempfile.mkdtemp(prefix='gpghome-')
    base = [gpg, '--homedir', msys(home), '--batch', '--yes', '--quiet',
            '--pinentry-mode', 'loopback', '--passphrase-fd', '0']
    try:
        for name in due:
            plain_path = os.path.join(HERE, name)
            sealed = plain_path + '.gpg'
            plain = open(plain_path, 'rb').read()
            r = subprocess.run(base + ['--symmetric', '--cipher-algo', 'AES256',
                                       '-o', msys(sealed), msys(plain_path)],
                               input=key, capture_output=True)
            if r.returncode:
                sys.exit('Sealing %s failed: %s' % (name, r.stderr.decode(errors='replace')[:300]))
            back = subprocess.run(base + ['--decrypt', msys(sealed)], input=key,
                                  capture_output=True)
            if back.returncode or back.stdout != plain:
                sys.exit('Sealed %s does not open back to the same file. Nothing pushed.' % name)
            state[name] = hashlib.sha256(plain).hexdigest()
            say('  sealed   %s -> %s.gpg (changed since last push)' % (name, name))
    finally:
        shutil.rmtree(home, ignore_errors=True)
    # LF, like every other file here, on Windows too.
    with open(SEALSTATE, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(state, fh, indent=1)


def wanted(v):
    names = APP + ['bottlefolio-v%s.html' % v, 'bottlefolio-v%s-sw.js' % v]
    names += DOCS + TOOLING + SERVICE + [n + '.gpg' for n in SHELF]
    for n in names:
        for pat in NEVER:
            if re.search(pat, n):
                sys.exit('REFUSED: %s matches a never-push rule (%s).' % (n, pat))
    return names


def push(v, subject, dry):
    main = gh('repos/%s/git/ref/heads/main' % REPO)
    main_sha = main['object']['sha']
    tree = gh('repos/%s/git/trees/%s?recursive=1' % (REPO, main_sha))
    have = {t['path']: t['sha'] for t in tree['tree'] if t['type'] == 'blob'}

    changed, missing = [], []
    for name in wanted(v):
        path = os.path.join(HERE, name.replace('/', os.sep))
        if not os.path.exists(path):
            missing.append(name)
            continue
        raw = open(path, 'rb').read()
        if have.get(name) != blob_sha(raw):
            changed.append((name, raw))

    for name in missing:
        say('  (not in this folder, left as it is on GitHub: %s)' % name)
    if not changed:
        say('Nothing differs from what main already has. Nothing pushed.')
        return None
    say('%d file(s) differ from the live main:' % len(changed))
    for name, raw in changed:
        say('  %-34s %8d bytes' % (name, len(raw)))
    if dry:
        say('Dry run: nothing pushed.')
        return None

    entries = []
    for name, raw in changed:
        b = gh('repos/%s/git/blobs' % REPO, 'POST',
               {'content': base64.b64encode(raw).decode(), 'encoding': 'base64'})
        entries.append({'path': name, 'mode': '100644', 'type': 'blob', 'sha': b['sha']})
    new_tree = gh('repos/%s/git/trees' % REPO, 'POST',
                  {'base_tree': tree['sha'], 'tree': entries})
    message = 'Bottlefolio %s: %s' % (v, subject) if subject else 'Bottlefolio %s' % v
    commit = gh('repos/%s/git/commits' % REPO, 'POST',
                {'message': message, 'tree': new_tree['sha'], 'parents': [main_sha]})
    # `build` is always main plus this build, so it is simply moved.
    if gh('repos/%s/git/ref/heads/%s' % (REPO, BRANCH), quiet404=True):
        gh('repos/%s/git/refs/heads/%s' % (REPO, BRANCH), 'PATCH',
           {'sha': commit['sha'], 'force': True})
    else:
        gh('repos/%s/git/refs' % REPO, 'POST',
           {'ref': 'refs/heads/%s' % BRANCH, 'sha': commit['sha']})
    say('Pushed %d file(s) to %s as one commit %s.' % (len(changed), BRANCH, commit['sha'][:7]))
    return commit['sha']


def watch(sha, v):
    """Follow the cloud gate for this commit, a line per finished step.

    For WATCH_LIMIT at most. Past that something is stuck, and a script
    that polls for ever is a wait with no evidence in it (rule 35) - so it
    stops and says what to look at. Stopping here stops nothing on GitHub:
    the run carries on and still decides on its own whether main moves."""
    deadline = time.time() + WATCH_LIMIT
    say('\nWaiting for GitHub to start the gate...')
    run = None
    for _ in range(40):
        runs = gh('repos/%s/actions/runs?head_sha=%s&per_page=5' % (REPO, sha),
                  retry=True)
        if runs.get('workflow_runs'):
            run = runs['workflow_runs'][0]
            break
        time.sleep(3)
    if not run:
        sys.exit('GitHub did not start a gate run for %s within two minutes. '
                 'Check https://github.com/%s/actions' % (sha[:7], REPO))
    say('Gate started: %s' % run['html_url'])
    t0 = time.time()
    shown = set()
    while True:
        if time.time() > deadline:
            say('\nStopped watching after %d minutes, with the gate still %s.'
                % (WATCH_LIMIT // 60, run.get('status', 'running').replace('_', ' ')))
            say('Nothing on GitHub was stopped: the run carries on, and only a '
                'green one moves main.')
            say('Check, in this order:')
            say('  1. The run: %s - which step it is on, or how it ended. '
                'Red means the live site is unchanged.' % run['html_url'])
            say('  2. Whether v%s published: `python push.py --dry-run` says '
                '"Nothing differs from what main already has" once it has.' % v)
            say('  3. The live site: %s' % LIVE)
            return 1
        jobs = gh('repos/%s/actions/runs/%d/jobs' % (REPO, run['id']), retry=True)
        for job in jobs.get('jobs', []):
            for step in job.get('steps', []):
                key = (job['id'], step['number'])
                if step['status'] == 'completed' and key not in shown:
                    shown.add(key)
                    mark = {'success': 'ok  ', 'skipped': 'skip'}.get(step['conclusion'], 'FAIL')
                    say('  %s  %4.0fs  %s' % (mark, time.time() - t0, step['name']))
        run = gh('repos/%s/actions/runs/%d' % (REPO, run['id']), retry=True)
        if run['status'] == 'completed':
            break
        time.sleep(8)
    if run['conclusion'] == 'success':
        say('\nLIVE: v%s at %s  (%.0fs from push to live)' % (v, LIVE, time.time() - t0))
        return 0
    say('\nThe gate did NOT pass (%s). The live site is unchanged.' % run['conclusion'])
    r = subprocess.run([GH, 'run', 'view', str(run['id']), '--repo', REPO, '--log-failed'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    tail = [l for l in r.stdout.splitlines() if l.strip()][-40:]
    say('\n'.join(tail))
    say('\nFull log: %s' % run['html_url'])
    return 1


def main():
    global GH
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    subject = ' '.join(args).strip()
    GH = gh_path()
    v = version()
    say('Bottlefolio v%s\n' % v)

    say('1. audit, here')
    if not audited():
        sys.exit('The audit has not passed. Nothing pushed.')
    say('   passed')

    say('2. nothing else gating')
    busy = gate_busy()
    if busy:
        why = ('A gate run on %s is still %s: %s\n'
               'Wait for it to finish, then push again. A build pushed now '
               'would be made on the main that run is about to move.'
               % (BRANCH, busy['status'].replace('_', ' '), busy['html_url']))
        if not dry:
            sys.exit('REFUSED. ' + why + ' Nothing pushed.')
        say('   a real push would be REFUSED now. ' + why)
    else:
        say('   no gate run on %s is queued or running' % BRANCH)

    say('3. shelf files')
    seal_shelf(dry)
    say('   checked; a dry run writes nothing' if dry else '   sealed copies current')

    say('4. push')
    sha = push(v, subject, dry)
    if not sha:
        return 0
    if '--no-wait' in sys.argv:
        say('Not waiting. Follow it at https://github.com/%s/actions' % REPO)
        return 0

    say('5. the cloud gate, then live')
    return watch(sha, v)


if __name__ == '__main__':
    sys.exit(main())
