/**
 * [[GTC-479]] — the words of Moment 1's sessions card and of "who comes to which session", exactly
 * as the founder approved them (ruling 1, decision 6, 24 Nov 2026). Change them only by a ruling.
 * The screens say "session" (Q1).
 *
 * Imports nothing, on purpose: pure, so the card, the route and the tests read the same words.
 */

/**
 * [[GTC-483]] — THE DISH WORDS (the founder's ruling 1 on the plan, 26 Nov 2026: "A: option 1, with
 * the everyday word list as shown"; "glazed" added by the founder's word in the question box the
 * same day). A name typed with a capital ("Bread rolls") read "the Bread rolls" mid-sentence. Its
 * first letter is lowered only on a known everyday first word, so a name ("Christmas pudding",
 * "Mum's pavlova") reads as typed. Only these four sentences use it, all behind the sessions
 * switch: Moment 1's dish warning, the guest's question and line, and Moment 3's warning.
 */
const EVERYDAY_WORDS: ReadonlySet<string> = new Set(
  `antipasto apple apples avocado bacon bagels baked banana barbecue
  beans beef beer beetroot berries berry biscuits boiled bread breads
  brownies buns butter cake cakes candles canapés carrot carrots
  cheese cheeseboard cheesecake cherries chicken children chilli
  chilly chips chocolate chops cider cleaning coffee cold coleslaw
  cookies corn crackers cream crisps cucumber cupcakes cups curry
  custard cutlery date decorations dessert desserts dip dips dishes
  drinks dumplings eggs fairy finger fish flowers fresh fried fritters
  fruit games garden garlic glazed gravy green grilled ham homemade honey
  hot hummus ice jelly juice kids kumara lamb lamingtons lemon lemonade
  lettuce lollies lolly marshmallows meat meringue milk mince mini mint
  mixed muffins mushrooms mussels napkins noodles nuts olives onion
  oysters party pasta pastries pav pavlova peas picnic pie pies
  pikelets pineapple pizza plates platter pork potato potatoes prawns
  pudding pumpkin punch quiche rice roast roasted rolls rubbish salad
  salads salmon sandwiches sauce sausage sausages savoury scones
  seafood slaw slice smoked snacks soft soup sparkling spinach sponge
  spring steak sticky strawberries stuffing sushi sweet tables tart
  tarts tea tomato tomatoes trifle turkey vegan vege veges vegetables
  vegetarian veggie veggies washing water watermelon wine wraps`.split(/\s+/)
);

/** First words that take no "the" before them; the word itself is lowered ("Some ice"). */
const NO_THE_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'some',
  'my',
  'our',
  'your',
  'their',
  'his',
  'her',
  'extra',
]);

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const startsCapital = (s: string) => s.length > 0 && s.charAt(0) !== s.charAt(0).toLowerCase();
/** "Bread": one capital, then small letters only. */
const oneCapital = (w: string) => startsCapital(w) && w.slice(1) === w.slice(1).toLowerCase();
/** A possessive first word without its mark: "Mum's" is "Mum", "Kids'" is "Kids"; else null. */
function possessiveBase(word: string): string | null {
  if (/['’]s$/.test(word)) return word.slice(0, -2);
  if (/s['’]$/.test(word)) return word.slice(0, -1);
  return null;
}

/**
 * One dish as a sentence names it: "the bread rolls", "the Christmas pudding", "Mum's pavlova",
 * "the pavlova", "some ice", "2 bags of ice". Everything else exactly as typed after "the".
 */
export function dishWords(name: string): string {
  const [first = '', next = ''] = name.split(/\s+/);
  if (/^\d/.test(first)) return name;
  if (NO_THE_WORDS.has(first.toLowerCase())) return oneCapital(first) ? lowerFirst(name) : name;
  const base = possessiveBase(first);
  const word = base ?? first;
  const everyday = EVERYDAY_WORDS.has(word.toLowerCase());
  if (base !== null && !everyday) return name;
  if (everyday && oneCapital(word) && !startsCapital(next)) return `the ${lowerFirst(name)}`;
  return `the ${name}`;
}

/** "the pavlova"; "the pavlova and the ham"; "the pavlova, the ham and the trifle". */
export function dishList(names: readonly string[]): string {
  const the = names.map(dishWords);
  if (the.length <= 1) return the.join('');
  return `${the.slice(0, -1).join(', ')} and ${the[the.length - 1]}`;
}

export const CARD_WORDS = {
  heading: 'Sessions',
  emptyManyDates:
    'Is this more than one meal? Add a session for each one, like Christmas lunch or Boxing Day dinner. Until you add one, everything is for the whole event.',
  emptyOneDay:
    'Lunch and dinner on the day? Add a session for each. Until you add one, everything is for the whole event.',
  fillEachDate: 'Add one session for each date',
  add: '+ Add a session',
  nameLabel: 'Session name',
  dateLabel: 'Date',
  namePlaceholder: 'e.g. Christmas lunch',
  save: 'Save session',
  cancel: 'Cancel',
  edit: 'Edit',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveUpAloud: (name: string) => `Move ${name} up`,
  moveDownAloud: (name: string) => `Move ${name} down`,
  outsideDates: "Outside the event's dates",
  removeAsk: (name: string) => `Remove ${name}?`,
  removeYes: 'Remove',
  removeNo: 'Keep it',
  saveFailed: "That didn't save. Please try again.",
} as const;

export const COMING_WORDS = {
  heading: 'Who comes to which session',
  line: 'Everyone comes to every session unless you say otherwise.',
  every: 'Coming to: every session',
  some: (names: readonly string[]) => `Coming to: ${names.join(', ')}`,
  differs: 'Coming to: it differs by person',
  none: 'Coming to: no sessions',
  change: 'Change',
  done: 'Done',
  littles: 'Kids without jobs come with the household.',
  dishWarning: (person: string, dishes: readonly string[], session: string) =>
    `${person} is down to bring ${dishList(dishes)} to ${session}. Mark ${person} as not coming to ${session} anyway? Nothing changes about the dish.`,
  markAnyway: 'Mark as not coming',
  keepComing: 'Keep as coming',
} as const;

/** The new route's own words (the session one is GTC-478's, `SESSION_WORDS.notOnEvent`). */
export const ATTENDANCE_WORDS = {
  personNotOnEvent: 'That person is not on this event',
  comingMissing: 'Say whether they are coming to this session',
} as const;
