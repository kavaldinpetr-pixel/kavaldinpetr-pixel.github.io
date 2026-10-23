// Keyboard, touch joystick and gamepad -> unified driving input + action events
export class Input {
  constructor() {
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false };
    this.touchBtn = { brake: false, boost: false };
    this.handlers = {};
    this.enabled = true;
    this.lastDevice = 'keys';
    this.pad = null; this.padPrev = [];
    this.konami = [];
    addEventListener('keydown', e => this.onKey(e, true));
    addEventListener('keyup', e => this.onKey(e, false));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('gamepadconnected', e => { this.pad = e.gamepad.index; this.emit('pad', true); });
    addEventListener('gamepaddisconnected', () => { this.pad = null; this.emit('pad', false); });
  }
  on(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); }
  emit(name, ...a) { (this.handlers[name] || []).forEach(f => f(...a)); }
  onKey(e, down) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t.closest && t.closest('dialog')))) return;
    if (window.PetrBrief && window.PetrBrief.isOpen) { this.keys.clear(); return; } // the brief form is on top
    const k = e.code;
    if (down) {
      this.konami.push(k); if (this.konami.length > 10) this.konami.shift();
      if (this.konami.join(',') === 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,KeyB,KeyA') { this.konami = []; this.emit('konami'); }
    }
    const drive = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];
    if (drive.includes(k)) { if (this.enabled) e.preventDefault(); if (down) this.keys.add(k); else this.keys.delete(k); this.lastDevice = 'keys'; return; }
    if (!down || e.repeat) return;
    const map = { KeyH: 'horn', KeyR: 'respawn', KeyE: 'act', Enter: 'act', NumpadEnter: 'act', KeyN: 'time', KeyM: 'map', Escape: 'esc', KeyQ: 'quality', KeyC: 'camera', KeyJ: 'achievements' };
    if (map[k]) { this.emit(map[k]); if (k === 'Enter' || k === 'KeyE') e.preventDefault(); }
  }
  pollPad() {
    if (this.pad === null || !navigator.getGamepads) return null;
    const p = navigator.getGamepads()[this.pad];
    if (!p) return null;
    const btn = i => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
    const pressed = i => btn(i) > 0.5;
    const edge = (i, ev) => { const now = pressed(i); if (now && !this.padPrev[i]) this.emit(ev); this.padPrev[i] = now; };
    edge(3, 'act'); edge(2, 'horn'); edge(8, 'respawn'); edge(9, 'esc'); edge(12, 'time'); edge(13, 'camera');
    const sx = Math.abs(p.axes[0]) > 0.15 ? p.axes[0] : 0;
    const out = { throttle: btn(7) - btn(6), steer: -sx, brake: pressed(0), boost: pressed(1) || pressed(5) };
    if (Math.abs(out.throttle) > 0.05 || out.steer || out.brake) this.lastDevice = 'pad';
    return out;
  }
  state() {
    const k = this.keys;
    let throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let steer = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    let brake = k.has('Space'), boost = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joy.active) {
      throttle = Math.abs(this.joy.y) > 0.12 ? -this.joy.y : 0;
      steer = Math.abs(this.joy.x) > 0.1 ? -this.joy.x : 0;
    }
    if (this.touchBtn.brake) brake = true;
    if (this.touchBtn.boost) boost = true;
    const pad = this.pollPad();
    if (pad && (Math.abs(pad.throttle) > 0.05 || pad.steer || pad.brake || pad.boost)) { throttle = pad.throttle; steer = pad.steer; brake = brake || pad.brake; boost = boost || pad.boost; }
    if (!this.enabled) return { throttle: 0, steer: 0, brake: false, boost: false };
    return { throttle, steer, brake, boost };
  }
}
