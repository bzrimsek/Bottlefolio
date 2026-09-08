/**
 * label.gs — read a whisky label, for Bottlefolio.
 *
 * A companion to lookup.gs in the SAME project. It uses that file's json(),
 * apiHeaders_(), API and FLIGHT_MODEL, so there is nothing to configure and
 * no key to set: if bottle lookups work, this works.
 *
 * WHY THIS EXISTS, and it is not what the backlog said.
 *
 * The brief was "photograph the back label to get the mash bill". Six real
 * bottles were photographed on 2026-09-07 — Bardstown Collaborative Series,
 * Knob Creek 18, Angel's Envy Cellar Collection, Bunnahabhain Fèis Ìle 2024,
 * Redbreast Kentucky Oak and Heaven Hill Bottled-in-Bond — and NONE of them
 * printed a mash bill. Four were American. The claim that a mash bill is
 * printed on the back of most American whiskey is now measured and wrong.
 *
 * What the same photographs DID give, every time: the name, the proof, the
 * ABV, the size, the age, the cask, the distillery and the UPC digits. BZ:
 * reading labels is an alternate to bar code scanning — read the whole
 * thing, and if there are mash bills, great.
 *
 * So this reads the label as a WHOLE and the mash bill is opportunistic.
 *
 * WHY IT BEATS A LOOKUP
 * A lookup is a model recalling a bottle. A label is the bottle telling you
 * what it is. Where they disagree the label is right, and the app marks
 * anything from here as stated so a later lookup cannot overwrite it. Two of
 * the six were already on the shelf and THINNER than their own labels:
 * Fèis Ìle 2024 carries no age while the front says 23 years, and Redbreast
 * Kentucky Oak carries no cask while the label names the farm the oak came
 * from. Neither shows up as a gap, because both slots read as filled.
 *
 * WHAT ARRIVES
 *   { mode:'label',
 *     images:[ {media_type:'image/jpeg', data:'<base64, no prefix>'}, … ] }
 *
 * One to four images of the SAME bottle. Three is normal: BZ's Bardstown
 * needed the name, the description and the barcode off three separate
 * panels. Front-and-back is the wrong assumption.
 *
 * WHAT COMES BACK
 *   { name, dist, proof, abv, age, sub, style, fin, size, msrp,
 *     mash, upc, tn:{nose,palate,finish}, bottled, notes, read }
 *
 * Every field is null when the label does not say. `read` is what it could
 * make out at all, so a failure is legible rather than silent.
 *
 * WHY SONNET
 * Same reasoning as designFlight and writeRecap_: this is reading small
 * type on curved dark glass, not a fact lookup. It runs when somebody
 * presses a button with a bottle in their hand.
 *
 * WHAT IT WILL NOT DO
 * The prompt forbids inventing anything not visible. It is told, in terms,
 * that a null is a better answer than a guess — because a guessed proof
 * written into the shelf as "stated" is worse than no proof at all, and
 * this feature's whole claim is that it outranks the lookup.
 */

/** How many images one read will accept. Four panels is more than any
    bottle has needed; beyond that it is somebody photographing a shelf. */
var LABEL_MAX_IMAGES = 4;

/* What the API will take for one image, base64-encoded. Anthropic's ceiling
   is 10MB and it also stops gaining accuracy above about 1600px on the long
   edge, so anything near this limit is wasted bytes rather than detail. */
var LABEL_MAX_BYTES = 10485760;

/* The long edge to shrink to. Small type on a curved bottle is the whole
   difficulty, so this is as large as is useful rather than as small as
   will fit. */
var LABEL_WIDTH = 1600;

function readLabel_(req) {
  var imgs = (req && req.images) || [];
  if (!imgs.length) return { error: 'no images' };
  if (imgs.length > LABEL_MAX_IMAGES) imgs = imgs.slice(0, LABEL_MAX_IMAGES);

  var shape = '{"name":string|null,"dist":string|null,"proof":number|null,'
    + '"abv":number|null,"age":number|null,"sub":string|null,'
    + '"style":string|null,"fin":string|null,"size":number|null,'
    + '"msrp":number|null,"mash":string|null,"upc":string|null,'
    + '"tn":{"nose":string|null,"palate":string|null,"finish":string|null}|null,'
    + '"bottled":string|null,"notes":string|null,"read":string}';

  var system = [
    'You read whisky bottle labels from photographs and return what is',
    'PRINTED ON THEM. You are not identifying the bottle from knowledge.',
    '',
    'THE ONE RULE: never write anything the label does not say. A null is a',
    'better answer than a guess. What you return is treated as the bottle\'s',
    'own word and overrides everything else the app knows, so an invented',
    'proof is worse than no proof.',
    '',
    'Several photographs may be different panels of the SAME bottle. Merge',
    'them into one answer. If two panels disagree, prefer the one printed',
    'larger and more clearly, and say so in notes.',
    '',
    'MERGING MEANS ASSEMBLING, NOT CHOOSING. Each field takes the best',
    'answer from ANY panel, and the name most of all. A bottle often carries',
    'its brand on one panel and its expression on another, and neither panel',
    'alone holds the whole name.',
    '',
    'This went wrong on a real bottle. Angel\'s Envy Cellar Collection shows',
    '"ANGELS ENVY" plainly on two of its panels and prints a separate strip',
    'reading "Kentucky Straight Bourbon Whiskey Finished in Oloroso Sherry',
    'Casks". The reader returned that strip as the name — a category, from',
    'one panel, while the brand sat legible on two others. The name should',
    'have been "Angel\'s Envy Cellar Collection" or at least "Angel\'s Envy',
    'Kentucky Straight Bourbon Finished in Oloroso Sherry Casks".',
    '',
    'So: find the BRAND wherever it appears, across every panel, and build',
    'the name around it. A name with no brand in it is not a name.',
    '',
    'FIELDS:',
    '- name: the bottle as the label names it, including the edition or',
    '  series. "Bardstown Bourbon Company Collaborative Series Silver Oak",',
    '  not "Bardstown".',
    '',
    '  A NAME MUST NAME A BOTTLE. "Kentucky Straight Bourbon Whiskey" is a',
    '  category, "Single Malt Scotch Whisky" is a category, and "Finished',
    '  in Oloroso Sherry Casks" is a description — none of them is a name,',
    '  and returning one as the name is worse than returning null because',
    '  it looks like it worked. If you cannot find a brand anywhere on the',
    '  bottle, in print OR in the glass, set name to null and say so in',
    '  read. The app can ask a person for a name; it cannot know that the',
    '  one it was given is not one.',
    '- dist: THE HOUSE, which is the brand on the front. Not the legal',
    '  entity on the back. Angel\'s Envy Cellar Collection reads "Bottled by',
    '  Louisville Spirits Group, Louisville KY" and the house is Angel\'s',
    '  Envy; returning the bottler put a whisky under an eleventh house',
    '  holding one bottle, when the other ten sat under the brand. The app',
    '  groups a shelf by this field — a portrait, the gaps it suggests, the',
    '  flights it proposes — so a bottler here does not add a fact, it',
    '  splits a house in two.',
    '  The legal entity is worth keeping and it goes in `bottled`.',
    '  If the front carries only an expression and no brand, null is better',
    '  than the bottler.',
    '- proof: US proof as a number. If only ABV is printed, set abv and',
    '  leave proof null — do NOT convert. The app converts.',
    '- abv: alcohol by volume as a number, e.g. 53.3.',
    '- age: the stated age in years, as a number. Null if no age is stated;',
    '  never infer one from a vintage or a date.',
    '- sub: one of bourbon, rye, scotch, irish, japanese, canadian,',
    '  tennessee, wheat, world, american single malt, flavored. Null if the',
    '  label does not make it plain.',
    '',
    '  A BLEND IS NOT A TYPE. There is no blend in that list and there will',
    '  not be one: a blended Scotch is still scotch, a blended Canadian is',
    '  still canadian, and a blend of straight American whiskeys takes the',
    '  type of what it is mostly made of. Give the BASE SPIRIT here and put',
    '  the word blend in style, where it belongs.',
    '',
    '  Worked example, and it is a real one. Old Elk Wheat N\' Rye says',
    '  "Blend of Straight Whiskies" on the front and its grain table reads',
    '  57.6% wheat, 38.0% rye, 4.4% barley. sub is "rye" or "wheat", not',
    '  "world" — world is for whisky from a country the list does not name,',
    '  not for anything you cannot otherwise place. If the base genuinely',
    '  cannot be told from the label, null is the answer.',
    '- style: single malt, single pot still, blend, blend of straight',
    '  whiskies, small batch, single barrel, bottled-in-bond, and so on, as',
    '  printed. This is where blend goes.',
    '- fin: the cask or finish. Join several with + in the order printed:',
    '  "Amontillado+Manzanilla+Oloroso". Null if none is named.',
    '- size: the bottle volume in millilitres, as a number. 70cl is 700.',
    '- msrp: a price ONLY if printed on the bottle, which is rare. Almost',
    '  always null.',
    '- mash: the mash bill EXACTLY as printed, e.g. "75% corn, 21% rye, 4%',
    '  malted barley". Most labels do not carry one. Null is the common and',
    '  correct answer. Do not derive it from the category: a single malt',
    '  does not print "100% malted barley" and you must not write it.',
    '- upc: the digits printed beneath the barcode, as a string of digits',
    '  with no spaces. Read the NUMBER, do not try to decode the bars. Null',
    '  if it is not legible.',
    '- tn: the producer\'s own tasting notes, where the label prints them,',
    '  split into nose, palate and finish. Null for any part not printed.',
    '  These are the producer speaking, which is worth more than a note',
    '  recalled from elsewhere.',
    '- bottled: where it was bottled, as printed.',
    '- notes: anything else worth keeping in one short sentence — a bottle',
    '  number, a release code, a cask number, "1151 of 4002 bottles", "no',
    '  added colour, non-chill filtered", a disagreement between panels.',
    '- read: one short sentence on how legible it was and what you could',
    '  not make out. This is never null. If the photograph is unusable say',
    '  so plainly here and set every other field to null.',
    '',
    'HARD CASES, all seen on real photographs:',
    '- Text EMBOSSED OR ETCHED into the glass rather than printed on paper',
    '  is harder to read than print but it is frequently THE BRAND, so it',
    '  is worth the effort rather than skipped. Say in read whether you',
    '  got it.',
    '- A white label printed on clear glass over dark whisky washes out.',
    '- A label photographed at an angle or rotated 90 degrees is still',
    '  readable; do the work.',
    '- Government warnings, recycling marks and drinkaware text are not',
    '  facts about the whisky. Ignore them.',
    '',
    'Return ONLY the JSON object, no preamble and no code fence:',
    shape
  ].join('\n');

  var content = [];
  for (var i = 0; i < imgs.length; i++) {
    var im = imgs[i] || {};
    if (!im.data) continue;
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: im.media_type || 'image/jpeg',
        data: String(im.data).replace(/^data:[^,]*,/, '')
      }
    });
  }
  if (!content.length) return { error: 'no usable images' };
  /* THE API REFUSES ANYTHING OVER 10MB, and a phone photograph is bigger
     than that: BZ's first run sent 13,936,348 bytes and came back 400.
     Caught here with the number in it, because "api 400" with a wall of
     JSON after it is not something you can act on. The app resizes on the
     device before it ever gets here; this is the backstop. */
  for (var g = 0; g < content.length; g++) {
    var len = content[g].source.data.length;
    if (len > LABEL_MAX_BYTES) {
      return { error: 'image ' + (g + 1) + ' is ' + len + ' bytes encoded, '
        + 'over the ' + LABEL_MAX_BYTES + ' the API accepts. Resize it to '
        + 'about 1600px on the long edge and try again.' };
    }
  }
  /* Said only when there is more than one, and counted BEFORE the text
     block is pushed — content is the image list at this point. */
  var n = content.length;
  content.push({
    type: 'text',
    text: n > 1
      ? 'These are ' + n + ' panels of ONE bottle. Merge them into a single '
        + 'answer and read the label.'
      : 'Read this label.'
  });

  var res = UrlFetchApp.fetch(API, {
    method: 'post',
    contentType: 'application/json',
    headers: apiHeaders_(),
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: FLIGHT_MODEL,
      max_tokens: 1200,
      system: system,
      messages: [{ role: 'user', content: content }]
    })
  });

  var code = res.getResponseCode();
  if (code !== 200) {
    return { error: 'api ' + code + ': ' + res.getContentText().slice(0, 300) };
  }

  var out;
  try {
    out = JSON.parse(res.getContentText());
  } catch (err) {
    return { error: 'unreadable api response' };
  }

  var text = (out.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('')
    .replace(/```json|```/g, '')
    .trim();

  if (!text) return { error: 'the model returned nothing' };

  /* The model is told not to fence it and sometimes does anyway, and it
     occasionally writes a sentence before the object. Take the outermost
     braces rather than trusting the whole string to parse. */
  var first = text.indexOf('{');
  var last = text.lastIndexOf('}');
  if (first < 0 || last < first) {
    return { error: 'no json in the answer', raw: text.slice(0, 300) };
  }
  try {
    return JSON.parse(text.slice(first, last + 1));
  } catch (err2) {
    return { error: 'bad json from the model', raw: text.slice(0, 300) };
  }
}

/**
 * Run this from the editor before deploying.
 *
 * It needs a photograph to read, and there is no way to paste one into a
 * script — so it takes the FIRST image file it finds in a Drive folder
 * called "label-test". Put one or two label photographs in there, run this,
 * and read the log.
 *
 * A probe that needs no setup would be a probe that proves nothing: the
 * whole question is whether the model can read small type on dark curved
 * glass, and only a real photograph answers it.
 */
/**
 * A photograph small enough to send.
 *
 * Apps Script cannot resize an image itself, and a phone photograph is far
 * over the API's 10MB ceiling — BZ's first run sent 13.9MB and was refused.
 * Drive will render a resized copy of any image it holds, which costs one
 * fetch and no libraries.
 *
 * Falls back to the original if the thumbnail will not render, so a file
 * Drive cannot preview still gets TRIED rather than skipped: the size guard
 * in readLabel_ will catch it and say so plainly.
 */
function labelShrink_(f) {
  var url = 'https://drive.google.com/thumbnail?id=' + f.getId()
    + '&sz=w' + LABEL_WIDTH;
  try {
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var b = res.getBlob();
      if (b.getBytes().length > 0) {
        return {
          media_type: 'image/jpeg',
          data: Utilities.base64Encode(b.getBytes()),
          how: 'resized to ' + LABEL_WIDTH + 'px'
        };
      }
    }
  } catch (err) { /* fall through to the original */ }
  return {
    media_type: f.getMimeType(),
    data: Utilities.base64Encode(f.getBlob().getBytes()),
    how: 'FULL SIZE (thumbnail failed)'
  };
}

function probeLabel() {
  var folders = DriveApp.getFoldersByName('label-test');
  if (!folders.hasNext()) {
    Logger.log('NO FOLDER. Make a Drive folder called label-test and put '
      + 'one or two label photographs in it, then run this again.');
    return;
  }
  var files = folders.next().getFiles();
  var images = [];
  while (files.hasNext() && images.length < LABEL_MAX_IMAGES) {
    var f = files.next();
    var type = f.getMimeType();
    if (type !== 'image/jpeg' && type !== 'image/png') continue;
    var im = labelShrink_(f);
    images.push({ media_type: im.media_type, data: im.data });
    Logger.log('reading: ' + f.getName() + '  ' + im.how + '  '
      + Math.round(im.data.length / 1024) + 'KB encoded');
  }
  if (!images.length) {
    Logger.log('NO IMAGES in label-test. It needs a .jpg or .png.');
    return;
  }

  var r = readLabel_({ images: images });
  if (r && r.error) {
    Logger.log('NOTHING CAME BACK: ' + r.error);
    if (r.raw) Logger.log('raw: ' + r.raw);
    return;
  }
  Logger.log('WORKS:');
  Logger.log('  name  : ' + r.name);
  Logger.log('  dist  : ' + r.dist);
  Logger.log('  proof : ' + r.proof + '   abv: ' + r.abv);
  Logger.log('  age   : ' + r.age + '   size: ' + r.size);
  Logger.log('  type  : ' + r.sub + '   style: ' + r.style);
  Logger.log('  cask  : ' + r.fin);
  Logger.log('  mash  : ' + r.mash);
  Logger.log('  upc   : ' + r.upc);
  Logger.log('  notes : ' + r.notes);
  Logger.log('  read  : ' + r.read);
  Logger.log('full: ' + JSON.stringify(r));
}
