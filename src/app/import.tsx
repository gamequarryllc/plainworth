import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ImportHero } from '@/components/import-hero';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { StatTiles } from '@/components/stat-tiles';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { currentMonthKey, formatDate, MONTHS, parseMonthKey } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { GROUPS } from '@/lib/spending';
import {
  buildReview,
  choose,
  pairTransfers,
  counts,
  readSpreadsheet,
  readText,
  readTextWithAi,
  totalsOf,
  type Item,
  type Txn,
} from '@/lib/statement';
import { merchantKey } from '@/lib/statement/categorize';
import {
  aiAsk,
  aiStatus,
  canReadDocuments,
  pdfFragments,
  pickFiles,
  type AiStatus,
  type Picked,
} from '@/lib/statement/reader';
import { useStore } from '@/store';
import { applyImport, importMemory, seenIn, setImportAi } from '@/store/statement-import';
import { layout, useColors } from '@/theme';

type Step = 'pick' | 'reading' | 'review' | 'problem';

/**
 * Import statements into one month of Spending (?month=YYYY-MM). The files
 * are read on the phone, the month's lines are sorted into the person's
 * categories, and nothing is added until they've looked the list over.
 */
export default function ImportScreen() {
  const params = useLocalSearchParams<{ month: string }>();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month : currentMonthKey();
  const target = parseMonthKey(month);
  const monthName = MONTHS[target.month - 1];
  const c = useColors();
  const money = useMoney();
  const categories = useStore((s) => s.spendCategories);

  const [step, setStep] = useState<Step>('pick');
  const [progress, setProgress] = useState('');
  const [problem, setProblem] = useState({ title: '', message: '' });
  const [txns, setTxns] = useState<Txn[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [otherMonths, setOtherMonths] = useState(0);
  const [usedAi, setUsedAi] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [ai, setAi] = useState(() => importMemory().ai);
  const [status, setStatus] = useState<AiStatus>('unsupported');

  useEffect(() => {
    aiStatus().then(setStatus);
  }, []);

  const fail = (title: string, message: string) => {
    setProblem({ title, message });
    setStep('problem');
  };

  /** Lay out everything read so far. Picks already made by hand carry over when another statement is added. */
  const show = (found: Txn[], names: string[], unread: string[]) => {
    const paired = pairTransfers(found.map((t) => ({ ...t, transfer: false })));
    const review = buildReview(paired, month, categories, importMemory().rules, seenIn(month));
    const key = (t: Txn) => `${t.source}|${t.date}|${t.amount}|${t.description}`;
    const kept = new Map(items.filter((i) => i.picked).map((i) => [key(i), i.choice]));
    setTxns(found);
    setFiles(names);
    setItems(review.items.map((i) => (kept.has(key(i)) ? { ...i, choice: kept.get(key(i))!, sure: true, picked: true } : i)));
    setOtherMonths(review.otherMonths);
    setSkipped(unread);
    if (review.items.length) setStep('review');
    else if (found.length) fail(`Nothing from ${monthName}`, `${found.length} ${found.length === 1 ? 'line was' : 'lines were'} found, all from other months.`);
    else if (unread.length) fail('Can’t Read This File', 'Use a PDF, an Excel file (.xlsx) or a CSV from your bank’s website.');
    else fail('No Transactions Found', 'Try the PDF or CSV statement from your bank’s website.');
  };

  /** Pick statements and read them. `more` adds to the ones already in the review. */
  const read = async (more: boolean) => {
    let picked: Picked[] | null;
    try {
      picked = await pickFiles();
    } catch {
      if (!more) fail('Couldn’t Open That', 'Try choosing it again.');
      return;
    }
    if (!picked) return;
    setStep('reading');
    setProgress('');
    const found = more ? [...txns] : [];
    const names = more ? [...files] : [];
    const unread: string[] = [];
    let locked = false;
    let aiUsed = more && usedAi;
    for (const [n, file] of picked.entries()) {
      if (picked.length > 1) setProgress(`Statement ${n + 1} of ${picked.length}`);
      try {
        let lines: Txn[];
        if (file.kind === 'unsupported') throw new Error('unsupported');
        else if (file.kind === 'table') lines = readSpreadsheet(file.bytes, target);
        else {
          const fragments = await pdfFragments(file.uri);
          if (ai && status === 'available') {
            const result = await readTextWithAi(fragments, target, aiAsk, (done, of) => setProgress(`Part ${done + 1} of ${of}`));
            aiUsed = aiUsed || result.usedAi;
            lines = result.txns;
          } else lines = readText(fragments, target);
        }
        if (!lines.length) throw new Error('empty');
        const source = names.length;
        names.push(file.name);
        found.push(...lines.map((t) => ({ ...t, source })));
      } catch (e) {
        if (e instanceof Error && /locked/.test(e.message)) locked = true;
        unread.push(file.name);
      }
    }
    setUsedAi(aiUsed);
    if (!found.length && locked) fail('This PDF Has a Password', 'Save a copy without the password, then try again.');
    else if (!found.length && !canReadDocuments && picked.some((f) => f.kind === 'pdf')) fail('Not on This Device', 'PDFs are read on iPhone. Excel and CSV files work here.');
    else show(found, names, unread);
  };

  const totals = totalsOf(items, categories);
  const byId = new Map(categories.map((x) => [x.id, x]));

  const add = () => {
    if (!applyImport(month, items, categories)) return;
    haptics.success();
    router.back();
  };

  /** A bank or card that writes its amounts the other way round: flip that statement's and sort again. */
  const swap = (source: number) => {
    haptics.light();
    show(txns.map((t) => (t.source === source ? { ...t, amount: -t.amount } : t)), files, []);
  };

  const cancel = { label: 'Cancel', icon: 'xmark' as const, onPress: () => router.back() };

  // Choosing a category for one line.
  const pickingItem = picking != null ? items.find((i) => i.id === picking) : undefined;
  if (step === 'review' && pickingItem) {
    const set = (choice: string) => {
      haptics.selection();
      setItems(choose(items, pickingItem.id, choice));
      setPicking(null);
    };
    const merchant = merchantKey(pickingItem.description);
    return (
      <Screen title="Category" left={[{ label: 'Back', icon: 'chevron.left', onPress: () => setPicking(null) }]}>
        <Section>
          <Row
            title={pickingItem.description}
            subtitle={pickingItem.date ? formatDate(pickingItem.date) : undefined}
            value={money(Math.abs(pickingItem.amount))}
          />
        </Section>
        <Section>
          <Row
            title="Don’t Add"
            titleColor="down"
            chevron={false}
            accessory={pickingItem.choice === 'skip' ? <Icon name="checkmark" size={16} weight="semibold" color={c.tint} /> : null}
            onPress={() => set('skip')}
          />
        </Section>
        {GROUPS.map((group) => (
          <Section key={group.key} header={group.title}>
            {categories
              .filter((x) => x.group === group.key && (!x.hidden || x.id === pickingItem.choice))
              .sort((a, b) => a.order - b.order)
              .map((x) => (
                <Row
                  key={x.id}
                  title={x.name}
                  chevron={false}
                  accessory={pickingItem.choice === x.id ? <Icon name="checkmark" size={16} weight="semibold" color={c.tint} /> : null}
                  onPress={() => set(x.id)}
                />
              ))}
          </Section>
        ))}
        {merchant ? (
          <Text variant="footnote" color="secondary" style={styles.note}>
            Remembered for {titleCase(merchant)} next time.
          </Text>
        ) : null}
      </Screen>
    );
  }

  if (step === 'review') {
    const leftOut = items.filter((i) => !counts(i) && (i.choice === 'skip' || i.seen));
    const check = items.filter((i) => !leftOut.includes(i) && (!i.sure || !i.choice));
    const sorted = items.filter((i) => !leftOut.includes(i) && !check.includes(i));
    const line = (i: Item) => {
      const already = i.seen && !i.picked;
      const category = !already && i.choice && i.choice !== 'skip' ? byId.get(i.choice) : undefined;
      const label = category ? category.name : already ? 'Already added' : i.choice === 'skip' ? 'Not added' : 'Choose';
      return (
        <Row
          key={i.id}
          title={i.description}
          subtitle={i.date ? formatDate(i.date, { year: false }) : 'No date'}
          value={
            <Text variant="body" tabular numberOfLines={1} color={i.amount < 0 ? 'up' : 'text'}>
              {i.amount < 0 ? '+' : ''}
              {money(Math.abs(i.amount))}
            </Text>
          }
          detail={
            <Text variant="subheadline" numberOfLines={1} color={category ? 'tint' : !i.choice ? 'warning' : 'secondary'}>
              {label}
            </Text>
          }
          onPress={() => setPicking(i.id)}
          accessibilityLabel={`${i.description}, ${label}`}
        />
      );
    };
    return (
      <Screen
        title={`Import to ${monthName}`}
        left={[cancel]}
        right={[{ label: totals.count ? `Add ${totals.count}` : 'Add', icon: 'checkmark', variant: 'done', disabled: !totals.count, onPress: add }]}>
        <StatTiles
          tiles={[
            { label: 'Spending', value: money(totals.spending) },
            { label: 'Income', value: money(totals.income) },
          ]}
        />
        <Text variant="footnote" color="secondary" style={styles.note}>
          Added on top of what’s in {monthName}. Tap a line to change it.
          {usedAi ? ' Read with Apple Intelligence, so check the amounts.' : ''}
        </Text>
        {check.length ? <Section header="Check These">{check.map(line)}</Section> : null}
        {sorted.length ? <Section header="Sorted">{sorted.map(line)}</Section> : null}
        {leftOut.length || otherMonths ? (
          <Section
            header={leftOut.length ? 'Not Added' : undefined}
            footer={otherMonths ? `${otherMonths} from other months left out.` : undefined}>
            {leftOut.map(line)}
          </Section>
        ) : null}
        <Section
          header="Statements"
          footer={`${skipped.length ? `Couldn’t read ${skipped.join(', ')}. ` : ''}Add every account you used in ${monthName}. If a statement’s spending shows as income, tap it to swap.`}>
          {files.map((name, source) => (
            <Row
              key={source}
              title={name}
              value={`${txns.filter((t) => t.source === source && (!t.date || t.date.startsWith(month))).length}`}
              chevron={false}
              onPress={() => swap(source)}
              accessibilityLabel={`${name}, swap money in and out`}
            />
          ))}
          <Row
            title="Add Another Statement"
            titleColor="tint"
            chevron={false}
            leading={<Icon name="plus" size={17} weight="semibold" color={c.tint} />}
            onPress={() => read(true)}
          />
        </Section>
      </Screen>
    );
  }

  if (step === 'reading') {
    return (
      <Screen title="Import Statement" left={[cancel]} scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text variant="callout" color="secondary">
            {progress || 'Reading…'}
          </Text>
        </View>
      </Screen>
    );
  }

  if (step === 'problem') {
    return (
      <Screen title="Import Statement" left={[cancel]}>
        <EmptyState icon="doc" title={problem.title} message={problem.message}>
          <Button title="Try Another" onPress={() => setStep('pick')} style={styles.button} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen title="Import Statement" left={[cancel]}>
      <ImportHero month={monthName} />
      <View style={styles.choose}>
        <Button title="Choose Statements" icon="doc" onPress={() => read(false)} style={styles.button} />
        <Text variant="footnote" color="secondary" style={styles.formats}>
          {canReadDocuments ? 'PDF, Excel or CSV. Pick several at once.' : 'Excel or CSV. Pick several at once.'}
        </Text>
      </View>
      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.text} style={styles.point}>
            <Icon name={p.icon} size={17} color={c.secondary} style={styles.pointIcon} />
            <Text variant="subheadline" color="secondary" style={styles.pointText}>
              {p.text === 'device' ? `Read on this ${canReadDocuments ? 'iPhone' : 'device'}. Nothing is uploaded.` : p.text}
            </Text>
          </View>
        ))}
      </View>
      {status === 'available' ? (
        <Section footer="Optional. Can help with messy PDFs. It runs on this iPhone; use at your discretion.">
          <Row
            title="Apple Intelligence"
            leading={<Icon name="sparkles" size={20} color={c.tint} />}
            accessory={
              <Switch
                value={ai}
                onValueChange={(on) => {
                  setAi(on);
                  setImportAi(on);
                }}
              />
            }
          />
        </Section>
      ) : status === 'off' || status === 'notReady' ? (
        <Section footer="Optional. Turn on Apple Intelligence in the Settings app to use it here.">
          <Row
            title="Apple Intelligence"
            titleColor="secondary"
            leading={<Icon name="sparkles" size={20} color={c.tertiary} />}
            value={status === 'off' ? 'Off' : 'Not Ready'}
          />
        </Section>
      ) : null}
    </Screen>
  );
}

const POINTS: { icon: SFSymbol; text: string }[] = [
  { icon: 'arrow.left.arrow.right', text: 'Transfers and card payments are left out.' },
  { icon: 'checklist', text: 'You review everything before it’s added.' },
  { icon: 'lock', text: 'device' },
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (ch) => ch.toUpperCase());
}

const styles = StyleSheet.create({
  note: {
    marginHorizontal: layout.margin,
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  choose: {
    marginHorizontal: layout.margin,
    marginTop: 20,
    gap: 8,
  },
  formats: {
    textAlign: 'center',
  },
  points: {
    marginHorizontal: layout.margin,
    marginTop: 22,
    gap: 10,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pointIcon: {
    width: 22,
  },
  pointText: {
    flex: 1,
  },
  button: {
    alignSelf: 'stretch',
    marginHorizontal: 0,
  },
});
