import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { tiltShiftPass, revealPass } from './post.js';
import { occludeBasic, styleScene, SU } from './style.js';
import { buildTerrainData } from './tdata.js';
import * as CANNON from 'cannon-es';
import { initMaterials, M, U } from './materials.js';
import { buildTerrain } from './terrain.js';
import { buildSky } from './sky.js';
import { Env, PRESETS } from './env.js';
import { BRIDGES, BOWL, POIS, SHOTS, edgeDist, FALL, grassAt, heightAt, inside, JUKE, LIGHTHOUSE, nearestRoad, PARK, PITCH, POND, RING, RING_LEN, RIVER_W, riverD, SPAWN, TV, UFO, WATER_Y, ZONE, ZONES, roadD } from './layout.js';
import { buildDecor, TREES } from './decor.js';
import { buildStructures } from './structures.js';
import { Physics } from './physics.js';
import { Car, buildCarModel, setCarPaint, leanModel, OFF } from './car.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { buildZones, WATER_MATS } from './zones.js';
import { buildProps } from './props.js';
import { buildFun, VIDEO } from './fun.js';
import './brief.js';
import { GUEST, NICHE } from './guest.js';
import { buildMountains } from './mountains.js';
import { Particles, Skids } from './fx.js';
import { WINTER } from './season.js';
import { buildSnowfall } from './snow.js';
import { Audio } from './audio.js';
import { UI, fmt } from './ui.js';
import { ACH } from './content.js';
import { clamp, lin, polyNearest, rand, smooth, TAU, wrapAngle } from './util.js';

const DEBUG = location.hash.includes('debug');
const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && innerWidth < 900);
const store = {
  get(k, d) { try { const v = localStorage.getItem('isle:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('isle:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const ui = new UI(touch);

// ---------- renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: false, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (!renderer || !renderer.getContext()) {
  ui.el.loader.hidden = true; ui.el.nogl.hidden = false;
  throw new Error('no webgl');
}
let high = store.get('quality', !touch) && !(touch && innerWidth < 500 && false);
const Q = () => (high
  ? { shadow: 2048, shadowSpan: 32, pr: Math.min(devicePixelRatio || 1, 2), bloom: true, dof: true }
  : { shadow: 1024, shadowSpan: 28, pr: Math.min(devicePixelRatio || 1, touch ? 1.5 : 1.25), bloom: false, dof: false });
const quality = Object.assign({
  flowers: touch ? 700 : 1100, clouds: touch ? 230 : 420, trees: touch ? 170 : 215, rocks: touch ? 60 : 78, bushes: touch ? 90 : 115, lowLights: touch,
  blades: touch ? { n: 190, size: 50 } : { n: 270, size: 58 }, leafCards: touch ? 52 : 80, leaves: touch ? 2600 : 5600
}, Q());
renderer.setPixelRatio(quality.pr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, innerWidth / innerHeight, 0.5, 2800);
const frameYield = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

let env, sky, terrain, decor, phys, structures, zones, props, fun, car, model, rig, input, audio, fx, glow, skids, composer, bloomPass, tiltPass, revPass, outPass;
let tracks = null, snowfall = null; // winter only
const S = { state: 'loading', got: new Set(store.get('ach', [])), ducks: new Set(store.get('ducks', [])), best: store.get('best', 0), visited: new Set(store.get('visited', [])), wreck: 0, gold: false };

async function build() {
  const steps = [
    ['Небо и облака', () => { initMaterials(); env = new Env(renderer, scene, quality); sky = buildSky(scene, { clouds: quality.clouds }); env.cloudBase = sky.clouds.userData.base; sky.stars.material.uniforms.uPR.value = renderer.getPixelRatio(); }],
    ['Земля и река', () => { terrain = buildTerrain(scene); buildTerrainData(); phys = new Physics(); phys.addHeightfield(-92, 92, 1); }],
    ['Ящики и фонари', () => { props = buildProps(scene, phys, quality); fun = buildFun(scene, phys, quality); }],
    ['Деревья и трава', () => { decor = buildDecor(scene, quality); }],
    ['Мосты, горы и трамплины', () => { structures = buildStructures(scene, phys); buildMountains(scene, phys); }],
    ['Проекты', () => { zones = buildZones(scene, phys, quality); }],
    ['Джип', () => {
      car = new Car(phys); car.place(SPAWN.x, SPAWN.z, SPAWN.yaw);
      model = buildCarModel(); scene.add(model.group); model.wheels.forEach(w => model.group.add(w));
      fx = new Particles(scene, 1600, false); glow = new Particles(scene, 900, true); skids = new Skids(scene, 360);
      if (WINTER) { tracks = new Skids(scene, 1100, { color: [0.3, 0.36, 0.62], alpha: 0.3, life: 16, width: 0.15, minSeg: 0.45 }); snowfall = buildSnowfall(scene, { n: touch ? 1800 : 3200 }); }
      rig = new CameraRig(camera, renderer.domElement); input = new Input(); audio = new Audio();
    }],
    ['Свет', () => { styleWorld(); setupComposer(); renderer.compile(scene, camera); }]
  ];
  for (let i = 0; i < steps.length; i++) {
    ui.progress(i / steps.length, steps[i][0]);
    await frameYield();
    steps[i][1]();
  }
  ui.progress(1, 'Готово');
  wire();
  if (S.got.has('gold')) { S.gold = true; setCarPaint(model, true); }
  S.ducks.forEach(i => { const d = props.ducks[i]; if (d) { d.userData.got = true; d.visible = false; } });
  if (S.got.has('wrench')) { props.wrench.userData.got = true; props.wrench.visible = false; }
  refreshCounts();
  ui.setTime(PRESETS[env.name].label); ui.setSeason(WINTER); ui.setSound(true); ui.setQuality(high); ui.setMusic(store.get('music', true)); ui.setSfx(store.get('sfx', true));
  S.state = 'intro';
  syncCar(); introTarget.y = carPos.y; rig.snap(introTarget);
  await frameYield();
  ui.loaded();
}

function styleWorld() {
  const carMats = new Set();
  model.group.traverse(o => { if (o.isMesh) carMats.add(o.material); });
  SU.uSnow.value = WINTER ? 1 : 0;
  styleScene(scene, (o, m) => {
    if (m === M.ground || m === M.cliff) return { bounce: false };
    if (m === M.road) return { tiles: true, bounce: false, snow: 0.5 };
    if (m === model.paintMat) return { spec: 0.55, shine: 36, bounce: false, key: 'paint', snow: 0 };
    if (carMats.has(m)) return { spec: m.roughness < 0.2 ? 0.9 : 0.25, shine: m.roughness < 0.2 ? 90 : 24, bounce: false, key: 'car', snow: 0 };
    if (o.name === 'clouds' || o.parent && o.parent.name === 'clouds') return { bounce: false, key: 'cloud', snow: 0 };
    return { occlude: true };
  });
  // signs and screens standing in the world
  zones.group ? zones.group.traverse(o => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial && !o.material.transparent) occludeBasic(o.material); }) : null;
  scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.map && !o.material.transparent && !carMats.has(o.material)) occludeBasic(o.material); });
}
function setupComposer() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(quality.pr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  revPass = revealPass();
  revPass.enabled = S.state !== 'play';
  composer.addPass(revPass);
  bloomPass = null;
  if (quality.bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.55, 1.0);
    composer.addPass(bloomPass);
  }
  outPass = new OutputPass();
  composer.addPass(outPass);
  tiltPass = null;
  if (quality.dof) { tiltPass = tiltShiftPass(); composer.addPass(tiltPass); }
  resizePost();
}
function resizePost() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (tiltPass) tiltPass.uniforms.uRes.value.copy(size);
}
function setQuality(h) {
  high = h; store.set('quality', h);
  Object.assign(quality, Q());
  renderer.setPixelRatio(quality.pr);
  renderer.setSize(innerWidth, innerHeight, false);
  env.sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  if (env.sun.shadow.map) { env.sun.shadow.map.dispose(); env.sun.shadow.map = null; }
  env.span = quality.shadowSpan;
  const c = env.sun.shadow.camera; c.left = c.bottom = -env.span; c.right = c.top = env.span; c.updateProjectionMatrix();
  if (composer) { composer.renderTarget1.depthTexture?.dispose(); composer.renderTarget2.depthTexture?.dispose(); composer.dispose && composer.dispose(); composer = null; }
  setupComposer();
  sky.stars.material.uniforms.uPR.value = renderer.getPixelRatio();
  ui.setQuality(h);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (composer) { composer.setSize(innerWidth, innerHeight); resizePost(); }
  if (fx) { const s = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); fx.mat.uniforms.uScale.value = s; glow.mat.uniforms.uScale.value = s; if (snowfall) snowfall.uni.uScale.value = s; }
}
addEventListener('resize', resize);

// ---------- achievements / counters ----------
function refreshCounts() { ui.setCounts(S.ducks.size, S.got.size); }
function unlock(id) {
  if (S.got.has(id)) return false;
  S.got.add(id); store.set('ach', [...S.got]);
  const a = ACH.find(x => x.id === id);
  ui.toast(a ? a.name : id, 'Достижение ' + S.got.size + ' из ' + ACH.length, 'ach', '★');
  audio.jingle(true);
  confetti(carPos.x, carPos.y + 1.5, carPos.z, 70);
  refreshCounts();
  return true;
}
const CONF = [0xFF4FA0, 0xFFC857, 0x5BE3C8, 0x7FB7FF, 0xFFF1DC, 0xC9B6FF].map(h => lin(h));
const LEAF = [0xC8382A, 0xE0552E, 0xF07A35, 0xE8A13A].map(h => lin(h));
function confetti(x, y, z, n = 60) {
  for (let k = 0; k < n; k++) {
    const a = rand() * TAU, s = 3 + rand() * 6;
    fx.emit(x, y, z, Math.cos(a) * s, 6 + rand() * 7, Math.sin(a) * s, 2.2 + rand() * 1.2, 0.32, 0.3, CONF[k % CONF.length], { grav: 9, drag: 1.4, shape: 1 });
  }
}

// ---------- wiring ----------
const carPos = new THREE.Vector3(), carVel = new THREE.Vector3();
let lastSafe = { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw }, safeT = 0;
let activeZone = null;
let fallT = 0, drownT = 0, respawnLock = 0;
let air0 = 0, overRiver = false, airPeakVy = 0;
let preVel = new CANNON.Vec3();
const poofQ = [];
const wob = [];
let lap = { on: false, t: 0, prog: 0, lastS: null, off: 0, show: 0 };
let washT = 0, mailT = 0, hornNear = 0, parkT = 0, watchT = 0, ufoT = -1, ufoCine = 0, cineWho = null, tvDirect = false, lettersN = 0;

function wire() {
  // input actions
  input.on('horn', () => { if (S.state !== 'play') return; audio.horn(); honk(); });
  input.on('respawn', () => { if (S.state === 'play') respawn(true); });
  input.on('act', () => { if (S.state === 'intro') return startGame(); if (ui.overlayOpen) return; if (activeZone) openZone(activeZone); else if (ui.panelId) ui.closePanel(); });
  input.on('map', () => { if (S.state === 'play') ui.toggleMap(); });
  input.on('time', () => cycleTime());
  input.on('esc', () => {
    if (S.state !== 'play') return;
    if (ui.achOpen) ui.hideAch(); else if (!ui.el.mapv.hidden) ui.hideMap(); else if (!ui.el.menu.hidden) ui.hideMenu(); else if (ui.panelId) ui.closePanel(); else ui.showMenu();
  });
  input.on('achievements', () => { if (S.state === 'play') ui.achOpen ? ui.hideAch() : ui.showAch(S.got); });
  input.on('konami', () => { if (S.state !== 'play') return; S.gold = !S.gold; setCarPaint(model, S.gold); audio.jingle(true); confetti(carPos.x, carPos.y + 1.5, carPos.z, 90); if (S.gold) unlock('gold'); });
  input.on('camera', () => { rig.yawT = 0; rig.zoomT = 1; });
  ui.on('start', () => startGame());
  ui.on('act', () => { if (activeZone) openZone(activeZone); });
  ui.on('time', () => cycleTime());
  // the season is chosen while the island is built, so switching reloads it (keeping the guest parameters)
  ui.on('season', () => { try { const u = new URL(location.href); u.searchParams.set('season', WINTER ? 'autumn' : 'winter'); location.href = u.toString(); } catch (e) { /* very old browser */ } });
  ui.on('mute', () => { audio.setMuted(!audio.muted); store.set('muted', audio.muted); ui.setSound(!audio.muted); });
  ui.on('music', () => { const on = !audio.musicOn; audio.setMusic(on); store.set('music', on); ui.setMusic(on); });
  ui.on('sfx', () => { const on = !audio.sfxOn; audio.setSfx(on); store.set('sfx', on); ui.setSfx(on); });
  ui.on('overlay', open => { input.enabled = !open; });
  ui.on('mapOpen', () => ui.drawMap(carPos.x, carPos.z, car.yaw));
  ui.on('teleport', id => goToZone(id));
  ui.on('markClick', id => { if (activeZone && activeZone.id === id) openZone(activeZone); else goToZone(id); });
  ui.on('poiClick', id => goToPoi(id));
  ui.on('teleportPoi', id => goToPoi(id));
  ui.on('quality', () => setQuality(!high));
  // «Обсудить сайт»: the brief form (shared with the page) opens over the game and pauses the controls
  ui.on('brief', id => openBrief(id));
  window.PetrBrief.onOpen = () => ui.emit('overlay', true);
  window.PetrBrief.onClose = () => ui.emit('overlay', ui.overlayOpen);
  ui.on('respawn', () => respawn(true));
  ui.on('achievements', () => ui.showAch(S.got));
  ui.on('worldReset', () => { props.resetAll(); zones.letters.resetAll(); fun.bowl.pins.items.forEach(it => it.set.reset(it)); props.sets.domino.items.forEach(d => { d.kicked = false; }); S.wreck = 0; dominoDone = false; resetPools(); });
  if (touch) ui.bindTouch(input);
  env.listeners.push(n => ui.setTime(PRESETS[n].label));

  // collisions: car vs world
  car.body.addEventListener('collide', e => {
    const other = e.body, v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const it = other.userData;
    if (it && it.set) {
      const kind = it.set.def.kind;
      audio.hit(kind, v * 1.3);
      if (it.set.def.breakable && !it.broken && v > (it.set.def.breakV ?? 2.2)) {
        it.set.breakIt(it, car.body.velocity);
        countWreck(it);
        // keep most of the car's momentum when smashing through (snow barely slows it down)
        const keep = kind === 'snow' ? 0.94 : 0.82;
        car.body.velocity.set(preVel.x * keep, Math.max(preVel.y, car.body.velocity.y), preVel.z * keep);
        sparks(it.body.position, kind);
        if (it.set === props.sets.lamp) hidePool(it.idx);
        if (it.set.def.poof) { poofQ.push(it); if (!S.snowHint) { S.snowHint = true; ui.toast('Бедный снеговик', 'Слепится заново, когда вы отъедете', 'ach', '❄'); } }
      } else if (v > 2) sparks(e.contact.bi === car.body ? e.contact.ri.vadd(car.body.position) : e.contact.rj.vadd(car.body.position), kind, 0.5);
    } else if (other.userData && other.userData.tree !== undefined) {
      hitTree(other.userData.tree, v);
    } else if (other.userData && other.userData.fountain) {
      const f = zones.anim.fountain;
      audio.splash(); audio.hit('car', v * 0.6);
      fx.burst(carPos.x * 0.5 + f.x * 0.5, f.y + 0.9, carPos.z * 0.5 + f.z * 0.5, 34, 4, 6, 1, 0.35, 0.6, [lin(0xFFFFFF), lin(0xBFF4FF)], { grav: 12, drag: 1 });
    } else if (v > 3) { audio.hit('car', v); rig.shake = Math.min(1, v / 14); rig.kick(Math.min(1, v / 10)); }
  });
  // prop vs prop / ground sounds
  for (const it of [...props.items, ...fun.bowl.pins.items, ...zones.letters.items]) it.body.addEventListener('collide', e => { if (e.body === car.body) return; const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 2.2 && camDist(it.body.position) < 45) audio.hit(it.set.def.kind, v * 0.7); });
  // smashed snowmen vanish after the step that hit them (the solver still pushes them, not the car)
  phys.world.addEventListener('postStep', () => { while (poofQ.length) props.poof(poofQ.pop()); });
  phys.world.addEventListener('preStep', () => {
    preVel.copy(car.body.velocity);
    // tractor beam: rise, hang, come down gently (per physics step, gravity cancelled)
    if (ufoT > 1.2 && ufoT < 6.2) {
      const b = car.body, p = b.position, want = ufoT < 3.25 ? 1.95 : ufoT < 4.1 ? 0 : -2.4;
      if (want < 0 && car.grounded && ufoT > 4.4) return;
      b.velocity.y += (want - b.velocity.y) * 0.1 + 20 / 60;
      b.velocity.x = b.velocity.x * 0.96 + (UFO.x - p.x) * 0.05; b.velocity.z = b.velocity.z * 0.96 + (UFO.z - p.z) * 0.05;
      b.angularVelocity.y += (1.4 - b.angularVelocity.y) * 0.04;
      b.angularVelocity.x *= 0.9; b.angularVelocity.z *= 0.9;
    }
  });
  fun.onVideo = v => { tvDirect = !audio.tvAttach(v); if (tvDirect) v.volume = 0; };
  // tag tree colliders
  phys.statics.forEach(b => { const p = b.position; const t = TREES.find(t => Math.abs(t.x - p.x) < 0.01 && Math.abs(t.z - p.z) < 0.01); if (t) b.userData = { tree: t.id, t }; });
  resize();
}
function camDist(p) { return Math.hypot(p.x - carPos.x, p.z - carPos.z); }

function startGame() {
  if (S.state !== 'intro') return;
  S.state = 'play';
  audio.init(); audio.setMuted(store.get('muted', false)); ui.setSound(!audio.muted);
  audio.setMusic(store.get('music', true)); ui.setMusic(audio.musicOn);
  audio.setSfx(store.get('sfx', true)); ui.setSfx(audio.sfxOn);
  ui.started();
  syncCar();
  rig.startSwoop();
  reveal.t = 0;
  audio.reveal();
  if (WINTER) setTimeout(() => ui.toast('Зима на острове', 'До весны тут лежит снег. Снеговиков можно сбивать', 'ach', '❄'), GUEST.to || GUEST.n ? 6600 : 2600);
  // personal link: greet the company and point at the matching concept
  if (GUEST.to || GUEST.n) setTimeout(() => {
    const ni = NICHE[GUEST.n];
    ui.toast(GUEST.to ? GUEST.to + ', добро пожаловать!' : 'Добро пожаловать!', ni ? 'Начните с ' + ni.what + (touch ? '. Карта — кнопка с меткой вверху' : '. Карта: клавиша M') : 'Здесь все мои проекты. Покатайтесь по острову', 'ach', '♥');
  }, 2600);
  renderer.domElement.focus({ preventScroll: true });
}
function goToZone(id) {
  const z = ZONE[id]; if (!z || S.state !== 'play') return;
  // drop the car just south of the zone ring, facing it
  const x = z.t[0], zz = z.t[1] + 1.2;
  car.place(x, zz, 0);
  syncCar(); rig.snap(carPos);
  glow.burst(carPos.x, carPos.y + 0.5, carPos.z, 26, 3, 3, 0.8, 0.5, 0.1, [lin(0xFF4FA0), lin(0xFFF1DC)], { grav: -1, drag: 2 });
  audio.whoosh();
}
function goToPoi(id) {
  const p = POIS.find(q => q.id === id); if (!p || S.state !== 'play') return;
  if (Math.hypot(carPos.x - p.go[0], carPos.z - p.go[1]) < 3) return;
  car.place(p.go[0], p.go[1], p.go[2]);
  syncCar(); rig.snap(carPos);
  glow.burst(carPos.x, carPos.y + 0.5, carPos.z, 26, 3, 3, 0.8, 0.5, 0.1, [lin(0xFF4FA0), lin(0xFFF1DC)], { grav: -1, drag: 2 });
  audio.whoosh();
}
function cycleTime() { const n = env.next(); if (n === 'night' && activeZone && activeZone.id === 'contact') unlock('night'); audio.click(); }
function openZone(z) {
  ui.openPanel(z); audio.open();
  if (!S.visited.has(z.id)) { S.visited.add(z.id); store.set('visited', [...S.visited]); if (S.visited.size >= ZONES.length) unlock('reader'); }
}
function respawn(manual) {
  if (respawnLock > 0) return;
  let { x, z, yaw } = lastSafe;
  if (manual) {
    const n = nearestRoad(carPos.x, carPos.z);
    if (n && n.d < 30) { x = n.x; z = n.z; yaw = Math.atan2(-n.dx, -n.dz); if (Math.abs(wrapAngle(yaw - car.yaw)) > Math.PI / 2) yaw += Math.PI; }
    if (riverD.get(x, z) < RIVER_W + 3.5) { x = lastSafe.x; z = lastSafe.z; yaw = lastSafe.yaw; }
  }
  car.place(x, z, yaw);
  syncCar(); rig.snap(carPos);
  glow.burst(carPos.x, carPos.y + 0.5, carPos.z, 26, 3, 3, 0.8, 0.5, 0.1, [lin(0xFF4FA0), lin(0xFFF1DC)], { grav: -1, drag: 2 });
  audio.whoosh();
  fallT = drownT = 0; respawnLock = 0.6;
}
function honk() {
  const f = zones.anim.fountain;
  if (f && Math.hypot(carPos.x - f.x, carPos.z - f.z) < 7.5) {
    // a coin flies into the fountain
    const dx = f.x - carPos.x, dz = f.z - carPos.z;
    for (let k = 0; k < 3; k++) glow.emit(carPos.x, carPos.y + 1.4, carPos.z, dx * 0.55 + (rand() - 0.5) * 0.4, 6.5 + k * 0.6, dz * 0.55 + (rand() - 0.5) * 0.4, 1.15, 0.36, 0.3, lin(0xFFD24A), { grav: 13, drag: 0.1, shape: 2 });
    setTimeout(() => { audio.jingle(false); fx.burst(f.x, f.y + 0.6, f.z, 18, 2.2, 3, 0.8, 0.25, 0.4, [lin(0xFFFFFF), lin(0xBFF4FF)], { grav: 10, drag: 1 }); unlock('wish'); }, 900);
  }
  // jukebox: next track
  if (Math.hypot(carPos.x - JUKE.x, carPos.z - JUKE.z) < 5) {
    const name = audio.nextTrack();
    audio.notes();
    for (let k = 0; k < 14; k++) glow.emit(JUKE.x + (rand() - 0.5) * 1.2, fun.juke.y, JUKE.z + 0.4, (rand() - 0.5) * 1.6, 1.6 + rand() * 1.6, (rand() - 0.5) * 1.6, 1.6 + rand(), 0.28, 0.12, CONF[k % CONF.length], { grav: -0.6, drag: 0.8, shape: 2 });
    if (!unlock('dj')) ui.toast('Играет: ' + name, audio.musicOn ? 'Посигнальте ещё раз, чтобы сменить трек' : 'Музыка выключена в меню', 'ach', '♪');
    else ui.toast('Играет: ' + name, 'Посигнальте ещё раз, чтобы сменить трек', 'ach', '♪');
  }
  // popcorn stand: a honk pops a batch
  if (fun.kiosk && Math.hypot(carPos.x - fun.kiosk.x, carPos.z - fun.kiosk.z) < 5.5) {
    audio.popcorn();
    for (let k = 0; k < 26; k++) fx.emit(fun.kiosk.x + 0.45 + (rand() - 0.5) * 0.6, fun.kiosk.y, fun.kiosk.z - 0.1, (rand() - 0.5) * 3, 3 + rand() * 4, (rand() - 0.5) * 3 + 0.8, 1.6 + rand(), 0.16, 0.14, rand() < 0.3 ? lin(0xF6D57A) : lin(0xFFF6E2), { grav: 9, drag: 0.6, shape: 1 });
  }
  // the UFO answers at night
  if (env.night > 0.5 && Math.hypot(carPos.x - UFO.x, carPos.z - UFO.z) < 7.5 && ufoT < 0) {
    ufoT = 0; ufoCine = 7.3; fun.ufoStart(); audio.ufo(); setCine('ufo');
  }
  // ducks in the pond answer
  if (Math.hypot(carPos.x - POND.x, carPos.z - POND.z) < 16) { hornNear = 1.2; setTimeout(() => audio.quack(), 450); }
}
function openBrief(id) {
  const pre = { auto: { biz: 'auto', need: ['booking'] }, dt: { biz: 'detailing', need: ['booking'] }, salon: { biz: 'salon', need: ['booking'] }, vpn: { need: ['bot'] }, proxy: { need: ['bot'] } }[id] || {};
  const guest = {};
  if (GUEST.n) guest.biz = GUEST.n;
  if (GUEST.to) guest.name = GUEST.to;
  audio.click && audio.click();
  window.PetrBrief.open(Object.assign({ source: 'game' }, pre, guest));
}
function setCine(who) {
  if (who === cineWho) return;
  cineWho = who;
  if (!who) { rig.cine(false); return; }
  const sh = SHOTS[who], ref = who === 'tv' ? TV : UFO, gy = heightAt(ref.x, ref.z);
  rig.cine(true, tmpV.set(sh.pos[0], gy + sh.pos[1], sh.pos[2]), new THREE.Vector3(sh.look[0], gy + sh.look[1], sh.look[2]), sh.fov, sh.fitW);
}
function creditToast() { ui.toast('В эфире: ' + VIDEO.title, VIDEO.credit, 'ach', '▶'); }
function countWreck(it) {
  if (it.knocked) return;
  it.knocked = true; S.wreck++;
  if (S.wreck >= 40) unlock('wreck');
}
function snowCol(k = 1) { const n = env.night; return [(0.95 - 0.62 * n) * k, (0.97 - 0.6 * n) * k, (1.0 - 0.3 * n) * k]; }
function sparks(p, kind, k = 1) {
  if (kind === 'snow') {
    const c1 = snowCol(), c2 = snowCol(0.86);
    fx.burst(p.x, p.y - 0.2, p.z, Math.round(46 * k), 4.6, 5.5, 1.3, 0.3, 0.18, [c1, c2], { grav: 10, drag: 1.3, shape: 2, spread: 1.2 });
    fx.burst(p.x, p.y - 0.4, p.z, Math.round(16 * k), 1.8, 1.4, 1.8, 0.9, 2.0, c1, { grav: -0.3, drag: 2.2, alpha: 0.6, spread: 1.4 });
    if (k >= 1) { fx.burst(p.x, p.y + 0.6, p.z, 3, 3, 6, 1.6, 0.14, 0.14, lin(0xFF8A3D), { grav: 12, drag: 0.6, shape: 1 }); fx.burst(p.x, p.y + 0.8, p.z, 5, 3, 5, 1.6, 0.1, 0.1, lin(0x23263A), { grav: 12, drag: 0.6, shape: 2 }); }
    return;
  }
  if (kind === 'metal') glow.burst(p.x, p.y + 0.6, p.z, Math.round(14 * k), 5, 4, 0.5, 0.18, 0.04, [lin(0xFFD27A), lin(0xFFFFFF)], { grav: 14, drag: 1.5, shape: 2 });
  else if (kind === 'wood') fx.burst(p.x, p.y + 0.4, p.z, Math.round(12 * k), 3.5, 4, 0.9, 0.16, 0.12, [lin(0xC28A5C), lin(0x9A6440), lin(0xE8C49A)], { grav: 14, drag: 1, shape: 1 });
  else fx.burst(p.x, p.y + 0.3, p.z, Math.round(8 * k), 3, 3, 0.7, 0.22, 0.1, [lin(0xFFFFFF), lin(0xFF8A3D)], { grav: 10, drag: 1.2, shape: 2 });
}
function hitTree(id, v) {
  const t = TREES.find(t => t.id === id); if (!t) return;
  audio.hit('tree', v * 1.2);
  if (v > 1.5) {
    let slot = wob.findIndex(w => w.id === id); if (slot < 0) slot = wob.length < 4 ? wob.length : wob.reduce((m, w, i, a) => (w.t > a[m].t ? i : m), 0);
    const dx = t.x - carPos.x, dz = t.z - carPos.z, l = Math.hypot(dx, dz) || 1;
    wob[slot] = { id, t: 0, a: Math.min(0.5, v * 0.06), dx: dx / l, dz: dz / l };
    const col = t.type === 'pink' ? [lin(0xFF8CC6), lin(0xFFB3D9)] : t.type === 'pine' ? [lin(0x2C8A68), lin(0x379E72)] : [lin(0x69C462), lin(0x55B65A), lin(0x93CF68)];
    fx.burst(t.x, heightAt(t.x, t.z) + t.h * 0.75, t.z, Math.round(10 + v * 2), 2.2, 1.5, 2.4, 0.3, 0.22, col, { grav: 2.2, drag: 1.6, shape: 1, spread: 2.2 });
  }
}
function hidePool(i) { const m = new THREE.Matrix4().makeScale(0, 0, 0); props.pools.setMatrixAt(i, m); props.pools.instanceMatrix.needsUpdate = true; }
function resetPools() {
  const m = new THREE.Matrix4();
  props.sets.lamp.items.forEach((it, i) => { const p = it.home.p; props.pools.setMatrixAt(i, m.makeTranslation(p.x, Math.max(heightAt(p.x, p.z), -0.3) + 0.06, p.z)); });
  props.pools.instanceMatrix.needsUpdate = true;
}

function syncCar() {
  const b = car.body;
  model.group.position.copy(b.interpolatedPosition);
  model.group.quaternion.copy(b.interpolatedQuaternion);
  const v = car.vehicle;
  for (let i = 0; i < 4; i++) {
    const w = v.wheelInfos[i], m = model.wheels[i], cp = w.chassisConnectionPointLocal;
    m.position.set(cp.x, cp.y - w.suspensionLength, cp.z);
    m.rotation.set(w.rotation, w.steering, 0, 'YXZ');
  }
  carPos.copy(model.group.position);
  carVel.set(b.velocity.x, b.velocity.y, b.velocity.z);
  U.car.value.copy(carPos);
}

// ---------- per-frame gameplay ----------
const tmpV = new THREE.Vector3();
const Y1 = new CANNON.Vec3(0, 1, 0), tmpC = new CANNON.Vec3(), tmpC2 = new CANNON.Vec3();
let dominoDone = false, goalT = 0, knockCheck = 0, ambT = 0;
function gameplay(dt, t) {
  const b = car.body, p = b.position;
  // water & falling
  const ground = heightAt(p.x, p.z);
  car.inWater = p.y < WATER_Y + 0.35 && riverD.get(p.x, p.z) < RIVER_W + 2.2;
  if (car.inWater && Math.abs(car.speed) > 2 && rand() < 0.5) fx.emit(p.x + (rand() - 0.5) * 1.6, WATER_Y + 0.1, p.z + (rand() - 0.5) * 1.6, (rand() - 0.5) * 2, 2.5 + rand() * 2.5, (rand() - 0.5) * 2, 0.7, 0.32, 0.5, lin(0xE8FBFF), { grav: 9, drag: 1, alpha: 0.85 });
  if (car.inWater && !car._wasWater) { audio.splash(); fx.burst(p.x, WATER_Y + 0.1, p.z, 30, 4, 6, 0.9, 0.35, 0.6, [lin(0xFFFFFF), lin(0xBFF4FF)], { grav: 12, drag: 1 }); }
  car._wasWater = car.inWater;
  if (p.y < -1.05 && car.inWater) { drownT += dt; if (drownT > 0.9) respawn(false); } else drownT = 0;
  if (p.y < -7) {
    if (fallT === 0) { unlock('space'); audio.whoosh(); }
    fallT += dt;
    if (fallT > 1.6) respawn(false);
  }
  respawnLock = Math.max(0, respawnLock - dt);
  // last safe spot
  safeT += dt;
  if (safeT > 0.4) {
    safeT = 0;
    if (car.grounded >= 3 && car.up().y > 0.8 && edgeDist(p.x, p.z) > 4 && ground > -0.15 && !car.inWater && roadD.get(p.x, p.z) < 6 && riverD.get(p.x, p.z) > RIVER_W + 3.5) lastSafe = { x: p.x, z: p.z, yaw: car.yaw };
  }
  // airtime: river jump + landing
  if (car.grounded === 0) {
    if (air0 === 0) { air0 = t; overRiver = false; airPeakVy = 0; }
    if (riverD.get(p.x, p.z) < RIVER_W && p.y > WATER_Y + 0.8) overRiver = true;
    airPeakVy = Math.min(airPeakVy, b.velocity.y);
  } else if (air0) {
    const dur = t - air0;
    if (dur > 0.35) {
      audio.land(-airPeakVy);
      rig.shake = Math.min(0.8, -airPeakVy / 16);
      fx.burst(p.x, ground + 0.1, p.z, 18, 3, 1.5, 0.9, 0.5, 0.9, [lin(0xE9DCC4), lin(0xD8C8A8)], { grav: 1, drag: 2.5, spread: 1.6 });
      if (overRiver && !car.inWater && heightAt(p.x, p.z) > -0.3) unlock('river');
    }
    air0 = 0;
  }
  // zones
  let best = null, bd = 1e9;
  for (const m of zones.markers) {
    const d = Math.hypot(p.x - m.z.t[0], p.z - m.z.t[1]);
    m.active = d < m.z.r;
    if (d < m.z.r && d < bd) { bd = d; best = m.z; }
  }
  if (best !== activeZone) {
    activeZone = best;
    ui.prompt(best);
    if (best) { audio.pop(); if (best.id === 'contact' && env.name === 'night') unlock('night'); }
  }
  if (ui.panelId && (!activeZone || activeZone.id !== ui.panelId)) {
    const z = ZONE[ui.panelId];
    if (Math.hypot(p.x - z.t[0], p.z - z.t[1]) > z.r + 6) ui.closePanel();
  }
  // ducks & wrench
  props.ducks.forEach(d => {
    const u = d.userData; if (u.got) return;
    if (Math.hypot(p.x - u.x, p.z - u.z) < 2.9 && Math.abs(p.y - u.y) < 3) {
      u.got = true; d.visible = false; S.ducks.add(u.i); store.set('ducks', [...S.ducks]);
      audio.quack();
      glow.burst(u.x, u.y + 0.8, u.z, 24, 3, 4, 0.9, 0.35, 0.08, [lin(0xFFD23F), lin(0xFFF1DC)], { grav: 4, drag: 2, shape: 2 });
      ui.toast('Уточка ' + S.ducks.size + ' из 5', S.ducks.size < 5 ? 'Остальные где-то рядом' : 'Все уточки нашлись', 'duck', '');
      refreshCounts();
      if (S.ducks.size >= 5) unlock('ducks');
    }
  });
  if (hornNear > 0) { hornNear -= dt; props.ducks.forEach((d, i) => { if (!d.userData.got) d.position.y += Math.sin(hornNear * 18 + i) * 0.04; }); }
  const w = props.wrench.userData;
  if (!w.got && Math.hypot(p.x - w.x, p.z - w.z) < 2.7) { w.got = true; props.wrench.visible = false; unlock('wrench'); }
  // domino chain assist: a falling domino nudges its neighbour so the wave keeps going
  {
    const doms = props.sets.domino.items, n = doms.length;
    for (let i = 0; i < n; i++) {
      const bi = doms[i].body;
      if (bi.sleepState === CANNON.Body.SLEEPING) continue;
      const up = bi.quaternion.vmult(Y1, tmpC);
      if (up.y > 0.94) continue;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= n || doms[j].kicked) continue;
        const bj = doms[j].body;
        let dx = bj.position.x - bi.position.x, dz = bj.position.z - bi.position.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (up.x * dx + up.z * dz < 0.12) continue;
        if (bj.quaternion.vmult(Y1, tmpC2).y < 0.97) { doms[j].kicked = true; continue; }
        bj.wakeUp(); bj.angularVelocity.set(dz * 3.2, 0, -dx * 3.2); bj.velocity.set(dx * 0.4, 0, dz * 0.4);
        doms[j].kicked = true;
        if (camDist(bj.position) < 40) audio.hit('plastic', 2.5);
      }
    }
  }
  // knocked props / dominoes / goal
  knockCheck += dt;
  if (knockCheck > 0.25) {
    knockCheck = 0;
    let down = 0;
    const doms = props.sets.domino.items;
    for (const it of props.items) {
      const bb = it.body;
      if (bb.type === CANNON.Body.STATIC) continue;
      if (bb.position.y < -40) { it.set.reset(it); continue; }
      const up = bb.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      if (!it.knocked && it.set.def.kind !== 'ball' && (bb.position.distanceTo(it.home.p) > 1.2 || up.y < 0.6)) countWreck(it);
      if (it.set === props.sets.domino && up.y < 0.5) down++;
    }
    if (!dominoDone && down >= doms.length * 0.85) { dominoDone = true; unlock('domino'); }
  }
  // goal (checked every frame: the ball can bounce off the net quickly)
  {
    const ball = props.sets.ball.items[0];
    if (ball && goalT <= 0) {
      const bp = ball.body.position;
      for (const s of [-1, 1]) {
        const gx = PITCH.x + s * (PITCH.hw + 0.35);
        if (s * (bp.x - gx) > 0.25 && s * (bp.x - gx) < 1.3 && Math.abs(bp.z - PITCH.z) < 1.62 && bp.y < 2.2) {
          goalT = 3; unlock('goal') || ui.toast('Гол!', 'Мяч вернётся в центр', 'ach', '⚽');
          confetti(gx + s * 0.6, bp.y + 1, bp.z, 80); audio.jingle(false);
        }
      }
    }
  }
  if (goalT > 0) { goalT -= dt; if (goalT <= 0) { const ball = props.sets.ball.items[0]; ball.set.reset(ball); ball.body.wakeUp(); } }
  // drive-in: park in front of the giant TV to watch the cartoon
  {
    const inPark = Math.abs(p.x - PARK.x) < PARK.hw && Math.abs(p.z - PARK.z) < PARK.hz;
    if (inPark && Math.abs(car.speed) < 0.9 && !ui.overlayOpen) parkT += dt; else if (Math.abs(car.speed) > 1.4 || !inPark) parkT = 0;
    const watching = parkT > 0.9 && ufoCine <= 0;
    if (watching && cineWho !== 'tv') {
      setCine('tv');
      const evs = fun.tv.watchStart();
      if (evs.includes('video')) creditToast();
      watchT = 0;
      if (!S.tvHint) { S.tvHint = true; ui.toast('Остров ТВ', 'Тронетесь с места — камера вернётся', 'ach', '▶'); }
    } else if (!watching && cineWho === 'tv') setCine(null);
    if (watching) { watchT += dt; if (watchT > 27) unlock('tv'); }
  }
  // bowling: knock pins, count after the dust settles, reset when the lane is clear
  {
    const bw = fun.bowl, pins = bw.pins.items;
    if (bw.resetT > 0) {
      bw.resetT -= dt;
      if (bw.resetT <= 0) {
        if (Math.hypot(p.x - bw.x, p.z - bw.z) > 6.5) pins.forEach(it => it.set.reset(it)); else bw.resetT = 0.5;
      }
    } else {
      let moved = 0, down = 0;
      for (const it of pins) {
        const b = it.body, d = b.position.distanceTo(it.home.p), up = b.quaternion.vmult(Y1, tmpC).y;
        if (d > 0.3 || up < 0.85) moved++;
        if (up < 0.6 || d > 1.3 || b.position.y < it.home.p.y - 0.4) down++;
      }
      if (moved && !bw.armed) { bw.armed = true; bw.t = 0; }
      if (bw.armed) {
        bw.t += dt;
        if (bw.t > 3.2) {
          bw.armed = false; bw.resetT = 2.2;
          if (down >= 10) { if (!unlock('strike')) ui.toast('Страйк!', 'Все десять кеглей', 'ach', '★'); confetti(bw.x + 1, heightAt(bw.x, bw.z) + 2, bw.z, 90); audio.jingle(true); }
          else if (down > 0) ui.toast('Кегли: ' + down + ' из 10', 'Разгонитесь по дорожке посильнее', 'ach', '●');
        }
      }
    }
  }
  // title letters: count knocks, bring them home when nobody is looking
  zones.letters.update(dt, p, () => { lettersN++; S.wreck++; if (lettersN >= 20) unlock('letters'); if (S.wreck >= 40) unlock('wreck'); });
  // crop circles: a hint for the night secret
  if (Math.hypot(p.x - UFO.x, p.z - UFO.z) < 3) {
    if (!S.cropHint && env.night < 0.5) { S.cropHint = true; ui.toast('Странные круги', 'Кто-то оставил их ночью…', 'ach', '?'); }
    else if (!S.cropNight && env.night > 0.5 && ufoT < 0 && !S.got.has('ufo')) { S.cropNight = true; ui.toast('Круги светятся', 'Кажется, здесь кого-то ждут…', 'ach', '?'); }
  }
  if (ufoCine > 0) { ufoCine -= dt; if (ufoCine <= 0 && cineWho === 'ufo') setCine(null); }
  if (ufoT >= 0 && Math.hypot(p.x - UFO.x, p.z - UFO.z) > 10) { ufoT = -1; ufoCine = 0; if (cineWho === 'ufo') setCine(null); }
  if (ufoT >= 0) {
    const was = ufoT;
    ufoT += dt;
    if (was < 4 && ufoT >= 4) unlock('ufo');
    if (was < 6.3 && ufoT >= 6.3) audio.whoosh();
    if (ufoT > 7.8) ufoT = -1;
  }
  if (ufoT > 1.2 && ufoT < 5) {
    if (rand() < 0.5) glow.emit(p.x + (rand() - 0.5) * 3, p.y - 0.5, p.z + (rand() - 0.5) * 3, 0, 3 + rand() * 2, 0, 1.4, 0.3, 0.1, lin(0x9FFFE6), { grav: -1, drag: 0.5, shape: 2 });
  }
  // car wash
  const wsh = zones.anim.wash;
  if (wsh) {
    const lx = (p.x - wsh.x) * Math.cos(wsh.yaw) - (p.z - wsh.z) * Math.sin(wsh.yaw), lz = (p.x - wsh.x) * Math.sin(wsh.yaw) + (p.z - wsh.z) * Math.cos(wsh.yaw);
    if (Math.abs(lx) < 2.6 && Math.abs(lz) < 1.2) {
      if (washT <= 0) { unlock('wash') || ui.toast('Как новый', 'Мойка «Слой»', 'ach', '✦'); audio.whoosh(); model.paintMat.roughness = 0.08; setTimeout(() => setCarPaint(model, S.gold), 15000); }
      washT = 2;
      for (let k = 0; k < 4; k++) fx.emit(p.x + (rand() - 0.5) * 2.4, p.y + 0.6 + rand() * 1.8, p.z + (rand() - 0.5) * 2.4, (rand() - 0.5) * 1.5, 0.8 + rand(), (rand() - 0.5) * 1.5, 1.4, 0.35, 0.6, rand() < 0.5 ? lin(0xFFFFFF) : lin(0xCBE6FF), { grav: -0.3, drag: 1.2, alpha: 0.85, shape: 2 });
    }
    washT -= dt;
  }
  // mailbox
  const mb = zones.anim.mailbox;
  mailT -= dt;
  if (mb && mailT <= 0 && Math.hypot(p.x - mb[0], p.z - mb[1]) < 2.3) {
    mailT = 6;
    for (let k = 0; k < 14; k++) fx.emit(mb[0], heightAt(mb[0], mb[1]) + 1.5, mb[1], (rand() - 0.5) * 3, 5 + rand() * 4, (rand() - 0.5) * 3, 3.2, 0.42, 0.36, lin(0xFFFFFF), { grav: -1.2, drag: 0.5, shape: 1 });
    ui.toast('Письмо улетело', 'Адрес для писем на табличке у маяка', 'ach', '✉'); audio.whoosh();
  }
  // lap timer around the ring road
  const n = polyNearest(RING, p.x, p.z, true);
  if (n.d < 5) {
    lap.off = 0;
    if (lap.lastS !== null) {
      let d = n.s - lap.lastS;
      if (d > RING_LEN / 2) d -= RING_LEN; else if (d < -RING_LEN / 2) d += RING_LEN;
      const crossed = Math.abs(n.s - lap.lastS) > RING_LEN / 2;
      if (crossed && !lap.on) { lap.on = true; lap.t = 0; lap.prog = 0; }
      else if (lap.on) {
        lap.prog += d;
        if (Math.abs(lap.prog) >= RING_LEN - 1) {
          const tt = lap.t; lap.on = false; lap.show = 4.5;
          const isBest = !S.best || tt < S.best;
          if (isBest) { S.best = tt; store.set('best', tt); }
          unlock('lap') || ui.toast('Круг: ' + fmt(tt), isBest ? 'Новый рекорд' : 'Рекорд ' + fmt(S.best), 'ach', '⏱');
          lap.prog = 0;
        }
      }
    }
    lap.lastS = n.s;
  } else if (lap.on) { lap.off += dt; if (lap.off > 2.5) { lap.on = false; lap.lastS = null; } }
  else lap.lastS = null;
  if (lap.on) lap.t += dt;
  if (lap.show > 0) lap.show -= dt;
  ui.lap(lap.on || lap.show > 0, lap.on ? lap.t : (S.best || 0), S.best);
}

// effects tied to the car
let dustT = 0;
const wheelWorld = new CANNON.Vec3();
function carFx(dt) {
  const v = car.vehicle;
  const sliding = Math.abs(car.side) > 3.2 || (car.input.brake && Math.abs(car.speed) > 6);
  dustT += dt;
  const emit = dustT > 0.035; if (emit) dustT = 0;
  for (let i = 0; i < 4; i++) {
    const w = v.wheelInfos[i];
    if (!w.isInContact) { skids.lift(i); if (tracks && i >= 2) tracks.lift(i - 2); continue; }
    const hp = w.raycastResult.hitPointWorld;
    const onRoad = roadD.get(hp.x, hp.z) < 2.6;
    if (i >= 2 && sliding) skids.add(i, hp.x, hp.y, hp.z); else skids.lift(i);
    // tracks in the snow: rear wheels, off the swept roads, on the ground itself
    if (tracks && i >= 2) { if (!onRoad && !car.inWater && hp.y < heightAt(hp.x, hp.z) + 0.25) tracks.add(i - 2, hp.x, hp.y, hp.z); else tracks.lift(i - 2); }
    if (!emit) continue;
    const hard = car.input.throttle > 0.6 && Math.abs(car.speed) < 9 && Math.abs(car.speed) > 0.5;
    if ((sliding || (hard && i >= 2) || (car.boosting && i >= 2)) && !car.inWater) {
      const col = WINTER && !onRoad ? snowCol() : onRoad ? lin(0xF6B67E) : lin(0xC8B46C);
      fx.emit(hp.x, hp.y + 0.15, hp.z, (rand() - 0.5) * 1.2 - car.body.velocity.x * 0.12, 0.6 + rand(), (rand() - 0.5) * 1.2 - car.body.velocity.z * 0.12, 0.9 + rand() * 0.6, 0.45, 1.5, col, { grav: -0.4, drag: 2.2, alpha: onRoad ? 0.55 : 0.7 });
    }
  }
  // winter: powder thrown up behind the rear wheels
  if (WINTER && Math.abs(car.speed) > 4 && car.grounded > 2 && !car.inWater) {
    for (let i = 2; i < 4; i++) {
      if (rand() > 0.55) continue;
      const hp = v.wheelInfos[i].raycastResult.hitPointWorld;
      if (roadD.get(hp.x, hp.z) < 2.6) continue;
      const vv = car.body.velocity, k = Math.min(1, Math.abs(car.speed) / 18);
      fx.emit(hp.x, hp.y + 0.12, hp.z, (rand() - 0.5) * 1.6 - vv.x * 0.18, 1.4 + rand() * 2.4 * k, (rand() - 0.5) * 1.6 - vv.z * 0.18, 0.7 + rand() * 0.5, 0.16 + rand() * 0.1, 0.1, snowCol(0.92 + rand() * 0.08), { grav: 7, drag: 1.5, shape: 2, alpha: 0.9 });
    }
  }
  // fallen leaves kicked up by the wheels on the paths
  if (!WINTER && Math.abs(car.speed) > 6 && car.grounded > 2 && rand() < 0.22) {
    const w = v.wheelInfos[2 + Math.floor(rand() * 2)];
    const hp = w.raycastResult.hitPointWorld;
    if (grassAt(hp.x, hp.z) < 0.4) fx.emit(hp.x, hp.y + 0.15, hp.z, (rand() - 0.5) * 2 + car.body.velocity.x * 0.25, 2 + rand() * 2.5, (rand() - 0.5) * 2 + car.body.velocity.z * 0.25, 1.4 + rand(), 0.22, 0.18, LEAF[Math.floor(rand() * LEAF.length)], { grav: 6, drag: 1.6, shape: 1 });
  }
  if (car.boosting) {
    const e = car.body.pointToWorldFrame(new CANNON.Vec3(0.42, OFF - 0.12, 1.45), wheelWorld);
    const vv = car.body.velocity;
    for (let k = 0; k < 2; k++) glow.emit(e.x, e.y, e.z, vv.x * 0.6 + (rand() - 0.5), vv.y * 0.5 + rand() * 0.5, vv.z * 0.6 + (rand() - 0.5), 0.25 + rand() * 0.15, 0.55, 0.1, rand() < 0.5 ? lin(0xFFB24A) : lin(0xFF5FA8), { drag: 3 });
  }
}

function ambientSound(dt) {
  if (S.state !== 'play') return;
  const f = zones.anim.fire, ft = zones.anim.fountain;
  let trees = 0;
  for (let i = 0; i < TREES.length; i += 3) { const tr = TREES[i]; if (Math.abs(tr.x - carPos.x) < 14 && Math.abs(tr.z - carPos.z) < 14) trees++; }
  audio.ambient(dt, {
    water: Math.max(0, riverD.get(carPos.x, carPos.z) - RIVER_W),
    fall: FALL ? Math.hypot(FALL.x - carPos.x, FALL.z - carPos.z) : 999,
    fire: f ? Math.hypot(f[0] - carPos.x, f[2] - carPos.z) : 999,
    fountain: ft ? Math.hypot(ft.x - carPos.x, ft.z - carPos.z) : 999,
    night: env.night, trees: Math.min(1, trees / 6), height: Math.max(0, carPos.y)
  });
}
function ambient(dt, t) {
  ambientSound(dt);
  ambT += dt;
  if (ambT < 0.06) return;
  ambT = 0;
  const night = env.night;
  // campfire embers + smoke
  const f = zones.anim.fire;
  if (f && camDist({ x: f[0], z: f[2] }) < 60) {
    glow.emit(f[0] + (rand() - 0.5) * 0.5, f[1], f[2] + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.6, 1.5 + rand() * 1.5, (rand() - 0.5) * 0.6, 1.2 + rand(), 0.16, 0.04, rand() < 0.5 ? lin(0xFFB24A) : lin(0xFF7A2A), { drag: 0.6, shape: 2 });
    fx.emit(f[0], f[1] + 0.8, f[2], (rand() - 0.5) * 0.4, 1.2, (rand() - 0.5) * 0.4, 2.6, 0.5, 1.8, lin(0x8C8A9E), { drag: 0.4, alpha: 0.35 });
  }
  const s = zones.anim.smoke;
  if (s && rand() < 0.6) fx.emit(s[0], s[1], s[2], 0.3 + (rand() - 0.5) * 0.3, 1.0, (rand() - 0.5) * 0.3, 3, 0.5, 1.6, lin(0xE6E2EE), { drag: 0.3, alpha: 0.5 });
  // fountain spray
  const ft = zones.anim.fountain;
  if (ft && camDist({ x: ft.x, z: ft.z }) < 45) {
    for (let k = 0; k < 3; k++) { const a = rand() * TAU, s = 0.35 + rand() * 0.5; fx.emit(ft.x, ft.y + 3.5, ft.z, Math.cos(a) * s, 3.2 + rand() * 1.2, Math.sin(a) * s, 0.9, 0.16, 0.12, lin(0xE6FBFF), { grav: 9, drag: 0.3, alpha: 0.85, shape: 2 }); }
    const a = rand() * TAU; fx.emit(ft.x + Math.cos(a) * 1.6, ft.y + 0.55, ft.z + Math.sin(a) * 1.6, Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.4, 0.6, 0.22, 0.4, lin(0xFFFFFF), { grav: 4, drag: 1, alpha: 0.6 });
  }
  // waterfall mist
  if (FALL && camDist({ x: FALL.x, z: FALL.z }) < 70) {
    for (let k = 0; k < 2; k++) fx.emit(FALL.x + FALL.dx * (2 + rand() * 4) + (rand() - 0.5) * 5, WATER_Y - 2 - rand() * 14, FALL.z + FALL.dz * (2 + rand() * 4) + (rand() - 0.5) * 5, FALL.dx * 0.8, -2 - rand() * 2, FALL.dz * 0.8, 2.2, 0.8, 3.2, lin(0xF2FBFF), { drag: 0.4, alpha: 0.4 });
  }
  // fireflies at night
  if (night > 0.5 && !WINTER) for (let k = 0; k < 2; k++) {
    const a = rand() * TAU, r = 6 + rand() * 22, x = carPos.x + Math.cos(a) * r, z = carPos.z + Math.sin(a) * r;
    if (!inside(x, z, 1)) continue;
    glow.emit(x, heightAt(x, z) + 0.5 + rand() * 1.8, z, (rand() - 0.5) * 0.6, (rand() - 0.2) * 0.4, (rand() - 0.5) * 0.6, 2.5 + rand() * 2, 0.22, 0.18, lin(0xD8FF8A), { drag: 0.2, shape: 2 });
  }
}

// ---------- reveal + screen-space helpers ----------
const reveal = { t: -1, r0: 6.8, centre: new THREE.Vector2(0, 11.2) };
const introTarget = new THREE.Vector3(0, 0, 11.6);
const easeIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function updateReveal(dt) {
  if (!revPass) return;
  const u = revPass.uniforms;
  if (reveal.t < 0) {
    revPass.enabled = true;
    u.uCenter.value.copy(reveal.centre);
    u.uRadius.value = reveal.r0 + Math.sin(U.time.value * 1.3) * 0.08;
    u.uFade.value = 0;
  } else if (revPass.enabled) {
    reveal.t += dt;
    const k = Math.min(1, reveal.t / 3.4);
    u.uRadius.value = reveal.r0 + easeIO(k) * 150;
    u.uFade.value = smooth(2.3, 3.4, reveal.t);
    if (reveal.t > 3.45) revPass.enabled = false;
  }
  if (revPass.enabled) revPass.sync(camera);
}
const _cs = new THREE.Vector3(), _cr = new THREE.Vector3(), _db = new THREE.Vector2();
function updateCarScreen() {
  renderer.getDrawingBufferSize(_db);
  camera.updateMatrixWorld();
  _cs.copy(carPos); _cs.y += 0.7;
  const depth = -_cs.clone().applyMatrix4(camera.matrixWorldInverse).z;
  _cr.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(2.9).add(_cs);
  _cs.project(camera); _cr.project(camera);
  const x = (_cs.x * 0.5 + 0.5) * _db.x, y = (_cs.y * 0.5 + 0.5) * _db.y;
  const rx = (_cr.x * 0.5 + 0.5) * _db.x, ry = (_cr.y * 0.5 + 0.5) * _db.y;
  SU.uCarScr.value.set(x, y, depth, Math.max(8, Math.hypot(rx - x, ry - y)));
}
const _gc = new THREE.Vector3(), _sDir = new THREE.Vector3();
const MARKS = [...ZONES, ...POIS];
const _mk = new THREE.Vector3(), markPts = MARKS.map(() => ({ x: 0, y: 0, vis: false, near: false }));
const _mc = new THREE.Vector3(), _mr = new THREE.Vector3(), carBox = { x0: 0, x1: 0, y0: 0, y1: 0 };
function updateMarks(dt) {
  const w = innerWidth, h = innerHeight;
  // the jeep's box on screen: markers slide above it instead of covering it
  _mc.set(carPos.x, carPos.y + 0.8, carPos.z);
  _mr.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(1.9).add(_mc);
  _mc.project(camera); _mr.project(camera);
  const cx = (_mc.x * 0.5 + 0.5) * w, cy = (-_mc.y * 0.5 + 0.5) * h, hw = Math.abs((_mr.x - _mc.x) * 0.5 * w);
  carBox.x0 = cx - hw; carBox.x1 = cx + hw; carBox.y0 = cy - hw * 0.95; carBox.y1 = cy + hw * 0.6;
  MARKS.forEach((z, i) => {
    const p = markPts[i];
    const d = Math.hypot(z.t[0] - carPos.x, z.t[1] - carPos.z);
    const mx = z.mk ? z.mk[0] : z.t[0], mz = z.mk ? z.mk[1] : z.t[1], mh = z.mk ? z.mk[2] : 1.5;
    _mk.set(mx, heightAt(mx, mz) + mh, mz).project(camera);
    p.x = (_mk.x * 0.5 + 0.5) * w; p.y = (-_mk.y * 0.5 + 0.5) * h;
    p.vis = _mk.z < 1 && d < 46 && p.x > -40 && p.x < w + 40 && p.y > -40 && p.y < h + 40 && !ui.panelId && rig.cineK < 0.5;
    p.near = d < 15;
  });
  ui.updateMarks(markPts, activeZone ? activeZone.id : null, carBox, dt);
}

// ---------- adaptive resolution: keep the frame rate smooth on weaker GPUs ----------
const ar = { avg: 16.7, t: 0, cool: 0, scale: 1 };
function adaptRes(dt) {
  if (DEBUG || S.state !== 'play') return;
  ar.avg += (dt * 1000 - ar.avg) * 0.05;
  ar.t += dt; ar.cool = Math.max(0, ar.cool - dt);
  if (ar.t < 2) return;
  if (ar.avg > 21 && ar.scale > 0.6) { ar.scale = Math.max(0.6, ar.scale * 0.85); applyRes(); ar.t = 0; ar.cool = 25; }
  else if (ar.avg < 17.6 && ar.scale < 1 && ar.cool <= 0 && ar.t > 6) { ar.scale = Math.min(1, ar.scale * 1.1); applyRes(); ar.t = 0; }
}
function applyRes() {
  const pr = Math.max(0.6, quality.pr * ar.scale);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); resizePost(); }
}

// ---------- main loop ----------
let last = performance.now();
let simulating = false;
const origin = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.state === 'loading') return;
  U.time.value += dt;
  const t = U.time.value;
  if (!simulating) {
    if (S.state === 'play') Object.assign(car.input, input.state());
    car.control(dt);
    phys.step(dt);
  }
  syncCar();
  {
    const sp = car.speed, vy = car.body.velocity.y;
    const lon = (sp - (frame.sp ?? sp)) / Math.max(dt, 1e-3), vert = (vy - (frame.vy ?? vy)) / Math.max(dt, 1e-3);
    frame.sp = sp; frame.vy = vy;
    frame.lon = (frame.lon || 0) + (Math.max(-30, Math.min(30, lon)) - (frame.lon || 0)) * Math.min(1, dt * 10);
    frame.vert = (frame.vert || 0) + (Math.max(-60, Math.min(60, vert)) - (frame.vert || 0)) * Math.min(1, dt * 14);
    leanModel(model, dt, car.grounded ? sp * car.body.angularVelocity.y : 0, car.grounded ? frame.lon : 0, car.grounded ? frame.vert : 0);
  }
  props.sync();
  fun.bowl.pins.sync();
  zones.letters.sync();
  {
    const ev = fun.update(dt, t, { camDist: (x, z) => Math.hypot(x - camera.position.x, z - camera.position.z), night: env.night, playing: S.state === 'play' });
    const near = Math.max(0, 1 - Math.hypot(carPos.x - TV.x, carPos.z - TV.z - 9) / 30);
    const lvl = S.state === 'play' ? Math.max(near * 0.6, cineWho === 'tv' ? rig.cineK : 0) : 0;
    const vid = fun.tv.prog === 'video' && fun.tv.vok;
    audio.cartoonMusic(vid ? 0 : lvl);
    audio.tvLevel(vid ? lvl : 0);
    if (tvDirect && fun.tv.video) fun.tv.video.volume = audio.muted || !audio.sfxOn ? 0 : Math.min(1, (vid ? lvl : 0) * 0.9);
    audio.setDuck(Math.min(1, lvl * 1.4));
    if (ev.includes('video') && cineWho === 'tv') creditToast();
    if (lvl > 0.25) for (const e of ev) {
      if (e === 'quack') audio.quack(); else if (e === 'boing') audio.boing(); else if (e === 'thud') audio.land(5);
      else if (e === 'pop') audio.firework(); else if (e === 'iris') audio.whoosh(); else if (e === 'end') audio.jingle(false);
    }
  }
  if (S.state === 'play') { gameplay(dt, t); carFx(dt); }
  adaptRes(dt);
  ambient(dt, t);
  // tree wobble slots
  for (let i = 0; i < 4; i++) {
    const w = wob[i], u = U.wob.value[i];
    if (!w) { u.set(-1, 0, 0, 0); continue; }
    w.t += dt;
    const k = w.a * Math.exp(-w.t * 3.2) * Math.sin(w.t * 13);
    u.set(w.id, Math.abs(k) * 0.3, w.dx * k, w.dz * k);
    if (w.t > 2.5) wob[i] = null;
  }
  // car lights
  const night = env.night;
  model.spot.intensity = 26 * night;
  model.lightMat.color.setScalar(0.85 + night * 1.6);
  model.tailMat.color.setScalar(car.input.throttle < -0.1 || car.input.brake ? 2.2 : 0.9 + night * 0.6);
  // antenna wobble from acceleration
  const acc = tmpV.set(car.body.velocity.x - (syncCar.pv ? syncCar.pv.x : 0), 0, car.body.velocity.z - (syncCar.pv ? syncCar.pv.z : 0));
  syncCar.pv = syncCar.pv || new THREE.Vector3(); syncCar.pv.set(car.body.velocity.x, 0, car.body.velocity.z);
  model.antenna.rotation.x = THREE.MathUtils.damp(model.antenna.rotation.x, clamp(car.speed * 0.012 + acc.length() * 0.02, -0.5, 0.5), 6, dt);
  model.antenna.rotation.z = THREE.MathUtils.damp(model.antenna.rotation.z, clamp(-car.steer * 0.4, -0.4, 0.4), 6, dt);
  model.flag.rotation.y = Math.sin(t * 9) * 0.25;
  { const cc = rig.cineK > 0.4; if (cc !== frame.cine) { frame.cine = cc; document.body.classList.toggle('cine', cc); } }
  if (S.state === 'intro') { introTarget.y = carPos.y; rig.update(dt, introTarget, tmpV.set(0, 0, 0), 0, false, car.yaw); }
  else rig.update(dt, carPos, carVel, car.speed, car.boosting, car.yaw);
  env.update(dt, carPos);
  updateCarScreen();
  decor.grass.update(...(rig.groundCentre(_gc), [_gc.x, _gc.z]));
  updateReveal(dt);
  props.update(dt, t, night, env.lamps);
  if (bloomPass) { bloomPass.threshold = env.cur.bloomT; bloomPass.strength = env.cur.bloomS; }
  if (tiltPass) tiltPass.uniforms.uStrength.value = (ui.panelId ? 0.35 : 1) * (1 - rig.cineK * 0.75);
  props.poolMat.opacity = Math.min(0.95, env.lamps * 0.85);
  zones.update(dt, t, night);
  { const wu = terrain.water.userData.mat.uniforms; wu.uDeep.value.copy(env.cur.deep); wu.uShallow.value.copy(env.cur.shallow); wu.uLight.value = env.cur.wl; for (const wm of WATER_MATS) wm.uniforms.uLight.value = env.cur.wl * (env.night > 0.5 ? 0.75 : 1); }
  fx.update(dt); glow.update(dt); skids.update(dt);
  if (tracks) { tracks.update(dt); const n = env.night; tracks.uCol.value.set(0.3 - 0.2 * n, 0.36 - 0.22 * n, 0.62 - 0.3 * n, 0.3 + 0.12 * n); }
  if (snowfall) { camera.getWorldDirection(_sDir); snowfall.update(camera.position.x + _sDir.x * 18, camera.position.y + _sDir.y * 18, camera.position.z + _sDir.z * 18, env.night); }
  sky.dome.position.copy(camera.position);
  sky.stars.position.copy(camera.position);
  sky.clouds.rotation.y += dt * 0.003;
  if (S.state === 'play') {
    const slip = Math.abs(car.side) * (car.grounded ? 1 : 0) + (car.input.brake && Math.abs(car.speed) > 3 ? Math.abs(car.speed) * 0.35 : 0);
    audio.drive(dt, car.speed, car.input.throttle, slip, car.inWater, car.air, car.boosting, car.grounded, grassAt(carPos.x, carPos.z) > 0.5);
    audio.muffle(!!ui.panelId || ui.overlayOpen);
    ui.drawMini(carPos.x, carPos.z, car.yaw, rig.yaw);
    updateMarks(dt);
  }
  composer.render(dt);
}
requestAnimationFrame(frame);
build().catch(e => { console.error(e); ui.progress(1, 'Не получилось собрать остров. Обновите страницу.'); });

document.addEventListener('visibilitychange', () => {
  if (audio) { if (document.hidden) { audio.idle(); audio.pause(); } else if (S.state === 'play') audio.resume(); }
  if (document.hidden && fun && fun.tv.video) fun.tv.video.pause();
  last = performance.now();
});

if (DEBUG) {
  window.__isle = {
    THREE, scene, camera, renderer, S, SU, M, get model() { return model; }, get decor() { return decor; }, get audio() { return audio; }, get env() { return env; }, get rig() { return rig; }, get car() { return car; }, get phys() { return phys; }, get props() { return props; }, get zones() { return zones; }, get fun() { return fun; }, get letters() { return zones.letters; }, setCine: w => setCine(w), heightAt,
    get ready() { return S.state !== 'loading'; },
    start: () => startGame(),
    tod(n) { env.set(n); env.apply(1); },
    quality: h => setQuality(h),
    skipReveal() { reveal.t = 10; if (revPass) revPass.enabled = false; },
    view(x, z, yaw = 0, pitch = 0.64, dist = 22.5, carYaw) { if (S.state === 'intro') startGame(); reveal.t = 10; if (revPass) revPass.enabled = false; rig.mode = 'follow'; car.place(x, z, carYaw ?? car.yaw); rig.yaw = rig.yawT = yaw; rig.pitch = pitch; rig.dist = dist; rig.zoom = rig.zoomT = 1; syncCar(); rig.snap(carPos); },
    teleport(x, z, yaw = 0) { car.place(x, z, yaw); syncCar(); rig.snap(carPos); },
    sim(sec, inp = {}) {
      simulating = true;
      Object.assign(car.input, { throttle: 0, steer: 0, brake: false, boost: false }, inp);
      const n = Math.round(sec * 60);
      for (let i = 0; i < n; i++) { car.control(1 / 60); phys.stepFixed(1); syncCar(); gameplay(1 / 60, U.time.value += 1 / 60); }
      props.sync(); rig.snap(carPos);
      simulating = false;
      const p = car.body.position;
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), speed: +car.speed.toFixed(2), yaw: +car.yaw.toFixed(2), wheels: car.grounded, wreck: S.wreck, got: [...S.got] };
    },
    // follow a polyline (pure pursuit) for testing
    auto(sec, pts = RING, speed = 1, closed = true) {
      simulating = true;
      const n = Math.round(sec * 60);
      for (let i = 0; i < n; i++) {
        const p = car.body.position;
        const near = polyNearest(pts, p.x, p.z, closed);
        const L = pts.length;
        let j = near.i, acc = 0;
        while (acc < 7) { const a = pts[j % L], b = pts[(j + 1) % L]; acc += Math.hypot(b[0] - a[0], b[1] - a[1]); j++; if (!closed && j >= L - 1) break; }
        const tgt = pts[j % L];
        const want = Math.atan2(-(tgt[0] - p.x), -(tgt[1] - p.z));
        const err = wrapAngle(want - car.yaw);
        Object.assign(car.input, { throttle: speed, steer: clamp(err * 2.2, -1, 1), brake: false, boost: false });
        car.control(1 / 60); phys.stepFixed(1); syncCar(); gameplay(1 / 60, U.time.value += 1 / 60);
      }
      props.sync(); rig.snap(carPos);
      simulating = false;
      const p = car.body.position;
      return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), speed: +car.speed.toFixed(1), lapOn: lap.on, lapT: +lap.t.toFixed(1), prog: +lap.prog.toFixed(0), best: S.best, got: [...S.got] };
    },
    fps() { return new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 6) requestAnimationFrame(f); else r((n - 1) * 1000 / (performance.now() - t0)); }; requestAnimationFrame(f); }); },
    info() { renderer.info.autoReset = false; renderer.info.reset(); composer.render(0.016); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
    gpuTime(n = 20) { const t0 = performance.now(); for (let i = 0; i < n; i++) composer.render(0.016); renderer.getContext().finish(); return (performance.now() - t0) / n; }
  };
}
