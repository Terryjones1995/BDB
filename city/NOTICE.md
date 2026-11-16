# What BDB City is built on

BDB City is built on **Fable Cities** by raw — https://github.com/rawprogress/fable-cities —
used under the MIT licence. The licence text and copyright notice are in
[`LICENSE-fable-cities.txt`](LICENSE-fable-cities.txt) and have to stay with this code.

Upstream snapshot: commit `aea8b1035030952555395de0c1de14ba693a1427` (2026-09-03).

## What was changed from upstream

`tools/import-fable.py` did the mechanical part and documents it; the rest are ordinary edits in `src/`.

- **No build step.** Upstream is a Vite project. Here `index.html` carries an import map, and
  three.js r185 plus only the addon files the game imports are vendored under `vendor/three/`.
- **Runs from a sub-folder.** Every file is named `/assets/…` in the code; `src/core/AssetLoader.js`
  now resolves that relative to the page, so the game works at `/BDB/city/` on GitHub Pages.
- **Lighter art.** The 236 JPEG textures (181 MB upstream) are re-encoded as WebP in two sizes:
  `assets/` (1024 px) and `assets-lite/` (512 px, loaded on the `low` preset and so on phones).
  The code and the glTF files still say `.jpg`; the loader maps the name to the file.
  `preview.png` and `info.json` authoring leftovers are not shipped.
- **Loaders.** The Draco and EXR loaders are gone (nothing shipped used them, and Draco pulled its
  decoder from a CDN at run time). A meshopt decoder is wired in instead, which is how the rest of
  this site ships its models. Nothing is fetched from another site.
- **Start-up preset.** When the address does not pin `?quality=`, the game starts at the preset its
  own hardware check recommends, instead of always `high`.
- **Starter cities and random maps.** Upstream offered empty land or one large demo city, on seed
  1337 unless the player changed it. Here the start screen also offers a starter village and a
  starter town (`src/demo/StarterTown.js`, new), and every new game rolls its own seed.
- **Zoning fix.** `src/modules/zoning/ZoneGrid.js` probed each frontage cell too close to its own
  road, which deleted most building lots along any street not lined up with the map grid. The
  probe distance changed from 0.93 to 0.83; the demo city grew from 523 lots to 862 on the same
  map. Details in `PLAN.md`.
- **Naming.** Working title, a link back to All games, and `New Charleston` as the default city name.

`THIRD-PARTY-NOTICES.md` is upstream's file, kept as it came. One line in it no longer applies
here: the Draco decoder is not used at all.

## Art and libraries

- Textures, HDRI and street-furniture models: CC0, from ambientCG and Poly Haven — listed in
  [`assets/CREDITS.md`](assets/CREDITS.md).
- Service vehicles in `assets/simulation/models/`: Kenney, CC0 — `KENNEY_LICENSE.txt` beside them.
- three.js: MIT — [`vendor/three/LICENSE`](vendor/three/LICENSE).
- Models in `models/` (when there are some) are generated for this game with Tripo; see `ASSETS.md`.
