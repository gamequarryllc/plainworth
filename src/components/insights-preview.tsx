import { createContext, useContext, type ReactNode } from 'react';

// Two contexts so that only the footer itself re-renders when a new footer
// element comes in. If the screens re-rendered too, their header options would
// be set again on every render of the stack, which never settles.
const PreviewOn = createContext(false);
const FooterContext = createContext<ReactNode>(null);

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

/** True when Insights is showing the preview. */
export function useInsightsPreview(): boolean {
  return useContext(PreviewOn);
}

/** The preview's footer, for the end of each Insights page. Nothing outside the preview. */
export function PreviewFooter() {
  return <>{useContext(FooterContext)}</>;
}
