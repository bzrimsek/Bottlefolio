"""index.html with its comments removed, and the proof that nothing else moved.

The app is one 2.8MB file and 42% of it is comments the browser downloads and
never reads. This writes the delivered copy without them: 2.8MB to 1.6MB raw,
944KB to 455KB gzipped. index.html itself is never touched - it stays the
source, the file every harness tests, and the file the named lock is cut from.

    python thin.py index.html site/index.html   strip, prove, write
    python thin.py --verify index.html          prove only, write nothing

Either form REFUSES, with a reason and a non-zero exit, unless the stripped
text holds the same code tokens as the source and still carries every anchor
another file slices it on. audit.py runs --verify, so a push cannot happen
while that proof fails; gate.yml runs the two-argument form to produce the
file the site serves.
"""
import gzip
import io
import os
import sys

# The two comments that must survive, matched as substrings of the comment.
#
# admin.html and engine.js find the end of the engine by searching index.html
# for the STATE + RENDER banner, which IS a comment: strip it and admin.html
# cannot boot, which is the failure admin.js tests for. The author header is
# kept because a file served to strangers should say whose it is.
KEEP = ('STATE + RENDER', 'BiZStoryGuru')

# Strings that must appear in the output, each one an anchor another file
# slices index.html on. engine.js and consistency.js take the engine between
# the first two; admin.html takes the engine, the Firebase config, the
# version and the lookup address.
ANCHORS = ('const L = {};', 'STATE + RENDER', 'APP_VERSION',
           'databaseURL', 'DEFAULT_LOOKUP_URL')


def blocks(s):
    """Every comment in the text, as (start, end, kind, text).

    A scanner rather than a regex, because `/*` inside a string literal and
    `//` inside a URL are not comments. Walks once, tracking whether the
    position can begin a comment, a string, or a regex literal.
    """
    out = []
    i, n = 0, len(s)
    prev = ''
    while i < n:
        c = s[i]
        two = s[i:i + 2]
        if two == '/*':
            j = s.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append((i, j, 'block', s[i:j]))
            i = j
            continue
        if two == '//':
            j = s.find('\n', i)
            j = n if j < 0 else j
            out.append((i, j, 'line', s[i:j]))
            i = j
            continue
        if s[i:i + 4] == '<!--':
            j = s.find('-->', i)
            j = n if j < 0 else j + 3
            out.append((i, j, 'html', s[i:j]))
            i = j
            continue
        if c in '"\'`':
            # The whole literal is opaque, including a template's ${} - which
            # holds code, so a comment could live there. None do, and treating
            # it as opaque is the safe way to be wrong: a comment left in is a
            # few bytes, a string cut open is a broken app.
            q = c
            i += 1
            while i < n:
                if s[i] == '\\':
                    i += 2
                    continue
                if s[i] == q:
                    i += 1
                    break
                i += 1
            prev = 'val'
            continue
        if c == '/' and prev in ('', 'op'):
            # A regex literal, whose [] class may hold an unescaped slash.
            # Reached only after an operator: after a value the same slash is
            # a division, and reading it as a regex would swallow the line.
            j = i + 1
            cls = False
            while j < n and s[j] != '\n':
                if s[j] == '\\':
                    j += 2
                    continue
                if s[j] == '[':
                    cls = True
                elif s[j] == ']':
                    cls = False
                elif s[j] == '/' and not cls:
                    j += 1
                    break
                j += 1
            i = j
            prev = 'val'
            continue
        if not c.isspace():
            prev = 'val' if (c.isalnum() or c in '_$).]}') else 'op'
        i += 1
    return out


def codeonly(s):
    """The text with every comment blanked and all whitespace collapsed.

    Two texts with the same codeonly() differ only inside comments. This is
    the whole proof the build step rests on.
    """
    keep = []
    at = 0
    for a, b, kind, txt in blocks(s):
        keep.append(s[at:a])
        keep.append(''.join(ch if ch == '\n' else ' ' for ch in txt))
        at = b
    keep.append(s[at:])
    return ' '.join(''.join(keep).split())


def thin(src):
    """The text with its comments removed, keeping the two in KEEP."""
    out = []
    at = 0
    for a, b, kind, txt in blocks(src):
        if any(k in txt for k in KEEP):
            continue
        out.append(src[at:a])
        # A block comment between two tokens is a separator, so it leaves one
        # space behind: `a/**/b` is two names, not one.
        out.append('' if kind == 'line' else ' ')
        at = b
    out.append(src[at:])
    s = ''.join(out)
    # The blank lines the comments left behind - several thousand of them.
    s = '\n'.join(l.rstrip() for l in s.split('\n'))
    while '\n\n\n' in s:
        s = s.replace('\n\n\n', '\n\n')
    return s


def check(src, out):
    """Everything wrong with a stripped text, as a list of sentences."""
    wrong = []
    if codeonly(src) != codeonly(out):
        a, b = codeonly(src), codeonly(out)
        where = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]),
                     min(len(a), len(b)))
        wrong.append('the code is not the same: first difference at %d, '
                     'around %r' % (where, a[max(0, where - 60):where + 60]))
    for anchor in ANCHORS:
        if anchor not in out:
            wrong.append('%r is gone, and another file slices on it' % anchor)
    if len(out) >= len(src):
        wrong.append('nothing was removed, so the step did nothing')
    return wrong


# The five cases the scanner has to get right, each with the stripped text it
# must produce. index.html happens to hold no comment welded between two bare
# tokens, so the whole file cannot prove the separator matters - these can.
CASES = [
    ('a comment welded between two tokens', 'var/*note*/x = 1;', 'var x = 1;'),
    ('a comment inside a string is not a comment',
     'var s = "a/*b*/c";', 'var s = "a/*b*/c";'),
    ('a slash inside a regex class', 'var re = /[/]/;/*go*/var z=3;',
     'var re = /[/]/; var z=3;'),
    ('a division is not a regex', 'var q = a / b;/*go*/var w=4;',
     'var q = a / b; var w=4;'),
    ('a line comment', 'var a=1; // note\nvar b=2;', 'var a=1;\nvar b=2;'),
]


def selftest():
    """Everything the scanner gets wrong on CASES, as a list of sentences."""
    wrong = []
    for name, src, want in CASES:
        got = thin(src)
        if got != want:
            wrong.append('%s: got %r, wanted %r' % (name, got, want))
        elif codeonly(src) != codeonly(got):
            wrong.append('%s: the token proof disagrees with itself' % name)
    return wrong


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    verify = '--verify' in sys.argv
    if '--selftest' in sys.argv:
        wrong = selftest()
        for w in wrong:
            print('  REFUSED: ' + w)
        if wrong:
            sys.exit(1)
        print('  thin: the scanner is right on all %d cases' % len(CASES))
        if not args:
            return
    if not args or (not verify and len(args) != 2):
        sys.exit(__doc__.strip().split('\n\n')[2])
    src = io.open(args[0], encoding='utf-8', newline='').read()
    out = thin(src)
    wrong = check(src, out)
    if wrong:
        for w in wrong:
            print('  REFUSED: ' + w)
        sys.exit(1)
    raw = 100.0 * (len(src) - len(out)) / len(src)
    zs = len(gzip.compress(src.encode('utf-8'), 9))
    zo = len(gzip.compress(out.encode('utf-8'), 9))
    print('  thin: %s %d -> %d bytes (%.0f%% off), gzipped %d -> %d'
          % (os.path.basename(args[0]), len(src), len(out), raw, zs, zo))
    print('  thin: every code token identical, all %d anchors present'
          % len(ANCHORS))
    if not verify:
        io.open(args[1], 'w', encoding='utf-8', newline='').write(out)
        print('  thin: written to ' + args[1])


if __name__ == '__main__':
    main()
