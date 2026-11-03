/**
 * The name people can add in Settings, which turns the Net Worth title into
 * "Alex’s Net Worth" and goes on images they share.
 */

/** Longest name the Settings field takes. */
export const NAME_MAX = 30;

/**
 * Room for the large title on the narrowest iPhone (375 points wide, less the
 * margins). iOS cuts a large title off with "…" instead of shrinking it, so a
 * name only goes in when the whole title fits.
 */
const TITLE_ROOM = 343;

/**
 * Rough width of a 34pt bold title in points, from San Francisco's letter
 * widths grouped by size ("Net Worth" comes to about 158).
 */
export function titleWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 7.2;
    else if (/[iljI.,:;'’!|]/.test(ch)) w += 8.5;
    else if (/[frtJ1()[\]\/-]/.test(ch)) w += 12.5;
    else if (/[mwMW%@]/.test(ch)) w += 30;
    else if (/[A-Z&]/.test(ch)) w += 23;
    else if (/[a-z0-9]/.test(ch)) w += 19.5;
    else if (ch.codePointAt(0)! >= 0x2e80) w += 34;
    else w += 22;
  }
  return w;
}

export function cleanName(name: string | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

/** "Alex" → "Alex’s", "James" → "James’". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/**
 * The Net Worth tab's title: "Alex’s Net Worth" when it fits on one line, the
 * first name alone when the full name doesn't ("Mary Beth Anderson" → "Mary’s
 * Net Worth"), and plain "Net Worth" with no name or one too long to fit
 * ("Christopher": Settings suggests a shorter one).
 */
export function netWorthTitle(name: string | undefined): string {
  const full = cleanName(name);
  if (!full) return 'Net Worth';
  // "Mom & Dad" or "Sam and Jo" is a couple, not a first and last name.
  const couple = /&|\band\b|\+/i.test(full);
  const tries = couple ? [full] : [full, full.split(' ')[0]];
  for (const n of tries) {
    const title = `${possessive(n)} Net Worth`;
    if (titleWidth(title) <= TITLE_ROOM) return title;
  }
  return 'Net Worth';
}
