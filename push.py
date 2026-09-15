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
  2. BZ's shelf files are re-sealed if they changed. The repo is public and
     the suite needs them, so only encrypted copies ever leave this PC.
  3. Every changed file goes to the `build` branch as ONE commit. The old
     version of this script wrote one commit per file, and Pages redeployed
     after each - six half-updated sites in a row on the morning of
     2026-09-15.
  4. GitHub runs the full gate on that commit (.github/workflows/gate.yml).
     Green moves `main`, Pages serves it, and the run waits until the live
     site says the new version. Red stops before `main` moves: the live site
     is untouched.
  5. This script watches that run and prints each step as it finishes, so
     nobody waits in silence.

Credentials: the `gh` command's own sign-in (`gh auth login`, stored in
Windows Credential Manager). This script never sees a token.

Usage:
    python push.py                 push, then watch the cloud gate to the end
    python push.py --no-wait       push and return without watching
    python push.py --dry-run       say what would be pushed, push nothing
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

# What a delivery is. The app and its lock files (rule 25), the docs that
# teach the next session (CLAUDE.md is read at the start of every one), the
# gate and everything it needs to run in the cloud, and the service files so
# the repo is the whole project rather than a copy of part of it.
APP = ['index.html', 'sw.js', 'manifest.json', 'data.json', 'map.json',
       'mark.png', 'icon-192.png', 'icon-512.png', 'icon-mask-192.png',
       'icon-mask-512.png', 'zxing.min.js']
DOCS = ['CHANGELOG.md', 'CLAUDE.md', 'DEV-RULES.md', 'BACKLOG.md']
TOOLING = ['killer-bs-test.js', 'consistency.js', 'browser.js', 'screens.js',
           'render.js', 'sync.js', 'twotab.js', 'lint.js', 'gscheck.js',
           'fake-firebase.js', 'papers.js', 'smoke.js', 'audit.py',
           'bump.py', 'ship.py', 'gate.py', 'gatetime.py', 'push.py',
           'rules.js',
           'package.json', 'package-lock.json', '.github/workflows/gate.yml']
# The cloud gate deploys Code.gs, label.gs, recap.gs, shelf.gs and
# apps-script/appsscript.json - the live project's exact file set, checked by
# cloning it on 2026-09-15. lookup.gs and recap-handler.gs ride along for the
# record only; the workflow never sends them to Apps Script.
SERVICE = ['Code.gs', 'lookup.gs', 'shelf.gs', 'label.gs', 'recap.gs',
           'recap-handler.gs', 'apps-script/appsscript.json',
           'firebase-rules.json']
SHELF = ['bz-bottles.json', 'bz-flights.json']      # sealed, never plain

# NEVER, whatever the lists above say. The repo is public and main is a
# website: BZ's shelf, his exports and the database dump are his, and the
# key would unlock the sealed copies. A name matching any of these stops
# the push before anything leaves.
NEVER = [r'^bz-(bottles|flights)\.json$', r'\.csv$', r'\.xlsx$',
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


def gh(path, method='GET', body=None, quiet404=False):
    """One GitHub API call through gh's own sign-in. Returns parsed JSON,
    or None for a 404 when asked to treat that as an answer."""
    cmd = [GH, 'api', '-X', method, path]
    data = None
    if body is not None:
        cmd += ['--input', '-']
        data = json.dumps(body).encode()
    r = subprocess.run(cmd, input=data, capture_output=True)
    if r.returncode:
        err = (r.stderr or r.stdout).decode(errors='replace')
        if quiet404 and 'HTTP 404' in err:
            return None
        sys.exit('GitHub refused %s %s: %s' % (method, path, err.strip()[:300]))
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


def msys(p):
    """Git's gpg reads paths the Unix way: C:\\x becomes /c/x."""
    p = os.path.abspath(p).replace('\\', '/')
    return '/' + p[0].lower() + p[2:] if p[1:2] == ':' else p


def gpg_path():
    for p in (shutil.which('gpg'), r'C:\Program Files\Git\usr\bin\gpg.exe'):
        if p and os.path.exists(p):
            return p
    sys.exit('gpg not found - it comes with Git for Windows.')


def seal_shelf():
    """Re-encrypt BZ's shelf files if they changed since they were last
    sealed. gpg output differs on every run (a fresh salt), so the decision
    is made on the PLAIN file's hash, recorded here and never pushed."""
    if not os.path.exists(KEYFILE):
        sys.exit('No shelf key at %s - the sealed files cannot be made.' % KEYFILE)
    key = open(KEYFILE, encoding='ascii').read().strip().encode()
    try:
        state = json.load(open(SEALSTATE, encoding='utf-8'))
    except Exception:
        state = {}
    gpg = gpg_path()
    home = tempfile.mkdtemp(prefix='gpghome-')
    base = [gpg, '--homedir', msys(home), '--batch', '--yes', '--quiet',
            '--pinentry-mode', 'loopback', '--passphrase-fd', '0']
    for name in SHELF:
        plain_path = os.path.join(HERE, name)
        sealed = plain_path + '.gpg'
        if not os.path.exists(plain_path):
            continue
        plain = open(plain_path, 'rb').read()
        digest = hashlib.sha256(plain).hexdigest()
        if state.get(name) == digest and os.path.exists(sealed):
            continue
        r = subprocess.run(base + ['--symmetric', '--cipher-algo', 'AES256',
                                   '-o', msys(sealed), msys(plain_path)],
                           input=key, capture_output=True)
        if r.returncode:
            sys.exit('Sealing %s failed: %s' % (name, r.stderr.decode(errors='replace')[:300]))
        back = subprocess.run(base + ['--decrypt', msys(sealed)], input=key,
                              capture_output=True)
        if back.returncode or back.stdout != plain:
            sys.exit('Sealed %s does not open back to the same file. Nothing pushed.' % name)
        state[name] = digest
        say('  sealed   %s -> %s.gpg (changed since last push)' % (name, name))
    json.dump(state, open(SEALSTATE, 'w', encoding='utf-8'), indent=1)
    shutil.rmtree(home, ignore_errors=True)


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
    """Follow the cloud gate for this commit, a line per finished step."""
    say('\nWaiting for GitHub to start the gate...')
    run = None
    for _ in range(40):
        runs = gh('repos/%s/actions/runs?head_sha=%s&per_page=5' % (REPO, sha))
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
        jobs = gh('repos/%s/actions/runs/%d/jobs' % (REPO, run['id']))
        for job in jobs.get('jobs', []):
            for step in job.get('steps', []):
                key = (job['id'], step['number'])
                if step['status'] == 'completed' and key not in shown:
                    shown.add(key)
                    mark = {'success': 'ok  ', 'skipped': 'skip'}.get(step['conclusion'], 'FAIL')
                    say('  %s  %4.0fs  %s' % (mark, time.time() - t0, step['name']))
        run = gh('repos/%s/actions/runs/%d' % (REPO, run['id']))
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

    say('2. shelf files')
    seal_shelf()
    say('   sealed copies current')

    say('3. push')
    sha = push(v, subject, dry)
    if not sha:
        return 0
    if '--no-wait' in sys.argv:
        say('Not waiting. Follow it at https://github.com/%s/actions' % REPO)
        return 0

    say('4. the cloud gate, then live')
    return watch(sha, v)


if __name__ == '__main__':
    sys.exit(main())
