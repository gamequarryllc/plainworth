# App Store listing: Plainworth

Everything to paste into App Store Connect. Character limits are Apple's.

## App information

| Field | Value |
| --- | --- |
| Name (30) | Plainworth: Net Worth Tracker |
| Subtitle (30) | Monthly Spending, Private |
| Bundle ID | com.gamequarry.plainworth |
| SKU | plainworth |
| Primary category | Finance |
| Secondary category | Productivity |
| Age rating | 4+ (answer "None" / "No" to every question) |
| Price | Free (Pro is an in-app purchase) |
| Availability | All countries except the 27 EU countries |
| Privacy policy URL | https://gamequarryllc.github.io/plainworth/privacy.html |
| Support URL | https://gamequarryllc.github.io/plainworth/ |
| Copyright | 2026 Alexander Curry |

## Keywords (100)

```
budget,expense,savings,wealth,assets,debt,gold,silver,money,finance,spreadsheet,offline,fire,balance
```

Exactly 100 characters. Words in the name and subtitle (net, worth, tracker, monthly, spending, private) already count, so they're not repeated.

## Promotional text (170)

Your net worth and monthly spending in one private app. No sign-up, no bank linking, nothing uploaded. Just your numbers, on your iPhone.

## Description

Plainworth is a simple, private way to track what you own, what you owe and where your money goes each month.

Type in your balances and monthly totals yourself. Nothing is linked to your bank, there's no account to create, and your numbers never leave your iPhone.

NET WORTH
• One clear net worth chart, with every account underneath and its latest change
• Group accounts into categories like Retirement, Investments, Cash and Auto Loans
• Update Balances: refresh everything in seconds after a paycheck or a market move
• Gold, silver, platinum and palladium follow the live market price. Enter your ounces and the value keeps itself current
• Track shares or crypto as quantity × price
• Debts with interest rates, and an Avalanche or Snowball payoff order that shows which debt to pay first

MONTHLY SPENDING
• Your yearly budget spreadsheet as an app: Recurring, Spending, Invested and Income each month
• Money you invest counts as kept, and is shown apart from plain savings
• A year chart of what you spent and what you kept, plus where the money went

PRIVATE BY DESIGN
• No sign-up, no servers, no bank connections, no ads, no tracking
• Back up everything to a file you keep, in iCloud Drive or anywhere you like, and restore it on a new phone
• Hide every amount with one tap
• Lock it with Face ID from the Home Screen

PLAINWORTH PRO
Tracking is always free. Plainworth Pro is a one-time purchase that adds:
• Insights: your year in short findings, like how your net worth grew, what moved it, your savings rate and top spending
• Exact values when dragging any chart
• Export to Excel, for your records or your financial advisor
Pay once and keep Pro for good, including everything added to it later. Restore it on any iPhone signed in to your Apple ID.

## What's new (version 1.0)

The first version of Plainworth.

## App Privacy (the "nutrition label")

Plainworth itself collects nothing. RevenueCat, which checks the Pro purchase, sees the purchase and a random ID it makes up. Apple asks you to declare that, so answer:

- Do you or your third-party partners collect data from this app? **Yes**
- Data type: **Purchases → Purchase History**
  - Used for: **App Functionality**
  - Linked to the user's identity? **No**
  - Used for tracking? **No**

Nothing else. The label will read "Data Not Linked to You: Purchases". Metal prices from gold-api.com send nothing about the user (just "what's the price of silver").

## In-app purchase

| Field | Value |
| --- | --- |
| Type | Non-Consumable |
| Reference name | Plainworth Pro Lifetime |
| Product ID | plainworth_pro_lifetime (permanent, can't be reused) |
| Price | $14.99 (USD) |
| Availability | Same as the app (no EU) |
| Display name (30) | Plainworth Pro |
| Description (55) | Unlock Insights, exact chart values and Excel export |
| Review screenshot | A screenshot of the Plainworth Pro sheet from the TestFlight build |
| Review notes | Lifetime Pro. Unlocks the Insights tab, exact values when dragging charts, and Settings › Export to Excel. |

## App Review notes

Paste into App Review Information → Notes. Sign-in required: **No**.

```
Plainworth is a personal net worth and monthly spending tracker. There is no account or sign-in: all data is typed in by the user and stored only on the device.

To try it: on Net Worth, tap + to add an account (for example "Checking", $2,500), then on Spending enter a month's totals.

In-app purchase: "Plainworth Pro" (plainworth_pro_lifetime) is a non-consumable, one-time purchase. To see it, open the Insights tab and tap Unlock Pro, or tap the gear (top left) › Plainworth Pro. Restore Purchases is on the same sheet and in Settings. Pro unlocks the full Insights tab, exact values when dragging a chart on ranges other than All, and Settings › Export to Excel. Purchases are verified through RevenueCat.

Network use: the app fetches live gold, silver, platinum and palladium prices from gold-api.com, only when the user tracks a precious metal. It sends no user data.

The app does not use encryption beyond what iOS provides (ITSAppUsesNonExemptEncryption = NO).
```

## Screenshots

Required: the 6.9" iPhone size (1320 × 2868 or 1290 × 2796). A Pro Max or Plus iPhone takes these directly. Other iPhones don't, so send me the screenshots and I'll resize them. Suggested five, with sample data loaded (Settings › Developer › Load Sample Data, in Expo Go):

1. Net Worth with the chart and accounts
2. Update Balances
3. Spending year view
4. Insights
5. Settings showing "Private by Design"
