export function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return Promise.resolve(window.confirm([opts.title, opts.message].filter(Boolean).join('\n\n')));
}

export function notify(title: string, message?: string) {
  window.alert([title, message].filter(Boolean).join('\n\n'));
}

/** The web has no multi-button alert: ask about each choice in turn. */
export function choose(opts: {
  title: string;
  message?: string;
  options: { label: string; destructive?: boolean }[];
}): Promise<number | null> {
  const head = [opts.title, opts.message].filter(Boolean).join('\n\n');
  const i = opts.options.findIndex((o) => window.confirm(`${head}\n\n${o.label}?`));
  return Promise.resolve(i === -1 ? null : i);
}
