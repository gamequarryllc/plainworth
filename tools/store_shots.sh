#!/bin/bash
# Takes the App Store screenshots from the real iPhone app in the iOS Simulator
# (the "Store screenshots" workflow runs it on a GitHub Mac runner).
#
#   tools/store_shots.sh [out folder]      (default: a new temp folder)
#
# 1. Builds the app for the Simulator (Release, so the JavaScript is bundled in)
#    with EXPO_PUBLIC_STORE_SHOTS=1: it opens filled with the 3-year sample as if
#    it were real data, with Pro on and no sample banners (src/lib/store-shots.ts).
# 2. Boots a 6.9-inch iPhone (1320 x 2868) in dark mode with a clean status bar.
# 3. Opens each screen with a plainworth:/// link and photographs it into <out>/raw.
# 4. tools/store_shots_frame.cjs then sets each one under its caption in <out>.
#
# Nothing is signed and nothing is uploaded here.
set -euo pipefail

app="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$(mktemp -d)}"
WORK="${WORK:-$(mktemp -d)}"
mkdir -p "$OUT/raw" "$WORK/logs"
logs="$WORK/logs"
bundle="$(node -e 'console.log(require(process.argv[1]).expo.ios.bundleIdentifier)' "$app/app.json")"

say() { printf '\n== %s\n' "$*"; }
quiet() {
  local log="$1"; shift
  if "$@" > "$log" 2>&1; then return 0; fi
  echo "$1 failed:" >&2
  grep -nE 'error:|\*\* .*FAILED \*\*' "$log" | head -40 >&2 || true
  tail -40 "$log" >&2
  return 1
}

say "Install the app's packages"
(cd "$app" && quiet "$logs/npm.log" npm ci --no-audit --no-fund)

say "Write the Xcode project (expo prebuild)"
rm -rf "$app/ios"
(cd "$app" && CI=1 quiet "$logs/prebuild.log" npx expo prebuild --platform ios --no-install)
(cd "$app/ios" && quiet "$logs/pods.log" pod install)
workspace="$(ls -d "$app"/ios/*.xcworkspace | head -1)"
name="$(basename "$workspace" .xcworkspace)"

say "Build for the Simulator (screenshot mode)"
export EXPO_PUBLIC_STORE_SHOTS=1
# Also in .env.local (ignored by git), in case Xcode's bundling step doesn't pass the variable on.
echo "EXPO_PUBLIC_STORE_SHOTS=1" > "$app/.env.local"
quiet "$logs/build.log" xcodebuild -workspace "$workspace" -scheme "$name" -configuration Release \
  -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath "$WORK/dd" \
  build CODE_SIGNING_ALLOWED=NO
built="$WORK/dd/Build/Products/Release-iphonesimulator/$name.app"
[ -s "$built/main.jsbundle" ] || { echo "No JavaScript bundle in the app" >&2; exit 1; }

say "Boot a 6.9-inch iPhone"
# The newest "Pro Max" the runner has: 1320 x 2868 pixels, the size App Store Connect asks for.
runtime="$(xcrun simctl list runtimes available -j | python3 -c '
import json,sys
rs=[r for r in json.load(sys.stdin)["runtimes"] if r.get("platform","iOS")=="iOS" and r["isAvailable"]]
rs.sort(key=lambda r:[int(x) for x in r["version"].split(".")])
print(rs[-1]["identifier"])')"
devtype="$(xcrun simctl list devicetypes -j | python3 -c '
import json,re,sys
ts=[t for t in json.load(sys.stdin)["devicetypes"] if re.fullmatch(r"iPhone \d+ Pro Max",t["name"])]
ts.sort(key=lambda t:int(re.findall(r"\d+",t["name"])[0]))
print(ts[-1]["identifier"])')"
echo "runtime $runtime, device $devtype"
udid="$(xcrun simctl create "Plainworth shots" "$devtype" "$runtime")"
trap 'xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true; xcrun simctl delete "$udid" >/dev/null 2>&1 || true' EXIT
# Approve plainworth:/// links ahead of time, or iOS asks "Open in Plainworth?" over every screen.
python3 - "$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Library/Preferences" "$bundle" <<'PY'
import os, plistlib, sys
folder, bundle = sys.argv[1], sys.argv[2]
os.makedirs(folder, exist_ok=True)
with open(os.path.join(folder, "com.apple.launchservices.schemeapproval.plist"), "wb") as f:
    plistlib.dump({"com.apple.CoreSimulator.CoreSimulatorBridge-->plainworth": bundle}, f)
PY
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b > /dev/null
xcrun simctl ui "$udid" appearance dark
xcrun simctl status_bar "$udid" override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --operatorName "" --batteryState charged --batteryLevel 100

say "Install and open Plainworth"
xcrun simctl install "$udid" "$built"
xcrun simctl launch "$udid" "$bundle" > /dev/null
sleep 12

# file, link. Taken in an order where each link moves forward from the screen before.
shots=(
  "01-net-worth|plainworth:///"
  "02-spending-year|plainworth:///spending"
  "03-where-youre-headed|plainworth:///insights?shot=networth"
  "06-this-year-vs-last-year|plainworth:///insights?shot=spending"
  "04-spending-by-category|plainworth:///insights/where-it-went"
  "05-debt-payoff-order|plainworth:///?shot=debts"
)
for s in "${shots[@]}"; do
  file="${s%%|*}"; link="${s#*|}"
  xcrun simctl openurl "$udid" "$link"
  sleep 5
  xcrun simctl io "$udid" screenshot --type=png "$OUT/raw/$file.png" > /dev/null 2>&1
  size="$(sips -g pixelWidth -g pixelHeight "$OUT/raw/$file.png" | awk '/pixel/{printf "%s ", $2}')"
  echo "$file: $size"
done

say "OK: raw screenshots in $OUT/raw"
