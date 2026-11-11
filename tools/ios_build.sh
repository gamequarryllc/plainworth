#!/bin/bash
# Builds Plainworth for iPhone. Needs a Mac with Xcode, Node and CocoaPods
# (the "iOS build" workflow runs it on a GitHub Mac runner).
#
#   tools/ios_build.sh check        unsigned build: proves the app compiles and packages for iPhone
#   tools/ios_build.sh testflight   signs with the App Store Connect API key and uploads to TestFlight
#
# Environment:
#   VERSION        version shown in TestFlight and on the App Store (default: app.json's)
#   BUILD_NUMBER   must go up with every upload. Default for testflight: one more than the
#                  highest build App Store Connect already has (tools/next_build_number.mjs);
#                  for check: 1
#   ASC_APP_ID     the app's App Store Connect id (testflight only, to find the next build number)
#   WORK           scratch folder (default: a new temp folder)
#   testflight only: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the .p8 text, or base64 of it), APPLE_TEAM_ID
#
# The Xcode project is never kept in the repo: `expo prebuild` writes it from
# app.json and app.config.js each time (ios/ is ignored by git).
#
# Nothing here submits the app for review. An upload lands in TestFlight; sending
# a build to App Review stays a manual step in App Store Connect.
set -euo pipefail

mode="${1:-check}"
app="$(cd "$(dirname "$0")/.." && pwd)"
case "$mode" in check|testflight) ;; *) echo "Mode must be check or testflight" >&2; exit 2;; esac
[ -f "$app/app.json" ] && [ -f "$app/package.json" ] || { echo "No Expo app at $app" >&2; exit 2; }

VERSION="${VERSION:-$(node -e 'console.log(require(process.argv[1]).expo.version)' "$app/app.json")}"
echo "$VERSION" | grep -Eq '^[0-9]+(\.[0-9]+){0,2}$' || { echo "VERSION must look like 1.0.0" >&2; exit 2; }
WORK="${WORK:-$(mktemp -d)}"
mkdir -p "$WORK"
logs="$WORK/logs"; mkdir -p "$logs"

say() { printf '\n== %s\n' "$*"; }

# Runs a command quietly into a log; on failure prints the errors and the tail.
quiet() {
  local log="$1"; shift
  if "$@" > "$log" 2>&1; then return 0; fi
  echo "$1 failed. Errors:" >&2
  grep -nE 'error:|errors? generated|\*\* .*FAILED \*\*|Provisioning|No profiles|No signing|requires a|\[!\]' "$log" | head -60 >&2 || true
  echo "--- last lines of $(basename "$log") ---" >&2
  tail -40 "$log" >&2
  return 1
}
xcb() {
  local log="$1"; shift
  quiet "$log" xcodebuild "$@" || return 1
  grep -E '^\*\* .* \*\*$' "$log" | tail -1 || true
}

if [ "$mode" = "testflight" ]; then
  missing=""
  for v in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8 APPLE_TEAM_ID; do
    eval "val=\${$v:-}"
    [ -n "$val" ] || missing="$missing $v"
  done
  if [ -n "$missing" ]; then
    echo "Can't sign: these secrets are not set:$missing" >&2
    echo "They live under the organization's Settings > Secrets and variables > Actions." >&2
    exit 3
  fi
  if [ -z "${BUILD_NUMBER:-}" ]; then
    [ -n "${ASC_APP_ID:-}" ] || { echo "Set BUILD_NUMBER or ASC_APP_ID" >&2; exit 2; }
    BUILD_NUMBER="$(node "$app/tools/next_build_number.mjs" "$ASC_APP_ID")"
  fi
fi
BUILD_NUMBER="${BUILD_NUMBER:-1}"
echo "$BUILD_NUMBER" | grep -Eq '^[0-9]+$' || { echo "BUILD_NUMBER must be a whole number" >&2; exit 2; }

bundle="$(node -e 'console.log(require(process.argv[1]).expo.ios.bundleIdentifier || "")' "$app/app.json")"
[ -n "$bundle" ] || { echo "app.json has no ios.bundleIdentifier" >&2; exit 2; }

say "Tools"
xcodebuild -version
echo "node $(node --version), CocoaPods $(pod --version)"

say "Install the app's packages"
(cd "$app" && quiet "$logs/npm.log" npm ci --no-audit --no-fund)

say "Write the Xcode project (expo prebuild)"
rm -rf "$app/ios"
(cd "$app" && APP_VERSION="$VERSION" APP_BUILD_NUMBER="$BUILD_NUMBER" CI=1 quiet "$logs/prebuild.log" npx expo prebuild --platform ios --no-install)

say "Install the native libraries (pod install)"
(cd "$app/ios" && quiet "$logs/pods.log" pod install)

workspace="$(ls -d "$app"/ios/*.xcworkspace | head -1)"
[ -d "$workspace" ] || { echo "pod install made no workspace" >&2; exit 1; }
name="$(basename "$workspace" .xcworkspace)"
echo "name on the phone: $name"
echo "bundle id: $bundle"
echo "version: $VERSION ($BUILD_NUMBER)"

plist_value() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true; }

# Looks inside a built .app: the things App Store Connect or a phone would trip over.
check_app() {
  local built="$1"
  [ -d "$built" ] || { echo "No app at $built" >&2; exit 1; }
  local info="$built/Info.plist"
  [ "$(plist_value "$info" CFBundleIdentifier)" = "$bundle" ] || { echo "The built app has bundle id $(plist_value "$info" CFBundleIdentifier)" >&2; exit 1; }
  local got_version got_build
  got_version="$(plist_value "$info" CFBundleShortVersionString)"; got_build="$(plist_value "$info" CFBundleVersion)"
  if [ "$got_version" != "$VERSION" ] || [ "$got_build" != "$BUILD_NUMBER" ]; then
    echo "The built app is version $got_version ($got_build), wanted $VERSION ($BUILD_NUMBER): app.config.js must read APP_VERSION and APP_BUILD_NUMBER" >&2; exit 1
  fi
  [ -s "$built/main.jsbundle" ] || { echo "The app's JavaScript (main.jsbundle) is missing from the app" >&2; exit 1; }
  [ -f "$built/Assets.car" ] || { echo "No compiled asset catalog (icons) in the app" >&2; exit 1; }
  # Face ID needs its reason in the app's own words, or iOS refuses it.
  [ -n "$(plist_value "$info" NSFaceIDUsageDescription)" ] || { echo "The app uses Face ID but has no Face ID permission text" >&2; exit 1; }
  if [ -n "$(plist_value "$info" NSUserTrackingUsageDescription)" ]; then echo "The app has a tracking prompt; Plainworth tracks nothing" >&2; exit 1; fi
  if [ -n "$(plist_value "$info" NSMicrophoneUsageDescription)" ]; then echo "::warning::The app asks for the microphone, which it never uses"; fi
  if [ ! -f "$built/PrivacyInfo.xcprivacy" ]; then echo "::warning::No privacy manifest (PrivacyInfo.xcprivacy) in the app."; fi
  local archs; archs="$(lipo -archs "$built/$(plist_value "$info" CFBundleExecutable)")"
  echo "architectures: $archs"
  [ "$archs" = "arm64" ] || { echo "Expected an arm64 app" >&2; exit 1; }
  echo "minimum iOS: $(plist_value "$info" MinimumOSVersion)"
  echo "size: $(du -sh "$built" | cut -f1) (unsigned, uncompressed)"
}

common=(-workspace "$workspace" -scheme "$name" -configuration Release -sdk iphoneos -destination "generic/platform=iOS")
unsigned=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)

if [ "$mode" = "check" ]; then
  say "Unsigned build"
  xcb "$logs/build.log" "${common[@]}" -derivedDataPath "$WORK/dd" build "${unsigned[@]}"
  check_app "$WORK/dd/Build/Products/Release-iphoneos/$name.app"
  say "OK: Plainworth builds for iPhone (unsigned check, nothing uploaded)"
  exit 0
fi

# ---- testflight ------------------------------------------------------------------------
keydir="$WORK/key"; mkdir -p "$keydir"; chmod 700 "$keydir"
key="$keydir/AuthKey_${ASC_KEY_ID}.p8"
cleanup() { rm -rf "$keydir"; }
trap cleanup EXIT
umask 077
case "$ASC_KEY_P8" in
  *"BEGIN PRIVATE KEY"*) printf '%s\n' "$ASC_KEY_P8" > "$key" ;;
  *) printf '%s' "$ASC_KEY_P8" | base64 --decode > "$key" 2>/dev/null || { echo "ASC_KEY_P8 is neither the .p8 text nor base64 of it" >&2; exit 3; } ;;
esac
grep -q "BEGIN PRIVATE KEY" "$key" || { echo "ASC_KEY_P8 does not look like an App Store Connect .p8 key" >&2; exit 3; }
auth=(-allowProvisioningUpdates -authenticationKeyPath "$key" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

cat > "$WORK/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

archive="$WORK/$name.xcarchive"
upload() {
  xcb "$1" -exportArchive -archivePath "$archive" -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$WORK/export" "${auth[@]}"
}

# First try: archive without signing, then let Xcode sign for the App Store with
# a cloud-managed certificate while it uploads. This needs no certificate or
# device on the build machine.
say "Archive (unsigned)"
xcb "$logs/archive.log" "${common[@]}" -archivePath "$archive" archive "${unsigned[@]}"
check_app "$archive/Products/Applications/$name.app"
say "Sign and upload to TestFlight"
if upload "$logs/upload.log"; then
  say "OK: Plainworth $VERSION ($BUILD_NUMBER) uploaded. It shows in TestFlight after Apple finishes processing."
  exit 0
fi

# Second try: archive with Xcode's automatic signing, then upload.
say "Retry: archive with automatic signing"
rm -rf "$archive" "$WORK/export"
xcb "$logs/archive_signed.log" "${common[@]}" -archivePath "$archive" archive "${auth[@]}" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic
check_app "$archive/Products/Applications/$name.app"
say "Sign and upload to TestFlight"
upload "$logs/upload_signed.log"
say "OK: Plainworth $VERSION ($BUILD_NUMBER) uploaded. It shows in TestFlight after Apple finishes processing."
