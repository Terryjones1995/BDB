// Render a model's four-view contact sheet to a PNG.
//   node shot.mjs "<http address of modelshot/index.html>?m=<url of the .glb>" out.png
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

const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node shot.mjs "<viewer url>?m=<glb url>" out.png'); process.exit(2); }
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(url);
await page.waitForFunction(() => window.__done, null, { timeout: 180000 }).catch(() => {});
console.log(JSON.stringify({ done: await page.evaluate(() => window.__done || null), errs }));
await page.screenshot({ path: out });
await browser.close();
