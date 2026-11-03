import { router } from "expo-router";
import { StyleSheet } from "react-native";

import {
  AccountRow,
  TREND_ROW_INSET,
  TrendRow,
} from "@/components/account-row";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import type { HeaderItem, MenuItem } from "@/components/header-actions";
import { Row, Section } from "@/components/list";
import { Screen } from "@/components/screen";
import { SortButton } from "@/components/sort-button";
import { useTabButtons } from "@/components/tab-buttons";
import { TrendHeader } from "@/components/trend-header";
import { useMoney } from "@/hooks/use-money";
import { useToday } from "@/hooks/use-today";
import {
  monthlyInterest,
  PAYOFF_ORDERS,
  payFirst,
  sortDebts,
} from "@/lib/debts";
import { haptics } from "@/lib/haptics";
import { liveCurrencySupported } from "@/lib/metals";
import { netWorthTitle } from "@/lib/name";
import { formatPercent } from "@/lib/money";
import {
  buildSeries,
  updatesByAccount,
  seriesChange,
  sliceSeries,
  summarizeAccounts,
  totalsOf,
  type AccountSummary,
} from "@/lib/networth";
import {
  groupSortable,
  NW_SORTS,
  DEFAULT_NW_SORT,
  sortAccounts,
  sortBy,
} from "@/lib/sort";
import type { CategoryKind } from "@/lib/types";
import { useStore } from "@/store";
import { refreshSpotPrices } from "@/store/spot";

const KINDS: { kind: CategoryKind; title: string }[] = [
  { kind: "asset", title: "Assets" },
  { kind: "liability", title: "Liabilities" },
];

export default function NetWorthScreen() {
  const money = useMoney();
  const tabButtons = useTabButtons();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const range = useStore((s) => s.settings.nwRange);
  const view = useStore((s) => s.settings.nwView);
  const currency = useStore((s) => s.settings.currency);
  const payoffOrder = useStore((s) => s.settings.payoffOrder);
  const sort = useStore((s) => s.settings.nwSort) ?? DEFAULT_NW_SORT;
  const title = netWorthTitle(useStore((s) => s.settings.name));
  const updateSettings = useStore((s) => s.updateSettings);

  const summaries = summarizeAccounts(accounts, snapshots, categories);
  const totals = totalsOf(summaries.values());
  const series = buildSeries(snapshots, accounts, categories, { signed: true });
  const perAccount = updatesByAccount(snapshots);
  const open = sortAccounts(
    accounts.filter((a) => !a.closed).map((a) => summaries.get(a.id)!),
    sort,
  );
  const closedCount = accounts.length - open.length;
  // A payoff order puts debts in the order to pay them; with it off they follow Sort By.
  const liabilities = open.filter((s) => s.kind === "liability");
  const debts =
    payoffOrder === "off" ? liabilities : sortDebts(liabilities, payoffOrder);
  const target = payFirst(debts, payoffOrder);
  const interest = debts.reduce(
    (sum, s) => sum + monthlyInterest(s.balance, s.account.apr),
    0,
  );
  // Pull down for fresh metal prices.
  const hasLive =
    liveCurrencySupported(currency) && open.some((s) => !!s.account.metal);

  const openAccount = (id: string) =>
    router.push({ pathname: "/account/[id]", params: { id } });
  const openCategory = (id: string) =>
    router.push({ pathname: "/category/[id]", params: { id } });

  // View options live in a menu at the top, so the page itself is just the accounts.
  const menu: MenuItem[] = [
    {
      label: "Sort By",
      icon: "arrow.up.arrow.down",
      items: NW_SORTS.map((o) => ({
        label: o.title,
        subtitle: o.detail,
        isOn: o.key === sort,
        onPress: () => {
          haptics.selection();
          updateSettings({ nwSort: o.key });
        },
      })),
    },
    {
      label: "Group by Category",
      icon: "rectangle.stack",
      isOn: view === "categories",
      onPress: () =>
        updateSettings({
          nwView: view === "categories" ? "accounts" : "categories",
        }),
    },
  ];
  if (debts.some((s) => s.balance > 0)) {
    menu.push({
      label: "Payoff Order",
      icon: "list.number",
      items: PAYOFF_ORDERS.map((o) => ({
        label: o.title,
        subtitle: o.detail,
        isOn: o.key === payoffOrder,
        onPress: () => {
          haptics.selection();
          updateSettings({ payoffOrder: o.key });
        },
      })),
    });
  }
  menu.push({
    inline: true,
    items: [
      {
        label: "Share Net Worth",
        icon: "square.and.arrow.up",
        onPress: () => router.push("/share"),
      },
      {
        label: "Categories",
        icon: "folder",
        onPress: () => router.push("/categories"),
      },
      ...(closedCount > 0
        ? [
            {
              label: "Closed Accounts",
              icon: "archivebox" as const,
              onPress: () => router.push("/closed"),
            },
          ]
        : []),
    ],
  });

  const addButton: HeaderItem = {
    label: "Add Account",
    icon: "plus",
    onPress: () => router.push("/account-form"),
  };
  const right: HeaderItem[] = [
    {
      label: "Update Balances",
      icon: "square.and.pencil",
      onPress: () => router.push("/update-all"),
    },
    addButton,
    { label: "More", icon: "ellipsis", menu },
  ];

  if (accounts.length === 0) {
    return (
      <Screen title={title} large left={tabButtons} right={[addButton]}>
        <EmptyState
          icon="chart.line.uptrend.xyaxis"
          title="Track your net worth"
          message="Add your accounts, investments, property and debts. Update a balance whenever it changes and watch the total move."
        >
          <Button
            title="Add an Account"
            icon="plus"
            onPress={() => router.push("/account-form")}
          />
        </EmptyState>
      </Screen>
    );
  }

  /** Under the debts: where extra money should go, and what interest costs each month. */
  const debtNotes: string[] = [];
  if (target)
    debtNotes.push(
      `Put anything beyond the minimum payments toward ${target.account.name} first.`,
    );
  else if (
    payoffOrder === "avalanche" &&
    !debts.some((s) => s.account.apr != null)
  ) {
    debtNotes.push(
      "Add each debt’s interest rate (tap it, then Edit Account) to sort by it.",
    );
  }
  if (interest > 0)
    debtNotes.push(
      `About ${money(interest, { whole: true })} a month goes to interest.`,
    );

  // One sort covers both sections, so the button sits on whichever header comes first.
  const firstKind = KINDS.find(({ kind }) =>
    open.some((s) => s.kind === kind),
  )?.kind;
  const sortButton = (kind: CategoryKind) =>
    kind === firstKind ? (
      <SortButton
        value={sort}
        onChange={(nwSort) => updateSettings({ nwSort })}
      />
    ) : undefined;

  const accountSections = KINDS.map(({ kind, title }) => {
    const items =
      kind === "liability" ? debts : open.filter((s) => s.kind === kind);
    if (items.length === 0) return null;
    return (
      <Section
        key={kind}
        header={title}
        headerAccessory={sortButton(kind)}
        footer={
          kind === "liability" && debtNotes.length
            ? debtNotes.join(" ")
            : undefined
        }
        inset={TREND_ROW_INSET}
        style={styles.listSection}
      >
        {items.map((s) => (
          <AccountRow
            key={s.account.id}
            summary={s}
            series={perAccount.get(s.account.id)}
            tag={s === target ? "Pay first" : undefined}
            onPress={() => openAccount(s.account.id)}
          />
        ))}
      </Section>
    );
  });

  const categorySections = KINDS.map(({ kind, title }) => {
    const kindTotal = kind === "asset" ? totals.assets : totals.liabilities;
    const groups = categories
      .filter((cat) => cat.kind === kind)
      .sort((a, b) => a.order - b.order)
      .map((category) => {
        const items: AccountSummary[] = open.filter(
          (s) => s.account.categoryId === category.id,
        );
        return {
          category,
          items,
          total: items.reduce((sum, s) => sum + s.balance, 0),
        };
      })
      .filter((g) => g.items.length > 0);
    const sortedGroups = sortBy(groups, sort, (g) =>
      groupSortable(g.category.name, g.items),
    );
    if (groups.length === 0) return null;
    return (
      <Section
        key={kind}
        header={title}
        headerAccessory={sortButton(kind)}
        inset={TREND_ROW_INSET}
        style={styles.listSection}
      >
        {sortedGroups.map(({ category, items, total }) => {
          const catSeries = buildSeries(snapshots, accounts, categories, {
            include: (a) => a.categoryId === category.id,
          });
          const share = kindTotal
            ? ` · ${formatPercent(total / kindTotal)}`
            : "";
          const catChange = seriesChange(sliceSeries(catSeries, range, today));
          return (
            <TrendRow
              key={category.id}
              title={category.name}
              subtitle={`${items.length} ${items.length === 1 ? "account" : "accounts"}${share}`}
              value={money(total)}
              change={catChange.delta}
              changeRatio={catChange.ratio}
              invert={kind === "liability"}
              series={catSeries}
              onPress={() => openCategory(category.id)}
            />
          );
        })}
      </Section>
    );
  });

  return (
    <Screen
      title={title}
      large
      left={tabButtons}
      right={right}
      onRefresh={hasLive ? () => refreshSpotPrices({ force: true }) : undefined}
    >
      <TrendHeader current={totals.net} series={series} />

      {view === "categories" ? categorySections : accountSections}

      {closedCount > 0 ? (
        <Section style={styles.listSection}>
          <Row
            title="Closed Accounts"
            value={String(closedCount)}
            onPress={() => router.push("/closed")}
          />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listSection: {
    marginTop: 18,
  },
});
