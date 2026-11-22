// The home screen widgets (a Pro feature). `expo prebuild` adds this folder to
// the Xcode project as a widget extension, through @bacons/apple-targets.
//
// The app hands the widgets what to show through the shared app group
// (src/lib/widget-storage.ts writes it, Snapshot.swift reads it). The group
// here must match app.json and both of those files.
/** @type {import('@bacons/apple-targets/build/config').Config} */
module.exports = {
  type: "widget",
  name: "PlainworthWidgets",
  displayName: "Plainworth",
  bundleIdentifier: ".widgets",
  deploymentTarget: "17.0",
  entitlements: {
    "com.apple.security.application-groups": ["group.com.gamequarry.plainworth"],
  },
};
