import type { ID, SpendCategory } from '../types';

import type { Choice, Txn } from './types';

/** The bank's own words at the start of a line. Longer phrases first. */
const LEAD =
  /^(ORIG CO NAME|PURCHASE AUTHORIZED ON|RECURRING PAYMENT AUTHORIZED ON|AUTHORIZED ON|DEBIT CARD PURCHASE|DEBIT CARD|CHECK ?CARD PURCHASE|CHECK ?CARD|CARD PURCHASE|POS PURCHASE|WITHDRAWAL (FROM|TO)|DEPOSIT (FROM|TO)|PAYMENT TO|POS|ACH|CARD|RECURRING|PURCHASE|ONLINE|EXTERNAL|ELECTRONIC|PENDING|VISA|MASTERCARD|WITHDRAWAL|DEPOSIT|DEBIT|CREDIT|[\s:-])+/;

/**
 * A short name for who a statement line is with, the same for every visit:
 * "STARBUCKS STORE 12345 SEATTLE WA" and "Starbucks Store #991" both give
 * "STARBUCKS STORE". Choices are remembered under it. What the bank puts in
 * front ("Withdrawal from", "Debit Card Purchase -", "Orig CO Name:") is not
 * part of the name.
 */
export function merchantKey(description: string): string {
  const s = description
    .toUpperCase()
    .replace(LEAD, ' ')
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
  | 'entertainment' | 'exercise' | 'travel' | 'transport' | 'health' | 'personal' | 'gifts' | 'carloan'
  | 'studentloan' | 'loan';

/**
 * Money that only moved between the person's own accounts, said in a way that
 * leaves no doubt: a named account ("to 360 Checking", "from Savings", "to
 * CD"), a transfer, a brokerage, or a card statement's own words for a payment.
 */
const MOVED =
  /payment[ -]+thank you|payment received|crcardpmt|cardmember serv|credit crd|credit ?card (payment|pymt|pmt|bill)|\bcard\b.{0,24}\b(auto ?pay|payment|pymt|pmt)\b|\b(payment|pymt|pmt)\b.{0,24}\bcard\b|bill ?pay.{0,24}\bcard\b|transfer|xfer|\btfr\b|\b(to|from)\b[^,;]{0,40}\b(savings?|checking|chk|sav|cd|certificate|money market|mma|brokerage|ira|401k)\b|balance forward|you bought|you sold|\bbought\b|\bsold\b|reinvest|redemption|\bsweep|money market|contribution|\b401k|\bira\b|journal|wire (in|out)|funds? (received|sent)|brokerage|vanguard|fidelity|\bfid bkg|schwab|robinhood|coinbase|moneyline|wealthfront|betterment|e\*?trade|ameritrade|webull|acorns|m1 finance|merrill/;

/** A payment by its general name. By itself it doesn't say whether a card or a bill was paid. */
const PAID = /\bpymt\b|\bpmt\b|auto[- ]?pay(ment)?\b|online payment|e-?payment|epay\b|internet payment|mobile payment|bill ?pay(ment)?\b/;
const PAID_ALL = new RegExp(PAID.source, 'g');

/** Who issues cards. One of these being paid from a bank account is a card payment. */
const ISSUER =
  /capital one|\bchase\b|\bciti(bank|card)?\b|amex|american express|discover|barclay|synchrony|\bsyncb\b|comenity|credit one|apple ?card|\bgs ?bank|goldman|bank of america|bk of amer|\bboa\b|wells fargo|\bus bank\b|usaa|navy federal|\bnfcu\b|\bpnc\b|td bank|\belan\b|first premier|mission lane|\bsofi\b/;

/** Money sent between people. It can be anything, so it's never left out without a look. */
const PEOPLE = /zelle|venmo|cash ?app|paypal|apple cash/;

const PAY = /payroll|workday|\bppd\b.*\b(pay|sal)|direct dep|dir dep|salary|paycheck|\bwages?\b|gusto|\badp\b|paychex|employer/;

/** Checked top to bottom; the first that fits wins. */
const KINDS: [Kind, RegExp][] = [
  ['subscriptions', /netflix|spotify|hulu|disney ?plus|disney\+|apple\.com\/bill|icloud|youtube|hbo|\bmax\.com|paramount|peacock|prime video|amazon prime|audible|adobe|dropbox|patreon|nytimes|new york times|openai|chatgpt|google (one|storage)|microsoft 365|msft|sirius|kindle|substack|subscription/],
  ['utilities', /electric|energy|\bpower\b|water|sewer|\bgas (co|company|service)|comcast|xfinity|verizon|at&t|\batt\b|t-mobile|tmobile|spectrum|internet|utilit|pg&e|pge\b|duke|con ?ed|national grid|sanitation|waste|trash|cox comm|centurylink|mint mobile|visible|google fi/],
  ['housing', /\brent\b|mortgage|\bmtg\b|mr\.? cooper|loancare|newrez|pennymac|apartment|property (mgmt|management)|leasing|\bhoa\b|landlord|realty/],
  ['insurance', /geico|state farm|progressive|allstate|insurance|liberty mutual|\busaa\b|farmers ins|nationwide|lemonade/],
  ['carloan', /gm financial|toyota financial|honda financial|\bahfc\b|ford (motor )?credit|ally (auto|financial)|nissan motor acceptance|\bnmac\b|hyundai (motor )?finance|kia (motor )?finance|subaru motors? finance|vw credit|volkswagen credit|bmw financial|mercedes-?benz financial|chrysler capital|santander consumer|capital one auto|chase auto|wells fargo (auto|dealer)|carmax auto|bridgecrest|westlake financial|credit acceptance|auto (loan|finance)|car (loan|payment)|vehicle loan/],
  ['studentloan', /student loan|student ln|navient|nelnet|mohela|aidvantage|sallie mae|fedloan|edfinancial|dept of education|\bearnest\b/],
  ['loan', /\bloans?\b|upstart|lending ?club|\bprosper\b|onemain/],
  ['exercise', /\bgym\b|fitness|peloton|yoga|pilates|ymca|crossfit|equinox|orangetheory|climbing|strava/],
  ['gas', /shell|exxon|chevron|\bbp\b|\bmobil\b|exxonmobil|sunoco|speedway|wawa|7-?eleven|circle k|marathon|valero|\bfuel\b|\bgas\b|gasoline|texaco|citgo|phillips 66|conoco|arco|quiktrip|\bqt\b|sheetz|racetrac|casey|costco gas|buc-?ee|love's|pilot/],
  ['groceries', /kroger|safeway|whole ?foods|wholefds|trader joe|aldi|publix|wegmans|costco|h-?e-?b\b|food lion|giant|stop & shop|sprouts|albertsons|meijer|instacart|grocer|supermarket|\bmarket\b|winco|harris teeter|ralphs|vons|food 4 less|fred meyer|hy-?vee|piggly|shoprite|lidl|sam'?s ?club|bj's|fresh/],
  ['dining', /restaurant|roadhouse|jersey mike|supper|applebee|olive garden|chili's|buffalo wild|culver|arby|sonic drive|dairy queen|jimmy john|qdoba|\bihop\b|waffle|denny's|cracker barrel|red robin|outback|longhorn|tim horton|biggby|little caesar|papa john|taco bell|in-n-out|whataburger|zaxby|raising cane|wingstop|firehouse sub|potbelly|cheesecake factory|winery|vineyard|chateau|cellars|distill|cider|black star farms|brewery|brewing|taproom|tap room|grille|pizzeria|trattoria|taqueria|cocina|chophouse|smokehouse|creamery|espresso|mcdonald|starbucks|chipotle|doordash|uber ?eats|grubhub|pizza|cafe|coffee|taco|burger|wendy|chick-?fil|subway|dunkin|panera|grill|\bbar\b|kitchen|sushi|diner|bakery|domino|kfc|popeyes|five guys|shake shack|panda express|sweetgreen|\bdeli\b|bistro|brew|pub\b|eatery|ramen|noodle|bbq|steakhouse|ice cream|donut|bagel|tavern|cantina|thai|wing/],
  ['travel', /airline|\bdelta\b|united air|american air|southwest|jetblue|alaska air|spirit air|frontier air|airbnb|vrbo|hotel|marriott|hilton|hyatt|expedia|booking\.com|hertz|enterprise rent|avis|amtrak|\binn\b|resort|airport|priceline|kayak|lodging|lodge\b|suites|motel/],
  ['transport', /\buber\b|lyft|parking|\btoll|transit|metro\b|\bmta\b|e-?zpass|car wash|jiffy lube|autozone|o'?reilly|\bdmv\b|bart\b|clipper|ventra/],
  ['health', /pharmacy|cvs|walgreens|rite aid|medical|doctor|dental|dentist|hospital|clinic|\bhealth|optometr|vision|urgent care|labcorp|quest diag|therapy|kaiser/],
  ['personal', /lady jane|great clips|supercuts|sport clips|\bsalon|barber|haircut|\bnails?\b|\bspa\b|massage/],
  ['entertainment', /cinema|\bamc\b|regal|ticketmaster|stubhub|steam|playstation|xbox|nintendo|theat(er|re)|concert|bowling|\bgolf|museum|\bzoo\b|arcade|twitch|fandango|eventbrite|seatgeek/],
  ['gifts', /\bgift|flowers|florist|hallmark|charity|donation|gofundme|red cross/],
  ['shopping', /amazon|amzn|target|best ?buy|ebay|etsy|walmart|wal-?mart|home ?depot|lowe'?s|ikea|macy|nike|apple store|tj ?maxx|marshalls|kohl|nordstrom|old navy|\bgap\b|h&m|zara|uniqlo|sephora|ulta|wayfair|chewy|petsmart|petco|dollar|ross\b|costco\.com|shein|temu|rei\b/],
];

/** Which of the person's category names fit a kind, best first. */
const NAMES: Record<Kind, RegExp[]> = {
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
  personal: [/personal|hair|beauty|groom|self.?care/],
  gifts: [/gift|donat|charit/],
  carloan: [/car (payment|loan|note)|auto (loan|payment)|vehicle/, /\bcar\b|\bauto\b|truck/, /loans?\b|debt/],
  studentloan: [/student|tuition|college/, /loans?\b|debt/],
  loan: [/loans?\b|debt/],
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

/** The merchant's kind, read without the bank's payment words ("mobile", "internet") getting in the way. */
function kindOf(text: string): Kind | undefined {
  const plain = text.replace(PAID_ALL, ' ');
  return KINDS.find(([, rx]) => rx.test(plain))?.[0];
}

/** The line names the person's own account, a brokerage, or a card being paid. */
function moved(text: string): boolean {
  return !PEOPLE.test(text) && MOVED.test(text.replace(/debit card|check ?card/g, ' '));
}

/** Pay from a job, said outright. */
export function isPay(description: string): boolean {
  return PAY.test(description.toLowerCase());
}

/** A card being paid off from a bank account. What the card bought is on the card's own statement. */
export function isCardPayment(description: string): boolean {
  const text = description.toLowerCase();
  if (PEOPLE.test(text) || kindOf(text)) return false;
  if (/crcardpmt|cardmember serv|credit crd|credit ?card|\bcard\b.{0,24}\b(auto ?pay|payment|pymt|pmt)\b|\b(payment|pymt|pmt)\b.{0,24}\bcard\b/.test(text.replace(/debit card|check ?card/g, ' '))) return true;
  return ISSUER.test(text) && /pymt|pmt|pay|mobile|\bcrd\b/.test(text);
}

const NOT_A_NAME = new Set(['PPD', 'ACH', 'DIRECT', 'DIR', 'DEP', 'PAYROLL', 'PAYMENT', 'SALARY', 'MOBILE', 'ONLINE', 'TRANSFER', 'BANK', 'THE']);

/**
 * The employer's name on a pay line, to spot the same employer on a line that
 * doesn't say it's pay: a second, smaller deposit into another account.
 */
export function payer(description: string): string | null {
  const word = merchantKey(description).split(' ')[0];
  return word.length >= 4 && !NOT_A_NAME.has(word) ? word : null;
}

/**
 * Where a statement line most likely belongs. A choice the person made before
 * for the same merchant comes first. Money moved between their own accounts,
 * a brokerage move or a card payment is left out. Otherwise the merchant's
 * name is matched to one of their categories; anything else goes to General
 * (or Other Income) and is marked unsure. `employers` are names seen on pay
 * lines in the same import.
 */
export function guessCategory(txn: Txn, categories: SpendCategory[], remembered: Record<string, string>, employers?: Set<string>): Guess {
  const shown = categories.filter((c) => !c.hidden);
  const saved = remembered[merchantKey(txn.description)];
  if (saved === 'skip') return { choice: 'skip', sure: true };
  // A category hidden since then isn't wanted any more: the line is guessed afresh.
  if (saved && shown.some((c) => c.id === saved)) return { choice: saved, sure: true };

  const text = txn.description.toLowerCase();
  const kind = kindOf(text);
  const people = PEOPLE.test(text);

  if (txn.amount < 0) {
    const paycheck = named(shown, ['income'], [/paycheck|salary|pay\b|wage|job|work/]) ?? shown.find((c) => c.group === 'income')?.id ?? null;
    const other = named(shown, ['income'], [/other/]) ?? shown.find((c) => c.group === 'income')?.id ?? null;
    if (PAY.test(text) && paycheck) return { choice: paycheck, sure: true };
    if (moved(text)) return { choice: 'skip', sure: true };
    // Money in that calls itself a payment is someone paying a card off, not income.
    if (!people && /\bpayment\b|\bpymt\b|\bpmt\b/.test(text)) return { choice: 'skip', sure: true };
    // Cash or a check paid in says nothing about where it came from.
    if (/cash (added|deposit)|atm deposit|mobile deposit|check deposit/.test(text)) return { choice: other, sure: false };
    // A refund goes back to where the spending was.
    if (kind && /refund|return|reversal|credit/.test(text)) {
      const id = named(shown, ['recurring', 'variable'], NAMES[kind]);
      if (id) return { choice: id, sure: true };
    }
    if (/interest|dividend|\bdiv\b|cash ?back|reward/.test(text)) return { choice: other, sure: true };
    const from = payer(txn.description);
    if (from && employers?.has(from) && paycheck) return { choice: paycheck, sure: true };
    // A big unexplained deposit is most likely pay.
    if (!people && -txn.amount >= 50000 && /deposit|\bdep\b|\bach\b|\bppd\b|des:|credit/.test(text)) return { choice: paycheck ?? other, sure: false };
    return { choice: other, sure: false };
  }

  const fallback = named(shown, ['variable', 'recurring'], [/^general/, /^other/, /^misc/, /everything else/]);
  // Cash out of a machine could have gone anywhere.
  if (/\batm\b|cash withdrawal/.test(text)) return { choice: fallback, sure: false };
  if (moved(text)) return { choice: 'skip', sure: true };
  // A bill or a loan paid by "autopay" or "pymt" is still that bill.
  if (kind) {
    const id = named(shown, ['recurring', 'variable'], NAMES[kind]);
    if (id) return { choice: id, sure: true };
    if (kind === 'carloan' || kind === 'studentloan' || kind === 'loan') return { choice: fallback, sure: false };
  }
  if (isCardPayment(txn.description)) return { choice: 'skip', sure: true };
  // A payment to no one in particular: most likely a card, so it's left out, but worth a look.
  if (!people && !kind && PAID.test(text)) return { choice: 'skip', sure: false };
  return { choice: fallback, sure: false };
}
