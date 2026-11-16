"""Summarise a .glb: geometry, materials, textures, rig, size and orientation. Usage: glbinfo.py file.glb [...]"""
import sys, json, struct, io
def info(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF': print(path, 'is not a GLB'); return
    off = 12; j = None; bin_chunk = b''
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off); body = data[off + 8: off + 8 + clen]; off += 8 + clen
        if ctype == b'JSON': j = json.loads(body)
        elif ctype == b'BIN\x00': bin_chunk = body
    acc = j.get('accessors', [])
    tris = verts = prims = 0; lo = [1e30] * 3; hi = [-1e30] * 3; attrs = set()
    for m in j.get('meshes', []):
        for p in m['primitives']:
            prims += 1; attrs |= set(p['attributes'])
            a = acc[p['attributes']['POSITION']]; verts += a['count']
            if 'min' in a:
                lo = [min(lo[i], a['min'][i]) for i in range(3)]; hi = [max(hi[i], a['max'][i]) for i in range(3)]
            tris += (acc[p['indices']]['count'] if 'indices' in p else a['count']) // 3
    size = [hi[i] - lo[i] for i in range(3)]
    print(f"== {path.split('/')[-1]}  {len(data)/1048576:.2f} MB  glTF {ver}  generator: {j.get('asset', {}).get('generator')}")
    print(f"   meshes {len(j.get('meshes', []))}, primitives {prims}, triangles {tris:,}, vertices {verts:,}, attributes {sorted(attrs)}")
    print(f"   nodes {len(j.get('nodes', []))}: {[n.get('name') for n in j.get('nodes', [])][:12]}")
    print(f"   skins {len(j.get('skins', []))}, animations {len(j.get('animations', []))}, extensions {j.get('extensionsUsed')}")
    print(f"   size (local, before node transforms)  x {size[0]:.3f}  y {size[1]:.3f}  z {size[2]:.3f}   min {['%.3f' % v for v in lo]}  max {['%.3f' % v for v in hi]}")
    for n in j.get('nodes', []):
        t = {k: n[k] for k in ('translation', 'rotation', 'scale', 'matrix') if k in n}
        if t: print(f"   node '{n.get('name')}' transform: {t}")
    for i, m in enumerate(j.get('materials', [])):
        pbr = m.get('pbrMetallicRoughness', {})
        maps = [k for k in ('baseColorTexture', 'metallicRoughnessTexture') if k in pbr] + [k for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture') if k in m]
        print(f"   material {i} '{m.get('name')}': maps {maps}, baseColorFactor {pbr.get('baseColorFactor')}, metallic {pbr.get('metallicFactor')}, roughness {pbr.get('roughnessFactor')}, alphaMode {m.get('alphaMode')}, doubleSided {m.get('doubleSided')}")
    try:
        from PIL import Image
    except Exception:
        Image = None
    for i, im in enumerate(j.get('images', [])):
        desc = f"   image {i}: {im.get('mimeType') or im.get('uri')}"
        if 'bufferView' in im:
            bv = j['bufferViews'][im['bufferView']]; raw = bin_chunk[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
            desc += f", {len(raw)/1024:.0f} KB"
            if Image:
                try:
                    with Image.open(io.BytesIO(raw)) as pim: desc += f", {pim.size[0]}x{pim.size[1]} {pim.mode}"
                except Exception as e: desc += f" (unreadable: {e})"
        print(desc)
    geo = sum(bv['byteLength'] for k, bv in enumerate(j.get('bufferViews', [])) if not any(im.get('bufferView') == k for im in j.get('images', [])))
    print(f"   geometry data {geo/1024:.0f} KB, the rest is textures")
for p in sys.argv[1:]: info(p)
