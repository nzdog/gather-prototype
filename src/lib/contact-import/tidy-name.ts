/**
 * [[GTC-448]] — the name tidy: turn "Last, First" into "First Last", and otherwise leave the name
 * exactly as it was (only its spaces are collapsed). It never changes case.
 *
 * It flips only when it is sure: all of these must hold, or the name is left as typed.
 *   - exactly one comma, with text on both sides;
 *   - only letters (macrons included), apostrophes, hyphens and full stops, every word with a letter;
 *   - no title and no suffix on either side (a title or a Jr is not a first name);
 *   - no business word on either side (a firm is not a person);
 *   - a left side of one word, or of two or three where the words before the last are family-name
 *     particles (van der Example, De La Example);
 *   - a right side of one to three words.
 *
 * One known limit: "Countdown, Albany" passes every guard and would be flipped. The business-word
 * list is the only defence there; a word is added the first time a real file shows one.
 */
export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const TITLES = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'mx',
  'dr',
  'prof',
  'professor',
  'rev',
  'reverend',
  'sir',
  'dame',
  'hon',
  'fr',
  'lady',
  'lord',
]);
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'esq', 'phd', 'md', 'qc', 'kc', 'dds']);
const BUSINESS = new Set([
  'ltd',
  'limited',
  'inc',
  'llc',
  'co',
  'company',
  'pty',
  'partners',
  'associates',
  'trust',
  'society',
  'club',
  'school',
  'council',
  'services',
  'service',
  'plumbing',
  'plumbers',
  'electrical',
  'electrician',
  'dental',
  'medical',
  'clinic',
  'hospital',
  'centre',
  'center',
  'group',
  'holdings',
  'cafe',
  'bakery',
  'restaurant',
  'pharmacy',
  'church',
  'studio',
  'salon',
  'gym',
  'florist',
  'motors',
  'builders',
  'bank',
  'taxi',
  'taxis',
]);
const PARTICLES = new Set([
  'van',
  'von',
  'de',
  'der',
  'den',
  'du',
  'di',
  'da',
  'le',
  'la',
  'te',
  'ter',
  'ten',
  'bin',
  'al',
  'el',
]);

// Built with the constructor so the letter classes read the same whatever the compile target.
const NAME_CHARS = new RegExp("^[\\p{L}\\p{M}'’.\\- ]+$", 'u');
const HAS_LETTER = new RegExp('\\p{L}', 'u');

const plain = (word: string) => word.replace(/\./g, '').toLowerCase();

export function tidyName(raw: string): { name: string; flipped: boolean } {
  const spaced = collapseSpaces(raw);
  const asTyped = { name: spaced, flipped: false };

  const comma = spaced.indexOf(',');
  if (comma === -1 || comma !== spaced.lastIndexOf(',')) return asTyped;
  const left = spaced.slice(0, comma).trim();
  const right = spaced.slice(comma + 1).trim();
  if (!left || !right) return asTyped;
  if (!NAME_CHARS.test(left) || !NAME_CHARS.test(right)) return asTyped;

  const leftWords = left.split(' ');
  const rightWords = right.split(' ');
  const words = [...leftWords, ...rightWords];
  if (!words.every((w) => HAS_LETTER.test(w))) return asTyped;
  if (words.some((w) => TITLES.has(plain(w)) || SUFFIXES.has(plain(w)))) return asTyped;
  if (words.some((w) => BUSINESS.has(plain(w)))) return asTyped;
  if (leftWords.length > 3 || rightWords.length > 3) return asTyped;
  if (!leftWords.slice(0, -1).every((w) => PARTICLES.has(plain(w)))) return asTyped;

  return { name: `${right} ${left}`, flipped: true };
}
