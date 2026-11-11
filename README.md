# Plainworth

A private net worth and monthly spending tracker for iPhone (Android later). You type in your own numbers. Everything stays on the phone: no sign-up, no servers, no bank linking. (Sync between your own devices through your private iCloud is optional and off by default.) The only thing Plainworth ever looks up online is the market price of gold, silver, platinum and palladium, and only if you track a metal.

**Net Worth.** One big net worth chart at the top, then a compact list of your accounts, each with a mini chart and its latest change. Switch the list to Categories (Investments, Cash, Precious Metals, Auto Loans and so on) to see totals and each category's own chart. Update Balances is a fast screen for the moment after a paycheck or a market move. Gold, silver, platinum and palladium follow the live market price: enter how many troy ounces you have and the value keeps itself current. Anything else counted in units (shares, crypto) can be tracked as quantity × price. Drag across the chart to read past values; the months are labeled underneath.

**Debts.** Give a debt its interest rate (it shows as 0% until you do) and pick a payoff order from the ⋯ menu at the top of Net Worth: Avalanche pays the highest rate first, Snowball the smallest balance first. Plainworth lists your debts in that order, marks the one extra money should go to, and estimates what each costs in interest a month. The same menu groups the list by category and opens Categories and Closed Accounts, so the page itself stays just your accounts.

**Spending.** Your yearly spreadsheet as an app. At the end of each month, enter totals for Recurring, Spending, Invested and Income. Money you invest counts as kept, not spent, and is shown apart from plain savings ("Saved $937 · Invested $200"). The year view charts each month like Health and Battery do, one color in two shades: what you spent, and the lighter rest of what you earned that you kept. Under it, the months line up as a table of Spent, Saved and Invested, then where the money went: the five biggest categories and everything else together. A month whose income isn't entered yet doesn't count against what you saved. Each year starts its own section automatically. Swipe a category to the left on a month to edit or remove it, or use the Categories row at the bottom of a month to rename, reorder or bring one back.

**Insights.** A year at a time, as short findings: each card is one plain sentence with a small chart, like the highlights in Apple Health. Net Worth and Spending sit behind a toggle at the top, so each is a short page. Net worth cards (growth by month, the pace against the year before, which categories moved it, debt paid down) come only from your balances. Spending cards (the average month, savings rate, where it went) come only from what you enter in Spending; tap Where It Went for every category, a month on average, against the year before. Neither depends on the other, so a stat never looks bad because one tracker isn’t filled in, and a month still in progress isn’t counted in averages until it’s over. Wrapped in `InsightsPreview` (`src/components/insights-preview.tsx`), the same pages show just the last two whole months, as a preview.

**Plainworth Pro.** Tracking is free. Pro unlocks Insights (a preview of the last two months until then), exact values when dragging a chart on any range but All, and Excel export. Pro is kept apart from your data in `src/store/pro.ts`, so a backup never carries it to another phone. Lifetime Pro is a one-time App Store purchase handled by RevenueCat (`src/lib/purchases.ts`): RevenueCat checks the receipt and reports the `plainworth_pro` entitlement, and sees nothing else. Restore Purchases is on the Pro sheet and in Settings. Expo Go can't make purchases, so development builds also switch Pro on and off from Settings › Developer. The privacy policy and support pages are in `docs/` (served by GitHub Pages).

**Settings, backups and export.** Settings opens from the gear at the top of each tab; the eye beside it hides every amount, on any tab. Back Up Now saves a `.plainworth` file with everything in the app (to iCloud Drive, Google Drive or anywhere the share sheet offers), and Restore from Backup brings it back, on this phone or a new one. Settings shows how long ago the last backup was; there are no reminders. The backup holds a format version, so a backup made by an older version of Plainworth still restores. Export to Excel makes one spreadsheet with your net worth by month, every balance you've entered, and a sheet for each year of spending laid out like a budget, then hands it to the share sheet so you can save it to Files, send it to a financial advisor, or open it in Excel, Numbers or Google Sheets. It's for reading, not restoring: use a backup for that. Both files are made on the phone; nothing is uploaded.

## Run it on your iPhone (no Mac needed)

You need a Linux, Windows or Mac computer on the same Wi-Fi as your phone, and a free [Expo account](https://expo.dev/signup). Expo Go only opens projects when the same Expo account is signed in on the phone and on the computer. The account is only for this test connection: your numbers never leave the phone.

1. On the computer, install [Node.js](https://nodejs.org) 22.13 or newer (check with `node -v`) and [Git](https://git-scm.com/downloads).
2. On the iPhone, install **Expo Go** from the App Store, tap the profile icon at the top right and sign in to your Expo account.
3. In a terminal, download and start the app:

   ```bash
   git clone https://github.com/gamequarryllc/plainworth
   cd plainworth
   npm install
   npx expo login           # the same Expo account as on the phone
   npx expo start
   ```

4. With the phone on the same Wi-Fi, Plainworth should appear in Expo Go under Development servers. Tap it.

If it doesn't show up, scan the QR code in the terminal with the iPhone Camera. If the QR code looks garbled, open Safari on the iPhone and type the `exp://` address printed under it (for example `exp://192.168.x.x:8081`), then tap Open.

If the phone still can't reach the computer (guest Wi-Fi, VPN or a firewall), stop the server with `Ctrl+C` and run `npx expo start --tunnel` instead.

To get the latest version later, run `git pull`, then `npm install`, then `npx expo start` again. While the server is running, changes load on the phone by themselves.

### Good to know while testing

- **Try it with sample data first.** Tap the gear at the top left, then Developer → Load Sample Data. It fills in example accounts and two years of spending, so every chart has something to show. Use Erase All Data in the same place before entering your real numbers.
- **Your data lives inside Expo Go.** It survives closing the app, but it will not move over to the App Store version later, because that is a separate app.
- To lock Plainworth with Face ID on iOS 18 or later, touch and hold its icon on the Home Screen and choose Require Face ID. Plainworth only has its own lock switch on Android and older iPhones. (In Expo Go this locks Expo Go itself.)
- Live metal prices need an internet connection. Offline, metal accounts keep their last price, and you can type a price yourself.
- The round blue gear button floating over the app is Expo Go's developer menu. It isn't part of Plainworth.
- If Expo Go says the project needs a different SDK version, update Expo Go from the App Store. This project uses Expo SDK 58.

## Releasing to the App Store

iPhone builds run on GitHub's Mac runners (`.github/workflows/ios.yml`), so no Mac is needed.

- **Check build:** runs by itself on pull requests and pushes to `main` that change native settings (`app.json`, `app.config.js`, `package-lock.json`). It proves the app still compiles for iPhone and uploads nothing.
- **TestFlight upload:** Actions → iOS build → Run workflow → mode `testflight`. It signs with the studio's App Store Connect API key (organization secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`), picks the next free build number by itself, and uploads. Leave the version blank to use the one in `app.json`.
- Sending a build to App Review stays a manual step in App Store Connect.

Android isn't set up yet.

## Development

| Command | What it does |
| --- | --- |
| `npm start` | Start the dev server (add `-- --tunnel` if needed) |
| `npm run lint` | Lint |
| `npm run typecheck` | Type-check with TypeScript |
| `npm test` | Unit tests for the money, date, net worth, spending, debt, chart axis, insights, Excel export, backup and metal price logic |

**Stack.** Expo SDK 58, React Native, TypeScript, Expo Router for navigation, and zustand for state. Charts are drawn with `react-native-svg`. The Excel file is written by a small built-in writer (`src/lib/xlsx.ts`), saved with `expo-file-system` and shared with `expo-sharing`; backups are restored through `expo-document-picker`. The app only uses native modules that ship inside Expo Go, so it runs there without a custom build.

**Privacy.** Plainworth has no backend and no analytics. The one network request is the metal price, from [gold-api.com](https://gold-api.com) (free, no key): `GET https://api.gold-api.com/price/XAG` for silver in US dollars, or `/price/XAG/EUR` for another currency. It carries only the metal and the currency. Prices are looked up when the app opens or comes back to the foreground (at most every 15 minutes), or when you pull down on Net Worth, and only if an account follows a metal (`src/lib/metals.ts`, `src/store/spot.ts`). Each day you open Plainworth, a metal account gets one automatic entry at that day's price, updated in place if the price moves later that day. An entry you type yourself is never overwritten.

**Sync with iCloud (optional, Pro).** Off unless turned on in Settings › Sync with iCloud; while it's off, no iCloud code runs. Turned on, each device keeps one file with its whole copy of the data in a folder of the app's private iCloud container (under the person's Apple ID; there is still no Plainworth server), and only ever writes its own file. To sync, a device reads the other devices' files, merges them into its copy, and writes its file again if anything is new (`src/lib/sync/engine.ts`). Merging (`src/lib/sync/merge.ts`) goes item by item: every account, balance, category, monthly amount, note and setting has the time it last changed, the later change wins, and deletes leave a marker so they aren't undone by a device that still has the item. Replacing everything (restoring a backup, Erase All Data, or choosing one device's data when turning sync on) starts a new "epoch" that other devices take whole, keeping a copy of what they had. The lock, Hide Amounts, reminders and list and chart settings stay with each device. Changes are saved on the phone first, then sent a couple of seconds later; other devices look for changes when opened and every 15 seconds while open. The iCloud files go through `react-native-cloud-storage` (`src/lib/sync/cloud.ts`), so sync needs a real build, not Expo Go. `npm test` runs two and three pretend devices against a pretend folder.

**Profiles (Pro).** Separate sets of accounts, spending and Insights in one app: one for yourself, one for a child, one for a business. Each profile is its own JSON document (the first keeps the storage key the app has always used; the others are saved beside it), and the app only ever has the open one loaded, so every screen works on one profile without knowing there are others (`src/store/profiles.ts`). The lock, Hide Amounts, the reminder and the last backup belong to the phone and follow it from profile to profile. A profile's name is the Name in Settings. Adding a profile needs Pro; opening or deleting ones that already exist never does, so data can't end up locked away. A backup holds every profile, and restoring it replaces them all; a backup made before profiles is one set of data and restores into the open profile. The Excel export is the open profile's. With sync on, each profile syncs as its own set of files ("<profile>.<device>.json"), and each device also keeps a small list of its profiles and the ones deleted, so adding or deleting a profile on one device does the same on the others (`src/lib/sync/profiles.ts`). A device that learns of a profile from that list waits for its data instead of starting an empty copy, and an empty device can never replace another device's data.

**Data.** Everything is one JSON document stored in SQLite on the device (`src/lib/storage.ts`), saved shortly after each change and again when the app goes to the background. Money is stored as whole cents, dates as `YYYY-MM-DD`, months as `YYYY-MM`. Net worth on any day is the latest balance of every account on or before that day, with debts subtracted. Closing an account records a zero balance, so its history stays in the charts. The document carries a version number, and a copy saved by an older version is upgraded when it loads (`src/store/migrate.ts`): version 2 added the Invested group. A backup is that same document in a small labeled wrapper (`src/store/backup.ts`); restoring checks every part before anything is replaced, then runs the same upgrade.

**Layout.**

```
src/app/          Screens. Each file is a route (Expo Router).
  (tabs)/         Net Worth, Spending and Insights tabs
  settings/       Settings, opened as a sheet from the gear button
  *.tsx           Sheets: update balance, update all, new account, month entry, categories
src/components/   Shared UI: lists, charts, number inputs, header buttons
src/lib/          Pure logic: money, dates, net worth series, spending totals, insights, Excel export, metal prices, storage
src/store/        App state, backups, live price refresh, default categories, sample data
src/theme/        iOS system colors, type scale, spacing
```

Files ending in `.web.tsx` or `.web.ts` are browser stand-ins used for quick previews and screenshots. The phone app doesn't use them.
