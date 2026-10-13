/* ONE SLICE OF WAITING, WITH SOMETHING IN IT (rule 25g).
 *
 *   node poll.js <logfile> [seconds]
 *
 * Rule 25g says a slow command goes in the background writing one line per
 * step, "polled in twenty-second slices, with a timestamped line written
 * after every poll". It also says the fix is mechanical rather than a
 * promise - and it was right to, because the promise is what kept failing.
 * On 2026-10-12 a push was polled at 55 to 60 second intervals and each
 * line said "still deploying" and nothing else, which is silence with a
 * timestamp on it (BZ: "Lots of silence. Not 30.second updates").
 *
 * So the two things that kept going wrong are not decisions any more:
 *
 *   THE INTERVAL is twenty seconds unless told otherwise, not whatever got
 *   typed that time.
 *
 *   THE CONTENT is whatever the log has gained SINCE THE LAST POLL, so a
 *   line can never be "still running". When a step has genuinely produced
 *   nothing, it says how long it has been quiet and what it last saw, which
 *   is still more than "still running".
 *
 * Where it is up to is kept beside the log, so each call carries on from
 * the last without being told.
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const secs = Math.max(1, Number(process.argv[3]) || 20);
if (!file) {
  console.log('usage: node poll.js <logfile> [seconds]');
  process.exit(1);
}
const mark = file + '.seen';
const clock = () => new Date().toTimeString().slice(0, 8);

/* HOW MANY LINES ONE SLICE MAY PRINT. A build step can emit thirty lines at
   once and reprinting all of them buries the one that matters. */
const MOST = 6;

const read = () => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
};

const before = read();
const had = before === null ? 0
  : (() => {
      try {
        return Number(fs.readFileSync(mark, 'utf8')) || 0;
      } catch (e) {
        return 0;
      }
    })();

setTimeout(() => {
  const now = read();
  if (now === null) {
    console.log('[' + clock() + '] nothing written yet: ' + path.basename(file));
    return;
  }
  const lines = now.split('\n');
  const fresh = lines.slice(had).filter(l => l.trim());
  try {
    fs.writeFileSync(mark, String(lines.length));
  } catch (e) { /* the mark is a convenience, never the point */ }

  if (!fresh.length) {
    /* QUIET IS NOT NOTHING: say what it last managed and for how long. */
    const last = lines.filter(l => l.trim()).pop() || '(no output)';
    console.log('[' + clock() + '] quiet for ' + secs + 's, last was: '
      + last.trim().slice(0, 100));
    return;
  }
  const show = fresh.slice(-MOST);
  if (fresh.length > MOST) {
    console.log('[' + clock() + '] ' + fresh.length + ' new line(s), last '
      + MOST + ':');
  } else {
    console.log('[' + clock() + ']');
  }
  show.forEach(l => console.log('  ' + l.replace(/\s+$/, '').slice(0, 160)));
}, secs * 1000);
