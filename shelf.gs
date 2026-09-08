/**
 * shelf.gs — read a whole shelf, for Bottlefolio.
 *
 * A companion to lookup.gs in the SAME project. It uses that file's json(),
 * apiHeaders_(), API and FLIGHT_MODEL, so there is nothing to configure and
 * no key to set: if bottle lookups work, this works.
 *
 * WHAT IT IS FOR
 *
 * BZ: the shelf photo could be at buddies house too. And at the store.
 *
 * Three places, one photograph, and the question underneath is always the
 * same — what should I do about these, given what I own and what I like.
 * Only the verb changes:
 *
 *   a bar        which glass do I order
 *   a friend's   which of these have I never had
 *   a shop       which do I buy
 *
 * label.gs reads ONE bottle from several panels. This is the other axis:
 * MANY bottles from one photograph, which is a different accuracy problem
 * and gets its own mode rather than a flag on that one.
 *
 * WHY IT SENDS YOUR SHELF TOO
 *
 * BZ: I'm inclined to be data greedy and lean in on prose opportunity.
 *
 * A list of names is a list of names — the app could cross-reference that
 * itself for free and needs no model to do it. What it CANNOT do itself is
 * say why a particular bottle on somebody else's shelf is worth the glass
 * given three hundred you already own. So the shelf goes with the
 * photograph, about 32KB of it, and what comes back is both: the bottles,
 * and a written take on them.
 *
 * A FRIEND'S SHELF is the reason this is worth building. A bar is a
 * commercial list and a shop is a warehouse; a friend's shelf is thirty
 * bottles chosen by somebody with taste, which is the one population a
 * whisky app almost never sees.
 *
 * WHAT ARRIVES
 *   { mode:'shelf', where:'bar'|'friend'|'shop',
 *     images:[ {media_type, data} … ],       one to four, one shelf each
 *     mine:[ 'name|type|proof|cask|region|note', … ] }
 *
 * WHAT COMES BACK
 *   { items:[{name, dist, proof, age, sub, pour, sure}],
 *     take: '…prose…', read: '…what it could and could not make out…' }
 *
 * `sure` is high/medium/low per bottle, because a spine read at an angle
 * across a dark room is not the same evidence as a front label, and the
 * app shows the difference rather than presenting all of it as fact.
 *
 * `pour` is what a glass costs, off a printed list, exactly as printed.
 * BZ: price varies by location too much — and he is right about STORING
 * it, which is why nothing here ever reaches the shelf. But the number on
 * the menu in front of you is not data about the whisky, it is a fact
 * about tonight, and it is read, used and thrown away with the photograph
 * exactly as a label is. It is also the only thing that turns "which of
 * these is best" into "which of these is worth its price to somebody who
 * already owns three hundred bottles", which is the question a bar
 * actually asks.
 */

var SHELF_MAX_IMAGES = 4;
var SHELF_MAX_MINE = 400;

function readShelf_(req) {
  var imgs = (req && req.images) || [];
  if (!imgs.length) return { error: 'no images' };
  if (imgs.length > SHELF_MAX_IMAGES) imgs = imgs.slice(0, SHELF_MAX_IMAGES);

  var where = String((req && req.where) || 'shelf');
  var mine = ((req && req.mine) || []).slice(0, SHELF_MAX_MINE);

  var asks = {
    bar: 'They are choosing a glass to order. Money buys one pour, so the '
       + 'question is which single bottle is worth it tonight.',
    list: 'They are holding a bar\'s printed whisky list, which is long on '
        + 'purpose so that nobody can read it. Money buys one pour. Name the '
        + 'three or four worth having and say why; do NOT hand back another '
        + 'long list, because that is the problem they photographed it to '
        + 'solve.',
    friend: 'They are at a friend\'s house looking at that friend\'s shelf. '
       + 'Nothing is being bought. The question is which of these to ask for '
       + 'a taste of, and what this collection says about the person who '
       + 'built it.',
    shop: 'They are in a shop deciding what to buy. Shelf space and money '
       + 'are both finite and they already own three hundred bottles.'
  };

  var shape = '{"items":[{"name":string,"dist":string|null,'
    + '"proof":number|null,"age":number|null,"sub":string|null,'
    + '"pour":string|null,"sure":"high"|"medium"|"low"}],'
    + '"take":string,"read":string}';

  var system = [
    'You are looking at a photograph of a shelf of whisky bottles and',
    'writing to the person who took it. You know what they already own.',
    '',
    asks[where] || asks.shop,
    '',
    'A PRINTED LIST IS NOT A SHELF. If this is a menu or a list rather',
    'than bottles on a shelf, everything below still applies with two',
    'differences: printed type is legible, so sure is high for anything you',
    'can read and there is no guessing from bottle shape; and a list is',
    'long, so the take names a few and ignores the rest rather than',
    'covering it.',
    '',
    'READING THE BOTTLES:',
    '- List every bottle you can identify. A spine, a neck label or a',
    '  shoulder is enough if the brand is legible.',
    '- Name it as fully as the photograph supports. "Lagavulin 16", not',
    '  "Lagavulin", if the 16 is readable — and "Lagavulin" alone if it is',
    '  not. Do not complete a name from knowledge.',
    '- sure: high when the front label is readable, medium when the brand',
    '  is plain but the expression is inferred from the bottle shape or',
    '  colour, low when you are reading a partial word. A low is worth',
    '  including and is NOT worth stating as fact.',
    '- pour: what a glass of it costs, EXACTLY as printed, currency symbol',
    '  and all — "$18", "14", "\u00a39.50". Null when no price is shown,',
    '  which is every shelf photograph and some menus. Never convert it,',
    '  never guess it, and never carry a price from one row to another.',
    '',
    '  THIS IS NOT DATA ABOUT THE WHISKY. A pour price varies by bar so',
    '  wildly that it says nothing about the bottle, and the app stores',
    '  none of it — it is read, used for tonight, and thrown away with the',
    '  photograph. What it makes possible is the only question a bar',
    '  actually asks: not which of these is best, but which is worth ITS',
    '  price given what they already own. "The Springbank is $14 and the',
    '  Macallan 18 is $45, and they own three Macallans and no Springbank"',
    '  is a sentence you cannot write without it.',
    '',
    '- proof, age, dist, sub only where the photograph shows them. Null',
    '  otherwise. Do NOT fill these from what you know about the bottle —',
    '  the app looks bottles up itself and would rather have a null than a',
    '  plausible number it cannot tell apart from a read one.',
    '- Skip anything that is not whisky. Skip empty glasses, decanters you',
    '  cannot identify, and boxes.',
    '',
    'THE TAKE — this is the part worth having, so write it properly.',
    '',
    'Two or three paragraphs of plain prose to the person who took the',
    'photograph. Not a list, not a ranking, not bullet points. You have',
    'their shelf below and the one in front of them; the whole value is in',
    'the comparison, and neither of those is something they can see at',
    'once.',
    '',
    'Things worth saying, when they are true:',
    '- The one bottle here they should actually go for, and WHY given what',
    '  they own. "You have four Islay sherry bombs and nothing from',
    '  Campbeltown" is a reason. "It is highly rated" is not.',
    '- WHERE PRICES ARE SHOWN, weigh them. A bar is a place where money',
    '  buys one pour, so the question is not which bottle is best but',
    '  which is worth what it costs to somebody with their shelf. An',
    '  expensive pour of something they own three of is the easiest',
    '  mistake on any list, and the cheap unfamiliar one is often the',
    '  answer. Say the price when it is part of the reason; do not recite',
    '  prices otherwise.',
    '- Something on this shelf they own already and may not realise, so',
    '  they do not spend a glass or a purchase on it.',
    '- What the shelf itself says. A collection is a set of decisions —',
    '  somebody who owns nine independent bottlings and no distillery',
    '  releases is telling you something about themselves.',
    '- A gap on THEIR shelf that this one could fill.',
    '',
    'RULES FOR THE TAKE:',
    '- Never invent a bottle that is not in your own items list.',
    '- Never claim they own something unless it is in the shelf below.',
    '- Do not read the list back to them. They can see the shelf; they',
    '  cannot see what it means next to theirs.',
    '- No score out of ten, no "hidden gem", no "curated selection". Write',
    '  the way somebody who knows whisky talks to a friend.',
    '- If the photograph is too poor to say anything worth reading, say so',
    '  in read and make take an empty string. An empty take is a valid',
    '  answer and the app handles it; a paragraph of hedging is not.',
    '',
    'read: one sentence on what you could and could not make out. Never',
    'null. If half the shelf is out of focus, that is the sentence.',
    '',
    'Return ONLY the JSON object, no preamble and no code fence:',
    shape,
    '',
    'WHAT THEY ALREADY OWN (name|type|proof|cask|region|note):',
    mine.length ? mine.join('\n') : '(nothing yet)'
  ].join('\n');

  var content = [];
  for (var i = 0; i < imgs.length; i++) {
    var im = imgs[i] || {};
    if (!im.data) continue;
    var data = String(im.data).replace(/^data:[^,]*,/, '');
    if (data.length > 10485760) {
      return { error: 'image ' + (i + 1) + ' is ' + data.length + ' bytes '
        + 'encoded, over the 10485760 the API accepts. Resize it to about '
        + '1600px on the long edge.' };
    }
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: im.media_type || 'image/jpeg',
                data: data }
    });
  }
  if (!content.length) return { error: 'no usable images' };
  var n = content.length;
  content.push({
    type: 'text',
    text: n > 1
      ? 'These are ' + n + ' photographs of the same shelf. Read them all '
        + 'and answer once.'
      : 'Read this shelf.'
  });

  var res = UrlFetchApp.fetch(API, {
    method: 'post',
    contentType: 'application/json',
    headers: apiHeaders_(),
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: FLIGHT_MODEL,
      max_tokens: 2000,
      system: system,
      messages: [{ role: 'user', content: content }]
    })
  });

  if (res.getResponseCode() !== 200) {
    return { error: 'api ' + res.getResponseCode() + ': '
      + res.getContentText().slice(0, 300) };
  }

  var out;
  try { out = JSON.parse(res.getContentText()); }
  catch (err) { return { error: 'unreadable api response' }; }

  var text = (out.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('').replace(/```json|```/g, '').trim();
  if (!text) return { error: 'the model returned nothing' };

  var first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first < 0 || last < first) {
    return { error: 'no json in the answer', raw: text.slice(0, 300) };
  }
  try { return JSON.parse(text.slice(first, last + 1)); }
  catch (err2) {
    return { error: 'bad json from the model', raw: text.slice(0, 300) };
  }
}

/**
 * Run this from the editor before deploying.
 *
 * Put one photograph of a shelf — a bar, a friend's, a shop — in a Drive
 * folder called shelf-test. Reuses label.gs's shrinker, so label.gs has to
 * be in the project first.
 */
function probeShelf() {
  var folders = DriveApp.getFoldersByName('shelf-test');
  if (!folders.hasNext()) {
    Logger.log('NO FOLDER. Make a Drive folder called shelf-test and put a '
      + 'photograph of a shelf of bottles in it, then run this again.');
    return;
  }
  var files = folders.next().getFiles();
  var images = [];
  while (files.hasNext() && images.length < SHELF_MAX_IMAGES) {
    var f = files.next();
    var type = f.getMimeType();
    if (type !== 'image/jpeg' && type !== 'image/png') continue;
    var im = labelShrink_(f);
    images.push({ media_type: im.media_type, data: im.data });
    Logger.log('reading: ' + f.getName() + '  ' + im.how + '  '
      + Math.round(im.data.length / 1024) + 'KB encoded');
  }
  if (!images.length) {
    Logger.log('NO IMAGES in shelf-test. It needs a .jpg or .png.');
    return;
  }

  /* A stand-in shelf, so the take has something to compare against. The
     app sends the real one. */
  var mine = [
    'Lagavulin 16|scotch|86||Islay|smoke and iodine',
    'Ardbeg Uigeadail|scotch|108.4|Sherry|Islay|',
    'Redbreast 12|irish|80||',
    'Buffalo Trace|bourbon|90||',
    'Weller 12|bourbon|90||'
  ];

  var r = readShelf_({ where: 'friend', images: images, mine: mine });
  if (r && r.error) {
    Logger.log('NOTHING CAME BACK: ' + r.error);
    if (r.raw) Logger.log('raw: ' + r.raw);
    return;
  }
  Logger.log('WORKS: ' + (r.items || []).length + ' bottles read');
  (r.items || []).forEach(function (x) {
    Logger.log('  [' + x.sure + '] ' + x.name
      + (x.proof ? '  ' + x.proof + ' proof' : '')
      + (x.pour ? '  ' + x.pour + ' a glass' : ''));
  });
  Logger.log('read: ' + r.read);
  Logger.log('take: ' + r.take);
}
