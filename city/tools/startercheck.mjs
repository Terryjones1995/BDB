// Starter-town check: builds a starter on each seed and compares the ground with every road surface.
//   node startercheck.mjs <village|town> <seed> [seed ...]
//   BASE=http://127.0.0.1:5200/BDB/city/   where the game is served (see README.md for the one-line server)
//   FOCUS=''                               load every module (default: only what the builder needs, which is quicker)
//   SHOT=dir                               also save a screenshot per seed into dir
// One JSON line per seed. What to look for:
//   buried    road sample points with ground more than 25 cm above the surface   (want 0)
//   maxGrade  steepest street, in percent                                         (want under about 6)
//   relief    height range across all the town's streets, in metres
// A change to src/demo/StarterTown.js is not checked until this has run on at least six seeds:
// the first version was only ever looked at on one seed, which happened to be flat.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const [kind, ...seeds] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:5200/BDB/city/';
const focus = process.env.FOCUS != null ? process.env.FOCUS : 'terrain,roads,zoning,buildings,simulation';
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
for (const seed of seeds) {
  const page = await browser.newPage({ viewport: { width: process.env.SHOT ? 960 : 400, height: process.env.SHOT ? 540 : 240 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const t0 = Date.now();
  try {
    await page.goto(`${base}?start=${kind}&seed=${seed}&quality=low${focus ? '&focus=' + focus : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 600000 });
    const out = await page.evaluate(() => {
      const g = window.__game, w = g.world, t = w.terrain, s = w.starter || {};
      let pts = 0, buried = 0, worst = 0, floating = 0; const bad = [];
      for (const seg of w.roads.segments.values()) {
        const P = seg.points || []; let segWorst = 0, at = null;
        const ends = [w.roads.nodes.get(seg.a), w.roads.nodes.get(seg.b)].filter((n) => n && n.segments.length >= 3);
        for (let i = 0; i < P.length; i++) {
          // inside a junction the surface is the junction's own sloped pad, not this arm's centre line
          if (ends.some((n) => Math.hypot(P[i].x - n.x, P[i].z - n.z) < 16)) continue;
          const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
          const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
          for (const k of [-0.32, 0, 0.32]) {
            const x = P[i].x + nx * seg.width * k, z = P[i].z + nz * seg.width * k;
            const d = t.getHeight(x, z) - P[i].y; pts++;
            if (d > 0.25) { buried++; if (d > segWorst) { segWorst = d; at = [Math.round(x), Math.round(z)]; } }
            if (d < -1.5) floating++;
          }
        }
        if (segWorst > worst) worst = segWorst;
        if (segWorst > 0.25) bad.push({ id: seg.id, type: seg.type, len: Math.round(seg.length), over: +segWorst.toFixed(2), at });
      }
      // how level is the ground the town stands on?
      let lo = Infinity, hi = -Infinity;
      for (const seg of w.roads.segments.values()) for (const p of seg.points || []) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
      let maxGrade = 0;
      for (const seg of w.roads.segments.values()) { const P = seg.points || []; if (P.length > 1) { const gr = Math.abs(P[P.length - 1].y - P[0].y) / Math.max(1, seg.length); if (gr > maxGrade) maxGrade = gr; } }
      bad.sort((a, b) => b.over - a.over);
      return { ms: s.ms, streets: s.streets, lots: s.lots, buildings: s.buildings, pop: w.economy.population, segs: w.roads.segments.size, pts, buried, worst: +worst.toFixed(2), floating,
        relief: +(hi - lo).toFixed(1), maxGrade: +(maxGrade * 100).toFixed(1), bad: bad.slice(0, 3), site: { relief: s.relief, step: s.step, graded: s.graded, terrace: s.terraceStep }, timing: s.timing, warm: g.moduleStatus.warmUp };
    });
    console.log(JSON.stringify({ seed: +seed, sec: Math.round((Date.now() - t0) / 1000), ...out, errs }));
    if (process.env.SHOT) { await page.waitForTimeout(3000); await page.screenshot({ path: `${process.env.SHOT}/starter-${kind}-${seed}.png` }); }
  } catch (err) { console.log(JSON.stringify({ seed: +seed, failed: String(err).slice(0, 200), errs })); }
  await page.close();
}
await browser.close();
