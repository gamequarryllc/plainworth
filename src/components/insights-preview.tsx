import { createContext, useContext, type ReactNode } from 'react';

// Two contexts so that only the footer itself re-renders when a new footer
// element comes in. If the screens re-rendered too, their header options would
// be set again on every render of the stack, which never settles.
const PreviewOn = createContext(false);
const FooterContext = createContext<ReactNode>(null);
const WaitingContext = createContext<string | null>(null);

/**
 * Turns Insights into a preview: every screen inside shows only the last two
 * whole months instead of whole years, with `footer` at the end of the page
 * (for example, a way to unlock the rest). Without it, Insights shows everything.
 */
export function InsightsPreview({ footer, children }: { footer: ReactNode; children: ReactNode }) {
  return (
    <PreviewOn.Provider value={true}>
      <FooterContext.Provider value={footer}>{children}</FooterContext.Provider>
    </PreviewOn.Provider>
  );
}

/** Shows everything inside in full even where Insights is a preview. For pages drawn from sample data. */
export function InsightsUnlocked({ children }: { children: ReactNode }) {
  return (
    <PreviewOn.Provider value={false}>
      <FooterContext.Provider value={null}>{children}</FooterContext.Provider>
    </PreviewOn.Provider>
  );
}

/**
 * For a card there isn't enough history for yet: everything inside is drawn as
 * an example (blurred, numbers hidden) with `needs` saying what brings it to
 * life, like "Needs 2 months of balances".
 */
export function InsightsWaiting({ needs, children }: { needs: string; children: ReactNode }) {
  return <WaitingContext.Provider value={needs}>{children}</WaitingContext.Provider>;
}

/** What the card is waiting for, or null when it has what it needs. */
export function useInsightsWaiting(): string | null {
  return useContext(WaitingContext);
}

/** True when Insights is showing the preview. */
export function useInsightsPreview(): boolean {
  return useContext(PreviewOn);
}

/** The preview's footer, for the end of each Insights page. Nothing outside the preview. */
export function PreviewFooter() {
  return <>{useContext(FooterContext)}</>;
}
