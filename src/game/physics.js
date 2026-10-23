import * as CANNON from 'cannon-es';
import { heightAt } from './layout.js';

export const GRAVITY = -20;
export const STEP = 1 / 60;

// collision groups
export const G_GROUND = 1, G_CAR = 2, G_PROP = 4, G_STATIC = 8, G_DEBRIS = 16; // debris: loose things the wheels don't drive over (letters, pins)

export class Physics {
  constructor() {
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    w.solver.iterations = 12;
    w.defaultContactMaterial.friction = 0.4;
    w.defaultContactMaterial.restitution = 0.1;
    w.defaultContactMaterial.contactEquationStiffness = 5e6;
    w.defaultContactMaterial.contactEquationRelaxation = 4;
    this.mat = {
      ground: new CANNON.Material('ground'), car: new CANNON.Material('car'), prop: new CANNON.Material('prop'),
      ball: new CANNON.Material('ball'), slick: new CANNON.Material('slick'), domino: new CANNON.Material('domino'), pin: new CANNON.Material('pin')
    };
    const cm = (a, b, f, r) => w.addContactMaterial(new CANNON.ContactMaterial(this.mat[a], this.mat[b], { friction: f, restitution: r, contactEquationStiffness: 5e6, contactEquationRelaxation: 4 }));
    cm('car', 'ground', 0.02, 0.05);
    cm('car', 'prop', 0.08, 0.2);
    cm('car', 'slick', 0.0, 0.1);
    cm('prop', 'ground', 0.5, 0.08);
    cm('prop', 'prop', 0.45, 0.08);
    cm('ball', 'ground', 0.4, 0.62);
    cm('ball', 'car', 0.1, 0.55);
    cm('ball', 'prop', 0.3, 0.4);
    cm('domino', 'domino', 0.04, 0.0);
    cm('domino', 'ground', 0.9, 0.0);
    cm('domino', 'car', 0.1, 0.1);
    cm('domino', 'prop', 0.3, 0.05);
    // bowling pins: lively, they should scatter into each other
    cm('pin', 'pin', 0.25, 0.55);
    cm('pin', 'ground', 0.32, 0.22);
    cm('pin', 'car', 0.1, 0.45);
    cm('pin', 'prop', 0.3, 0.4);
    this.acc = 0;
    this.statics = [];
  }

  addHeightfield(min = -74, max = 74, es = 1) {
    const n = Math.round((max - min) / es) + 1;
    const data = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(heightAt(min + i * es, max - j * es));
      data.push(row);
    }
    const shape = new CANNON.Heightfield(data, { elementSize: es });
    const body = new CANNON.Body({ mass: 0, material: this.mat.ground, collisionFilterGroup: G_GROUND });
    body.addShape(shape);
    body.position.set(min, 0, max);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(body);
    this.ground = body;
    return body;
  }

  // static oriented box (yaw around y, optional pitch around local x)
  box(x, y, z, hx, hy, hz, yaw = 0, pitch = 0, mat = 'ground', roll = 0) {
    const b = new CANNON.Body({ mass: 0, material: this.mat[mat], collisionFilterGroup: G_STATIC });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    b.position.set(x, y, z);
    b.quaternion.setFromEuler(pitch, yaw, roll, 'YXZ');
    this.world.addBody(b);
    this.statics.push(b);
    return b;
  }
  cyl(x, y, z, r, h, mat = 'ground', seg = 8) {
    const b = new CANNON.Body({ mass: 0, material: this.mat[mat], collisionFilterGroup: G_STATIC });
    b.addShape(new CANNON.Cylinder(r, r, h, seg));
    b.position.set(x, y + h / 2, z);
    this.world.addBody(b);
    this.statics.push(b);
    return b;
  }
  sphere(x, y, z, r, mat = 'ground') {
    const b = new CANNON.Body({ mass: 0, material: this.mat[mat], collisionFilterGroup: G_STATIC });
    b.addShape(new CANNON.Sphere(r));
    b.position.set(x, y, z);
    this.world.addBody(b);
    this.statics.push(b);
    return b;
  }

  // variable frame -> fixed substeps (cannon interpolates bodies for rendering)
  step(dt) { this.world.step(STEP, Math.min(dt, 0.1), 5); }
  // deterministic stepping for tests
  stepFixed(n = 1) {
    for (let i = 0; i < n; i++) this.world.step(STEP);
    for (const b of this.world.bodies) { b.interpolatedPosition.copy(b.position); b.interpolatedQuaternion.copy(b.quaternion); }
  }
}
export { CANNON };
