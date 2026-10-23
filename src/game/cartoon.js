// «Уточка и джип» — a 30-second original cartoon drawn on a canvas and shown on the giant TV.
import * as THREE from 'three';

const W = 480, H = 360, LEN = 30;
const FONT = "'Amatic SC', 'Sofia Sans Extra Condensed', 'Arial Narrow', sans-serif";
const EVENTS = [[9.4, 'quack'], [12.9, 'boing'], [14.55, 'thud'], [15.2, 'quack'], [21.6, 'pop'], [22.7, 'pop'], [23.8, 'pop'], [24.9, 'pop'], [26.2, 'iris'], [28.2, 'end']];

const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, t) => a + (b - a) * t;
function mixHex(a, b, t) {
  const pa = [a >> 16 & 255, a >> 8 & 255, a & 255], pb = [b >> 16 & 255, b >> 8 & 255, b & 255];
  return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

export class Cartoon {
  constructor() {
    const c = this.canvas = document.createElement('canvas');
    c.width = W; c.height = H;
    this.g = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.t = 0; this.acc = 1; this.on = 0;
    this.stars = Array.from({ length: 60 }, (_, i) => [((i * 97) % 480), ((i * 53) % 200), (i % 3) + 1]);
    this.sparks = [];
    this.draw();
  }
  restart() { this.t = 0; this.fired = -1; this.sparks.length = 0; }
  // advance; returns names of events crossed this frame
  update(dt, active) {
    const out = [];
    if (!active) return out;
    const prev = this.t;
    this.t = (this.t + dt) % LEN;
    for (const [at, name] of EVENTS) if ((prev < at && this.t >= at) || (this.t < prev && (at > prev || at <= this.t))) out.push(name);
    if (out.includes('pop')) this.firework();
    this.acc += dt;
    if (this.acc >= 1 / 24) { this.acc = 0; this.draw(); this.tex.needsUpdate = true; }
    return out;
  }
  firework() {
    const cx = 120 + Math.random() * 240, cy = 60 + Math.random() * 70, hue = Math.floor(Math.random() * 360);
    for (let k = 0; k < 34; k++) { const a = k / 34 * Math.PI * 2, v = 60 + Math.random() * 30; this.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2, hue }); }
  }

  // ---------- drawing helpers ----------
  sky(top, bottom) { const g = this.g, gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  hills(base, amp, freq, off, color) {
    const g = this.g; g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, base - Math.sin((x + off) * freq) * amp - Math.sin((x + off) * freq * 2.3 + 1.7) * amp * 0.35);
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  cloud(x, y, s, col = '#FFF6EE') {
    const g = this.g; g.fillStyle = col;
    for (const [dx, dy, r] of [[0, 0, 18], [20, -8, 22], [42, 0, 17], [20, 6, 18]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); }
  }
  road(scroll, y = 300) {
    const g = this.g;
    g.fillStyle = '#F59A47'; g.fillRect(0, y - 6, W, H - y + 6);
    g.fillStyle = '#D9823F'; g.fillRect(0, y - 6, W, 5);
    g.fillStyle = '#FFE9C9';
    for (let x = -((scroll % 60) + 60); x < W; x += 60) g.fillRect(x, y + 22, 30, 5);
  }
  jeep(x, y, s, t, moving = true) {
    const g = this.g, bob = moving ? Math.sin(t * 20) * 1.6 * s : 0, wr = t * (moving ? 14 : 0);
    g.save(); g.translate(x, y);
    // shadow
    g.fillStyle = 'rgba(40,20,60,0.25)'; g.beginPath(); g.ellipse(0, 2 * s, 66 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();
    g.translate(0, bob);
    // antenna + flag
    g.strokeStyle = '#2B2340'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(-34 * s, -68 * s); g.lineTo(-40 * s, -100 * s); g.stroke();
    g.fillStyle = '#FF4FA0'; g.beginPath(); g.moveTo(-40 * s, -100 * s); g.lineTo(-58 * s, -95 * s + Math.sin(t * 9) * 2 * s); g.lineTo(-40 * s, -90 * s); g.fill();
    // spare wheel
    g.fillStyle = '#2B2340'; g.beginPath(); g.arc(-62 * s, -36 * s, 12 * s, 0, Math.PI * 2); g.fill();
    // cabin
    g.fillStyle = '#2B2340'; rr(g, -40 * s, -72 * s, 52 * s, 32 * s, 6 * s); g.fill();
    g.fillStyle = '#9FE6FF'; rr(g, -34 * s, -66 * s, 40 * s, 18 * s, 3 * s); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(-24 * s, -50 * s); g.lineTo(-14 * s, -64 * s); g.stroke();
    for (let i = 0; i < 4; i++) { g.fillStyle = '#FFE8A0'; g.fillRect((-32 + i * 12) * s, -78 * s, 7 * s, 5 * s); }
    // body
    g.fillStyle = '#F0397E'; rr(g, -60 * s, -46 * s, 118 * s, 30 * s, 9 * s); g.fill();
    g.fillStyle = '#D02A68'; rr(g, -60 * s, -24 * s, 118 * s, 8 * s, 4 * s); g.fill();
    g.fillStyle = '#FFE8A0'; g.beginPath(); g.arc(53 * s, -36 * s, 5 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2B2340'; rr(g, 40 * s, -44 * s, 6 * s, 16 * s, 2 * s); g.fill();
    // arches + wheels
    for (const wx of [-34, 34]) {
      g.fillStyle = '#2B2340'; g.beginPath(); g.arc(wx * s, -18 * s, 21 * s, Math.PI, 0); g.fill();
      g.save(); g.translate(wx * s, -16 * s); g.rotate(wr);
      g.fillStyle = '#1B1626'; g.beginPath(); g.arc(0, 0, 16 * s, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FF7AB8'; g.beginPath(); g.arc(0, 0, 7 * s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1B1626'; g.lineWidth = 2.4 * s;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 7 * s, Math.sin(a) * 7 * s); g.stroke(); }
      g.restore();
    }
    g.restore();
  }
  duck(x, y, s, t, flap = 0, walk = true) {
    const g = this.g;
    g.save(); g.translate(x, y);
    const step = walk ? Math.sin(t * 16) : 0;
    g.strokeStyle = '#FF8A2A'; g.lineWidth = 3 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-4 * s, -6 * s); g.lineTo(-4 * s + step * 4 * s, 0); g.moveTo(6 * s, -6 * s); g.lineTo(6 * s - step * 4 * s, 0); g.stroke();
    g.fillStyle = '#FFD23F';
    g.beginPath(); g.ellipse(0, -18 * s, 21 * s, 14 * s, -0.1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-18 * s, -22 * s); g.lineTo(-30 * s, -30 * s); g.lineTo(-20 * s, -14 * s); g.fill();
    g.beginPath(); g.arc(14 * s, -36 * s, 11 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FF8A2A'; g.beginPath(); g.moveTo(23 * s, -37 * s); g.lineTo(35 * s, -34 * s); g.lineTo(23 * s, -30 * s); g.fill();
    g.fillStyle = '#1B1626'; g.beginPath(); g.arc(17 * s, -39 * s, 2.4 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(17.8 * s, -39.8 * s, 0.9 * s, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(-2 * s, -20 * s); g.rotate(-0.3 - flap * 0.9);
    g.fillStyle = '#F2BE22'; g.beginPath(); g.ellipse(-6 * s, 0, 12 * s, 6 * s, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    g.restore();
  }
  bubble(x, y, text, s = 1) {
    const g = this.g;
    g.fillStyle = '#fff'; g.strokeStyle = '#1B1626'; g.lineWidth = 3;
    rr(g, x - 34 * s, y - 26 * s, 68 * s, 34 * s, 12 * s); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 8 * s, y + 8 * s); g.lineTo(x - 16 * s, y + 20 * s); g.lineTo(x + 4 * s, y + 8 * s); g.fill();
    g.fillStyle = '#1B1626'; g.font = `700 ${26 * s}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - 9 * s);
  }
  title(text, x, y, size, col = '#fff', outline = '#2B2340') {
    const g = this.g; g.font = `700 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = size * 0.16; g.strokeStyle = outline; g.lineJoin = 'round'; g.strokeText(text, x, y); g.fillStyle = col; g.fillText(text, x, y);
  }

  // ---------- scenes ----------
  draw() {
    const g = this.g, t = this.t;
    g.save();
    if (t < 3) this.sceneTitle(t);
    else if (t < 18) this.sceneDay(t);
    else if (t < 26) this.sceneNight(t);
    else this.sceneEnd(t);
    g.restore();
  }
  sceneTitle(t) {
    const g = this.g;
    g.fillStyle = '#FF7A59'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.rotate(t * 0.4);
    for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? '#FF9A6B' : '#FF6A8E'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 420, k / 16 * Math.PI * 2, (k + 1) / 16 * Math.PI * 2); g.fill(); }
    g.restore();
    const b = 1 + Math.sin(t * 7) * 0.04 * (1 - ease(t / 3));
    g.save(); g.translate(W / 2, 150); g.scale(b, b); this.title('ОСТРОВ ТВ', 0, 0, 86, '#FFF1DC'); g.restore();
    this.title('мультфильм «Уточка и джип»', W / 2, 240, 34, '#fff');
    for (let k = 0; k < 7; k++) { const a = t * 2 + k, x = W / 2 + Math.cos(a) * 190, y = 150 + Math.sin(a * 1.3) * 110; this.star(x, y, 8 + (k % 3) * 3); }
  }
  star(x, y, r, col = '#FFE8A0') {
    const g = this.g; g.fillStyle = col; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr2 = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    g.closePath(); g.fill();
  }
  sceneDay(t) {
    const g = this.g, lt = t - 3, scroll = lt * 150;
    this.sky('#8FD3FF', '#FFE3C4');
    g.fillStyle = '#FFE27A'; g.beginPath(); g.arc(390, 70, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#FFE27A'; g.lineWidth = 4;
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + lt * 0.5; g.beginPath(); g.moveTo(390 + Math.cos(a) * 40, 70 + Math.sin(a) * 40); g.lineTo(390 + Math.cos(a) * 52, 70 + Math.sin(a) * 52); g.stroke(); }
    for (let k = 0; k < 4; k++) { const x = ((k * 170 - scroll * 0.15) % 680 + 680) % 680 - 100; this.cloud(x, 50 + (k % 2) * 40, 0.9 + (k % 3) * 0.2); }
    this.hills(220, 26, 0.012, scroll * 0.3, '#A98BD8');
    this.hills(262, 20, 0.02, scroll * 0.6, '#C9B13A');
    this.road(scroll);
    // river + ramp in the second half
    let jx = 170, jy = 300, flap = Math.sin(lt * 18) * 0.5 + 0.5;
    if (lt > 7.5) {
      const k = lt - 7.5;
      const rampX = 520 - k * 150, riverX = rampX + 70;
      g.fillStyle = '#5BC2B9'; g.fillRect(riverX, 294, 150, H - 294);
      g.fillStyle = '#FFFFFF'; for (let i = 0; i < 6; i++) g.fillRect(riverX + 10 + i * 24, 312 + Math.sin(lt * 6 + i) * 3, 12, 3);
      g.fillStyle = '#8A5A3C'; g.beginPath(); g.moveTo(rampX - 50, 300); g.lineTo(rampX + 10, 270); g.lineTo(rampX + 10, 300); g.fill();
      // jump arc: takes off at lt ~9.9, lands ~11.55
      const j = (lt - 9.9) / 1.65;
      if (j > 0 && j < 1) { jy = 300 - Math.sin(j * Math.PI) * 120 - 30 * (1 - j); flap = 1; this.speedLines(jx, jy); }
      if (j >= 1 && j < 1.5) this.dust(jx - 40, 300, (j - 1) * 2);
      if (j > 0.2 && j < 0.9) this.title('Ух!', jx + 90, jy - 90, 46, '#FFF1DC');
    }
    // the duck chases, then rides on the roof
    const catchUp = ease((lt - 1) / 5);
    if (lt < 6.3) { this.duck(lerp(-60, 120, catchUp), 300, 1, lt, flap * 0.6); this.jeep(jx, jy, 1, lt); }
    else {
      const hop = ease((lt - 6.3) / 0.6);
      this.jeep(jx, jy, 1, lt);
      const dx = lerp(120, jx - 6, hop), dy = lerp(300, jy - 78, hop) - Math.sin(hop * Math.PI) * 40;
      this.duck(dx, dy, 0.95, lt, lt > 6.9 ? flap : 1, lt < 6.3);
      if (lt > 6.4 && lt < 7.6) this.bubble(dx + 40, dy - 70, 'Кря!');
    }
  }
  speedLines(x, y) {
    const g = this.g; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x - 80 - k * 6, y - 30 - k * 10); g.lineTo(x - 130 - k * 12, y - 26 - k * 10); g.stroke(); }
  }
  dust(x, y, k) {
    const g = this.g; g.fillStyle = `rgba(255,236,210,${0.8 * (1 - k)})`;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + i * 14 - 20, y - 6 - k * 18, 10 + k * 14, 0, Math.PI * 2); g.fill(); }
  }
  sceneNight(t) {
    const g = this.g, lt = t - 18, dusk = ease(lt / 2.5);
    const stop = ease(lt / 3.2), scroll = (lt - stop * 1.6) * 150 * (1 - stop) + 1500;
    g.fillStyle = mixHex(0x8FD3FF, 0x161A4A, dusk); g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 150, 0, H); gr.addColorStop(0, 'rgba(255,140,120,0)'); gr.addColorStop(1, `rgba(255,140,150,${0.55 * (1 - dusk * 0.6)})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const [sx, sy, r] of this.stars) { g.globalAlpha = dusk * (0.5 + 0.5 * Math.sin(lt * 3 + sx)); g.fillStyle = '#fff'; g.fillRect(sx, sy, r, r); }
    g.globalAlpha = 1;
    g.fillStyle = mixHex(0xFFE27A, 0xF4F0FF, dusk); g.beginPath(); g.arc(80, 70, 22, 0, Math.PI * 2); g.fill();
    this.hills(225, 26, 0.012, scroll * 0.3, mixHex(0xA98BD8, 0x4A3A88, dusk));
    this.hills(265, 20, 0.02, scroll * 0.6, mixHex(0xC9B13A, 0x5A5A3A, dusk));
    // lighthouse on a hill
    const lx = 400 - (1 - stop) * 80;
    g.fillStyle = mixHex(0xC9B13A, 0x4A4A3A, dusk); g.beginPath(); g.ellipse(lx, 290, 70, 30, 0, Math.PI, 0); g.fill();
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#F0397E' : '#FFF1DC'; g.fillRect(lx - 14 + i * 0.6, 270 - (i + 1) * 26, 28 - i * 1.2, 26); }
    g.fillStyle = '#2B2340'; g.fillRect(lx - 16, 120, 32, 22);
    g.fillStyle = '#FFE8A0'; g.fillRect(lx - 10, 124, 20, 14);
    const a = lt * 2.2; g.fillStyle = `rgba(255,232,160,${0.35 * dusk})`;
    g.beginPath(); g.moveTo(lx, 131); g.lineTo(lx + Math.cos(a) * 400, 131 + Math.sin(a) * 60 - 30); g.lineTo(lx + Math.cos(a) * 400, 131 + Math.sin(a) * 60 + 30); g.fill();
    this.road(scroll);
    g.fillStyle = `rgba(20,16,60,${dusk * 0.35})`; g.fillRect(0, 0, W, H);
    this.jeep(170, 300, 1, lt, stop < 0.98);
    const dance = lt > 3.5 ? Math.abs(Math.sin(lt * 6)) * 14 : 0;
    this.duck(164, 222 - dance, 0.95, lt, lt > 3.5 ? Math.sin(lt * 12) * 0.5 + 0.5 : 0, false);
    // fireworks
    for (const p of this.sparks) {
      p.life -= 1 / 24; p.x += p.vx / 24; p.y += p.vy / 24; p.vy += 50 / 24;
      if (p.life <= 0) continue;
      g.fillStyle = `hsla(${p.hue},95%,65%,${Math.min(1, p.life)})`; g.fillRect(p.x, p.y, 3, 3);
    }
    this.sparks = this.sparks.filter(p => p.life > 0);
  }
  sceneEnd(t) {
    const g = this.g, lt = t - 26;
    if (lt < 1.6) {
      this.sceneNight(25.9);
      const r = lerp(320, 0, ease(lt / 1.4));
      g.fillStyle = '#0D0A14';
      g.beginPath(); g.rect(0, 0, W, H); g.arc(170, 200, Math.max(0.01, r), 0, Math.PI * 2, true); g.fill();
      return;
    }
    g.fillStyle = '#0D0A14'; g.fillRect(0, 0, W, H);
    const k = ease((lt - 1.6) / 0.6);
    g.globalAlpha = k;
    this.title('КОНЕЦ', W / 2, 160, 96, '#FFF1DC', '#0D0A14');
    g.fillStyle = '#FF4FA0'; g.beginPath(); const hx = W / 2, hy = 236;
    g.moveTo(hx, hy + 12); g.bezierCurveTo(hx - 26, hy - 8, hx - 12, hy - 26, hx, hy - 12); g.bezierCurveTo(hx + 12, hy - 26, hx + 26, hy - 8, hx, hy + 12); g.fill();
    if (lt > 2.3) { g.globalAlpha = ease((lt - 2.3) / 0.6); this.title('Пётр Кавалдин · Остров проектов', W / 2, 300, 26, '#C9B9CF', '#0D0A14'); }
    g.globalAlpha = 1;
  }
}
