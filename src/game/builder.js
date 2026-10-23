import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// matrix from position / rotation (euler xyz in radians) / scale
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
export function Tmul(a, b) { return new THREE.Matrix4().multiplyMatrices(a, b); }

// Accumulates transformed, coloured geometry into one mesh-friendly BufferGeometry.
export class Builder {
  constructor(opts = {}) {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    this.sway = opts.sway ? [] : null;
    this.tree = opts.tree ? [] : null;
    this.uv = opts.uv ? [] : null;
    this.n = 0;
  }
  // color: [r,g,b] (linear) or fn(wx, wy, wz, lx, ly, lz) -> [r,g,b]
  // o.sway: number or fn(lx, ly, lz) ; o.tree: id
  add(geo, m, color, o = {}) {
    const p = geo.attributes.position, nr = geo.attributes.normal, uv = geo.attributes.uv;
    _nm.getNormalMatrix(m);
    const base = this.n, fn = typeof color === 'function';
    const own = color === null ? geo.attributes.color : null;
    const sw = o.sway, swf = typeof sw === 'function';
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
      _v.set(lx, ly, lz).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (nr) { _n.set(nr.getX(i), nr.getY(i), nr.getZ(i)).applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z); }
      else this.nor.push(0, 1, 0);
      if (own) this.col.push(own.getX(i), own.getY(i), own.getZ(i));
      else { const c = fn ? color(_v.x, _v.y, _v.z, lx, ly, lz, nr ? nr.getX(i) : 0, nr ? nr.getY(i) : 1, nr ? nr.getZ(i) : 0) : color; this.col.push(c[0], c[1], c[2]); }
      if (this.sway) this.sway.push(sw === undefined ? 0 : swf ? sw(lx, ly, lz) : sw);
      if (this.tree) this.tree.push(o.tree === undefined ? -1 : o.tree);
      if (this.uv) this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) this.idx.push(base + ix[i]); }
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.n += p.count;
    return this;
  }
  // raw triangle soup helpers
  vert(x, y, z, nx, ny, nz, c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(c[0], c[1], c[2]);
    if (this.sway) this.sway.push(0); if (this.tree) this.tree.push(-1); if (this.uv) this.uv.push(0, 0);
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.sway) g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    if (this.tree) g.setAttribute('aTree', new THREE.Float32BufferAttribute(this.tree, 1));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  get empty() { return this.n === 0; }
}

export function mesh(geo, mat, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  m.matrixAutoUpdate = false; m.updateMatrix();
  if (name) m.name = name;
  return m;
}

// Spatially chunked builder: geometry is routed into grid cells by its transform origin,
// so every cell becomes its own mesh that can be frustum-culled (camera and shadow pass).
export class Chunked {
  constructor(opts = {}, cell = 30) { this.opts = opts; this.cell = cell; this.map = new Map(); }
  _b(x, z) {
    const k = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell);
    let b = this.map.get(k);
    if (!b) { b = new Builder(this.opts); this.map.set(k, b); }
    return b;
  }
  add(geo, m, color, o) { const e = m.elements; this._b(e[12], e[14]).add(geo, m, color, o); return this; }
  meshes(mat, { cast = true, receive = true, name } = {}) {
    const out = [];
    for (const b of this.map.values()) {
      if (b.empty) continue;
      const me = new THREE.Mesh(b.build(), mat);
      me.castShadow = cast; me.receiveShadow = receive;
      me.matrixAutoUpdate = false; me.updateMatrix();
      if (name) me.name = name;
      out.push(me);
    }
    return out;
  }
}

// split an indexed geometry into grid tiles by triangle centroid (for culling big static meshes)
export function splitByCell(geo, cell = 30) {
  const P = geo.attributes.position, I = geo.index.array, attrs = Object.keys(geo.attributes);
  const groups = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const cx = (P.getX(a) + P.getX(b) + P.getX(c)) / 3, cz = (P.getZ(a) + P.getZ(b) + P.getZ(c)) / 3;
    const k = Math.floor(cx / cell) + ',' + Math.floor(cz / cell);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a, b, c);
  }
  const out = [];
  for (const idx of groups.values()) {
    const remap = new Map(), nidx = [];
    for (const v of idx) { if (!remap.has(v)) remap.set(v, remap.size); nidx.push(remap.get(v)); }
    const g = new THREE.BufferGeometry();
    for (const name of attrs) {
      const src = geo.attributes[name], n = src.itemSize, arr = new Float32Array(remap.size * n);
      for (const [o, i] of remap) for (let k = 0; k < n; k++) arr[i * n + k] = src.array[o * n + k];
      g.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    g.setIndex(remap.size > 65535 ? new THREE.Uint32BufferAttribute(nidx, 1) : new THREE.Uint16BufferAttribute(nidx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    out.push(g);
  }
  return out;
}
