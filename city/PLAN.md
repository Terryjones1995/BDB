# BDB City — the plan

**Working title.** A 3D city builder on the BDB site. You are the mayor: you lay roads, zone land,
run the budget, send out police and fire crews, build an airport, cut deals with other cities and
invite friends in. It has to look like real 3D, be easy to pick up, and feel alive. BDB is your
advisor and has opinions about all of it.

This file is the standing brief. Read it before working in `city/`, and keep the status table true.

## Where it stands

| # | Step | Status |
|---|---|---|
| 1 | Fable Cities running in `city/`, no build step, lighter art | **Live** (15 Nov 2026) — see "Step 1 notes" |
| 1b | Starter cities and a random map for every new game | **Live** — see "Starting a city" |
| 1c | First-night fixes: lag on built-in graphics, level starter towns, loading that does not freeze | **Live / going live** — see "First night live" |
| 2 | Saving, BDB accounts, touch controls, BDB as advisor | Not started |
| 3 | Crime, fire and ambulance dispatch, with the Tripo buildings and vehicles | Not started (models arriving, see `ASSETS.md`) |
| 4 | Money screen, events, the deeper rules | Not started |
| 5 | Airport, rail, port, and deals with BDB's city | Not started |
| 6 | Friends: globe, visits, live co-building, deals between players | Not started |
| 7 | Landmarks, seasons, polish | Not started |

Every step ends with something playable on the site.

## First night live (15 Nov 2026): what came back, and the build order now

Taylor and a friend played the first public build for an hour and reported as they went. Everything
below came from that. It replaces the order of steps 2 to 7 in the table above.

### What was wrong, and what was done the same night

| Report | Cause | Fix |
|---|---|---|
| "Feels very laggy", on a 14-core desktop with built-in Intel graphics | The chip reports plain "Intel Graphics", which matched nothing in the hardware table, so the guess from core count gave it Medium | Table entry puts it on Low. Below Low the guard now lowers the drawing resolution (80%, then 65%). Low and Medium stopped paying for terrain shadows, kerb shadows and a full-density horizon |
| "Game stuck at 96%" / a friend "kicked out" | Building a starter town or the demo city was one long blocking step squeezed into the last 8% of the bar. The page froze, and a frozen page gets killed | The 3D view is no longer drawn behind the loading screen, shaders are compiled once off the main thread, the long steps run in slices, and the build has a real share of the bar |
| "Birds are loud" | A call every half second at full level | A sixth of the level, a third as often |
| Roads buried in hillsides in starter towns | Sites were chosen for dryness, not level ground, and nothing was graded. Checked on four random maps: 25–50% street grades, up to 4 m of ground over the road | Sites are scored on the step between neighbouring blocks, every block is terraced and every street line graded before building, avenue stubs stop where the ground turns, and roads re-cut their own surface last |
| "If I leave I can't see my world" | No saving yet | `src/rescue.js` gets a city out of an open tab into a file and browser storage; real saving is next |
| "No option to create city name" | The name box showed a grey suggestion and read as filled in | It says "Type a name" |

### What players asked for

In Taylor's words, grouped:

- **Keep my city:** saving, accounts, several cities each, on Supabase. A friend's city rescued from an open tab.
- **Shape the land:** flatten an area, get rid of hills, add water. Bridges and tunnels.
- **Fix my mistakes:** undo. Road junctions that are not "sloppy".
- **More to build:** farms, grocery stores, big-box retail ("walmarts": generic stores, no real brands), casinos, courts, ports for cargo ships, sports teams (hockey, football, basketball).
- **A city that reacts:** tax rates to adjust; crime that follows poverty and how happy people are.
- **Look and feel:** much better quality without a graphics card; trees that do not look poor.

### What a city needs (the brainstorm Taylor asked for)

The test for each idea: does the player make a choice, and does the city visibly answer?

1. **Money you can steer.** Tax sliders per zone (the simulation already has per-zone rates and
   `setTax`; only the screen is missing). A funding slider per service that trades cost against
   coverage. Loans. A weekly report that says in one line why money went up or down.
2. **People with circumstances.** Households in three wealth bands. Poverty comes from low-wage
   jobs, unemployment and high rent; it shows on the map. Happiness is built from services, taxes,
   commute, noise, pollution and safety, and the info views say which one is hurting.
3. **Crime with causes.** Crime rises with poverty, unemployment and unhappiness, and falls with
   police cover, schools and street lighting. It appears as incidents a patrol car drives to. Jails
   fill; a courthouse clears cases faster, so the same police go further. A casino pays well and
   raises crime around it.
4. **Emergencies you can watch.** Fires start where industry and old dense housing lack cover.
   Fire trucks, ambulances and police cars leave their stations and drive there (the Tripo models
   are waiting). A slow response costs buildings, people and happiness.
5. **Things that are made, moved and sold.** Farms grow food, industry makes goods, grocery and
   big-box stores sell them. Short supply closes shops and annoys people; surplus is exported. The
   cargo port, rail and the airport are how goods and visitors arrive.
6. **Something to be proud of.** An arena or stadium with a team the player names and picks a sport
   for: home games fill the roads, pay the city and lift the mood. Museum, university, TV tower and
   Ferris wheel as landmarks with real effects. Hotels and tourism through the airport.
7. **Land that can be shaped.** Flatten, raise, lower, dig lakes and rivers. Bridges over water,
   tunnels under hills. Parks. Districts with their own rules.
8. **Friends.** Visit a friend's city. A table of cities by people, happiness and money. Deals
   between cities: sell spare power or water, trade goods, share a team rivalry. Co-building later.
9. **A place that feels alive.** Seasons and weather that matter. Events: a festival, a storm, a
   strike. BDB as the advisor who roasts your decisions. Headlines that react to what you did.
10. **Easy to play.** Undo. Autosave. Short goals that teach ("house your first 500 people").
    Tooltips that say what to do next, not what a thing is called.

### Build order from here

| # | What | Why here |
|---|---|---|
| A | **Saving**: on the device and in Supabase, several cities per account, start screen lists them, rescued cities load back | Anything built is lost on leaving until this exists |
| B | **Money screen**: tax sliders, service funding, loans, weekly report | The simulation already supports most of it; quickest way to give players a real decision |
| C | **Undo and landscaping**: Ctrl+Z; flatten, raise, lower, dig water | The two things players reached for and did not find |
| D | **Crime, fire and medical**, with causes, incidents and vehicles that drive there; jail and courthouse | The heart of "a city that reacts" |
| E | **Bridges**, then the **goods chain**: farms, grocery, big-box, cargo port | Opens up water and gives industry a point |
| F | **Stadium and teams, casino, landmarks, tourism and the airport** | Pride and big-ticket goals |
| G | **Friends**: visits, the city table, deals | Needs saving and the goods chain first |
| H | **Tunnels, bus and rail lines, seasons, events, BDB the advisor** | Depth and polish |

Lag and looks on built-in graphics run alongside all of it: each release should be no heavier than
the last on Low.

## What Taylor asked for

- An open-world city the player builds up **huge**, as its **mayor**, and can **invite friends** into.
- **Crime, police, fires, airports** — "a real high quality city".
- **City revenue**, **deals with other cities**, **building roads**.
- It should feel like **a real live earth**.
- **Easy game, nice UI.** In English.
- A new game can begin from a **starter city** rather than from scratch, and **every new city gets its
  own random map**.
- The quality has to be **like real 3D**, in three.js.
- Art from **Tripo** (he generates, we fit it in).

## Decisions already made (and why)

**Built on Fable Cities** — https://github.com/rawprogress/fable-cities, MIT code, CC0 art.
It is the best-looking open-source three.js city builder found: terrain with coast and mountains,
a real road network with curves and junctions, zoning along roads, procedural buildings in five
levels with lit windows at night, traffic and pedestrians, weather, a clean five-button HUD, and a
basic economy with service coverage. What it does **not** have is the game Taylor described:
no saving at all, no crime or fire events, no disasters, no airport, no trade, no multiplayer,
no touch controls. Those are steps 2–7.

**Rules come from Metro · Microcity** — https://github.com/herozhong0125/city-builder, MIT.
It looks plain (box buildings, Chinese UI) but has the deepest rule set found: fire that spreads
and is put out by coverage, disasters, hard-choice events, tourism and hotels, transit, freight,
pollution, loans and policies, milestones. Its simulation (`src/sim/city.js`) is pure logic with
`serialize()`. It is grid-based and Fable Cities is road-graph-based, so **port the rules and the
numbers, not the code structure**. Keep its MIT notice next to anything copied.

**Two more MIT projects to borrow from:**
- IsoCity — https://github.com/amilich/isometric-city — co-op through Supabase with the city kept
  in a database row, neighbouring-city connections, airports and aircraft.
- Republik Netizenia — https://github.com/alisalatrax/republik-netizenia — a shared city where every
  rule is a `SECURITY DEFINER` SQL function and the tables are closed. Brawl already works this way.

**Not used:** 3d.city and micropolisJS (GPL lineage, and 3d.city ships both a GPL and an MIT file),
the AGPL builders, and anything with no licence file.

**The look is realistic.** Ordinary houses, towers, shops and roads are generated by the game,
which is how a city gets huge without a huge download. Tripo supplies the special buildings
(stations, hospital, airport, landmarks) and the vehicles. See `ASSETS.md`.

**No build step**, like the rest of this repo: plain ES modules and an import map. Fable Cities
needs three.js r185, so `city/vendor/three` carries its own copy; the other games stay on r160.

**Accounts and cloud saves reuse Brawl's server.** Same pattern as `brawl/cloud.js` and
`brawl/supabase.sql`: plain `fetch` to SQL functions, tables closed to direct access, and the game
keeps working on device saves if the server is unreachable. One BDB login across the site: the
city functions check the Brawl name and token. Note Brawl caps a save at 400 KB, so a city save
has to be compact (see "Saving").

**Live co-building uses the transport the site already has** (`chess/net.js`, Trystero, peer to
peer, host-authoritative the way Tycoon and Brawl do it).

**Work on a branch, open a pull request.** `main` is what GitHub Pages serves, and another session
is committing Brawl work to `main` at the same time. Keep changes outside `city/` small.

## The game

**The loop, kept easy.** Roads, then zones, then services, then taxes. Buildings and people arrive
by themselves. Five buttons to start; everything else unlocks as the city grows, so the toolbar
never overwhelms. No way to lose in the first hour: BDB bails you out, with a roast.

**Starting a city.** The start screen offers four ways in: a starter village (the recommended one), a
starter town, empty land, or the big generated demo city. Every new game rolls a fresh random seed,
so the map and the town on it are different each time; the seed is shown and can be typed in to get
the same map again. The starters are built by `src/demo/StarterTown.js` through the same public
calls a player's tools use: it finds a dry site where neighbouring blocks stand at nearly the same
height, levels each block to a terrace and each street line to a ramp, lays a small grid with an
avenue running out of it, zones the blocks, sets down the basics, and ages the place until people
have moved in. Adding another starter is a new entry in its `STARTERS` table. The village comes out
at about 450 people and the town at about 2,500.

The first version chose its site for dryness and graded nothing. It was only ever checked on one
seed, which happened to be flat; on four other seeds the streets ran at 25 to 50% and up to 4 m of
ground lay over the road. The rule now: a change to the starters is run through
`tools/startercheck.mjs` on at least six seeds; it compares the ground against every road surface.
After the rewrite the same seeds give streets under 6% and nothing over the road.

**BDB is the advisor.** The speech bubble and roast deck from `assets/kit.js` and
`assets/roasts.js` become the advisor: one concrete next step at a time ("No fire cover east of
the river"), plus commentary on every bad call.

**City revenue.** In: three tax sliders (homes, shops, industry), transit fares, tourism, airport
and port fees, deal income. Out: service budgets (police, fire, health, schools), utilities,
road upkeep, loan interest, deal purchases. One screen, money in against money out, a slider per
department. Underfunding has visible effects (slower trucks, shorter coverage).

**Crime, fire, ambulance — one dispatch system.** Each block has a risk level. Crime rises with
unemployment, low education, low land value and density, and falls with police coverage. Fire risk
rises with industry, density, no water and dry weather. Incidents appear as pins; vehicles drive
the real road network from the nearest station; response time decides the outcome, so traffic
matters. Slow fire response spreads to neighbours; unanswered crime drags land value and happiness
down. A jail fills up.

**Airport.** Airstrip, then regional, then international. Needs a large flat site and a road.
Brings tourists and business demand, costs upkeep and noise, and is the long-distance link for
deals. Planes take off, land, and fly to the cities you are linked with.

**Deals with other cities.** Every city has surpluses and shortfalls: power, water, trash
handling, goods, tourists. A deal is "I send you X a month for Y" over a link: highway to a
neighbour, rail, port, or airport. BDB's own city is always available and always lowballs.
Friends' cities give better terms. Deals between players are settled by SQL functions against real
time, so both sides get paid even when one is offline.

**Friends.** A globe shows every player's city as a lit pin. Three roles: mayor (owner), deputy
(invited, can build, with a spending cap), visitor (looks around). Anyone can visit a city at any
time from its last cloud save. When the mayor is online, a deputy joins live and builds alongside.

**A live earth.** You found the city on a spot on the globe, which sets its climate and seasons.
Day and night, weather, traffic, people, planes and ships all keep moving, and the city keeps
running while you are away (capped), with a "while you were out" report.

## How it is put together

```
city/
  index.html            entry page: import map, loading screen
  src/core/             engine, camera, input, world model, asset loading
  src/modules/<name>/   one folder per subsystem (terrain, roads, zoning, buildings, traffic, simulation, ui, …)
  src/shared/           seeded RNG, maths, hardware/quality detection
  vendor/three/         three.js r185 and the addon files the game imports
  assets/               art at full size (1024 px WebP textures, models, HDRI)
  assets-lite/          the same textures at 512 px, for the 'low' preset
  models/               our own models (Tripo), once they are fitted — not created yet
  tools/                import-fable.py, bootcheck.mjs, glbinfo.py, modelshot/  (see tools/README.md)
  PLAN.md  ASSETS.md  NOTICE.md  LICENSE-fable-cities.txt  THIRD-PARTY-NOTICES.md
```

- **Module contract.** Each module exports `name`, `init(ctx)`, `update(dt)`, and writes its own
  part of `world` (`world.roads`, `world.zones`, `world.buildings`, `world.services`,
  `world.economy`, …), announcing changes on `ctx.events`. A module that throws is isolated and
  shows up in `window.__game.moduleStatus`. New systems (dispatch, airport, deals, saves, net)
  should be new modules registered in `src/modules/registry.js`, not edits scattered through old ones.
- **Assets.** Code names every file `/assets/…`. `AssetLoader.resolve()` turns that into the real
  address: relative to the page, `.jpg` → `.webp`, and `assets-lite/` when `textureSet` is `lite`.
  It is installed on the loading manager, so glTF files get the same treatment. Anything that loads
  a file some other way (terrain reads images through `<img>`) must call `assets.resolve()` itself.
- **Quality.** Four presets in `src/core/Config.js`. With no `?quality=` in the address the game
  starts at what `src/shared/quality.js` recommends for the device (phones and small machines get
  `low`), and `modules/perfguard` steps down at run time if frames are slow.
- **Address options** worth knowing: `?quality=low|medium|high|ultra`, `?start=empty|village|town|city`
  (skips the start screen; `city` is the demo city, and the older `?demo=0|1` still works), `?tex=full|lite`,
  `?seed=7` (without it a `?start=` game rolls its own),
  `?time=17.5`, `?weather=rain`, `?showcase=roads` (one module's own test scene), `?debug=1`.
- **Saving (step 2) has to be designed in.** Upstream keeps nothing. Everything procedural is
  deterministic per seed, so a save is: seed, map size, the road graph, zones, buildings (lot,
  level, seed), service buildings, economy and clock. Keep it compact: for scale, Microcity's
  100 × 100 city is 671 KB as JSON and 18 KB gzipped, and Brawl's cloud save limit is 400 KB.

## Checking work

Serve the repo the way GitHub Pages does and open `/BDB/city/`:

```
mkdir -p /tmp/site && ln -sfn "$PWD" /tmp/site/BDB        # from the repo root
python3 -m http.server 5200 --directory /tmp/site
```

`tools/bootcheck.mjs` loads the page in a headless browser and logs every loading stage, every
missing file and every console error, then takes a screenshot. Run it after any change to loading,
paths or module start-up. `window.__game` is the inspection hook (`stats()`, `moduleStatus`,
`setCamera()`, `setTime()`, `world`).

**The cloud sandbox has no graphics card.** Everything renders in software there, so an empty map
on `low` takes minutes to reach Ready and the full demo city takes far longer. Use `?demo=0`, a
small window, single-module showcases, and ask Taylor to look on a real machine for anything about
how it looks or feels. Do not claim a visual result that was not seen.

## Step 1 notes

What was done is listed in `NOTICE.md`.

Checked with `tools/bootcheck.mjs`, served from `/BDB/city/`, on `low` with an empty map: reaches
Ready with all thirteen modules up, no console errors and no missing files. The first attempt
caught one thing the import had missed: the terrain reads its ground textures through `<img>`
rather than the loader, so it asked for the old `/assets/…jpg` addresses. That is fixed and is the
reason for the "anything that loads a file some other way" rule above.

**Not checked:** how it looks and plays on a real graphics card, on any preset. That needs Taylor's
eyes. In the sandbox screenshot the trees look pale on `low`; whether that is the preset, software
rendering, or a fault is unknown.

Measured:

- Upstream textures: 181 MB of JPEG. Here: 28 MB at full size, 7.5 MB at half size.
- First load on `low` with an empty map: about 12 MB (3.2 code, 5.2 textures, 3.3 models).
- Still heavy: the thirteen street-furniture models are 15.7 MB of geometry (one potted plant is
  176,000 triangles). Simplifying and meshopt-compressing them is the obvious next saving; it was
  left alone in step 1 because the props module reads their geometry directly and the result could
  not be checked by eye in the sandbox.

## A fix made to the base game: zoning on angled streets

`src/modules/zoning/ZoneGrid.js` decides which frontage cells along a street can be built on by
probing each cell against a 1 m raster of the roads. The probes on the kerb edge sat 0.28 m into
the cell, which is inside the 0.6 m margin the raster adds around the cell's own road. On a street
lined up with the map grid that never mattered; on any other heading roughly one probe in three
was flagged, and each one deleted a whole frontage column. The probes now sit 0.68 m in.

Measured on the same maps before and after: the starter village went from 271 usable cells and 5
lots to 880 cells and 58 lots, and the demo city on seed 1337 from 523 lots and 19,753 people to
862 lots and 33,028. Every road a player draws at an angle now fills in the way a straight one does.

The cost: the demo city has about 65% more buildings than upstream's. In a full boot on `low` that
came to 3.75 million triangles against 3.36 million before (11% more) and the same 855 draw calls,
with no errors. If it is still too slow on real hardware, shrink its grid (`COLS` and `ROWS` in
`src/demo/DemoCity.js`) rather than undoing the fix.

## What a frame costs, measured (Nov 2026)

Counted in a headless browser from the live scene, before the first-night changes. Triangles in
view, and how many of them also cast shadows (those are drawn again in every shadow cascade).

| Part | Starter town, Medium | Demo city, Low |
|---|---|---|
| Terrain (two thirds of it the two horizon rings) | 621,000 (517,000 cast) | 723,000 (618,000 cast) |
| Roads | 174,000 (118,000 cast) | 638,000 (437,000 cast) |
| Service buildings | 73,000 | 192,000 |
| All other buildings (instanced boxes) | about 50,000 | about 350,000 |
| Everything else | about 30,000 | about 230,000 |
| **Drawn per frame, shadows included** | **1.66 million** | **3.75 million** |

So the buildings were never the cost; the ground and the roads were, mostly through shadows. Low
and Medium no longer cast terrain, kerb or lamp-post shadows, Low halves the horizon's density,
and both pull the terrain's detail rings in. The same starter town on Low went from 942,000
triangles a frame to 605,000. What is still unmeasured is the per-pixel cost of the terrain and
water shaders on built-in graphics; the sandbox draws in software and cannot tell.

Next candidates, in order: a cheaper road mesh on Low (the demo city's roads are 638,000
triangles), simpler terrain shading on Low, and the 16 MB of street-furniture models.

## Known gaps and risks

- **Phones.** The full look is desktop-class. Phones get `low` and the half-size textures; older
  ones may still struggle. There are no touch controls yet (step 2).
- **Saves are trusted from the browser**, the same as Brawl. A friend could edit their cash. Fine
  for this site; deals between players settle in SQL so one side cannot invent the other's money.
- **Peer-to-peer co-building** can be blocked on strict networks (the chess README says the same).
- **Two three.js versions** on the site (r160 for the older games, r185 here). They do not share
  a page, so it costs download size only.
- **Upstream moves on.** `tools/import-fable.py --src` refuses to run once `city/src` exists,
  because that code is ours now. Bringing in upstream changes later is a manual merge.

## Open questions for Taylor

- The name. "BDB City" is a placeholder.
- Whether city accounts should be the Brawl accounts (the plan assumes yes).
- How far phone support has to go: playable, or look-around only.
