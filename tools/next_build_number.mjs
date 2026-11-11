#!/usr/bin/env node
// Prints the next TestFlight build number for an app: one more than the highest
// build number App Store Connect already has for it, across every version.
// Builds made earlier by other services count too, so a new upload never collides.
//
//   node tools/next_build_number.mjs <App Store Connect app id>
//
// Needs ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (the .p8 text, or base64 of it).
import crypto from "node:crypto";

const appId = process.argv[2];
if (!/^\d+$/.test(appId || "")) {
  console.error("usage: node tools/next_build_number.mjs <App Store Connect app id>");
  process.exit(2);
}
const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuer } = process.env;
let p8 = process.env.ASC_KEY_P8 || "";
if (!keyId || !issuer || !p8) {
  console.error("ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 must be set");
  process.exit(3);
}
if (!p8.includes("BEGIN PRIVATE KEY")) p8 = Buffer.from(p8, "base64").toString("utf8");

const b64url = (data) => Buffer.from(data).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned =
  b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })) +
  "." +
  b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
const signature = crypto.sign("sha256", Buffer.from(unsigned), { key: p8, dsaEncoding: "ieee-p1363" });
const token = `${unsigned}.${b64url(signature)}`;

const params = new URLSearchParams({
  "filter[app]": appId,
  sort: "-uploadedDate",
  limit: "200",
  "fields[builds]": "version",
});
const res = await fetch(`https://api.appstoreconnect.apple.com/v1/builds?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`App Store Connect answered ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
const { data } = await res.json();
let highest = 0;
for (const build of data) {
  const n = Number.parseInt(build.attributes?.version ?? "", 10);
  if (Number.isFinite(n) && n > highest) highest = n;
}
console.log(highest + 1);
