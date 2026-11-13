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

# ---- entitlements --------------------------------------------------------------------
# Entitlements are what the app is allowed to ask iOS for: its iCloud container (for
# Sync with iCloud) and notifications. expo prebuild writes them to a file from
# app.json, but they only count once they are inside the app's signature.
entitlements="$app/ios/$name/$name.entitlements"
wanted="$WORK/entitlements_wanted.json"
if [ -f "$entitlements" ]; then plutil -convert json -o "$wanted" "$entitlements"; else echo '{}' > "$wanted"; fi

# Signs the app "ad hoc" (no certificate, no account) with the entitlements in it.
# An unsigned build carries none, and the App Store signing step keeps only the
# ones already in the app: without this, the uploaded app has no iCloud container
# and Sync with iCloud can't store anything.
embed_entitlements() {
  local built="$1" resolved="$WORK/embed.entitlements"
  [ -f "$entitlements" ] || return 0
  cp "$entitlements" "$resolved"
  if [ -n "${APPLE_TEAM_ID:-}" ]; then
    /usr/libexec/PlistBuddy -c "Add :application-identifier string ${APPLE_TEAM_ID}.${bundle}" "$resolved" > /dev/null
    /usr/libexec/PlistBuddy -c "Add :com.apple.developer.team-identifier string ${APPLE_TEAM_ID}" "$resolved" > /dev/null
  fi
  quiet "$logs/adhoc_nested.log" codesign --force --deep --sign - "$built"
  quiet "$logs/adhoc.log" codesign --force --sign - --entitlements "$resolved" "$built"
}

# Reads the entitlements out of a built app's signature and checks that everything
# the project asks for is there. Prints what is missing and fails if anything is.
check_entitlements() {
  local built="$1" got="$WORK/entitlements_got"
  if codesign -d --xml --entitlements - "$built" > "$got.plist" 2>/dev/null && [ -s "$got.plist" ]; then
    plutil -convert json -o "$got.json" "$got.plist"
  else
    echo '{}' > "$got.json"
  fi
  node "$app/tools/check_entitlements.mjs" "$wanted" "$got.json"
}

common=(-workspace "$workspace" -scheme "$name" -configuration Release -sdk iphoneos -destination "generic/platform=iOS")
unsigned=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)

if [ "$mode" = "check" ]; then
  say "Unsigned build"
  xcb "$logs/build.log" "${common[@]}" -derivedDataPath "$WORK/dd" build "${unsigned[@]}"
  check_app "$WORK/dd/Build/Products/Release-iphoneos/$name.app"
  say "Entitlements (iCloud, notifications)"
  embed_entitlements "$WORK/dd/Build/Products/Release-iphoneos/$name.app"
  check_entitlements "$WORK/dd/Build/Products/Release-iphoneos/$name.app"
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

# $1 = "export" (write the signed app to disk) or "upload" (send it to TestFlight).
export_options() {
  cat > "$WORK/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$1</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST
}

archive="$WORK/$name.xcarchive"

# Signs the archive for the App Store onto disk and checks the signed app still has
# every entitlement, so a build that can't use iCloud never reaches TestFlight.
sign_and_check() {
  local log="$1" ipa
  rm -rf "$WORK/signed" "$WORK/ipa"
  export_options export
  xcb "$log" -exportArchive -archivePath "$archive" -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$WORK/signed" "${auth[@]}" || return 1
  ipa="$(ls "$WORK/signed"/*.ipa 2>/dev/null | head -1)"
  [ -f "$ipa" ] || { echo "Signing made no .ipa" >&2; return 1; }
  mkdir -p "$WORK/ipa"
  unzip -q "$ipa" -d "$WORK/ipa"
  check_entitlements "$WORK/ipa/Payload/$name.app"
}

upload() {
  export_options upload
  xcb "$1" -exportArchive -archivePath "$archive" -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$WORK/export" "${auth[@]}"
}

icloud_help() {
  cat >&2 <<HELP

The App Store signature doesn't include everything the app asks for (see above).
Most likely the app's identifier isn't set up for iCloud yet. On developer.apple.com,
under Certificates, IDs & Profiles > Identifiers:
  1. Switch the list (top right) from App IDs to iCloud Containers, press +, and
     register the container named in app.json (iCloud.$bundle).
  2. Switch back to App IDs, open $bundle, tick iCloud, press Configure (or Edit),
     tick that container, then Continue and Save.
Then run this build again. Nothing was uploaded.
HELP
}

# First try: archive without signing, put the entitlements in with an ad hoc
# signature, then let Xcode sign for the App Store with a cloud-managed
# certificate. This needs no certificate or device on the build machine.
say "Archive (unsigned)"
xcb "$logs/archive.log" "${common[@]}" -archivePath "$archive" archive "${unsigned[@]}"
check_app "$archive/Products/Applications/$name.app"
embed_entitlements "$archive/Products/Applications/$name.app"
say "Sign for the App Store and check the signed app"
if sign_and_check "$logs/sign.log"; then
  say "Upload to TestFlight"
  upload "$logs/upload.log"
  say "OK: Plainworth $VERSION ($BUILD_NUMBER) uploaded. It shows in TestFlight after Apple finishes processing."
  exit 0
fi

# Second try: archive with Xcode's automatic signing, which can also switch on
# what the app's identifier is missing, then sign for the App Store and check again.
say "Retry: archive with automatic signing"
rm -rf "$archive" "$WORK/export"
xcb "$logs/archive_signed.log" "${common[@]}" -archivePath "$archive" archive "${auth[@]}" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic || { icloud_help; exit 1; }
check_app "$archive/Products/Applications/$name.app"
say "Sign for the App Store and check the signed app"
sign_and_check "$logs/sign_signed.log" || { icloud_help; exit 1; }
say "Upload to TestFlight"
upload "$logs/upload_signed.log"
say "OK: Plainworth $VERSION ($BUILD_NUMBER) uploaded. It shows in TestFlight after Apple finishes processing."
