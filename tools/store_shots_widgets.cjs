// Draws the home screen widgets App Store screenshot: an iPhone home screen (dark)
// with four of Plainworth's widgets, at 1320 x 2868 like the Simulator shots, so
// tools/store_shots_frame.cjs can set it under its caption like the others.
//
//   node tools/store_shots_widgets.cjs <folder>
//     reads <folder>/raw/widgets.json (tools/store_shots_widget_data.ts),
//     writes <folder>/raw/08-home-screen-widgets.png
//
// iOS gives no way to place widgets on the Simulator's home screen from a script,
// so the widgets are drawn here from the same numbers the app hands them, with the
// sizes, colors and type of targets/widgets (Parts.swift, Widgets.swift). Change
// both together. Needs Playwright's Chromium; run it on a Mac for SF Pro.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = path.resolve(process.argv[2] || '.');
const RAW = path.join(DIR, 'raw');
const s = JSON.parse(fs.readFileSync(path.join(RAW, 'widgets.json'), 'utf8'));

// Dark colors from Palette in Parts.swift.
const C = {
  surface: '#1C1C1E', text: '#FFFFFF', secondary: '#A4A4AC', track: '#333338',
  gain: '#30D158', loss: '#FF453A', green: '#30D158', red: '#FF453A', blue: '#0A84FF',
  kinds: ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2'],
};
const word = (tone) => (tone > 0 ? C.gain : tone < 0 ? C.loss : C.secondary);
const line = (tone) => (tone < 0 ? C.red : C.green);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const cap = (t, color = C.secondary, extra = '') =>
  `<div class="cap" style="color:${color};${extra}">${esc(t)}</div>`;
const amt = (t, size = 27, color = C.text, extra = '') =>
  `<div class="amt" style="font-size:${size}px;color:${color};${extra}">${esc(t)}</div>`;
const bar = (v, color, h = 10, extra = '') =>
  `<div class="bar" style="height:${h}px;${extra}"><div style="background:${color};width:max(${h}px,${(Math.min(Math.max(v, 0), 1) * 100).toFixed(2)}%)"></div></div>`;

function chart(w, h, color, filled) {
  const n = Math.min(s.net.lineX.length, s.net.lineY.length);
  const inset = 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push([inset + s.net.lineX[i] * (w - inset * 2), inset + (1 - s.net.lineY[i]) * (h - inset * 2)]);
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('');
  const area = filled ? `<path d="${d}L${pts[n - 1][0]},${h}L${pts[0][0]},${h}Z" fill="${color}" fill-opacity="0.14"/>` : '';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${area}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function ring(size, v, label) {
  const r = (size - 9) / 2;
  const len = 2 * Math.PI * r;
  const frac = Math.min(Math.max(v, 0.01), 1);
  return `<div style="position:relative;width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.track}" stroke-width="9"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.green}" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${(len * frac).toFixed(2)} ${len.toFixed(2)}"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:${C.text}">${esc(label)}</div>
  </div>`;
}

// SpendingSmallView
const spendingSmall = `
  ${cap(s.spend.month)}
  ${amt(s.spend.spent, 27, C.text, 'margin-top:4px')}
  ${cap('spent', C.secondary, 'margin-top:2px')}
  <div style="flex:1;min-height:8px"></div>
  ${s.spend.bar >= 0 ? bar(s.spend.bar, C.blue) : ''}
  ${cap(`${s.spend.savedLabel} ${s.spend.saved}`, word(s.spend.savedTone), 'margin-top:8px')}`;

// GoalSmallView
const goalSmall = `
  ${cap(`Goal · ${s.goal.label}`)}
  <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:6px 0">${ring(92, s.goal.progress, s.goal.percent)}</div>
  ${cap(s.goal.reachYear ? `On pace for ${s.goal.reachYear}` : s.goal.status, word(s.goal.statusTone), 'text-align:center')}`;

// NetWorthChartView
const netWorthChart = `
  <div style="display:flex;gap:14px;height:100%">
    <div style="width:132px;display:flex;flex-direction:column">
      ${cap('Net Worth')}
      ${amt(s.net.value, 27, C.text, 'margin-top:4px')}
      ${cap(s.net.span, word(s.net.spanTone), 'margin-top:2px')}
      <div style="flex:1;min-height:4px"></div>
      ${cap(s.net.spanLabel)}
    </div>
    <div style="flex:1">${chart(364 - 32 - 132 - 14, 170 - 32, line(s.net.spanTone), true)}</div>
  </div>`;

// OwnView
const shares = s.own.rows.map((r) => r.share);
const total = Math.max(shares.reduce((a, b) => a + b, 0), 0.0001);
const split = `<div style="display:flex;gap:2px;height:18px;border-radius:9px;overflow:hidden;margin-top:14px">${shares
  .map((v, i) => `<div style="flex:${v / total};background:${C.kinds[i % 4]}"></div>`)
  .join('')}</div>`;
const ownRow = (color, name, percent, value, valueColor) => `
  <div class="row"><span class="dot" style="background:${color}"></span><span style="color:${C.text}">${esc(name)}</span>
    <span style="flex:1"></span><span style="color:${C.secondary}">${esc(percent)}</span>
    <span style="width:82px;text-align:right;font-weight:600;color:${valueColor}">${esc(value)}</span></div>`;
const rows = s.own.rows.map((r, i) => ownRow(C.kinds[i % 4], r.name, r.percent, r.value, C.text));
if (s.own.debts) rows.push(ownRow(C.red, 'Debts', '', s.own.debts, C.loss));
const own = `
  ${cap('What You Own')}
  ${amt(s.own.total, 30, C.text, 'margin-top:4px')}
  ${split}
  <div style="margin-top:10px">${rows.join('<div class="rule"></div>')}</div>`;

const widget = (x, y, w, h, body) => `
  <div class="w" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${body}</div>
  <div class="label" style="left:${x}px;top:${y + h + 6}px;width:${w}px">Plainworth</div>`;

// A Pro Max is 440 x 956 points; widgets are 170 (small), 364 x 170 (medium), 364 x 382 (large).
const L = 38;
const R = 440 - 38 - 170;
const top = 74;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 440px; height: 956px; overflow: hidden; }
  body { position: relative; font-family: -apple-system, "SF Pro Text", "SF Pro", system-ui, "Helvetica Neue", Inter, Arial, sans-serif;
         background: radial-gradient(120% 70% at 20% 10%, #23395B 0%, transparent 60%),
                     radial-gradient(110% 70% at 90% 90%, #1E4A45 0%, transparent 60%),
                     linear-gradient(180deg, #0E1726 0%, #070A10 100%); }
  .status { position: absolute; top: 0; left: 0; right: 0; height: 54px; color: #fff; }
  .time { position: absolute; left: 0; width: 160px; top: 19px; text-align: center; font: 600 17px/22px -apple-system, "SF Pro Text", Inter, sans-serif; }
  .w { position: absolute; box-sizing: border-box; padding: 16px; border-radius: 23px; background: ${C.surface};
       display: flex; flex-direction: column; overflow: hidden; }
  .label { position: absolute; text-align: center; color: rgba(255,255,255,0.92); font-size: 12px; font-weight: 500;
           text-shadow: 0 1px 2px rgba(0,0,0,0.35); }
  .cap { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; line-height: 15px; }
  .amt { font-weight: 700; letter-spacing: -0.5px; white-space: nowrap; line-height: 1.15; }
  .bar { position: relative; border-radius: 99px; background: ${C.track}; overflow: hidden; }
  .bar > div { height: 100%; border-radius: 99px; }
  .row { display: flex; align-items: center; gap: 8px; height: 46px; font-size: 14px; white-space: nowrap; }
  .dot { width: 10px; height: 10px; border-radius: 5px; flex: none; }
  .rule { height: 1px; background: ${C.track}; }
  .dots { position: absolute; left: 0; right: 0; top: 906px; display: flex; justify-content: center; gap: 8px; }
  .dots span { width: 7px; height: 7px; border-radius: 4px; background: rgba(255,255,255,0.35); }
  .dots span:first-child { background: #fff; }
</style></head><body>
  <div class="status">
    <div class="time">9:41</div>
    <svg style="position:absolute;right:30px;top:23px" width="80" height="13" viewBox="0 0 80 13" fill="#fff">
      <rect x="0" y="9" width="3.2" height="4" rx="1"/><rect x="5" y="6.5" width="3.2" height="6.5" rx="1"/>
      <rect x="10" y="4" width="3.2" height="9" rx="1"/><rect x="15" y="1" width="3.2" height="12" rx="1"/>
      <path d="M31 3.2c2.4 0 4.6.9 6.3 2.5l1.2-1.2C36.5 2.6 33.9 1.5 31 1.5s-5.5 1.1-7.5 3l1.2 1.2c1.7-1.6 3.9-2.5 6.3-2.5zm0 3.4c1.5 0 2.8.6 3.9 1.5l1.2-1.2c-1.4-1.3-3.1-2-5.1-2s-3.7.7-5.1 2l1.2 1.2c1.1-.9 2.4-1.5 3.9-1.5zm0 3.4c.6 0 1.1.2 1.5.6L31 12.1l-1.5-1.5c.4-.4.9-.6 1.5-.6z"/>
      <rect x="49" y="1" width="26" height="12" rx="3.5" fill="none" stroke="#fff" stroke-opacity="0.4"/>
      <rect x="51" y="3" width="22" height="8" rx="2"/><rect x="76.5" y="4.5" width="1.6" height="5" rx="0.8" fill-opacity="0.4"/>
    </svg>
  </div>
  ${widget(L, top, 170, 170, spendingSmall)}
  ${widget(R, top, 170, 170, goalSmall)}
  ${widget(L, top + 170 + 32, 364, 170, netWorthChart)}
  ${widget(L, top + 2 * (170 + 32), 364, 382, own)}
  <div class="dots"><span></span><span></span></div>
</body></html>`;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const out = path.join(RAW, '08-home-screen-widgets.png');
    await page.screenshot({ path: out });
    console.log(`raw/08-home-screen-widgets.png`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
