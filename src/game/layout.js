// World plan: island outline, roads, river, zones and the height function.
// x = east, z = south. The camera looks north (-z).
import { Field, catmull, clamp, fbm, lerp, polyNearest, smooth, TAU, polyLength } from './util.js';

export const PLAZA = { x: 0, z: 8, r: 7.5 };
export const SPAWN = { x: 0.6, z: 15.6, yaw: Math.PI / 2 };
export const GUEST_SPOT = { x: 0, z: 12.2 };   // a guest's name stands here, between the fountain and the start
export const FOUNTAIN = { x: 0, z: 8, r: 2.7 }; // yaw 0 = facing -z (north)

// the lap starts/finishes at RING[0] (south-east, clear of the south road crossing)
export const RING_CTRL = [
  [20, 30], [0, 34], [-19, 31], [-33, 19], [-38, 0], [-33, -19], [-19, -32], [0, -37], [19, -33], [33, -21], [39, -2], [35, 17]
];
export const RING = catmull(RING_CTRL, true, 1.0);
export const RING_LEN = polyLength(RING, true);

// southern fun area: a small loop with the giant TV (west), bowling (east), jukebox and the crop circles
export const SOUTH = { x: 0, z: 60, r: 13.5 };
export const TV = { x: -27, z: 55.5 };                       // screen faces south (+z)
export const PARK = { x: -27, z: 66, hw: 6.2, hz: 4.4 };      // drive-in parking in front of the TV
export const JUKE = { x: -16.6, z: 71.4 };
export const KIOSK = { x: -36.2, z: 62.6 };                    // popcorn stand next to the drive-in
export const BOWL = { x0: 15.2, x1: 37.5, z: 60, hw: 1.9 };   // lane along +x, pins at the east end
export const UFO = { x: 0, z: 60, h: 6.6 };                   // hovers low over the crop circles at night
// cinematic shots: where the camera goes and what it looks at (+ lens, half-width that must stay in frame)
export const SHOTS = {
  tv: { pos: [TV.x + 1.6, 6.8, TV.z + 21.5], look: [TV.x - 0.6, 5.2, TV.z], fov: 26, fitW: 6.6 },
  ufo: { pos: [UFO.x + 7, 1.8, UFO.z + 15], look: [UFO.x, 3.9, UFO.z], fov: 36, fitW: 5.5 }
};
// no trees, bushes or rocks here (grass still grows): open views onto the fun places
export const DECOR_CLEAR = [
  { x: UFO.x, z: UFO.z, r: SOUTH.r - 1.2 },                    // crop circles inside the loop
  { x: SHOTS.ufo.pos[0], z: SHOTS.ufo.pos[2], r: 4.5 },          // UFO camera
  { box: true, x: (BOWL.x0 + BOWL.x1) / 2, z: BOWL.z + 5.6, hw: (BOWL.x1 - BOWL.x0) / 2 + 3, hz: 3.4 }, // in front of the bowling lane
  { box: true, x: TV.x + 0.8, z: PARK.z + PARK.hz + 5, hw: 7.5, hz: 5 }                                // between the TV shot camera and the screen
];
export function clearSpot(x, z, pad = 0) {
  for (const c of DECOR_CLEAR) {
    if (c.box) { if (Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hz + pad) return true; }
    else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
  }
  return false;
}
// fun places shown with markers and on the map
export const POIS = [
  { id: 'tv', name: 'Остров ТВ', hint: 'встаньте на парковку', lbl: 'l', t: [PARK.x, PARK.z - 1.5], mk: [PARK.x, PARK.z + 0.6, 1.4], go: [PARK.x, PARK.z + 1.5, 0] },
  { id: 'bowl', name: 'Боулинг', hint: 'разгонитесь по дорожке', t: [BOWL.x0 + 3, BOWL.z], mk: [BOWL.x0 + 2.4, BOWL.z - BOWL.hw - 1.1, 1.7], go: [BOWL.x0 + 1.2, BOWL.z, -Math.PI / 2] },
  { id: 'juke', name: 'Музыка', hint: 'посигнальте рядом', lbl: 'r', t: [JUKE.x, JUKE.z], mk: [JUKE.x, JUKE.z, 3.5], go: [JUKE.x, JUKE.z + 3.4, 0] }
];
const LOOP = [];
for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI * 2, r = SOUTH.r + (k % 2 ? 0.7 : 0); LOOP.push([SOUTH.x + Math.cos(a) * r, SOUTH.z + Math.sin(a) * r]); }

export const ROADS = [
  { pts: catmull([[0, 4], [0, 20], [0.3, 34], [0.2, 40.5], [0, SOUTH.z - SOUTH.r]], false, 1), w: 4.4 }, // plaza -> south loop
  { pts: catmull([[0, 6], [0, -10], [-0.4, -24], [-0.2, -37], [0, -47]], false, 1), w: 4.4 }, // plaza -> lighthouse
  { pts: RING, w: 4.8, closed: true },
  { pts: catmull(LOOP, true, 1), w: 4.6, closed: true },
  { pts: catmull([[-13.2, 61.5], [-17.2, 63.6], [-20.8, 64.6]], false, 0.8), w: 4.2 }   // loop -> drive-in
];
export const LIGHTHOUSE = { x: 0, z: -54, plaza: 6.2 };

export const POND = { x: -19, z: -15, r: 4.6 };
export const RIVER_CTRL = [[-15.5, -16.5], [-8, -19], [1, -20.5], [11, -19], [21, -21], [29, -25.5], [38, -28.5], [49, -31], [62, -34], [74, -37]];
export const RIVER = catmull(RIVER_CTRL, false, 0.8);
export const RIVER_W = 2.7;   // half width of water
export const WATER_Y = -0.42;

// Locations. t = trigger centre (ring), title = 3D title anchor, keep = keep-out circles for decor [x, z, r]
export const ZONES = [
  { id: 'vpn', name: 'STEOVPN', sub: 'бот и мини-приложение', color: 0x5BE3C8, t: [-44.5, -6], r: 4.3, title: [-44.5, -12.2, 0],
    keep: [[-55, -12.5, 4.6], [-51.2, -6.6, 3.6], [-44.5, -12.2, 3.6]] },
  { id: 'steps', name: 'Как работаю', sub: 'четыре шага', color: 0xFFC857, t: [-40.5, 15], r: 4.3, title: [-45.3, 9.4, 0],
    keep: [[-50.6, 15.2, 6.4], [-45.3, 9.4, 4.6]] },
  { id: 'about', name: 'Обо мне', sub: 'домик у костра', color: 0xFF9F6B, t: [-25.5, -38], r: 4.3, title: [-24.5, -44.2, 0],
    keep: [[-33.5, -47.5, 5], [-30.2, -40.4, 2.8], [-24.5, -44.2, 3.6]] },
  { id: 'contact', name: 'Маяк', sub: 'контакты', color: 0xFF4FA0, t: [0, -51.5], r: 4.3, title: [-8.2, -56.2, 0.35],
    keep: [[0, -59.2, 3.8], [6.2, -58.6, 3], [5.2, -51, 1.4], [-8.2, -56.2, 3]] },
  { id: 'proxy', name: 'SProxy', sub: 'бот с прокси', color: 0x7FB7FF, t: [25, -39.5], r: 4.3, title: [24.6, -45.6, 0],
    keep: [[31.5, -48, 3.6], [26.5, -50.5, 2.6], [24.6, -45.6, 3]] },
  { id: 'dt', name: 'Слой', sub: 'концепт детейлинга', color: 0xC9B6FF, t: [46, -1], r: 4.3, title: [46, -6.9, 0],
    keep: [[55.5, -3.5, 5.6], [51.2, -11.2, 3], [46, -6.9, 2.6]] },
  { id: 'auto', name: 'Ключ на 10', sub: 'концепт автосервиса', color: 0xFF8A3D, t: [40, 23.5], r: 4.3, title: [44.2, 17.9, 0],
    keep: [[50.5, 28.5, 5.6], [44.2, 17.9, 3.8], [44, 33, 3]] },
  { id: 'salon', name: 'Миндаль', sub: 'концепт салона красоты', color: 0xF08FA6, t: [17.5, 41.8], r: 4.3, title: [19, 36.4, 0],
    keep: [[26, 39.8, 5.8], [11.6, 43.4, 2.6], [19, 36.4, 3.8]] }
];
export const ZONE = Object.fromEntries(ZONES.map(z => [z.id, z]));
export const SIGN = { x: 9.4, z: 9.6 };
export const PLAZA_TITLE = [7.6, 0.4, -0.36];

// stylised low-poly peaks along the back rim (x, z, base radius, height, snow cap)
export const MOUNTAINS = [
  { x: -45, z: -28.5, r: 8.5, h: 16, snow: true }, { x: -42, z: -38.5, r: 6.5, h: 10.5, snow: true },
  { x: -55.3, z: -24.2, r: 5.2, h: 9 }, { x: -57.5, z: 1.5, r: 5.5, h: 9 },
  { x: 53.3, z: -20.6, r: 6.2, h: 12, snow: true }, { x: 46, z: -17.5, r: 4, h: 6 },
  { x: -18, z: -55, r: 6, h: 10, snow: true }
];
export const PITCH = { x: 17, z: 16, hw: 7.5, hz: 4.6 };      // football pitch (inside the ring, south east)
export const DOMINO = { x: -18, z: 19.5 };
export const RAMPS = [
  { x: -6.5, z: -10.2, yaw: 0, len: 4.6, w: 3.6, h: 1.9 },     // jump over the river (heading north)
  { x: 24, z: 4, yaw: -Math.PI / 2, len: 4.6, w: 3.4, h: 1.0 }  // fun ramp next to the pitch (heading east)
];

// ---------- distance fields ----------
const FMIN = -90, FMAX = 90, FRES = 0.5;
export const roadD = new Field(FMIN, FMAX, FRES);
export const riverD = new Field(FMIN, FMAX, FRES);
export const featD = new Field(FMIN, FMAX, FRES);
for (const r of ROADS) roadD.segments(r.pts, !!r.closed, 14);
roadD.circle(PLAZA.x, PLAZA.z, PLAZA.r - 2.3, 14);
roadD.circle(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.plaza - 2.3, 14);
riverD.segments(RIVER, false, 14);
riverD.circle(POND.x, POND.z, POND.r - RIVER_W, 14);
featD.circle(PLAZA.x, PLAZA.z, PLAZA.r, 16);
featD.circle(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.plaza, 16);
for (const z of ZONES) { featD.circle(z.t[0], z.t[1], z.r, 16); for (const k of z.keep) featD.circle(k[0], k[1], k[2], 16); }
featD.circle(SIGN.x, SIGN.z, 1.6, 16); featD.circle(PLAZA_TITLE[0], PLAZA_TITLE[1], 4.6, 16);
featD.box(PITCH.x, PITCH.z, PITCH.hw + 1, PITCH.hz + 1, 0, 16);
featD.box(DOMINO.x, DOMINO.z, 8.6, 3.6, 0, 16);
for (const r of RAMPS) featD.circle(r.x, r.z, r.len * 0.6 + 2, 16);
// clear run-ups to the ramps (they read as dirt tracks)
featD.box(-6.5, -3.2, 2.0, 4.6, 0, 16);
featD.box(17.5, 4, 4.2, 1.9, 0, 16);
// southern area
featD.box(TV.x, TV.z, 6.8, 2.6, 0, 16);
featD.box(PARK.x, PARK.z, PARK.hw + 0.5, PARK.hz + 0.5, 0, 16);
featD.circle(JUKE.x, JUKE.z, 1.6, 16);
featD.circle(KIOSK.x, KIOSK.z, 1.9, 16);
featD.box((BOWL.x0 + BOWL.x1) / 2, BOWL.z, (BOWL.x1 - BOWL.x0) / 2 + 1.4, BOWL.hw + 1.4, 0, 16);
for (const m of MOUNTAINS) featD.circle(m.x, m.z, m.r * 0.78, 16);

// ---------- island outline (auto-fit around the features) ----------
const NA = 720;
const RTAB = new Float32Array(NA + 1);
(function fitOutline() {
  const req = new Float32Array(NA).fill(0);
  const need = (x, z, rad) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const half = Math.atan2(rad + 3, Math.max(r, 1)) + 0.05;
    const i0 = Math.floor((a - half) / TAU * NA), i1 = Math.ceil((a + half) / TAU * NA);
    for (let i = i0; i <= i1; i++) { const k = ((i % NA) + NA) % NA; req[k] = Math.max(req[k], r + rad); }
  };
  for (const p of RING) need(p[0], p[1], 9.5);
  for (const r of ROADS) for (const p of r.pts) need(p[0], p[1], 8);
  need(LIGHTHOUSE.x, LIGHTHOUSE.z - 3, 10);
  for (const z of ZONES) { need(z.t[0], z.t[1], 9); for (const k of z.keep) need(k[0], k[1], k[2] + 6.5); }
  need(TV.x, TV.z, 10); need(PARK.x, PARK.z + 2, 9); need(JUKE.x, JUKE.z, 6); need(KIOSK.x, KIOSK.z, 6);
  need(BOWL.x1, BOWL.z, 7); need((BOWL.x0 + BOWL.x1) / 2, BOWL.z, 7);
  const base = new Float32Array(NA);
  for (let i = 0; i < NA; i++) {
    const a = i / NA * TAU;
    base[i] = Math.max(req[i], 46 + 2.4 * Math.sin(3 * a + 1.3) + 1.6 * Math.sin(5 * a + 0.4));
  }
  // blur (circular) twice for soft promontories
  let cur = base;
  for (let pass = 0; pass < 3; pass++) {
    const nxt = new Float32Array(NA), K = 14;
    for (let i = 0; i < NA; i++) {
      let s = 0, w = 0;
      for (let k = -K; k <= K; k++) { const ww = Math.exp(-(k * k) / (K * K * 0.35)); s += cur[((i + k) % NA + NA) % NA] * ww; w += ww; }
      nxt[i] = Math.max(s / w, req[i] * 0.985);
    }
    cur = nxt;
  }
  for (let i = 0; i < NA; i++) {
    const a = i / NA * TAU;
    RTAB[i] = cur[i] + 0.9 * Math.sin(11 * a + 0.7) + 0.5 * Math.sin(17 * a + 2.1);
  }
  RTAB[NA] = RTAB[0];
})();
export function islandR(a) {
  let f = (a / TAU) * NA;
  f = ((f % NA) + NA) % NA;
  const i = Math.floor(f);
  return lerp(RTAB[i], RTAB[i + 1], f - i);
}
export function inside(x, z, margin = 0) { return Math.hypot(x, z) < islandR(Math.atan2(z, x)) - margin; }
export function edgeDist(x, z) { return islandR(Math.atan2(z, x)) - Math.hypot(x, z); }

// where the river leaves the island (waterfall)
export const FALL = (function () {
  for (let i = 1; i < RIVER.length; i++) {
    const p = RIVER[i];
    if (!inside(p[0], p[1], 0)) {
      const q = RIVER[i - 1];
      let lo = 0, hi = 1;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (inside(lerp(q[0], p[0], m), lerp(q[1], p[1], m), 0)) lo = m; else hi = m; }
      const x = lerp(q[0], p[0], lo), z = lerp(q[1], p[1], lo);
      const dx = p[0] - q[0], dz = p[1] - q[1], L = Math.hypot(dx, dz);
      return { x, z, dx: dx / L, dz: dz / L, i };
    }
  }
  return null;
})();

// ---------- height ----------
const HILL_K = 0.034;
export function hillAt(x, z) {
  const n = fbm(x * HILL_K + 3.1, z * HILL_K - 1.7, 4);
  const m = fbm(x * 0.09 - 4.2, z * 0.09 + 6.3, 2);
  // rounder, taller mounds in the north half of the island
  const north = smooth(10, -30, z) * 0.6 + 0.4;
  return (smooth(-0.12, 0.55, n) * 4.2 + smooth(0.3, 0.9, n) * 2.2) * north + Math.max(0, m) * 0.9;
}
export function riverBed(d) {
  // d = distance to the river centreline (or pond rim)
  const inner = RIVER_W - 0.6, outer = RIVER_W + 2.6;
  if (d >= outer) return 0;
  if (d <= inner) return -1.75;
  const t = (d - inner) / (outer - inner);
  return -1.75 * (1 - t * t * (3 - 2 * t));
}
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const Rb = islandR(Math.atan2(z, x));
  const e = Rb - r;
  if (e < -0.6) return -60;
  const dRoad = roadD.get(x, z), dRiv = riverD.get(x, z), dFeat = featD.get(x, z);
  const mask = smooth(3.0, 9, dRoad) * smooth(2.5, 8, dFeat) * smooth(3.5, 8, dRiv) * smooth(0.8, 7, e) * smooth(9, 13, Math.hypot(x - UFO.x, z - UFO.z));
  let h = hillAt(x, z) * mask;
  // gentle shoulder near the rim
  h -= (1 - smooth(0, 2.2, e)) * 0.35;
  const bed = riverBed(dRiv);
  if (bed < 0) h = Math.min(h, 0) * smooth(RIVER_W + 1.5, RIVER_W + 4, dRiv) + bed;
  return h;
}

// how much grass grows here (0..1): none on paths, plaza, pads, banks, under buildings or on the rim
export function grassAt(x, z) {
  const e = edgeDist(x, z);
  if (e < 0.4) return 0;
  const dR = roadD.get(x, z), dRiv = riverD.get(x, z), dF = featD.get(x, z);
  let g = smooth(2.45, 3.3, dR) * smooth(RIVER_W + 1.9, RIVER_W + 2.9, dRiv) * smooth(0.1, 1.1, dF) * smooth(0.4, 1.2, e);
  g *= smooth(LIGHTHOUSE.plaza + 0.2, LIGHTHOUSE.plaza + 1.0, Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z));
  g *= smooth(PLAZA.r + 0.2, PLAZA.r + 1.0, Math.hypot(x - PLAZA.x, z - PLAZA.z));
  // crop circles inside the southern loop
  const dc = Math.hypot(x - UFO.x, z - UFO.z);
  if (dc < 10.5 && g > 0) {
    const ring = (d, r, w) => 1 - smooth(w * 0.55, w, Math.abs(d - r));
    let cut = Math.max(ring(dc, 2.6, 0.5), ring(dc, 5.6, 0.55), 1 - smooth(0.9, 1.3, dc));
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + 0.35, cx = UFO.x + Math.cos(a) * 8.3, cz = UFO.z + Math.sin(a) * 8.3;
      const ds = Math.hypot(x - cx, z - cz);
      cut = Math.max(cut, 1 - smooth(0.75, 1.1, ds));
      // thin path from the outer ring to each satellite
      const ux = Math.cos(a), uz = Math.sin(a), along = (x - UFO.x) * ux + (z - UFO.z) * uz, perp = Math.abs(-(x - UFO.x) * uz + (z - UFO.z) * ux);
      if (along > 5.6 && along < 8.3) cut = Math.max(cut, 1 - smooth(0.16, 0.3, perp));
    }
    g *= 1 - cut;
  }
  return g;
}

// nearest road point (for respawn)
export function nearestRoad(x, z) {
  let best = null;
  for (const r of ROADS) {
    const n = polyNearest(r.pts, x, z, !!r.closed);
    if (!best || n.d < best.d) {
      const pts = r.pts, i = n.i, j = (i + 1) % pts.length;
      best = { ...n, dx: pts[j][0] - pts[i][0], dz: pts[j][1] - pts[i][1] };
    }
  }
  return best;
}

// bridges where roads cross the river
export const BRIDGES = (function () {
  const out = [];
  for (const r of ROADS) {
    const pts = r.pts, n = pts.length - (r.closed ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      for (let k = 0; k < RIVER.length - 1; k++) {
        const c = RIVER[k], d = RIVER[k + 1];
        const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
        const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
          if (out.some(o => Math.hypot(o.x - x, o.z - z) < 4)) continue;
          // road direction averaged over a few points
          const p0 = pts[Math.max(0, i - 3)], p1 = pts[Math.min(pts.length - 1, i + 4)];
          const yaw = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
          const rx = d[0] - c[0], rz = d[1] - c[1], rl = Math.hypot(rx, rz);
          const sinA = Math.abs(((b[0] - a[0]) * rz - (b[1] - a[1]) * rx) / (Math.hypot(b[0] - a[0], b[1] - a[1]) * rl));
          const len = (RIVER_W + 3.4) * 2 / Math.max(0.55, sinA);
          out.push({ x, z, yaw, len, w: r.w + 0.8 });
        }
      }
    }
  }
  return out;
})();
export const DECK_Y = 0.26;
