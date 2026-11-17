#!/usr/bin/env node
// Puts the App Store screenshots on one version in App Store Connect, in the
// 6.9-inch iPhone slot (APP_IPHONE_67, 1320 x 2868), replacing what is there.
// If the version also has a 6.3-inch set (APP_IPHONE_61, often carried over from
// the version before) and <folder>/6.3in/ holds 1206 x 2622 pictures, that set is
// replaced too; without one, Apple shrinks the 6.9-inch pictures for smaller phones.
//
//   node tools/asc_screenshots.mjs <app id> <version> <folder> plan    read-only: prints what is there
//   node tools/asc_screenshots.mjs <app id> <version> <folder> apply   uploads <folder>/NN-*.png in name order
//
// Touches only that one screenshot set of the en-US listing: never the name,
// subtitle, keywords, promotional text or description, and never submits
// anything for review. Needs ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [appId, versionString, folder, mode] = process.argv.slice(2);
if (!/^\d+$/.test(appId || "") || !/^\d+(\.\d+){0,2}$/.test(versionString || "") || !folder || !["plan", "apply"].includes(mode)) {
  console.error("usage: node tools/asc_screenshots.mjs <app id> <version> <folder> plan|apply");
  process.exit(2);
}
const KIND = "APP_IPHONE_67";
const API = "https://api.appstoreconnect.apple.com";
const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuer } = process.env;
let p8 = process.env.ASC_KEY_P8 || "";
if (!keyId || !issuer || !p8) {
  console.error("ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 must be set");
  process.exit(3);
}
if (!p8.includes("BEGIN PRIVATE KEY")) p8 = Buffer.from(p8, "base64").toString("utf8");

const b64url = (data) => Buffer.from(data).toString("base64url");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })) +
    "." +
    b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }));
  const signature = crypto.sign("sha256", Buffer.from(unsigned), { key: p8, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${b64url(signature)}`;
}

async function call(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.startsWith("http") ? url : API + url, {
      method,
      headers: { Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : {};
    if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${method} ${url.split("?")[0]} -> ${res.status}: ${text.slice(0, 800)}`);
  }
}
const rel = (type, id) => ({ data: { type, id } });

// PNG width and height, from the header.
function pngSize(blob) {
  if (blob.toString("ascii", 1, 4) !== "PNG") throw new Error("not a PNG");
  return [blob.readUInt32BE(16), blob.readUInt32BE(20)];
}

const md5 = (blob) => crypto.createHash("md5").update(blob).digest("hex");

function readFolder(dir, w, h) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d\d-.*\.png$/.test(f))
    .sort();
  if (files.length < 1 || files.length > 10) throw new Error(`expected 1 to 10 screenshots in ${dir}, found ${files.length}`);
  const blobs = new Map(files.map((f) => [f, fs.readFileSync(path.join(dir, f))]));
  for (const [f, blob] of blobs) {
    const [bw, bh] = pngSize(blob);
    if (bw !== w || bh !== h) throw new Error(`${f} is ${bw} x ${bh}; this slot takes ${w} x ${h}`);
  }
  return { files, blobs };
}

const main = readFolder(folder, 1320, 2868);
if (!main) throw new Error(`no folder ${folder}`);
const small = readFolder(path.join(folder, "6.3in"), 1206, 2622);
const files = main.files;

const versions = (await call("GET", `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${versionString}`)).data;
const version = versions[0];
if (!version) throw new Error(`App Store Connect has no iOS version ${versionString}`);
const state = version.attributes.appVersionState || version.attributes.appStoreState;
console.log(`version ${versionString}: ${state}`);
const editable = ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY", "READY_FOR_REVIEW"];
if (!editable.includes(state)) throw new Error(`version ${versionString} is ${state}; its screenshots can't be changed`);

const locs = (await call("GET", `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
const en = locs.find((l) => l.attributes.locale === "en-US") || locs[0];
console.log(`listing ${en.attributes.locale} (only its iPhone 6.9-inch and 6.3-inch screenshots are touched)`);
const sets = (await call("GET", `/v1/appStoreVersionLocalizations/${en.id}/appScreenshotSets`)).data;
console.log(`screenshot sets there: ${sets.map((s) => s.attributes.screenshotDisplayType).join(", ") || "none"}`);

const jobs = [{ kind: KIND, pics: main, create: true }];
const smallSet = sets.find((s) => s.attributes.screenshotDisplayType === "APP_IPHONE_61");
if (smallSet && small) jobs.push({ kind: "APP_IPHONE_61", pics: small, create: false });
else if (smallSet) console.log("APP_IPHONE_61 set is there but no 6.3in pictures were given: left as it is");

for (const job of jobs) await replace(job);

async function replace({ kind, pics, create }) {
  const { files, blobs } = pics;
  let set = sets.find((s) => s.attributes.screenshotDisplayType === kind);
  const have = set ? (await call("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data : [];
  console.log(`\n${kind} now: ${have.map((s) => s.attributes.fileName).join(", ") || "none"}`);
  console.log(`to upload: ${files.join(", ")}`);
  const same =
    have.length === files.length && have.every((s, i) => s.attributes.fileName === files[i] && s.attributes.sourceFileChecksum === md5(blobs.get(files[i])));
  if (same) {
    console.log("Already the same pictures; nothing to do.");
    return;
  }
  if (mode === "plan") {
    console.log("plan only: nothing changed");
    return;
  }
  if (!set) {
    if (!create) return;
    set = (
      await call("POST", "/v1/appScreenshotSets", {
        data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: kind }, relationships: { appStoreVersionLocalization: rel("appStoreVersionLocalizations", en.id) } },
      })
    ).data;
  }
  for (const old of have) await call("DELETE", `/v1/appScreenshots/${old.id}`);
  for (const name of files) {
    const blob = blobs.get(name);
    const made = (
      await call("POST", "/v1/appScreenshots", {
        data: { type: "appScreenshots", attributes: { fileName: name, fileSize: blob.length }, relationships: { appScreenshotSet: rel("appScreenshotSets", set.id) } },
      })
    ).data;
    for (const op of made.attributes.uploadOperations) {
      const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
      const res = await fetch(op.url, { method: op.method, headers, body: blob.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`upload of ${name} -> ${res.status}`);
    }
    await call("PATCH", `/v1/appScreenshots/${made.id}`, {
      data: { type: "appScreenshots", id: made.id, attributes: { uploaded: true, sourceFileChecksum: md5(blob) } },
    });
    console.log(`uploaded ${name}`);
  }

  // Apple checks each picture after the upload.
  let states = [];
  for (let i = 0; i < 40; i++) {
    const now = (await call("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
    states = now.map((s) => `${s.attributes.fileName}: ${s.attributes.assetDeliveryState?.state}`);
    if (now.every((s) => ["COMPLETE", "FAILED"].includes(s.attributes.assetDeliveryState?.state))) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("Apple's check: " + states.join(", "));
  if (states.some((s) => !s.endsWith("COMPLETE"))) {
    console.error(`Not every ${kind} screenshot was accepted; see App Store Connect for the reason.`);
    process.exit(1);
  }
}
if (mode === "plan") process.exit(0);
console.log(`OK: ${files.length} screenshots on version ${versionString}. Nothing was submitted for review.`);
