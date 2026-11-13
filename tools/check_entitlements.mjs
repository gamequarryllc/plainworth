#!/usr/bin/env node
// Checks that a built app's signature has every entitlement the project asks for.
//
//   node tools/check_entitlements.mjs <wanted.json> <got.json>
//
// <wanted.json> is the project's .entitlements file as JSON; <got.json> is what
// `codesign -d --entitlements` read out of the built app, as JSON ({} if none).
// Every key that's wanted must be there, and a wanted list (such as the iCloud
// containers) must be there in full. Values that signing is meant to change, like
// the notification environment going from development to production, aren't compared.
import fs from "node:fs";

const [wantedPath, gotPath] = process.argv.slice(2);
if (!wantedPath || !gotPath) {
  console.error("usage: node tools/check_entitlements.mjs <wanted.json> <got.json>");
  process.exit(2);
}
const wanted = JSON.parse(fs.readFileSync(wantedPath, "utf8"));
const got = JSON.parse(fs.readFileSync(gotPath, "utf8"));

const missing = [];
for (const [key, value] of Object.entries(wanted)) {
  if (!(key in got)) {
    missing.push(key);
    continue;
  }
  if (Array.isArray(value)) {
    const have = Array.isArray(got[key]) ? got[key] : [got[key]];
    // Signing may put the team's prefix in front of a value; the name itself must still be there.
    for (const item of value) {
      if (!have.some((h) => h === item || String(h).endsWith(`.${item}`))) missing.push(`${key}: ${item}`);
    }
  }
}

const names = Object.keys(wanted);
if (missing.length) {
  console.error("The built app's signature is missing these entitlements:");
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(names.length ? `entitlements: ${names.join(", ")}` : "entitlements: none asked for");
