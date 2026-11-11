// app.json holds the app's settings. This file adds what a particular build
// decides for itself:
//
//   APP_VERSION        the version shown in TestFlight and on the App Store (default: app.json's)
//   APP_BUILD_NUMBER   the build number, which must go up with every upload (default: app.json's)
//
// The iPhone build (tools/ios_build.sh) sets both.
module.exports = ({ config }) => {
  const out = { ...config };
  const version = process.env.APP_VERSION;
  if (version && /^\d+(\.\d+){0,2}$/.test(version)) out.version = version;
  const build = process.env.APP_BUILD_NUMBER;
  if (build && /^\d+$/.test(build)) out.ios = { ...config.ios, buildNumber: build };
  return out;
};
