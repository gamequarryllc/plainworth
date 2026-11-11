/** Where feedback goes. The same address as the support page. */
export const FEEDBACK_EMAIL = 'gamequarryllc@protonmail.com';

export interface FeedbackDetails {
  version?: string | null;
  build?: string | null;
  /** e.g. "iPhone 15 Pro" */
  device?: string | null;
  /** e.g. "iOS 18.1" */
  system?: string | null;
}

/** "Plainworth 1.2.0 (14) · iPhone 15 Pro · iOS 18.1", leaving out whatever isn't known. */
export function feedbackSignature(d: FeedbackDetails): string {
  const app = ['Plainworth', d.version, d.build ? `(${d.build})` : null].filter(Boolean).join(' ');
  return [app, d.device, d.system].filter(Boolean).join(' · ');
}

/**
 * A mailto link with the subject filled in and the app version at the bottom of
 * the message, so a bug report says what it was written on. The person sees it
 * all in Mail before sending, and nothing they entered in Plainworth is included.
 */
export function feedbackMailto(d: FeedbackDetails): string {
  const subject = 'Plainworth feedback';
  const body = `\n\n\n${feedbackSignature(d)}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
