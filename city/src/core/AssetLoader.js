import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Cached asset loading. Callers name every file as '/assets/…' (e.g. assets.loadTexture('/assets/shared/grass/albedo.jpg'))
 * and `resolve()` turns that into the file that is really on the server:
 *   - the game is served from a sub-folder (GitHub Pages: /BDB/city/), so the path is taken relative to the page;
 *   - textures are named .jpg in the code and in the glTF files, and ship as .webp;
 *   - `textureSet` picks the folder: 'full' → assets/ (1024 px), 'lite' → assets-lite/ (512 px, phones and the 'low' preset).
 * The rule sits on the LoadingManager, so it also covers the textures and buffers a glTF pulls in by itself.
 * Models may be meshopt-compressed (the rest of this site ships them that way); nothing here needs a network decoder.
 */
export class AssetLoader {
  constructor(renderer, events) {
    this.renderer = renderer;
    this.events = events;
    this.textureSet = 'full';
    this.manager = new THREE.LoadingManager();
    this.manager.setURLModifier((url) => this.resolve(url));
    this.manager.onProgress = (url, loaded, total) => events?.emit('assets:progress', { url, loaded, total });
    this.manager.onError = (url) => console.warn('[assets] failed to load', url);
    this.textureLoader = new THREE.TextureLoader(this.manager);
    this.gltfLoader = new GLTFLoader(this.manager);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    this.hdrLoader = new HDRLoader(this.manager);
    this.cache = new Map();
    this.maxAnisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  }

  /** '/assets/…' as written in the code → the address of the file to fetch. Anything else passes through untouched. */
  resolve(url) {
    if (typeof url !== 'string' || !url.startsWith('/assets/')) return url;
    let rel = url.slice(1);
    if (/\.jpe?g$/i.test(rel)) {
      rel = rel.replace(/\.jpe?g$/i, '.webp');
      if (this.textureSet === 'lite') rel = 'assets-lite/' + rel.slice('assets/'.length);
    }
    return new URL(rel, document.baseURI).href;
  }

  /**
   * @param {string} url
   * @param {{srgb?:boolean, repeat?:[number,number]|number, anisotropy?:number, flipY?:boolean, wrap?:THREE.Wrapping}} opts
   */
  loadTexture(url, opts = {}) {
    const key = 'tex:' + url + JSON.stringify(opts);
    if (this.cache.has(key)) return this.cache.get(key);
    const p = new Promise((resolve, reject) => {
      this.textureLoader.load(url, (tex) => {
        tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = opts.wrap ?? THREE.RepeatWrapping;
        if (opts.repeat != null) {
          const r = Array.isArray(opts.repeat) ? opts.repeat : [opts.repeat, opts.repeat];
          tex.repeat.set(r[0], r[1]);
        }
        tex.anisotropy = opts.anisotropy ?? this.maxAnisotropy;
        if (opts.flipY != null) tex.flipY = opts.flipY;
        tex.needsUpdate = true;
        resolve(tex);
      }, undefined, reject);
    });
    this.cache.set(key, p);
    return p;
  }

  /**
   * Load a PBR texture set. `files` maps material slots to URLs:
   * { map, normalMap, roughnessMap, metalnessMap, aoMap, displacementMap, emissiveMap, alphaMap }
   * Returns an object with loaded textures (missing entries are omitted).
   */
  async loadPBR(files, opts = {}) {
    const entries = Object.entries(files).filter(([, url]) => !!url);
    const results = await Promise.all(entries.map(([slot, url]) => this.loadTexture(url, { ...opts, srgb: slot === 'map' || slot === 'emissiveMap' }).catch(() => null)));
    const out = {};
    entries.forEach(([slot], i) => { if (results[i]) out[slot] = results[i]; });
    return out;
  }

  loadGLTF(url) {
    const key = 'gltf:' + url;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = new Promise((resolve, reject) => this.gltfLoader.load(url, resolve, undefined, reject));
    this.cache.set(key, p);
    return p;
  }

  /** Load an equirectangular .hdr. Returns the raw texture (mapping set to equirect). */
  loadHDR(url) {
    const key = 'hdr:' + url;
    if (this.cache.has(key)) return this.cache.get(key);
    // .exr was supported upstream; nothing shipped uses it, and its loader is not vendored here
    if (url.toLowerCase().endsWith('.exr')) return Promise.reject(new Error(`[assets] .exr is not supported here, convert to .hdr: ${url}`));
    const loader = this.hdrLoader;
    const p = new Promise((resolve, reject) => loader.load(url, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      resolve(tex);
    }, undefined, reject));
    this.cache.set(key, p);
    return p;
  }

  /** Build a PMREM environment map from an equirect texture or a scene. */
  pmrem(source) {
    if (!this._pmrem) this._pmrem = new THREE.PMREMGenerator(this.renderer);
    if (source.isScene) return this._pmrem.fromScene(source, 0, 0.1, 5000).texture;
    return this._pmrem.fromEquirectangular(source).texture;
  }

  async fetchJSON(url) {
    const res = await fetch(this.resolve(url));
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    return res.json();
  }
}
