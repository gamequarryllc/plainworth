# Launch guide: Plainworth on the App Store

Everything works from Linux. Builds happen on Expo's Macs (EAS) and land in TestFlight.

The order matters because some steps wait on Apple. Start with A and B today.

## A. Apple: agreements (waiting on Apple)

1. Go to [App Store Connect](https://appstoreconnect.apple.com) › **Business** and check that the **Paid Apps** agreement says **Active**. Until it does, the $14.99 purchase won't load, not even in TestFlight.
2. While you're there, apply for the [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/). Apple then takes 15% instead of 30%.

## B. Apple: the app and the purchase

1. App Store Connect › **Apps** › **+** › **New App**.
   - Platform: iOS. Name: **Plainworth: Net Worth Tracker**. Language: English (U.S.).
   - Bundle ID: if `com.gamequarry.plainworth` isn't in the list, register it at [Identifiers](https://developer.apple.com/account/resources/identifiers/list) (App IDs › App, Explicit). Don't turn on any extra capabilities. In-App Purchase is on by default.
   - SKU: **plainworth**. User access: Full Access.
2. Open the app. On **App Information**, copy the **Apple ID** (a number like 6740000000). It's already in `eas.json` (6829494839).
3. **Pricing and Availability**: Price **Free**. Under Availability, untick the 27 EU countries.
4. **Monetization › In-App Purchases** › **+**. Type **Non-Consumable**, Reference Name **Plainworth Pro Lifetime**, Product ID **plainworth_pro_lifetime**. The product ID can never be changed or reused, so copy it exactly.
   - Price: **$14.99**. Availability: the same countries as the app.
   - Localization: Display Name **Plainworth Pro**, Description **Unlock Insights, exact chart values and Excel export**.
   - Review screenshot and notes: add these after step E. Until then, the purchase shows "Missing Metadata", which is fine for TestFlight.
5. **App Privacy**: answer as in `launch/app-store-listing.md` (Purchases › Purchase History, App Functionality, not linked, no tracking).

## C. RevenueCat (checks purchases, free until $2,500 a month)

1. Sign up at [revenuecat.com](https://app.revenuecat.com/signup) and create a project called **Plainworth**.
2. **Apps** › **+ New** › **App Store**. Bundle ID **com.gamequarry.plainworth**.
3. RevenueCat asks for an **In-App Purchase Key**. Make one in App Store Connect › **Users and Access** › **Integrations** › **In-App Purchase** › **+**. Download the `.p8` file (you only get one chance) and upload it to RevenueCat together with the Key ID and Issuer ID shown there. Keep the `.p8` file somewhere safe and never commit it.
4. **Product catalog** › **Products** › **+ New**: identifier **plainworth_pro_lifetime**, App Store.
5. **Entitlements** › **+ New**: identifier **plainworth_pro** (exactly that, the app looks for it). Attach the product.
6. **Offerings**: open **default** (or create it and make it Current), then add a package of type **Lifetime** with the product.
7. **API keys**: copy the **Apple** public key (it starts with `appl_`) and paste it into `app.json` under `extra`, as `"revenueCatAppleKey": "appl_..."`. This key is meant to ship inside apps, so it's safe to commit.

## D. Expo: first cloud build

From the project folder on your computer:

```bash
git pull && npm install
npx eas-cli@latest login            # your Expo account
npx eas-cli@latest init             # links the project, adds its ID to app.json
npx eas-cli@latest build -p ios --profile production
```

- When asked, sign in with your Apple ID and let EAS create the certificate and provisioning profile. Say yes to everything. EAS stores them, so you only do this once.
- The build takes about 15–30 minutes. Expo's free plan includes a limited number of iOS builds each month, which is plenty for this.
- Commit the changes `eas init` made to `app.json`.

## E. TestFlight and a test purchase

```bash
npx eas-cli@latest submit -p ios --latest
```

1. This uploads the build to App Store Connect. About 10 minutes later it appears under **TestFlight**. If it shows "Missing Compliance", that's already answered in `app.json`, so it should go straight to Ready.
2. TestFlight › **Internal Testing** › **+** › add yourself. Install **TestFlight** on your iPhone and accept the invite.
3. Open Plainworth from TestFlight, go to Insights, and tap **Unlock Pro**. The sheet should show $14.99 from the App Store. Buy it: TestFlight purchases are free and say "[Environment: Sandbox]".
4. Check that Insights unlocks, then delete the app, reinstall it from TestFlight, and tap **Restore Purchases**. Pro should come back.
5. Take a screenshot of the Pro sheet and add it as the purchase's review screenshot (step B4).

If the sheet still shows the price but buying says "Couldn't reach the App Store": the Paid Apps agreement isn't active yet, or the RevenueCat product, entitlement or offering doesn't match. RevenueCat's dashboard shows sandbox purchases when it's working.

For later code changes: bump nothing, just run the build and submit commands again. EAS raises the build number by itself.

## F. Listing and submit

1. Fill in the version page from `launch/app-store-listing.md`: screenshots, promotional text, description, keywords, support and privacy URLs, App Review notes.
2. The privacy and support pages live in `docs/` and are served by GitHub Pages (Settings › Pages › branch `main`, folder `/docs`): `https://gamequarryllc.github.io/plainworth/` and `https://gamequarryllc.github.io/plainworth/privacy.html`.
3. The **View the Source Code** link in Settings opens this public repository (`extra.sourceCodeUrl` in `app.json`).
4. On the version page, under **In-App Purchases and Subscriptions**, select **Plainworth Pro**. A first in-app purchase has to be reviewed together with an app version.
5. Choose the TestFlight build, then **Add for Review** › **Submit**. Review usually takes 1–3 days. Choose "Manually release" if you want to pick the launch day.

## Later: subscriptions (in about 6 months)

Add monthly and yearly subscriptions in App Store Connect and attach them to the same **plainworth_pro** entitlement in RevenueCat. Lifetime buyers keep Pro automatically. Then remove the lifetime product from sale. Never delete it, or it can't be restored.

## Testing in a development build (optional)

`npx eas-cli@latest build -p ios --profile development` makes a build that loads code live from `npx expo start`, like Expo Go but with purchases. It needs your iPhone registered first (`npx eas-cli@latest device:create`) and Developer Mode turned on (Settings › Privacy & Security). The Developer section in Settings, with the Pro switch and sample data, only appears in development builds and Expo Go, never in TestFlight or the App Store.
