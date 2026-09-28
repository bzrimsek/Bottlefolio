/* THE TWO OFFICIAL WHEELS, PUT TOGETHER. The record of where every term sits
 * and why, kept beside the code rather than in it (rule 36).
 *
 * BZ, 2026-09-27: "We could try to put the two official wheels together."
 *
 * WHY TWO. The Council of Whiskey Masters certifies whiskey professionals, and
 * it does not publish one wheel - it publishes one per style, and calls both
 * "the official vocabulary for candidates in the Council's certifications
 * programs":
 *
 *   SCOTCH  the Tasting Wheel published by Whisky Magazine, originally
 *           developed by Charles MacLean, the Council's inaugural board
 *           member. Eight categories.
 *           https://www.whiskeymasters.org/whisky-tasting-wheel
 *   BOURBON the Council's own Bourbon Flavor Wheel, by Adam Edmonsond,
 *           Carmen Hartwich, Kevin Malta, Tom McCormick and Justin
 *           Strumpfer, under advice of Steve Beal. Sixteen categories.
 *           https://www.whiskeymasters.org/bourbon-tasting-flavor-wheel
 *
 * A shelf that is two fifths bourbon and much of the rest Scotch needs both,
 * and the certifying body's own practice is the precedent for carrying two.
 * The union is what this file records. Only CATEGORY AND DESCRIPTOR WORDS are
 * taken - the vocabulary. None of either page's prose is copied.
 *
 * WHAT THE MERGE FIXES, all four of them things the app had hacked around:
 *
 *   `smoke` was this app's ONE admitted departure from its groups, invented
 *   because the wheel we had made smoky a Roasted leaf and had no peat group.
 *   The Scotch wheel makes PEATY one of its eight. The departure is retired -
 *   this is BZ's "Where is smoky?" answered by canon rather than by us.
 *
 *   `vegetable` shown as `Green` was a label departure, written down on
 *   2026-09-27 because the word described the smallest thing in its own group.
 *   HERBAL is the bourbon wheel's own top-level word for those leaves, so the
 *   label hack goes and the id becomes honest. BZ: "So what is vegetable?"
 *
 *   `roasted` was a group neither wheel has. It held coffee beside caramel
 *   beside almond beside cream, which is four different categories, and it
 *   was where smoky had been filed. It splits.
 *
 *   `salt` sat in the question pool while its group was never drawn. Both
 *   wheels agree salt is a PRIMARY TASTE, not an aroma - so the pool is what
 *   was wrong, not the group.
 *
 * AND ONE THING IT CORRECTS. `leather` and `tobacco` were woody. Both wheels
 * put them with age and earth instead - bourbon under Aged/Funky and
 * Earthy/Tobacco, Scotch under Feinty/Leathery and Feinty/Tobacco. Neither
 * calls them wood. BZ's "pepper, tobacco, leather ... driven by grain and
 * wood" was the reading the app had; the canon disagrees with it.
 */
'use strict';

/* The twelve aroma groups, in wheel order, and what each is drawn from. The
   Scotch wheel's own sequence is the spine - Cereal, Fruity, Floral, Peaty,
   Feinty, Sulphury, Woody, Winey - and each bourbon-only group is inserted
   beside its nearest Scotch relative, because adjacency is the point of a
   wheel: neighbours are related, so a shape reads as a region of it. */
const MERGE = [
  ['cereal', 'Sc 1 Cereal', 'Bb 15 Grainy',
    'corn, rye, wheat, malted barley, cereal, biscuit, yeast, mash - and Sc '
    + 'Cereal/Yeasty is where meaty belongs (boiled pork, sausage, gravy).'],
  ['nutty', 'Sc 8 Winey/Nutty', 'Bb 14 Nutty',
    'walnut, almond, hazelnut, pecan, marzipan, praline. Bourbon makes it a '
    + 'category; Scotch files it under Winey. Its own axis, after cereal.'],
  ['fruity', 'Sc 2 Fruity', 'Bb 4 Fruity',
    'The bourbon wheel supplies the rings BZ asked for on 2026-09-27 - "I '
    + 'don\'t taste stone fruit. I taste raisin or plum or green apple": '
    + 'Citrus, Stone, Orchard, Tropical, Melon, Berry, Processed, Dried, '
    + 'Cooked. Nine sub-rings where we had one flat list.'],
  ['floral', 'Sc 3 Floral', 'Bb 3 Floral',
    'rose, lavender, perfume, wildflowers, potpourri. Honey LEAVES here: no '
    + 'wheel puts it in floral.'],
  ['herbal', 'Sc 3 Floral/Leafy + Hay', 'Bb 1 Herbal',
    'mint, dill, tarragon, anise, licorice, fennel, tea, eucalyptus, grass, '
    + 'hay, leaves. Replaces `vegetable`, and retires the `Green` label.'],
  ['peaty', 'Sc 4 Peaty', 'Bb 11 Woody/charred, campfire',
    'medicinal, iodine, tar, smokey, peat reek, kippery, mossy. Replaces the '
    + 'invented `smoke`. Top-level on the Scotch wheel, which is the wheel '
    + 'that governs the bottles it applies to.'],
  ['earthy', 'Sc 5 Feinty/Leathery + Tobacco', 'Bb 16 Earthy + 6 Aged',
    'coffee, tobacco, leather, mushroom, dust, musty, cellar, geosmin, '
    + 'vegetation. Feinty follows Peaty on the Scotch wheel, so the position '
    + 'is the wheel\'s own.'],
  ['woody', 'Sc 7 Woody', 'Bb 11 Woody',
    'oak, cedar, sandalwood, pencil shavings, cigar box, toasted, cola, '
    + 'pastry, graham cracker. Both wheels file cake and soda under wood.'],
  ['spicy', 'Sc 7 Woody/New Wood', 'Bb 2 Spicy',
    'cinnamon, clove, nutmeg, ginger, cardamom, pepper, allspice, coriander. '
    + 'Bourbon makes it a category; Scotch calls it new wood. Beside woody, '
    + 'which is where Scotch would have it.'],
  ['sweet', 'Sc 5 Feinty/Honey, 7 Woody/Vanilla', 'Bb 12 Sweet',
    'caramel, butterscotch, toffee, vanilla, nougat, brown sugar, maple, '
    + 'honey, chocolate. A group the app did not have; its terms were spread '
    + 'across `roasted`, `floral` and `spicy`.'],
  ['lactic', '-', 'Bb 13 Lactic',
    'cream, butter, popcorn butter. Bourbon only, and small, but it is where '
    + 'cream goes and it is a category rather than a leaf.'],
  ['winey', 'Sc 8 Winey', 'Bb 5 Finished',
    'sherry, port, madeira, marsala, red and white wine, sauternes, and the '
    + 'ex-spirit finishes: rum, brandy, tequila.']
];

/* Read, not drawn. Every one of the three canons keeps these apart from the
   aroma vocabulary, which is what BZ saw on 2026-09-27 - "off flavors and
   taste seem wrong" - before any of them was in front of him:

     CWM Bourbon         9 Primary Tastes, 10 Textural Aspects, 7 Flawed
     Vocal Goat 3.2      the whole Palate section is these and nothing else
     Pentlands           Taste and Structure rings

   So they keep their place in L.NOT_A_TASTE and they are never radar axes.
   What changes is that they are now named after the categories they are. */
const APART = [
  ['tastes', 'Bb 9 Primary Tastes',
    'sweet, sour, salty, bitter, umami. Was `taste`. UMAMI IS NEW - the '
    + 'wheel has it and we did not. This is where `salt` lives, which is why '
    + 'it must come out of the question pool: the pool draws aroma axes.'],
  ['texture', 'Bb 10 Textural Aspects',
    'full-bodied, light-bodied, warming, cooling, tannic, mineral, oily, '
    + 'viscous, thin. Was `structure`.'],
  ['flawed', 'Bb 7 Flawed + 8 Industrial, Sc 6 Sulphury',
    'rubber, matchbox, cabbage, egg, mould, cardboard, vinegar, cheese, '
    + 'acetone, solvent, lacquer. Was `off-flavor`. Sulphury follows Feinty '
    + 'on the Scotch wheel, so it sits where the wheel puts it - it is simply '
    + 'not drawn.'],
  ['colour', '-',
    'Neither wheel carries appearance; it is not a flavour. Kept because the '
    + 'notes contain it and because a tasting sheet reads it first - the '
    + 'Vocal Goat chart opens on Appearance. Named and set apart, not drawn.']
];

/* EVERY TERM THAT CHANGES GROUP, with the canon leaf that justifies it. This
   is the part to check against the wheels rather than trust. */
const MOVES = [
  ['honey', 'floral', 'sweet', 'Bb Sweet/Sweetener: honey. Sc Feinty/Honey.'],
  ['licorice', 'spicy', 'herbal', 'Bb Herbal/Anise: star anise, licorice, fennel.'],
  ['vanilla', 'spicy', 'sweet', 'Bb Sweet/Confectionary: vanilla. SEE DISAGREE.'],
  ['almond', 'roasted', 'nutty', 'Bb Nutty: almond. Sc Winey/Nutty: almonds.'],
  ['nutty', 'roasted', 'nutty', 'Bb 14 Nutty is the category itself.'],
  ['caramel', 'roasted', 'sweet', 'Bb Sweet/Confectionary: caramel.'],
  ['toffee', 'roasted', 'sweet', 'Bb Sweet/Confectionary: toffee. Sc Woody/Vanilla: toffee.'],
  ['sugar', 'roasted', 'sweet', 'Bb Sweet/Sweetener: brown, white, burnt sugar.'],
  ['maple', 'roasted', 'sweet', 'Bb Sweet/Sweetener: maple syrup.'],
  ['chocolate', 'roasted', 'sweet', 'Bb Sweet/Chocolate. Sc Winey/Chocolate.'],
  ['coffee', 'roasted', 'earthy', 'Bb Earthy/Coffee: ground, brewed, burnt.'],
  ['cola', 'roasted', 'woody', 'Bb Woody/Soda: cola, Dr Pepper.'],
  ['cake', 'roasted', 'woody', 'Bb Woody/Baked: pastry, graham cracker. Sc Woody/Vanilla: sponge, madeira cake.'],
  ['cream', 'roasted', 'lactic', 'Bb Lactic/Dairy: popcorn butter, cream.'],
  ['meaty', 'roasted', 'cereal', 'Sc Cereal/Yeasty: boiled pork, sausage, gravy, meaty.'],
  ['peat', 'smoke', 'peaty', 'Sc Peaty is the category. Leaf: peat reek.'],
  ['smoke', 'smoke', 'peaty', 'Sc Peaty/Smokey: bonfire, burnt sticks, peat reek.'],
  ['medicinal', 'smoke', 'peaty', 'Sc Peaty/Medicinal: iodine, carbolic, tar, sea-weed.'],
  ['earthy', 'vegetable', 'earthy', 'Bb 16 Earthy is the category itself.'],
  ['vegetable', 'vegetable', 'earthy', 'Bb Earthy/Vegetation: foliage, dry grass. SEE DISAGREE.'],
  ['dill', 'vegetable', 'herbal', 'Bb Herbal/Fresh: dill, tarragon, eucalyptus.'],
  ['mint', 'vegetable', 'herbal', 'Bb Herbal/Minty: mint, peppermint, spearmint.'],
  ['tea', 'vegetable', 'herbal', 'Bb Herbal/Tea: black, green, oolong.'],
  ['herbal', 'vegetable', 'herbal', 'Bb 1 Herbal is the category itself.'],
  ['grass', 'vegetable', 'herbal', 'Sc Floral/Leafy: lawn clippings. SEE DISAGREE.'],
  ['fresh', 'vegetable', 'herbal', 'Bb Herbal/Fresh. SEE DISAGREE.'],
  ['leather', 'woody', 'earthy', 'Bb Aged/Funky: leather. Sc Feinty/Leathery.'],
  ['tobacco', 'woody', 'earthy', 'Bb Earthy/Tobacco: cigar, pipe. Sc Feinty/Tobacco.'],
  ['bitter', 'taste', 'tastes', 'Bb Primary Tastes: Bitter.'],
  ['salt', 'taste', 'tastes', 'Bb Primary Tastes: Salty. OUT OF THE QUESTION POOL.'],
  ['sour', 'taste', 'tastes', 'Bb Primary Tastes: Sour.'],
  ['sweet', 'taste', 'tastes', 'Bb Primary Tastes: Sweet.'],
  ['umami', '-', 'tastes', 'Bb Primary Tastes: Umami. NEW - the wheel has it.']
];

/* WHERE THE TWO WHEELS DISAGREE. Five, and each is recorded rather than
   quietly resolved, because a merge that hides its seams cannot be checked.
   The rule followed: take the wheel that governs the bottle where one clearly
   does, and otherwise take the reading that keeps a group answerable to the
   question a person would ask of it. */
const DISAGREE = [
  ['vanilla', 'Sc Woody/Vanilla', 'Bb Sweet/Confectionary', 'sweet',
    'Vanillin is a wood extractive, so Scotch is mechanistically right, and '
    + 'the bourbon wheel is right about how a taster reports it. BZ\'s own '
    + 'list - "cherry, vanilla, wood, rye is spice" - names vanilla BESIDE '
    + 'wood, as a separate thing. Sweet keeps the two axes legible.'],
  ['solvent', 'Sc Fruity/Solvent', 'Bb Flawed/Ethereal', 'flawed',
    'Scotch treats nail varnish and bubble gum as an estery fruit note; '
    + 'bourbon treats acetone and lacquer as a fault. A note that says '
    + 'solvent is reporting the fault, so it is not drawn as a flavour.'],
  ['vegetable', 'Sc Sulphury/Vegetative (a fault)', 'Bb Earthy/Vegetation (neutral)',
    'earthy',
    'Bourbon\'s reading is the neutral one, and a term derived from a note '
    + 'should not be filed as a fault on a guess.'],
  ['grass', 'Sc Floral/Leafy', 'Bb Earthy/Vegetation', 'herbal',
    'Both wheels file it away from herbal, and both file it beside leaves. '
    + 'Herbal is where the green leaves are kept together, which is the '
    + 'thing BZ asked about. THE ONE PLACEMENT NEITHER WHEEL BACKS - if this '
    + 'is ever revisited, this is the entry to revisit.'],
  ['coconut', 'Sc Floral/Fragrant', 'Bb Fruity/Tropical', 'fruity',
    'The bourbon ring is a fruit ring and coconut is a fruit.']
];

/* What `grape` does, which is neither a move nor a disagreement but a choice.
   Bb Fruity/Orchard lists grape among apple, pear and fig. It stays in
   `winey` because in a whisky note the word almost always reports cask
   influence rather than the fruit, and winey is the axis that answers for
   cask influence. A departure, recorded. */
const KEPT = [
  ['grape', 'winey', 'Bb Fruity/Orchard: apple, pear, fig, grape',
    'In a whisky note the word reports the cask, not the fruit.'],
  ['pine', 'woody', 'Sc Floral/Leafy: fir, pine nuts; Sc Fruity/Solvent: pine essence',
    'Bb Woody carries cedar and sandalwood; resinous is Sc Woody/New Wood.'],
  ['oxidized', 'flawed', 'Bb Aged/Oxidative: rancio, varnish, molasses',
    'The wheel\'s Oxidative is a positive mark of age. A note that says '
    + 'oxidized is not paying a compliment.']
];

module.exports = { MERGE, APART, MOVES, DISAGREE, KEPT };

if (require.main === module) {
  console.log('THE MERGED WHEEL - ' + MERGE.length + ' aroma groups drawn, '
    + APART.length + ' sets kept apart\n');
  MERGE.forEach((r, i) => console.log((i + 1) + '. ' + r[0]
    + '\n     Sc: ' + r[1] + '\n     Bb: ' + r[2]));
  console.log('\nAPART (never radar axes)');
  APART.forEach(r => console.log('  ' + r[0] + '  <- ' + r[1]));
  console.log('\n' + MOVES.length + ' terms change group, '
    + DISAGREE.length + ' wheel disagreements, ' + KEPT.length + ' kept against canon');
}
