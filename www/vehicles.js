import * as THREE from './three.module.min.js';
import { makeLabelTexture } from './world.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
let shadowTex = null;
function blobTex() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); shadowTex = new THREE.CanvasTexture(c); return shadowTex;
}

const plastic = (c, shin = 70) => new THREE.MeshPhongMaterial({ color: c, shininess: shin, specular: 0x555555 });
const glassM = () => new THREE.MeshPhongMaterial({ color: 0x1b2a3a, shininess: 120, specular: 0xaaaaaa });
const basic = c => new THREE.MeshBasicMaterial({ color: c });
// Extrude a side profile (x = length, y = height) across the car width (z).
function sideBody(pts, width, mat, bevel = 0.7) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) sh.lineTo(pts[k][0], pts[k][1]); sh.closePath();
  const d = Math.max(0.2, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -d / 2); return new THREE.Mesh(g, mat);
}
const bx = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
const tube = (a, b, r, mat, parent) => { // cylinder between two points
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), mat); m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); parent.add(m); return m;
};
const tyreM = plastic(0x1c1c1c, 10);
function makeWheel(R, W, rimColor, knobby) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, W, knobby ? 10 : 18).rotateX(Math.PI / 2), tyreM));
  if (knobby) for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + 0.31; const kn = new THREE.Mesh(new THREE.BoxGeometry(R * 0.32, R * 0.22, W * 0.9), tyreM); kn.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); kn.rotation.z = a; g.add(kn); }
  const rimM = plastic(rimColor, 90);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.6, W + 0.12, 14).rotateX(Math.PI / 2), rimM));
  const spokeM = plastic(0x333333, 40);
  for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(R * 1.1, R * 0.16, 0.25), spokeM); sp.position.z = sz * (W / 2 + 0.12); sp.rotation.z = k * Math.PI / 3; g.add(sp); }
  for (const sz of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.18, R * 0.18, 0.4, 8).rotateX(Math.PI / 2), rimM); cap.position.z = sz * (W / 2 + 0.25); g.add(cap); }
  return g;
}

// Car model geometry presets (wheel radius/width, axle x, track z)
const CAR_GEO = {
  buggy:   { wr: 2.9, ww: 2.6, wx: 4.9, wz: 5.1, knobby: true, rim: 0xffd23f },
  monster: { wr: 4.2, ww: 3.4, wx: 5.3, wz: 5.7, knobby: true, rim: 0xd0d0d0 },
  racecar: { wr: 2.3, ww: 2.3, wx: 4.9, wz: 4.5, knobby: false, rim: 0xe0e0e0 },
  moto:    { wr: 2.7, ww: 1.7, wx: 4.7, wz: 0, knobby: false, rim: 0xffd23f, two: true },
  scooter: { wr: 1.6, ww: 1.3, wx: 4.6, wz: 0, knobby: false, rim: 0x4cc9f0, two: true },
};
// little rider figure (for moto / scooter)
function rider(parent, suit, helmetC, standing) {
  const suitM = plastic(suit, 50), skin = plastic(0xf1c27d, 30), helm = plastic(helmetC, 110);
  const g = new THREE.Group(); parent.add(g);
  if (standing) {
    for (const z of [-0.9, 0.9]) tube([-0.6, 2.4, z], [0.2, 6.2, z * 0.7], 0.55, plastic(0x1d3557, 40), g);
    tube([0.2, 6.2, 0], [1.0, 10.2, 0], 1.25, suitM, g);
    for (const z of [-1, 1]) tube([1.0, 9.6, z * 1.3], [3.5, 8.4, z * 1.7], 0.4, suitM, g);
    const h = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 8), helm); h.position.set(1.3, 12.0, 0); g.add(h);
    bx(0.5, 0.6, 1.6, glassM(), 2.5, 12.0, 0, g);
  } else {
    for (const z of [-1.1, 1.1]) { tube([-1.6, 5.4, z], [1.0, 4.6, z * 1.5], 0.6, plastic(0x1d3557, 40), g); tube([1.0, 4.6, z * 1.5], [0.6, 2.6, z * 1.6], 0.5, plastic(0x1d3557, 40), g); }
    tube([-1.8, 5.6, 0], [1.2, 8.6, 0], 1.3, suitM, g);
    for (const z of [-1, 1]) tube([0.9, 8.2, z * 1.3], [3.4, 6.9, z * 1.8], 0.42, suitM, g);
    const h = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 8), helm); h.position.set(1.9, 9.8, 0); g.add(h);
    bx(0.5, 0.7, 1.7, glassM(), 3.2, 9.8, 0, g);
  }
  return g;
}
function buildBike(model, color, parts) {
  const paint = plastic(color, 100), dark = plastic(0x22262c, 30), chrome = plastic(0xd8d8d8, 120), head = basic(0xfff6b0);
  const body = parts.tilt, G = parts.G;
  if (model === 'moto') {
    body.add(sideBody([[-2.6, 4.4], [2.6, 4.0], [5.2, 4.9], [5.6, 6.6], [3.8, 7.4], [1.2, 6.6], [-1.2, 6.4]], 2.6, paint, 0.5)); // tank + fairing
    body.add(sideBody([[-5.6, 5.6], [-1.2, 5.8], [-1.0, 6.5], [-4.2, 6.6], [-6.4, 7.0]], 2.2, paint, 0.4)); // tail
    bx(3.8, 0.6, 2.0, dark, -2.4, 6.4, 0, body); // seat
    body.add(sideBody([[-2.4, 2.4], [2.2, 2.4], [2.6, 4.2], [-2.6, 4.4]], 2.2, plastic(0x555b66, 60), 0.3)); // engine
    tube([-1.6, 2.9, 1.2], [-6.4, 3.8, 1.3], 0.45, chrome, body); // exhaust
    bx(0.4, 1.4, 2.0, glassM(), 5.4, 7.3, 0, body).rotation.z = -0.5;
    bx(0.3, 0.8, 1.0, head, 5.75, 5.9, 0, body); bx(0.3, 0.5, 0.9, basic(0xff2a3a), -6.5, 6.7, 0, body);
    tube([-4.7, 2.7, 0.9], [-1.0, 3.6, 0.9], 0.3, dark, body); tube([-4.7, 2.7, -0.9], [-1.0, 3.6, -0.9], 0.3, dark, body); // swing arm
    rider(body, color, 0xffffff, false);
  } else {
    bx(10.0, 0.7, 2.8, plastic(0x22262c, 20), 0, 2.2, 0, body); // deck
    bx(10.0, 0.08, 2.6, plastic(0x3a3a3a, 5), 0, 2.6, 0, body);   // grip tape
    bx(0.6, 0.5, 3.0, paint, -4.8, 2.0, 0, body);
    rider(body, color, color, true).position.x = -1.6;
  }
  // front fork + bars live on the steering pivot
  const fp = parts.frontPivots[0];
  if (model === 'moto') {
    for (const z of [-0.8, 0.8]) tube([0, 0, z * 1.2], [0.9, 5.2 - G.wr, z * 1.4], 0.32, chrome, fp);
    tube([0.9, 6.9 - G.wr, -2.4], [0.9, 6.9 - G.wr, 2.4], 0.25, dark, fp);
    bx(2.2, 0.35, 2.0, paint, 0, G.wr + 0.4 - G.wr, 0, fp).position.y = G.wr * 0.95; // mudguard
  } else {
    tube([0, 0, 0], [0.9, 9.4 - G.wr, 0], 0.32, chrome, fp);
    tube([0.9, 9.4 - G.wr, -2.4], [0.9, 9.4 - G.wr, 2.4], 0.28, dark, fp);
    for (const z of [-2.4, 2.4]) bx(0.5, 0.5, 0.8, plastic(0xe63946, 30), 0.9, 9.4 - G.wr, z, fp);
  }
}
function buildHeli(color, parts) {
  const paint = plastic(color, 100), dark = plastic(0x22262c, 30), tilt = parts.tilt;
  const fus = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 12), paint); fus.scale.set(1.35, 0.95, 0.85); fus.position.set(1, 5, 0); tilt.add(fus);
  const can = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glassM()); can.rotation.z = -1.0; can.position.set(2.8, 5.6, 0); can.scale.set(1, 1, 0.92); tilt.add(can);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.1, 11, 8), paint); boom.rotation.z = Math.PI / 2; boom.position.set(-7.6, 5.7, 0); tilt.add(boom);
  bx(1.8, 2.6, 0.3, paint, -12.6, 7.0, 0, tilt).rotation.z = 0.35; // tail fin
  bx(1.6, 0.25, 3.0, paint, -11.8, 5.8, 0, tilt);
  const skid = plastic(0x2b2d42, 40);
  for (const z of [-2.4, 2.4]) { tube([-3.0, 0.6, z], [4.4, 0.6, z], 0.32, skid, tilt); tube([4.4, 0.6, z], [5.2, 1.2, z], 0.32, skid, tilt); tube([-1.6, 0.6, z], [-0.9, 2.9, z * 0.6], 0.25, skid, tilt); tube([2.4, 0.6, z], [2.0, 2.9, z * 0.6], 0.25, skid, tilt); }
  tube([1, 8.0, 0], [1, 9.4, 0], 0.4, dark, tilt);
  const rot = new THREE.Group(); rot.position.set(1, 9.6, 0); tilt.add(rot);
  const bladeM = plastic(0x333333, 50);
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(17, 0.15, 1.1), bladeM); b.rotation.y = k * Math.PI / 2 * 2; b.position.x = 0; rot.add(b); }
  rot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 8), dark));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.05, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false })); rot.add(disc);
  parts.rotors.push(rot); parts.mainRotor = rot;
  const tr = new THREE.Group(); tr.position.set(-12.8, 7.4, 0.6); tilt.add(tr);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.1), bladeM); tr.add(tb); const tb2 = tb.clone(); tb2.rotation.z = Math.PI / 2; tr.add(tb2);
  parts.tailRotor = tr;
  bx(0.4, 0.4, 0.4, basic(0xff2244), -12.9, 8.6, 0, tilt); bx(0.4, 0.4, 0.4, basic(0x00ff88), 4.9, 4.6, 0, tilt);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 4), dark); ant.position.set(-2, 8.4, 1.6); tilt.add(ant);
}

function buildCarBody(model, color, body) {
  const paint = plastic(color, 90), dark = plastic(0x22262c, 30), white = plastic(0xffffff, 60);
  const head = basic(0xfff6b0), tail = basic(0xff2a3a);
  if (model === 'racecar' || model === 'sports') {
    body.add(sideBody([[-7.4, 1.6], [7.6, 1.6], [8.6, 2.3], [8.3, 3.3], [3.4, 4.0], [1.0, 5.7], [-3.4, 5.8], [-5.8, 4.4], [-7.7, 4.2]], 8.6, paint));
    body.add(sideBody([[3.0, 4.15], [0.9, 5.55], [-3.2, 5.65], [-5.3, 4.45]], 7.4, glassM(), 0.4));
    for (const z of [-4.35, 4.35]) bx(13, 0.5, 0.15, white, 0, 2.9, z, body);
    bx(9.5, 0.12, 1.2, white, 0, 6.48, 0, body); // roof stripe
    bx(2.4, 0.4, 8.8, dark, -7.0, 6.6, 0, body);
    for (const z of [-2.8, 2.8]) bx(0.6, 2.2, 0.5, dark, -6.8, 5.4, z, body);
    for (const z of [-2.9, 2.9]) { bx(0.3, 0.7, 1.6, head, 8.65, 2.8, z, body); bx(0.3, 0.6, 1.4, tail, -7.9, 3.6, z, body); }
    bx(1.2, 0.6, 7.8, dark, 8.3, 1.6, 0, body); // splitter
  } else if (model === 'buggy') {
    body.add(sideBody([[-6.0, 2.2], [6.2, 2.2], [8.4, 3.2], [5.6, 4.4], [-4.0, 4.5], [-6.4, 3.9]], 6.2, paint));
    const cage = plastic(0x2b2d42, 40);
    for (const z of [-2.4, 2.4]) { tube([2.6, 4.3, z], [0.4, 8.2, z * 0.85], 0.35, cage, body); tube([-3.6, 4.3, z], [-3.0, 8.2, z * 0.85], 0.35, cage, body); tube([0.4, 8.2, z * 0.85], [-3.0, 8.2, z * 0.85], 0.35, cage, body); }
    tube([0.4, 8.2, -2.05], [0.4, 8.2, 2.05], 0.35, cage, body); tube([-3.0, 8.2, -2.05], [-3.0, 8.2, 2.05], 0.35, cage, body);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), plastic(0xffffff, 100)); helmet.position.set(-1.4, 6.0, 0); body.add(helmet);
    bx(0.9, 0.7, 2.2, glassM(), -0.25, 6.05, 0, body);
    bx(3.2, 0.4, 9.6, paint, -7.2, 7.4, 0, body); for (const z of [-3, 3]) bx(0.7, 3.6, 0.4, cage, -6.8, 5.6, z, body);
    for (const z of [-3.6, 3.6]) bx(0.4, 2.2, 0.4, cage, -7.8, 6.2, z, body);
    tube([8.6, 2.6, -2.6], [8.6, 2.6, 2.6], 0.4, cage, body); // front bumper
    for (const z of [-1.8, 1.8]) bx(0.3, 0.8, 1.0, head, 8.1, 3.4, z, body);
    const shockM = plastic(0xffb703, 60);
    for (const [x, z] of [[4.9, 4.0], [4.9, -4.0], [-4.9, 4.0], [-4.9, -4.0]]) tube([x * 0.75, 4.6, z * 0.55], [x, 2.9, z], 0.45, shockM, body);
    bx(1.2, 0.3, 3.5, white, 6.8, 3.9, 0, body).rotation.z = -0.35; // number plate
  } else { // monster truck
    body.add(sideBody([[-7.6, 5.6], [7.6, 5.6], [7.9, 7.6], [3.4, 8.1], [2.1, 10.6], [-2.8, 10.6], [-3.2, 8.1], [-7.7, 8.1]], 8.2, paint));
    body.add(sideBody([[1.9, 8.2], [1.0, 10.1], [-2.4, 10.1], [-2.7, 8.2]], 8.6, glassM(), 0.2));
    const chassis = plastic(0x2b2d42, 30);
    for (const z of [-2.2, 2.2]) bx(15, 1.2, 1.0, chassis, 0, 4.4, z, body);
    for (const x of [-5.3, 5.3]) tube([x, 4.2, -5.0], [x, 4.2, 5.0], 0.5, chassis, body);
    const shockM = plastic(0xe63946, 60);
    for (const [x, z] of [[5.3, 3.6], [5.3, -3.6], [-5.3, 3.6], [-5.3, -3.6]]) { tube([x - 1.0, 6.2, z * 0.6], [x, 4.2, z], 0.6, shockM, body); tube([x + 1.0, 6.2, z * 0.6], [x, 4.2, z], 0.6, shockM, body); }
    bx(1.0, 0.9, 6.0, plastic(0xffd23f, 80), -0.4, 11.0, 0, body); // roof light bar
    for (const z of [-2.2, 0, 2.2]) bx(0.4, 0.6, 1.2, head, 0.15, 11.0, z, body);
    for (const z of [-2.9, 2.9]) { bx(0.3, 0.8, 1.6, head, 7.95, 7.0, z, body); bx(0.3, 0.7, 1.2, tail, -7.95, 7.4, z, body); }
    tube([8.3, 6.0, -3.8], [8.3, 6.0, 3.8], 0.45, plastic(0xc0c0c0, 100), body); // bull bar
    for (const z of [-4.15, 4.15]) bx(8, 0.6, 0.15, plastic(0xffd23f, 80), -1.5, 7.0, z, body); // flame stripe
  }
}

// Forward is +X in local space.  root (pos/heading) → flip (tumble) → wheels + tilt (sprung body)
export function createVehicleMesh(type, color, name, model) {
  const root = new THREE.Group(); const flip = new THREE.Group(); root.add(flip); const tilt = new THREE.Group(); flip.add(tilt);
  const parts = { root, flip, tilt, wheels: [], pivots: [], frontPivots: [], rotors: [], type, model, susY: 0, susV: 0, squash: 0, steer: 0, lastFwd: 0, lastHead: null, wasAir: false, pitch: 0, roll: 0 };
  if (type === 'car') {
    const G = CAR_GEO[model] || CAR_GEO.buggy; parts.G = G;
    if (!G.two) {
      buildCarBody(model || 'racecar', color, tilt);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 4), plastic(0x111111)); ant.position.set(-4.5, (model === 'monster' ? 11 : 7.5), 3); tilt.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 4), basic(color)); tip.position.set(-4.5, ant.position.y + 3.6, 3); tilt.add(tip);
    }
    const wpos = G.two ? [[G.wx, 0], [-G.wx, 0]] : [[G.wx, G.wz], [G.wx, -G.wz], [-G.wx, G.wz], [-G.wx, -G.wz]];
    for (const [x, z] of wpos) {
      const piv = new THREE.Group(); piv.position.set(x, G.wr, z); flip.add(piv);
      const w = makeWheel(G.wr, G.ww, G.rim, G.knobby); piv.add(w);
      parts.wheels.push(w); parts.pivots.push(piv); if (x > 0) parts.frontPivots.push(piv);
    }
    if (G.two) { buildBike(model, color, parts); parts.frontPivots[0].rotation.z = 0; }
  } else if (model === 'heli') {
    buildHeli(color, parts);
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 10), plastic(color, 90)); body.scale.set(1, 0.42, 0.8); body.position.y = 3; tilt.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x222831)); dome.position.y = 4.2; tilt.add(dome);
    const armM = lam(0x2b2d42);
    for (const a of [Math.PI / 4, 3 * Math.PI / 4]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 1), armM); arm.position.y = 3.4; arm.rotation.y = a; tilt.add(arm); }
    const rotorM = new THREE.MeshLambertMaterial({ color: 0xdddddd, transparent: true, opacity: 0.55 });
    for (const [x, z] of [[4.6, 4.6], [4.6, -4.6], [-4.6, 4.6], [-4.6, -4.6]]) {
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 8), armM); motor.position.set(x, 3.9, z); tilt.add(motor);
      const rot = new THREE.Group(); rot.position.set(x, 4.8, z); tilt.add(rot);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.15, 0.7), rotorM); rot.add(blade);
      const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rot.add(blade2);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.08, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })); rot.add(disc);
      parts.rotors.push(rot);
      const guard = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.22, 5, 24), plastic(0x2b2d42, 40)); guard.rotation.x = Math.PI / 2; guard.position.set(x, 4.8, z); tilt.add(guard);
    }
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), plastic(0x111111, 120)); cam.position.set(3.0, 1.9, 0); tilt.add(cam);
    for (const z of [-1.2, 1.2]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 4), plastic(0x111111)); a.position.set(-2.6, 5.2, z); a.rotation.x = z * 0.25; tilt.add(a); }
    for (const z of [-2.2, 2.2]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 0.5), armM); sk.position.set(0, 0.5, z); tilt.add(sk); const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.4), armM); l1.position.set(1.8, 1.4, z); tilt.add(l1); const l2 = l1.clone(); l2.position.x = -1.8; tilt.add(l2); }
    const ledF = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0x00ff88 })); ledF.position.set(3.1, 3, 0); tilt.add(ledF);
    const ledB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0xff2244 })); ledB.position.set(-3.1, 3, 0); tilt.add(ledB);
  }
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; parts.shadow = sh;
  if (name) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(name, '#ffffffdd', '#111', 256, 80), transparent: true, depthWrite: false }));
    sp.scale.set(12, 3.75, 1); sp.position.y = model === 'monster' ? 19 : 15; root.add(sp); parts.label = sp;
  }
  return parts;
}

const TAU = Math.PI * 2;
export function updateVehicleMesh(p, r, dt, t) {
  p.root.position.set(r.x, r.y, r.z); p.root.rotation.y = -r.heading;
  const c = Math.cos(r.heading), s = Math.sin(r.heading);
  const fwd = r.vx * c + r.vz * s;
  const k = dt > 0 ? Math.min(1, dt * 10) : 0;
  let yawRate = 0; if (p.lastHead !== null && dt > 0) { let d = r.heading - p.lastHead; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; yawRate = d / dt; } p.lastHead = r.heading;
  // tumble (flip) – a full barrel roll over the hit duration
  if (r.tumbleT > 0) { if (!p.tumbling) { p.tumbling = true; p.flipDir = Math.random() < 0.5 ? 1 : -1; } p.flip.rotation.x = p.flipDir * TAU * (1 - r.tumbleT / r.tumbleTot); }
  else { p.tumbling = false; p.flip.rotation.x *= Math.max(0, 1 - k * 1.5); }
  if (r.type === 'car') {
    const G = p.G;
    for (const w of p.wheels) w.rotation.z -= fwd / G.wr * dt;
    const st = r.controllable ? r.input.steer : 0; p.steer += (st - p.steer) * Math.min(1, dt * 12);
    for (const f of p.frontPivots) f.rotation.y = -p.steer * 0.5;
    const air = !r.grounded;
    // landing → spring kick + squash
    if (p.wasAir && !air && dt > 0) { p.susV -= 10 + 45 * r.landImpact; p.squash = Math.min(1, 0.25 + r.landImpact * 1.2); }
    if (!p.wasAir && air && r.vy > 50) p.susV += 18; // take-off stretch
    p.wasAir = air;
    if (dt > 0) {
      const acc = Math.max(-1500, Math.min(1500, (fwd - p.lastFwd) / dt)); p.lastFwd = fwd;
      p.susV += (-p.susY * 320 - p.susV * 13) * dt; p.susY += p.susV * dt; p.susY = Math.max(-1.6, Math.min(1.6, p.susY));
      const pitchT = air ? Math.max(-0.45, Math.min(0.45, r.vy / 420)) : Math.max(-0.1, Math.min(0.1, acc / 2200)) + Math.atan(r.slopeF || 0) * Math.sign(fwd || 1);
      const rollT = air ? 0 : Math.max(-0.14, Math.min(0.14, -fwd * yawRate / 2600)) * (r.drifting ? 1.4 : 1);
      p.pitch += (pitchT - p.pitch) * Math.min(1, dt * 8); p.roll += (rollT - p.roll) * Math.min(1, dt * 8);
      p.squash = Math.max(0, p.squash - dt * 4.5);
    }
    const bump = r.surface === 'grass' && !air ? Math.sin(t * 40 + r.id) * 0.25 * Math.min(1, Math.abs(fwd) / 40) : 0;
    p.tilt.position.y = p.susY + bump + (air ? 0.5 : 0);
    p.tilt.rotation.z = p.pitch; p.tilt.rotation.x = p.roll;
    const sq = Math.sin(Math.min(1, p.squash) * Math.PI * 0.5) * 0.28;
    p.tilt.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
    p.flip.rotation.z = p.tumbling ? 0 : p.pitch * 0.6;
    for (const pv of p.pivots) pv.position.y = G.wr - (air ? 0.9 : 0) - Math.max(0, p.susY) * 0.3;
    if (G.two) {
      // two-wheelers lean into turns and pop a wheelie on turbo / hard launch
      p.tilt.rotation.x = 0;
      const lean = Math.max(-0.65, Math.min(0.65, fwd * yawRate / 1100));
      if (!p.tumbling) p.flip.rotation.x += (lean - p.flip.rotation.x) * Math.min(1, dt * 9);
      const wTarget = !air && (r.turboT > 0 || (r.input.thr > 0.9 && fwd > 10 && fwd < 45)) ? (p.model === 'moto' ? 0.42 : 0.22) : 0;
      p.wheelie = (p.wheelie || 0) + (wTarget - (p.wheelie || 0)) * Math.min(1, dt * 6);
      if (!p.tumbling) { const th = p.wheelie + p.pitch * 0.6; p.flip.rotation.z = th; p.flip.position.set(-G.wx + G.wx * Math.cos(th), G.wx * Math.sin(th), 0); }
      else p.flip.position.set(0, 0, 0);
    }
  } else {
    const spin = (r.stunT > 0 ? 3 : 10) + (r.stunT > 0 ? 0 : 60 * r.spool);
    p.rotors.forEach((rt, k2) => rt.rotation.y += (k2 % 2 ? 1 : -1) * spin * dt * (p.model === 'heli' ? 0.7 : 1));
    if (p.tailRotor) p.tailRotor.rotation.z += spin * 1.6 * dt;
    if (p.model === 'heli') { // nose follows the lagging rotor-disc tilt; whole body sways
      p.tilt.rotation.z += (-(r.tiltP || 0) * 0.32 - p.tilt.rotation.z) * Math.min(1, dt * 6);
      p.tilt.rotation.x += ((r.controllable ? r.input.steer : 0) * 0.12 - p.tilt.rotation.x) * Math.min(1, dt * 4);
      p.tilt.position.y = r.y > 3 ? Math.sin(t * 2.2 + r.id) * 0.6 : 0;
      if (r.stunT > 0) p.tilt.rotation.x += Math.sin(t * 60) * 0.06;
    } else {
    const pw = r.controllable ? 1 : 0;
    p.tilt.rotation.z += (-r.input.pitch * 0.28 * r.spool * pw - p.tilt.rotation.z) * 0.12;
    p.tilt.rotation.x += (r.input.steer * 0.18 * r.spool * pw - p.tilt.rotation.x) * 0.12;
    p.tilt.position.y = r.y > 3 ? Math.sin(t * 6 + r.id) * 0.3 : 0;
    if (r.stunT > 0) p.tilt.rotation.x += Math.sin(t * 60) * 0.06;
    }
  }
  const alt = r.y - (r.groundY || 0); const sz = ({ moto: 13, scooter: 11, heli: 20, drone: 15 }[p.model] || 16) * (1 + alt / 40);
  p.shadow.scale.set(sz, sz * ({ moto: 0.35, scooter: 0.4, heli: 0.55 }[p.model] || (r.type === 'car' ? 0.7 : 1)), 1); p.shadow.rotation.z = -r.heading; p.shadow.position.set(r.x, (r.groundY || 0) + 0.3, r.z);
  p.shadow.material.opacity = Math.max(0.15, 1 - alt / 90);
}
