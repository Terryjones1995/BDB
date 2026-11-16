#!/usr/bin/env python3
"""Rebuild city/ from an upstream Fable Cities checkout.

BDB City is built on Fable Cities (https://github.com/rawprogress/fable-cities, MIT, CC0 art).
Upstream is a Vite project that serves from the site root and ships ~180 MB of JPEG textures.
This script turns it into what this repo needs: plain ES modules with no build step, served from
a sub-folder (GitHub Pages: /BDB/city/), with the art re-compressed for the web.

    python3 city/tools/import-fable.py <fable-cities checkout> <unpacked three npm package> <city dir> --src --vendor --assets

Pick the parts to (re)build:
  --src     copy src/ (minus node-only test files) and apply the mechanical patches a no-build
            page needs. This was run ONCE, at the start. city/src is our code now and has moved
            on from upstream, so the step refuses to run while city/src exists (add --force to
            replace it, and expect to redo our changes by hand).
  --vendor  vendor three.js: the two minified build files and only the addon files the game
            imports. Safe to re-run when upgrading three or when a new addon is imported
            (add it to ADDON_ENTRIES).
  --assets  copy the models and convert every .jpg texture to .webp twice:
              assets/       same size as upstream (1024 px)   -> desktop
              assets-lite/  half size (512 px)                -> phones and the 'low' preset
            The loader maps '/assets/x.jpg' to the right file (src/core/AssetLoader.js).
            Safe to re-run; it replaces assets/ and assets-lite/ wholesale, so anything of ours
            that lives there (Tripo models, for one) belongs in city/models/ instead.

The licence files that have to travel with the code are copied every time. It only ever writes
inside <city dir>.
"""
import pathlib
import re
import shutil
import sys

TEX_QUALITY = 80          # WebP quality for both texture sets
SKIP_ASSET_NAMES = {'preview.png', 'info.json'}      # authoring leftovers the game never loads
ADDON_ENTRIES = [         # every 'three/addons/...' file the game imports (plus what those import)
    'utils/BufferGeometryUtils.js',
    'postprocessing/Pass.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
    'postprocessing/ShaderPass.js', 'postprocessing/OutputPass.js', 'postprocessing/UnrealBloomPass.js',
    'postprocessing/SMAAPass.js', 'postprocessing/GTAOPass.js',
    'loaders/GLTFLoader.js', 'loaders/HDRLoader.js',
    'csm/CSM.js',
    'libs/meshopt_decoder.module.js',
]


def die(msg):
    sys.exit('import-fable: ' + msg)


def patch(path, old, new, count=1):
    s = path.read_text(encoding='utf-8')
    n = s.count(old)
    if n != count:
        die(f'{path}: expected {count} match(es) of {old[:60]!r}, found {n} (upstream moved; update PATCHES)')
    path.write_text(s.replace(old, new), encoding='utf-8')


def copy_addons(three, out):
    """Copy the addon entry files and everything they import relatively."""
    jsm = three / 'examples' / 'jsm'
    todo, seen = list(ADDON_ENTRIES), set()
    rel_import = re.compile(r'''(?:from|import)\s*\(?\s*['"](\.{1,2}/[^'"]+)['"]''')
    while todo:
        rel = todo.pop()
        if rel in seen:
            continue
        seen.add(rel)
        src = jsm / rel
        if not src.is_file():
            die(f'three addon missing: {rel}')
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        for m in rel_import.finditer(src.read_text(encoding='utf-8')):
            target = (src.parent / m.group(1)).resolve()
            try:
                todo.append(str(target.relative_to(jsm.resolve())))
            except ValueError:
                die(f'{rel} imports outside examples/jsm: {m.group(1)}')
    return sorted(seen)


def write_texture(im, dst, scale):
    from PIL import Image
    if scale != 1:
        im = im.resize((max(1, im.width // scale), max(1, im.height // scale)), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, 'WEBP', quality=TEX_QUALITY, method=6)


def import_assets(upstream, city):
    from PIL import Image
    src_root = upstream / 'public' / 'assets'
    full, lite = city / 'assets', city / 'assets-lite'
    for d in (full, lite):
        if d.exists():
            shutil.rmtree(d)
    stats = {'textures': 0, 'copied': 0, 'skipped': 0}
    for p in sorted(src_root.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(src_root)
        if p.name in SKIP_ASSET_NAMES:
            stats['skipped'] += 1
            continue
        # the start screen shows this one with a plain <img>, so it stays a JPEG
        if p.suffix.lower() in ('.jpg', '.jpeg') and rel.parts[0] != 'menu':
            with Image.open(p) as im:
                im = im.convert('RGB')
                write_texture(im, (full / rel).with_suffix('.webp'), 1)
                write_texture(im, (lite / rel).with_suffix('.webp'), 2)
            stats['textures'] += 1
        else:
            dst = full / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, dst)
            stats['copied'] += 1
    return stats


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = {a for a in sys.argv[1:] if a.startswith('--')}
    if len(args) != 3 or not flags & {'--src', '--vendor', '--assets'} or flags - {'--src', '--vendor', '--assets', '--force'}:
        die('usage: import-fable.py <fable-cities checkout> <unpacked three npm package> <city dir> [--src [--force]] [--vendor] [--assets]')
    upstream, three, city = (pathlib.Path(a).resolve() for a in args)
    for must in (upstream / 'src' / 'main.js', three / 'build' / 'three.module.min.js'):
        if not must.is_file():
            die(f'not found: {must}')

    if '--src' in flags:
        import_src(upstream, city, '--force' in flags)
    if '--vendor' in flags:
        addons = import_vendor(three, city)
        print(f'three addons vendored ({len(addons)}): {", ".join(addons)}')
    if '--assets' in flags:
        stats = import_assets(upstream, city)
        print(f'assets: {stats["textures"]} textures converted (2 sizes), {stats["copied"]} files copied, {stats["skipped"]} skipped')
    shutil.copyfile(upstream / 'LICENSE', city / 'LICENSE-fable-cities.txt')
    shutil.copyfile(upstream / 'THIRD-PARTY-NOTICES.md', city / 'THIRD-PARTY-NOTICES.md')


def import_src(upstream, city, force):
    src = city / 'src'
    if src.exists():
        if not force:
            die(f'{src} exists: it is our code now. Re-run with --force only if you mean to replace it.')
        shutil.rmtree(src)
    shutil.copytree(upstream / 'src', src, ignore=shutil.ignore_patterns('tests', '*.mjs'))

    showcases = sorted(p.parent.name for p in src.glob('modules/*/showcase.js'))
    showcase_map = '{\n' + ''.join(f"      './modules/{n}/showcase.js': () => import('./modules/{n}/showcase.js'),\n" for n in showcases) + '    }'
    main_js = src / 'main.js'
    # Vite's import.meta.glob does not exist in a plain module: list the showcase scenes by hand
    patch(main_js, "import.meta.glob('./modules/*/showcase.js')", showcase_map)
    patch(main_js, "import { makeRng } from './shared/random.js';",
          "import { makeRng } from './shared/random.js';\nimport { detectHardware, recommendQuality } from './shared/quality.js';")
    # start at a preset this device can hold (phones get 'low') unless the address pins one
    patch(main_js, "  const config = new Config();\n",
          "  const config = new Config();\n"
          "  if (!config.params.has('quality')) {\n"
          "    try { config.quality = recommendQuality(detectHardware()).name; } catch (_) { /* keep the default preset */ }\n"
          "  }\n")
    # 'low' loads the half-size textures; ?tex=full|lite overrides for testing
    patch(main_js, "  const assets = new AssetLoader(engine.renderer, events);\n",
          "  const assets = new AssetLoader(engine.renderer, events);\n"
          "  assets.textureSet = config.get('tex') === 'full' || config.get('tex') === 'lite'\n"
          "    ? config.get('tex') : (engine.quality.name === 'low' ? 'lite' : 'full');\n")
    # the stylesheet is linked from index.html instead of imported through the bundler
    patch(src / 'modules' / 'ui' / 'index.js', "import './ui.css';\n", "")
    # a plain <img> does not go through the asset loader: make its address relative to the page
    patch(src / 'modules' / 'menu' / 'index.js', 'src="/assets/menu/demo-city.jpg"', 'src="assets/menu/demo-city.jpg"')

    print(f'src: {sum(1 for _ in src.rglob("*.js"))} js files, showcases: {", ".join(showcases)}')


def import_vendor(three, city):
    vendor = city / 'vendor' / 'three'
    if vendor.exists():
        shutil.rmtree(vendor)
    (vendor / 'build').mkdir(parents=True)
    for name in ('three.module.min.js', 'three.core.min.js'):
        shutil.copyfile(three / 'build' / name, vendor / 'build' / name)
    shutil.copyfile(three / 'LICENSE', vendor / 'LICENSE')
    return copy_addons(three, vendor / 'addons')


if __name__ == '__main__':
    main()
