import type { ID, SpendCategory } from '../types';

import type { Choice, Txn } from './types';

/**
 * A short name for who a statement line is with, the same for every visit:
 * "STARBUCKS STORE 12345 SEATTLE WA" and "Starbucks Store #991" both give
 * "STARBUCKS STORE". Choices are remembered under it.
 */
export function merchantKey(description: string): string {
  const s = description
    .toUpperCase()
    .replace(/^(POS|ACH|DEBIT CARD|CHECK ?CARD|CHECKCARD|CARD|RECURRING|PURCHASE|ONLINE|EXTERNAL|ELECTRONIC|PENDING|VISA|MASTERCARD|PAYMENT TO|WITHDRAWAL|DEBIT|CREDIT|AUTHORIZED ON|PURCHASE AUTHORIZED ON|[\s:-])+/g, ' ')
    .replace(/\b(SQ|TST|PAYPAL|PP|SP|IN|GOOGLE|APL|APPLE PAY)\s?\*/g, ' ')
    .replace(/[*#/\\|,;:()]+/g, ' ');
  // The name ends where the store number starts: "KROGER #442 COLUMBUS OH" is "KROGER".
  const words: string[] = [];
  for (const token of s.split(/\s+/)) {
    if (!token) continue;
    if (/\d/.test(token)) {
      if (words.length) break;
      continue;
    }
    for (const w of token.replace(/[^A-Z&'+]+/g, ' ').split(' ')) if (w.length > 1 || w === '&') words.push(w);
  }
  return words.slice(0, 2).join(' ');
}

/** What kind of thing a line is, before it's matched to one of the person's own categories. */
type Kind =
  | 'groceries' | 'dining' | 'gas' | 'utilities' | 'subscriptions' | 'housing' | 'insurance' | 'shopping'
  | 'entertainment' | 'exercise' | 'travel' | 'transport' | 'health' | 'gifts' | 'pay' | 'transfer';

/** Checked top to bottom; the first that fits wins. */
const KINDS: [Kind, RegExp][] = [
  ['transfer', /payment[ -]+thank you|autopay|auto[- ]?pay(ment)?\b|online payment|e-?payment|epay\b|crcardpmt|card payment|cardmember serv|payment to .*card|credit crd|transfer|xfer|\btfr\b|to savings|from savings|to checking|from checking|balance forward|brokerage|vanguard|fidelity|schwab|robinhood|coinbase|internet payment|mobile payment|bill ?pay .*card/],
  ['pay', /payroll|direct dep|dir dep|salary|paycheck|\bwages?\b|gusto|\badp\b|paychex|employer/],
  ['subscriptions', /netflix|spotify|hulu|disney ?plus|disney\+|apple\.com\/bill|icloud|youtube|hbo|\bmax\.com|paramount|peacock|prime video|amazon prime|audible|adobe|dropbox|patreon|nytimes|new york times|openai|chatgpt|google (one|storage)|microsoft 365|msft|sirius|kindle|substack|subscription/],
  ['utilities', /electric|energy|\bpower\b|water|sewer|\bgas (co|company|service)|comcast|xfinity|verizon|at&t|\batt\b|t-mobile|tmobile|spectrum|internet|utilit|pg&e|pge\b|duke|con ?ed|national grid|sanitation|waste|trash|cox comm|centurylink|mint mobile|visible|google fi/],
  ['housing', /\brent\b|mortgage|apartment|property (mgmt|management)|leasing|\bhoa\b|landlord|realty/],
  ['insurance', /geico|state farm|progressive|allstate|insurance|liberty mutual|\busaa\b|farmers ins|nationwide|lemonade/],
  ['exercise', /\bgym\b|fitness|peloton|yoga|pilates|ymca|crossfit|equinox|orangetheory|climbing|strava/],
  ['gas', /shell|exxon|chevron|\bbp\b|mobil|sunoco|speedway|wawa|7-?eleven|circle k|marathon|valero|\bfuel\b|\bgas\b|gasoline|texaco|citgo|phillips 66|conoco|arco|quiktrip|\bqt\b|sheetz|racetrac|casey|costco gas|buc-?ee|love's|pilot/],
  ['groceries', /kroger|safeway|whole ?foods|wholefds|trader joe|aldi|publix|wegmans|costco|h-?e-?b\b|food lion|giant|stop & shop|sprouts|albertsons|meijer|instacart|grocer|supermarket|\bmarket\b|winco|harris teeter|ralphs|vons|food 4 less|fred meyer|hy-?vee|piggly|shoprite|lidl|sam'?s ?club|bj's|fresh/],
  ['dining', /restaurant|mcdonald|starbucks|chipotle|doordash|uber ?eats|grubhub|pizza|cafe|coffee|taco|burger|wendy|chick-?fil|subway|dunkin|panera|grill|\bbar\b|kitchen|sushi|diner|bakery|domino|kfc|popeyes|five guys|shake shack|panda express|sweetgreen|\bdeli\b|bistro|brew|pub\b|eatery|ramen|noodle|bbq|steakhouse|ice cream|donut|bagel|tavern|cantina|thai|wing/],
  ['travel', /airline|\bdelta\b|united air|american air|southwest|jetblue|alaska air|spirit air|frontier air|airbnb|vrbo|hotel|marriott|hilton|hyatt|expedia|booking\.com|hertz|enterprise rent|avis|amtrak|\binn\b|resort|airport|priceline|kayak/],
  ['transport', /\buber\b|lyft|parking|\btoll|transit|metro\b|\bmta\b|e-?zpass|car wash|jiffy lube|autozone|o'?reilly|\bdmv\b|bart\b|clipper|ventra/],
  ['health', /pharmacy|cvs|walgreens|rite aid|medical|doctor|dental|dentist|hospital|clinic|\bhealth|optometr|vision|urgent care|labcorp|quest diag|therapy|kaiser/],
  ['entertainment', /cinema|\bamc\b|regal|ticketmaster|stubhub|steam|playstation|xbox|nintendo|theat(er|re)|concert|bowling|\bgolf|museum|\bzoo\b|arcade|twitch|fandango|eventbrite|seatgeek/],
  ['gifts', /\bgift|flowers|florist|hallmark|charity|donation|gofundme|red cross/],
  ['shopping', /amazon|amzn|target|best ?buy|ebay|etsy|walmart|wal-?mart|home ?depot|lowe'?s|ikea|macy|nike|apple store|tj ?maxx|marshalls|kohl|nordstrom|old navy|\bgap\b|h&m|zara|uniqlo|sephora|ulta|wayfair|chewy|petsmart|petco|dollar|ross\b|costco\.com|shein|temu|rei\b/],
];

/** Which of the person's category names fit a kind, best first. */
const NAMES: Record<Exclude<Kind, 'transfer' | 'pay'>, RegExp[]> = {
  groceries: [/grocer/, /food/],
  dining: [/eating out|dining|restaurant|takeout|take out/, /food/],
  gas: [/\bgas\b|fuel/, /\bcar\b|auto|transport/],
  utilities: [/utilit/, /bills?/],
  subscriptions: [/subscri/, /streaming|entertain/],
  housing: [/rent|mortgage|housing/],
  insurance: [/insur/],
  shopping: [/shopping/],
  entertainment: [/entertain|fun/],
  exercise: [/exercise|gym|fitness/, /health/],
  travel: [/travel|vacation|trips?\b/],
  transport: [/transport|transit|\bcar\b|auto|rideshare/, /travel/],
  health: [/health|medical|pharmacy|doctor/],
  gifts: [/gift|donat|charit/],
};

export interface Guess {
  choice: Choice;
  /** False when it was a fallback (General, Other Income) or nothing fit: worth a look. */
  sure: boolean;
}

function named(categories: SpendCategory[], groups: SpendCategory['group'][], patterns: RegExp[]): ID | null {
  for (const rx of patterns) {
    const hit = categories.find((c) => groups.includes(c.group) && rx.test(c.name.toLowerCase()));
    if (hit) return hit.id;
  }
  return null;
}

/**
 * Where a statement line most likely belongs. A choice the person made before
 * for the same merchant comes first; then the merchant's name is matched to
 * one of their categories; a transfer or card payment is left out; anything
 * else goes to General (or Other Income) and is marked unsure.
 */
export function guessCategory(txn: Txn, categories: SpendCategory[], remembered: Record<string, string>): Guess {
  const shown = categories.filter((c) => !c.hidden);
  const saved = remembered[merchantKey(txn.description)];
  if (saved === 'skip') return { choice: 'skip', sure: true };
  if (saved && categories.some((c) => c.id === saved)) return { choice: saved, sure: true };

  const text = txn.description.toLowerCase();
  const kind = KINDS.find(([, rx]) => rx.test(text))?.[0];
  if (kind === 'transfer') return { choice: 'skip', sure: true };

  if (txn.amount < 0) {
    // Money in: a refund goes back to where the spending was; pay goes to a paycheck.
    if (kind && kind !== 'pay' && /refund|return|reversal|credit/.test(text)) {
      const id = named(shown, ['recurring', 'variable'], NAMES[kind]);
      if (id) return { choice: id, sure: true };
    }
    if (kind === 'pay') {
      const id = named(shown, ['income'], [/paycheck|salary|pay\b|wage|job|work/]) ?? shown.find((c) => c.group === 'income')?.id;
      if (id) return { choice: id, sure: true };
    }
    const other = named(shown, ['income'], [/other/]) ?? shown.find((c) => c.group === 'income')?.id ?? null;
    return { choice: other, sure: false };
  }

  if (kind && kind !== 'pay') {
    const id = named(shown, ['recurring', 'variable'], NAMES[kind]);
    if (id) return { choice: id, sure: true };
  }
  const fallback = named(shown, ['variable', 'recurring'], [/^general/, /^other/, /^misc/, /everything else/]);
  return { choice: fallback, sure: false };
}
