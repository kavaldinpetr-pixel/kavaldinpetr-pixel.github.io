// DOM interface: HUD, world markers, menu, map, panel, toasts, achievements, touch controls.
import { CASES, ACH } from './content.js';
import { islandR, POND, RIVER, ROADS, ZONES, POIS, PLAZA, LIGHTHOUSE, MOUNTAINS, FOUNTAIN, PARK, BOWL, UFO } from './layout.js';
import { TAU } from './util.js';
import { WINTER } from './season.js';

const $ = id => document.getElementById(id);
const hex = c => '#' + c.toString(16).padStart(6, '0');

export class UI {
  constructor(touch) {
    this.touch = touch;
    this.el = {};
    ['hud', 'start', 'go', 'loader', 'loaderBar', 'loaderNote', 'ducksN', 'achN', 'chipDucks', 'chipAch', 'btnTime', 'btnSeason', 'btnSound', 'btnMusic', 'btnSfx', 'btnQuality', 'btnReset', 'btnAch',
      'btnMap', 'btnMenu', 'btnBrief', 'btnBrief2', 'menu', 'menuClose', 'mapv', 'mapClose', 'mapC', 'mapLabels', 'marks', 'mini', 'keys', 'prompt', 'promptText', 'promptDot',
      'lap', 'lapT', 'lapB', 'toasts', 'panel', 'panelBody', 'panelClose', 'ach', 'achList', 'achClose', 'worldReset', 'touch', 'stick', 'knob', 'tbRead', 'tbBoost', 'tbBrake', 'tbHorn', 'legendKeys', 'legendTouch', 'nogl']
      .forEach(id => { this.el[id] = $(id); });
    this.panelId = null;
    this.handlers = {};
    const e = this.el;
    if (touch) { e.legendKeys.hidden = true; e.legendTouch.hidden = false; }
    e.panelClose.addEventListener('click', () => this.closePanel());
    e.chipAch.addEventListener('click', () => this.emit('achievements'));
    e.chipDucks.addEventListener('click', () => this.emit('achievements'));
    e.achClose.addEventListener('click', () => this.hideAch());
    e.worldReset.addEventListener('click', () => { this.emit('worldReset'); this.hideAch(); });
    e.ach.addEventListener('click', ev => { if (ev.target === e.ach) this.hideAch(); });
    e.btnTime.addEventListener('click', () => this.emit('time'));
    e.btnSeason.addEventListener('click', () => this.emit('season'));
    e.btnSound.addEventListener('click', () => this.emit('mute'));
    e.btnMusic.addEventListener('click', () => this.emit('music'));
    e.btnSfx.addEventListener('click', () => this.emit('sfx'));
    e.btnQuality.addEventListener('click', () => this.emit('quality'));
    e.btnReset.addEventListener('click', () => { this.hideMenu(); this.emit('respawn'); });
    e.btnAch.addEventListener('click', () => { this.hideMenu(); this.emit('achievements'); });
    e.btnMenu.addEventListener('click', () => this.toggleMenu());
    e.btnBrief.addEventListener('click', () => this.emit('brief', null));
    e.btnBrief2.addEventListener('click', () => { this.hideMenu(); this.emit('brief', null); });
    e.menuClose.addEventListener('click', () => this.hideMenu());
    e.menu.addEventListener('click', ev => { if (ev.target === e.menu) this.hideMenu(); });
    e.btnMap.addEventListener('click', () => this.toggleMap());
    e.mini.addEventListener('click', () => this.showMap());
    e.mapClose.addEventListener('click', () => this.hideMap());
    e.mapv.addEventListener('click', ev => { if (ev.target === e.mapv) this.hideMap(); });
    e.prompt.addEventListener('click', () => this.emit('act'));
    e.tbRead.addEventListener('click', () => this.emit('act'));
    e.go.addEventListener('click', ev => { ev.stopPropagation(); this.emit('start'); });
    e.start.addEventListener('click', ev => { if (!ev.target.closest('a')) this.emit('start'); });
    e.panelBody.addEventListener('click', ev => {
      const t = ev.target.closest('[data-brief]');
      if (t) { this.emit('brief', t.getAttribute('data-brief')); return; }
      const b = ev.target.closest('[data-copy]');
      if (!b) return;
      const txt = b.getAttribute('data-copy');
      const done = () => { b.textContent = 'Скопировано'; setTimeout(() => { b.textContent = 'Скопировать адрес'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done); else done();
    });
    this.buildMiniBase();
    this.buildMarks();
    this.buildMapLabels();
  }
  on(n, f) { (this.handlers[n] = this.handlers[n] || []).push(f); }
  emit(n, ...a) { (this.handlers[n] || []).forEach(f => f(...a)); }

  progress(f, note) { this.el.loaderBar.style.width = Math.round(4 + f * 96) + '%'; if (note) this.el.loaderNote.textContent = note; }
  loaded() { this.el.loader.classList.add('gone'); setTimeout(() => { this.el.loader.hidden = true; }, 1000); this.el.start.hidden = false; }
  started() {
    this.el.start.classList.add('gone'); setTimeout(() => { this.el.start.hidden = true; }, 800);
    this.el.hud.hidden = false;
    if (this.touch) this.el.touch.hidden = false;
    clearTimeout(this.keysTimer);
    this.keysTimer = setTimeout(() => this.el.keys.classList.add('dim'), 30000);
  }
  setTime(label) { this.el.btnTime.textContent = 'Время: ' + label.toLowerCase(); }
  setSeason(winter) { this.el.btnSeason.textContent = winter ? 'Сезон: зима' : 'Сезон: осень'; }
  setSound(on) { this.el.btnSound.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  setMusic(on) { this.el.btnMusic.textContent = on ? 'Музыка: вкл' : 'Музыка: выкл'; this.el.btnMusic.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  setSfx(on) { this.el.btnSfx.textContent = on ? 'Звуки: вкл' : 'Звуки: выкл'; this.el.btnSfx.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  setQuality(high) { this.el.btnQuality.textContent = high ? 'Графика: макс' : 'Графика: лёгкая'; }
  setCounts(ducks, ach) {
    const e = this.el;
    if (e.ducksN.textContent !== ducks + '/5') { e.ducksN.textContent = ducks + '/5'; this.bump(e.chipDucks); }
    if (e.achN.textContent !== ach + '/' + ACH.length) { e.achN.textContent = ach + '/' + ACH.length; this.bump(e.chipAch); }
  }
  bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  toast(title, sub, kind = 'ach', icon = '★') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="toast-ic toast-ic--${kind}"><span></span></span><span><b></b><small></small></span>`;
    t.querySelector('.toast-ic span').textContent = icon || '';
    t.querySelector('b').textContent = title; t.querySelector('small').textContent = sub || '';
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 3700);
  }

  // ---------- menu & map ----------
  get overlayOpen() { return !this.el.menu.hidden || !this.el.mapv.hidden || !this.el.ach.hidden || !!(window.PetrBrief && window.PetrBrief.isOpen); }
  toggleMenu() { if (this.el.menu.hidden) this.showMenu(); else this.hideMenu(); }
  showMenu() { this.hideMap(); this.el.menu.hidden = false; this.emit('overlay', true); }
  hideMenu() { if (this.el.menu.hidden) return; this.el.menu.hidden = true; this.emit('overlay', this.overlayOpen); }
  toggleMap() { if (this.el.mapv.hidden) this.showMap(); else this.hideMap(); }
  showMap() { this.hideMenu(); this.el.mapv.hidden = false; this.emit('overlay', true); this.emit('mapOpen'); }
  hideMap() { if (this.el.mapv.hidden) return; this.el.mapv.hidden = true; this.emit('overlay', this.overlayOpen); }

  // ---------- world markers ----------
  buildMarks() {
    const list = [...ZONES.map(z => ({ z, poi: false })), ...POIS.map(z => ({ z, poi: true }))];
    this.marks = list.map(({ z, poi }) => {
      const d = document.createElement('div');
      d.className = 'mk' + (poi ? ' mk--poi' : '');
      d.innerHTML = `<span></span><i></i>`;
      d.querySelector('span').textContent = z.name;
      d.addEventListener('click', () => this.emit(poi ? 'poiClick' : 'markClick', z.id));
      this.el.marks.appendChild(d);
      return { z, poi, el: d, lbl: d.querySelector('span'), on: false, near: null };
    });
  }
  // pts: [{x, y, vis, near}] in CSS px, same order as ZONES then POIS; car: the jeep's box on screen
  updateMarks(pts, activeId, car, dt = 0.016) {
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i], p = pts[i];
      if (!p.vis) { if (!m.hid) { m.el.style.visibility = 'hidden'; m.hid = true; } m.off = 0; continue; }
      if (m.hid) { m.el.style.visibility = ''; m.hid = false; }
      const on = activeId === m.z.id;
      let changed = false;
      if (on !== m.on) {
        m.on = on; m.el.classList.toggle('on', on);
        m.lbl.innerHTML = '';
        m.lbl.append(m.z.name);
        if (on && !this.touch) { const k = document.createElement('kbd'); k.textContent = 'E'; m.lbl.append(k); }
        changed = true;
      }
      m.el.classList.toggle('near', p.near);
      if (m.poi && m.near !== p.near) {
        m.near = p.near;
        m.lbl.innerHTML = '';
        m.lbl.append(m.z.name);
        if (p.near) { const h = document.createElement('small'); h.textContent = m.z.hint; m.lbl.append(h); }
        changed = true;
      }
      if (changed || m.lw === undefined) { m.lw = m.lbl.offsetWidth; m.lh = m.lbl.offsetHeight; }
      // never cover the jeep: while the marker (and its label) would overlap it, slide it up above the car
      let tgt = 0;
      if (car) {
        const showL = m.on || p.near, half = Math.max(15, showL ? m.lh / 2 : 15);
        const x0 = p.x - 15 - (showL ? m.lw + 4 : 0), x1 = p.x + 15, y0 = p.y - half, y1 = p.y + half;
        if (x1 > car.x0 && x0 < car.x1 && y1 > car.y0 && y0 < car.y1) tgt = car.y0 - 8 - y1;
      }
      m.off = (m.off || 0) + (tgt - (m.off || 0)) * Math.min(1, dt * 12);
      m.el.style.transform = `translate(${p.x - 13}px, ${p.y + m.off - 13}px)`;
    }
  }
  prompt(zone) {
    const e = this.el;
    if (!zone) { e.tbRead.hidden = true; this.promptId = null; return; }
    if (this.promptId === zone.id) return;
    this.promptId = zone.id;
    e.tbRead.hidden = !this.touch;
    e.tbRead.textContent = 'Читать: ' + zone.name;
  }
  openPanel(zone) {
    const c = CASES[zone.id];
    if (!c) return;
    const e = this.el;
    this.panelId = zone.id;
    e.panel.style.setProperty('--zc', hex(zone.color));
    let shots = '';
    if (c.shots) shots = `<div class="shots${c.wide ? '' : ' phone'}">` + c.shots.map(([src, cap]) => `<figure><img src="${src}" alt="${cap}" loading="lazy"><figcaption>${cap}</figcaption></figure>`).join('') + '</div>';
    const talk = { auto: 'Хочу такой же сайт', dt: 'Хочу такой же сайт', salon: 'Хочу такой же сайт', vpn: 'Хочу такого же бота', proxy: 'Хочу такого же бота' }[zone.id] || 'Обсудить сайт';
    const brief = zone.id === 'contact' ? '' : `<button class="btn btn--mark" type="button" data-brief="${zone.id}">${talk}</button>`;
    e.panelBody.innerHTML = `<div class="kick"><i></i>${c.kick}</div><h2>${c.title}</h2><p class="sub">${c.sub}</p>${shots}${c.body}<div class="row">${brief}<a class="btn btn--light" href="${c.link}">Открыть на сайте</a></div>`;
    e.panel.classList.add('open');
    if (this.touch) document.body.classList.add('panel-open');
    e.panel.setAttribute('aria-hidden', 'false');
    e.panel.scrollTop = 0;
  }
  closePanel() { this.panelId = null; this.el.panel.classList.remove('open'); document.body.classList.remove('panel-open'); this.el.panel.setAttribute('aria-hidden', 'true'); }
  showAch(got) {
    const e = this.el;
    this.hideMenu(); this.hideMap();
    e.achList.innerHTML = '';
    ACH.forEach((a, i) => {
      const li = document.createElement('li');
      const has = got.has(a.id);
      if (has) li.className = 'got';
      li.innerHTML = `<i><span>${has ? '✓' : i + 1}</span></i><span><b></b><small></small></span>`;
      li.querySelector('b').textContent = has || !a.secret ? a.name : 'Секрет';
      li.querySelector('small').textContent = a.hint;
      e.achList.appendChild(li);
    });
    e.ach.hidden = false;
    this.emit('overlay', true);
    e.achClose.focus({ preventScroll: true });
  }
  hideAch() { if (this.el.ach.hidden) return; this.el.ach.hidden = true; this.emit('overlay', this.overlayOpen); }
  get achOpen() { return !this.el.ach.hidden; }
  lap(show, t, best) {
    const e = this.el;
    e.lap.hidden = !show;
    if (!show) return;
    e.lapT.textContent = fmt(t);
    e.lapB.textContent = best ? 'Лучший круг ' + fmt(best) : 'Круг почёта';
  }

  // ---------- island drawing (minimap + big map) ----------
  drawIsland(g, size, scale) {
    const C = size / 2, toX = x => C + x * scale, toY = z => C + z * scale;
    g.save();
    g.beginPath();
    for (let i = 0; i <= 180; i++) { const a = i / 180 * TAU, R = islandR(a); const x = toX(Math.cos(a) * R), y = toY(Math.sin(a) * R); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fillStyle = WINTER ? '#E3E7F6' : '#B9AE34'; g.fill();
    g.lineWidth = 3 * scale; g.strokeStyle = WINTER ? '#9CA4D8' : '#D37A43'; g.stroke();
    g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#4FB9B0'; g.lineWidth = 4.5 * scale;
    g.beginPath(); RIVER.forEach((p, i) => i ? g.lineTo(toX(p[0]), toY(p[1])) : g.moveTo(toX(p[0]), toY(p[1]))); g.stroke();
    g.fillStyle = '#4FB9B0'; g.beginPath(); g.arc(toX(POND.x), toY(POND.z), POND.r * scale + 2, 0, TAU); g.fill();
    g.strokeStyle = '#FBA757'; g.lineWidth = 3.6 * scale;
    for (const r of ROADS) { g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(toX(p[0]), toY(p[1])) : g.moveTo(toX(p[0]), toY(p[1]))); if (r.closed) g.closePath(); g.stroke(); }
    g.fillStyle = '#FBA757';
    g.beginPath(); g.arc(toX(PLAZA.x), toY(PLAZA.z), PLAZA.r * scale, 0, TAU); g.fill();
    g.beginPath(); g.arc(toX(LIGHTHOUSE.x), toY(LIGHTHOUSE.z), LIGHTHOUSE.plaza * scale, 0, TAU); g.fill();
    for (const m of MOUNTAINS) {
      const x = toX(m.x), y = toY(m.z), r = m.r * scale;
      g.fillStyle = '#7E70C2'; g.beginPath(); g.moveTo(x, y - r * 0.9); g.lineTo(x + r, y + r * 0.7); g.lineTo(x - r, y + r * 0.7); g.closePath(); g.fill();
      if (m.snow || WINTER) { g.fillStyle = '#F4F0FF'; g.beginPath(); g.moveTo(x, y - r * 0.9); g.lineTo(x + r * 0.38, y - r * 0.25); g.lineTo(x - r * 0.38, y - r * 0.25); g.closePath(); g.fill(); }
    }
    g.fillStyle = '#7FE3EE'; g.beginPath(); g.arc(toX(FOUNTAIN.x), toY(FOUNTAIN.z), FOUNTAIN.r * scale * 0.9, 0, TAU); g.fill();
    g.fillStyle = '#3D3352'; g.fillRect(toX(PARK.x - PARK.hw), toY(PARK.z - PARK.hz), PARK.hw * 2 * scale, PARK.hz * 2 * scale);
    g.fillStyle = '#E8B878'; g.fillRect(toX(BOWL.x0), toY(BOWL.z - BOWL.hw), (BOWL.x1 - BOWL.x0) * scale, BOWL.hw * 2 * scale);
    g.strokeStyle = 'rgba(255,169,78,.9)'; g.lineWidth = 0.6 * scale;
    for (const r of [2.6, 5.6]) { g.beginPath(); g.arc(toX(UFO.x), toY(UFO.z), r * scale, 0, TAU); g.stroke(); }
    g.restore();
  }
  buildMiniBase() {
    const c = document.createElement('canvas'); c.width = c.height = 380;
    const g = c.getContext('2d');
    this.drawIsland(g, 380, 2);
    for (const z of [...ZONES, ...POIS]) { const x = 190 + z.t[0] * 2, y = 190 + z.t[1] * 2; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#fff'; g.fillRect(-6, -6, 12, 12); g.lineWidth = 3; g.strokeStyle = '#14081A'; g.strokeRect(-6, -6, 12, 12); g.restore(); }
    this.miniBase = c; this.miniS = 2;
    this.miniCtx = this.el.mini.getContext('2d');
  }
  buildMapLabels() {
    const box = this.el.mapLabels;
    for (const [z, poi] of [...ZONES.map(z => [z, false]), ...POIS.map(z => [z, true])]) {
      const b = document.createElement('button');
      b.className = 'ml' + (poi ? ' ml--poi' : '') + (z.lbl ? ' ml--' + z.lbl : ''); b.type = 'button';
      b.style.left = (50 + z.t[0] / 1.8) + '%'; b.style.top = (50 + z.t[1] / 1.8) + '%';
      b.innerHTML = '<i></i><span></span>';
      b.querySelector('span').textContent = z.name;
      b.addEventListener('click', () => { this.hideMap(); this.emit(poi ? 'teleportPoi' : 'teleport', z.id); });
      box.appendChild(b);
    }
  }
  drawMap(x, z, yaw) {
    const c = this.el.mapC, g = c.getContext('2d'), S = c.width / 180;
    g.clearRect(0, 0, c.width, c.height);
    this.drawIsland(g, c.width, S);
    g.save();
    g.translate(c.width / 2 + x * S, c.height / 2 + z * S);
    g.rotate(-yaw);
    g.beginPath(); g.moveTo(0, -22); g.lineTo(14, 15); g.lineTo(0, 8); g.lineTo(-14, 15); g.closePath();
    g.fillStyle = '#FF4FA0'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
  }
  drawMini(x, z, yaw, camYaw) {
    const g = this.miniCtx, S = this.miniS;
    g.clearRect(0, 0, 300, 300);
    g.save();
    g.beginPath(); g.arc(150, 150, 150, 0, TAU); g.clip();
    g.fillStyle = 'rgba(20,8,26,.8)'; g.fillRect(0, 0, 300, 300);
    g.translate(150, 150);
    g.rotate(-camYaw);
    g.scale(1.55, 1.55);
    g.translate(-x * S, -z * S);
    g.drawImage(this.miniBase, -190, -190);
    g.restore();
    g.save();
    g.translate(150, 150);
    g.rotate(-(yaw - camYaw));
    g.beginPath(); g.moveTo(0, -17); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath();
    g.fillStyle = '#FF4FA0'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
  }

  // ---------- touch ----------
  bindTouch(input) {
    const e = this.el, st = e.stick, kn = e.knob;
    let id = null, cx = 0, cy = 0;
    const R = 50;
    const move = ev => {
      let dx = ev.clientX - cx, dy = ev.clientY - cy;
      const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      kn.style.transform = `translate(${dx}px, ${dy}px)`;
      input.joy.x = dx / R; input.joy.y = dy / R; input.joy.active = true;
    };
    st.addEventListener('pointerdown', ev => { id = ev.pointerId; const r = st.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; st.setPointerCapture(id); move(ev); ev.preventDefault(); });
    st.addEventListener('pointermove', ev => { if (ev.pointerId === id) move(ev); });
    const end = ev => { if (ev.pointerId !== id) return; id = null; kn.style.transform = ''; input.joy.x = input.joy.y = 0; input.joy.active = false; };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    const hold = (btn, key) => {
      btn.addEventListener('pointerdown', ev => { input.touchBtn[key] = true; btn.classList.add('on'); btn.setPointerCapture(ev.pointerId); ev.preventDefault(); });
      const up = () => { input.touchBtn[key] = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
    };
    hold(e.tbBrake, 'brake'); hold(e.tbBoost, 'boost');
    e.tbHorn.addEventListener('pointerdown', ev => { ev.preventDefault(); input.emit('horn'); });
  }
}

export function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}
