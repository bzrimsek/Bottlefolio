#!/usr/bin/env python3
"""
Version bumper for Killer B's Bottle Tracker.

The ONLY way versions change. Reads the system clock -- never accepts a
timestamp argument, never asks anyone what time it is.

Writes five locations, matching the MadGolf convention:
  1. index.html header comment  "Version : vX.Y.Z  Build <stamp>"
  2. index.html  const APP_VERSION
  3. index.html  const BUILD_TIME
  4. index.html  UI string  <span id="verString">
  5. sw.js       CACHE_NAME

Plus the changelog, written in two places from one entry:
  - index.html's canonical CHANGELOG block gets the HEADLINE only (the first
    sentence, capped), newest first, in MadGolf's line format:
        // vX.Y.Z  YYYY-MM-DD  headline
  - CHANGELOG.md gets the entry in full.
The header keeps the most recent KEEP_IN_HEADER versions; older ones live on
in CHANGELOG.md. Nothing is lost, and the header stays readable at v2.00.

Build stamps are Eastern Time, as MadGolf's are.

Usage:
    python3 bump.py "changelog entry describing this change"
"""
import re
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent
INDEX = HERE / 'index.html'
SW = HERE / 'sw.js'
CHANGELOG = HERE / 'CHANGELOG.md'

# How many versions stay in the file header. Older entries are still in
# CHANGELOG.md; this only governs how far a reader scrolls to reach the code.
KEEP_IN_HEADER = 10
HEADLINE_MAX = 150
ROLLED = '// Older entries are in CHANGELOG.md.'


def headline(entry):
    """First sentence, trimmed to something that fits one line."""
    m = re.match(r'(.+?[.!?])(\s|$)', entry)
    head = (m.group(1) if m else entry).strip()
    if len(head) > HEADLINE_MAX:
        head = head[:HEADLINE_MAX].rsplit(' ', 1)[0].rstrip(' ,;:') + '\u2026'
    return head


def eastern_now():
    """Eastern Time without a tz-database dependency: EDT (UTC-4) from the
    second Sunday in March to the first Sunday in November, else EST."""
    utc = datetime.now(timezone.utc)

    def nth_sunday(year, month, n):
        d = datetime(year, month, 1, tzinfo=timezone.utc)
        d += timedelta(days=(6 - d.weekday()) % 7)      # first Sunday
        return d + timedelta(weeks=n - 1)

    y = utc.year
    dst_start = nth_sunday(y, 3, 2).replace(hour=7)     # 2am EST = 07:00 UTC
    dst_end = nth_sunday(y, 11, 1).replace(hour=6)      # 2am EDT = 06:00 UTC
    offset = -4 if dst_start <= utc < dst_end else -5
    return utc + timedelta(hours=offset)


def read_version(text):
    m = re.search(r"const APP_VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'", text)
    if not m:
        sys.exit('APP_VERSION not found in index.html — cannot bump.')
    return [int(g) for g in m.groups()]


def next_version(major, minor, patch):
    patch += 1
    if patch >= 100:
        patch, minor = 0, minor + 1
    if minor >= 100:
        minor, major = 0, major + 1
    return major, minor, patch


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        sys.exit('Refusing to bump: a changelog entry is required.\n'
                 'Usage: python3 bump.py [--renumber] [x.y.z] "what changed"')

    # An explicit version, for a release that is a statement rather than an
    # increment. Everything else about the bump is unchanged, so a
    # deliberate 1.0 still goes through the changelog and the same five
    # write locations.
    forced = None
    args = sys.argv[1:]
    # Going BACKWARD is refused below, because doing it by accident renames
    # a release to a number that already shipped. Doing it on purpose is a
    # different act and says so: --renumber. BZ asked for 1.5.0 from
    # 1.26.39 on 2026-09-03 — the number as a statement about where the app
    # has got to, rather than a count of how often it has been touched.
    renumber = False
    if args and args[0].strip() == '--renumber':
        renumber = True
        args = args[1:]
    if re.fullmatch(r'\d+\.\d+\.\d+', args[0].strip()):
        forced = tuple(int(x) for x in args[0].strip().split('.'))
        args = args[1:]
        if not args or not ' '.join(args).strip():
            sys.exit('Refusing to bump: a changelog entry is still required.')
    entry = ' '.join(' '.join(args).split())
    if '[describe changes here]' in entry:
        sys.exit('Refusing to bump: changelog placeholder not filled in.')

    html = INDEX.read_text()
    sw = SW.read_text()

    cur = tuple(read_version(html))
    if forced:
        if forced == cur and renumber:
            # THE CACHE NAME CARRIES THE VERSION, so re-cutting the same
            # number gives the service worker an identical CACHE_NAME and
            # no reason to believe anything changed. BZ, after 2.1.0 was
            # re-cut four times in an afternoon: I don't think mobile is
            # picking up the change if the version is the same. It was not,
            # and it could not have. Corrections to an unreleased number
            # are fine; once it has been uploaded, the number has to move.
            print('  ! RE-CUTTING THE SAME VERSION. sw.js CACHE_NAME will '
                  'be identical, so any')
            print('    device that already has ' + '%d.%d.%d' % cur
                  + ' will not see this as an update.')
            print('    Only do this if that build never left this folder.')
        if forced <= cur and not renumber:
            sys.exit('Refusing to bump: %d.%d.%d is not ahead of %d.%d.%d.\n'
                     'If you mean it, say so: bump.py --renumber x.y.z "entry"'
                     % (forced + cur))
        major, minor, patch = forced
    else:
        major, minor, patch = next_version(*cur)
    ver = '%d.%d.%d' % (major, minor, patch)
    now = eastern_now()
    stamp = now.strftime('%Y-%m-%d %I:%M %p ET')
    day = now.strftime('%Y-%m-%d')

    # 1. header comment
    html, n = re.subn(r'(     Version : v)[\d.]+(  Build ).*',
                      lambda m: m.group(1) + ver + m.group(2) + stamp, html, count=1)
    if not n:
        sys.exit('Header "Version :" line not found — cannot bump.')

    # Header carries the headline; CHANGELOG.md carries the whole entry.
    head = headline(entry)
    html, n = re.subn(r'(\nCHANGELOG\n)',
                      lambda m: m.group(1) + '// v%s  %s  %s\n' % (ver, day, head),
                      html, count=1)
    if not n:
        sys.exit('CHANGELOG block not found — cannot bump.')

    # Keep only the most recent KEEP_IN_HEADER versions in the header.
    block = re.search(r'\nCHANGELOG\n((?:(?://.*)?\n)+?)-->', html)
    if block:
        lines = [l for l in block.group(1).split('\n')
                 if l.startswith('// v')]
        if len(lines) > KEEP_IN_HEADER:
            html = html.replace(block.group(1),
                                '\n'.join(lines[:KEEP_IN_HEADER] + [ROLLED]) + '\n', 1)

    # 2-4. constants and UI string
    html = re.sub(r"(const APP_VERSION\s*=\s*')[\d.]+(')",
                  lambda m: m.group(1) + ver + m.group(2), html, count=1)
    html = re.sub(r"(const BUILD_TIME\s*=\s*')[^']*(')",
                  lambda m: m.group(1) + stamp + m.group(2), html, count=1)
    html = re.sub(r'(<span id="verString">)[^<]*(</span>)',
                  lambda m: m.group(1) + 'v' + ver + m.group(2), html, count=1)

    # 5. service worker cache name
    sw, n = re.subn(r"(const CACHE_NAME\s*=\s*'bottlefolio-v)[\d.]+(')",
                    lambda m: m.group(1) + ver + m.group(2), sw, count=1)
    if not n:
        sys.exit('CACHE_NAME not found in sw.js — cannot bump.')

    # CHANGELOG.md: newest first, full text, one section per version.
    header = ("# Killer B's Bottle Tracker \u2014 changelog\n\n"
              "Newest first. The file header in index.html carries the "
              "headlines; the full entries live here.\n")
    body = CHANGELOG.read_text() if CHANGELOG.exists() else header
    record = '\n## v%s  \u00b7  %s\n\n%s\n' % (ver, stamp, entry)
    marker = 'live here.\n'
    if marker in body:
        body = body.replace(marker, marker + record, 1)
    else:
        body = body.rstrip() + '\n' + record

    INDEX.write_text(html)
    SW.write_text(sw)
    CHANGELOG.write_text(body)

    # Lock files, cut from the working copies just written (rule 23).
    lock_html = HERE / ('bottlefolio-v%s.html' % ver)
    lock_sw = HERE / ('bottlefolio-v%s-sw.js' % ver)
    shutil.copy(INDEX, lock_html)
    shutil.copy(SW, lock_sw)
    # Previous version's locks are superseded; leaving them accumulates
    # near-identical files nobody reads.
    # Both prefixes: the locks were killer-bs-v* before the rename and a
    # superseded one under the old name is still superseded.
    for old in list(HERE.glob('killer-bs-v*')) + list(HERE.glob('bottlefolio-v*')):
        if old.name not in (lock_html.name, lock_sw.name) \
                and re.match(r'(killer-bs|bottlefolio)-v[\d.]+(-sw\.js|\.html)$',
                             old.name):
            old.unlink()
    print('bumped to v%s  Build %s' % (ver, stamp))
    print('header:    // v%s  %s  %s' % (ver, day, head))
    if head.rstrip('\u2026') != entry.strip().rstrip('.'):
        print('full entry (%d chars) written to CHANGELOG.md' % len(entry))
    print('locks:     bottlefolio-v%s.html + bottlefolio-v%s-sw.js' % (ver, ver))
    print('now run:   python3 ship.py')


if __name__ == '__main__':
    main()
