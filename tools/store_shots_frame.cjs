// Sets each Simulator screenshot under its caption on a 1320 x 2868 page (the 6.9-inch
// iPhone size App Store Connect asks for): the screen inside a plain phone outline, on
// the navy of the app icon, with a short bold caption in SF Pro on top.
//
//   node tools/store_shots_frame.cjs <folder>     reads <folder>/raw/*.png, writes <folder>/NN-*.png
//
// Needs Playwright's Chromium (the workflow installs it). Run it on a Mac, where
// -apple-system is SF Pro; elsewhere the captions fall back to another sans serif.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = path.resolve(process.argv[2] || '.');
const RAW = path.join(DIR, 'raw');
const PAGE = { width: 1320, height: 2868 };

// Apple reads caption text for search: keep the wording.
const SHOTS = [
  { file: '01-net-worth', caption: 'Your net worth,\nwithout a bank login.' },
  { file: '02-spending-year', caption: 'Your budget spreadsheet,\nnow an app.' },
  { file: '03-where-youre-headed', caption: 'See where your\nnet worth is headed.' },
  { file: '04-spending-by-category', caption: 'See where your\nmoney really goes.' },
  { file: '05-debt-payoff-order', caption: 'Pay off debt faster,\navalanche or snowball.' },
  { file: '06-this-year-vs-last-year', caption: 'This year vs last year,\nin plain words.' },
];

// The screen on the page: 1320 x 2868 pixels shown 1050 wide.
const SCREEN_W = 1050;
const SCREEN_H = Math.round((SCREEN_W * 2868) / 1320);
const PT = SCREEN_W / 440; // page pixels per iPhone point (a Pro Max is 440 points wide)
const px = (pt) => `${(pt * PT).toFixed(1)}px`;

function page(img, caption) {
  const lines = caption
    .split('\n')
    .map((l) => `<div>${l}</div>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${PAGE.width}px; height: ${PAGE.height}px; overflow: hidden;
                 background: linear-gradient(180deg, #18202F 0%, #06090F 100%); }
    .caption { position: absolute; top: 132px; left: 0; right: 0; text-align: center; color: #FFFFFF;
               font: 700 90px/106px -apple-system, "SF Pro Display", "SF Pro", system-ui, "Helvetica Neue", Arial, sans-serif;
               letter-spacing: -1.6px; }
    .phone { position: absolute; top: 440px; left: 50%; width: ${SCREEN_W}px; height: ${SCREEN_H}px; transform: translateX(-50%);
             box-sizing: content-box; border: 22px solid #0B0C0E; border-radius: ${px(62)}; background: #000;
             box-shadow: 0 0 0 4px #3A3F4A, 0 0 0 6px #10131A, 0 50px 120px rgba(0, 0, 0, 0.55); }
    .btn { position: absolute; width: 9px; border-radius: 4px; background: #2C313B; }
    .screen { position: absolute; inset: 0; overflow: hidden; border-radius: ${px(55)}; }
    .screen img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
    .island { position: absolute; left: 50%; top: ${px(11)}; width: ${px(126)}; height: ${px(37)}; margin-left: ${px(-63)};
              border-radius: ${px(19)}; background: #000; }
  </style></head><body>
    <div class="caption">${lines}</div>
    <div class="phone">
      <div class="btn" style="left:-31px;top:${px(180)};height:${px(32)}"></div>
      <div class="btn" style="left:-31px;top:${px(245)};height:${px(62)}"></div>
      <div class="btn" style="left:-31px;top:${px(320)};height:${px(62)}"></div>
      <div class="btn" style="right:-31px;top:${px(275)};height:${px(100)}"></div>
      <div class="screen"><img src="data:image/png;base64,${img}"><div class="island"></div></div>
    </div>
  </body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  try {
    const sheet = await browser.newPage({ viewport: PAGE, deviceScaleFactor: 1 });
    for (const shot of SHOTS) {
      const src = path.join(RAW, `${shot.file}.png`);
      if (!fs.existsSync(src)) throw new Error(`missing ${src}`);
      await sheet.setContent(page(fs.readFileSync(src).toString('base64'), shot.caption));
      await sheet.evaluate(() => document.fonts.ready);
      await sheet.waitForTimeout(250);
      const font = await sheet.evaluate(() => getComputedStyle(document.querySelector('.caption')).fontFamily);
      await sheet.screenshot({ path: path.join(DIR, `${shot.file}.png`) });
      console.log(`${shot.file}.png (${font.split(',')[0]})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
