// Boot check for city/ served the way GitHub Pages serves it (from /BDB/city/).
//   node bootcheck.mjs <url> <out.png> [readyTimeoutMs] [width] [height]      (see README.md for the one-line server)
// Logs every loading stage as it happens, every failed or non-2xx request, and every console error.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Playwright and Chrome are found through the environment so this runs on any machine:
//   PLAYWRIGHT_PATH=/path/to/node_modules/playwright   (default: whatever `require('playwright')` finds)
//   CHROME=/path/to/chrome                             (default: Playwright's own browser)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const launch = () => chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  // software WebGL, so it also works on a machine with no graphics card (slowly)
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

const [url, outPng, toArg, wArg, hArg] = process.argv.slice(2);
const readyTimeout = +toArg || 600000, W = +wArg || 960, H = +hArg || 540;
const t0 = Date.now(), secs = () => +((Date.now() - t0) / 1000).toFixed(1);
const log = (o) => console.log(JSON.stringify({ t: secs(), ...o }));
const errors = [], bad = []; let bytes = 0, reqs = 0; const byType = {};

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', m => { if (m.type() === 'error') { const s = 'console: ' + m.text().slice(0, 400); errors.push(s); log({ error: s }); } });
page.on('pageerror', e => { const s = 'pageerror: ' + String(e && e.stack || e).slice(0, 500); errors.push(s); log({ error: s }); });
page.on('requestfailed', r => { bad.push('failed ' + r.url()); log({ requestFailed: r.url().slice(-120) }); });
page.on('response', r => {
  const len = +(r.headers()['content-length'] || 0); bytes += len; reqs++;
  const ext = (r.url().split('?')[0].split('.').pop() || '').toLowerCase(); byType[ext] = (byType[ext] || 0) + len;
  if (r.status() >= 400) { bad.push(r.status() + ' ' + r.url()); log({ http: r.status(), url: r.url().slice(-140) }); }
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
let ready = false, last = '';
while (Date.now() - t0 < readyTimeout) {
  const s = await page.evaluate(() => ({
    ready: !!(window.__game && window.__game.ready),
    status: (document.getElementById('loading-status') || {}).textContent || '',
    mods: window.__game ? Object.fromEntries(Object.entries(window.__game.moduleStatus || {}).map(([k, v]) => [k, v.ok ? (v.ms ?? true) : 'FAILED'])) : null,
  })).catch(() => null);
  if (s) {
    if (s.status !== last) { last = s.status; log({ stage: s.status, mods: s.mods }); }
    if (s.ready) { ready = true; break; }
  }
  await page.waitForTimeout(1500);
}
const mb = x => +(x / 1048576).toFixed(1);
log({ ready, requests: reqs, totalMB: mb(bytes), byTypeMB: Object.fromEntries(Object.entries(byType).filter(([, v]) => v > 200000).map(([k, v]) => [k, mb(v)])) });
if (ready) {
  const st = await page.evaluate(() => {
    const g = window.__game, s = g.stats();
    return { quality: g.engine.quality.name, textureSet: g.ctx.assets.textureSet, fps: s.fps, calls: s.calls ?? s.drawCalls, triangles: s.triangles,
      population: s.population, moduleStatus: Object.fromEntries(Object.entries(s.moduleStatus).map(([k, v]) => [k, v.ok ? 'ok' : String(v.error).slice(0, 200)])), errors: (s.errors || []).slice(0, 6) };
  }).catch(e => ({ evalError: String(e).slice(0, 300) }));
  log({ stats: st });
}
await page.screenshot({ path: outPng, timeout: 120000 }).then(() => log({ screenshot: outPng })).catch(e => log({ screenshotFailed: String(e).slice(0, 120) }));
log({ done: true, ready, errors: errors.length, badRequests: bad.length, sampleBad: [...new Set(bad)].slice(0, 10) });
await browser.close();
