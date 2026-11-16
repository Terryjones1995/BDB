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
