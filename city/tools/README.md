# city/tools

Helpers for working on BDB City. None of them ship to players; the game itself needs no build step.

## Serve the game the way GitHub Pages does

From the repo root:

```
mkdir -p /tmp/site && ln -sfn "$PWD" /tmp/site/BDB
python3 -m http.server 5200 --directory /tmp/site
```

The game is then at `http://127.0.0.1:5200/BDB/city/`. Serving from `/BDB/` matters: a path that
only works from the site root will break on the real site.

## bootcheck.mjs — does it load?

```
node city/tools/bootcheck.mjs "http://127.0.0.1:5200/BDB/city/?quality=low&demo=0" boot.png 900000 960 540
```

Loads the page in a headless browser and prints one JSON line per event: each loading stage with
the time every module took, every request that failed or came back 4xx/5xx, every console error,
then the final stats and a screenshot. A clean run ends with `"ready":true,"errors":0,"badRequests":0`.

It needs Playwright. If `require('playwright')` does not find it, point at it:
`PLAYWRIGHT_PATH=/path/to/node_modules/playwright`, and `CHROME=/path/to/chrome` for a specific browser.

On a machine with no graphics card it renders in software: allow minutes, use `?demo=0` and a
small window. The timeout argument is in milliseconds.


## startercheck.mjs — do the starter towns sit on level ground?

```
node city/tools/startercheck.mjs town 7 437124 16991 42799 977660 31337
```

Builds a starter (`village` or `town`) on each seed and compares the ground with every road
surface. One JSON line per seed: `buried` is the number of road sample points with more than 25 cm
of ground over them (want 0), `maxGrade` the steepest street in percent (want under about 6),
`relief` the height range across the town's streets, and `timing` where the build spent its time.

Run it on at least six seeds after any change to `src/demo/StarterTown.js`. The first version was
only ever looked at on one seed, which happened to be flat; on others the streets ran at 25 to 50%.
`SHOT=dir` saves a screenshot per seed, `FOCUS=''` loads every module instead of only the ones the
builder needs.

## savecheck.mjs — does a saved city come back the same?

```
node city/tools/savecheck.mjs 42799 town
```

Plays a starter (a new street, zoning, a tax change, nine game days), saves it, loads the save
into a fresh page and compares the two cities: every zoning cell, every plot, every building, the
ground and the road heights, people and money. Then both play on for three game days, and the
loaded city is saved and loaded a second time to prove nothing drifts. Each `DIFF` line should
name nothing but the clock.

Run it after any change to `src/save/`, to a module's `exportState` / `importState`, or to
anything that decides where a zoning cell, a plot or a road surface ends up.

## A local Supabase, for testing the SQL and online saving

Never test against the real server: the checks create accounts and cities. A stand-in takes a few
minutes and three pieces.

1. **Postgres with pgcrypto.** `npm install embedded-postgres` brings real binaries under
   `node_modules/@embedded-postgres/<platform>/native/bin`. It will not run as root: `initdb` and
   `pg_ctl start -o '-p 54329'` as an ordinary user.
2. **Make it look like Supabase**, then install both games' SQL:
   ```
   psql -p 54329 -U postgres -f city/tools/localdb/bootstrap.sql   # roles anon/authenticated, schema extensions, Supabase's default grants
   psql -p 54329 -U postgres -f brawl/supabase.sql
   psql -p 54329 -U postgres -f city/supabase.sql
   ```
   The default grants matter: Supabase hands every new function in `public` to the anonymous role,
   which is exactly the mistake the private schema in `city/supabase.sql` guards against.
3. **PostgREST** (a single static binary from its GitHub releases) with `db-anon-role = "anon"`,
   `db-schemas = "public"`, a `jwt-secret`, and a JWT signed with that secret whose payload is
   `{"role":"anon"}`. That JWT is `KEY` below. `node city/tools/localdb/gateway.mjs` then stands in
   for Supabase's gateway (`/rest/v1/…` in front of PostgREST) on port 54331.

### sqlcheck.mjs — the SQL on its own

```
API=http://127.0.0.1:54330 KEY=<anon jwt> node city/tools/sqlcheck.mjs
```

49 checks through PostgREST as the anonymous role: sign-up and sign-in rules, Brawl names and
passwords, saving, limits, who may open or delete what, and what must not be reachable (the
helper functions, and the tables themselves).

### cloudcheck.mjs — online saving through the start screen

```
KEY=<anon jwt> PSQL='psql -h 127.0.0.1 -p 54329 -U postgres -d postgres' node city/tools/cloudcheck.mjs
```

Creates an account, founds a village, saves, reopens it on the same computer and on "another
computer", deletes it, opens a rescued city and a city from a file, and runs with a server that
has no SQL and with no server at all. 28 checks; it ends with the list of page errors, which
should be empty.

## Checking a model from Tripo

```
python3 city/tools/glbinfo.py raw.glb
```

prints what is in the file: triangles, textures and their sizes, whether it has a skeleton, its
size and which way it faces. Then look at it:

```
node city/tools/modelshot/shot.mjs "http://127.0.0.1:5200/BDB/city/tools/modelshot/index.html?m=<url of the .glb>" sheet.png
```

renders it from four angles (front-left, right side, top, rear-right; +z is the front). The `m`
address is relative to the viewer page, so a model in `city/models/` is `?m=../../models/name.glb`.

What to look for is in `../ASSETS.md`.

## fit-model.py — make a Tripo export web-sized

```
GLTF_TRANSFORM=node_modules/.bin/gltf-transform python3 city/tools/fit-model.py raw.glb city/models/name.glb [--tris 8000] [--tex 1024]
```

Cuts triangles, resizes textures to WebP, and meshopt-compresses the geometry. It refuses a model
with no texture or with a skeleton. Needs `npm install @gltf-transform/cli` somewhere outside the
repo. Always render the result with modelshot afterwards.

## import-fable.py — how city/ was made from Fable Cities

Documents and reproduces the import: `--vendor` re-vendors three.js, `--assets` re-converts the
art, `--src` copied and patched the source once and now refuses to overwrite it. Read its
docstring before running it.
