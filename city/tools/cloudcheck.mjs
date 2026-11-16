// Online saving end to end, through the start screen, against a local Supabase stand-in:
// create an account, found a village, save, reopen on this computer, reopen on "another computer",
// delete, a rescued city, a city from a file, a server with no SQL, and no server at all.
//   KEY=<anon jwt> node cloudcheck.mjs            (see README.md, "A local Supabase")
//   API=http://127.0.0.1:54331   the gateway stand-in (tools/localdb/gateway.mjs)
//   BASE=http://127.0.0.1:5200/BDB/city/          where the game is served
//   PSQL='psql -h 127.0.0.1 -p 54329 -U postgres -d postgres'   to also check the rows in the database
//   FULL=1                       load every module (slow without a graphics card)
// Do not point this at the real server: it creates an account and cities.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const jwt = process.env.KEY || '';
if (!jwt) { console.error('KEY (the anon JWT) is not set'); process.exit(2); }
const FOCUS = process.env.FULL ? '' : '&focus=terrain,roads,zoning,buildings,simulation';
const api = process.env.API || 'http://127.0.0.1:54331';
const GAME = process.env.BASE || 'http://127.0.0.1:5200/BDB/city/';
const RESCUE_FILE = process.env.RESCUE || fileURLToPath(new URL('./fixtures/rescue-village.json', import.meta.url));
const url = (extra = '') => `${GAME}?quality=low&api=${encodeURIComponent(api)}&apikey=${jwt}${FOCUS}${extra}`;
// without PSQL the database assertions are skipped (they answer as if they had passed)
const sql = (q) => (process.env.PSQL ? execSync(`${process.env.PSQL} -Atc "${q}"`).toString().trim() : null);
const tag = Date.now().toString(36).slice(-5), NAME = 'Mayor' + tag, PASS = 'hunter22';
let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log('ok  ', name); } else { fail++; console.log('FAIL', name, JSON.stringify(got === undefined ? null : got).slice(0, 400)); } };
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const newPage = async (ctx, u) => {
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(String(e).slice(0, 300))); page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_TUNNEL|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) page.errs.push('console: ' + m.text().slice(0, 240)); });
  await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('#fm-village', { timeout: 120000 });
  return page;
};
const allErrs = [];
const ready = async (page) => { await page.waitForFunction(() => window.__game && window.__game.ready && window.__game.world.saves, null, { timeout: 600000 }); };
const print = () => { const g = window.__game, w = g.world, e = w.economy; return { segs: w.roads.segments.size, lots: w.zones.api.lotsFor().length, buildings: w.buildings.list.length, services: w.services.list.length,
  pop: e.population, money: Math.round(e.money), name: e.cityName, seed: w.seed, load: g.moduleStatus.load || null, saves: w.saves ? w.saves.api.status() : null, city: w.saves && w.saves.api.city }; };
const cities = (page) => page.evaluate(() => [...document.querySelectorAll('.fm-city')].map((el) => ({ name: el.querySelector('.fm-city__name').textContent, meta: el.querySelector('.fm-city__meta').textContent })));

// ---------- 1. first visit: nothing saved, the server is there, nobody signed in
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 760 }, reducedMotion: 'reduce' });
let p = await newPage(ctxA, url());
await p.waitForFunction(() => /Sign in to keep/.test(document.querySelector('#fm-account').textContent), null, { timeout: 60000 }).catch(() => {});
check('start screen: new-city tab first, account form shown', await p.evaluate(() => document.querySelector('.fm-root').dataset.tab === 'new' && !!document.querySelector('#fm-acc-name')), await p.evaluate(() => document.querySelector('#fm-account').textContent));
await p.click('#fm-tab-cities');
await p.fill('#fm-acc-name', NAME); await p.fill('#fm-acc-pass', 'no');
await p.click('#fm-acc-new');
check('account: a short password is refused in plain words', /at least 4/.test(await p.textContent('#fm-cities-note')), await p.textContent('#fm-cities-note'));
await p.fill('#fm-acc-pass', PASS); await p.click('#fm-acc-new');
await p.waitForFunction(() => /Signed in as/.test(document.querySelector('#fm-account').textContent), null, { timeout: 20000 }).catch(() => {});
check('account: created and signed in', (await p.textContent('#fm-account')).includes(`Signed in as ${NAME}`), await p.textContent('#fm-account'));
{ const got = sql(`select count(*) || ':' || bool_and(left(pass, 2) = chr(36) || '2' and length(pass) = 60) from city_players where name_key = '${NAME.toLowerCase()}'`); check('account: in the database, password hashed', got === null || got === '1:true', got); }

// ---------- 2. found a village, play a little, save
await p.click('#fm-tab-new');
await p.fill('#fm-name', 'E2E Harbour');
await p.click('#fm-village');
await ready(p);
await p.evaluate(async () => { const g = window.__game, w = g.world, s = w.starter; const ux = Math.cos(s.yaw), uz = Math.sin(s.yaw);
  const far = Math.max(...[...w.roads.nodes.values()].map((n) => (n.x - s.x) * ux + (n.z - s.z) * uz));
  w.roads.api.build([{ x: s.x + ux * far, z: s.z + uz * far }, { x: s.x + ux * (far + 120), z: s.z + uz * (far + 120) }], 'local');
  g.modules.simulation.api.setTax('commercial', 0.14); g.modules.simulation.api.fastForward(86400 * 2); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
const st = await p.evaluate(async () => window.__game.world.saves.api.saveNow('manual'));
check('save: on the device and online', st.kept && st.device === 'saved' && st.cloud === 'saved', st);
const a = await p.evaluate(print);
const row = sql(`select name || '|' || seed || '|' || start || '|' || population || '|' || rev || '|' || length(data) from city_cities where owner_key = '${NAME.toLowerCase()}'`);
check('save: the row in the database matches the game', row === null || row.startsWith(`E2E Harbour|${a.seed}|village|${a.pop}|`), { row, a: { pop: a.pop, seed: a.seed } });
console.log('     city A:', JSON.stringify({ segs: a.segs, lots: a.lots, buildings: a.buildings, pop: a.pop, money: a.money, bytes: row ? +row.split('|').pop() : null }));
allErrs.push(...p.errs); await p.close();

// ---------- 3. come back on the same computer: it is on the list, and opens as it was left
p = await newPage(ctxA, url());
await p.waitForFunction(() => document.querySelectorAll('.fm-city').length > 0, null, { timeout: 30000 }).catch(() => {});
await p.waitForFunction(() => /online/.test((document.querySelector('.fm-city__meta') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
let list = await cities(p);
check('return: "Your cities" opens first and lists the city', await p.evaluate(() => document.querySelector('.fm-root').dataset.tab === 'cities') && list.length === 1 && list[0].name === 'E2E Harbour' && /on this device and online/.test(list[0].meta), list);
await p.click('.fm-city__open');
await ready(p);
const b = await p.evaluate(print);
check('return: the city is back whole', b.load && b.load.ok && b.load.missing === 0 && b.segs === a.segs && b.lots === a.lots && b.buildings === a.buildings && b.services === a.services && b.name === 'E2E Harbour' && Math.abs(b.pop - a.pop) <= 2 && Math.abs(b.money - a.money) < 500, { a, b });
check('return: it carries on saving under the same city', b.city && a.city && b.city.id === a.city.id && b.saves.kept, { a: a.city, b: b.city });
check('return: the tax change survived', await p.evaluate(() => window.__game.world.economy.taxRate.commercial) === 0.14);
allErrs.push(...p.errs); await p.close();

// ---------- 4. another computer: nothing on the device, sign in, the city comes down from the server
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 760 }, reducedMotion: 'reduce' });
p = await newPage(ctxB, url());
await p.click('#fm-tab-cities');
await p.waitForSelector('#fm-acc-name', { timeout: 30000 });
await p.fill('#fm-acc-name', NAME.toUpperCase()); await p.fill('#fm-acc-pass', 'wrong-one'); await p.click('#fm-acc-in');
await p.waitForFunction(() => /do not match/.test(document.querySelector('#fm-cities-note').textContent), null, { timeout: 20000 }).catch(() => {});
check('other computer: a wrong password is refused', /do not match/.test(await p.textContent('#fm-cities-note')), await p.textContent('#fm-cities-note'));
await p.fill('#fm-acc-pass', PASS); await p.click('#fm-acc-in');
await p.waitForFunction(() => document.querySelectorAll('.fm-city').length > 0, null, { timeout: 30000 }).catch(() => {});
list = await cities(p);
check('other computer: signing in lists the online city', list.length === 1 && list[0].name === 'E2E Harbour' && /online/.test(list[0].meta), list);
await p.click('.fm-city__open');
await ready(p);
const c = await p.evaluate(print);
check('other computer: the city is back whole from the server', c.load && c.load.ok && c.load.missing === 0 && c.segs === a.segs && c.buildings === a.buildings && Math.abs(c.pop - a.pop) <= 2 && c.city.id === a.city.id, { a, c });
allErrs.push(...p.errs); await p.close();

// ---------- 5. delete it: gone from the list, the device and the server
p = await newPage(ctxB, url());
await p.waitForFunction(() => document.querySelectorAll('.fm-city').length > 0, null, { timeout: 30000 });
await p.click('.fm-city__del');
check('delete: the first press only asks', (await cities(p)).length === 1 && /again to confirm/.test(await p.textContent('#fm-cities-note')), await p.textContent('#fm-cities-note'));
await p.click('.fm-city__del');
await p.waitForFunction(() => document.querySelectorAll('.fm-city').length === 0, null, { timeout: 20000 }).catch(() => {});
{ const left = sql(`select count(*) from city_cities where owner_key = '${NAME.toLowerCase()}'`); check('delete: gone from the list and the database', (await cities(p)).length === 0 && (left === null || left === '0'), await cities(p)); }
allErrs.push(...p.errs); await p.close();

// ---------- 6. a city rescued out of an old tab: it is offered, opens, and becomes an ordinary saved city
const rescue = readFileSync(RESCUE_FILE, 'utf8');
const doc = JSON.parse(rescue);
const ctxC = await browser.newContext({ viewport: { width: 1280, height: 760 }, reducedMotion: 'reduce' });
// put the rescue copy into this browser's storage once, the way rescue.js left it, then open the game
{ const seedPage = await ctxC.newPage(); await seedPage.goto(GAME + 'tools/README.md'); await seedPage.evaluate((r) => localStorage.setItem('bdb.city.rescue.v1', r), rescue); await seedPage.close(); }
p = await newPage(ctxC, url());
await p.waitForFunction(() => document.querySelectorAll('.fm-city').length > 0, null, { timeout: 30000 }).catch(() => {});
list = await cities(p);
check('rescue: the rescued city is offered on the start screen', list.length === 1 && list[0].name === doc.name && /rescued/.test(list[0].meta), list);
await p.click('.fm-city__open');
await ready(p);
const r1 = await p.evaluate(print);
check('rescue: roads, services and most buildings are back', r1.load && r1.load.ok && r1.segs === doc.segments.length && r1.services === doc.services.length && r1.buildings >= doc.buildings.length * 0.9 && r1.name === doc.name && r1.seed === doc.seed,
  { got: { segs: r1.segs, buildings: r1.buildings, services: r1.services, missing: r1.load && r1.load.missing, money: r1.money }, want: { segs: doc.segments.length, buildings: doc.buildings.length, services: doc.services.length, money: Math.round(doc.economy.money) } });
check('rescue: the money and the tax rates came with it', Math.abs(r1.money - doc.economy.money) < 2000, { got: r1.money, want: doc.economy.money });
const rs = await p.evaluate(async () => { const s = await window.__game.world.saves.api.saveNow('manual'); return { s, left: localStorage.getItem('bdb.city.rescue.v1') }; });
check('rescue: once saved, it is an ordinary city and the rescue copy is cleared', rs.s.device === 'saved' && rs.left === null, { device: rs.s.device, cloud: rs.s.cloud, left: rs.left && rs.left.length });
allErrs.push(...p.errs); await p.close();
p = await newPage(ctxC, url());
await p.waitForFunction(() => document.querySelectorAll('.fm-city').length > 0, null, { timeout: 30000 }).catch(() => {});
list = await cities(p);
check('rescue: next visit lists it once, as a city on this device', list.length === 1 && /on this device/.test(list[0].meta), list);

// ---------- 7. a city from a file (the same rescue file, as the friend's backup)
await p.setInputFiles('#fm-file-input', RESCUE_FILE);
await ready(p);
const f1 = await p.evaluate(print);
check('file: a rescue file opens from "Load a city from a file"', f1.load && f1.load.ok && f1.segs === doc.segments.length && f1.name === doc.name, { segs: f1.segs, name: f1.name, load: f1.load });
allErrs.push(...p.errs); await p.close();
p = await newPage(ctxC, url());
await p.setInputFiles('#fm-file-input', { name: 'holiday.json', mimeType: 'application/json', buffer: Buffer.from('{"photos":["beach.jpg"]}') });
await p.waitForFunction(() => document.querySelector('#fm-cities-note').textContent.length > 0, null, { timeout: 15000 }).catch(() => {});
check('file: something that is not a city is refused in plain words', /cannot be opened|not a saved city/.test(await p.textContent('#fm-cities-note')) && await p.evaluate(() => document.querySelector('.fm-root').dataset.phase === 'choose'), await p.textContent('#fm-cities-note'));
allErrs.push(...p.errs); await p.close();

// ---------- 8. the server is there but the SQL has never been run; and no server at all
for (const [what, apiUrl, want] of [['SQL not run', api + '/nosetup', /not switched on yet/], ['no server', 'http://127.0.0.1:59998', /cannot be reached/]]) {
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 760 }, reducedMotion: 'reduce' });
  p = await newPage(ctxD, `${GAME}?quality=low&api=${encodeURIComponent(apiUrl)}&apikey=${jwt}${FOCUS}`);
  await p.waitForFunction((re) => new RegExp(re).test(document.querySelector('#fm-account').textContent), want.source, { timeout: 60000 }).catch(() => {});
  check(`${what}: the start screen says so and offers no sign-in`, want.test(await p.textContent('#fm-account')) && !(await p.$('#fm-acc-name')), await p.textContent('#fm-account'));
  await p.click('#fm-tab-new'); await p.fill('#fm-name', 'Offline Town'); await p.click('#fm-village');
  await ready(p);
  const os = await p.evaluate(async () => window.__game.world.saves.api.saveNow('manual'));
  check(`${what}: the city still saves on the device`, os.kept && os.device === 'saved' && os.cloud === 'off', os);
  allErrs.push(...p.errs); await p.close();
  p = await newPage(ctxD, `${GAME}?quality=low&api=${encodeURIComponent(apiUrl)}&apikey=${jwt}${FOCUS}`);
  await p.waitForFunction(() => document.querySelectorAll('.fm-city').length > 0, null, { timeout: 30000 }).catch(() => {});
  check(`${what}: and is on the list next time`, (await cities(p)).some((c) => c.name === 'Offline Town'), await cities(p));
  allErrs.push(...p.errs); await p.close();
}
console.log(`page errors: ${JSON.stringify(allErrs)}`);
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
