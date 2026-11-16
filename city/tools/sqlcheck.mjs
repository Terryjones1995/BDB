// The city SQL through real PostgREST, as the anon role, the way the game will call it.
//   API=http://127.0.0.1:54330 KEY=<anon jwt> node sqlcheck.mjs        (see README.md, "A local Supabase")
// Needs Brawl's supabase.sql installed too: several checks are about how the two share names.
// Do not point this at the real server: it creates accounts and cities and leaves them there.
import { randomUUID } from 'crypto';
const base = (process.env.API || 'http://127.0.0.1:54330').replace(/\/+$/, ''), key = process.env.KEY || '';
if (!key) { console.error('KEY (the anon JWT) is not set'); process.exit(2); }
const H = { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key };
const rpc = async (fn, args = {}) => { const r = await fetch(`${base}/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; };
let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) pass++; else { fail++; console.log('FAIL', name, JSON.stringify(got).slice(0, 300)); } };
const tag = Date.now().toString(36).slice(-5);

let r = await rpc('city_ping'); check('ping', r.status === 200 && r.j.ok === true && r.j.max_cities === 12, r);
r = await rpc('city_register', { p_name: 'A', p_pass: 'pw1234' }); check('register: name too short', r.j.error === 'bad_input', r);
r = await rpc('city_register', { p_name: 'Mayor' + tag, p_pass: 'abc' }); check('register: password too short', r.j.error === 'bad_input', r);
r = await rpc('city_register', { p_name: ' Mayor' + tag + ' ', p_pass: 'pw1234' }); check('register', r.status === 200 && !!r.j.token && r.j.name === 'Mayor' + tag, r);
const me = { p_name: 'mayor' + tag, p_token: r.j.token };
r = await rpc('city_register', { p_name: 'MAYOR' + tag, p_pass: 'other99' }); check('register: taken, any case', r.j.error === 'taken', r);
r = await rpc('city_login', { p_name: 'Mayor' + tag, p_pass: 'wrong' }); check('login: wrong password', r.j.error === 'bad_login', r);
r = await rpc('city_login', { p_name: 'MAYOR' + tag, p_pass: 'pw1234' }); check('login', r.j.token === me.p_token, r);
r = await rpc('city_login', { p_name: 'nobody' + tag, p_pass: 'pw1234' }); check('login: unknown name', r.j.error === 'bad_login', r);

// Brawl accounts: the name is protected, the password opens a City account, a Brawl sign-in adopts it
r = await rpc('brawl_register', { p_name: 'Brawler' + tag, p_pass: 'brawlpw', p_data: {} }); check('brawl register', !!r.j.token, r);
const brawlToken = r.j.token;
r = await rpc('city_register', { p_name: 'brawler' + tag, p_pass: 'notmine' }); check('register: a Brawl name with the wrong password is taken', r.j.error === 'taken', r);
r = await rpc('city_login', { p_name: 'Brawler' + tag, p_pass: 'nope' }); check('login: Brawl name, wrong password', r.j.error === 'bad_login', r);
r = await rpc('city_login', { p_name: 'Brawler' + tag, p_pass: 'brawlpw' }); check('login: Brawl name and password open a City account', !!r.j.token && r.j.name === 'Brawler' + tag, r);
const b = { p_name: 'brawler' + tag, p_token: r.j.token };
r = await rpc('city_adopt', { p_name: 'Brawler' + tag, p_brawl_token: brawlToken }); check('adopt: a Brawl sign-in gives the same City account', r.j.token === b.p_token, r);
r = await rpc('city_adopt', { p_name: 'Brawler' + tag, p_brawl_token: randomUUID() }); check('adopt: wrong Brawl token', r.j.error === 'bad_token', r);
r = await rpc('city_adopt', { p_name: 'Mayor' + tag, p_brawl_token: brawlToken }); check('adopt: someone else\'s Brawl token', r.j.error === 'bad_token', r);
r = await rpc('brawl_register', { p_name: 'Second' + tag, p_pass: 'brawl22', p_data: {} });
r = await rpc('city_register', { p_name: 'Second' + tag, p_pass: 'brawl22' }); check('register: a Brawl name with its own password', !!r.j.token, r);
r = await rpc('brawl_login', { p_name: 'Brawler' + tag, p_pass: 'brawlpw' }); check('Brawl still works and was not written to', !!r.j.token && JSON.stringify(r.j.data) === '{}', r);

// cities
const id = randomUUID(), data = 'bdbz1:' + 'x'.repeat(50000);
const city = (over = {}) => ({ ...me, p_id: id, p_city: 'Testville', p_seed: 4242, p_start: 'village', p_population: 450, p_money: 250000, p_happiness: 61, p_day: 3, p_data: data, ...over });
r = await rpc('city_list', me); check('list: empty', Array.isArray(r.j.cities) && r.j.cities.length === 0, r);
r = await rpc('city_save', city()); check('save: new city', r.j.ok === true && r.j.rev === 1 && r.j.id === id, r);
r = await rpc('city_save', city({ p_city: '  Testville Two  ', p_population: 900 })); check('save: over my own', r.j.ok === true && r.j.rev === 2, r);
r = await rpc('city_list', me); check('list: one city, no contents', r.j.cities.length === 1 && r.j.cities[0].name === 'Testville Two' && r.j.cities[0].population === 900 && r.j.cities[0].bytes === data.length && r.j.cities[0].data === undefined, r);
r = await rpc('city_load', { ...me, p_id: id }); check('load: comes back whole', r.j.data === data && r.j.seed === 4242 && r.j.rev === 2, r);
r = await rpc('city_save', city({ ...b })); check('save: someone else\'s city', r.j.error === 'not_yours', r);
r = await rpc('city_load', { ...b, p_id: id }); check('load: someone else\'s city', r.j.error === 'not_found', r);
r = await rpc('city_delete', { ...b, p_id: id }); check('delete: someone else\'s city', r.j.error === 'not_found', r);
r = await rpc('city_save', city({ p_token: randomUUID() })); check('save: wrong token', r.j.error === 'bad_token', r);
r = await rpc('city_list', { p_name: me.p_name, p_token: randomUUID() }); check('list: wrong token', r.j.error === 'bad_token', r);
r = await rpc('city_save', city({ p_id: randomUUID(), p_data: 'y'.repeat(1500001) })); check('save: too big', r.j.error === 'too_big', r);
r = await rpc('city_save', city({ p_id: randomUUID(), p_data: 'y'.repeat(1500000) })); check('save: exactly at the limit', r.j.ok === true, r);
r = await rpc('city_save', city({ p_id: randomUUID(), p_city: '   ' })); check('save: no name', r.j.error === 'bad_input', r);
r = await rpc('city_save', city({ p_id: randomUUID(), p_happiness: 250, p_population: -5 })); check('save: numbers are clamped', r.j.ok === true, r);
for (let i = 0; i < 9; i++) await rpc('city_save', city({ p_id: randomUUID(), p_city: 'Filler ' + i, p_data: 'z' }));
r = await rpc('city_list', me); check('list: twelve cities', r.j.cities.length === 12, r.j.cities && r.j.cities.length);
const clamped = r.j.cities.find((c) => c.happiness === 100 && c.population === 0); check('save: clamped values stored', !!clamped, r.j.cities.map((c) => [c.happiness, c.population]));
r = await rpc('city_save', city({ p_id: randomUUID(), p_city: 'One too many', p_data: 'z' })); check('save: a thirteenth city', r.j.error === 'too_many', r);
r = await rpc('city_save', city({ p_population: 1234 })); check('save: an existing city still saves at the limit', r.j.ok === true && r.j.rev === 3, r);

// the table and visiting
r = await rpc('city_save', { ...b, p_id: randomUUID(), p_city: 'Brawlton', p_seed: 9, p_start: 'town', p_population: 99999, p_money: 5, p_happiness: 70, p_day: 40, p_data: 'brawlton-data' });
const brawlton = r.j.id;
r = await rpc('city_top', me); check('top: biggest first, with mayors', r.j.top[0].name === 'Brawlton' && r.j.top[0].mayor === 'Brawler' + tag && r.j.top[0].mine === false && r.j.top.some((t) => t.mine) && r.j.top[0].data === undefined, r.j.top && r.j.top.slice(0, 2));
r = await rpc('city_visit', { ...me, p_id: brawlton }); check('visit: another mayor\'s city can be opened', r.j.data === 'brawlton-data' && r.j.mayor === 'Brawler' + tag, r);
r = await rpc('city_visit', { p_name: 'x', p_token: randomUUID(), p_id: brawlton }); check('visit: needs a sign-in', r.j.error === 'bad_token', r);
r = await rpc('city_delete', { ...me, p_id: id }); check('delete', r.j.ok === true, r);
r = await rpc('city_delete', { ...me, p_id: id }); check('delete: already gone', r.j.error === 'not_found', r);

// what must NOT be reachable
r = await rpc('city_brawl_pass', { p_key: 'brawler' + tag }); check('the hash helper is not callable', r.status === 404, r);
r = await rpc('city_who', { p_name: me.p_name, p_token: me.p_token }); check('the token helper is not callable', r.status === 404, r);
for (const t of ['city_players', 'city_cities', 'brawl_players']) {
  const g = await fetch(`${base}/${t}?select=*`, { headers: H }); let rows = null; try { rows = await g.json(); } catch (_) {}
  check(`table ${t} gives nothing to the page`, g.status >= 400 || (Array.isArray(rows) && rows.length === 0), { status: g.status, rows: Array.isArray(rows) ? rows.length : rows });
  const w = await fetch(`${base}/${t}`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(t === 'city_cities' ? { id: randomUUID(), owner_key: me.p_name, name: 'x', seed: 1, data: 'x' } : { name_key: 'hax' + tag, name: 'hax', pass: 'x' }) });
  check(`table ${t} cannot be written by the page`, w.status >= 400, { status: w.status });
}
const noKey = await fetch(`${base}/rpc/city_ping`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not.a.jwt' }, body: '{}' });
check('a bad key is turned down', noKey.status === 401, noKey.status);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
