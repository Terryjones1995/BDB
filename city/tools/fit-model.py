#!/usr/bin/env python3
"""Shrink a raw Tripo export into a web-sized model for city/models/.

    python3 city/tools/fit-model.py <raw.glb> <city/models/name.glb> [--tris 8000] [--tex 1024]

A raw Tripo .glb is 1-45 MB: up to two million triangles and 2048 px textures. This cuts it to a
target triangle count, resizes the textures and stores them as WebP, and meshopt-compresses the
geometry, which is what the game's loader expects (src/core/AssetLoader.js sets the decoder).
The bus went from 8.5 MB / 190,217 triangles to 274 KB / 8,550 with no visible change.

It refuses a model the game could not use anyway:
  - no texture   (exported before Tripo's texture step: it would render plain grey)
  - a skeleton   (generated with Pose on: a T-posed character, or a vehicle with arms)

Needs the glTF-Transform command line tool. Point GLTF_TRANSFORM at it, or have it on PATH:
    npm install @gltf-transform/cli        # then GLTF_TRANSFORM=node_modules/.bin/gltf-transform
Afterwards look at the result: tools/modelshot renders a four-view sheet (see tools/README.md).
"""
import json
import os
import pathlib
import shutil
import struct
import subprocess
import sys


def read_glb(path):
    data = pathlib.Path(path).read_bytes()
    magic, _, length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF':
        sys.exit(f'fit-model: {path} is not a .glb file')
    off = 12
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off)
        if ctype == b'JSON':
            return json.loads(data[off + 8: off + 8 + clen]), len(data)
        off += 8 + clen
    sys.exit(f'fit-model: {path} has no JSON chunk')


def summary(path):
    j, size = read_glb(path)
    acc = j.get('accessors', [])
    tris = 0
    for m in j.get('meshes', []):
        for p in m['primitives']:
            count = acc[p['indices']]['count'] if 'indices' in p else acc[p['attributes']['POSITION']]['count']
            tris += count // 3
    textured = any('baseColorTexture' in m.get('pbrMetallicRoughness', {}) for m in j.get('materials', []))
    return {'size': size, 'tris': tris, 'textured': textured, 'skins': len(j.get('skins', [])), 'images': len(j.get('images', []))}


def main():
    args = sys.argv[1:]
    opts = {'--tris': 8000, '--tex': 1024}
    pos = []
    i = 0
    while i < len(args):
        if args[i] in opts:
            opts[args[i]] = int(args[i + 1])
            i += 2
        else:
            pos.append(args[i])
            i += 1
    if len(pos) != 2:
        sys.exit('usage: fit-model.py <raw.glb> <out.glb> [--tris 8000] [--tex 1024]')
    raw, out = pos
    tool = os.environ.get('GLTF_TRANSFORM') or shutil.which('gltf-transform')
    if not tool:
        sys.exit('fit-model: glTF-Transform not found. npm install @gltf-transform/cli, then set GLTF_TRANSFORM to its path.')

    before = summary(raw)
    if not before['textured']:
        sys.exit(f'fit-model: {raw} has no texture ({before["tris"]:,} triangles of bare geometry). '
                 'It was exported before Tripo\'s texture step. Texture it there and export again.')
    if before['skins']:
        sys.exit(f'fit-model: {raw} has a skeleton. It was generated with Pose on. Regenerate with Pose off.')

    ratio = min(1.0, opts['--tris'] / max(1, before['tris']))
    pathlib.Path(out).parent.mkdir(parents=True, exist_ok=True)
    cmd = [tool, 'optimize', raw, out,
           '--simplify-ratio', f'{ratio:.5f}', '--simplify-error', '0.004',
           '--texture-size', str(opts['--tex']), '--texture-compress', 'webp',
           '--compress', 'meshopt']
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0 or not pathlib.Path(out).is_file():
        sys.exit('fit-model: glTF-Transform failed:\n' + (done.stderr or done.stdout)[-1500:])

    after = summary(out)
    kb = lambda n: f'{n / 1024:,.0f} KB'
    print(f'{pathlib.Path(raw).name}: {kb(before["size"])}, {before["tris"]:,} triangles, {before["images"]} texture(s)')
    print(f'{pathlib.Path(out).name}: {kb(after["size"])}, {after["tris"]:,} triangles, {after["images"]} texture(s) at up to {opts["--tex"]} px')
    if after['tris'] > opts['--tris'] * 1.5:
        print(f'note: asked for about {opts["--tris"]:,} triangles and stopped at {after["tris"]:,}; the simplifier would not go lower without '
              'visibly changing the shape. Fine for one model; look at it before making it a common street prop.')


if __name__ == '__main__':
    main()
